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
import { CreateGameDto, UpdateMemberDto, UpdateMyStatusDto } from './dto';
import { GamesService } from './games.service';

@ApiTags('games')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une partie (hébergée par le serveur)' })
  create(@CurrentUser() auth: AuthenticatedUser, @Body() dto: CreateGameDto) {
    return this.gamesService.createGame(auth, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'Mes parties' })
  listMine(@CurrentUser() auth: AuthenticatedUser) {
    return this.gamesService.listMyGames(auth);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Rejoindre une partie (mode dev, QR en Phase 3)' })
  join(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) gameId: string,
  ) {
    return this.gamesService.joinGame(auth, gameId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Membres de la partie (statuts + dernières positions)' })
  members(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) gameId: string,
  ) {
    return this.gamesService.getMembers(auth, gameId);
  }

  @Patch(':id/members/me')
  @ApiOperation({ summary: 'Changer son statut de vie' })
  updateMyStatus(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) gameId: string,
    @Body() dto: UpdateMyStatusDto,
  ) {
    return this.gamesService.updateMyStatus(auth, gameId, dto.lifeStatus);
  }

  @Patch(':id/members/:membershipId')
  @ApiOperation({
    summary: 'Nommer un grade (commandant) ou changer un insigne (gradés, §5)',
  })
  updateMember(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) gameId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.gamesService.updateMember(auth, gameId, membershipId, dto);
  }
}
