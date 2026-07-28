import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

const ROLES = ['commandant', 'capitaine', 'chef_escouade', 'joueur'] as const;

export class CreateObjectiveDto {
  @ApiProperty({ example: 'Drapeau Nord', minLength: 1, maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ example: 48.404 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 2.632 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({
    description:
      'Ordre de capture : ce drapeau exige que l’équipe détienne déjà tous ' +
      'les rangs inférieurs. Omis = capturable librement.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  captureOrder?: number;

  @ApiPropertyOptional({
    enum: ROLES,
    isArray: true,
    description: 'Grades habilités à capturer ; vide = tous',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(ROLES, { each: true })
  allowedRoles?: string[];

  @ApiPropertyOptional({
    description: 'Récompense libre, ex. { "points": 100 }',
    example: { points: 100 },
  })
  @IsOptional()
  @IsObject()
  reward?: Record<string, unknown>;
}

export class CreateBonusDto {
  @ApiProperty({ example: 'Cache de munitions', minLength: 1, maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: { points: 25 } })
  @IsOptional()
  @IsObject()
  reward?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Contenu délivré au scan (image, document)',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  attachmentUrl?: string;

  @ApiPropertyOptional({ description: 'Scans autorisés au total ; omis = illimité' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxScansTotal?: number;

  @ApiPropertyOptional({
    description: 'Scans autorisés par joueur (défaut 1)',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxScansPerPlayer?: number;
}

export class ScanDto {
  @ApiProperty({
    description:
      'Jeton opaque du QR, ou l’URL qu’il encode. Le serveur identifie seul ' +
      'sa nature : invitation, objectif ou bonus (§7.8, §7.9).',
  })
  @IsString()
  @Length(8, 400)
  token!: string;
}
