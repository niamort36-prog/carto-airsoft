import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PERK_TYPES = ['drone', 'jammer'] as const;
const ROLES = ['commandant', 'capitaine', 'chef_escouade', 'joueur'] as const;

export class CreatePerkDto {
  @ApiProperty({ enum: PERK_TYPES })
  @IsIn(PERK_TYPES)
  type!: (typeof PERK_TYPES)[number];

  @ApiPropertyOptional({ default: 300, minimum: 20, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(5000)
  radiusMeters?: number;

  @ApiPropertyOptional({ default: 30, minimum: 5, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  durationSeconds?: number;

  @ApiPropertyOptional({ default: 300, minimum: 0, maximum: 7200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  cooldownSeconds?: number;

  @ApiPropertyOptional({ description: 'Utilisations par équipe ; omis = illimité' })
  @IsOptional()
  @IsInt()
  @Min(1)
  stockPerTeam?: number;

  @ApiPropertyOptional({ enum: ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(ROLES, { each: true })
  allowedRoles?: string[];
}

export class ActivatePerkDto {
  @ApiProperty({ example: 48.404, description: 'Centre de la zone visée' })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 2.632 })
  @IsLongitude()
  lng!: number;
}
