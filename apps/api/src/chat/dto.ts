import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, IsUUID, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ format: 'uuid', description: 'ID généré côté client (§7.6)' })
  @IsUUID()
  id!: string;

  @ApiProperty({ example: 'Contact à l’est du carrefour', maxLength: 500 })
  @IsString()
  @Length(1, 500)
  body!: string;

  @ApiProperty({ description: 'Horodatage d’envoi, horloge de l’auteur' })
  @IsISO8601()
  createdAt!: string;
}
