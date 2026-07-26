import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import { BatchUpsertDto } from './dto';
import { MapObjectsService } from './map-objects.service';

@ApiTags('map-objects')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId')
export class MapObjectsController {
  constructor(private readonly mapObjects: MapObjectsService) {}

  @Post('map-objects/batch')
  @ApiOperation({
    summary: 'Pousser un lot d’objets carte (idempotent sur l’id client, §7.6)',
  })
  batch(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: BatchUpsertDto,
  ) {
    return this.mapObjects.batchUpsert(auth, gameId, dto.objects);
  }

  @Get('sync')
  @ApiOperation({
    summary: 'Delta de synchro : tout ce qui a changé depuis `since` (§7.6)',
  })
  @ApiQuery({ name: 'since', required: false, description: 'Curseur ISO 8601' })
  sync(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Query('since') since?: string,
  ) {
    return this.mapObjects.sync(auth, gameId, since);
  }
}
