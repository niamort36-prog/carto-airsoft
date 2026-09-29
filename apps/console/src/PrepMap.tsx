import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api, type MapObject, type Objective } from './api';
import {
  AFFILIATIONS,
  symbolLabel,
  symbolsFor,
  SYMBOLS,
  type Affiliation,
  type SymbolEntry,
} from './icons';

/**
 * Carte de préparation (§8) : dessiner zones, lignes et points de passage
 * avant la partie. Les objets partent par la MÊME API que le mobile, donc
 * les joueurs les voient sur le terrain — c'est tout l'intérêt.
 */
const STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    plan: {
      type: 'raster' as const,
      tiles: [
        'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
          '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal' +
          '&TILEMATRIXSET=PM&FORMAT=image%2Fpng' +
          '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      ],
      tileSize: 256,
      attribution: '© IGN — Géoplateforme',
    },
  },
  layers: [{ id: 'plan', type: 'raster' as const, source: 'plan' }],
};

type Mode = 'none' | 'waypoint' | 'line' | 'zone' | 'flag';

/** Couleurs de tracé : celles qui se distinguent sur un fond de forêt. */
const COULEURS = [
  { hex: '#2196F3', label: 'Bleu' },
  { hex: '#F44336', label: 'Rouge' },
  { hex: '#4CAF50', label: 'Vert' },
  { hex: '#FFC107', label: 'Jaune' },
  { hex: '#9C27B0', label: 'Violet' },
  { hex: '#FF9800', label: 'Orange' },
  { hex: '#FFFFFF', label: 'Blanc' },
  { hex: '#000000', label: 'Noir' },
];

const FAMILLES: Record<SymbolEntry['family'], string> = {
  unit: 'Unités',
  structure: 'Structures',
  point: 'Points d’ordre',
};

export function PrepMap({ gameId }: { gameId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Ce qu'on s'apprête à poser : couleur du tracé, symbole du marqueur.
  const [couleur, setCouleur] = useState('#2196F3');
  const [symbole, setSymbole] = useState('infantry_allied');
  const [affiliation, setAffiliation] = useState<Affiliation>('allied');
  const [famille, setFamille] = useState<SymbolEntry['family']>('unit');
  const [pickerOuvert, setPickerOuvert] = useState(false);

  const symboleChoisi =
    SYMBOLS.find((s) => s.id === symbole) ?? SYMBOLS[0];

  // Refs pour que le handler de clic (attaché une fois) voie l'état courant.
  const modeRef = useRef(mode);
  const draftRef = useRef(draft);
  const couleurRef = useRef(couleur);
  const symboleRef = useRef(symbole);
  modeRef.current = mode;
  draftRef.current = draft;
  couleurRef.current = couleur;
  symboleRef.current = symbole;

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [2.632, 48.404],
      zoom: 13,
    });
    m.addControl(new maplibregl.NavigationControl());
    m.on('load', () => {
      m.addSource('prep', { type: 'geojson', data: empty() });
      m.addLayer({
        id: 'prep-fill',
        type: 'fill',
        source: 'prep',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
      });
      m.addLayer({
        id: 'prep-line',
        type: 'line',
        source: 'prep',
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
      });
      m.addLayer({
        id: 'prep-point',
        type: 'circle',
        source: 'prep',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
      m.addSource('draft', { type: 'geojson', data: empty() });
      m.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-dasharray': [2, 1.5],
        },
      });
      m.addLayer({
        id: 'draft-point',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#000',
        },
      });
      load();
    });
    m.on('click', (e) => {
      const current = modeRef.current;
      if (current === 'none') return;
      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (current === 'waypoint') {
        void save('marker', { type: 'Point', coordinates: point }, point);
        setMode('none');
      } else if (current === 'flag') {
        void placerDrapeau(point);
        setMode('none');
      } else {
        setDraft([...draftRef.current, point]);
      }
    });
    map.current = m;
  }, []);

  // Rendu du brouillon en cours de tracé.
  useEffect(() => {
    const src = map.current?.getSource('draft') as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: [
        ...draft.map((c) => feature({ type: 'Point', coordinates: c }, {})),
        ...(draft.length >= 2
          ? [feature({ type: 'LineString', coordinates: draft }, {})]
          : []),
      ],
    } as GeoJSON.FeatureCollection);
  }, [draft]);

  useEffect(() => {
    const src = map.current?.getSource('prep') as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: objects.map((o) =>
        feature(
          // Les marqueurs n'ont pas de géométrie dédiée : on la reconstruit
          // depuis leur position de référence.
          (o.geometry as unknown as GeoJSON.Geometry | null) ?? {
            type: 'Point',
            coordinates: [o.lng, o.lat],
          },
          { color: (o.properties.color as string) ?? '#FF9800' },
        ),
      ),
    } as GeoJSON.FeatureCollection);
  }, [objects]);

  // Les drapeaux se posent en marqueurs HTML : ils ne sont pas des objets
  // de carte, et les mêler aux tracés laisserait croire qu'on les efface
  // de la même façon.
  const marqueursFlags = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    marqueursFlags.current.forEach((m) => m.remove());
    marqueursFlags.current = objectives.map((o) => {
      const el = document.createElement('div');
      el.className = 'flag-marker';
      el.title = o.name;
      el.textContent = '⚑';
      const label = document.createElement('span');
      label.textContent = o.name;
      el.appendChild(label);
      return new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([o.lng, o.lat])
        .addTo(map.current!);
    });
  }, [objectives]);

  async function load() {
    try {
      const [res, flags] = await Promise.all([
        api.sync(gameId),
        api.objectives(gameId).catch(() => [] as Objective[]),
      ]);
      setObjects(res.objects.filter((o) => !('deletedAt' in o && o.deletedAt)));
      setObjectives(flags);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /// Pose un drapeau. Ce n'est PAS un objet de carte : c'est un objectif
  /// arbitré par le serveur (§7.8), avec son QR de capture et son score.
  async function placerDrapeau(point: [number, number]) {
    const nom = prompt('Nom du drapeau', `Drapeau ${objectives.length + 1}`);
    if (nom == null || !nom.trim()) return;
    setError(null);
    try {
      await api.createObjective(gameId, {
        name: nom.trim(),
        lng: point[0],
        lat: point[1],
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(
    kind: string,
    geometry: GeoJSON.Geometry,
    reference: [number, number],
  ) {
    setError(null);
    try {
      await api.pushObjects(gameId, [
        {
          id: crypto.randomUUID(),
          kind,
          markerType: kind === 'marker' ? 'waypoint' : 'poi',
          lat: reference[1],
          lng: reference[0],
          ...(kind === 'marker' ? {} : { geometry }),
          properties: {
            // La couleur et le symbole partent avec l'objet : le terrain
            // voit exactement ce que la console a posé.
            color: couleurRef.current,
            unitLabel:
              kind === 'zone'
                ? 'Zone'
                : kind === 'line'
                  ? 'Ligne'
                  : symbolLabel(symboleRef.current),
            icon: kind === 'marker' ? symboleRef.current : undefined,
          },
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft([]);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function finish(kind: 'line' | 'zone') {
    if (kind === 'line' && draft.length < 2) return;
    if (kind === 'zone' && draft.length < 3) return;
    const geometry: GeoJSON.Geometry =
      kind === 'line'
        ? { type: 'LineString', coordinates: draft }
        : { type: 'Polygon', coordinates: [[...draft, draft[0]]] };
    void save(kind, geometry, draft[0]);
    setMode('none');
  }

  return (
    <>
      <div className="map" ref={container} />
      <div className="toolbar">
        <button
          className={mode === 'waypoint' ? 'primary' : ''}
          onClick={() => {
            setMode(mode === 'waypoint' ? 'none' : 'waypoint');
            setDraft([]);
          }}
        >
          Symbole
        </button>
        <button
          className={mode === 'line' ? 'primary' : ''}
          onClick={() => {
            setMode(mode === 'line' ? 'none' : 'line');
            setDraft([]);
          }}
        >
          Ligne
        </button>
        <button
          className={mode === 'zone' ? 'primary' : ''}
          onClick={() => {
            setMode(mode === 'zone' ? 'none' : 'zone');
            setDraft([]);
          }}
        >
          Zone
        </button>
        <button
          className={mode === 'flag' ? 'primary' : ''}
          onClick={() => {
            setMode(mode === 'flag' ? 'none' : 'flag');
            setDraft([]);
          }}
        >
          Drapeau
        </button>

        {/* La couleur vaut pour ce qu'on s'apprête à tracer. Elle voyage
            dans `properties.color`, donc le terrain voit la même. */}
        {(mode === 'line' || mode === 'zone' || mode === 'waypoint') && (
          <span className="swatches">
            {COULEURS.map((c) => (
              <button
                key={c.hex}
                title={c.label}
                className={`swatch ${couleur === c.hex ? 'selected' : ''}`}
                style={{ background: c.hex }}
                onClick={() => setCouleur(c.hex)}
              />
            ))}
          </span>
        )}

        {mode === 'waypoint' && (
          <button onClick={() => setPickerOuvert(true)}>
            <img src={symboleChoisi.url} alt="" className="swatch-icon" />
            {symbolLabel(symboleChoisi.id)}
          </button>
        )}

        {(mode === 'line' || mode === 'zone') && (
          <>
            <span className="muted" style={{ alignSelf: 'center' }}>
              {draft.length} pt
            </span>
            <button onClick={() => finish(mode)}>Valider</button>
            <button
              onClick={() => {
                setDraft([]);
                setMode('none');
              }}
            >
              Annuler
            </button>
          </>
        )}
        {mode !== 'none' && mode !== 'line' && mode !== 'zone' && (
          <span className="muted" style={{ alignSelf: 'center' }}>
            Cliquez sur la carte
          </span>
        )}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>

      {pickerOuvert && (
        <dialog open className="picker">
          <h1>Choisir un symbole</h1>
          <div className="row">
            {AFFILIATIONS.map((a) => (
              <button
                key={a.key}
                className={affiliation === a.key ? 'primary' : ''}
                onClick={() => setAffiliation(a.key)}
              >
                <span
                  className="swatch-dot"
                  style={{ background: a.color }}
                />
                {a.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {(['unit', 'structure', 'point'] as const).map((f) => (
              <button
                key={f}
                className={famille === f ? 'primary' : ''}
                onClick={() => setFamille(f)}
              >
                {FAMILLES[f]}
              </button>
            ))}
          </div>
          <div className="symbol-grid">
            {symbolsFor(famille, affiliation).map((s) => (
              <button
                key={s.id}
                className={`symbol ${symbole === s.id ? 'selected' : ''}`}
                title={symbolLabel(s.id)}
                onClick={() => {
                  setSymbole(s.id);
                  setPickerOuvert(false);
                }}
              >
                <img src={s.url} alt={symbolLabel(s.id)} />
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => setPickerOuvert(false)}>
              Fermer
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

const empty = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

const feature = (
  geometry: GeoJSON.Geometry,
  properties: Record<string, unknown>,
): GeoJSON.Feature => ({ type: 'Feature', geometry, properties });
