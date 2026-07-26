// E2E hiérarchie (§5 version jouable) : créateur = commandant (insigne
// command), nomination par le commandant seul, insigne modifiable
// uniquement sur un rang strictement inférieur, tri descendant des membres.
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
  if (!r.ok) {
    r = await fetch(`${SUPABASE}/auth/v1/signup`, { method: 'POST', headers: h, body });
  }
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

const expect403 = async (fn, label) => {
  try {
    await fn();
    throw new Error(`PROBLEME: ${label} aurait dû être refusé`);
  } catch (e) {
    if (e.status !== 403) throw e;
    console.log(`${label}: 403 ✓`);
  }
};

const t1 = await token('test.e2e@cartoairsoft.dev');   // futur commandant
const t2 = await token('test.e2e2@cartoairsoft.dev');  // futur capitaine
const t3 = await token('test.e2e3@cartoairsoft.dev');  // joueur

const game = await api('POST', '/games', t1, { name: 'Test hiérarchie' });
await api('POST', `/games/${game.id}/join`, t2);
await api('POST', `/games/${game.id}/join`, t3);

let members = await api('GET', `/games/${game.id}/members`, t1);
const byEmail = (email) => members.find((m) => m.email === email);
const cdt = byEmail('test.e2e@cartoairsoft.dev');
const p2 = byEmail('test.e2e2@cartoairsoft.dev');
const p3 = byEmail('test.e2e3@cartoairsoft.dev');

if (cdt.role !== 'commandant' || cdt.unitType !== 'command') {
  throw new Error(`créateur: role=${cdt.role} unitType=${cdt.unitType}`);
}
console.log('créateur = commandant, insigne command ✓');
if (p2.role !== 'joueur' || p2.unitType !== 'infantry') {
  throw new Error('nouveau membre devrait être joueur/infantry');
}
console.log('nouveau membre = joueur, insigne infantry ✓');

// Un joueur ne peut pas se nommer ni nommer autrui
await expect403(
  () => api('PATCH', `/games/${game.id}/members/${p3.membershipId}`, t2, { role: 'capitaine' }),
  'nomination par un joueur',
);

// Le commandant nomme le joueur 2 capitaine
const promoted = await api('PATCH', `/games/${game.id}/members/${p2.membershipId}`, t1, { role: 'capitaine' });
if (promoted.role !== 'capitaine') throw new Error('promotion échouée');
console.log('commandant nomme un capitaine ✓');

// Personne ne rétrograde le commandant
await expect403(
  () => api('PATCH', `/games/${game.id}/members/${cdt.membershipId}`, t1, { role: 'joueur' }),
  'rétrograder le commandant',
);

// Le capitaine change l'insigne du joueur 3 (rang inférieur) → sniper
const badged = await api('PATCH', `/games/${game.id}/members/${p3.membershipId}`, t2, { unitType: 'sniper' });
if (badged.unitType !== 'sniper') throw new Error('insigne non appliqué');
console.log('capitaine change l’insigne d’un joueur → sniper ✓');

// Le capitaine ne touche PAS l'insigne du commandant (rang supérieur)
await expect403(
  () => api('PATCH', `/games/${game.id}/members/${cdt.membershipId}`, t2, { unitType: 'radio' }),
  'insigne du commandant par un capitaine',
);

// Le joueur 3 ne touche pas l'insigne du capitaine
await expect403(
  () => api('PATCH', `/games/${game.id}/members/${p2.membershipId}`, t3, { unitType: 'mortar' }),
  'insigne d’un capitaine par un joueur',
);

// Tri descendant : commandant, capitaine, joueur
members = await api('GET', `/games/${game.id}/members`, t1);
const roles = members.map((m) => m.role).join(' > ');
if (roles !== 'commandant > capitaine > joueur') {
  throw new Error(`ordre inattendu: ${roles}`);
}
console.log(`ordre hiérarchique: ${roles} ✓`);

console.log('E2E HIÉRARCHIE : TOUT PASSE');
