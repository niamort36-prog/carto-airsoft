import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  api,
  ROLE_LABELS,
  type GameStats,
  type Replay as ReplayData,
  type ReplayUnit,
} from './api';
import { positionAt } from './replay-timeline';

/**
 * Rejeu de fin de partie (§8, statistiques post-partie).
 *
 * Toute la partie tient en mémoire : on ne rejoue pas en interrogeant le
 * serveur image par image, on déplace un curseur dans une trace déjà
 * chargée. C'est ce qui rend le rembobinage et l'accéléré immédiats.
 *
 * Le serveur ne sert ce rejeu qu'une fois la partie terminée : il montre
 * les positions de tout le monde, ce qui serait un avantage de terrain si
 * on pouvait le consulter en jeu (§2.1).
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

const SPEEDS = [1, 2, 4, 8, 16, 32] as const;

export function Replay({ gameId }: { gameId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [data, setData] = useState<ReplayData | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [trails, setTrails] = useState(true);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([api.replay(gameId), api.stats(gameId)])
      .then(([r, s]) => {
        setData(r);
        setStats(s);
        setCursor(r.from);
      })
      .catch((e: Error) => setError(e.message));
  }, [gameId]);

  // --- Carte ---------------------------------------------------------------
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
      m.addSource('trails', { type: 'geojson', data: emptyCollection() });
      m.addLayer({
        id: 'trails',
        type: 'line',
        source: 'trails',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.45,
        },
      });
      m.addSource('events', { type: 'geojson', data: emptyCollection() });
      m.addLayer({
        id: 'events',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      m.addSource('units', { type: 'geojson', data: emptyCollection() });
      m.addLayer({
        id: 'units',
        type: 'circle',
        source: 'units',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      m.addLayer({
        id: 'unit-labels',
        type: 'symbol',
        source: 'units',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [1, 0],
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        },
      });
      map.current = m;
      setMapReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const [mapReady, setMapReady] = useState(false);

  // Cadrer sur la partie dès que la trace est là.
  useEffect(() => {
    if (!mapReady || !data || !map.current) return;
    const points = data.units.flatMap((u) => u.track);
    if (points.length === 0) return;
    const bounds = points.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new maplibregl.LngLatBounds(
        [points[0].lng, points[0].lat],
        [points[0].lng, points[0].lat],
      ),
    );
    // Le panneau a pu changer de taille depuis la création de la carte.
    map.current.resize();
    map.current.fitBounds(bounds, { padding: 60, duration: 0 });
  }, [mapReady, data]);

  // --- Lecture -------------------------------------------------------------
  useEffect(() => {
    if (!playing || !data) return;
    let raf = 0;
    let last = performance.now();
    // Un navigateur suspend l'animation d'un onglet caché : au retour, la
    // première image annonce parfois plusieurs secondes d'un coup. Sans
    // borne, le rejeu ferait un bond — on plafonne donc le pas.
    const MAX_STEP_MS = 250;
    const step = (now: number) => {
      const elapsed = Math.min(now - last, MAX_STEP_MS);
      last = now;
      setCursor((c) => {
        const next = c + elapsed * speed;
        if (next >= data.to) {
          setPlaying(false);
          return data.to;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, data]);

  // --- Rendu du moment courant --------------------------------------------
  useEffect(() => {
    if (!mapReady || !data || !map.current) return;
    const m = map.current;

    const units = data.units
      .map((u) => ({ unit: u, at: positionAt(u.track, cursor) }))
      .filter((x) => x.at !== null);

    (m.getSource('units') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: units.map(({ unit, at }) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [at!.lng, at!.lat] },
        properties: {
          color: unit.teamColor ?? '#9E9E9E',
          label: unit.pseudo ?? 'Sans nom',
        },
      })),
    });

    (m.getSource('trails') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: trails
        ? data.units
            .map((u) => ({
              unit: u,
              coords: u.track
                .filter((p) => p.t <= cursor)
                .map((p) => [p.lng, p.lat] as [number, number]),
            }))
            .filter((x) => x.coords.length >= 2)
            .map(({ unit, coords }) => ({
              type: 'Feature' as const,
              geometry: { type: 'LineString' as const, coordinates: coords },
              properties: { color: unit.teamColor ?? '#9E9E9E' },
            }))
        : [],
    });

    (m.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      // Un événement apparaît quand il arrive et reste : c'est ce qu'on veut
      // relire après coup, l'accumulation des faits.
      features: data.events
        .filter((e) => e.t <= cursor)
        .map((e) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
          properties: {
            color: e.kind === 'capture' ? '#FFC107' : '#E91E63',
          },
        })),
    });
  }, [mapReady, data, cursor, trails]);

  const visibles = useMemo(
    () =>
      data
        ? data.units.filter((u) => positionAt(u.track, cursor) !== null).length
        : 0,
    [data, cursor],
  );

  const duration = data ? data.to - data.from : 0;
  const elapsed = data ? cursor - data.from : 0;

  return (
    <div className="panel">
      <div className="row">
        <h2 className="grow">Rejeu{data ? ` — ${data.game.name}` : ''}</h2>
        {data && (
          <span className="muted">
            {visibles} / {data.units.length} unités en piste
          </span>
        )}
      </div>

      {error && (
        <>
          <div className="error">{error}</div>
          <p className="muted">
            Le bilan et le rejeu s’ouvrent une fois la partie terminée : ils
            montrent les positions de tout le monde.
          </p>
        </>
      )}
      {!data && !error && <p className="muted">Chargement du rejeu…</p>}

      {/* Toujours monté ET visible : la carte s'initialise au premier rendu,
          et un conteneur masqué n'aurait aucune dimension — MapLibre ne
          chargerait alors aucune tuile. */}
      <div ref={container} className="replay-map" />

      {data && (
      <div className="replay-controls">
        <button onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Lecture'}
        </button>
        <button onClick={() => { setPlaying(false); setCursor(data.from); }}>
          ⏮ Début
        </button>

        <input
          type="range"
          min={data.from}
          max={data.to}
          step={1000}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="grow"
        />

        <span className="clock">
          {formatElapsed(elapsed)} / {formatElapsed(duration)}
        </span>

        <div className="speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={s === speed ? 'selected' : ''}
              onClick={() => setSpeed(s)}
            >
              ×{s}
            </button>
          ))}
        </div>

        <label className="row">
          <input
            type="checkbox"
            checked={trails}
            onChange={(e) => setTrails(e.target.checked)}
          />
          Traces
        </label>
      </div>
      )}

      {data && (
        <p className="muted">
          {new Date(cursor).toLocaleTimeString('fr-FR')} — le curseur se
          déplace aussi à la main, la lecture reprend là où on l’a laissé.
        </p>
      )}

      {stats && <StatsTable stats={stats} />}
    </div>
  );
}

function StatsTable({ stats }: { stats: GameStats }) {
  return (
    <>
      <h2>Bilan par équipe</h2>
      <table className="stats">
        <thead>
          <tr>
            <th>Équipe</th>
            <th>Score</th>
            <th>Captures</th>
            <th>Distance</th>
          </tr>
        </thead>
        <tbody>
          {stats.teams.map((t) => (
            <tr key={t.teamId}>
              <td>
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </td>
              <td>{t.score}</td>
              <td>{t.captures}</td>
              <td>{formatDistance(t.distanceMeters)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Bilan par joueur</h2>
      <table className="stats">
        <thead>
          <tr>
            <th>Joueur</th>
            <th>Grade</th>
            <th>Distance</th>
            <th>Temps</th>
            <th>Captures</th>
            <th>Marqueurs</th>
          </tr>
        </thead>
        <tbody>
          {stats.players.map((p) => (
            <tr key={p.membershipId}>
              <td>{p.pseudo ?? 'Sans nom'}</td>
              <td>{ROLE_LABELS[p.role] ?? p.role}</td>
              <td>{formatDistance(p.distanceMeters)}</td>
              <td>{formatElapsed(p.activeSeconds * 1000)}</td>
              <td>{p.captures}</td>
              <td>{p.markersPlaced}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${meters} m`
    : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export type { ReplayUnit };
