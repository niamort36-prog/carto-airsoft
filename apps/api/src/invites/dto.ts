import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ASSIGNABLE_ROLES } from '../games/dto';

/**
 * Rôles invitables. Le commandant ne se délègue pas par QR : il n'y a qu'un
 * chef, celui qui a créé la partie (§5). Les autres grades s'invitent.
 */
export const INVITABLE_ROLES = ASSIGNABLE_ROLES;

export class CreateInviteDto {
  @ApiProperty({ enum: INVITABLE_ROLES, example: 'joueur' })
  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];

  @ApiPropertyOptional({
    description:
      'Nombre d’usages autorisés ; omis = réutilisable sans limite ' +
      '(comportement par défaut). Renseigner pour limiter un QR.',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Expiration ISO 8601 (optionnelle)' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Équipe d’affectation : le scan place directement le joueur dans ce camp',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Escouade d’affectation (détermine l’équipe)',
  })
  @IsOptional()
  @IsUUID()
  squadId?: string;
}

export class RedeemInviteDto {
  @ApiProperty({
    description:
      'Jeton opaque du QR, ou l’URL complète qu’il encode. Le rôle n’y ' +
      'figure jamais : seul le serveur sait à quoi il correspond.',
    example: 'aG9yc2ViYXR0ZXJ5c3RhcGxl…',
  })
  @IsString()
  @Length(8, 400)
  token!: string;
}
