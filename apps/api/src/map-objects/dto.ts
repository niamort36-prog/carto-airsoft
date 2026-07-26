import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export const OBJECT_KINDS = ['marker'] as const;
export const MARKER_TYPES = ['unit', 'waypoint', 'poi'] as const;

/**
 * Un objet tel que le client le pousse (création, modification ou
 * suppression). L'id vient du téléphone (§7.6) : renvoyer deux fois le même
 * lot ne crée jamais de doublon.
 */
export class UpsertMapObjectDto {
  @ApiProperty({ format: 'uuid', description: 'ID généré côté client' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ enum: OBJECT_KINDS, default: 'marker' })
  @IsOptional()
  @IsIn(OBJECT_KINDS)
  kind?: (typeof OBJECT_KINDS)[number];

  @ApiPropertyOptional({ enum: MARKER_TYPES, default: 'unit' })
  @IsOptional()
  @IsIn(MARKER_TYPES)
  markerType?: (typeof MARKER_TYPES)[number];

  @ApiProperty({ example: 48.404 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 2.632 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({
    description: 'Libre — ex. { "icon": "infantry_hostile", "label": "…" }',
  })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @ApiProperty({ description: 'Horodatage de création, horloge du téléphone' })
  @IsISO8601()
  createdAt!: string;

  @ApiPropertyOptional({ description: 'true = suppression (tombstone)' })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

export class BatchUpsertDto {
  @ApiProperty({ type: [UpsertMapObjectDto] })
  @ValidateNested({ each: true })
  @Type(() => UpsertMapObjectDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  objects!: UpsertMapObjectDto[];
}
