import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { PermissionsController } from './permissions.controller';

/** Expose la matrice via l'API (le service, lui, est global). */
@Module({
  imports: [AuthModule, GamesModule],
  controllers: [PermissionsController],
})
export class PermissionsApiModule {}
