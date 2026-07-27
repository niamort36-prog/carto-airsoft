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
  chatChannels,
  games,
  memberships,
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

@Injectable()
export class GamesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  /** La partie est créée et détenue par le serveur (§2.5). */
  async createGame(auth: AuthenticatedUser, name: string): Promise<Game> {
    const user = await this.usersService.getOrCreate(auth);
    return this.db.transaction(async (tx) => {
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

  async getMembers(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<MemberView[]> {
    const user = await this.usersService.getOrCreate(auth);
    await this.assertActiveMember(user.id, gameId);
    return this.selectMembers(gameId);
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
    await this.db
      .update(memberships)
      .set({
        lastPosition: { x: lng, y: lat },
        lastPositionAt: new Date(),
      })
      .where(eq(memberships.id, membershipId));
    await this.emitMemberUpdate(gameId, membershipId);
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
