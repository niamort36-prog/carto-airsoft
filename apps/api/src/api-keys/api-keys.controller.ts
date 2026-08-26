import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';

/**
 * Gestion des clés (§7.11). Ces routes-ci s'authentifient normalement, avec
 * un compte : on ne crée pas une clé avec une clé.
 */
@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer une clé d’API — le secret n’est affiché qu’ici',
  })
  create(@CurrentUser() auth: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(auth, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mes clés (sans les secrets)' })
  list(@CurrentUser() auth: AuthenticatedUser) {
    return this.keys.list(auth);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer une clé, immédiatement et sans retour' })
  revoke(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.keys.revoke(auth, id);
  }
}
