import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { ObjectivesModule } from '../objectives/objectives.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersModule } from '../users/users.module';
import { PreparedMapsController } from './prepared-maps.controller';
import { PreparedMapsService } from './prepared-maps.service';

@Module({
  imports: [
    AuthModule,
    GamesModule,
    ObjectivesModule,
    PermissionsModule,
    UsersModule,
  ],
  controllers: [PreparedMapsController],
  providers: [PreparedMapsService],
  exports: [PreparedMapsService],
})
export class PreparedMapsModule {}
