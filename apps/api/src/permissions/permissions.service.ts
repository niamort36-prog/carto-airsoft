import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/db.module';
import { games, type Membership } from '../db/schema';
import {
  effectivePermissions,
  fullMatrix,
  hasPermission,
  type Permission,
  type PermissionOverrides,
} from './permissions';

/**
 * Point d'entrée unique des autorisations (§5). Toute la logique métier
 * demande « ce membre a-t-il telle permission ? » et jamais « ce membre
 * est-il commandant ? » — c'est ce qui rend la matrice configurable.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async overrides(gameId: string): Promise<PermissionOverrides> {
    const [game] = await this.db
      .select({ settings: games.settings })
      .from(games)
      .where(eq(games.id, gameId));
    const settings = (game?.settings ?? {}) as {
      permissions?: PermissionOverrides;
    };
    return settings.permissions ?? {};
  }

  async can(
    gameId: string,
    role: string,
    permission: Permission,
  ): Promise<boolean> {
    return hasPermission(role, permission, await this.overrides(gameId));
  }

  /** Lève un 403 explicite si la permission manque. */
  async assert(
    membership: Pick<Membership, 'gameId' | 'role'>,
    permission: Permission,
    message?: string,
  ): Promise<void> {
    const allowed = await this.can(
      membership.gameId,
      membership.role,
      permission,
    );
    if (!allowed) {
      throw new ForbiddenException(
        message ?? `Votre grade n’a pas la permission « ${permission} »`,
      );
    }
  }

  async forRole(gameId: string, role: string): Promise<Permission[]> {
    return effectivePermissions(role, await this.overrides(gameId));
  }

  async matrix(gameId: string): Promise<Record<string, Permission[]>> {
    return fullMatrix(await this.overrides(gameId));
  }

  /** Enregistre les surcharges d'un rôle (fusion, pas remplacement). */
  async setOverrides(
    gameId: string,
    role: string,
    changes: Partial<Record<Permission, boolean>>,
  ): Promise<Record<string, Permission[]>> {
    const current = await this.overrides(gameId);
    const merged: PermissionOverrides = {
      ...current,
      [role]: { ...(current[role] ?? {}), ...changes },
    };
    const [game] = await this.db
      .select({ settings: games.settings })
      .from(games)
      .where(eq(games.id, gameId));
    await this.db
      .update(games)
      .set({
        settings: {
          ...((game?.settings ?? {}) as Record<string, unknown>),
          permissions: merged,
        },
      })
      .where(eq(games.id, gameId));
    return fullMatrix(merged);
  }
}
