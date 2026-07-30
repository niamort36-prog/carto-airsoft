import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Sert les styles MapLibre utilisés par le téléchargement de cartes
 * hors-ligne de l'app mobile (le moteur natif exige une URL http(s)).
 *
 * ⚠️ Ces fichiers sont une copie de `apps/mobile/assets/styles/` : les URLs
 * de tuiles doivent rester identiques des deux côtés (cache partagé).
 * Route publique : un style de carte n'est pas une donnée sensible.
 */
const ALLOWED_FILES = new Set([
  'osm.json',
  'plan_ign.json',
  'ortho_ign.json',
  'relief.json',
]);

@ApiTags('map-styles')
@Controller('map-styles')
export class MapStylesController {
  private readonly cache = new Map<string, unknown>();

  @Get(':file')
  @ApiOperation({ summary: 'Style MapLibre pour le téléchargement hors-ligne' })
  @ApiOkResponse({ description: 'Style JSON MapLibre.' })
  getStyle(@Param('file') file: string): unknown {
    if (!ALLOWED_FILES.has(file)) {
      throw new NotFoundException('Style inconnu');
    }
    let style = this.cache.get(file);
    if (!style) {
      const raw = readFileSync(join(__dirname, 'styles', file), 'utf8');
      style = JSON.parse(raw);
      this.cache.set(file, style);
    }
    return style;
  }
}
