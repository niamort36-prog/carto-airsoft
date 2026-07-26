import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export const LIFE_STATUSES = [
  'alive',
  'dead',
  'medic_needed',
  'support',
] as const;
export type LifeStatus = (typeof LIFE_STATUSES)[number];

/** Hiérarchie §5 — plus le rang est petit, plus le grade est élevé. */
export const ROLE_RANK: Record<string, number> = {
  commandant: 0,
  capitaine: 1,
  chef_escouade: 2,
  joueur: 3,
};

/** Grades attribuables par le commandant (le grade de commandant ne se donne pas). */
export const ASSIGNABLE_ROLES = [
  'capitaine',
  'chef_escouade',
  'joueur',
] as const;

/** Types d'unités du pack d'icônes (source de vérité côté serveur). */
export const UNIT_TYPES = [
  'infantry',
  'infantry_motorized',
  'armor',
  'anti_tank',
  'recon',
  'sniper',
  'sf',
  'mortar',
  'engineer',
  'medical',
  'command',
  'radio',
  'transport',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: (typeof ASSIGNABLE_ROLES)[number];

  @ApiPropertyOptional({ enum: UNIT_TYPES, description: 'Icône/insigne du joueur' })
  @IsOptional()
  @IsIn(UNIT_TYPES)
  unitType?: UnitType;
}

export class CreateGameDto {
  @ApiProperty({ example: 'Opération Fontainebleau', minLength: 3, maxLength: 60 })
  @IsString()
  @Length(3, 60)
  name!: string;
}

export class UpdateMyStatusDto {
  @ApiProperty({ enum: LIFE_STATUSES, example: 'medic_needed' })
  @IsIn(LIFE_STATUSES)
  lifeStatus!: LifeStatus;
}
