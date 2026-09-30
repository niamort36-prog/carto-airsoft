import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Fonds de carte servis par l'API (`/v1/map-styles/<nom>.json`). */
export const BASEMAPS = ['osm', 'plan_ign', 'ortho_ign', 'relief'] as const;
export type Basemap = (typeof BASEMAPS)[number];

export class CreatePreparedMapDto {
  @ApiProperty({ example: 'Forêt de Franchard', minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({ enum: BASEMAPS, default: 'plan_ign' })
  @IsOptional()
  @IsIn(BASEMAPS)
  basemap?: Basemap;
}

export class UpdatePreparedMapDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional({ enum: BASEMAPS })
  @IsOptional()
  @IsIn(BASEMAPS)
  basemap?: Basemap;

  @ApiPropertyOptional({
    description:
      'Dessins et drapeaux : { objects: [...], objectives: [...] }. ' +
      'Remplace intégralement le contenu précédent.',
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Où rouvrir la carte.' })
  @IsOptional()
  @IsLatitude()
  centerLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  centerLng?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 22 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(22)
  zoom?: number;
}

export class AttachPreparedMapDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Carte à recopier dans la partie ; null pour détacher (le contenu ' +
      'déjà recopié reste en place).',
  })
  @IsOptional()
  @IsString()
  mapId?: string | null;
}
