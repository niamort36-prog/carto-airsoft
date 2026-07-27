import {
  Body,
  Controller,
  Get,
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
import { AssignMemberDto, CreateSquadDto, CreateTeamDto } from './dto';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get('teams')
  @ApiOperation({ summary: 'Équipes et escouades de la partie (§4)' })
  list(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.teams.list(auth, gameId);
  }

  @Post('teams')
  @ApiOperation({
    summary: 'Créer une équipe — crée aussi son canal de discussion',
  })
  createTeam(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teams.createTeam(auth, gameId, dto);
  }

  @Post('squads')
  @ApiOperation({
    summary: 'Créer une escouade — crée aussi son canal de discussion',
  })
  createSquad(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreateSquadDto,
  ) {
    return this.teams.createSquad(auth, gameId, dto);
  }

  @Patch('members/:membershipId/assignment')
  @ApiOperation({ summary: 'Affecter un membre à une équipe/escouade' })
  async assign(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: AssignMemberDto,
  ) {
    await this.teams.assignMember(auth, gameId, membershipId, dto);
    return { ok: true };
  }
}
