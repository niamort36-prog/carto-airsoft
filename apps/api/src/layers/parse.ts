import { XMLParser } from 'fast-xml-parser';

/**
 * Lecture des préparations externes (§7.10).
 *
 * La géométrie est ce qui compte : le cahier des charges prévient que le
 * style exact ne survit pas toujours à l'export, et que ce n'est pas grave.
 * On récupère donc la forme, le nom, et la couleur quand elle est là — sans
 * jamais faire échouer un import pour un style illisible.
 */

/** Entité prête à devenir un objet de carte. */
export interface ParsedFeature {
  kind: 'marker' | 'line' | 'zone';
  /** Point de référence (le marqueur lui-même, ou le premier sommet). */
  lat: number;
  lng: number;
  /** GeoJSON LineString/Polygon pour les lignes et zones. */
  geometry: Record<string, unknown> | null;
  label: string | null;
  color: string | null;
}

export class LayerParseError extends Error {}

/** Nombre d'entités au-delà duquel on refuse : un téléphone doit suivre. */
export const MAX_FEATURES = 2000;

/** Reconnaît le format sans faire confiance à l'extension du fichier. */
export function detectFormat(content: string): 'geojson' | 'kml' {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'geojson';
  if (/^<\?xml|<kml[\s>]/i.test(trimmed)) return 'kml';
  throw new LayerParseError(
    'Format non reconnu : attendu GeoJSON (JSON) ou KML (XML)',
  );
}

export function parseLayer(
  content: string,
  format: 'geojson' | 'kml',
): ParsedFeature[] {
  const features =
    format === 'geojson' ? parseGeoJson(content) : parseKml(content);
  if (features.length === 0) {
    throw new LayerParseError('Aucune entité géométrique exploitable');
  }
  if (features.length > MAX_FEATURES) {
    throw new LayerParseError(
      `Trop d’entités (${features.length}) : maximum ${MAX_FEATURES}`,
    );
  }
  return features;
}

// --- GeoJSON ---------------------------------------------------------------

function parseGeoJson(content: string): ParsedFeature[] {
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    throw new LayerParseError('JSON illisible');
  }

  const out: ParsedFeature[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    switch (obj.type) {
      case 'FeatureCollection':
        for (const f of asArray(obj.features)) visit(f);
        return;
      case 'Feature': {
        const props = (obj.properties ?? {}) as Record<string, unknown>;
        pushGeometry(out, obj.geometry, {
          label: firstString(props, ['name', 'Name', 'title', 'label']),
          // simplestyle-spec : ce que produisent la plupart des exports.
          color: firstString(props, [
            'stroke',
            'fill',
            'color',
            'marker-color',
          ]),
        });
        return;
      }
      default:
        // Géométrie nue, hors Feature : tolérée.
        pushGeometry(out, obj, { label: null, color: null });
    }
  };
  visit(root);
  return out;
}

function pushGeometry(
  out: ParsedFeature[],
  geometry: unknown,
  meta: { label: string | null; color: string | null },
): void {
  if (!geometry || typeof geometry !== 'object') return;
  const geo = geometry as Record<string, unknown>;

  switch (geo.type) {
    case 'GeometryCollection':
      for (const g of asArray(geo.geometries)) pushGeometry(out, g, meta);
      return;
    case 'Point': {
      const p = asPosition(geo.coordinates);
      if (p) {
        out.push({
          kind: 'marker',
          lat: p[1],
          lng: p[0],
          geometry: null,
          ...meta,
        });
      }
      return;
    }
    case 'MultiPoint':
      for (const c of asArray(geo.coordinates)) {
        pushGeometry(out, { type: 'Point', coordinates: c }, meta);
      }
      return;
    case 'LineString': {
      const line = asPositions(geo.coordinates);
      if (line.length >= 2) {
        out.push({
          kind: 'line',
          lat: line[0][1],
          lng: line[0][0],
          geometry: { type: 'LineString', coordinates: line },
          ...meta,
        });
      }
      return;
    }
    case 'MultiLineString':
      for (const c of asArray(geo.coordinates)) {
        pushGeometry(out, { type: 'LineString', coordinates: c }, meta);
      }
      return;
    case 'Polygon': {
      const rings = asArray(geo.coordinates)
        .map(asPositions)
        .filter((r) => r.length >= 4);
      if (rings.length > 0) {
        out.push({
          kind: 'zone',
          lat: rings[0][0][1],
          lng: rings[0][0][0],
          geometry: { type: 'Polygon', coordinates: rings },
          ...meta,
        });
      }
      return;
    }
    case 'MultiPolygon':
      for (const c of asArray(geo.coordinates)) {
        pushGeometry(out, { type: 'Polygon', coordinates: c }, meta);
      }
      return;
    default:
      return;
  }
}

// --- KML -------------------------------------------------------------------

function parseKml(content: string): ParsedFeature[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    // Les noms contiennent souvent des nombres (« Zone 1 ») : sans cela,
    // `<name>1</name>` deviendrait un nombre.
    parseTagValue: false,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(content) as Record<string, unknown>;
  } catch {
    throw new LayerParseError('XML illisible');
  }

  const styles = collectKmlStyles(doc);
  const out: ParsedFeature[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const value of Object.values(node as Record<string, unknown>)) {
      for (const item of asArray(value)) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        if (
          'Point' in obj ||
          'LineString' in obj ||
          'Polygon' in obj ||
          'MultiGeometry' in obj
        ) {
          pushKmlGeometry(out, obj, {
            label: asString(obj.name),
            color: resolveKmlColor(obj, styles),
          });
          // Ce noeud porte déjà ses géométries : y redescendre compterait
          // deux fois le contenu d'une MultiGeometry.
          continue;
        }
        visit(obj);
      }
    }
  };
  visit(doc);
  return out;
}

function pushKmlGeometry(
  out: ParsedFeature[],
  node: Record<string, unknown>,
  meta: { label: string | null; color: string | null },
): void {
  for (const point of asArray(node.Point)) {
    const coords = kmlCoordinates(point);
    if (coords.length >= 1) {
      out.push({
        kind: 'marker',
        lat: coords[0][1],
        lng: coords[0][0],
        geometry: null,
        ...meta,
      });
    }
  }
  for (const line of asArray(node.LineString)) {
    const coords = kmlCoordinates(line);
    if (coords.length >= 2) {
      out.push({
        kind: 'line',
        lat: coords[0][1],
        lng: coords[0][0],
        geometry: { type: 'LineString', coordinates: coords },
        ...meta,
      });
    }
  }
  for (const polygon of asArray(node.Polygon)) {
    const outer = asArray(
      (polygon as Record<string, unknown>).outerBoundaryIs,
    ).flatMap((b) => asArray((b as Record<string, unknown>).LinearRing));
    const rings = outer.map(kmlCoordinates).filter((r) => r.length >= 4);
    if (rings.length > 0) {
      out.push({
        kind: 'zone',
        lat: rings[0][0][1],
        lng: rings[0][0][0],
        geometry: { type: 'Polygon', coordinates: rings },
        ...meta,
      });
    }
  }
  for (const multi of asArray(node.MultiGeometry)) {
    pushKmlGeometry(out, multi as Record<string, unknown>, meta);
  }
}

/** `<coordinates>lng,lat[,alt] …</coordinates>` — séparateurs libres. */
function kmlCoordinates(node: unknown): Array<[number, number]> {
  if (!node || typeof node !== 'object') return [];
  const raw = asString((node as Record<string, unknown>).coordinates);
  if (!raw) return [];
  const out: Array<[number, number]> = [];
  for (const chunk of raw.trim().split(/\s+/)) {
    const [lng, lat] = chunk.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

/** Styles KML par identifiant, pour résoudre les `<styleUrl>`. */
function collectKmlStyles(doc: unknown): Map<string, string> {
  const styles = new Map<string, string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      for (const item of asArray(value)) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        if (key === 'Style') {
          const id = asString(obj['@id']);
          const color = kmlStyleColor(obj);
          if (id && color) styles.set(id, color);
        }
        visit(obj);
      }
    }
  };
  visit(doc);
  return styles;
}

function kmlStyleColor(style: Record<string, unknown>): string | null {
  for (const key of ['LineStyle', 'PolyStyle', 'IconStyle']) {
    for (const s of asArray(style[key])) {
      const raw = asString((s as Record<string, unknown>).color);
      const converted = raw ? kmlColorToHex(raw) : null;
      if (converted) return converted;
    }
  }
  return null;
}

function resolveKmlColor(
  node: Record<string, unknown>,
  styles: Map<string, string>,
): string | null {
  for (const s of asArray(node.Style)) {
    const inline = kmlStyleColor(s as Record<string, unknown>);
    if (inline) return inline;
  }
  const url = asString(node.styleUrl);
  if (url) return styles.get(url.replace(/^#/, '')) ?? null;
  return null;
}

/** KML code la couleur en `aabbggrr` — l'inverse du web. */
function kmlColorToHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{8}$/i.test(hex)) return null;
  const bb = hex.slice(2, 4);
  const gg = hex.slice(4, 6);
  const rr = hex.slice(6, 8);
  return `#${rr}${gg}${bb}`.toUpperCase();
}

// --- Utilitaires -----------------------------------------------------------

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text.trim() || null;
  }
  return null;
}

function firstString(
  props: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function asPosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value as unknown[];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function asPositions(value: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const item of asArray(value)) {
    const p = asPosition(item);
    if (p) out.push(p);
  }
  return out;
}
