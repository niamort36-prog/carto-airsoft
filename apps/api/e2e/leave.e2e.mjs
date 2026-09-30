// E2E « quitter la partie » : un joueur invité peut partir, il disparaît des
// membres et de sa propre liste, et peut revenir avec un nouveau QR. Le
// créateur, lui, ne peut pas quitter la sienne — elle deviendrait invisible
// pour lui alors qu'il en reste propriétaire.
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '');
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error(
    'E2E_PASSWORD manquant. Ces scripts ouvrent de vrais comptes sur le ' +
      'projet Supabase de test : le mot de passe ne vit pas dans le dépôt. ' +
      'Voir README, section « Tests E2E ».',
  );
}

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

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

const orga = await token('test.e2e@cartoairsoft.dev');
const joueur = await token('test.e2e2@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test départ' });
const invitation = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: invitation.token });

let membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(membres.length === 2, 'le joueur invité est bien dans la partie');

// Le commandant, resté connecté, doit voir le départ en direct.
const socket = io(`${WS}/game`, {
  transports: ['websocket'],
  auth: { token: orga },
});
const parti = new Promise((resolve) => socket.on('member:left', resolve));
await new Promise((resolve, reject) => {
  socket.on('connect', () => {
    socket.emit('game:join', { gameId: partie.id }, (ack) =>
      ack?.ok ? resolve() : reject(new Error('join refusé')),
    );
  });
  socket.on('connect_error', reject);
});

await api('POST', `/games/${partie.id}/leave`, joueur);
console.log('le joueur a quitté ✓');

const evenement = await Promise.race([
  parti,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('aucun member:left reçu')), 5000),
  ),
]);
assert(
  typeof evenement?.membershipId === 'string',
  'le commandant reçoit member:left en direct',
);
socket.close();

membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(membres.length === 1, 'il ne compte plus parmi les membres');

const sesParties = await api('GET', '/games', joueur);
assert(
  !sesParties.some((p) => p.game.id === partie.id),
  'la partie a disparu de sa liste',
);

// Sans appartenance, plus aucun accès aux données de la partie.
let refus = null;
try {
  await api('GET', `/games/${partie.id}/members`, joueur);
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'un partant n’accède plus aux membres : 403');

// Le créateur ne peut pas quitter la sienne.
refus = null;
try {
  await api('POST', `/games/${partie.id}/leave`, orga);
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'le créateur ne peut pas quitter sa partie : 403');

// Un nouveau QR le fait revenir : le départ n'est pas une exclusion.
const retour = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: retour.token });
membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(membres.length === 2, 'il revient avec un nouveau QR');

console.log('E2E DÉPART : TOUT PASSE');
