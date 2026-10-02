import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  BASEMAPS,
  COVERS,
  type Basemap,
  type MapObject,
  type Objective,
} from './api';
import {
  AFFILIATIONS,
  symbolLabel,
  symbolsFor,
  SYMBOLS,
  type Affiliation,
  type SymbolEntry,
} from './icons';
import type { MapStore } from './mapStore';

/**
 * Éditeur de carte (§8) : tracer zones, lignes, symboles et drapeaux.
 *
 * Il ne sait pas ce qu'il édite — une carte préparée réutilisable ou la
 * carte d'une partie en cours. C'est le [MapStore] qu'on lui donne qui le
 * décide. Le geste est le même, la destination non.
 */

/** Sources de tuiles, une par fond. */
const TUILES: Record<Basemap, { url: string; attribution: string }> = {
  ortho_ign: {
    url:
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image%2Fjpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '© IGN — Géoplateforme',
  },
  plan_ign: {
    url:
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal' +
      '&TILEMATRIXSET=PM&FORMAT=image%2Fpng' +
      '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '© IGN — Géoplateforme',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
  },
  relief: {
    url:
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=ELEVATION.SLOPES&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image%2Fjpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '© IGN — Géoplateforme',
  },
};

const style = (fond: Basemap) => ({
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    fond: {
      type: 'raster' as const,
      tiles: [TUILES[fond].url],
      tileSize: 256,
      attribution: TUILES[fond].attribution,
    },
  },
  layers: [{ id: 'fond', type: 'raster' as const, source: 'fond' }],
});

type Mode = 'none' | 'symbole' | 'ligne' | 'zone' | 'drapeau';

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

export function MapEditor({
  store,
  onBasemapChange,
}: {
  store: MapStore;
  onBasemapChange?: (b: Basemap) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [couleur, setCouleur] = useState('#2196F3');
  const [symbole, setSymbole] = useState('infantry_allied');
  const [affiliation, setAffiliation] = useState<Affiliation>('allied');
  const [famille, setFamille] = useState<SymbolEntry['family']>('unit');
  const [pickerOuvert, setPickerOuvert] = useState(false);
  // Ce qu'une zone représente sur le terrain. C'est cette étiquette que le
  // drone consulte : le serveur n'a aucune carte d'occupation du sol.
  const [couvert, setCouvert] = useState('');

  const symboleChoisi = SYMBOLS.find((s) => s.id === symbole) ?? SYMBOLS[0];

  // Refs pour que le handler de clic (attaché une fois) voie l'état courant.
  const modeRef = useRef(mode);
  const draftRef = useRef(draft);
  const couleurRef = useRef(couleur);
  const symboleRef = useRef(symbole);
  const couvertRef = useRef(couvert);
  const storeRef = useRef(store);
  modeRef.current = mode;
  draftRef.current = draft;
  couleurRef.current = couleur;
  symboleRef.current = symbole;
  couvertRef.current = couvert;
  storeRef.current = store;

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: style(store.basemap),
      center: [2.632, 48.404],
      zoom: 13,
    });
    m.addControl(new maplibregl.NavigationControl());
    m.on('load', () => {
      m.addSource('prep', { type: 'geojson', data: vide() });
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
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
      });
      m.addLayer({
        id: 'prep-point',
        type: 'circle',
        source: 'prep',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 6,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      m.addSource('draft', { type: 'geojson', data: vide() });
      m.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
      m.addLayer({
        id: 'draft-point',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#fff',
          'circle-radius': 4,
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1,
        },
      });
      void recharger();
    });
    m.on('click', (e) => {
      const courant = modeRef.current;
      if (courant === 'none') return;
      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (courant === 'symbole') {
        void poser('marker', { type: 'Point', coordinates: point }, point);
        setMode('none');
      } else if (courant === 'drapeau') {
        void poserDrapeau(point);
        setMode('none');
      } else {
        setDraft([...draftRef.current, point]);
      }
    });
    // Mémorise la vue : on rouvre la carte là où on l'a laissée.
    m.on('moveend', () => {
      const c = m.getCenter();
      storeRef.current.rememberView?.({
        centerLat: c.lat,
        centerLng: c.lng,
        zoom: m.getZoom(),
      });
    });
    map.current = m;
  }, []);

  // Changement de fond : MapLibre remplace tout le style, il faut donc
  // reposer les couches de dessin derrière.
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('prep');
    if (!source) return;
    m.setStyle(style(store.basemap));
    m.once('styledata', () => {
      if (m.getSource('prep')) return;
      m.addSource('prep', { type: 'geojson', data: vide() });
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
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
      });
      m.addLayer({
        id: 'prep-point',
        type: 'circle',
        source: 'prep',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 6,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      dessiner(objects);
    });
  }, [store.basemap]);

  useEffect(() => {
    dessiner(objects);
  }, [objects]);

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

  // Les drapeaux sont des marqueurs HTML : ce ne sont pas des dessins, et
  // les mêler aux tracés laisserait croire qu'on les efface pareil.
  const marqueursDrapeaux = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    marqueursDrapeaux.current.forEach((m) => m.remove());
    if (!map.current) return;
    marqueursDrapeaux.current = objectives.map((o) => {
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

  function dessiner(liste: MapObject[]) {
    const src = map.current?.getSource('prep') as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: liste.map((o) =>
        feature(
          (o.geometry as unknown as GeoJSON.Geometry | null) ?? {
            type: 'Point',
            coordinates: [o.lng, o.lat],
          },
          { color: (o.properties.color as string) ?? '#FF9800' },
        ),
      ),
    } as GeoJSON.FeatureCollection);
  }

  async function recharger() {
    try {
      const { objects: o, objectives: d } = await storeRef.current.load();
      setObjects(o);
      setObjectives(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function poser(
    kind: 'marker' | 'line' | 'zone',
    geometry: GeoJSON.Geometry,
    reference: [number, number],
  ) {
    setError(null);
    try {
      await storeRef.current.addObject({
        kind,
        lat: reference[1],
        lng: reference[0],
        geometry,
        properties: {
          // La couleur et le symbole partent avec l'objet : le terrain voit
          // exactement ce que la console a posé.
          color: couleurRef.current,
          unitLabel:
            kind === 'zone'
              ? 'Zone'
              : kind === 'line'
                ? 'Ligne'
                : symbolLabel(symboleRef.current),
          ...(kind === 'marker' ? { icon: symboleRef.current } : {}),
          // Seule une zone peut couvrir : une ligne n'abrite personne.
          ...(kind === 'zone' && couvertRef.current
            ? { cover: couvertRef.current }
            : {}),
        },
      });
      setDraft([]);
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function poserDrapeau(point: [number, number]) {
    const nom = prompt('Nom du drapeau', `Drapeau ${objectives.length + 1}`);
    if (nom == null || !nom.trim()) return;
    setError(null);
    try {
      await storeRef.current.addObjective({
        name: nom.trim(),
        lng: point[0],
        lat: point[1],
      });
      await recharger();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function terminer(kind: 'ligne' | 'zone') {
    // Dire pourquoi, plutôt que de ne rien faire : un « Valider » sans
    // effet et sans message ressemble à un bouton cassé.
    const minimum = kind === 'ligne' ? 2 : 3;
    if (draft.length < minimum) {
      setError(
        `Il faut au moins ${minimum} points — cliquez sur la carte pour en ` +
          `poser (${draft.length} pour l’instant).`,
      );
      return;
    }
    setError(null);
    const geometry: GeoJSON.Geometry =
      kind === 'ligne'
        ? { type: 'LineString', coordinates: draft }
        : { type: 'Polygon', coordinates: [[...draft, draft[0]]] };
    void poser(kind === 'ligne' ? 'line' : 'zone', geometry, draft[0]);
    setMode('none');
  }

  const outil = (m: Mode, libelle: string) => (
    <button
      className={mode === m ? 'primary' : ''}
      onClick={() => {
        setMode(mode === m ? 'none' : m);
        setDraft([]);
      }}
    >
      {libelle}
    </button>
  );

  return (
    <>
      <div className="map" ref={container} />
      <div className="toolbar">
        {outil('symbole', 'Symbole')}
        {outil('ligne', 'Ligne')}
        {outil('zone', 'Zone')}
        {outil('drapeau', 'Drapeau')}

        {store.setBasemap && (
          <select
            value={store.basemap}
            onChange={(e) => {
              const b = e.target.value as Basemap;
              void store.setBasemap!(b);
              onBasemapChange?.(b);
            }}
          >
            {BASEMAPS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        )}

        {(mode === 'ligne' || mode === 'zone' || mode === 'symbole') && (
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

        {mode === 'zone' && (
          <select
            value={couvert}
            onChange={(e) => setCouvert(e.target.value)}
            title="Ce que cette zone représente sur le terrain"
          >
            <option value="">Zone ordinaire</option>
            {COVERS.map((c) => (
              <option key={c.key} value={c.key}>
                Couvert : {c.label}
              </option>
            ))}
          </select>
        )}

        {mode === 'symbole' && (
          <button onClick={() => setPickerOuvert(true)}>
            <img src={symboleChoisi.url} alt="" className="swatch-icon" />
            {symbolLabel(symboleChoisi.id)}
          </button>
        )}

        {(mode === 'ligne' || mode === 'zone') && (
          <>
            <span className="muted" style={{ alignSelf: 'center' }}>
              {draft.length} pt
            </span>
            <button onClick={() => terminer(mode)}>Valider</button>
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
        {(mode === 'symbole' || mode === 'drapeau') && (
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
                <span className="swatch-dot" style={{ background: a.color }} />
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

const vide = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

const feature = (
  geometry: GeoJSON.Geometry,
  properties: Record<string, unknown>,
): GeoJSON.Feature => ({ type: 'Feature', geometry, properties });
