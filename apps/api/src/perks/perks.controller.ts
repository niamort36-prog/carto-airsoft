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
import { ActivatePerkDto, CreatePerkDto, UpdatePerkDto } from './dto';
import { PerksService } from './perks.service';

@ApiTags('perks')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId/perks')
export class PerksController {
  constructor(private readonly perks: PerksService) {}

  @Post()
  @ApiOperation({ summary: 'Configurer un perk pour la partie (§7.7)' })
  create(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreatePerkDto,
  ) {
    return this.perks.createDefinition(auth, gameId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Perks disponibles, avec stock et recharge de MON équipe',
  })
  list(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.perks.list(auth, gameId);
  }

  @Patch(':definitionId')
  @ApiOperation({
    summary:
      'Régler un bonus déjà posé. Sans cette route, changer un réglage ' +
      'obligerait à en créer un second.',
  })
  update(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: UpdatePerkDto,
  ) {
    return this.perks.updateDefinition(auth, gameId, definitionId, dto);
  }

  @Delete(':definitionId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Retirer un bonus de la partie. Refusé tant qu’un survol est en ' +
      'cours : il changerait sous les pieds de celui qui l’utilise.',
  })
  remove(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
  ) {
    return this.perks.removeDefinition(auth, gameId, definitionId);
  }

  @Post(':definitionId/activate')
  @ApiOperation({
    summary:
      'Activer un perk sur une zone. Le serveur valide grade, stock et ' +
      'recharge, puis calcule le résultat — le client ne décide de rien.',
  })
  activate(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: ActivatePerkDto,
  ) {
    return this.perks.activate(auth, gameId, definitionId, dto);
  }
}
