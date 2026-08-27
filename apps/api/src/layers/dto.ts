import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ImportLayerDto {
  @ApiProperty({ example: 'Préparation map.army — zone nord' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({
    description:
      'Contenu du fichier, GeoJSON ou KML. Le format est reconnu à la ' +
      'lecture, sans se fier à l’extension.',
  })
  @IsString()
  @Length(2, 5_000_000)
  content!: string;
}
