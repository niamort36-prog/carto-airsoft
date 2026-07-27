import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, gt } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  chatChannels,
  memberships,
  messages,
  users,
  type ChatChannel,
} from '../db/schema';
import { GamesService } from '../games/games.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { Permission } from '../permissions/permissions';
import type { SendMessageDto } from './dto';

export interface ChannelView {
  id: string;
  scope: string;
  name: string;
}

/** Ce dont dépend l'accès à un canal : grade + rattachement. */
export type MembershipContext = {
  role: string;
  teamId: string | null;
  squadId: string | null;
};

export interface MessageView {
  id: string;
  channelId: string;
  body: string;
  authorMembershipId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MESSAGE_SENT_EVENT = 'chat.message';
export interface MessageSentEvent {
  gameId: string;
  channelId: string;
  message: MessageView;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Canaux visibles par ce membre — le cloisonnement est calculé serveur. */
  async listChannels(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<ChannelView[]> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    const all = await this.db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.gameId, gameId));
    const visible: ChannelView[] = [];
    for (const c of all) {
      if (await this.canAccess(c, gameId, membership)) {
        visible.push({ id: c.id, scope: c.scope, name: c.name });
      }
    }
    return visible;
  }

  /**
   * Delta des messages d'un canal (§7.6) : `since` = curseur serveur.
   * L'accès au canal est revérifié à chaque appel (§2.1).
   */
  async listMessages(
    auth: AuthenticatedUser,
    gameId: string,
    channelId: string,
    since?: string,
  ): Promise<{ serverTime: string; messages: MessageView[] }> {
    await this.assertChannelAccess(auth, gameId, channelId);
    const conditions = [eq(messages.channelId, channelId)];
    if (since) conditions.push(gt(messages.updatedAt, new Date(since)));
    const rows = await this.db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        body: messages.body,
        authorMembershipId: messages.authorMembershipId,
        pseudo: users.pseudo,
        email: users.email,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
      })
      .from(messages)
      .innerJoin(
        memberships,
        eq(messages.authorMembershipId, memberships.id),
      )
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(...conditions))
      .orderBy(messages.createdAt);
    return {
      serverTime: new Date().toISOString(),
      messages: rows.map((r) => ({
        id: r.id,
        channelId: r.channelId,
        body: r.body,
        authorMembershipId: r.authorMembershipId,
        authorName: r.pseudo ?? r.email?.split('@')[0] ?? 'Joueur',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  /** Envoi idempotent sur l'id client : rejouer la file ne duplique rien. */
  async sendMessage(
    auth: AuthenticatedUser,
    gameId: string,
    channelId: string,
    dto: SendMessageDto,
  ): Promise<MessageView> {
    const membership = await this.assertChannelAccess(auth, gameId, channelId);
    const [row] = await this.db
      .insert(messages)
      .values({
        id: dto.id,
        channelId,
        gameId,
        authorMembershipId: membership.id,
        body: dto.body,
        createdAt: new Date(dto.createdAt),
      })
      .onConflictDoNothing()
      .returning();

    // Doublon (file rejouée) : on renvoie le message déjà en base.
    const stored =
      row ??
      (
        await this.db
          .select()
          .from(messages)
          .where(eq(messages.id, dto.id))
      )[0];

    const [author] = await this.db
      .select({ pseudo: users.pseudo, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.id, stored.authorMembershipId));

    const view: MessageView = {
      id: stored.id,
      channelId: stored.channelId,
      body: stored.body,
      authorMembershipId: stored.authorMembershipId,
      authorName: author?.pseudo ?? author?.email?.split('@')[0] ?? 'Joueur',
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
    if (row) {
      const event: MessageSentEvent = { gameId, channelId, message: view };
      this.events.emit(MESSAGE_SENT_EVENT, event);
    }
    return view;
  }

  /** Canaux accessibles à ce membre — utilisé aussi par la gateway. */
  async accessibleChannelIds(
    gameId: string,
    membership: MembershipContext,
  ): Promise<string[]> {
    const all = await this.db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.gameId, gameId));
    const ids: string[] = [];
    for (const c of all) {
      if (await this.canAccess(c, gameId, membership)) ids.push(c.id);
    }
    return ids;
  }

  /**
   * Accès à un canal (§7.4), deux conditions cumulatives :
   *  - la permission éventuellement exigée (matrice §5) ;
   *  - l'APPARTENANCE pour les canaux d'équipe et d'escouade — on ne lit
   *    pas le canal d'un camp adverse, quel que soit son grade.
   */
  private async canAccess(
    channel: ChatChannel,
    gameId: string,
    membership: MembershipContext,
  ): Promise<boolean> {
    if (channel.teamId != null && channel.teamId !== membership.teamId) {
      return false;
    }
    if (channel.squadId != null && channel.squadId !== membership.squadId) {
      return false;
    }
    if (channel.requiredPermission == null) return true;
    return this.permissions.can(
      gameId,
      membership.role,
      channel.requiredPermission as Permission,
    );
  }

  private async assertChannelAccess(
    auth: AuthenticatedUser,
    gameId: string,
    channelId: string,
  ) {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    const [channel] = await this.db
      .select()
      .from(chatChannels)
      .where(
        and(eq(chatChannels.id, channelId), eq(chatChannels.gameId, gameId)),
      );
    if (!channel || !(await this.canAccess(channel, gameId, membership))) {
      throw new ForbiddenException(
        'Canal inaccessible : grade ou rattachement insuffisant',
      );
    }
    return membership;
  }
}
