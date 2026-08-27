import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  games,
  mapObjects,
  memberships,
  objectiveCaptures,
  objectives,
  positionLogs,
  teams,
  users,
} from '../db/schema';
import { GamesService } from '../games/games.service';

export interface PlayerStats {
  membershipId: string;
  pseudo: string | null;
  role: string;
  unitType: string;
  teamId: string | null;
  /** Distance parcourue, en mètres. */
  distanceMeters: number;
  /** Durée entre le premier et le dernier point de trace, en secondes. */
  activeSeconds: number;
  captures: number;
  pointsAwarded: number;
  markersPlaced: number;
}

export interface TeamStats {
  teamId: string;
  name: string;
  color: string;
  score: number;
  captures: number;
  distanceMeters: number;
}

export interface GameStats {
  game: { id: string; name: string; status: string; startsAt: Date | null; endsAt: Date | null };
  players: PlayerStats[];
  teams: TeamStats[];
}

/** Un point de la trace d'un joueur. */
export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
}

export interface ReplayData {
  game: { id: string; name: string; status: string };
  /** Bornes de la partie, telles que la trace les raconte. */
  from: number;
  to: number;
  units: Array<{
    membershipId: string;
    pseudo: string | null;
    role: string;
    unitType: string;
    teamId: string | null;
    teamColor: string | null;
    track: TrackPoint[];
  }>;
  events: Array<{
    t: number;
    kind: 'capture' | 'marker';
    label: string;
    lat: number;
    lng: number;
    teamId?: string | null;
  }>;
}

/**
 * Statistiques et rejeu de fin de partie (§10, Phase 5).
 *
 * **Une partie ne se rejoue qu'une fois terminée.** Le rejeu montre les
 * positions de tout le monde : le servir pendant le jeu offrirait à
 * l'organisateur une vue complète du terrain adverse, exactement ce que le
 * §2.1 refuse. Chacun peut en revanche consulter sa propre trace à tout
 * moment — elle ne révèle que ce qu'il sait déjà.
 */
@Injectable()
export class StatsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
  ) {}

  async stats(auth: AuthenticatedUser, gameId: string): Promise<GameStats> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    const game = await this.assertFinished(gameId);

    const players = await this.db
      .select({
        membershipId: memberships.id,
        pseudo: users.pseudo,
        role: memberships.role,
        unitType: memberships.unitType,
        teamId: memberships.teamId,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.gameId, gameId), isNull(memberships.kickedAt)));

    const tracks = await this.tracksByMember(gameId);
    const captures = await this.db
      .select({
        membershipId: objectiveCaptures.membershipId,
        teamId: objectiveCaptures.teamId,
        pointsAwarded: objectiveCaptures.pointsAwarded,
      })
      .from(objectiveCaptures)
      .innerJoin(objectives, eq(objectiveCaptures.objectiveId, objectives.id))
      .where(eq(objectives.gameId, gameId));

    const markers = await this.db
      .select({ authorMembershipId: mapObjects.authorMembershipId })
      .from(mapObjects)
      .where(eq(mapObjects.gameId, gameId));

    const playerStats: PlayerStats[] = players.map((p) => {
      const track = tracks.get(p.membershipId) ?? [];
      const own = captures.filter((c) => c.membershipId === p.membershipId);
      return {
        ...p,
        distanceMeters: Math.round(trackDistance(track)),
        activeSeconds:
          track.length >= 2
            ? Math.round((track[track.length - 1].t - track[0].t) / 1000)
            : 0,
        captures: own.length,
        pointsAwarded: own.reduce((sum, c) => sum + c.pointsAwarded, 0),
        markersPlaced: markers.filter(
          (m) => m.authorMembershipId === p.membershipId,
        ).length,
      };
    });

    const teamRows = await this.db
      .select()
      .from(teams)
      .where(eq(teams.gameId, gameId));

    const teamStats: TeamStats[] = teamRows.map((t) => {
      const mine = playerStats.filter((p) => p.teamId === t.id);
      return {
        teamId: t.id,
        name: t.name,
        color: t.color,
        score: t.score,
        captures: captures.filter((c) => c.teamId === t.id).length,
        distanceMeters: mine.reduce((sum, p) => sum + p.distanceMeters, 0),
      };
    });

    void membership;
    return {
      game: {
        id: game.id,
        name: game.name,
        status: game.status,
        startsAt: game.startsAt,
        endsAt: game.endsAt,
      },
      players: playerStats.sort(
        (a, b) => b.distanceMeters - a.distanceMeters,
      ),
      teams: teamStats.sort((a, b) => b.score - a.score),
    };
  }

  /** Tout ce qu'il faut pour rejouer la partie sur la console. */
  async replay(auth: AuthenticatedUser, gameId: string): Promise<ReplayData> {
    await this.gamesService.findActiveMembership(auth, gameId);
    const game = await this.assertFinished(gameId);

    const players = await this.db
      .select({
        membershipId: memberships.id,
        pseudo: users.pseudo,
        role: memberships.role,
        unitType: memberships.unitType,
        teamId: memberships.teamId,
        teamColor: teams.color,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(teams, eq(memberships.teamId, teams.id))
      .where(and(eq(memberships.gameId, gameId), isNull(memberships.kickedAt)));

    const tracks = await this.tracksByMember(gameId);

    const captures = await this.db
      .select({
        name: objectives.name,
        position: objectives.position,
        teamId: objectiveCaptures.teamId,
        capturedAt: objectiveCaptures.capturedAt,
      })
      .from(objectiveCaptures)
      .innerJoin(objectives, eq(objectiveCaptures.objectiveId, objectives.id))
      .where(eq(objectives.gameId, gameId));

    const markers = await this.db
      .select({
        position: mapObjects.position,
        properties: mapObjects.properties,
        createdAt: mapObjects.createdAt,
      })
      .from(mapObjects)
      .where(and(eq(mapObjects.gameId, gameId), eq(mapObjects.kind, 'marker')));

    const events: ReplayData['events'] = [
      ...captures.map((c) => ({
        t: c.capturedAt.getTime(),
        kind: 'capture' as const,
        label: c.name,
        lat: c.position.y,
        lng: c.position.x,
        teamId: c.teamId,
      })),
      ...markers.map((m) => {
        const props = (m.properties ?? {}) as Record<string, unknown>;
        return {
          t: m.createdAt.getTime(),
          kind: 'marker' as const,
          label:
            typeof props.unitLabel === 'string' ? props.unitLabel : 'Marqueur',
          lat: m.position.y,
          lng: m.position.x,
        };
      }),
    ].sort((a, b) => a.t - b.t);

    // Bornes : la trace fait foi, à défaut les horodatages de la partie.
    const times = [
      ...[...tracks.values()].flatMap((t) => t.map((p) => p.t)),
      ...events.map((e) => e.t),
    ];
    const from = times.length > 0 ? Math.min(...times) : Date.now();
    const to = times.length > 0 ? Math.max(...times) : Date.now();

    return {
      game: { id: game.id, name: game.name, status: game.status },
      from,
      to,
      units: players.map((p) => ({
        ...p,
        track: tracks.get(p.membershipId) ?? [],
      })),
      events,
    };
  }

  /** Ma propre trace — consultable à tout moment, elle ne révèle que moi. */
  async myTrack(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<TrackPoint[]> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    const tracks = await this.tracksByMember(gameId, membership.id);
    return tracks.get(membership.id) ?? [];
  }

  private async tracksByMember(
    gameId: string,
    onlyMembershipId?: string,
  ): Promise<Map<string, TrackPoint[]>> {
    const rows = await this.db
      .select({
        membershipId: positionLogs.membershipId,
        position: positionLogs.position,
        recordedAt: positionLogs.recordedAt,
      })
      .from(positionLogs)
      .where(
        onlyMembershipId
          ? and(
              eq(positionLogs.gameId, gameId),
              eq(positionLogs.membershipId, onlyMembershipId),
            )
          : eq(positionLogs.gameId, gameId),
      )
      .orderBy(asc(positionLogs.recordedAt));

    const tracks = new Map<string, TrackPoint[]>();
    for (const row of rows) {
      const list = tracks.get(row.membershipId) ?? [];
      list.push({
        t: row.recordedAt.getTime(),
        lat: row.position.y,
        lng: row.position.x,
      });
      tracks.set(row.membershipId, list);
    }
    return tracks;
  }

  private async assertFinished(gameId: string) {
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new ForbiddenException('Partie introuvable');
    if (game.status !== 'finished') {
      throw new ForbiddenException(
        'Disponible une fois la partie terminée : le rejeu montre les ' +
          'positions de tout le monde',
      );
    }
    return game;
  }
}

/** Distance cumulée d'une trace, en mètres (haversine par segment). */
export function trackDistance(track: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) {
    total += haversine(track[i - 1], track[i]);
  }
  return total;
}

function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
