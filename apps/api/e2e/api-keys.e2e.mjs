// E2E « API publique et clés » (§7.11) : portées, portée de partie,
// révocation — et surtout ce qui ne doit JAMAIS sortir par cette porte :
// aucune position de joueur, aucun jeton de QR.

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
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

/** Appel avec une clé d'API : renvoie { status, body }, sans lever. */
async function withKey(method, path, apiKey, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

const orga = await token('test.e2e@cartoairsoft.dev');
const joueur = await token('test.e2e2@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test API publique' });

// Une équipe, un objectif, un joueur : de quoi avoir des données à lire.
const equipe = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const objectif = await api('POST', `/games/${partie.id}/objectives`, orga, {
  name: 'Drapeau Alpha', lat: 48.4065, lng: 2.632,
});
assert(typeof objectif.token === 'string', 'l’objectif a bien un jeton de QR');
const invitation = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', joueur, { token: invitation.token });

// --- Création de la clé ----------------------------------------------------
const creee = await api('POST', '/api-keys', orga, {
  name: 'Tableau des scores',
  scopes: ['read'],
  gameIds: [partie.id],
});
assert(typeof creee.token === 'string', 'le secret est rendu à la création');
assert(creee.token.startsWith(creee.prefix + '.'), 'le secret porte son préfixe');

const listee = await api('GET', '/api-keys', orga);
const memeCle = listee.find((k) => k.id === creee.id);
assert(memeCle && !('token' in memeCle), 'la liste ne redonne jamais le secret');

// --- Lecture ---------------------------------------------------------------
let r = await withKey('GET', `/public/games/${partie.id}`, creee.token);
assert(r.status === 200 && r.body.name === 'Test API publique', 'la clé lit la partie');

r = await withKey('GET', `/public/games/${partie.id}/scores`, creee.token);
assert(
  r.status === 200 && r.body.some((t) => t.id === equipe.id),
  'la clé lit les scores',
);

r = await withKey('GET', `/public/games/${partie.id}/objectives`, creee.token);
assert(r.status === 200 && r.body.length === 1, 'la clé lit les objectifs');
assert(
  !JSON.stringify(r.body).includes(objectif.token) &&
    !('tokenHash' in r.body[0]) &&
    !('token' in r.body[0]),
  'aucun jeton de QR ne sort avec les objectifs',
);

r = await withKey('GET', `/public/games/${partie.id}/members`, creee.token);
assert(r.status === 200 && r.body.length === 2, 'la clé lit la composition');
const champs = Object.keys(r.body[0]);
assert(
  !champs.some((c) => /lat|lng|position/i.test(c)),
  'aucune position ne sort avec les membres (§2.1)',
);

// --- Portées ---------------------------------------------------------------
r = await withKey('PATCH', `/public/games/${partie.id}/status`, creee.token, {
  status: 'live',
});
assert(r.status === 401 || r.status === 403, 'une clé de lecture ne peut pas écrire');

const ecriture = await api('POST', '/api-keys', orga, {
  name: 'Pupitre', scopes: ['write'], gameIds: [partie.id],
});
r = await withKey('PATCH', `/public/games/${partie.id}/status`, ecriture.token, {
  status: 'live',
});
assert(r.status === 200 && r.body.status === 'live', 'une clé d’écriture lance la partie');
r = await withKey('GET', `/public/games/${partie.id}`, ecriture.token);
assert(r.status === 200, 'l’écriture contient la lecture');

// --- Portée de partie ------------------------------------------------------
const autre = await api('POST', '/games', joueur, { name: 'Partie du voisin' });
r = await withKey('GET', `/public/games/${autre.id}`, creee.token);
assert(r.status === 403, 'une clé ne sort pas des parties qu’elle vise');

// Même sans liste de parties, une clé reste enfermée chez son propriétaire.
const toutes = await api('POST', '/api-keys', orga, {
  name: 'Toutes mes parties', scopes: ['read'],
});
r = await withKey('GET', `/public/games/${partie.id}`, toutes.token);
assert(r.status === 200, 'une clé sans liste lit les parties de son propriétaire');
r = await withKey('GET', `/public/games/${autre.id}`, toutes.token);
assert(r.status === 403, 'mais jamais celle d’un tiers');

// Ouvrir une clé sur la partie d'autrui est refusé dès la création.
let refus = null;
try {
  await api('POST', '/api-keys', orga, {
    name: 'Indiscrète', scopes: ['read'], gameIds: [autre.id],
  });
} catch (e) {
  refus = e.status;
}
assert(refus === 403, 'impossible d’ouvrir une clé sur la partie d’un tiers');

// --- Clé invalide et révocation -------------------------------------------
r = await withKey('GET', `/public/games/${partie.id}`, 'ca_inexistante.secret');
assert(r.status === 401, 'une clé inconnue est refusée');

r = await withKey('GET', `/public/games/${partie.id}`, `${creee.prefix}.mauvais`);
assert(r.status === 401, 'un secret faux est refusé malgré le bon préfixe');

await api('DELETE', `/api-keys/${creee.id}`, orga);
r = await withKey('GET', `/public/games/${partie.id}`, creee.token);
assert(r.status === 401, 'une clé révoquée ne sert plus');

// Sans en-tête du tout.
const nue = await fetch(`${API}/public/games/${partie.id}`);
assert(nue.status === 401, 'sans clé, la porte reste fermée');

console.log('E2E API PUBLIQUE : TOUT PASSE');
