import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { SupabaseTokenService } from '../auth/supabase-token.service';
import { LIFE_STATUSES, type LifeStatus } from './dto';
import {
  GamesService,
  MEMBER_UPDATED_EVENT,
  type MemberUpdatedEvent,
  type MemberView,
} from './games.service';

/** Événement émis par MapObjectsService — importé « par contrat » (pas de
 *  dépendance de module : la gateway ne fait que rediffuser). */
import {
  OBJECT_UPDATED_EVENT,
  type ObjectUpdatedEvent,
} from '../map-objects/map-objects.service';

interface GameSocketData {
  user: AuthenticatedUser;
  /** gameId → membershipId, pour les parties rejointes par ce socket. */
  memberships: Map<string, string>;
}

type GameSocket = Socket & { data: GameSocketData };

/**
 * Temps réel (§7.3) : positions, statuts, présence.
 *
 * Principes appliqués :
 *  - le serveur est l'arbitre (§2.1) : le client n'émet que des intentions,
 *    l'appartenance à la partie est vérifiée avant chaque diffusion ;
 *  - membre ≠ connecté (§2.4) : une déconnexion met à jour is_connected,
 *    ne retire jamais le membre — les autres le voient « hors ligne ».
 */
@WebSocketGateway({ namespace: 'game', cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: SupabaseTokenService,
    private readonly gamesService: GamesService,
  ) {}

  async handleConnection(client: GameSocket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      client.data.user = await this.tokens.verify(token);
      client.data.memberships = new Map();
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const joined = client.data.memberships;
    if (!joined) return;
    for (const [gameId, membershipId] of joined) {
      try {
        await this.gamesService.setConnected(membershipId, gameId, false);
      } catch (e) {
        this.logger.warn(`setConnected(false) a échoué: ${String(e)}`);
      }
    }
  }

  /** Rejoint la room d'une partie ; renvoie l'état complet des membres (ack). */
  @SubscribeMessage('game:join')
  async onGameJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { gameId?: string },
  ): Promise<{ ok: boolean; members?: MemberView[]; membershipId?: string; error?: string }> {
    const gameId = body?.gameId;
    if (!client.data.user || !gameId) return { ok: false, error: 'requête invalide' };
    try {
      const membership = await this.gamesService.findActiveMembership(
        client.data.user,
        gameId,
      );
      client.data.memberships.set(gameId, membership.id);
      await client.join(`game:${gameId}`);
      await this.gamesService.setConnected(membership.id, gameId, true);
      const members = await this.gamesService.getMembers(
        client.data.user,
        gameId,
      );
      return { ok: true, members, membershipId: membership.id };
    } catch {
      return { ok: false, error: 'accès refusé à cette partie' };
    }
  }

  @SubscribeMessage('position')
  async onPosition(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { gameId?: string; lat?: number; lng?: number },
  ): Promise<void> {
    const membershipId =
      body?.gameId != null
        ? client.data.memberships?.get(body.gameId)
        : undefined;
    if (
      !membershipId ||
      typeof body.lat !== 'number' ||
      typeof body.lng !== 'number' ||
      body.lat < -90 ||
      body.lat > 90 ||
      body.lng < -180 ||
      body.lng > 180
    ) {
      return;
    }
    await this.gamesService.updatePosition(
      membershipId,
      body.gameId!,
      body.lng,
      body.lat,
    );
  }

  @SubscribeMessage('status')
  async onStatus(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { gameId?: string; lifeStatus?: string },
  ): Promise<void> {
    if (
      !client.data.user ||
      !body?.gameId ||
      !client.data.memberships?.has(body.gameId) ||
      !LIFE_STATUSES.includes(body.lifeStatus as LifeStatus)
    ) {
      return;
    }
    await this.gamesService.updateMyStatus(
      client.data.user,
      body.gameId,
      body.lifeStatus as LifeStatus,
    );
  }

  /** Rediffuse tout changement de membre à la room de la partie. */
  @OnEvent(MEMBER_UPDATED_EVENT)
  onMemberUpdated(event: MemberUpdatedEvent): void {
    this.server
      .to(`game:${event.gameId}`)
      .emit('member:update', event.member);
  }

  /** Rediffuse tout changement d'objet carte (marqueur posé/modifié/supprimé). */
  @OnEvent(OBJECT_UPDATED_EVENT)
  onObjectUpdated(event: ObjectUpdatedEvent): void {
    this.server
      .to(`game:${event.gameId}`)
      .emit('object:upsert', event.object);
  }
}
