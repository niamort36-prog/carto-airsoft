import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

export const LIFE_STATUSES = [
  'alive',
  'dead',
  'medic_needed',
  'support',
] as const;
export type LifeStatus = (typeof LIFE_STATUSES)[number];

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
