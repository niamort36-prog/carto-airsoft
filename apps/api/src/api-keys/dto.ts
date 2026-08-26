import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

/**
 * Portées d'une clé (§7.11). Elles s'emboîtent : `admin` contient `write`,
 * qui contient `read`. Une clé de lecture ne peut donc jamais écrire, mais
 * une clé d'administration n'a pas besoin qu'on lui liste les trois.
 */
export const API_SCOPES = ['read', 'write', 'admin'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const RANK: Record<ApiScope, number> = { read: 0, write: 1, admin: 2 };

/** Vrai si les portées accordées couvrent celle qu'exige la route. */
export function scopeSatisfies(granted: string[], required: ApiScope): boolean {
  return granted.some(
    (s) => s in RANK && RANK[s as ApiScope] >= RANK[required],
  );
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Tableau des scores du club' })
  @IsString()
  @Length(3, 80)
  name!: string;

  @ApiProperty({
    enum: API_SCOPES,
    isArray: true,
    example: ['read'],
    description:
      'read = consulter, write = agir sur le déroulé, admin = préparer la partie.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(API_SCOPES, { each: true })
  scopes!: ApiScope[];

  @ApiPropertyOptional({
    description:
      'Parties autorisées. Vide = toutes les parties dont vous êtes le ' +
      'propriétaire (la vérification refait le lien à chaque appel).',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  gameIds?: string[];

  @ApiPropertyOptional({ description: 'Expiration ISO 8601, facultative.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
