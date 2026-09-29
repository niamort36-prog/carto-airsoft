// E2E « code d'invitation » : rejoindre en tapant un code court, à côté du
// QR. Le code se dicte à la voix sur un parking ; le QR se scanne. Les deux
// mènent à la même invitation, avec le même grade et le même camp.

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
const bleuJoueur = await token('test.e2e2@cartoairsoft.dev');
const rougeJoueur = await token('test.e2e3@cartoairsoft.dev');
const gradee = await token('test.e2e4@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test code' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const rouge = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Rouge', color: '#F44336',
});

// --- Un code par camp, et un pour l'encadrement ---------------------------
const inviteBleu = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur', teamId: bleu.id,
});
const inviteRouge = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur', teamId: rouge.id,
});
const inviteCap = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'capitaine', teamId: bleu.id,
});

assert(
  /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inviteBleu.code),
  'le code est court, en majuscules et coupé en deux',
);
assert(
  !/[OIL01]/.test(inviteBleu.code.replace('-', '')),
  'aucun caractère ambigu : ni O/0, ni I/1/L',
);
assert(
  inviteBleu.code !== inviteRouge.code,
  'deux invitations ne partagent pas un code',
);

// --- Le code se réaffiche, à la différence du jeton -----------------------
const liste = await api('GET', `/games/${partie.id}/invites`, orga);
const revu = liste.find((i) => i.id === inviteBleu.id);
assert(
  revu.code === inviteBleu.code,
  'le code reste lisible après coup — c’est tout son intérêt',
);
assert(
  revu.token === undefined,
  'le jeton du QR, lui, ne se réaffiche jamais (§7.2)',
);

// --- Voir avant de s'engager ----------------------------------------------
const apercu = await api('POST', '/join/preview', bleuJoueur, {
  token: inviteBleu.code,
});
assert(
  apercu.gameName === 'Test code' &&
    apercu.role === 'joueur' &&
    apercu.teamName === 'Bleu',
  'l’aperçu annonce la partie, le grade et le camp sans rejoindre',
);
let membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(membres.length === 1, 'l’aperçu n’inscrit personne');

// --- Rejoindre en tapant le code ------------------------------------------
const rejointBleu = await api('POST', '/join', bleuJoueur, {
  token: inviteBleu.code,
});
assert(rejointBleu.role === 'joueur', 'le code fait entrer dans la partie');
membres = await api('GET', `/games/${partie.id}/members`, orga);
const lui = membres.find((m) => m.membershipId !== membres[0].membershipId);
assert(
  membres.some((m) => m.teamId === bleu.id && m.role === 'joueur'),
  'et place d’emblée dans le camp que le code porte',
);

// --- La saisie humaine est tolérée ----------------------------------------
const rejointRouge = await api('POST', '/join', rougeJoueur, {
  token: `  ${inviteRouge.code.toLowerCase().replace('-', ' ')}  `,
});
assert(
  rejointRouge.gameId === partie.id,
  'minuscules, espaces et tiret : on ne piège pas celui qui tape',
);
membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(
  membres.some((m) => m.teamId === rouge.id),
  'et le camp adverse se rejoint par son propre code',
);

// --- Le grade vient du code, jamais du joueur -----------------------------
await api('POST', '/join', gradee, { token: inviteCap.code });
membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(
  membres.filter((m) => m.role === 'capitaine').length === 1,
  'un code d’encadrement donne le grade qu’il porte',
);

// --- Le QR continue de marcher --------------------------------------------
const inviteQr = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur', teamId: bleu.id,
});
const parUrl = await api('POST', '/join/preview', bleuJoueur, {
  token: inviteQr.url,
});
assert(
  parUrl.gameName === 'Test code',
  'l’URL du QR mène à la même invitation que le code',
);

// --- Un gradé recrute lui-même, dans sa limite ----------------------------
// C'est le cœur du « si activé » : la permission `invites:manage` est dans
// la matrice, réglable par partie. Le capitaine l'a par défaut.
membres = await api('GET', `/games/${partie.id}/members`, orga);
const leCapitaine = membres.find((m) => m.role === 'capitaine');
const sesPermissions = await api(
  'GET', `/games/${partie.id}/permissions`, gradee,
);
assert(
  sesPermissions.mine.includes('invites:manage'),
  'le capitaine reçoit le droit d’inviter par la matrice, pas par son grade',
);

const parLeCapitaine = await api('POST', `/games/${partie.id}/invites`, gradee, {
  role: 'joueur', teamId: bleu.id,
});
assert(
  parLeCapitaine.code.length === 9,
  'il génère lui-même un code pour un grade inférieur',
);

const memeGrade = await api('POST', `/games/${partie.id}/invites`, gradee, {
  role: 'capitaine',
});
assert(memeGrade.active, 'et peut recruter à son propre grade');

const auDessus = await refus(() =>
  api('POST', `/games/${partie.id}/invites`, gradee, { role: 'commandant' }),
);
assert(
  auDessus === 400,
  'mais jamais au-dessus : le commandant ne se fabrique pas par code',
);

const sansPermission = await refus(() =>
  api('POST', `/games/${partie.id}/invites`, rougeJoueur, { role: 'joueur' }),
);
assert(
  sansPermission === 403,
  'et un joueur sans la permission n’invite personne',
);

// --- Inviter DANS son unité, pas seulement dans la partie ----------------
// C'est le geste « rejoins mon escouade » : le scan place l'ami à côté de
// soi, sans que personne ait à l'affecter ensuite.
const monGroupe = await api('POST', `/games/${partie.id}/squads`, orga, {
  teamId: bleu.id, name: 'MON GROUPE', echelon: 'groupe',
});
const inviteGroupe = await api('POST', `/games/${partie.id}/invites`, orga, {
  role: 'joueur', teamId: bleu.id, squadId: monGroupe.id,
});
const apercuGroupe = await api('POST', '/join/preview', rougeJoueur, {
  token: inviteGroupe.code,
});
assert(
  apercuGroupe.teamName === 'Bleu' && apercuGroupe.squadName === 'MON GROUPE',
  'un code peut porter le camp ET l’unité',
);

const ami = await token('test.e2e11@cartoairsoft.dev');
await api('POST', '/join', ami, { token: inviteGroupe.code });
membres = await api('GET', `/games/${partie.id}/members`, orga);
assert(
  membres.some((m) => m.squadId === monGroupe.id),
  'et le scan dépose directement dans l’unité',
);

// --- Le QR réaffichable : le code survit à sa création --------------------
const listeApres = await api('GET', `/games/${partie.id}/invites`, gradee);
const sien = listeApres.find((i) => i.id === parLeCapitaine.id);
assert(
  sien.code === parLeCapitaine.code,
  'son code se relit plus tard — il peut ressortir son téléphone',
);

// --- Le code porté par une URL (le QR réaffichable) -----------------------
const parUrlCode = await api('POST', '/join/preview', bleuJoueur, {
  token: `https://carto.exemple.fr/j/${inviteQr.code}`,
});
assert(
  parUrlCode.gameName === 'Test code',
  'un code encodé dans une URL se résout comme un code nu',
);

// --- Ce qui ne passe pas ---------------------------------------------------
const inconnu = await refus(() =>
  api('POST', '/join', bleuJoueur, { token: 'ZZZZ-ZZZZ' }),
);
assert(inconnu === 404, 'un code inventé ne mène nulle part');

await api('DELETE', `/games/${partie.id}/invites/${inviteRouge.id}`, orga);
const revoque = await refus(() =>
  api('POST', '/join/preview', rougeJoueur, { token: inviteRouge.code }),
);
assert(revoque === 410, 'un code révoqué cesse de valoir, aperçu compris');

console.log('E2E CODE D’INVITATION : TOUT PASSE');
