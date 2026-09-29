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
  squads,
  teams,
  type InviteToken,
} from '../db/schema';
import { UsersService } from '../users/users.service';
import { GamesService } from '../games/games.service';
import { ROLE_RANK } from '../games/dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSIONS } from '../permissions/permissions';
import { TeamsService } from '../teams/teams.service';
import type { CreateInviteDto } from './dto';

/** Vue d'une invitation — ne contient JAMAIS le jeton (il n'est plus connu). */
export interface InviteView {
  id: string;
  role: string;
  /**
   * Code court à dicter, mis en forme (« ABCD-EFGH »). Réaffichable, à la
   * différence du jeton du QR — c'est tout son intérêt.
   */
  code: string;
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
    private readonly teams: TeamsService,
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

  /**
   * Alphabet du code court : ni O/0, ni I/1/L. Sur un parking, « zéro » et
   * « O » se prononcent pareil et s'écrivent presque pareil — les exclure
   * coûte un peu d'entropie et épargne les erreurs de saisie.
   */
  private static readonly CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  private static readonly CODE_LENGTH = 8;

  /** Tire un code court non devinable. */
  private static newCode(): string {
    const octets = randomBytes(InvitesService.CODE_LENGTH);
    let code = '';
    for (const o of octets) {
      code += InvitesService.CODE_ALPHABET[o % InvitesService.CODE_ALPHABET.length];
    }
    return code;
  }

  /**
   * Met une saisie humaine en forme de code : majuscules, sans séparateur.
   * On tape « abcd-efgh » ou « ABCD EFGH » ; refuser l'une des deux formes
   * serait un piège, pas une vérification.
   */
  static normalizeCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /** Découpe le code en deux moitiés : plus facile à lire et à dicter. */
  static formatCode(code: string): string {
    const milieu = Math.ceil(code.length / 2);
    return `${code.slice(0, milieu)}-${code.slice(milieu)}`;
  }

  /**
   * Retrouve une invitation à partir de ce qu'on lui présente : le jeton
   * long du QR, l'URL qui le contient, ou le code court dicté à la voix.
   *
   * Les deux chemins de lecture diffèrent à dessein. Le jeton n'existe en
   * base que sous forme d'empreinte (§7.2) : on le hache pour le chercher.
   * Le code, lui, est en clair, parce qu'il doit rester réaffichable.
   */
  private async findInvite(raw: string): Promise<InviteToken | undefined> {
    const token = InvitesService.extractToken(raw);
    const [parJeton] = await this.db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.tokenHash, InvitesService.hash(token)));
    if (parJeton) return parJeton;

    const code = InvitesService.normalizeCode(raw);
    if (code.length !== InvitesService.CODE_LENGTH) return undefined;
    const [parCode] = await this.db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.code, code));
    return parCode;
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
    const code = InvitesService.newCode();

    // Affectation portée par le QR : cohérence validée dès la création,
    // pour ne pas découvrir l'erreur au moment du scan sur le terrain.
    const { teamId, squadId } = await this.teams.resolveAssignment(gameId, {
      teamId: dto.teamId,
      squadId: dto.squadId,
    });

    const [row] = await this.db
      .insert(inviteTokens)
      .values({
        gameId,
        role: dto.role,
        teamId,
        squadId,
        tokenHash: InvitesService.hash(token),
        code,
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
  /**
   * Ce qu'une invitation donnerait, SANS rejoindre.
   *
   * Un QR se scanne les yeux fermés ; un code se tape, et on peut se
   * tromper de chiffre. Montrer la partie, le grade et le camp avant de
   * s'engager évite de découvrir l'erreur une fois inscrit dans le camp
   * adverse.
   */
  async preview(
    rawToken: string,
  ): Promise<{
    gameName: string;
    role: string;
    teamName: string | null;
    squadName: string | null;
  }> {
    const invite = await this.findInvite(rawToken);
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

    const [game] = await this.db
      .select({ name: games.name })
      .from(games)
      .where(eq(games.id, invite.gameId));

    let teamName: string | null = null;
    if (invite.teamId) {
      const [team] = await this.db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, invite.teamId));
      teamName = team?.name ?? null;
    }
    let squadName: string | null = null;
    if (invite.squadId) {
      const [squad] = await this.db
        .select({ name: squads.name })
        .from(squads)
        .where(eq(squads.id, invite.squadId));
      squadName = squad?.name ?? null;
    }

    return {
      gameName: game?.name ?? 'Partie',
      role: invite.role,
      teamName,
      squadName,
    };
  }

  async redeem(
    auth: AuthenticatedUser,
    rawToken: string,
  ): Promise<{ gameId: string; gameName: string; role: string }> {
    const invite = await this.findInvite(rawToken);
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
      // Le QR peut placer directement dans un camp / une escouade (§4).
      teamId: invite.teamId,
      squadId: invite.squadId,
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
      code: InvitesService.formatCode(row.code),
      maxUses: row.maxUses,
      useCount: row.useCount,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      active: row.revokedAt == null && !expired && !exhausted,
    };
  }
}
