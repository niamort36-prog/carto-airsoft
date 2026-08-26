import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const GAME_STATUSES = ['draft', 'live', 'finished'] as const;

export class SetGameStatusDto {
  @ApiProperty({ enum: GAME_STATUSES, example: 'live' })
  @IsIn(GAME_STATUSES)
  status!: (typeof GAME_STATUSES)[number];
}
