import { io } from 'socket.io-client';

// E2E « interopérabilité CoT » (§3) : un lot d'événements venu d'un client
// TAK devient un calque avec la bonne affiliation, et l'export rend la
// situation dans la même langue — SANS jamais livrer les positions d'en
// face, ni par un compte de joueur ni par une clé d'API.

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
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

async function text(path, tok) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
  return { type: r.headers.get('content-type') ?? '', body: await r.text() };
}

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

const orga = await token('test.e2e@cartoairsoft.dev');
const joueur = await token('test.e2e2@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test CoT' });
const equipeBleue = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const equipeRouge = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Rouge', color: '#F44336',
});
await api('POST', `/games/${partie.id}/objectives`, orga, {
  name: 'Drapeau Alpha', lat: 48.4065, lng: 2.632,
});
const invitation = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: invitation.token });

// L'orga dans Bleu, le joueur dans Rouge : deux camps, donc masquage.
const membres = await api('GET', `/games/${partie.id}/members`, orga);
const moi = membres.find((m) => m.role === 'commandant');
const lui = membres.find((m) => m.role === 'joueur');
await api(
  'PATCH',
  `/games/${partie.id}/members/${moi.membershipId}/assignment`,
  orga,
  { teamId: equipeBleue.id },
);
await api(
  'PATCH',
  `/games/${partie.id}/members/${lui.membershipId}/assignment`,
  orga,
  { teamId: equipeRouge.id },
);

// --- Import d'un lot CoT ---------------------------------------------------
const cot = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>
  <event version="2.0" uid="ANDROID-001" type="a-h-G-U-C"
         time="2026-08-27T10:00:00Z" start="2026-08-27T10:00:00Z"
         stale="2026-08-27T11:00:00Z" how="h-e">
    <point lat="48.4050" lon="2.6300" hae="9999999" ce="9999999" le="9999999"/>
    <detail><contact callsign="ENI-01"/><remarks>section repérée</remarks></detail>
  </event>
  <event version="2.0" uid="ANDROID-002" type="b-m-p-w"
         time="2026-08-27T10:00:00Z" start="2026-08-27T10:00:00Z"
         stale="2026-08-27T11:00:00Z" how="h-e">
    <point lat="48.4030" lon="2.6280"/>
    <detail><contact callsign="Point de regroupement"/></detail>
  </event>
  <event version="2.0" uid="ANDROID-003" type="u-d-f"
         time="2026-08-27T10:00:00Z" start="2026-08-27T10:00:00Z"
         stale="2026-08-27T11:00:00Z" how="h-e">
    <point lat="48.4010" lon="2.6260"/>
    <detail>
      <strokeColor value="-65536"/>
      <link point="48.4010,2.6260"/>
      <link point="48.4010,2.6360"/>
      <link point="48.4070,2.6360"/>
      <link point="48.4010,2.6260"/>
    </detail>
  </event>
</events>`;

const calque = await api('POST', `/games/${partie.id}/layers/import`, orga, {
  name: 'Situation ATAK',
  content: cot,
});
assert(calque.format === 'cot', 'le CoT est reconnu tout seul, malgré son XML');
assert(calque.featureCount === 3, 'les trois événements sont importés');

const sync = await api('GET', `/games/${partie.id}/sync`, orga);
const importes = sync.objects.filter(
  (o) => o.properties?.layerId === calque.id,
);
const hostile = importes.find((o) => o.properties.unitLabel === 'ENI-01');
assert(
  hostile.properties.icon === 'infantry_hostile',
  'l’affiliation hostile du type CoT devient un insigne rouge chez nous',
);
const passage = importes.find(
  (o) => o.properties.unitLabel === 'Point de regroupement',
);
assert(
  passage.properties.icon === 'waypoint',
  'un point de passage CoT reste un point de passage',
);
const trace = importes.find((o) => o.kind === 'zone');
assert(
  trace && trace.geometry.type === 'Polygon',
  'un tracé fermé devient une zone',
);
assert(
  trace.properties.color === '#FF0000',
  'la couleur ARGB signée de TAK est traduite',
);

// --- Export pour un membre -------------------------------------------------
const exportOrga = await text(`/games/${partie.id}/cot`, orga);
assert(
  exportOrga.type.includes('xml'),
  'l’export s’annonce comme du XML',
);
assert(
  exportOrga.body.includes('<events>') && exportOrga.body.includes('<event '),
  'l’export est bien un lot d’événements CoT',
);
assert(
  exportOrga.body.includes('carto-objective-'),
  'les drapeaux sont exportés',
);
assert(
  exportOrga.body.includes('ENI-01'),
  'les marqueurs posés le sont aussi',
);
assert(
  /stale="[^"]+"/.test(exportOrga.body),
  'chaque événement porte sa péremption (§2.4)',
);

// --- Le masquage anti-triche tient aussi en CoT ----------------------------
// Le joueur (Rouge) transmet vraiment sa position : sans cela, l'absence de
// position adverse dans l'export ne prouverait rien.
const socket = io(`${WS}/game`, {
  transports: ['websocket'],
  auth: { token: joueur },
});
await new Promise((resolve, reject) => {
  socket.on('connect', () => {
    socket.emit('game:join', { gameId: partie.id }, (ack) =>
      ack?.ok ? resolve() : reject(new Error('join refusé')),
    );
  });
  socket.on('connect_error', reject);
});
socket.emit('position', { gameId: partie.id, lat: 48.4088, lng: 2.6377 });
await new Promise((r) => setTimeout(r, 800));

// Le joueur, lui, voit bien sa propre position dans SON export.
const exportJoueur = await text(`/games/${partie.id}/cot`, joueur);
assert(
  exportJoueur.body.includes(`carto-member-${lui.membershipId}`),
  'un joueur retrouve sa propre position dans son export',
);
assert(
  exportJoueur.body.includes('48.4088'),
  'avec ses coordonnées réelles',
);

const exportApresPosition = await text(`/games/${partie.id}/cot`, orga);
const membresOrga = await api('GET', `/games/${partie.id}/members`, orga);
const adverse = membresOrga.find((m) => m.role === 'joueur');
assert(
  adverse.lastPosition === null,
  'l’API masque déjà la position adverse',
);
assert(
  !exportApresPosition.body.includes(`carto-member-${lui.membershipId}`),
  'l’export CoT du camp d’en face ne contient pas cet allié adverse (§2.1)',
);
assert(
  !exportApresPosition.body.includes('48.4088'),
  'et pas davantage ses coordonnées, sous quelque forme que ce soit',
);
socket.close();

// --- Export par clé d'API : jamais de joueurs ------------------------------
const cle = await api('POST', '/api-keys', orga, {
  name: 'Passerelle TAK', scopes: ['read'], gameIds: [partie.id],
});
const parCle = await fetch(`${API}/public/games/${partie.id}/cot`, {
  headers: { 'X-API-Key': cle.token },
});
const corps = await parCle.text();
assert(parCle.status === 200, 'une clé de lecture obtient l’export CoT');
assert(corps.includes('carto-objective-'), 'elle voit les drapeaux');
assert(
  !corps.includes('carto-member-'),
  'mais aucun joueur, même de son propre camp',
);

console.log('E2E COT : TOUT PASSE');
