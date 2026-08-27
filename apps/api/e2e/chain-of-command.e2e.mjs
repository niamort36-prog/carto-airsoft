// E2E « chaîne de commandement » : un capitaine forme ses escouades et prend
// des hommes sous ses ordres, sans jamais déborder de son camp ni toucher à
// quelqu'un de son rang ou au-dessus (§5).

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

const partie = await api('POST', '/games', orga, { name: 'Test commandement' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const rouge = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Rouge', color: '#F44336',
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
const leCommandant = membres.find((m) => m.role === 'commandant');
const leCapitaine = membres.find((m) => m.role === 'capitaine');
const leSoldat = membres.find((m) => m.role === 'joueur');

// Capitaine et soldat dans le camp Bleu.
for (const m of [leCapitaine, leSoldat]) {
  await api(
    'PATCH',
    `/games/${partie.id}/members/${m.membershipId}/assignment`,
    orga,
    { teamId: bleu.id },
  );
}

// --- Le capitaine forme son escouade ---------------------------------------
const alpha = await api('POST', `/games/${partie.id}/squads`, capitaine, {
  teamId: bleu.id,
  name: 'Alpha',
});
assert(alpha.name === 'Alpha', 'un capitaine forme une escouade');

let organisation = await api('GET', `/games/${partie.id}/teams`, capitaine);
let vueAlpha = organisation
  .flatMap((t) => t.squads)
  .find((s) => s.id === alpha.id);
assert(
  vueAlpha.reportsToMembershipId === leCapitaine.membershipId,
  'elle lui est rattachée d’emblée, sans manipulation en plus',
);

// --- Il y place un homme, puis en fait son chef ----------------------------
await api(
  'PATCH',
  `/games/${partie.id}/members/${leSoldat.membershipId}/assignment`,
  capitaine,
  { squadId: alpha.id },
);
membres = await api('GET', `/games/${partie.id}/members`, capitaine);
assert(
  membres.find((m) => m.membershipId === leSoldat.membershipId).squadId ===
    alpha.id,
  'il y place un homme',
);

await api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, capitaine, {
  leaderMembershipId: leSoldat.membershipId,
});
organisation = await api('GET', `/games/${partie.id}/teams`, capitaine);
vueAlpha = organisation.flatMap((t) => t.squads).find((s) => s.id === alpha.id);
assert(
  vueAlpha.leaderMembershipId === leSoldat.membershipId,
  'et lui confie l’escouade',
);

// Un chef doit d'abord être DANS l'escouade.
const dehors = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, capitaine, {
    leaderMembershipId: leCommandant.membershipId,
  }),
);
assert(dehors === 400, 'on ne nomme pas chef quelqu’un qui n’y est pas');

// --- Des hommes sous ses ordres, sans grade et hors escouade ---------------
const inviteAutre = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur',
});
const autre = await token('test.e2e4@cartoairsoft.dev');
await api('POST', '/join', autre, { token: inviteAutre.token });
membres = await api('GET', `/games/${partie.id}/members`, orga);
const lAutre = membres.find(
  (m) => m.role === 'joueur' && m.membershipId !== leSoldat.membershipId,
);
await api(
  'PATCH',
  `/games/${partie.id}/members/${lAutre.membershipId}/assignment`,
  orga,
  { teamId: bleu.id },
);

await api(
  'PATCH',
  `/games/${partie.id}/members/${lAutre.membershipId}/assignment`,
  capitaine,
  { reportsToMembershipId: leCapitaine.membershipId },
);
membres = await api('GET', `/games/${partie.id}/members`, capitaine);
const rattache = membres.find((m) => m.membershipId === lAutre.membershipId);
assert(
  rattache.reportsToMembershipId === leCapitaine.membershipId,
  'un homme sans grade passe sous les ordres du capitaine',
);
assert(
  rattache.squadId === null && rattache.role === 'joueur',
  'sans escouade et sans grade — c’est bien une subordination, pas un groupe',
);

// --- Les bornes -------------------------------------------------------------
const surLeCommandant = await refus(() =>
  api(
    'PATCH',
    `/games/${partie.id}/members/${leCommandant.membershipId}/assignment`,
    capitaine,
    { teamId: rouge.id },
  ),
);
assert(surLeCommandant === 403, 'un capitaine ne déplace pas son commandant');

const autreCamp = await refus(() =>
  api('POST', `/games/${partie.id}/squads`, capitaine, {
    teamId: rouge.id,
    name: 'Chez le voisin',
  }),
);
assert(autreCamp === 403, 'ni ne forme d’escouade dans le camp adverse');

const parUnJoueur = await refus(() =>
  api('POST', `/games/${partie.id}/squads`, soldat, {
    teamId: bleu.id,
    name: 'Sans permission',
  }),
);
assert(parUnJoueur === 403, 'un joueur ne forme pas d’escouade');

const superieurTropBas = await refus(() =>
  api(
    'PATCH',
    `/games/${partie.id}/members/${lAutre.membershipId}/assignment`,
    orga,
    { reportsToMembershipId: leSoldat.membershipId },
  ),
);
assert(
  superieurTropBas === 400,
  'on ne relève pas d’un joueur : il faut un capitaine ou un commandant',
);

// --- Le commandant chapeaute le tout ---------------------------------------
await api('PATCH', `/games/${partie.id}/squads/${alpha.id}`, orga, {
  reportsToMembershipId: leCommandant.membershipId,
});
organisation = await api('GET', `/games/${partie.id}/teams`, orga);
vueAlpha = organisation.flatMap((t) => t.squads).find((s) => s.id === alpha.id);
assert(
  vueAlpha.reportsToMembershipId === leCommandant.membershipId,
  'le commandant peut reprendre une escouade à son compte',
);

console.log('E2E CHAÎNE DE COMMANDEMENT : TOUT PASSE');
