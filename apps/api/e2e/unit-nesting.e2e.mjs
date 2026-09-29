// E2E « chaîne de commandement profonde » : des unités qui s'emboîtent —
// une compagnie contient des sections, qui contiennent des groupes — deux
// commandants dans la même partie, et une unité rattachée directement à un
// gradé sans échelon intermédiaire.

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
const second = await token('test.e2e2@cartoairsoft.dev');
const joueur = await token('test.e2e3@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test emboîtement' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const rouge = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Rouge', color: '#F44336',
});

for (const [tok, role] of [[second, 'joueur'], [joueur, 'joueur']]) {
  const invite = await api('POST', `/games/${partie.id}/invites`, orga, { role });
  await api('POST', '/join', tok, { token: invite.token });
}
let membres = await api('GET', `/games/${partie.id}/members`, orga);
const leChef = membres.find((m) => m.role === 'commandant');
const autres = membres.filter((m) => m.membershipId !== leChef.membershipId);
const leSecond = autres[0];
const leJoueur = autres[1];
for (const m of autres) {
  await api(
    'PATCH', `/games/${partie.id}/members/${m.membershipId}/assignment`, orga,
    { teamId: bleu.id },
  );
}

// --- Deux commandants dans la même partie ---------------------------------
await api('PATCH', `/games/${partie.id}/members/${leSecond.membershipId}`, orga, {
  role: 'commandant',
});
membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(
  membres.filter((m) => m.role === 'commandant').length === 2,
  'une partie peut compter deux commandants',
);

const surSoi = await refus(() =>
  api('PATCH', `/games/${partie.id}/members/${leChef.membershipId}`, orga, {
    role: 'joueur',
  }),
);
assert(surSoi === 403, 'on ne change pas son propre grade');

// --- Une compagnie, ses sections, ses groupes ------------------------------
const compagnie = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: '1re Compagnie', echelon: 'compagnie',
});
assert(compagnie.echelon === 'compagnie', 'une unité déclare son échelon');

const section = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: '1re Section', echelon: 'section',
  parentSquadId: compagnie.id,
});
assert(
  section.parentSquadId === compagnie.id,
  'une section entre dans une compagnie',
);
assert(
  section.reportsToMembershipId === null,
  'entrée dans une unité, elle ne relève plus d’un gradé en direct',
);

const groupe = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: 'Groupe 1', echelon: 'groupe',
  parentSquadId: section.id,
});
const equipe = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: 'Équipe Bravo', echelon: 'equipe',
  parentSquadId: groupe.id,
});
assert(
  equipe.parentSquadId === groupe.id,
  'quatre échelons s’emboîtent : compagnie › section › groupe › équipe',
);

// --- Les bornes du réalisme ------------------------------------------------
const alEnvers = await refus(() =>
  api('POST', `/games/${partie.id}/squads`, orga, {
    teamId: bleu.id, name: 'Section dans un groupe', echelon: 'section',
    parentSquadId: groupe.id,
  }),
);
assert(alEnvers === 400, 'on ne met pas une section dans un groupe');

const memeEchelon = await refus(() =>
  api('POST', `/games/${partie.id}/squads`, orga, {
    teamId: bleu.id, name: 'Groupe dans un groupe', echelon: 'groupe',
    parentSquadId: groupe.id,
  }),
);
assert(memeEchelon === 400, 'ni un groupe dans un groupe : il faut monter d’un cran');

const autreCamp = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: rouge.id, name: 'Section adverse', echelon: 'section',
});
const traverseLesLignes = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${groupe.id}`, orga, {
    parentSquadId: autreCamp.id,
  }),
);
assert(
  traverseLesLignes === 400,
  'une unité ne se rattache pas à une unité du camp adverse',
);

const boucle = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${compagnie.id}`, orga, {
    parentSquadId: equipe.id,
  }),
);
assert(boucle === 400, 'un rattachement ne referme jamais une boucle');

const surSoiMeme = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${groupe.id}`, orga, {
    parentSquadId: groupe.id,
  }),
);
assert(surSoiMeme === 400, 'une unité ne se contient pas elle-même');

// --- Rattachement direct à un commandant, sans échelon intermédiaire -------
const detachee = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: 'Groupe autonome', echelon: 'groupe',
});
await api('PATCH', `/games/${partie.id}/squads/${detachee.id}`, orga, {
  reportsToMembershipId: leSecond.membershipId,
});
let organisation = await api('GET', `/games/${partie.id}/teams`, orga);
let vue = organisation.flatMap((t) => t.squads).find((s) => s.id === detachee.id);
assert(
  vue.reportsToMembershipId === leSecond.membershipId &&
    vue.parentSquadId === null,
  'un groupe peut relever directement d’un commandant, sans section au-dessus',
);

// Le lien est exclusif : entrer dans une unité coupe le lien au gradé.
await api('PATCH', `/games/${partie.id}/squads/${detachee.id}`, orga, {
  parentSquadId: section.id,
});
organisation = await api('GET', `/games/${partie.id}/teams`, orga);
vue = organisation.flatMap((t) => t.squads).find((s) => s.id === detachee.id);
assert(
  vue.parentSquadId === section.id && vue.reportsToMembershipId === null,
  'une unité relève d’une unité OU d’un gradé, jamais des deux',
);

// --- Changer l'échelon ne doit pas casser un emboîtement existant ---------
const promotionImpossible = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${groupe.id}`, orga, {
    echelon: 'compagnie',
  }),
);
assert(
  promotionImpossible === 400,
  'un groupe ne devient pas compagnie tant qu’il est dans une section',
);

// --- Le dernier commandant ne peut pas être rétrogradé --------------------
await api('PATCH', `/games/${partie.id}/members/${leSecond.membershipId}`, orga, {
  role: 'capitaine',
});
const dernier = await refus(() =>
  api('PATCH', `/games/${partie.id}/members/${leChef.membershipId}`, second, {
    role: 'joueur',
  }),
);
assert(
  dernier === 403,
  'la partie ne peut pas rester sans commandant',
);

// --- Un joueur ne réorganise rien ------------------------------------------
const parUnJoueur = await refus(() =>
  api('PATCH', `/games/${partie.id}/squads/${groupe.id}`, joueur, {
    parentSquadId: compagnie.id,
  }),
);
assert(parUnJoueur === 403, 'un joueur ne réorganise pas la chaîne');

console.log('E2E EMBOÎTEMENT DES UNITÉS : TOUT PASSE');
