import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { PerksController } from './perks.controller';
import { PerksService } from './perks.service';

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [PerksController],
  providers: [PerksService],
})
export class PerksModule {}
