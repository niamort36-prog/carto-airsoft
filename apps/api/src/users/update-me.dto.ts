import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class UpdateMeDto {
  @ApiProperty({
    description: 'Pseudo affiché aux autres joueurs',
    example: 'Renard-06',
    minLength: 2,
    maxLength: 32,
  })
  @IsString()
  @Length(2, 32)
  @Matches(/^[\p{L}\p{N} _'’.-]+$/u, {
    message: 'Le pseudo contient des caractères non autorisés',
  })
  pseudo!: string;
}
