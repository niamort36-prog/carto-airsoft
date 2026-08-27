import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ImportLayerDto } from './dto';
import { LayersService } from './layers.service';

/** Calques importés (§7.10) : GeoJSON ou KML, superposés au jeu. */
@ApiTags('layers')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId/layers')
export class LayersController {
  constructor(private readonly layers: LayersService) {}

  @Post('import')
  @ApiOperation({
    summary: 'Importer une préparation externe (GeoJSON ou KML)',
  })
  import(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: ImportLayerDto,
  ) {
    return this.layers.import(auth, gameId, dto.name, dto.content);
  }

  @Get()
  @ApiOperation({ summary: 'Calques de la partie' })
  list(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.layers.list(auth, gameId);
  }

  @Delete(':layerId')
  @ApiOperation({ summary: 'Retirer un calque et ses entités' })
  remove(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('layerId', ParseUUIDPipe) layerId: string,
  ) {
    return this.layers.remove(auth, gameId, layerId);
  }
}
