import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

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
}

/** Modification d'une escouade : nom, chef, rattachement. */
export class UpdateSquadDto {
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
