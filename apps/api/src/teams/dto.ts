import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

import { UNIT_ECHELONS } from '../db/schema';

export class CreateTeamDto {
  @ApiProperty({ example: 'Bleu', minLength: 1, maxLength: 40 })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiPropertyOptional({ example: '#2196F3' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class CreateSquadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  teamId!: string;

  @ApiProperty({ example: 'Alpha', minLength: 1, maxLength: 40 })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiPropertyOptional({
    enum: UNIT_ECHELONS,
    default: 'groupe',
    description: 'Ce que l’unité EST : groupe, section, compagnie…',
  })
  @IsOptional()
  @IsIn(UNIT_ECHELONS)
  echelon?: (typeof UNIT_ECHELONS)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Unité dont celle-ci fait partie. Absent pour une unité rattachée ' +
      'directement à un gradé.',
  })
  @IsOptional()
  @IsUUID()
  parentSquadId?: string;
}

/** Modification d'une unité : nom, échelon, chef, rattachements. */
export class UpdateSquadDto {
  @ApiPropertyOptional({ enum: UNIT_ECHELONS })
  @IsOptional()
  @IsIn(UNIT_ECHELONS)
  echelon?: (typeof UNIT_ECHELONS)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Unité parente ; null pour la détacher et la rattacher à un gradé',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentSquadId?: string | null;
  @ApiPropertyOptional({ example: 'Alpha', minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Chef d’escouade ; null pour la laisser sans chef',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  leaderMembershipId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Capitaine ou commandant dont dépend l’escouade ; null pour la ' +
      'détacher',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  reportsToMembershipId?: string | null;

  @ApiPropertyOptional({
    example: '446.00625',
    nullable: true,
    maxLength: 24,
    description:
      'Étiquette affichée à côté de l’insigne (fréquence radio, indicatif). ' +
      'Chaîne vide ou null pour l’effacer.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 24)
  note?: string | null;
}

export class AssignMemberDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Équipe ; null pour retirer de toute équipe',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Escouade ; doit appartenir à l’équipe visée',
  })
  @IsOptional()
  @IsUUID()
  squadId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Supérieur direct — permet de prendre un homme sous ses ordres sans ' +
      'lui donner de grade ni l’enfermer dans une escouade',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  reportsToMembershipId?: string | null;
}
