import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, gt } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import { mapObjects, type MapObject } from '../db/schema';
import { GamesService } from '../games/games.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSIONS } from '../permissions/permissions';
import type { UpsertMapObjectDto } from './dto';

/** Vue d'un objet carte diffusée aux clients (REST et WebSocket). */
export interface MapObjectView {
  id: string;
  kind: string;
  markerType: string;
  lat: number;
  lng: number;
  /** GeoJSON LineString/Polygon pour les kinds line/zone. */
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
  authorMembershipId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const OBJECT_UPDATED_EVENT = 'object.updated';
export interface ObjectUpdatedEvent {
  gameId: string;
  object: MapObjectView;
}

@Injectable()
export class MapObjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Vidage de la file offline du client (§7.6). Idempotent sur l'id client ;
   * conflit résolu en « le dernier qui synchronise gagne » (updatedAt serveur).
   * Modifier/supprimer l'objet d'un autre est réservé à son auteur ou à un ORGA.
   */
  async batchUpsert(
    auth: AuthenticatedUser,
    gameId: string,
    dtos: UpsertMapObjectDto[],
  ): Promise<MapObjectView[]> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    // Qui peut toucher aux marqueurs des autres est une permission (§5),
    // pas un rôle en dur : configurable par partie.
    const canDeleteAny = await this.permissions.can(
      gameId,
      membership.role,
      PERMISSIONS.MARKERS_DELETE_ANY,
    );
    const results: MapObjectView[] = [];

    for (const dto of dtos) {
      const [existing] = await this.db
        .select()
        .from(mapObjects)
        .where(eq(mapObjects.id, dto.id));

      const kind = dto.kind ?? existing?.kind ?? 'marker';
      const { position, geometry } = this.normalizeGeometry(kind, dto);

      if (existing) {
        // Un id client appartient à une partie : pas de « télé-transport ».
        if (existing.gameId !== gameId) {
          throw new ForbiddenException('Objet rattaché à une autre partie');
        }
        if (existing.authorMembershipId !== membership.id && !canDeleteAny) {
          throw new ForbiddenException(
            'Seul l’auteur, ou un grade habilité, peut modifier cet objet',
          );
        }
        const [row] = await this.db
          .update(mapObjects)
          .set({
            markerType: dto.markerType ?? existing.markerType,
            position,
            geometry,
            properties: dto.properties ?? existing.properties,
            updatedAt: new Date(),
            deletedAt: dto.deleted ? new Date() : null,
          })
          .where(eq(mapObjects.id, dto.id))
          .returning();
        results.push(this.emit(gameId, row));
      } else {
        const [row] = await this.db
          .insert(mapObjects)
          .values({
            id: dto.id,
            gameId,
            authorMembershipId: membership.id,
            kind,
            markerType: dto.markerType ?? 'unit',
            position,
            geometry,
            properties: dto.properties ?? {},
            createdAt: new Date(dto.createdAt),
            deletedAt: dto.deleted ? new Date() : null,
          })
          .returning();
        results.push(this.emit(gameId, row));
      }
    }
    return results;
  }

  /**
   * Réconciliation inverse (§7.6) : « qu'est-ce qui a changé depuis ? ».
   * Renvoie créations, modifications ET tombstones après `since`, plus
   * `serverTime` à stocker comme prochain curseur.
   */
  async sync(
    auth: AuthenticatedUser,
    gameId: string,
    since?: string,
  ): Promise<{ serverTime: string; objects: MapObjectView[] }> {
    await this.gamesService.findActiveMembership(auth, gameId);
    const conditions = [eq(mapObjects.gameId, gameId)];
    if (since) {
      conditions.push(gt(mapObjects.updatedAt, new Date(since)));
    }
    const rows = await this.db
      .select()
      .from(mapObjects)
      .where(and(...conditions))
      .orderBy(mapObjects.updatedAt);
    return {
      serverTime: new Date().toISOString(),
      objects: rows.map((r) => this.toView(r)),
    };
  }

  private emit(gameId: string, row: MapObject): MapObjectView {
    const view = this.toView(row);
    const event: ObjectUpdatedEvent = { gameId, object: view };
    this.events.emit(OBJECT_UPDATED_EVENT, event);
    return view;
  }

  private toView(row: MapObject): MapObjectView {
    return {
      id: row.id,
      kind: row.kind,
      markerType: row.markerType,
      lng: row.position.x,
      lat: row.position.y,
      geometry: (row.geometry ?? null) as Record<string, unknown> | null,
      properties: (row.properties ?? {}) as Record<string, unknown>,
      authorMembershipId: row.authorMembershipId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

  /**
   * Valide la géométrie selon le kind (arbitre serveur, §2.1) :
   *  - marker : lat/lng requis → Point ;
   *  - line   : GeoJSON LineString d'au moins 2 sommets ;
   *  - zone   : GeoJSON Polygon dont l'anneau (≥ 4 sommets) est fermé.
   * Renvoie la position de référence (marqueur ou premier sommet).
   */
  private normalizeGeometry(
    kind: string,
    dto: UpsertMapObjectDto,
  ): { position: { x: number; y: number }; geometry: unknown } {
    const validPair = (p: unknown): p is [number, number] =>
      Array.isArray(p) &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      p[1] >= -90 &&
      p[1] <= 90 &&
      p[0] >= -180 &&
      p[0] <= 180;

    if (kind === 'marker') {
      if (typeof dto.lat !== 'number' || typeof dto.lng !== 'number') {
        throw new BadRequestException('marker : lat/lng requis');
      }
      return { position: { x: dto.lng, y: dto.lat }, geometry: null };
    }

    const g = dto.geometry as
      | { type?: string; coordinates?: unknown }
      | undefined;
    const expected = kind === 'line' ? 'LineString' : 'Polygon';
    if (!g || g.type !== expected || !Array.isArray(g.coordinates)) {
      throw new BadRequestException(`${kind} : géométrie ${expected} requise`);
    }
    const ring =
      kind === 'line'
        ? (g.coordinates as unknown[])
        : ((g.coordinates as unknown[])[0] as unknown[]);
    const minPoints = kind === 'line' ? 2 : 4;
    if (
      !Array.isArray(ring) ||
      ring.length < minPoints ||
      !ring.every(validPair)
    ) {
      throw new BadRequestException(`${kind} : sommets invalides`);
    }
    if (kind === 'zone') {
      const first = ring[0] as [number, number];
      const last = ring[ring.length - 1] as [number, number];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new BadRequestException('zone : l’anneau doit être fermé');
      }
    }
    const [lng, lat] = ring[0] as [number, number];
    return { position: { x: lng, y: lat }, geometry: g };
  }
}
