import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api, type MapObject } from './api';

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

type Mode = 'none' | 'waypoint' | 'line' | 'zone';

export function PrepMap({ gameId }: { gameId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs pour que le handler de clic (attaché une fois) voie l'état courant.
  const modeRef = useRef(mode);
  const draftRef = useRef(draft);
  modeRef.current = mode;
  draftRef.current = draft;

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

  async function load() {
    try {
      const res = await api.sync(gameId);
      setObjects(res.objects.filter((o) => !('deletedAt' in o && o.deletedAt)));
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
            color: kind === 'zone' ? '#F44336' : '#2196F3',
            unitLabel:
              kind === 'zone'
                ? 'Zone'
                : kind === 'line'
                  ? 'Ligne'
                  : 'Point de passage',
            icon: kind === 'marker' ? 'infantry_allied' : undefined,
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
          Point
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
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>
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
