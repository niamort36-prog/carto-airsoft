import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import { mapLayers, mapObjects, type MapLayer } from '../db/schema';
import { GamesService } from '../games/games.service';
import {
  OBJECT_UPDATED_EVENT,
  type ObjectUpdatedEvent,
} from '../map-objects/map-objects.service';
import { PERMISSIONS } from '../permissions/permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { detectFormat, LayerParseError, parseLayer } from './parse';

export interface LayerView {
  id: string;
  name: string;
  format: string;
  featureCount: number;
  importedByMembershipId: string;
  createdAt: Date;
}

/**
 * Import de préparations externes (§7.10) : map.army, QGIS, Google Earth.
 *
 * Le calque n'est qu'une étiquette. Les entités deviennent des objets de
 * carte ordinaires, ce qui leur donne gratuitement la synchronisation
 * offline (§7.6), la diffusion temps réel et la suppression par pierre
 * tombale — et les mélange aux données de jeu, comme le veut le §7.10.
 */
@Injectable()
export class LayersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gamesService: GamesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  async import(
    auth: AuthenticatedUser,
    gameId: string,
    name: string,
    content: string,
  ): Promise<LayerView> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    // Déposer un calque, c'est modifier le terrain de tout le monde :
    // même permission que la préparation de partie.
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    let format: 'geojson' | 'kml' | 'cot';
    let features;
    try {
      format = detectFormat(content);
      features = parseLayer(content, format);
    } catch (error) {
      if (error instanceof LayerParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const now = new Date();
    const [layer] = await this.db
      .insert(mapLayers)
      .values({
        gameId,
        name,
        format,
        featureCount: features.length,
        importedByMembershipId: membership.id,
      })
      .returning();

    const rows = await this.db
      .insert(mapObjects)
      .values(
        features.map((f) => ({
          id: randomUUID(),
          gameId,
          authorMembershipId: membership.id,
          kind: f.kind,
          markerType: 'poi' as const,
          position: { x: f.lng, y: f.lat },
          geometry: f.geometry,
          properties: {
            layerId: layer.id,
            layerName: name,
            // Le CoT sait dire l'affiliation, pas le GeoJSON ni le KML :
            // à défaut, un point de passage neutre est le repli honnête.
            ...(f.kind === 'marker'
              ? { icon: f.icon ?? 'waypoint' }
              : {}),
            ...(f.label ? { unitLabel: f.label } : {}),
            ...(f.color ? { color: f.color } : {}),
          },
          createdAt: now,
        })),
      )
      .returning();

    // Les téléphones connectés voient le calque arriver sans rien demander.
    for (const row of rows) {
      this.events.emit(OBJECT_UPDATED_EVENT, {
        gameId,
        object: {
          id: row.id,
          kind: row.kind,
          markerType: row.markerType,
          lat: row.position.y,
          lng: row.position.x,
          geometry: (row.geometry ?? null) as Record<string, unknown> | null,
          properties: (row.properties ?? {}) as Record<string, unknown>,
          authorMembershipId: row.authorMembershipId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt,
        },
      } satisfies ObjectUpdatedEvent);
    }

    return LayersService.toView(layer);
  }

  async list(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<LayerView[]> {
    await this.gamesService.findActiveMembership(auth, gameId);
    const rows = await this.db
      .select()
      .from(mapLayers)
      .where(and(eq(mapLayers.gameId, gameId), isNull(mapLayers.deletedAt)))
      .orderBy(mapLayers.createdAt);
    return rows.map(LayersService.toView);
  }

  /**
   * Retire un calque. Ses entités reçoivent une pierre tombale plutôt que
   * d'être effacées : c'est ce qui fait disparaître le calque des téléphones
   * déjà synchronisés, y compris ceux qui étaient hors ligne pendant
   * l'opération (§7.6).
   */
  async remove(
    auth: AuthenticatedUser,
    gameId: string,
    layerId: string,
  ): Promise<{ removed: number }> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);

    const [layer] = await this.db
      .select()
      .from(mapLayers)
      .where(and(eq(mapLayers.id, layerId), eq(mapLayers.gameId, gameId)));
    if (!layer || layer.deletedAt) {
      throw new NotFoundException('Calque introuvable');
    }

    const now = new Date();
    const rows = await this.db
      .update(mapObjects)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(mapObjects.gameId, gameId),
          isNull(mapObjects.deletedAt),
          sql`${mapObjects.properties} ->> 'layerId' = ${layerId}`,
        ),
      )
      .returning();

    await this.db
      .update(mapLayers)
      .set({ deletedAt: now })
      .where(eq(mapLayers.id, layerId));

    for (const row of rows) {
      this.events.emit(OBJECT_UPDATED_EVENT, {
        gameId,
        object: {
          id: row.id,
          kind: row.kind,
          markerType: row.markerType,
          lat: row.position.y,
          lng: row.position.x,
          geometry: (row.geometry ?? null) as Record<string, unknown> | null,
          properties: (row.properties ?? {}) as Record<string, unknown>,
          authorMembershipId: row.authorMembershipId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt,
        },
      } satisfies ObjectUpdatedEvent);
    }

    return { removed: rows.length };
  }

  private static toView(row: MapLayer): LayerView {
    return {
      id: row.id,
      name: row.name,
      format: row.format,
      featureCount: row.featureCount,
      importedByMembershipId: row.importedByMembershipId,
      createdAt: row.createdAt,
    };
  }
}
