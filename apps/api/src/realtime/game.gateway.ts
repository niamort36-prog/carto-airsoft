import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { SupabaseTokenService } from '../auth/supabase-token.service';
import { LIFE_STATUSES, type LifeStatus } from '../games/dto';
import {
  GamesService,
  MEMBER_UPDATED_EVENT,
  type MemberUpdatedEvent,
  type MemberView,
} from '../games/games.service';
// GamesService est aussi utilisé statiquement (maskPosition) — l'import
// ci-dessus couvre les deux usages.

/** Événements émis par d'autres services — importés « par contrat » (pas de
 *  dépendance de module : la gateway ne fait que rediffuser). */
import {
  OBJECT_UPDATED_EVENT,
  type ObjectUpdatedEvent,
} from '../map-objects/map-objects.service';
import {
  ChatService,
  MESSAGE_SENT_EVENT,
  type MessageSentEvent,
} from '../chat/chat.service';
import {
  GAME_EVENT,
  type GameEventPayload,
} from '../objectives/objectives.service';
import {
  PERK_EVENT,
  PERK_REVEAL_EVENT,
  type PerkEventPayload,
  type PerkRevealPayload,
} from '../perks/perks.service';

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
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: SupabaseTokenService,
    private readonly gamesService: GamesService,
    private readonly chat: ChatService,
  ) {}

  /**
   * Authentification en MIDDLEWARE : la connexion n'est établie qu'une fois
   * le jeton vérifié. Aucun message ne peut donc arriver avant que
   * `client.data.user` soit posé (pas de course au démarrage), et un socket
   * sans jeton valide est refusé avec `connect_error`.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('jeton manquant'));
      this.tokens
        .verify(token)
        .then((user) => {
          (socket as GameSocket).data.user = user;
          (socket as GameSocket).data.memberships = new Map();
          next();
        })
        .catch(() => next(new Error('jeton invalide')));
    });
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
      // Room de camp : sert aux positions et aux révélations de drone.
      // Les joueurs sans équipe partagent une room commune — dans une
      // partie sans camps, tout le monde est allié de tout le monde.
      await client.join(
        GameGateway.campRoom(gameId, membership.teamId),
      );
      // Rooms des canaux autorisés par le grade ET le rattachement (§7.4).
      for (const channelId of await this.chat.accessibleChannelIds(
        gameId,
        membership,
      )) {
        await client.join(`channel:${channelId}`);
      }
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

  /**
   * Rediffusion d'un changement de membre. Invariant anti-triche (§2.1) :
   * la position complète ne part QUE dans la room de son équipe ; les autres
   * camps reçoivent la même mise à jour sans coordonnées. Sans cela, tout le
   * monde verrait tout le monde et le perk drone n'aurait aucun sens.
   */
  @OnEvent(MEMBER_UPDATED_EVENT)
  onMemberUpdated(event: MemberUpdatedEvent): void {
    const { gameId, member } = event;
    const camp = GameGateway.campRoom(gameId, member.teamId);
    this.server.to(camp).emit('member:update', member);
    this.server
      .to(`game:${gameId}`)
      .except(camp)
      .emit('member:update', GamesService.maskPosition(member));
  }

  /** Room du camp : l'équipe, ou le groupe des non-affectés de la partie. */
  private static campRoom(gameId: string, teamId: string | null): string {
    return teamId ? `team:${teamId}` : `game:${gameId}:sans-equipe`;
  }

  /** Rediffuse tout changement d'objet carte (marqueur posé/modifié/supprimé). */
  @OnEvent(OBJECT_UPDATED_EVENT)
  onObjectUpdated(event: ObjectUpdatedEvent): void {
    this.server
      .to(`game:${event.gameId}`)
      .emit('object:upsert', event.object);
  }

  /**
   * Diffusion d'un message dans la room de SON canal uniquement : un joueur
   * sans grade n'est pas dans la room du canal commandement, le message ne
   * lui parvient donc jamais (§7.4, cloisonnement côté serveur).
   */
  @OnEvent(MESSAGE_SENT_EVENT)
  onMessageSent(event: MessageSentEvent): void {
    this.server
      .to(`channel:${event.channelId}`)
      .emit('chat:message', event.message);
  }

  /**
   * Événements de jeu (capture d'objectif, bonus récupéré…) : annoncés à
   * toute la partie — c'est le sel du jeu que les deux camps sachent
   * qu'un drapeau vient de tomber.
   */
  @OnEvent(GAME_EVENT)
  onGameEvent(payload: GameEventPayload): void {
    this.server.to(`game:${payload.gameId}`).emit('game:event', payload.event);
  }

  /**
   * Révélation du drone (§7.7) : émise UNIQUEMENT dans la room de l'équipe
   * qui l'a lancé. C'est l'invariant anti-triche central — les positions
   * hostiles ne quittent le serveur que là, et le temps du perk.
   */
  @OnEvent(PERK_REVEAL_EVENT)
  onPerkReveal(payload: PerkRevealPayload): void {
    this.server.to(`team:${payload.teamId}`).emit('perk:reveal', {
      instanceId: payload.instanceId,
      endsAt: payload.endsAt,
      contacts: payload.contacts,
    });
  }

  /** Événements de perk : à toute la partie, ou à une seule équipe. */
  @OnEvent(PERK_EVENT)
  onPerkEvent(payload: PerkEventPayload): void {
    const room = payload.teamId
      ? `team:${payload.teamId}`
      : `game:${payload.gameId}`;
    this.server.to(room).emit('perk:event', payload.event);
  }
}
