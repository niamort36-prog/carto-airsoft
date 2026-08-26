import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthenticatedUser } from '../auth/supabase-token.service';
import { DRIZZLE, type Database } from '../db/db.module';
import { apiKeys, games, type ApiKey } from '../db/schema';
import { UsersService } from '../users/users.service';
import { scopeSatisfies, type ApiScope, type CreateApiKeyDto } from './dto';

/** Vue d'une clé — jamais le secret, qui n'existe qu'à la création. */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  gameIds: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Clé reconnue, telle que la garde la transmet aux contrôleurs. */
export interface ResolvedApiKey {
  id: string;
  ownerUserId: string;
  scopes: string[];
  gameIds: string[];
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly usersService: UsersService,
  ) {}

  /** `ca_` pour Carto Airsoft, puis 8 caractères qui identifient la clé. */
  private static readonly PREFIX_LENGTH = 8;

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Crée une clé et rend le secret UNE SEULE FOIS. Ni la base ni les
   * journaux ne le reverront : seule son empreinte est conservée, comme
   * pour les jetons d'invitation (§7.2).
   */
  async create(
    auth: AuthenticatedUser,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyView & { token: string }> {
    const user = await this.usersService.getOrCreate(auth);

    // Une clé ne peut être limitée qu'à des parties dont on est propriétaire :
    // sinon elle servirait à observer la partie d'un tiers.
    for (const gameId of dto.gameIds ?? []) {
      const [game] = await this.db
        .select({ ownerUserId: games.ownerUserId })
        .from(games)
        .where(eq(games.id, gameId));
      if (!game) throw new NotFoundException(`Partie inconnue : ${gameId}`);
      if (game.ownerUserId !== user.id) {
        throw new ForbiddenException(
          'Vous ne pouvez ouvrir une clé que sur vos propres parties',
        );
      }
    }

    const secret = randomBytes(24).toString('base64url');
    const prefix = `ca_${randomBytes(6)
      .toString('base64url')
      .slice(0, ApiKeysService.PREFIX_LENGTH)}`;
    const token = `${prefix}.${secret}`;

    const [row] = await this.db
      .insert(apiKeys)
      .values({
        ownerUserId: user.id,
        name: dto.name,
        prefix,
        tokenHash: ApiKeysService.hash(token),
        scopes: dto.scopes,
        gameIds: dto.gameIds ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .returning();

    return { ...ApiKeysService.toView(row), token };
  }

  async list(auth: AuthenticatedUser): Promise<ApiKeyView[]> {
    const user = await this.usersService.getOrCreate(auth);
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ownerUserId, user.id));
    return rows.map(ApiKeysService.toView);
  }

  /**
   * Révocation immédiate et définitive. La ligne est conservée : savoir
   * qu'une clé a existé, et quand elle a servi pour la dernière fois, fait
   * partie de ce qu'on veut pouvoir relire après coup.
   */
  async revoke(auth: AuthenticatedUser, keyId: string): Promise<void> {
    const user = await this.usersService.getOrCreate(auth);
    const [row] = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.ownerUserId, user.id)))
      .returning();
    if (!row) throw new NotFoundException('Clé introuvable');
  }

  /**
   * Reconnaît une clé présentée par un appelant. Le préfixe sert à trouver
   * la ligne ; l'empreinte est comparée en temps constant pour ne rien
   * laisser filtrer par la durée de la réponse.
   */
  async verify(token: string): Promise<ResolvedApiKey> {
    const prefix = token.split('.')[0];
    if (!prefix) throw new UnauthorizedException('Clé d’API invalide');

    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.prefix, prefix));
    if (!row) throw new UnauthorizedException('Clé d’API invalide');

    const expected = Buffer.from(row.tokenHash, 'hex');
    const actual = Buffer.from(ApiKeysService.hash(token), 'hex');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Clé d’API invalide');
    }
    if (row.revokedAt) throw new UnauthorizedException('Clé révoquée');
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Clé expirée');
    }

    // Dernier usage : utile pour repérer une clé oubliée dans un script.
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id));

    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      scopes: row.scopes,
      gameIds: row.gameIds,
    };
  }

  /**
   * Porte d'entrée d'une partie : la clé doit avoir la portée demandée ET
   * viser cette partie. Le lien avec le propriétaire est revérifié ici, si
   * bien qu'une clé ne suit jamais une partie qui aurait changé de mains.
   */
  async assertGameAccess(
    key: ResolvedApiKey,
    gameId: string,
    required: ApiScope,
  ): Promise<void> {
    if (!scopeSatisfies(key.scopes, required)) {
      throw new ForbiddenException(
        `Cette clé n’a pas la portée « ${required} »`,
      );
    }
    if (key.gameIds.length > 0 && !key.gameIds.includes(gameId)) {
      throw new ForbiddenException('Cette clé ne couvre pas cette partie');
    }
    const [game] = await this.db
      .select({ ownerUserId: games.ownerUserId })
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new NotFoundException('Partie introuvable');
    if (game.ownerUserId !== key.ownerUserId) {
      throw new ForbiddenException('Cette clé ne couvre pas cette partie');
    }
  }

  private static toView(row: ApiKey): ApiKeyView {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      gameIds: row.gameIds,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }
}
