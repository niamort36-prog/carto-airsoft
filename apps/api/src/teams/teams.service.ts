import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  chatChannels,
  memberships,
  squads,
  teams,
  type Squad,
  type Team,
} from '../db/schema';
import { GamesService } from '../games/games.service';
import { PERMISSIONS } from '../permissions/permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { ROLE_RANK } from '../games/dto';
import type {
  AssignMemberDto,
  CreateSquadDto,
  CreateTeamDto,
  UpdateSquadDto,
} from './dto';

export interface SquadView {
  id: string;
  name: string;
  /** Chef d'escouade, s'il en a un. */
  leaderMembershipId: string | null;
  /** Capitaine ou commandant dont l'escouade dépend. */
  reportsToMembershipId: string | null;
  /** Étiquette libre du groupe (fréquence radio du réseau, indicatif). */
  note: string | null;
}

export interface TeamView {
  id: string;
  name: string;
  color: string;
  squads: SquadView[];
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Organisation de la partie — visible par tous les membres. */
  async list(auth: AuthenticatedUser, gameId: string): Promise<TeamView[]> {
    await this.gamesService.findActiveMembership(auth, gameId);
    const [teamRows, squadRows] = await Promise.all([
      this.db.select().from(teams).where(eq(teams.gameId, gameId)),
      this.db.select().from(squads).where(eq(squads.gameId, gameId)),
    ]);
    return teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      squads: squadRows
        .filter((s) => s.teamId === t.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          leaderMembershipId: s.leaderMembershipId,
          reportsToMembershipId: s.reportsToMembershipId,
          note: s.note,
        })),
    }));
  }

  /**
   * Créer une équipe crée aussi son canal de discussion (§7.4) : le
   * cloisonnement suit l'organisation, sans manipulation supplémentaire.
   */
  async createTeam(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreateTeamDto,
  ): Promise<Team> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.TEAMS_MANAGE);
    return this.db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({ gameId, name: dto.name, color: dto.color ?? '#4CAF50' })
        .returning();
      await tx.insert(chatChannels).values({
        gameId,
        scope: 'team',
        name: `Équipe ${team.name}`,
        teamId: team.id,
      });
      return team;
    });
  }

  async createSquad(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreateSquadDto,
  ): Promise<Squad> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    // Former une escouade n'est pas découper la partie : permission propre,
    // que le capitaine possède par défaut.
    await this.permissions.assert(membership, PERMISSIONS.SQUADS_MANAGE);
    // Un capitaine forme des escouades DANS SON CAMP. Le commandant, lui,
    // voit toute la partie.
    if (membership.role !== 'commandant' && membership.teamId !== dto.teamId) {
      throw new ForbiddenException(
        'Vous ne formez des escouades que dans votre propre camp',
      );
    }
    const [team] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, dto.teamId), eq(teams.gameId, gameId)));
    if (!team) throw new NotFoundException('Équipe introuvable');

    return this.db.transaction(async (tx) => {
      const [squad] = await tx
        .insert(squads)
        .values({
          gameId,
          teamId: team.id,
          name: dto.name,
          // Rattachée d'emblée à celui qui la forme : c'est le cas courant,
          // et une escouade orpheline ne dit rien à personne.
          reportsToMembershipId: TeamsService.canCommandSquad(membership.role)
            ? membership.id
            : null,
        })
        .returning();
      await tx.insert(chatChannels).values({
        gameId,
        scope: 'squad',
        name: `Escouade ${squad.name}`,
        teamId: team.id,
        squadId: squad.id,
      });
      return squad;
    });
  }

  /**
   * Affecte un membre : camp, escouade, et supérieur direct.
   *
   * Deux bornes, toujours les mêmes (§5) : la permission dit ce qu'on peut
   * faire, le grade dit sur qui. Un capitaine compose ses groupes dans son
   * camp et ne touche jamais à quelqu'un de rang égal ou supérieur.
   */
  async assignMember(
    auth: AuthenticatedUser,
    gameId: string,
    membershipId: string,
    dto: AssignMemberDto,
  ): Promise<void> {
    const requester = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(requester, PERMISSIONS.SQUADS_MANAGE);

    const [target] = await this.db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.id, membershipId), eq(memberships.gameId, gameId)),
      );
    if (!target) throw new NotFoundException('Membre introuvable');
    this.assertOutranks(requester, target);

    const { teamId, squadId } = await this.resolveAssignment(gameId, dto);

    // `undefined` = ne pas toucher au supérieur ; `null` = le retirer.
    let reportsToMembershipId = target.reportsToMembershipId;
    if (dto.reportsToMembershipId !== undefined) {
      reportsToMembershipId = dto.reportsToMembershipId
        ? (await this.resolveSuperior(gameId, dto.reportsToMembershipId, target))
            .id
        : null;
    }

    await this.db
      .update(memberships)
      .set({ teamId, squadId, reportsToMembershipId })
      .where(eq(memberships.id, membershipId));
  }

  /**
   * Modifie une escouade : son nom, son chef, et le gradé dont elle dépend.
   */
  async updateSquad(
    auth: AuthenticatedUser,
    gameId: string,
    squadId: string,
    dto: UpdateSquadDto,
  ): Promise<SquadView> {
    const requester = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(requester, PERMISSIONS.SQUADS_MANAGE);

    const [squad] = await this.db
      .select()
      .from(squads)
      .where(and(eq(squads.id, squadId), eq(squads.gameId, gameId)));
    if (!squad) throw new NotFoundException('Escouade introuvable');
    if (
      requester.role !== 'commandant' &&
      requester.teamId !== squad.teamId
    ) {
      throw new ForbiddenException(
        'Cette escouade n’est pas dans votre camp',
      );
    }

    const changes: Partial<typeof squads.$inferInsert> = {};
    if (dto.name !== undefined) changes.name = dto.name;

    if (dto.leaderMembershipId !== undefined) {
      if (dto.leaderMembershipId === null) {
        changes.leaderMembershipId = null;
      } else {
        const leader = await this.memberOfGame(gameId, dto.leaderMembershipId);
        if (leader.squadId !== squad.id) {
          throw new BadRequestException(
            'Le chef d’escouade doit d’abord appartenir à cette escouade',
          );
        }
        changes.leaderMembershipId = leader.id;
      }
    }

    if (dto.reportsToMembershipId !== undefined) {
      if (dto.reportsToMembershipId === null) {
        changes.reportsToMembershipId = null;
      } else {
        const superior = await this.memberOfGame(
          gameId,
          dto.reportsToMembershipId,
        );
        if (!TeamsService.canCommandSquad(superior.role)) {
          throw new BadRequestException(
            'Une escouade se rattache à un capitaine ou à un commandant',
          );
        }
        if (
          superior.role !== 'commandant' &&
          superior.teamId !== squad.teamId
        ) {
          throw new BadRequestException(
            'Ce gradé n’est pas dans le camp de l’escouade',
          );
        }
        changes.reportsToMembershipId = superior.id;
      }
    }

    // Étiquette du groupe : vidée, elle disparaît de la carte.
    if (dto.note !== undefined) {
      changes.note = dto.note?.trim() ? dto.note.trim() : null;
    }

    const [updated] = await this.db
      .update(squads)
      .set(changes)
      .where(eq(squads.id, squad.id))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      leaderMembershipId: updated.leaderMembershipId,
      reportsToMembershipId: updated.reportsToMembershipId,
      note: updated.note,
    };
  }

  /** Seuls ces grades commandent une escouade ou des hommes détachés. */
  private static canCommandSquad(role: string): boolean {
    return role === 'commandant' || role === 'capitaine';
  }

  /**
   * « On n'agit jamais sur son propre rang, ni au-dessus » (§5) — avec une
   * exception qui va de soi : on se place soi-même. Sans elle, un
   * commandant ne pourrait pas rejoindre un camp, personne n'étant au-dessus
   * de lui pour l'y mettre.
   */
  private assertOutranks(
    requester: { id: string; role: string; teamId: string | null },
    target: { id: string; role: string; teamId: string | null },
  ): void {
    if (requester.id === target.id) return;
    const mine = ROLE_RANK[requester.role] ?? 9;
    const theirs = ROLE_RANK[target.role] ?? 9;
    if (mine >= theirs) {
      throw new ForbiddenException(
        'Vous ne pouvez affecter que des joueurs de rang inférieur au vôtre',
      );
    }
    if (requester.role !== 'commandant' && requester.teamId !== target.teamId) {
      throw new ForbiddenException('Ce joueur n’est pas dans votre camp');
    }
  }

  /** Vérifie qu'un supérieur direct est plausible pour cette cible. */
  private async resolveSuperior(
    gameId: string,
    superiorId: string,
    target: { id: string; role: string; teamId: string | null },
  ) {
    const superior = await this.memberOfGame(gameId, superiorId);
    if (superior.id === target.id) {
      throw new BadRequestException('Un joueur ne relève pas de lui-même');
    }
    if (!TeamsService.canCommandSquad(superior.role)) {
      throw new BadRequestException(
        'Seuls un capitaine ou un commandant prennent des hommes sous leurs '
        + 'ordres',
      );
    }
    if ((ROLE_RANK[superior.role] ?? 9) >= (ROLE_RANK[target.role] ?? 9)) {
      throw new BadRequestException(
        'Le supérieur doit être d’un rang plus élevé',
      );
    }
    return superior;
  }

  private async memberOfGame(gameId: string, membershipId: string) {
    const [row] = await this.db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.id, membershipId), eq(memberships.gameId, gameId)),
      );
    if (!row) throw new NotFoundException('Membre introuvable');
    return row;
  }

  /**
   * Valide la cohérence d'une affectation : une escouade appartient à une
   * équipe, on ne peut donc pas être dans l'escouade d'un autre camp.
   */
  async resolveAssignment(
    gameId: string,
    dto: AssignMemberDto,
  ): Promise<{ teamId: string | null; squadId: string | null }> {
    let teamId = dto.teamId ?? null;
    const squadId = dto.squadId ?? null;

    if (squadId) {
      const [squad] = await this.db
        .select()
        .from(squads)
        .where(and(eq(squads.id, squadId), eq(squads.gameId, gameId)));
      if (!squad) throw new NotFoundException('Escouade introuvable');
      if (teamId && teamId !== squad.teamId) {
        throw new BadRequestException(
          'Cette escouade n’appartient pas à l’équipe indiquée',
        );
      }
      teamId = squad.teamId; // l'escouade détermine l'équipe
    } else if (teamId) {
      const [team] = await this.db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.gameId, gameId)));
      if (!team) throw new NotFoundException('Équipe introuvable');
    }
    return { teamId, squadId };
  }
}
