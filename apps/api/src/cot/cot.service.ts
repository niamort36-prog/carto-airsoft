import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import { mapObjects, objectives, teams } from '../db/schema';
import { GamesService } from '../games/games.service';
import { buildCotDocument, cotTypeFor, type CotEvent } from './cot';

/**
 * Export du tableau de situation au format CoT (§3), pour un client TAK ou
 * tout outil qui parle cette langue.
 *
 * Deux règles gouvernent ce qui sort :
 *
 *  - **Le masquage anti-triche s'applique ici comme ailleurs** (§2.1). Un
 *    joueur exporte SA vision : ses alliés avec leurs positions, jamais
 *    celles d'en face. Sans cela, brancher un client TAK deviendrait le
 *    moyen le plus simple de contourner l'arbitre.
 *  - **Chaque événement porte sa péremption.** Une position n'est valable
 *    que quelques minutes ; passé ce délai, un client TAK la grise de
 *    lui-même. C'est exactement le « membre ≠ connecté » du §2.4, dit dans
 *    le vocabulaire du format.
 */
@Injectable()
export class CotService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
  ) {}

  /** Fraîcheur d'une position exportée. */
  private static readonly POSITION_STALE_SECONDS = 120;

  /**
   * Vision d'un membre : ses alliés, les objets de carte, les drapeaux.
   * Les positions adverses sont absentes — pas masquées après coup, jamais
   * lues.
   */
  async forMember(auth: AuthenticatedUser, gameId: string): Promise<string> {
    const members = await this.gamesService.getMembers(auth, gameId);
    const now = new Date();
    const events: CotEvent[] = [];

    for (const m of members) {
      // `getMembers` a déjà retiré les coordonnées des autres camps : ce qui
      // reste est ce que ce joueur a le droit de voir.
      if (!m.lastPosition) continue;
      const seen = m.lastPositionAt ?? now;
      events.push({
        uid: `carto-member-${m.membershipId}`,
        type: cotTypeFor('marker', 'allied', 'unit'),
        time: seen,
        start: seen,
        stale: new Date(
          seen.getTime() + CotService.POSITION_STALE_SECONDS * 1000,
        ),
        how: 'm-g',
        point: { lat: m.lastPosition.y, lon: m.lastPosition.x },
        callsign: m.pseudo ?? m.email ?? 'Allié',
        remarks: `${m.role} · ${m.lifeStatus}`,
        group: m.teamId
          ? { name: m.teamId, role: 'Team Member' }
          : undefined,
        cartoIcon: `${m.unitType}_allied`,
      });
    }

    events.push(...(await this.objectEvents(gameId)));
    events.push(...(await this.objectiveEvents(gameId)));
    return buildCotDocument(events);
  }

  /**
   * Vision d'une intégration (clé d'API) : le terrain préparé et les
   * drapeaux, jamais les joueurs. Même règle que le reste de l'API
   * publique — une clé ne donne pas d'avantage de terrain.
   */
  async forApiKey(gameId: string): Promise<string> {
    const events = [
      ...(await this.objectEvents(gameId)),
      ...(await this.objectiveEvents(gameId)),
    ];
    return buildCotDocument(events);
  }

  /** Marqueurs, lignes et zones posés ou importés. */
  private async objectEvents(gameId: string): Promise<CotEvent[]> {
    const rows = await this.db
      .select()
      .from(mapObjects)
      .where(
        and(eq(mapObjects.gameId, gameId), isNull(mapObjects.deletedAt)),
      );

    return rows.map((row) => {
      const props = (row.properties ?? {}) as Record<string, unknown>;
      const icon = typeof props.icon === 'string' ? props.icon : null;
      const affiliation = affiliationOfIcon(icon);
      const geometry = row.geometry as
        | { type?: string; coordinates?: unknown }
        | null;

      return {
        uid: `carto-object-${row.id}`,
        type: cotTypeFor(row.kind, affiliation, familyOfIcon(icon)),
        time: row.createdAt,
        start: row.createdAt,
        // Un objet posé reste valable jusqu'à ce qu'on l'efface : sa
        // péremption est lointaine, contrairement à une position.
        stale: new Date(row.createdAt.getTime() + 24 * 3600 * 1000),
        how: 'h-e',
        point: { lat: row.position.y, lon: row.position.x },
        callsign:
          typeof props.unitLabel === 'string' ? props.unitLabel : undefined,
        links: linksFromGeometry(geometry),
        color: typeof props.color === 'string' ? props.color : undefined,
        cartoIcon: icon ?? undefined,
      } satisfies CotEvent;
    });
  }

  /** Drapeaux (§7.8) — sans leur jeton, qui ne sort jamais. */
  private async objectiveEvents(gameId: string): Promise<CotEvent[]> {
    const rows = await this.db
      .select({
        id: objectives.id,
        name: objectives.name,
        position: objectives.position,
        holderTeamId: objectives.holderTeamId,
        lastCapturedAt: objectives.lastCapturedAt,
        createdAt: objectives.createdAt,
        holderName: teams.name,
      })
      .from(objectives)
      .leftJoin(teams, eq(objectives.holderTeamId, teams.id))
      .where(eq(objectives.gameId, gameId));

    return rows.map((row) => ({
      uid: `carto-objective-${row.id}`,
      // Un objectif est un point d'intérêt, pas une unité.
      type: 'b-m-p-s-p-i',
      time: row.lastCapturedAt ?? row.createdAt,
      start: row.lastCapturedAt ?? row.createdAt,
      stale: new Date(Date.now() + 24 * 3600 * 1000),
      how: 'h-e',
      point: { lat: row.position.y, lon: row.position.x },
      callsign: row.name,
      remarks: row.holderName ? `tenu par ${row.holderName}` : 'neutre',
    }));
  }
}

/** Camp porté par un identifiant d'icône (`mortar_hostile` → hostile). */
function affiliationOfIcon(icon: string | null): string | null {
  if (!icon) return null;
  for (const a of ['allied', 'hostile', 'neutral', 'unknown']) {
    if (icon.endsWith(`_${a}`)) return a;
  }
  return null;
}

/**
 * Famille du symbole, devinée de son identifiant. Sans camp, c'est un point
 * d'ordre ; les structures partagent leurs noms avec le pack.
 */
function familyOfIcon(icon: string | null): 'unit' | 'structure' | 'point' {
  if (!icon) return 'point';
  if (affiliationOfIcon(icon) === null) return 'point';
  const slug = icon.replace(/_(allied|hostile|neutral|unknown)$/, '');
  const structures = ['bunker', 'fob', 'foxhole', 'outpost', 'roadblock'];
  return structures.includes(slug) ? 'structure' : 'unit';
}

/** Sommets d'une ligne ou d'une zone, en (lat, lon) comme l'attend CoT. */
function linksFromGeometry(
  geometry: { type?: string; coordinates?: unknown } | null,
): Array<[number, number]> | undefined {
  if (!geometry) return undefined;
  const coords = geometry.coordinates;
  if (geometry.type === 'LineString' && Array.isArray(coords)) {
    return coords
      .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
      .map(([lon, lat]) => [lat, lon] as [number, number]);
  }
  if (geometry.type === 'Polygon' && Array.isArray(coords)) {
    const ring = coords[0];
    if (!Array.isArray(ring)) return undefined;
    return ring
      .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
      .map(([lon, lat]) => [lat, lon] as [number, number]);
  }
  return undefined;
}
