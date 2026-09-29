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
 * Rôles invitables — tout sauf commandant.
 *
 * Une partie peut compter plusieurs commandants, mais on n'en fabrique pas
 * par code : un code se photographie, se transfère et se réutilise. Le
 * grade qui donne la main sur toute la partie se donne à une personne
 * nommée, par une promotion délibérée, jamais par un bout de papier qui
 * traîne sur un parking.
 */
export const INVITABLE_ROLES = ASSIGNABLE_ROLES.filter(
  (r) => r !== 'commandant',
);

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
