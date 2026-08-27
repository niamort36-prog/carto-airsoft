import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/**
 * Interopérabilité CoT — Cursor on Target, le format d'échange de
 * l'écosystème TAK (§3).
 *
 * On ne construit pas un serveur TAK : on parle sa langue. Un événement CoT
 * décrit « quoi, où, quand, et jusqu'à quand y croire ». Cette dernière
 * partie est ce qui compte le plus ici : un CoT porte toujours une date de
 * péremption (`stale`), ce qui colle exactement au principe « membre ≠
 * connecté » (§2.4) — une position vieille de dix minutes s'annonce comme
 * telle au lieu de se faire passer pour fraîche.
 *
 * Le type CoT encode l'affiliation à la deuxième lettre : `a-f-G-U-C` est
 * une unité amie au sol. Nos quatre camps s'y superposent exactement, ce
 * qui rend la traduction fidèle dans les deux sens.
 */

/** Affiliation CoT ↔ camp du pack de symboles. */
const AFFILIATION_TO_COT: Record<string, string> = {
  allied: 'f',
  hostile: 'h',
  neutral: 'n',
  unknown: 'u',
};

const COT_TO_AFFILIATION: Record<string, string> = {
  f: 'allied',
  a: 'allied', // assumed friend
  h: 'hostile',
  s: 'hostile', // suspect
  j: 'hostile', // joker
  k: 'hostile', // faker
  n: 'neutral',
  u: 'unknown',
  p: 'unknown', // pending
  o: 'unknown',
  x: 'unknown',
};

export interface CotPoint {
  lat: number;
  lon: number;
  /** Hauteur au-dessus de l'ellipsoïde ; 9999999 = inconnue, par convention. */
  hae?: number;
  /** Erreur circulaire et linéaire ; même convention d'inconnu. */
  ce?: number;
  le?: number;
}

export interface CotEvent {
  uid: string;
  type: string;
  time: Date;
  start: Date;
  stale: Date;
  /** Provenance : `m-g` = machine/GPS, `h-e` = saisi par un humain. */
  how: string;
  point: CotPoint;
  callsign?: string;
  remarks?: string;
  /** Groupe TAK (équipe) : { name: 'Cyan', role: 'Team Member' }. */
  group?: { name: string; role: string };
  /** Sommets d'un tracé (`u-d-f`) : lignes et polygones. */
  links?: Array<[number, number]>;
  /** Couleur de tracé, si connue. */
  color?: string;
  /** Extension propre à l'application, ignorée par les autres clients. */
  cartoIcon?: string;
}

export class CotParseError extends Error {}

const UNKNOWN = 9999999;

// --- Écriture --------------------------------------------------------------

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  format: true,
  suppressEmptyNode: true,
});

/** Un événement CoT en XML. */
export function buildCotEvent(event: CotEvent): string {
  const detail: Record<string, unknown> = {};
  if (event.callsign) {
    detail.contact = { '@callsign': event.callsign };
  }
  if (event.group) {
    detail.__group = {
      '@name': event.group.name,
      '@role': event.group.role,
    };
  }
  if (event.remarks) detail.remarks = event.remarks;
  if (event.color) {
    // TAK attend un entier signé ARGB ; l'opaque est le cas courant.
    detail.strokeColor = { '@value': String(argbFromHex(event.color)) };
  }
  if (event.links?.length) {
    detail.link = event.links.map(([lat, lon]) => ({
      '@point': `${lat},${lon}`,
    }));
  }
  if (event.cartoIcon) {
    // Extension maison : les autres clients l'ignorent, la nôtre s'en sert
    // pour retrouver l'insigne exact plutôt qu'un équivalent approché.
    detail['carto-airsoft'] = { '@icon': event.cartoIcon };
  }

  return builder.build({
    event: {
      '@version': '2.0',
      '@uid': event.uid,
      '@type': event.type,
      '@time': event.time.toISOString(),
      '@start': event.start.toISOString(),
      '@stale': event.stale.toISOString(),
      '@how': event.how,
      point: {
        '@lat': event.point.lat,
        '@lon': event.point.lon,
        '@hae': event.point.hae ?? UNKNOWN,
        '@ce': event.point.ce ?? UNKNOWN,
        '@le': event.point.le ?? UNKNOWN,
      },
      detail,
    },
  }) as string;
}

/**
 * Plusieurs événements dans un seul document. `<events>` n'est pas du CoT
 * canonique — le format décrit un événement à la fois — mais c'est
 * l'enveloppe qu'emploient les outils qui échangent des lots, et nos deux
 * bouts la relisent.
 */
export function buildCotDocument(events: CotEvent[]): string {
  const body = events.map(buildCotEvent).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>\n${body}</events>\n`;
}

/** Type CoT d'un symbole du pack. */
export function cotTypeFor(
  kind: 'marker' | 'line' | 'zone',
  affiliation: string | null,
  family: 'unit' | 'structure' | 'point',
): string {
  if (kind !== 'marker') return 'u-d-f';
  if (family === 'point') return 'b-m-p-w';
  const letter = AFFILIATION_TO_COT[affiliation ?? 'unknown'] ?? 'u';
  // G = au sol ; U = unité, I = installation.
  return family === 'structure' ? `a-${letter}-G-I` : `a-${letter}-G-U-C`;
}

/** Camp déduit d'un type CoT (`a-h-G-U-C` → hostile). */
export function affiliationFromCotType(type: string): string {
  const parts = type.split('-');
  if (parts[0] !== 'a' || parts.length < 2) return 'unknown';
  return COT_TO_AFFILIATION[parts[1]] ?? 'unknown';
}

// --- Lecture ---------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Reconnaît un flux CoT (un événement seul ou un lot). */
export function looksLikeCot(content: string): boolean {
  return /<events[\s>]|<event[\s>]/i.test(content);
}

export function parseCot(content: string): CotEvent[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(content) as Record<string, unknown>;
  } catch {
    throw new CotParseError('XML CoT illisible');
  }

  const raw = collectEvents(doc);
  const out: CotEvent[] = [];
  for (const node of raw) {
    const event = toEvent(node);
    if (event) out.push(event);
  }
  return out;
}

function collectEvents(node: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      for (const item of asArray(child)) {
        if (!item || typeof item !== 'object') continue;
        if (key === 'event') {
          found.push(item as Record<string, unknown>);
          continue;
        }
        visit(item);
      }
    }
  };
  visit(node);
  return found;
}

function toEvent(node: Record<string, unknown>): CotEvent | null {
  const point = asArray(node.point)[0] as Record<string, unknown> | undefined;
  const lat = Number(point?.['@lat']);
  const lon = Number(point?.['@lon']);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const detail = (asArray(node.detail)[0] ?? {}) as Record<string, unknown>;
  const contact = asArray(detail.contact)[0] as
    | Record<string, unknown>
    | undefined;
  const group = asArray(detail.__group)[0] as
    | Record<string, unknown>
    | undefined;
  const carto = asArray(detail['carto-airsoft'])[0] as
    | Record<string, unknown>
    | undefined;
  const stroke = asArray(detail.strokeColor)[0] as
    | Record<string, unknown>
    | undefined;

  const links: Array<[number, number]> = [];
  for (const link of asArray(detail.link)) {
    const raw = (link as Record<string, unknown>)['@point'];
    if (typeof raw !== 'string') continue;
    const [la, lo] = raw.split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(lo)) links.push([la, lo]);
  }

  const time = asDate(node['@time']);
  return {
    uid: asText(node['@uid']) ?? `cot-${lat},${lon}`,
    type: asText(node['@type']) ?? 'a-u-G',
    time,
    start: asDate(node['@start'], time),
    stale: asDate(node['@stale'], time),
    how: asText(node['@how']) ?? 'h-e',
    point: {
      lat,
      lon,
      hae: numberOrUndefined(point?.['@hae']),
      ce: numberOrUndefined(point?.['@ce']),
      le: numberOrUndefined(point?.['@le']),
    },
    callsign: asText(contact?.['@callsign']) ?? undefined,
    remarks: asText(detail.remarks) ?? undefined,
    group:
      group && asText(group['@name'])
        ? {
            name: asText(group['@name'])!,
            role: asText(group['@role']) ?? 'Team Member',
          }
        : undefined,
    links: links.length > 0 ? links : undefined,
    color: stroke ? hexFromArgb(asText(stroke['@value'])) : undefined,
    cartoIcon: asText(carto?.['@icon']) ?? undefined,
  };
}

// --- Couleurs --------------------------------------------------------------

/** `#RRGGBB` → entier signé ARGB opaque, comme l'attend TAK. */
export function argbFromHex(hex: string): number {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return -1;
  const value = 0xff000000 + parseInt(clean, 16);
  // TAK écrit un entier signé 32 bits : -1 pour du blanc opaque.
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

/** Entier signé ARGB → `#RRGGBB`, ou undefined si illisible. */
export function hexFromArgb(value: string | null): string | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const unsigned = parsed < 0 ? parsed + 0x100000000 : parsed;
  const rgb = unsigned & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}

// --- Utilitaires -----------------------------------------------------------

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text.trim() || null;
  }
  return null;
}

function asDate(value: unknown, fallback = new Date()): Date {
  const text = asText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(asText(value));
  if (!Number.isFinite(n) || n === UNKNOWN) return undefined;
  return n;
}
