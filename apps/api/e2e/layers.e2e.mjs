// E2E « import de préparations externes » (§7.10) : un GeoJSON et un KML
// déposés dans une partie deviennent des objets de carte ordinaires — donc
// synchronisés hors ligne et mélangés aux données de jeu — et le retrait
// d'un calque laisse des pierres tombales que les téléphones savent lire.
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '');
const PASSWORD = process.env.E2E_PASSWORD ?? 'TestE2E2026';

async function token(email) {
  const body = JSON.stringify({ email, password: PASSWORD });
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  let r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: h, body,
  });
  if (!r.ok) r = await fetch(`${SUPABASE}/auth/v1/signup`, { method: 'POST', headers: h, body });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
}

async function api(method, path, tok, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = new Error(`${method} ${path}: ${r.status}`);
    err.status = r.status;
    err.body = await r.text();
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

const orga = await token('test.e2e@cartoairsoft.dev');
const joueur = await token('test.e2e2@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test calques' });
const invitation = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: invitation.token });

// Un joueur connecté doit voir le calque arriver sans rien demander.
const socket = io(`${WS}/game`, {
  transports: ['websocket'],
  auth: { token: joueur },
});
const recus = [];
socket.on('object:upsert', (o) => recus.push(o));
await new Promise((resolve, reject) => {
  socket.on('connect', () => {
    socket.emit('game:join', { gameId: partie.id }, (ack) =>
      ack?.ok ? resolve() : reject(new Error('join refusé')),
    );
  });
  socket.on('connect_error', reject);
});

// --- Import GeoJSON --------------------------------------------------------
const geojson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Poste de commandement', 'marker-color': '#2196F3' },
      geometry: { type: 'Point', coordinates: [2.632, 48.404] },
    },
    {
      type: 'Feature',
      properties: { name: 'Limite de zone', stroke: '#F44336' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.62, 48.40], [2.65, 48.40], [2.65, 48.42], [2.62, 48.40]]],
      },
    },
  ],
});

const calque = await api('POST', `/games/${partie.id}/layers/import`, orga, {
  name: 'Préparation map.army',
  content: geojson,
});
assert(calque.format === 'geojson', 'le format GeoJSON est reconnu tout seul');
assert(calque.featureCount === 2, 'les deux entités sont importées');

// --- Les entités sont des objets de carte ordinaires ------------------------
const sync = await api('GET', `/games/${partie.id}/sync`, joueur);
const importes = sync.objects.filter(
  (o) => o.properties?.layerId === calque.id,
);
assert(importes.length === 2, 'le joueur les reçoit par la synchro habituelle');
assert(
  importes.some((o) => o.kind === 'marker') &&
    importes.some((o) => o.kind === 'zone'),
  'point et polygone gardent leur nature',
);
const pc = importes.find((o) => o.kind === 'marker');
assert(
  pc.properties.unitLabel === 'Poste de commandement',
  'le nom de l’entité est conservé',
);
assert(pc.properties.color === '#2196F3', 'la couleur d’origine est reprise');
assert(
  pc.properties.layerName === 'Préparation map.army',
  'chaque entité sait de quel calque elle vient',
);
const zone = importes.find((o) => o.kind === 'zone');
assert(
  zone.geometry?.type === 'Polygon' && zone.geometry.coordinates[0].length === 4,
  'la géométrie du polygone est intacte',
);

await new Promise((r) => setTimeout(r, 500));
assert(
  recus.filter((o) => o.properties?.layerId === calque.id).length === 2,
  'le calque arrive en direct chez le joueur connecté',
);

// --- Import KML ------------------------------------------------------------
const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Style id="rouge"><LineStyle><color>ff0000ff</color></LineStyle></Style>
  <Placemark>
    <name>Axe de progression</name>
    <styleUrl>#rouge</styleUrl>
    <LineString><coordinates>2.63,48.40,0 2.64,48.41,0</coordinates></LineString>
  </Placemark>
</Document></kml>`;

const calqueKml = await api('POST', `/games/${partie.id}/layers/import`, orga, {
  name: 'Tracé Google Earth',
  content: kml,
});
assert(calqueKml.format === 'kml', 'le format KML est reconnu tout seul');
assert(calqueKml.featureCount === 1, 'la ligne KML est importée');

const sync2 = await api('GET', `/games/${partie.id}/sync`, joueur);
const ligne = sync2.objects.find((o) => o.properties?.layerId === calqueKml.id);
assert(ligne.kind === 'line', 'la LineString devient une ligne');
assert(
  ligne.properties.color === '#FF0000',
  'la couleur KML (aabbggrr) est traduite pour le web',
);

// --- Liste et retrait ------------------------------------------------------
const calques = await api('GET', `/games/${partie.id}/layers`, joueur);
assert(calques.length === 2, 'les deux calques sont listés');

const retrait = await api(
  'DELETE',
  `/games/${partie.id}/layers/${calque.id}`,
  orga,
);
assert(retrait.removed === 2, 'le retrait emporte les entités du calque');

const sync3 = await api('GET', `/games/${partie.id}/sync`, joueur);
const restants = sync3.objects.filter(
  (o) => o.properties?.layerId === calque.id && !o.deletedAt,
);
assert(restants.length === 0, 'plus aucune entité vivante de ce calque');
const tombes = sync3.objects.filter(
  (o) => o.properties?.layerId === calque.id && o.deletedAt,
);
assert(
  tombes.length === 2,
  'des pierres tombales restent pour les téléphones hors ligne (§7.6)',
);
assert(
  sync3.objects.some(
    (o) => o.properties?.layerId === calqueKml.id && !o.deletedAt,
  ),
  'l’autre calque est intact',
);

socket.close();

// --- Refus ------------------------------------------------------------------
let refus = null;
try {
  await api('POST', `/games/${partie.id}/layers/import`, joueur, {
    name: 'Tentative', content: geojson,
  });
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'un joueur sans droit de préparation ne peut pas importer');

refus = null;
try {
  await api('POST', `/games/${partie.id}/layers/import`, orga, {
    name: 'Illisible', content: 'nom;latitude;longitude',
  });
} catch (e) {
  refus = e.status;
}
assert(refus === 400, 'un format inconnu est refusé proprement');

refus = null;
try {
  await api('POST', `/games/${partie.id}/layers/import`, orga, {
    name: 'Vide', content: '{"type":"FeatureCollection","features":[]}',
  });
} catch (e) {
  refus = e.status;
}
assert(refus === 400, 'un fichier sans géométrie est refusé');

console.log('E2E CALQUES IMPORTÉS : TOUT PASSE');
