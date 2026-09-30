// E2E « étiquettes » : le texte peint à côté d'une icône — fréquence radio,
// indicatif, numéro de véhicule. Sa portée suit celle de l'insigne : la
// sienne toujours, celle d'un subordonné avec la permission, jamais celle
// d'un supérieur.

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
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

async function refus(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.status;
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

const orga = await token('test.e2e@cartoairsoft.dev');
const capitaine = await token('test.e2e2@cartoairsoft.dev');
const soldat = await token('test.e2e3@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test étiquettes' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});

const inviteCap = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'capitaine',
});
await api('POST', '/join', capitaine, { token: inviteCap.token });
const inviteSoldat = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
await api('POST', '/join', soldat, { token: inviteSoldat.token });

let membres = await api('GET', `/games/${partie.id}/members`, orga);
const leCapitaine = membres.find((m) => m.role === 'capitaine');
const leSoldat = membres.find((m) => m.role === 'joueur');
for (const m of [leCapitaine, leSoldat]) {
  await api(
    'PATCH',
    `/games/${partie.id}/members/${m.membershipId}/assignment`,
    orga,
    { teamId: bleu.id },
  );
}

const vue = async (tok, id) =>
  (await api('GET', `/games/${partie.id}/members`, tok)).find(
    (m) => m.membershipId === id,
  );

// --- Sa propre étiquette : toujours -----------------------------------------
assert(
  (await vue(soldat, leSoldat.membershipId)).note === null,
  'un homme démarre sans étiquette',
);

await api('PATCH', `/games/${partie.id}/members/${leSoldat.membershipId}`, soldat, {
  note: '446.00625',
});
assert(
  (await vue(soldat, leSoldat.membershipId)).note === '446.00625',
  'chacun pose sa propre fréquence, sans permission particulière',
);

// --- Celle d'un subordonné : avec la permission d'insigne -------------------
await api('PATCH', `/games/${partie.id}/members/${leSoldat.membershipId}`, capitaine, {
  note: 'ALPHA 2',
});
assert(
  (await vue(capitaine, leSoldat.membershipId)).note === 'ALPHA 2',
  'le capitaine étiquette un homme de son camp',
);

// --- Jamais vers le haut ----------------------------------------------------
const versLeHaut = await refus(() =>
  api('PATCH', `/games/${partie.id}/members/${leCapitaine.membershipId}`, soldat, {
    note: 'RIEN',
  }),
);
assert(versLeHaut === 403, 'un joueur n’étiquette pas son capitaine');

// --- Vider efface -----------------------------------------------------------
await api('PATCH', `/games/${partie.id}/members/${leSoldat.membershipId}`, soldat, {
  note: '',
});
assert(
  (await vue(soldat, leSoldat.membershipId)).note === null,
  'un champ vidé efface l’étiquette, il ne pose pas un texte vide',
);

// --- Une étiquette reste courte : elle est peinte sur la carte --------------
const tropLongue = await refus(() =>
  api('PATCH', `/games/${partie.id}/members/${leSoldat.membershipId}`, soldat, {
    note: 'x'.repeat(25),
  }),
);
assert(tropLongue === 400, 'au-delà de 24 caractères, elle mangerait la carte');

// --- L'étiquette d'une escouade appartient au groupe ------------------------
const alpha = await api('POST', `/games/${partie.id}/squads`, capitaine, {
  teamId: bleu.id,
  name: 'Alpha',
});
const squadVue = async (tok) =>
  (await api('GET', `/games/${partie.id}/teams`, tok))
    .flatMap((t) => t.squads)
    .find((s) => s.id === alpha.id);

assert((await squadVue(capitaine)).note === null, 'une escouade naît sans étiquette');

await api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, capitaine, {
  note: '446.09375',
});
assert(
  (await squadVue(capitaine)).note === '446.09375',
  'le capitaine donne au groupe la fréquence de son réseau',
);

const parUnJoueur = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, soldat, {
    note: 'DETOURNEE',
  }),
);
assert(parUnJoueur === 403, 'un joueur ne réétiquette pas l’escouade');

await api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, capitaine, {
  note: '   ',
});
assert(
  (await squadVue(capitaine)).note === null,
  'des espaces ne font pas une étiquette',
);

console.log('E2E ÉTIQUETTES : TOUT PASSE');
