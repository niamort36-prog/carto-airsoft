import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
