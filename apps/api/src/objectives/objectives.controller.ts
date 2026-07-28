import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { InvitesService } from '../invites/invites.service';
import { CreateBonusDto, CreateObjectiveDto, ScanDto } from './dto';
import { ObjectivesService } from './objectives.service';

@ApiTags('objectives')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class ObjectivesController {
  constructor(
    private readonly objectives: ObjectivesService,
    private readonly invites: InvitesService,
  ) {}

  @Post('games/:gameId/objectives')
  @ApiOperation({
    summary:
      'Poser un drapeau (§7.8). Le jeton de son QR physique n’est renvoyé ' +
      'qu’ici, une seule fois.',
  })
  createObjective(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreateObjectiveDto,
  ) {
    return this.objectives.createObjective(auth, gameId, dto);
  }

  @Get('games/:gameId/objectives')
  @ApiOperation({ summary: 'Objectifs de la partie et leur détenteur' })
  listObjectives(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.objectives.listObjectives(auth, gameId);
  }

  @Post('games/:gameId/bonus-qrs')
  @ApiOperation({ summary: 'Créer un QR bonus (§7.9)' })
  createBonus(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreateBonusDto,
  ) {
    return this.objectives.createBonus(auth, gameId, dto);
  }

  @Get('games/:gameId/scores')
  @ApiOperation({ summary: 'Scores des équipes' })
  scores(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.objectives.scores(auth, gameId);
  }

  /**
   * Point d'entrée unique du scanner mobile : le joueur vise un QR, le
   * serveur reconnaît seul ce que c'est — invitation, objectif ou bonus —
   * et arbitre. Le téléphone n'a aucune connaissance du contenu.
   */
  @Post('scan')
  @ApiOperation({
    summary: 'Scanner un QR : invitation, capture d’objectif ou bonus',
  })
  async scan(@CurrentUser() auth: AuthenticatedUser, @Body() dto: ScanDto) {
    const resolved = await this.objectives.resolve(dto.token);
    if (resolved?.kind === 'objective') {
      return this.objectives.captureObjective(auth, resolved.objective);
    }
    if (resolved?.kind === 'bonus') {
      return this.objectives.redeemBonus(auth, resolved.bonus);
    }
    // Ni objectif ni bonus : c'est peut-être une invitation.
    try {
      const joined = await this.invites.redeem(auth, dto.token);
      return { type: 'invite' as const, ...joined };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException('QR inconnu');
      }
      throw e;
    }
  }
}
