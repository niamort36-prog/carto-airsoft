import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  Length,
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
}
