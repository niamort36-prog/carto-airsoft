import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
