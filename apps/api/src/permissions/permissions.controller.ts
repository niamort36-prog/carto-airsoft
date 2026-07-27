import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  SupabaseAuthGuard,
  type AuthenticatedUser,
} from '../auth/supabase-auth.guard';
import { GamesService } from '../games/games.service';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from './permissions';
import { PermissionsService } from './permissions.service';

const ROLES = ['commandant', 'capitaine', 'chef_escouade', 'joueur'] as const;

export class UpdateMatrixDto {
  @ApiProperty({ enum: ROLES, example: 'capitaine' })
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  @ApiProperty({
    description:
      'Clés de permission à accorder (true) ou retirer (false) pour ce rôle',
    example: { 'invites:manage': false, 'markers:delete_any': true },
  })
  @IsObject()
  changes!: Partial<Record<Permission, boolean>>;
}

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('games/:gameId/permissions')
export class PermissionsController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly gamesService: GamesService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Matrice effective de la partie + mes propres permissions (§5). ' +
      'Sert à l’app et à la console pour n’afficher que le possible.',
  })
  async matrix(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
  ) {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    return {
      catalogue: ALL_PERMISSIONS.map((key) => ({
        key,
        label: PERMISSION_LABELS[key],
      })),
      matrix: await this.permissions.matrix(gameId),
      myRole: membership.role,
      mine: await this.permissions.forRole(gameId, membership.role),
    };
  }

  @Patch()
  @ApiOperation({
    summary: 'Modifier la matrice pour un rôle (permission game:manage)',
  })
  async update(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: UpdateMatrixDto,
  ) {
    const membership = await this.gamesService.findActiveMembership(
      auth,
      gameId,
    );
    await this.permissions.assert(
      membership,
      PERMISSIONS.GAME_MANAGE,
      'Votre grade ne permet pas de modifier les permissions',
    );
    return {
      matrix: await this.permissions.setOverrides(gameId, dto.role, dto.changes),
    };
  }
}
