import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { InvitesModule } from '../invites/invites.module';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [AuthModule, GamesModule, InvitesModule],
  controllers: [ObjectivesController],
  providers: [ObjectivesService],
  exports: [ObjectivesService],
})
export class ObjectivesModule {}
