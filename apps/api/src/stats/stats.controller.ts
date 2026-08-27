import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import { StatsService } from './stats.service';

/** Statistiques et rejeu de fin de partie (Phase 5). */
@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Bilan de la partie — disponible une fois terminée',
  })
  gameStats(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.stats.stats(auth, gameId);
  }

  @Get('replay')
  @ApiOperation({
    summary: 'Rejeu : traces de toutes les unités et événements horodatés',
  })
  replay(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.stats.replay(auth, gameId);
  }

  @Get('my-track')
  @ApiOperation({
    summary: 'Ma propre trace — consultable même partie en cours',
  })
  myTrack(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.stats.myTrack(auth, gameId);
  }
}
