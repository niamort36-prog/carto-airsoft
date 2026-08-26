import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ResolvedApiKey } from './api-keys.service';
import type { ApiKeyRequest } from './api-key.guard';

/** Injecte la clé reconnue (posée par ApiKeyGuard) dans un handler. */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedApiKey =>
    context.switchToHttp().getRequest<ApiKeyRequest>().apiKey,
);
