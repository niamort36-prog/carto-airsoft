import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/supabase-auth.guard';
import type { User } from '../db/schema';
import { UpdateMeDto } from './update-me.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Profil de l’utilisateur authentifié (créé au premier appel)' })
  @ApiOkResponse({ description: 'Profil courant.' })
  getMe(@CurrentUser() auth: AuthenticatedUser): Promise<User> {
    return this.usersService.getOrCreate(auth);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier son pseudo' })
  updateMe(
    @CurrentUser() auth: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
  ): Promise<User> {
    return this.usersService.updatePseudo(auth, dto.pseudo);
  }
}
