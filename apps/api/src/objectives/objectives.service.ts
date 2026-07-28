import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, count, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  bonusQrs,
  bonusScans,
  objectiveCaptures,
  objectives,
  teams,
  type BonusQr,
  type Objective,
} from '../db/schema';
import { GamesService } from '../games/games.service';
import { PERMISSIONS } from '../permissions/permissions';
import { PermissionsService } from '../permissions/permissions.service';
import type { CreateBonusDto, CreateObjectiveDto } from './dto';

export interface ObjectiveView {
  id: string;
  name: string;
  lat: number;
  lng: number;
  captureOrder: number | null;
  allowedRoles: string[];
  reward: Record<string, unknown>;
  holderTeamId: string | null;
  lastCapturedAt: Date | null;
}

/** Résultat d'un scan — le type est décidé par le serveur, pas par le client. */
export type ScanResult =
  | {
      type: 'objective';
      objectiveId: string;
      name: string;
      teamId: string;
      pointsAwarded: number;
      teamScore: number;
    }
  | {
      type: 'bonus';
      bonusId: string;
      name: string;
      pointsAwarded: number;
      attachmentUrl: string | null;
      teamScore: number | null;
    };

export const GAME_EVENT = 'game.event';
export interface GameEventPayload {
  gameId: string;
  event: Record<string, unknown>;
}

@Injectable()
export class ObjectivesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static extractToken(raw: string): string {
    const trimmed = raw.trim();
    const match = trimmed.match(/\/[jkb]\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : trimmed;
  }

  private url(prefix: 'k' | 'b', token: string): string {
    const base =
      this.config.get<string>('INVITE_BASE_URL') ?? 'https://cartoairsoft.app';
    return `${base}/${prefix}/${token}`;
  }

  // --- Conception (console / commandant) -----------------------------------

  /** Poser un drapeau. Le jeton du QR n'est renvoyé qu'ici, une seule fois. */
  async createObjective(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreateObjectiveDto,
  ): Promise<ObjectiveView & { token: string; url: string }> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(objectives)
      .values({
        gameId,
        name: dto.name,
        position: { x: dto.lng, y: dto.lat },
        tokenHash: ObjectivesService.hash(token),
        captureOrder: dto.captureOrder ?? null,
        allowedRoles: dto.allowedRoles ?? [],
        reward: dto.reward ?? {},
      })
      .returning();
    return { ...this.toView(row), token, url: this.url('k', token) };
  }

  async listObjectives(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<ObjectiveView[]> {
    await this.gamesService.findActiveMembership(auth, gameId);
    const rows = await this.db
      .select()
      .from(objectives)
      .where(eq(objectives.gameId, gameId))
      .orderBy(objectives.captureOrder, objectives.createdAt);
    return rows.map((r) => this.toView(r));
  }

  async createBonus(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreateBonusDto,
  ): Promise<{ id: string; name: string; token: string; url: string }> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(bonusQrs)
      .values({
        gameId,
        name: dto.name,
        tokenHash: ObjectivesService.hash(token),
        reward: dto.reward ?? {},
        attachmentUrl: dto.attachmentUrl ?? null,
        maxScansTotal: dto.maxScansTotal ?? null,
        maxScansPerPlayer: dto.maxScansPerPlayer ?? 1,
      })
      .returning();
    return { id: row.id, name: row.name, token, url: this.url('b', token) };
  }

  /** Tableau des scores — lecture ouverte à tous les membres. */
  async scores(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<Array<{ id: string; name: string; color: string; score: number }>> {
    await this.gamesService.findActiveMembership(auth, gameId);
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        color: teams.color,
        score: teams.score,
      })
      .from(teams)
      .where(eq(teams.gameId, gameId));
  }

  // --- Jeu (scan sur le terrain) -------------------------------------------

  /**
   * Capture d'un drapeau (§7.8). Tout est arbitré ici : appartenance à la
   * partie, camp, grade habilité, ordre de capture. Le téléphone n'envoie
   * qu'un jeton opaque, il ne décide de rien.
   */
  async captureObjective(
    auth: AuthenticatedUser,
    objective: Objective,
  ): Promise<ScanResult> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      objective.gameId,
    );

    if (!membership.teamId) {
      throw new BadRequestException(
        'Vous devez appartenir à une équipe pour capturer un objectif',
      );
    }
    if (
      objective.allowedRoles.length > 0 &&
      !objective.allowedRoles.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Votre grade n’est pas habilité à capturer cet objectif',
      );
    }
    if (objective.holderTeamId === membership.teamId) {
      throw new GoneException('Votre équipe détient déjà cet objectif');
    }

    // Ordre de capture : tous les rangs inférieurs doivent être à nous.
    if (objective.captureOrder != null) {
      const [{ manquants }] = await this.db
        .select({ manquants: count() })
        .from(objectives)
        .where(
          and(
            eq(objectives.gameId, objective.gameId),
            lt(objectives.captureOrder, objective.captureOrder),
            or(
              isNull(objectives.holderTeamId),
              ne(objectives.holderTeamId, membership.teamId),
            ),
          ),
        );
      if (manquants > 0) {
        throw new ForbiddenException(
          `Capturez d’abord les objectifs précédents (${manquants} restant(s))`,
        );
      }
    }

    const points = Number(
      (objective.reward as Record<string, unknown>).points ?? 0,
    );

    const teamScore = await this.db.transaction(async (tx) => {
      await tx
        .update(objectives)
        .set({
          holderTeamId: membership.teamId,
          lastCapturedAt: new Date(),
        })
        .where(eq(objectives.id, objective.id));
      await tx.insert(objectiveCaptures).values({
        objectiveId: objective.id,
        membershipId: membership.id,
        teamId: membership.teamId!,
        pointsAwarded: points,
      });
      const [team] = await tx
        .update(teams)
        .set({ score: sql`${teams.score} + ${points}` })
        .where(eq(teams.id, membership.teamId!))
        .returning({ score: teams.score });
      return team.score;
    });

    this.emitEvent(objective.gameId, {
      kind: 'objective:captured',
      objectiveId: objective.id,
      name: objective.name,
      teamId: membership.teamId,
      pointsAwarded: points,
      teamScore,
    });

    return {
      type: 'objective',
      objectiveId: objective.id,
      name: objective.name,
      teamId: membership.teamId,
      pointsAwarded: points,
      teamScore,
    };
  }

  /** Bonus porté par un joueur ou posé sur le terrain (§7.9). */
  async redeemBonus(
    auth: AuthenticatedUser,
    bonus: BonusQr,
  ): Promise<ScanResult> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      bonus.gameId,
    );
    if (bonus.revokedAt) {
      throw new GoneException('Ce bonus a été retiré');
    }
    if (bonus.carrierMembershipId === membership.id) {
      throw new BadRequestException('On ne scanne pas son propre bonus');
    }
    if (bonus.maxScansTotal != null && bonus.scanCount >= bonus.maxScansTotal) {
      throw new GoneException('Ce bonus est épuisé');
    }
    if (bonus.maxScansPerPlayer != null) {
      const [{ deja }] = await this.db
        .select({ deja: count() })
        .from(bonusScans)
        .where(
          and(
            eq(bonusScans.bonusQrId, bonus.id),
            eq(bonusScans.membershipId, membership.id),
          ),
        );
      if (deja >= bonus.maxScansPerPlayer) {
        throw new GoneException('Vous avez déjà récupéré ce bonus');
      }
    }

    const points = Number((bonus.reward as Record<string, unknown>).points ?? 0);

    const teamScore = await this.db.transaction(async (tx) => {
      // Consommation atomique : deux scans simultanés ne peuvent pas
      // dépasser le quota total.
      const consumed = await tx
        .update(bonusQrs)
        .set({ scanCount: sql`${bonusQrs.scanCount} + 1` })
        .where(
          and(
            eq(bonusQrs.id, bonus.id),
            isNull(bonusQrs.revokedAt),
            or(
              isNull(bonusQrs.maxScansTotal),
              lt(bonusQrs.scanCount, bonusQrs.maxScansTotal),
            ),
          ),
        )
        .returning({ id: bonusQrs.id });
      if (consumed.length === 0) {
        throw new GoneException('Ce bonus est épuisé');
      }
      await tx.insert(bonusScans).values({
        bonusQrId: bonus.id,
        membershipId: membership.id,
        pointsAwarded: points,
      });
      if (membership.teamId && points !== 0) {
        const [team] = await tx
          .update(teams)
          .set({ score: sql`${teams.score} + ${points}` })
          .where(eq(teams.id, membership.teamId))
          .returning({ score: teams.score });
        return team.score;
      }
      return null;
    });

    this.emitEvent(bonus.gameId, {
      kind: 'bonus:redeemed',
      bonusId: bonus.id,
      name: bonus.name,
      membershipId: membership.id,
      pointsAwarded: points,
    });

    return {
      type: 'bonus',
      bonusId: bonus.id,
      name: bonus.name,
      pointsAwarded: points,
      attachmentUrl: bonus.attachmentUrl,
      teamScore,
    };
  }

  /** Résolution d'un jeton scanné en objectif ou bonus (null si ni l'un ni l'autre). */
  async resolve(
    rawToken: string,
  ): Promise<
    { kind: 'objective'; objective: Objective } | { kind: 'bonus'; bonus: BonusQr } | null
  > {
    const hash = ObjectivesService.hash(
      ObjectivesService.extractToken(rawToken),
    );
    const [objective] = await this.db
      .select()
      .from(objectives)
      .where(eq(objectives.tokenHash, hash));
    if (objective) return { kind: 'objective', objective };

    const [bonus] = await this.db
      .select()
      .from(bonusQrs)
      .where(eq(bonusQrs.tokenHash, hash));
    if (bonus) return { kind: 'bonus', bonus };
    return null;
  }

  private emitEvent(gameId: string, event: Record<string, unknown>): void {
    const payload: GameEventPayload = { gameId, event };
    this.events.emit(GAME_EVENT, payload);
  }

  private toView(row: Objective): ObjectiveView {
    return {
      id: row.id,
      name: row.name,
      lng: row.position.x,
      lat: row.position.y,
      captureOrder: row.captureOrder,
      allowedRoles: row.allowedRoles,
      reward: row.reward as Record<string, unknown>,
      holderTeamId: row.holderTeamId,
      lastCapturedAt: row.lastCapturedAt,
    };
  }
}
