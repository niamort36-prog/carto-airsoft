import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  games,
  inviteRedemptions,
  inviteTokens,
  memberships,
  type InviteToken,
} from '../db/schema';
import { UsersService } from '../users/users.service';
import { GamesService } from '../games/games.service';
import { ROLE_RANK } from '../games/dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSIONS } from '../permissions/permissions';
import type { CreateInviteDto } from './dto';

/** Vue d'une invitation — ne contient JAMAIS le jeton (il n'est plus connu). */
export interface InviteView {
  id: string;
  role: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** true si le QR peut encore être scanné. */
  active: boolean;
}

/** Réponse de création : le jeton en clair, montré UNE SEULE FOIS. */
export interface CreatedInvite extends InviteView {
  token: string;
  /** URL à encoder dans le QR (scannable aussi par l'appareil photo natif). */
  url: string;
}

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly usersService: UsersService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Extrait le jeton d'une saisie : accepte le jeton brut ou l'URL complète
   * du QR (`https://…/j/<jeton>`), pour que l'appareil photo natif marche.
   */
  private static extractToken(raw: string): string {
    const trimmed = raw.trim();
    const match = trimmed.match(/\/j\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : trimmed;
  }

  /** Création d'un QR : soumise à la permission `invites:manage` (§5, §7.2). */
  async createInvite(
    auth: AuthenticatedUser,
    gameId: string,
    dto: CreateInviteDto,
  ): Promise<CreatedInvite> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(
      membership,
      PERMISSIONS.INVITES_MANAGE,
      'Votre grade ne permet pas de générer des invitations',
    );
    // Garde-fou hiérarchique : on n'invite jamais à un grade SUPÉRIEUR au
    // sien (sinon un capitaine se ferait un QR de commandant). Inviter à son
    // propre grade ou en dessous reste permis.
    if ((ROLE_RANK[dto.role] ?? 9) < (ROLE_RANK[membership.role] ?? 9)) {
      throw new ForbiddenException(
        'On ne peut pas inviter à un grade supérieur au sien',
      );
    }

    // 32 octets d'aléa : opaque, non devinable, sans information de rôle.
    // C'est ce qui empêche de fabriquer soi-même un QR d'un grade supérieur.
    const token = randomBytes(32).toString('base64url');

    const [row] = await this.db
      .insert(inviteTokens)
      .values({
        gameId,
        role: dto.role,
        tokenHash: InvitesService.hash(token),
        // Réutilisable par défaut (choix du propriétaire du projet) ; une
        // limite reste possible à la demande, la mécanique est en place.
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdByMembershipId: membership.id,
      })
      .returning();

    return { ...this.toView(row), token, url: this.inviteUrl(token) };
  }

  async listInvites(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<InviteView[]> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(
      membership,
      PERMISSIONS.INVITES_MANAGE,
      'Votre grade ne permet pas de consulter les invitations',
    );
    const rows = await this.db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.gameId, gameId))
      .orderBy(inviteTokens.createdAt);
    return rows.map((r) => this.toView(r));
  }

  async revokeInvite(
    auth: AuthenticatedUser,
    gameId: string,
    inviteId: string,
  ): Promise<InviteView> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(
      membership,
      PERMISSIONS.INVITES_MANAGE,
      'Votre grade ne permet pas de révoquer une invitation',
    );
    const [row] = await this.db
      .update(inviteTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(inviteTokens.id, inviteId), eq(inviteTokens.gameId, gameId)),
      )
      .returning();
    if (!row) throw new NotFoundException('Invitation introuvable');
    return this.toView(row);
  }

  /**
   * Échange du jeton scanné contre une adhésion (§7.2) : c'est le SERVEUR
   * qui décide du rôle, le client n'envoie que le jeton opaque.
   */
  async redeem(
    auth: AuthenticatedUser,
    rawToken: string,
  ): Promise<{ gameId: string; gameName: string; role: string }> {
    const token = InvitesService.extractToken(rawToken);
    const [invite] = await this.db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.tokenHash, InvitesService.hash(token)));
    if (!invite) throw new NotFoundException('Invitation inconnue');

    if (invite.revokedAt) {
      throw new GoneException('Cette invitation a été révoquée');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Cette invitation a expiré');
    }
    if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
      throw new GoneException('Cette invitation a déjà été utilisée');
    }

    const user = await this.usersService.getOrCreate(auth);
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, invite.gameId));

    // Déjà membre : on ne consomme pas d'usage, on ne rétrograde pas non
    // plus — rejoindre deux fois avec le même QR doit être sans effet.
    const [existing] = await this.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.gameId, invite.gameId),
          eq(memberships.userId, user.id),
        ),
      );
    if (existing) {
      if (existing.kickedAt) {
        throw new ForbiddenException('Vous avez été exclu de cette partie');
      }
      if (existing.leftAt) {
        await this.db
          .update(memberships)
          .set({ leftAt: null })
          .where(eq(memberships.id, existing.id));
      }
      return {
        gameId: invite.gameId,
        gameName: game.name,
        role: existing.role,
      };
    }

    // Consommation atomique : le compteur n'avance que si le quota le permet
    // au moment du UPDATE, ce qui empêche deux scans simultanés de dépasser
    // la limite (le contrôle plus haut ne suffirait pas seul).
    const consumed = await this.db
      .update(inviteTokens)
      .set({ useCount: sql`${inviteTokens.useCount} + 1` })
      .where(
        and(
          eq(inviteTokens.id, invite.id),
          isNull(inviteTokens.revokedAt),
          or(
            isNull(inviteTokens.maxUses),
            lt(inviteTokens.useCount, inviteTokens.maxUses),
          ),
        ),
      )
      .returning({ id: inviteTokens.id });
    if (consumed.length === 0) {
      throw new GoneException('Cette invitation a déjà été utilisée');
    }

    await this.db.insert(memberships).values({
      gameId: invite.gameId,
      userId: user.id,
      role: invite.role,
      unitType: invite.role === 'commandant' ? 'command' : 'infantry',
    });
    await this.db
      .insert(inviteRedemptions)
      .values({ inviteTokenId: invite.id, userId: user.id });

    return { gameId: invite.gameId, gameName: game.name, role: invite.role };
  }

  private inviteUrl(token: string): string {
    const base =
      this.config.get<string>('INVITE_BASE_URL') ?? 'https://cartoairsoft.app';
    return `${base}/j/${token}`;
  }

  private toView(row: InviteToken): InviteView {
    const expired =
      row.expiresAt != null && row.expiresAt.getTime() < Date.now();
    const exhausted = row.maxUses != null && row.useCount >= row.maxUses;
    return {
      id: row.id,
      role: row.role,
      maxUses: row.maxUses,
      useCount: row.useCount,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      active: row.revokedAt == null && !expired && !exhausted,
    };
  }
}
