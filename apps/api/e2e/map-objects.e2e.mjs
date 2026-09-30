// E2E marqueurs (§7.6) : idempotence du batch, delta de synchro, tombstone,
// contrôle d'auteur, et diffusion WebSocket object:upsert.
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '') + '/game';
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error(
    'E2E_PASSWORD manquant. Ces scripts ouvrent de vrais comptes sur le ' +
      'projet Supabase de test : le mot de passe ne vit pas dans le dépôt. ' +
      'Voir README, section « Tests E2E ».',
  );
}
const EMAIL1 = process.env.E2E_EMAIL ?? 'test.e2e@cartoairsoft.dev';
const EMAIL2 = process.env.E2E_EMAIL2 ?? 'test.e2e2@cartoairsoft.dev';

async function token(email, password) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
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
  return r.json();
}

const t1 = await token(EMAIL1, PASSWORD);
const t2 = await token(EMAIL2, PASSWORD);

const game = await api('POST', '/games', t1, { name: 'Test marqueurs' });
await api('POST', `/games/${game.id}/join`, t2);
console.log(`partie: ${game.id}`);

// s2 écoute les diffusions WebSocket
const s2 = await new Promise((resolve, reject) => {
  const s = io(WS, { auth: { token: t2 }, transports: ['websocket'] });
  s.on('connect', () => s.emit('game:join', { gameId: game.id }, () => resolve(s)));
  s.on('connect_error', reject);
});
const receivedUpserts = [];
s2.on('object:upsert', (o) => receivedUpserts.push(o));

// 1. Pose d'un marqueur hostile par le joueur 1 (id client)
const markerId = randomUUID();
const createdAt = new Date().toISOString();
const marker = {
  id: markerId,
  markerType: 'unit',
  lat: 48.406,
  lng: 2.629,
  properties: { icon: 'infantry_hostile', label: 'Section ENI aperçue' },
  createdAt,
};
const res1 = await api('POST', `/games/${game.id}/map-objects/batch`, t1, {
  objects: [marker],
});
console.log(`pose: ${res1[0].properties.icon} @ (${res1[0].lat}, ${res1[0].lng}) ✓`);

// 2. Idempotence : le MÊME lot renvoyé (file offline rejouée) → toujours 1 objet
await api('POST', `/games/${game.id}/map-objects/batch`, t1, { objects: [marker] });
const all = await api('GET', `/games/${game.id}/sync`, t2);
if (all.objects.length !== 1) throw new Error(`attendu 1 objet, obtenu ${all.objects.length}`);
console.log('idempotence sur id client: 1 seul objet après double envoi ✓');

// 3. Delta : curseur = serverTime → rien de nouveau
const empty = await api('GET', `/games/${game.id}/sync?since=${encodeURIComponent(all.serverTime)}`, t2);
if (empty.objects.length !== 0) throw new Error('delta non vide inattendu');
console.log('delta vide après curseur à jour ✓');

// 4. Le joueur 2 ne peut PAS modifier le marqueur du joueur 1
try {
  await api('POST', `/games/${game.id}/map-objects/batch`, t2, {
    objects: [{ ...marker, lat: 0, lng: 0 }],
  });
  throw new Error('PROBLEME: modification par un non-auteur acceptée');
} catch (e) {
  if (e.status !== 403) throw e;
  console.log('modification par un non-auteur: 403 ✓');
}

// 5. Suppression (tombstone) par l'auteur → visible dans le delta
const res5 = await api('POST', `/games/${game.id}/map-objects/batch`, t1, {
  objects: [{ ...marker, deleted: true }],
});
if (!res5[0].deletedAt) throw new Error('tombstone absent');
const delta = await api('GET', `/games/${game.id}/sync?since=${encodeURIComponent(all.serverTime)}`, t2);
if (delta.objects.length !== 1 || !delta.objects[0].deletedAt) {
  throw new Error('le tombstone n’apparaît pas dans le delta');
}
console.log('tombstone présent dans le delta de synchro ✓');

// 6. Diffusion WebSocket : s2 a reçu les upserts en direct
await new Promise((r) => setTimeout(r, 500));
if (receivedUpserts.length < 2) throw new Error(`diffusion WS: ${receivedUpserts.length} reçus`);
const last = receivedUpserts[receivedUpserts.length - 1];
console.log(`diffusion WS: ${receivedUpserts.length} object:upsert reçus (dernier: deleted=${last.deletedAt != null}) ✓`);

s2.close();
console.log('E2E MARQUEURS : TOUT PASSE');
process.exit(0);
