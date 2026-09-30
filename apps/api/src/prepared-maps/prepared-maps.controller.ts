import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import {
  AttachPreparedMapDto,
  CreatePreparedMapDto,
  UpdatePreparedMapDto,
} from './dto';
import { PreparedMapsService } from './prepared-maps.service';

/**
 * Cartes préparées (§8) : un terrain dessiné une fois, réutilisable d'une
 * partie à l'autre. Elles appartiennent à leur auteur, pas à une partie.
 */
@ApiTags('maps')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class PreparedMapsController {
  constructor(private readonly maps: PreparedMapsService) {}

  @Get('maps')
  @ApiOperation({ summary: 'Mes cartes préparées' })
  list(@CurrentUser() auth: AuthenticatedUser) {
    return this.maps.list(auth);
  }

  @Post('maps')
  @ApiOperation({ summary: 'Créer une carte préparée' })
  create(
    @CurrentUser() auth: AuthenticatedUser,
    @Body() dto: CreatePreparedMapDto,
  ) {
    return this.maps.create(auth, dto);
  }

  @Get('maps/:mapId')
  @ApiOperation({ summary: 'Une carte, avec ses dessins et ses drapeaux' })
  get(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('mapId', ParseUUIDPipe) mapId: string,
  ) {
    return this.maps.get(auth, mapId);
  }

  @Patch('maps/:mapId')
  @ApiOperation({
    summary:
      'Modifier une carte. `content` remplace intégralement dessins et ' +
      'drapeaux — la console envoie l’état complet.',
  })
  update(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('mapId', ParseUUIDPipe) mapId: string,
    @Body() dto: UpdatePreparedMapDto,
  ) {
    return this.maps.update(auth, mapId, dto);
  }

  @Delete('maps/:mapId')
  // Rien à renvoyer : 204 le dit, là où un 200 au corps vide oblige
  // l'appelant à deviner.
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Supprimer une carte. Les parties déjà montées gardent leur ' +
      'contenu : il avait été recopié.',
  })
  remove(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('mapId', ParseUUIDPipe) mapId: string,
  ) {
    return this.maps.remove(auth, mapId);
  }

  @Post('games/:gameId/map')
  @ApiOperation({
    summary:
      'Associer une carte à une partie : son contenu y est RECOPIÉ. ' +
      '`mapId` à null détache sans rien effacer.',
  })
  attach(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: AttachPreparedMapDto,
  ) {
    if (dto.mapId == null) {
      return this.maps.detachFromGame(auth, gameId);
    }
    return this.maps.attachToGame(auth, gameId, dto.mapId);
  }
}
