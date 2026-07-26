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
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId/channels')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Canaux accessibles avec mon grade (§7.4)' })
  channels(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.chat.listChannels(auth, gameId);
  }

  @Get(':channelId/messages')
  @ApiOperation({ summary: 'Messages d’un canal (delta si `since`)' })
  @ApiQuery({ name: 'since', required: false, description: 'Curseur ISO 8601' })
  messages(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query('since') since?: string,
  ) {
    return this.chat.listMessages(auth, gameId, channelId, since);
  }

  @Post(':channelId/messages')
  @ApiOperation({ summary: 'Envoyer un message (idempotent sur l’id client)' })
  send(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(auth, gameId, channelId, dto);
  }
}
