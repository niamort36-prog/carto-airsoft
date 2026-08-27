import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import { CotService } from './cot.service';

/** Export CoT pour un membre : SA vision, masquage anti-triche compris. */
@ApiTags('cot')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId/cot')
export class CotController {
  constructor(private readonly cot: CotService) {}

  @Get()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({
    summary:
      'Situation au format CoT (Cursor on Target) — positions du camp ' +
      'seulement, comme partout ailleurs (§2.1)',
  })
  export(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    return this.cot.forMember(auth, gameId);
  }
}
