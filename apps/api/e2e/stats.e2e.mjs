// E2E « statistiques et rejeu de fin de partie » : la trace s'écrit au fil
// du jeu, le bilan et le rejeu ne s'ouvrent qu'une fois la partie terminée
// — les servir plus tôt donnerait à l'organisateur la vue complète du
// terrain adverse, ce que le §2.1 refuse.
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

const partie = await api('POST', '/games', orga, { name: 'Test stats' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const invitation = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: invitation.token });

const membres = await api('GET', `/games/${partie.id}/members`, orga);
const lui = membres.find((m) => m.role === 'joueur');
await api(
  'PATCH',
  `/games/${partie.id}/members/${lui.membershipId}/assignment`,
  orga,
  { teamId: bleu.id },
);

// --- La trace s'écrit pendant le jeu ---------------------------------------
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

// Un parcours vers le nord : ~1112 m par centième de degré de latitude.
const etapes = [
  [48.4000, 2.6320],
  [48.4050, 2.6320],
  [48.4100, 2.6320],
];
for (const [lat, lng] of etapes) {
  socket.emit('position', { gameId: partie.id, lat, lng });
  // La trace ne garde qu'un point toutes les dix secondes : sans cette
  // attente, les deux derniers seraient écartés comme trop rapprochés.
  await new Promise((r) => setTimeout(r, 10_500));
}
await new Promise((r) => setTimeout(r, 500));
socket.close();

// --- Fermé tant que la partie n'est pas terminée ---------------------------
let refus = null;
try {
  await api('GET', `/games/${partie.id}/stats`, orga);
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'le bilan reste fermé pendant la partie');

refus = null;
try {
  await api('GET', `/games/${partie.id}/replay`, orga);
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'le rejeu aussi — il montre tout le monde (§2.1)');

// Sa propre trace, en revanche, ne révèle que soi.
const maTrace = await api('GET', `/games/${partie.id}/my-track`, joueur);
assert(
  maTrace.length >= 2,
  'chacun consulte sa propre trace même partie en cours',
);
assert(
  maTrace.every((p) => typeof p.t === 'number' && typeof p.lat === 'number'),
  'la trace est horodatée point par point',
);

// --- Une fois terminée -----------------------------------------------------
const cle = await api('POST', '/api-keys', orga, {
  name: 'Pupitre', scopes: ['write'], gameIds: [partie.id],
});
const fin = await fetch(`${API}/public/games/${partie.id}/status`, {
  method: 'PATCH',
  headers: { 'X-API-Key': cle.token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'finished' }),
});
assert(fin.status === 200, 'la partie est déclarée terminée');

const bilan = await api('GET', `/games/${partie.id}/stats`, orga);
assert(bilan.game.status === 'finished', 'le bilan s’ouvre');
const joueurStats = bilan.players.find(
  (p) => p.membershipId === lui.membershipId,
);
assert(
  joueurStats.distanceMeters > 1000,
  `la distance parcourue est mesurée (${joueurStats.distanceMeters} m)`,
);
assert(
  joueurStats.activeSeconds >= 20,
  `le temps d’activité aussi (${joueurStats.activeSeconds} s)`,
);
assert(
  bilan.teams.some((t) => t.teamId === bleu.id),
  'le bilan par équipe est là',
);

const rejeu = await api('GET', `/games/${partie.id}/replay`, orga);
assert(rejeu.from < rejeu.to, 'le rejeu a des bornes de temps cohérentes');
const unite = rejeu.units.find((u) => u.membershipId === lui.membershipId);
assert(unite.track.length >= 3, 'la trace de l’unité est complète');
assert(
  unite.track[0].t < unite.track[unite.track.length - 1].t,
  'les points sont dans l’ordre chronologique',
);
assert(unite.teamColor === '#2196F3', 'la couleur d’équipe accompagne l’unité');
assert(
  rejeu.units.length === membres.length,
  'toutes les unités de la partie sont dans le rejeu',
);

console.log('E2E STATISTIQUES ET REJEU : TOUT PASSE');
