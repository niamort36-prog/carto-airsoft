import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard, RequireScope } from '../api-keys/api-key.guard';
import { ApiKeysService, type ResolvedApiKey } from '../api-keys/api-keys.service';
import { CurrentApiKey } from '../api-keys/current-api-key.decorator';
import { SetGameStatusDto } from './dto';
import { PublicApiService } from './public-api.service';

/**
 * API publique (§7.11) — la porte des intégrations : affichage de scores,
 * site du club, pupitre d'organisation.
 *
 * Deux garanties tiennent quelle que soit la portée de la clé :
 *  - aucune position de joueur ne sort par ici (§2.1) ;
 *  - aucun jeton de QR (invitation, objectif, bonus) n'est divulgué.
 * Une clé volée fait donc perdre de la confidentialité d'organisation,
 * jamais l'équité d'une partie en cours.
 */
@ApiTags('public')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('public/games/:gameId')
export class PublicApiController {
  constructor(
    private readonly api: PublicApiService,
    private readonly keys: ApiKeysService,
  ) {}

  @Get()
  @RequireScope('read')
  @ApiOperation({ summary: 'État de la partie' })
  async game(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'read');
    return this.api.game(gameId);
  }

  @Get('scores')
  @RequireScope('read')
  @ApiOperation({ summary: 'Scores par équipe' })
  async scores(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'read');
    return this.api.scores(gameId);
  }

  @Get('objectives')
  @RequireScope('read')
  @ApiOperation({
    summary: 'Objectifs et détenteurs (sans les jetons des QR physiques)',
  })
  async objectives(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'read');
    return this.api.objectivesOf(gameId);
  }

  @Get('members')
  @RequireScope('read')
  @ApiOperation({
    summary: 'Composition des équipes — jamais les positions (§2.1)',
  })
  async members(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'read');
    return this.api.membersOf(gameId);
  }

  @Get('captures')
  @RequireScope('read')
  @ApiOperation({ summary: 'Historique des captures' })
  async captures(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'read');
    return this.api.captures(gameId);
  }

  @Patch('status')
  @RequireScope('write')
  @ApiOperation({ summary: 'Lancer ou arrêter la partie' })
  async setStatus(
    @CurrentApiKey() key: ResolvedApiKey,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: SetGameStatusDto,
  ) {
    await this.keys.assertGameAccess(key, gameId, 'write');
    return this.api.setStatus(gameId, dto.status);
  }
}
