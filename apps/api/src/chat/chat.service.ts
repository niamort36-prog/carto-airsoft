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
      if (await this.canAccess(c, gameId, membership.role)) {
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

  /** Canaux dont ce rôle a le droit — utilisé aussi par la gateway. */
  async accessibleChannelIds(
    gameId: string,
    role: string,
  ): Promise<string[]> {
    const all = await this.db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.gameId, gameId));
    const ids: string[] = [];
    for (const c of all) {
      if (await this.canAccess(c, gameId, role)) ids.push(c.id);
    }
    return ids;
  }

  /**
   * Accès à un canal : piloté par une permission (§5). Sans permission
   * exigée, le canal est ouvert à tous les membres de la partie.
   */
  private async canAccess(
    channel: ChatChannel,
    gameId: string,
    role: string,
  ): Promise<boolean> {
    if (channel.requiredPermission == null) return true;
    return this.permissions.can(
      gameId,
      role,
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
    if (!channel || !(await this.canAccess(channel, gameId, membership.role))) {
      throw new ForbiddenException('Canal inaccessible avec votre grade');
    }
    return membership;
  }
}
