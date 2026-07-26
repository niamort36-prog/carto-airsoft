import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SupabaseTokenService,
  type AuthenticatedUser,
} from './supabase-token.service';

export type { AuthenticatedUser } from './supabase-token.service';

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/** Garde HTTP : vérifie le Bearer Supabase et attache l'identité à la requête. */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly tokens: SupabaseTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Jeton d’authentification manquant');
    }
    request.user = await this.tokens.verify(header.slice('Bearer '.length));
    return true;
  }
}
