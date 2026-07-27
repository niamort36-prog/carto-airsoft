import {
  BadRequestException,
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
import type { AssignMemberDto, CreateSquadDto, CreateTeamDto } from './dto';

export interface TeamView {
  id: string;
  name: string;
  color: string;
  squads: Array<{ id: string; name: string }>;
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
        .map((s) => ({ id: s.id, name: s.name })),
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
    await this.permissions.assert(membership, PERMISSIONS.TEAMS_MANAGE);
    const [team] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, dto.teamId), eq(teams.gameId, gameId)));
    if (!team) throw new NotFoundException('Équipe introuvable');

    return this.db.transaction(async (tx) => {
      const [squad] = await tx
        .insert(squads)
        .values({ gameId, teamId: team.id, name: dto.name })
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

  /** Affecte un membre à une équipe/escouade (permission `teams:manage`). */
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
    await this.permissions.assert(requester, PERMISSIONS.TEAMS_MANAGE);

    const [target] = await this.db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.id, membershipId), eq(memberships.gameId, gameId)),
      );
    if (!target) throw new NotFoundException('Membre introuvable');

    const { teamId, squadId } = await this.resolveAssignment(gameId, dto);
    await this.db
      .update(memberships)
      .set({ teamId, squadId })
      .where(eq(memberships.id, membershipId));
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
