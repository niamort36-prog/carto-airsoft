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
import { CreateInviteDto, RedeemInviteDto } from './dto';
import { InvitesService } from './invites.service';

@ApiTags('invites')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('games/:gameId/invites')
  @ApiOperation({
    summary:
      'Générer un QR d’invitation pour un rôle (commandant seul). ' +
      'Le jeton en clair n’est renvoyé qu’ici, une seule fois.',
  })
  create(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.createInvite(auth, gameId, dto);
  }

  @Get('games/:gameId/invites')
  @ApiOperation({ summary: 'Invitations de la partie (sans les jetons)' })
  list(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.invites.listInvites(auth, gameId);
  }

  @Delete('games/:gameId/invites/:inviteId')
  @ApiOperation({ summary: 'Révoquer une invitation (§7.2)' })
  revoke(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.invites.revokeInvite(auth, gameId, inviteId);
  }

  @Post('join')
  @ApiOperation({
    summary:
      'Rejoindre en présentant un jeton scanné — le serveur résout seul ' +
      'la partie et le rôle correspondants (§7.2).',
  })
  redeem(
    @CurrentUser() auth: AuthenticatedUser,
    @Body() dto: RedeemInviteDto,
  ) {
    return this.invites.redeem(auth, dto.token);
  }

  @Post('join/preview')
  @ApiOperation({
    summary:
      'Ce qu’une invitation donnerait, sans rejoindre : partie, grade, ' +
      'camp. Un code se tape, et on peut se tromper de caractère.',
  })
  preview(@Body() dto: RedeemInviteDto) {
    return this.invites.preview(dto.token);
  }
}
