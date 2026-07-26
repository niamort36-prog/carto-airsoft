import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export type Database = PostgresJsDatabase<typeof schema>;

const DEFAULT_DEV_URL =
  'postgres://carto:carto_dev_only@localhost:5432/carto_airsoft';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const url = config.get<string>('DATABASE_URL') ?? DEFAULT_DEV_URL;
        // Connexion paresseuse : l'API démarre même si la base est éteinte,
        // seules les requêtes échoueront (jamais un crash au boot).
        const client = postgres(url, { prepare: false });
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
