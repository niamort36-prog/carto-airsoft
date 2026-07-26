import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { SupabaseAuthGuard, type AuthenticatedRequest } from './supabase-auth.guard';
import { SupabaseTokenService } from './supabase-token.service';

const TEST_SECRET = 'secret-de-test-suffisamment-long-pour-hs256';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeGuard(values: Record<string, string | undefined>): SupabaseAuthGuard {
  return new SupabaseAuthGuard(new SupabaseTokenService(makeConfig(values)));
}

function makeContext(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = { headers: { authorization } } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

async function signToken(
  claims: Record<string, unknown>,
  options: { secret?: string; expired?: boolean } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt();
  jwt.setExpirationTime(options.expired ? '-1h' : '1h');
  return jwt.sign(new TextEncoder().encode(options.secret ?? TEST_SECRET));
}

describe('SupabaseAuthGuard (mode HS256)', () => {
  let guard: SupabaseAuthGuard;

  beforeEach(() => {
    guard = makeGuard({ SUPABASE_JWT_SECRET: TEST_SECRET });
  });

  it('accepte un jeton valide et attache l’utilisateur à la requête', async () => {
    const token = await signToken({ sub: 'user-123', email: 'j@ex.fr' });
    const { context, request } = makeContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ authProviderId: 'user-123', email: 'j@ex.fr' });
  });

  it('rejette une requête sans en-tête Authorization', async () => {
    const { context } = makeContext(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un jeton signé avec un autre secret', async () => {
    const token = await signToken(
      { sub: 'user-123' },
      { secret: 'un-mauvais-secret-egalement-assez-long' },
    );
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un jeton expiré', async () => {
    const token = await signToken({ sub: 'user-123' }, { expired: true });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un jeton sans claim sub', async () => {
    const token = await signToken({ email: 'j@ex.fr' });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signale une configuration manquante (ni secret ni URL)', async () => {
    const unconfigured = makeGuard({});
    const token = await signToken({ sub: 'user-123' });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(unconfigured.canActivate(context)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
