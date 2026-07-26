import { Module } from '@nestjs/common';
import { MapStylesController } from './map-styles.controller';

@Module({
  controllers: [MapStylesController],
})
export class MapStylesModule {}
