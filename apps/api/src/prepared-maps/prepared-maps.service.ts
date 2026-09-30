import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import { games, mapObjects, preparedMaps } from '../db/schema';
import { GamesService } from '../games/games.service';
import { ObjectivesService } from '../objectives/objectives.service';
import { PERMISSIONS } from '../permissions/permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import type {
  CreatePreparedMapDto,
  UpdatePreparedMapDto,
} from './dto';

export interface PreparedMapView {
  id: string;
  name: string;
  basemap: string;
  centerLat: number | null;
  centerLng: number | null;
  zoom: number | null;
  /** Ce que la carte porte, sans le détail — pour la liste. */
  objectCount: number;
  objectiveCount: number;
  updatedAt: Date;
}

export interface PreparedMapDetail extends PreparedMapView {
  content: Record<string, unknown>;
}

/** Un dessin tel qu'une carte préparée le stocke. */
interface StoredObject {
  kind?: string;
  markerType?: string;
  lat: number;
  lng: number;
  geometry?: unknown;
  properties?: Record<string, unknown>;
}

interface StoredObjective {
  name: string;
  lat: number;
  lng: number;
  captureOrder?: number | null;
}

/**
 * Cartes préparées (§8) : un terrain dessiné une fois, réutilisable.
 *
 * Une carte n'appartient à aucune partie — elle appartient à son auteur, et
 * survit aux parties qu'elle a servi à monter. C'est toute la différence
 * avec les objets de carte, qui meurent avec la partie.
 */
@Injectable()
export class PreparedMapsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly gamesService: GamesService,
    private readonly objectives: ObjectivesService,
    private readonly permissions: PermissionsService,
  ) {}

  private static toView(row: typeof preparedMaps.$inferSelect): PreparedMapView {
    const content = (row.content ?? {}) as {
      objects?: unknown[];
      objectives?: unknown[];
    };
    return {
      id: row.id,
      name: row.name,
      basemap: row.basemap,
      centerLat: row.centerLat,
      centerLng: row.centerLng,
      zoom: row.zoom,
      objectCount: content.objects?.length ?? 0,
      objectiveCount: content.objectives?.length ?? 0,
      updatedAt: row.updatedAt,
    };
  }

  async list(auth: AuthenticatedUser): Promise<PreparedMapView[]> {
    const user = await this.usersService.getOrCreate(auth);
    const rows = await this.db
      .select()
      .from(preparedMaps)
      .where(eq(preparedMaps.ownerUserId, user.id))
      .orderBy(desc(preparedMaps.updatedAt));
    return rows.map(PreparedMapsService.toView);
  }

  async create(
    auth: AuthenticatedUser,
    dto: CreatePreparedMapDto,
  ): Promise<PreparedMapDetail> {
    const user = await this.usersService.getOrCreate(auth);
    const [row] = await this.db
      .insert(preparedMaps)
      .values({
        ownerUserId: user.id,
        name: dto.name,
        basemap: dto.basemap ?? 'plan_ign',
        content: { objects: [], objectives: [] },
      })
      .returning();
    return { ...PreparedMapsService.toView(row), content: row.content as Record<string, unknown> };
  }

  /** Charge une carte en vérifiant qu'elle appartient bien au demandeur. */
  private async mine(
    auth: AuthenticatedUser,
    mapId: string,
  ): Promise<typeof preparedMaps.$inferSelect> {
    const user = await this.usersService.getOrCreate(auth);
    const [row] = await this.db
      .select()
      .from(preparedMaps)
      .where(
        and(eq(preparedMaps.id, mapId), eq(preparedMaps.ownerUserId, user.id)),
      );
    if (!row) throw new NotFoundException('Carte introuvable');
    return row;
  }

  async get(
    auth: AuthenticatedUser,
    mapId: string,
  ): Promise<PreparedMapDetail> {
    const row = await this.mine(auth, mapId);
    return {
      ...PreparedMapsService.toView(row),
      content: row.content as Record<string, unknown>,
    };
  }

  async update(
    auth: AuthenticatedUser,
    mapId: string,
    dto: UpdatePreparedMapDto,
  ): Promise<PreparedMapDetail> {
    await this.mine(auth, mapId);
    const [row] = await this.db
      .update(preparedMaps)
      .set({
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.basemap != null ? { basemap: dto.basemap } : {}),
        ...(dto.content != null ? { content: dto.content } : {}),
        ...(dto.centerLat != null ? { centerLat: dto.centerLat } : {}),
        ...(dto.centerLng != null ? { centerLng: dto.centerLng } : {}),
        ...(dto.zoom != null ? { zoom: dto.zoom } : {}),
        updatedAt: new Date(),
      })
      .where(eq(preparedMaps.id, mapId))
      .returning();
    return {
      ...PreparedMapsService.toView(row),
      content: row.content as Record<string, unknown>,
    };
  }

  async remove(auth: AuthenticatedUser, mapId: string): Promise<void> {
    await this.mine(auth, mapId);
    // Les parties déjà montées gardent leur contenu : il a été RECOPIÉ.
    // On coupe seulement le lien de provenance.
    await this.db
      .update(games)
      .set({ preparedMapId: null })
      .where(eq(games.preparedMapId, mapId));
    await this.db.delete(preparedMaps).where(eq(preparedMaps.id, mapId));
  }

  /**
   * Recopie une carte dans une partie.
   *
   * RECOPIE, et non référence : ce qui se passe en partie — un drapeau
   * capturé, un marqueur déplacé — ne doit jamais remonter dans le modèle.
   * Et modifier le modèle plus tard ne doit pas changer une partie en
   * cours sous les pieds de ceux qui la jouent.
   */
  async attachToGame(
    auth: AuthenticatedUser,
    gameId: string,
    mapId: string,
  ): Promise<{ objects: number; objectives: number }> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(
      membership,
      PERMISSIONS.GAME_MANAGE,
      'Votre grade ne permet pas de choisir la carte de la partie',
    );

    const carte = await this.mine(auth, mapId);
    const content = (carte.content ?? {}) as {
      objects?: StoredObject[];
      objectives?: StoredObjective[];
    };

    const objets = content.objects ?? [];
    if (objets.length > 0) {
      await this.db.insert(mapObjects).values(
        objets.map((o) => {
          if (typeof o.lat !== 'number' || typeof o.lng !== 'number') {
            throw new BadRequestException('Carte mal formée : position absente');
          }
          return {
            id: randomUUID(),
            gameId,
            authorMembershipId: membership.id,
            kind: (o.kind ?? 'marker') as 'marker' | 'line' | 'zone',
            markerType: (o.markerType ?? 'poi') as 'unit' | 'waypoint' | 'poi',
            position: { x: o.lng, y: o.lat },
            geometry: o.geometry ?? null,
            properties: o.properties ?? {},
            createdAt: new Date(),
          };
        }),
      );
    }

    // Les drapeaux passent par leur service : chacun doit recevoir son
    // propre jeton de capture, qu'un simple copier-coller ne produirait pas.
    let drapeaux = 0;
    for (const d of content.objectives ?? []) {
      await this.objectives.createObjective(auth, gameId, {
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        ...(d.captureOrder != null ? { captureOrder: d.captureOrder } : {}),
      });
      drapeaux += 1;
    }

    await this.db
      .update(games)
      .set({ preparedMapId: mapId })
      .where(eq(games.id, gameId));

    return { objects: objets.length, objectives: drapeaux };
  }

  /** Coupe le lien de provenance, sans toucher à ce qui a été recopié. */
  async detachFromGame(
    auth: AuthenticatedUser,
    gameId: string,
  ): Promise<void> {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(membership, PERMISSIONS.GAME_MANAGE);
    const [game] = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new NotFoundException('Partie introuvable');
    if (game.ownerUserId !== membership.userId) {
      throw new ForbiddenException('Seul le créateur détache la carte');
    }
    await this.db
      .update(games)
      .set({ preparedMapId: null })
      .where(eq(games.id, gameId));
  }
}
