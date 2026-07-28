import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { GamesModule } from '../games/games.module';
import { ObjectivesModule } from '../objectives/objectives.module';
import { PerksModule } from '../perks/perks.module';
import { GameGateway } from './game.gateway';

/**
 * Couche transport temps réel : la gateway est au-dessus des domaines
 * (parties, objets carte, chat) et ne fait que diffuser leurs événements
 * aux rooms autorisées. Module séparé = pas de dépendance circulaire.
 */
@Module({
  imports: [
    AuthModule,
    GamesModule,
    ChatModule,
    ObjectivesModule,
    PerksModule,
  ],
  providers: [GameGateway],
})
export class RealtimeModule {}
