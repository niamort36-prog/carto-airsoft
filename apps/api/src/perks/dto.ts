import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PERK_TYPES = ['drone', 'jammer'] as const;

/** Ce que le couvert fait aux hostiles qui s'y trouvent. */
export const CONCEALMENTS = ['none', 'intermittent', 'hidden'] as const;

/**
 * Couverts possibles. Ce ne sont pas des données d'occupation du sol : ce
 * sont les ZONES que l'organisateur a dessinées et étiquetées. Lui seul
 * sait ce qui, sur son terrain, cache vraiment un homme.
 */
export const COVERS = ['forest', 'urban'] as const;
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

  @ApiPropertyOptional({
    default: true,
    description:
      'Le drone tourne autour du point visé plutôt que d’y rester fixe.',
  })
  @IsOptional()
  @IsBoolean()
  orbit?: boolean;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    maximum: 120,
    description:
      'Secondes entre deux balayages. 0 = un seul instantané. Sans ' +
      'balayages répétés, l’intermittence n’aurait aucun support.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  sweepSeconds?: number;

  @ApiPropertyOptional({
    enum: CONCEALMENTS,
    default: 'none',
    description:
      'none : le drone voit tout. intermittent : on n’apparaît qu’à ' +
      'certains balayages. hidden : invisible tant qu’on reste couvert.',
  })
  @IsOptional()
  @IsIn(CONCEALMENTS)
  concealment?: (typeof CONCEALMENTS)[number];

  @ApiPropertyOptional({
    enum: COVERS,
    isArray: true,
    description:
      'Quels couverts dissimulent. Correspond à `properties.cover` des ' +
      'zones dessinées sur la carte.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(COVERS, { each: true })
  concealedCovers?: string[];
}

/**
 * Modification d'un bonus déjà posé. Le type ne s'y change pas : un drone
 * ne devient pas un brouilleur, on en pose un autre.
 */
export class UpdatePerkDto extends PartialType(
  OmitType(CreatePerkDto, ['type'] as const),
) {}

export class ActivatePerkDto {
  @ApiProperty({ example: 48.404, description: 'Centre de la zone visée' })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 2.632 })
  @IsLongitude()
  lng!: number;
}
