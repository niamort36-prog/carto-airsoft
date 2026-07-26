import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** Identité extraite d'un JWT Supabase valide. */
export interface AuthenticatedUser {
  /** Claim `sub` : identifiant de l'utilisateur chez Supabase Auth. */
  authProviderId: string;
  email?: string;
}

/**
 * Vérification des jetons Supabase Auth — partagée entre la garde HTTP
 * et la gateway temps réel. Deux modes selon le projet Supabase :
 *  - SUPABASE_JWT_SECRET défini → HS256 (« legacy JWT secret ») ;
 *  - sinon SUPABASE_URL → clés asymétriques via le JWKS public du projet.
 */
@Injectable()
export class SupabaseTokenService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!secret && !supabaseUrl) {
      throw new InternalServerErrorException(
        'Auth non configurée : définir SUPABASE_JWT_SECRET ou SUPABASE_URL',
      );
    }
    const audience =
      this.config.get<string>('SUPABASE_JWT_AUD') ?? 'authenticated';

    let payload: JWTPayload;
    try {
      if (secret) {
        ({ payload } = await jwtVerify(
          token,
          new TextEncoder().encode(secret),
          { audience },
        ));
      } else {
        this.jwks ??= createRemoteJWKSet(
          new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
        );
        ({ payload } = await jwtVerify(token, this.jwks, { audience }));
      }
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Jeton sans identifiant utilisateur');
    }
    return {
      authProviderId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  }
}
