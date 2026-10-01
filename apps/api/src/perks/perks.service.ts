import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, count, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  mapObjects,
  memberships,
  perkDefinitions,
  perkInstances,
  users,
  type PerkDefinition,
} from '../db/schema';
import { GamesService } from '../games/games.service';
import { PERMISSIONS } from '../permissions/permissions';
import { PermissionsService } from '../permissions/permissions.service';
import type { ActivatePerkDto, CreatePerkDto } from './dto';

/** Un hostile révélé par un drone — position réelle, à l'instant du survol. */
export interface RevealedContact {
  membershipId: string;
  pseudo: string | null;
  teamId: string | null;
  lat: number;
  lng: number;
  /** Insigne du contact : le drone montre le vrai type d'unité repéré. */
  unitType: string;
  lifeStatus: string;
  /**
   * Repéré sous couvert : il peut disparaître au balayage suivant sans
   * avoir bougé. Le dire évite de conclure de son absence.
   */
  concealed?: boolean;
}

export interface PerkView {
  id: string;
  type: string;
  radiusMeters: number;
  durationSeconds: number;
  cooldownSeconds: number;
  stockPerTeam: number | null;
  allowedRoles: string[];
  /** Ce que MON équipe peut encore en faire, calculé serveur. */
  remaining: number | null;
  availableAt: Date | null;
}

export const PERK_REVEAL_EVENT = 'perk.reveal';
export interface PerkRevealPayload {
  gameId: string;
  teamId: string;
  instanceId: string;
  endsAt: Date;
  contacts: RevealedContact[];
}

export const PERK_EVENT = 'perk.event';
export interface PerkEventPayload {
  gameId: string;
  teamId: string | null;
  event: Record<string, unknown>;
}

@Injectable()
export class PerksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  async createDefinition(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreatePerkDto,
  ): Promise<PerkDefinition> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);
    const [row] = await this.db
      .insert(perkDefinitions)
      .values({
        gameId,
        type: dto.type,
        radiusMeters: dto.radiusMeters ?? 300,
        durationSeconds: dto.durationSeconds ?? 30,
        cooldownSeconds: dto.cooldownSeconds ?? 300,
        stockPerTeam: dto.stockPerTeam ?? null,
        allowedRoles: dto.allowedRoles ?? [],
        orbit: dto.orbit ?? true,
        sweepSeconds: dto.sweepSeconds ?? 0,
        concealment: dto.concealment ?? 'none',
        concealedCovers: dto.concealedCovers ?? [],
      })
      .returning();
    return row;
  }

  /** Perks de la partie, avec l'état réel pour MON équipe (stock, cooldown). */
  async list(auth: AuthenticatedUser, gameId: string): Promise<PerkView[]> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    const defs = await this.db
      .select()
      .from(perkDefinitions)
      .where(eq(perkDefinitions.gameId, gameId));

    return Promise.all(
      defs.map(async (def) => {
        let remaining: number | null = null;
        let availableAt: Date | null = null;
        if (membership.teamId) {
          if (def.stockPerTeam != null) {
            const [{ used }] = await this.db
              .select({ used: count() })
              .from(perkInstances)
              .where(
                and(
                  eq(perkInstances.definitionId, def.id),
                  eq(perkInstances.teamId, membership.teamId),
                ),
              );
            remaining = Math.max(0, def.stockPerTeam - used);
          }
          const [last] = await this.db
            .select({ startsAt: perkInstances.startsAt })
            .from(perkInstances)
            .where(
              and(
                eq(perkInstances.definitionId, def.id),
                eq(perkInstances.teamId, membership.teamId),
              ),
            )
            .orderBy(desc(perkInstances.startsAt))
            .limit(1);
          if (last) {
            const ready = new Date(
              last.startsAt.getTime() + def.cooldownSeconds * 1000,
            );
            if (ready.getTime() > Date.now()) availableAt = ready;
          }
        }
        return {
          id: def.id,
          type: def.type,
          radiusMeters: def.radiusMeters,
          durationSeconds: def.durationSeconds,
          cooldownSeconds: def.cooldownSeconds,
          stockPerTeam: def.stockPerTeam,
          allowedRoles: def.allowedRoles,
          orbit: def.orbit,
          sweepSeconds: def.sweepSeconds,
          concealment: def.concealment,
          concealedCovers: def.concealedCovers,
          remaining,
          availableAt,
        };
      }),
    );
  }

  /**
   * Activation d'un perk (§7.7). Tout est arbitré ici : grade habilité,
   * stock d'équipe, cooldown. Le client n'envoie qu'une intention.
   *
   * Drone : le serveur connaît en permanence les positions de tous mais les
   * masque ; il ne dévoile les hostiles du rayon QUE pendant la durée du
   * perk, et QUE à l'équipe qui l'a lancé.
   *
   * Brouilleur : annule les drones adverses actifs dont la zone recouvre
   * la sienne. ⚠️ Brouillage du perk virtuel uniquement — jamais un
   * brouilleur radio réel.
   */
  async activate(
    auth: AuthenticatedUser,
    gameId: string,
    definitionId: string,
    dto: ActivatePerkDto,
  ): Promise<{
    instanceId: string;
    type: string;
    endsAt: Date;
    contacts: RevealedContact[];
    jammed: number;
  }> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    if (!membership.teamId) {
      throw new BadRequestException(
        'Vous devez appartenir à une équipe pour activer un perk',
      );
    }

    const [def] = await this.db
      .select()
      .from(perkDefinitions)
      .where(
        and(
          eq(perkDefinitions.id, definitionId),
          eq(perkDefinitions.gameId, gameId),
        ),
      );
    if (!def) throw new NotFoundException('Perk introuvable');

    if (
      def.allowedRoles.length > 0 &&
      !def.allowedRoles.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Votre grade n’est pas habilité à activer ce perk',
      );
    }

    if (def.stockPerTeam != null) {
      const [{ used }] = await this.db
        .select({ used: count() })
        .from(perkInstances)
        .where(
          and(
            eq(perkInstances.definitionId, def.id),
            eq(perkInstances.teamId, membership.teamId),
          ),
        );
      if (used >= def.stockPerTeam) {
        throw new ForbiddenException('Votre équipe a épuisé ce perk');
      }
    }

    const [last] = await this.db
      .select({ startsAt: perkInstances.startsAt })
      .from(perkInstances)
      .where(
        and(
          eq(perkInstances.definitionId, def.id),
          eq(perkInstances.teamId, membership.teamId),
        ),
      )
      .orderBy(desc(perkInstances.startsAt))
      .limit(1);
    if (last) {
      const ready = last.startsAt.getTime() + def.cooldownSeconds * 1000;
      if (ready > Date.now()) {
        throw new ForbiddenException(
          `Perk en recharge encore ${Math.ceil((ready - Date.now()) / 1000)} s`,
        );
      }
    }

    const endsAt = new Date(Date.now() + def.durationSeconds * 1000);
    const [instance] = await this.db
      .insert(perkInstances)
      .values({
        definitionId: def.id,
        gameId,
        casterMembershipId: membership.id,
        teamId: membership.teamId,
        target: { x: dto.lng, y: dto.lat },
        endsAt,
      })
      .returning();

    let contacts: RevealedContact[] = [];
    let jammed = 0;

    if (def.type === 'drone') {
      contacts = await this.revealHostiles(
        gameId,
        membership.teamId,
        dto.lat,
        dto.lng,
        def.radiusMeters,
        def,
      );
      // Diffusé à la seule équipe du lanceur : les positions ennemies ne
      // quittent jamais le serveur en dehors de ce canal restreint.
      this.events.emit(PERK_REVEAL_EVENT, {
        gameId,
        teamId: membership.teamId,
        instanceId: instance.id,
        endsAt,
        contacts,
      } satisfies PerkRevealPayload);

      if (def.sweepSeconds > 0) {
        this.planifierBalayages(
          gameId,
          membership.teamId,
          instance.id,
          endsAt,
          dto.lat,
          dto.lng,
          def,
        );
      }
    } else {
      jammed = await this.jamEnemyDrones(
        gameId,
        membership.teamId,
        dto.lat,
        dto.lng,
        def.radiusMeters,
      );
    }

    // L'activation est annoncée à TOUTE la partie, avec sa zone : on voit
    // et on entend passer le drone adverse. Ce qu'il a vu, en revanche, ne
    // sort jamais de l'équipe qui l'a lancé.
    this.events.emit(PERK_EVENT, {
      gameId,
      teamId: null,
      event: {
        kind: 'perk:activated',
        type: def.type,
        instanceId: instance.id,
        teamId: membership.teamId,
        lat: dto.lat,
        lng: dto.lng,
        radiusMeters: def.radiusMeters,
        endsAt,
        jammed,
      },
    } satisfies PerkEventPayload);

    return {
      instanceId: instance.id,
      type: def.type,
      endsAt,
      contacts,
      jammed,
    };
  }

  /**
   * Cœur du drone : requête géospatiale PostGIS. `ST_DWithin` en géographie
   * travaille en mètres — c'est ce qui rend le rayon exact sur le terrain.
   */
  private async revealHostiles(
    gameId: string,
    myTeamId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    def?: Pick<PerkDefinition, 'concealment' | 'concealedCovers'>,
  ): Promise<RevealedContact[]> {
    const couverts = def?.concealedCovers ?? [];
    const dissimule = (def?.concealment ?? 'none') !== 'none' &&
      couverts.length > 0;

    const rows = await this.db
      .select({
        membershipId: memberships.id,
        pseudo: users.pseudo,
        teamId: memberships.teamId,
        unitType: memberships.unitType,
        lifeStatus: memberships.lifeStatus,
        position: memberships.lastPosition,
        // Le joueur est-il DANS une zone que l'organisateur a étiquetée
        // comme couvrante ? Le serveur n'a aucune donnée d'occupation du
        // sol : ce sont les zones dessinées qui portent l'information.
        couvert: dissimule
          ? sql<boolean>`EXISTS (
              SELECT 1 FROM ${mapObjects} z
              WHERE z.game_id = ${gameId}
                AND z.kind = 'zone'
                AND z.deleted_at IS NULL
                AND z.geometry IS NOT NULL
                AND z.properties->>'cover' IN (${sql.join(
                      couverts.map((c) => sql`${c}`),
                      sql`, `,
                    )})
                -- Les deux géométries doivent porter le MÊME système de
                -- coordonnées. Les positions enregistrées n'en déclarent
                -- pas (le reste du code passe par ::geography, qui suppose
                -- le 4326) : on le pose explicitement des deux côtés.
                AND ST_Contains(
                      ST_SetSRID(ST_GeomFromGeoJSON(z.geometry::text), 4326),
                      ST_SetSRID(${memberships.lastPosition}, 4326)
                    )
            )`
          : sql<boolean>`false`,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.gameId, gameId),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
          // Hostiles seulement : jamais les siens (ils sont déjà visibles),
          // ni les joueurs sans camp.
          ne(memberships.teamId, myTeamId),
          sql`${memberships.lastPosition} IS NOT NULL`,
          sql`ST_DWithin(
                ${memberships.lastPosition}::geography,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${radiusMeters}
              )`,
        ),
      );

    return rows
      .filter((r) => {
        if (!r.couvert) return true;
        // Sous couvert : invisible, ou visible seulement de temps en temps.
        // Le tirage est refait à CHAQUE balayage — c'est ce qui donne
        // l'intermittence, et ce qui empêche de conclure d'un seul blip.
        if (def?.concealment === 'hidden') return false;
        return Math.random() < PerksService.CHANCE_SOUS_COUVERT;
      })
      .map((r) => ({
        membershipId: r.membershipId,
        pseudo: r.pseudo,
        teamId: r.teamId,
        unitType: r.unitType,
        lat: r.position!.y,
        lng: r.position!.x,
        lifeStatus: r.lifeStatus,
        // Dit au joueur que ce contact est fugace : il saura qu'il ne peut
        // pas conclure de son absence au balayage suivant.
        concealed: r.couvert,
      }));
  }

  /**
   * Modifie un bonus déjà posé.
   *
   * Régler, et non empiler : sans cette route, changer le rayon d'un drone
   * obligerait à en créer un second, et la partie en compterait deux.
   */
  async updateDefinition(
    auth: AuthenticatedUser,
    gameId: string,
    definitionId: string,
    dto: Partial<CreatePerkDto>,
  ): Promise<PerkDefinition> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    const [def] = await this.db
      .select()
      .from(perkDefinitions)
      .where(
        and(
          eq(perkDefinitions.id, definitionId),
          eq(perkDefinitions.gameId, gameId),
        ),
      );
    if (!def) throw new NotFoundException('Bonus introuvable');

    const [row] = await this.db
      .update(perkDefinitions)
      .set({
        ...(dto.radiusMeters != null ? { radiusMeters: dto.radiusMeters } : {}),
        ...(dto.durationSeconds != null
          ? { durationSeconds: dto.durationSeconds }
          : {}),
        ...(dto.cooldownSeconds != null
          ? { cooldownSeconds: dto.cooldownSeconds }
          : {}),
        ...(dto.stockPerTeam !== undefined
          ? { stockPerTeam: dto.stockPerTeam }
          : {}),
        ...(dto.allowedRoles != null ? { allowedRoles: dto.allowedRoles } : {}),
        ...(dto.orbit != null ? { orbit: dto.orbit } : {}),
        ...(dto.sweepSeconds != null ? { sweepSeconds: dto.sweepSeconds } : {}),
        ...(dto.concealment != null ? { concealment: dto.concealment } : {}),
        ...(dto.concealedCovers != null
          ? { concealedCovers: dto.concealedCovers }
          : {}),
      })
      .where(eq(perkDefinitions.id, definitionId))
      .returning();
    return row;
  }

  /**
   * Retire un bonus de la partie : il cesse d'exister pour les joueurs.
   *
   * Les activations passées restent en base — elles racontent ce qui s'est
   * produit, et l'effacer fausserait le bilan.
   */
  async removeDefinition(
    auth: AuthenticatedUser,
    gameId: string,
    definitionId: string,
  ): Promise<void> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    const [encoreActif] = await this.db
      .select({ id: perkInstances.id })
      .from(perkInstances)
      .where(
        and(
          eq(perkInstances.definitionId, definitionId),
          gt(perkInstances.endsAt, new Date()),
        ),
      )
      .limit(1);
    if (encoreActif) {
      throw new BadRequestException(
        'Ce bonus est en cours d’utilisation : attendez la fin du survol',
      );
    }

    await this.db
      .delete(perkDefinitions)
      .where(
        and(
          eq(perkDefinitions.id, definitionId),
          eq(perkDefinitions.gameId, gameId),
        ),
      );
  }

  /**
   * Relance la révélation à intervalle régulier, le temps du survol.
   *
   * Un drone qui tourne repasse : chaque passage refait le tirage sous
   * couvert, et c'est de là que vient l'intermittence. Sans ces passages,
   * il n'y aurait qu'un instant, donc rien d'intermittent.
   *
   * Tenu en mémoire et non en base, à dessein : un redémarrage du serveur
   * interrompt les balayages, et c'est sans conséquence — le client efface
   * de toute façon les contacts à `endsAt`.
   */
  private planifierBalayages(
    gameId: string,
    teamId: string,
    instanceId: string,
    endsAt: Date,
    lat: number,
    lng: number,
    def: PerkDefinition,
  ): void {
    const timer = setInterval(() => {
      if (Date.now() >= endsAt.getTime()) {
        clearInterval(timer);
        return;
      }
      void this.revealHostiles(
        gameId,
        teamId,
        lat,
        lng,
        def.radiusMeters,
        def,
      )
        .then((contacts) => {
          this.events.emit(PERK_REVEAL_EVENT, {
            gameId,
            teamId,
            instanceId,
            endsAt,
            contacts,
          } satisfies PerkRevealPayload);
        })
        .catch(() => {
          // Un balayage raté n'interrompt pas le survol : le suivant
          // retentera.
        });
    }, def.sweepSeconds * 1000);
    // Ne retient pas le processus à l'arrêt.
    timer.unref?.();
  }

  /**
   * Une chance sur trois d'être vu à un balayage donné, sous couvert.
   *
   * Assez pour qu'on finisse par savoir qu'il y a quelqu'un, trop peu pour
   * suivre un déplacement : c'est exactement ce qu'un couvert doit faire.
   */
  private static readonly CHANCE_SOUS_COUVERT = 0.35;

  /**
   * Brouilleur : coupe les drones adverses encore actifs dont la zone
   * recouvre la nôtre. Les recouvrements se calculent au centre, avec la
   * somme des rayons — deux disques se touchent si leurs centres sont
   * plus proches que R1 + R2.
   */
  private async jamEnemyDrones(
    gameId: string,
    myTeamId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<number> {
    const jammedRows = await this.db
      .update(perkInstances)
      .set({ jammedAt: new Date() })
      .where(
        and(
          eq(perkInstances.gameId, gameId),
          ne(perkInstances.teamId, myTeamId),
          isNull(perkInstances.jammedAt),
          gt(perkInstances.endsAt, new Date()),
          sql`EXISTS (
                SELECT 1 FROM perk_definitions d
                 WHERE d.id = ${perkInstances.definitionId}
                   AND d.type = 'drone'
                   AND ST_DWithin(
                         ${perkInstances.target}::geography,
                         ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                         d.radius_meters + ${radiusMeters}
                       )
              )`,
        ),
      )
      .returning({ id: perkInstances.id, teamId: perkInstances.teamId });

    for (const row of jammedRows) {
      // La victime est prévenue que son drone est tombé.
      this.events.emit(PERK_EVENT, {
        gameId,
        teamId: row.teamId,
        event: { kind: 'perk:jammed', instanceId: row.id },
      } satisfies PerkEventPayload);
    }
    return jammedRows.length;
  }
}
