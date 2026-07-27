import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/**
 * Global : les autorisations traversent tous les domaines (parties, chat,
 * marqueurs, invitations), les injecter partout serait du bruit.
 * Le contrôleur vit dans son propre module (il dépend de GamesModule).
 */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
