import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DbModule } from './db/db.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { MapObjectsModule } from './map-objects/map-objects.module';
import { MapStylesModule } from './map-styles/map-styles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Cherche le .env à côté du code compilé (apps/api/.env) puis dans le cwd,
      // pour que `node dist/main.js` marche depuis n'importe quel répertoire.
      envFilePath: [join(__dirname, '..', '.env'), '.env'],
    }),
    EventEmitterModule.forRoot(),
    DbModule,
    GamesModule,
    HealthModule,
    MapObjectsModule,
    MapStylesModule,
    UsersModule,
  ],
})
export class AppModule {}
