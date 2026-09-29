/**
 * Catalogue de symboles, lu directement dans le pack de l'application
 * mobile (`apps/mobile/assets/icons/`).
 *
 * Il n'est PAS recopié ici : une copie divergerait au premier symbole
 * ajouté, et la console proposerait des icônes que le terrain ne sait pas
 * dessiner. Vite résout ces chemins à la compilation et n'embarque que ce
 * qui est référencé.
 */

const unitsRaw = import.meta.glob(
  '../../mobile/assets/icons/units/*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const structuresRaw = import.meta.glob(
  '../../mobile/assets/icons/structures/*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const pointsRaw = import.meta.glob(
  '../../mobile/assets/icons/points/*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

export type Affiliation = 'allied' | 'hostile' | 'neutral' | 'unknown';

export const AFFILIATIONS: Array<{
  key: Affiliation;
  label: string;
  color: string;
}> = [
  { key: 'allied', label: 'Allié', color: '#2196F3' },
  { key: 'hostile', label: 'Hostile', color: '#F44336' },
  { key: 'neutral', label: 'Neutre', color: '#4CAF50' },
  { key: 'unknown', label: 'Inconnu', color: '#FFC107' },
];

export interface SymbolEntry {
  /** Identifiant tel que le mobile l'attend dans `properties.icon`. */
  id: string;
  url: string;
  family: 'unit' | 'structure' | 'point';
  affiliation: Affiliation | null;
}

function build(
  raw: Record<string, string>,
  family: SymbolEntry['family'],
): SymbolEntry[] {
  return Object.entries(raw)
    .map(([chemin, url]) => {
      const id = chemin.split('/').pop()!.replace('.png', '');
      const suffixe = AFFILIATIONS.find((a) => id.endsWith(`_${a.key}`));
      return {
        id,
        url,
        family,
        affiliation: suffixe?.key ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const SYMBOLS: SymbolEntry[] = [
  ...build(unitsRaw, 'unit'),
  ...build(structuresRaw, 'structure'),
  ...build(pointsRaw, 'point'),
];

/** Symboles d'une famille, pour une affiliation donnée. */
export function symbolsFor(
  family: SymbolEntry['family'],
  affiliation: Affiliation,
): SymbolEntry[] {
  return SYMBOLS.filter(
    (s) =>
      s.family === family &&
      // Les points d'ordre n'ont pas de camp : ils décrivent une manœuvre,
      // pas une unité.
      (s.affiliation === null || s.affiliation === affiliation),
  );
}

/** Libellé lisible d'un identifiant de symbole. */
export function symbolLabel(id: string): string {
  const sans = AFFILIATIONS.reduce(
    (acc, a) => acc.replace(`_${a.key}`, ''),
    id,
  );
  return sans.replace(/_/g, ' ');
}
