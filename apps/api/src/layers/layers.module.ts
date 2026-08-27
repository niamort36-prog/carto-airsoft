import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { LayersController } from './layers.controller';
import { LayersService } from './layers.service';

@Module({
  imports: [AuthModule, GamesModule, PermissionsModule],
  controllers: [LayersController],
  providers: [LayersService],
})
export class LayersModule {}
