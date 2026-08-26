import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeysService, type ResolvedApiKey } from './api-keys.service';
import { scopeSatisfies, type ApiScope } from './dto';

export type ApiKeyRequest = Request & { apiKey: ResolvedApiKey };

export const API_SCOPE_KEY = 'api-scope';

/**
 * Portée exigée par une route publique. Sans elle, la route n'est pas
 * atteignable : on préfère une route inaccessible à une route ouverte par
 * oubli.
 */
export const RequireScope = (scope: ApiScope) =>
  SetMetadata(API_SCOPE_KEY, scope);

/**
 * Garde des routes ouvertes aux intégrations (§7.11).
 *
 * La clé est lue dans `X-API-Key`, ou dans `Authorization: Bearer ca_…` pour
 * les clients qui ne savent envoyer qu'un en-tête standard. La portée est
 * vérifiée ici ; la partie visée l'est dans le contrôleur, qui seul connaît
 * l'identifiant demandé.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const token = ApiKeyGuard.extract(request);
    if (!token) {
      throw new UnauthorizedException(
        'Clé d’API manquante (en-tête X-API-Key)',
      );
    }

    const key = await this.keys.verify(token);
    const required = this.reflector.getAllAndOverride<ApiScope | undefined>(
      API_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || !scopeSatisfies(key.scopes, required)) {
      throw new UnauthorizedException(
        `Cette clé n’a pas la portée « ${required ?? 'inconnue'} »`,
      );
    }

    request.apiKey = key;
    return true;
  }

  private static extract(request: Request): string | null {
    const header = request.headers['x-api-key'];
    if (typeof header === 'string' && header.length > 0) return header;
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ca_')) return auth.slice('Bearer '.length);
    return null;
  }
}
