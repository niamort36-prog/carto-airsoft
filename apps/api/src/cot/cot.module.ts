import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { CotController } from './cot.controller';
import { CotService } from './cot.service';

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [CotController],
  providers: [CotService],
  exports: [CotService],
})
export class CotModule {}
