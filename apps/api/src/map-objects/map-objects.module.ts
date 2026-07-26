import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { MapObjectsController } from './map-objects.controller';
import { MapObjectsService } from './map-objects.service';

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [MapObjectsController],
  providers: [MapObjectsService],
})
export class MapObjectsModule {}
