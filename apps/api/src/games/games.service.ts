import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-auth.guard';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  bonusQrs,
  bonusScans,
  chatChannels,
  games,
  inviteRedemptions,
  inviteTokens,
  mapLayers,
  mapObjects,
  memberships,
  messages,
  objectiveCaptures,
  objectiveLinks,
  objectives,
  perkDefinitions,
  perkInstances,
  positionLogs,
  squads,
  teams,
  users,
  type Game,
  type Membership,
} from '../db/schema';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSIONS } from '../permissions/permissions';
import { ROLE_RANK, type LifeStatus, type UpdateMemberDto } from './dto';

/** Vue « membre » diffusée aux autres joueurs de la partie. */
export interface MemberView {
  membershipId: string;
  pseudo: string | null;
  email: string | null;
  role: string;
  unitType: string;
  teamId: string | null;
  squadId: string | null;
  /** Supérieur direct dans la chaîne de commandement (§5). */
  reportsToMembershipId: string | null;
  lifeStatus: string;
  lastPosition: { x: number; y: number } | null;
  lastPositionAt: Date | null;
  isConnected: boolean;
  lastSeenAt: Date | null;
}

/** Événement interne émis à chaque changement d'un membre (position, statut, connexion). */
export const MEMBER_UPDATED_EVENT = 'member.updated';
export interface MemberUpdatedEvent {
  gameId: string;
  member: MemberView;
}

export const MEMBER_LEFT_EVENT = 'member.left';
export interface MemberLeftEvent {
  gameId: string;
  membershipId: string;
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * La partie est créée et détenue par le serveur (§2.5).
   *
   * Règle du propriétaire du projet : on ne garde qu'UNE partie créée à la
   * fois — la nouvelle remplace l'ancienne. Seules les parties dont on est
   * le créateur sont supprimées ; celles rejointes par QR appartiennent à
   * quelqu'un d'autre et ne sont jamais touchées.
   */
  async createGame(auth: AuthenticatedUser, name: string): Promise<Game> {
    const user = await this.usersService.getOrCreate(auth);
    return this.db.transaction(async (tx) => {
      const previous = await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.ownerUserId, user.id));
      for (const old of previous) {
        await this.purgeGame(tx, old.id);
      }

      const [game] = await tx
        .insert(games)
        .values({ name, ownerUserId: user.id })
        .returning();
      // Le créateur est le commandant (§5) ; son insigne par défaut aussi.
      await tx.insert(memberships).values({
        gameId: game.id,
        userId: user.id,
        role: 'commandant',
        unitType: 'command',
      });
      // Canaux de discussion (§7.4) : général pour tous, commandement
      // réservé aux gradés (rang ≤ chef d'escouade).
      await tx.insert(chatChannels).values([
        { gameId: game.id, scope: 'global', name: 'Général' },
        {
          gameId: game.id,
          scope: 'command',
          name: 'Commandement',
          requiredPermission: PERMISSIONS.CHAT_COMMAND,
        },
      ]);
      return game;
    });
  }

  /**
   * Mes parties, avec MES permissions dans chacune : l'app n'a ainsi pas à
   * deviner ce que mon grade autorise (§5) — elle affiche ce que le serveur
   * dit possible, et le serveur revérifie de toute façon à l'appel.
   */
  async listMyGames(
    auth: AuthenticatedUser,
  ): Promise<Array<{ game: Game; role: string; permissions: string[] }>> {
    const user = await this.usersService.getOrCreate(auth);
    const rows = await this.db
      .select({ game: games, role: memberships.role })
      .from(memberships)
      .innerJoin(games, eq(memberships.gameId, games.id))
      .where(
        and(
          eq(memberships.userId, user.id),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
        ),
      )
      // Ordre stable (plus récentes d'abord) : sans ORDER BY, Postgres peut
      // mélanger la liste d'un rafraîchissement à l'autre.
      .orderBy(desc(games.createdAt));

    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        permissions: await this.permissions.forRole(r.game.id, r.role),
      })),
    );
  }

  /**
   * Rejoindre en mode dev (Phase 3 : jetons QR opaques §7.2).
   * Idempotent ; un joueur exclu (kickedAt) ne peut pas revenir seul.
   */
  async joinGame(auth: AuthenticatedUser, gameId: string): Promise<Membership> {
    const user = await this.usersService.getOrCreate(auth);
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new NotFoundException('Partie introuvable');

    const [membership] = await this.db
      .insert(memberships)
      .values({ gameId, userId: user.id })
      .onConflictDoUpdate({
        target: [memberships.gameId, memberships.userId],
        set: { leftAt: null },
      })
      .returning();
    if (membership.kickedAt) {
      throw new ForbiddenException('Vous avez été exclu de cette partie');
    }
    return membership;
  }

  /**
   * Quitter une partie qu'on avait rejointe. La ligne d'appartenance n'est
   * pas supprimée mais datée (`leftAt`) : l'historique de la partie reste
   * cohérent, et un nouveau QR permet de revenir.
   *
   * Le créateur, lui, ne peut pas quitter la sienne : sa partie disparaîtrait
   * de sa liste alors qu'il en reste propriétaire, sans moyen d'y revenir.
   * Il la remplace en en créant une autre (§ une seule partie à la fois).
   */
  async leaveGame(auth: AuthenticatedUser, gameId: string): Promise<void> {
    const user = await this.usersService.getOrCreate(auth);
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new NotFoundException('Partie introuvable');
    if (game.ownerUserId === user.id) {
      throw new ForbiddenException(
        'Vous êtes le créateur de cette partie : créez-en une nouvelle pour '
        + 'la remplacer',
      );
    }

    const membership = await this.assertActiveMember(user.id, gameId);
    await this.db
      .update(memberships)
      .set({ leftAt: new Date(), isConnected: false })
      .where(eq(memberships.id, membership.id));

    // Les alliés encore en jeu doivent le voir partir tout de suite, sans
    // attendre une reconnexion.
    this.events.emit(MEMBER_LEFT_EVENT, {
      gameId,
      membershipId: membership.id,
    } satisfies MemberLeftEvent);
  }

  async getMembers(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<MemberView[]> {
    const user = await this.usersService.getOrCreate(auth);
    const me = await this.assertActiveMember(user.id, gameId);
    const all = await this.selectMembers(gameId);
    // On sait QUI joue, mais pas OÙ sont les adversaires (§2.1) : seul le
    // perk drone lève ce voile, et temporairement.
    return all.map((m) =>
      m.membershipId === me.id || m.teamId === me.teamId
        ? m
        : GamesService.maskPosition(m),
    );
  }

  /** Retire la position d'un membre : ce qu'on montre aux camps adverses. */
  static maskPosition(member: MemberView): MemberView {
    return { ...member, lastPosition: null, lastPositionAt: null };
  }

  async updateMyStatus(
    auth: AuthenticatedUser,
    gameId: string,
    lifeStatus: LifeStatus,
  ): Promise<MemberView> {
    const user = await this.usersService.getOrCreate(auth);
    const membership = await this.assertActiveMember(user.id, gameId);
    await this.db
      .update(memberships)
      .set({ lifeStatus })
      .where(eq(memberships.id, membership.id));
    return this.emitMemberUpdate(gameId, membership.id);
  }

  /** Appelé par la gateway temps réel à chaque position reçue. */
  async updatePosition(
    membershipId: string,
    gameId: string,
    lng: number,
    lat: number,
  ): Promise<void> {
    const [previous] = await this.db
      .select({
        lastPosition: memberships.lastPosition,
        lastPositionAt: memberships.lastPositionAt,
      })
      .from(memberships)
      .where(eq(memberships.id, membershipId));

    const now = new Date();
    await this.db
      .update(memberships)
      .set({ lastPosition: { x: lng, y: lat }, lastPositionAt: now })
      .where(eq(memberships.id, membershipId));

    if (GamesService.shouldLog(previous, lng, lat, now)) {
      await this.db.insert(positionLogs).values({
        gameId,
        membershipId,
        position: { x: lng, y: lat },
        recordedAt: now,
      });
    }

    await this.emitMemberUpdate(gameId, membershipId);
  }

  /** Intervalle minimal entre deux points conservés. */
  private static readonly LOG_INTERVAL_MS = 10_000;
  /** Déplacement minimal, en degrés (~5 m sous nos latitudes). */
  private static readonly LOG_MIN_DELTA = 0.00005;

  /**
   * Faut-il garder ce point pour la trace ?
   *
   * Le flux GPS arrive plusieurs fois par minute et par joueur : tout écrire
   * gonflerait la table sans rien apprendre. On ne garde qu'un point toutes
   * les dix secondes, et seulement si le joueur a bougé — un immobile ne
   * produit donc aucune ligne, ce qui est aussi la vérité de sa trace.
   */
  private static shouldLog(
    previous:
      | { lastPosition: { x: number; y: number } | null; lastPositionAt: Date | null }
      | undefined,
    lng: number,
    lat: number,
    now: Date,
  ): boolean {
    if (!previous?.lastPosition || !previous.lastPositionAt) return true;
    const age = now.getTime() - previous.lastPositionAt.getTime();
    if (age < GamesService.LOG_INTERVAL_MS) return false;
    const moved =
      Math.abs(previous.lastPosition.x - lng) > GamesService.LOG_MIN_DELTA ||
      Math.abs(previous.lastPosition.y - lat) > GamesService.LOG_MIN_DELTA;
    return moved;
  }

  /** Appelé par la gateway : membre ≠ connecté (§2.4), on ne supprime rien. */
  async setConnected(
    membershipId: string,
    gameId: string,
    connected: boolean,
  ): Promise<void> {
    await this.db
      .update(memberships)
      .set({ isConnected: connected, lastSeenAt: new Date() })
      .where(eq(memberships.id, membershipId));
    await this.emitMemberUpdate(gameId, membershipId);
  }

  /**
   * Gestion d'un membre par un gradé (§5, version jouable) :
   *  - nomination (capitaine / chef d'escouade / joueur) : commandant
   *    uniquement, jamais sur lui-même ni sur un autre commandant ;
   *  - insigne (icône d'unité) : réservé aux GRADÉS — sur eux-mêmes ou
   *    sur tout rang strictement inférieur. Un joueur sans grade reçoit
   *    son insigne de sa hiérarchie, il ne le choisit pas.
   * Validé serveur — le client n'émet qu'une intention (§2.1).
   */
  async updateMember(
    auth: AuthenticatedUser,
    gameId: string,
    membershipId: string,
    dto: UpdateMemberDto,
  ): Promise<MemberView> {
    if (dto.role == null && dto.unitType == null) {
      throw new BadRequestException('Rien à modifier');
    }
    const user = await this.usersService.getOrCreate(auth);
    const requester = await this.assertActiveMember(user.id, gameId);
    const [target] = await this.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.gameId, gameId),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
        ),
      );
    if (!target) throw new NotFoundException('Membre introuvable');

    const requesterRank = ROLE_RANK[requester.role] ?? 9;
    const targetRank = ROLE_RANK[target.role] ?? 9;

    if (dto.role != null) {
      await this.permissions.assert(
        requester,
        PERMISSIONS.MEMBERS_PROMOTE,
        'Votre grade ne permet pas de nommer les grades',
      );
      if (target.id === requester.id || target.role === 'commandant') {
        throw new ForbiddenException('Le commandant ne peut pas être rétrogradé');
      }
      // Même avec la permission, on ne nomme pas au-dessus de son propre
      // grade : la matrice ouvre la capacité, la hiérarchie en borne la portée.
      if ((ROLE_RANK[dto.role] ?? 9) < requesterRank) {
        throw new ForbiddenException(
          'On ne peut pas nommer à un grade supérieur au sien',
        );
      }
    }
    if (dto.unitType != null) {
      await this.permissions.assert(
        requester,
        PERMISSIONS.MEMBERS_BADGE,
        'Votre grade ne permet pas d’attribuer les insignes',
      );
      // La permission ouvre la capacité ; la hiérarchie en fixe la portée :
      // soi-même, ou un rang strictement inférieur.
      const isSelf = target.id === requester.id;
      if (!isSelf && requesterRank >= targetRank) {
        throw new ForbiddenException(
          'L’insigne ne se modifie que sur soi ou sur un rang inférieur',
        );
      }
    }

    await this.db
      .update(memberships)
      .set({
        ...(dto.role != null ? { role: dto.role } : {}),
        ...(dto.unitType != null ? { unitType: dto.unitType } : {}),
      })
      .where(eq(memberships.id, target.id));
    return this.emitMemberUpdate(gameId, target.id);
  }

  /** Résout l'appartenance active d'un utilisateur (pour la gateway). */
  async findActiveMembership(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<Membership> {
    const user = await this.usersService.getOrCreate(auth);
    return this.assertActiveMember(user.id, gameId);
  }

  /**
   * Efface une partie et tout ce qui en dépend. L'ordre suit les clés
   * étrangères : on retire les feuilles avant les racines, sinon PostgreSQL
   * refuse. Suppression définitive et volontaire (pas de tombstone ici :
   * la partie entière disparaît, il n'y a rien à réconcilier).
   */
  private async purgeGame(tx: Database, gameId: string): Promise<void> {
    const tokens = await tx
      .select({ id: inviteTokens.id })
      .from(inviteTokens)
      .where(eq(inviteTokens.gameId, gameId));
    for (const t of tokens) {
      await tx
        .delete(inviteRedemptions)
        .where(eq(inviteRedemptions.inviteTokenId, t.id));
    }
    await tx.delete(inviteTokens).where(eq(inviteTokens.gameId, gameId));

    // Gamification (§7.7-7.9) : journaux d'abord, puis les objets eux-mêmes.
    const flags = await tx
      .select({ id: objectives.id })
      .from(objectives)
      .where(eq(objectives.gameId, gameId));
    for (const f of flags) {
      await tx
        .delete(objectiveCaptures)
        .where(eq(objectiveCaptures.objectiveId, f.id));
    }
    await tx.delete(objectiveLinks).where(eq(objectiveLinks.gameId, gameId));
    await tx.delete(objectives).where(eq(objectives.gameId, gameId));

    const bonuses = await tx
      .select({ id: bonusQrs.id })
      .from(bonusQrs)
      .where(eq(bonusQrs.gameId, gameId));
    for (const b of bonuses) {
      await tx.delete(bonusScans).where(eq(bonusScans.bonusQrId, b.id));
    }
    await tx.delete(bonusQrs).where(eq(bonusQrs.gameId, gameId));

    await tx.delete(perkInstances).where(eq(perkInstances.gameId, gameId));
    await tx.delete(perkDefinitions).where(eq(perkDefinitions.gameId, gameId));
    await tx.delete(messages).where(eq(messages.gameId, gameId));
    await tx.delete(chatChannels).where(eq(chatChannels.gameId, gameId));
    // Trace et calques (§7.10) pointent vers memberships : avant elles.
    await tx.delete(positionLogs).where(eq(positionLogs.gameId, gameId));
    await tx.delete(mapLayers).where(eq(mapLayers.gameId, gameId));
    await tx.delete(mapObjects).where(eq(mapObjects.gameId, gameId));

    // La chaîne de commandement fait pointer des lignes les unes vers les
    // autres : on dénoue les liens avant de supprimer, sinon Postgres
    // refuse d'effacer un supérieur encore référencé par ses hommes.
    await tx
      .update(memberships)
      .set({ reportsToMembershipId: null })
      .where(eq(memberships.gameId, gameId));
    await tx
      .update(squads)
      .set({ leaderMembershipId: null, reportsToMembershipId: null })
      .where(eq(squads.gameId, gameId));
    // Les escouades pointent vers des membres : elles partent en premier.
    await tx.delete(squads).where(eq(squads.gameId, gameId));
    await tx.delete(memberships).where(eq(memberships.gameId, gameId));
    await tx.delete(teams).where(eq(teams.gameId, gameId));
    await tx.delete(games).where(eq(games.id, gameId));
  }

  private async assertActiveMember(
    userId: string,
    gameId: string,
  ): Promise<Membership> {
    const [membership] = await this.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.gameId, gameId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
        ),
      );
    if (!membership) {
      throw new ForbiddenException('Vous n’êtes pas membre de cette partie');
    }
    return membership;
  }

  private async selectMembers(gameId: string): Promise<MemberView[]> {
    const rows = await this.db
      .select({
        membershipId: memberships.id,
        pseudo: users.pseudo,
        email: users.email,
        role: memberships.role,
        unitType: memberships.unitType,
        teamId: memberships.teamId,
        squadId: memberships.squadId,
        reportsToMembershipId: memberships.reportsToMembershipId,
        lifeStatus: memberships.lifeStatus,
        lastPosition: memberships.lastPosition,
        lastPositionAt: memberships.lastPositionAt,
        isConnected: memberships.isConnected,
        lastSeenAt: memberships.lastSeenAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.gameId, gameId),
          isNull(memberships.leftAt),
          isNull(memberships.kickedAt),
        ),
      );
    // Ordre hiérarchique descendant (§5) : commandant, capitaines,
    // chefs d'escouade, joueurs — puis alphabétique.
    return rows.sort((a, b) => {
      const rank = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
      if (rank !== 0) return rank;
      return (a.pseudo ?? a.email ?? '').localeCompare(
        b.pseudo ?? b.email ?? '',
      );
    });
  }

  private async emitMemberUpdate(
    gameId: string,
    membershipId: string,
  ): Promise<MemberView> {
    const members = await this.selectMembers(gameId);
    const member = members.find((m) => m.membershipId === membershipId);
    if (member) {
      const event: MemberUpdatedEvent = { gameId, member };
      this.events.emit(MEMBER_UPDATED_EVENT, event);
    }
    return member!;
  }
}
