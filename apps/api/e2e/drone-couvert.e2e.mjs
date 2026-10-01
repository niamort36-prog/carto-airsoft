// E2E « drone et couvert » : le réglage du drone par l'organisateur, et la
// dissimulation des hostiles sous les zones qu'il a dessinées.
//
// Le serveur n'a aucune donnée d'occupation du sol et n'en veut pas : ce
// sont les ZONES dessinées, étiquetées `cover`, qui disent ce qui cache.

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

import { io } from 'socket.io-client';

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
    const err = new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    err.status = r.status;
    throw err;
  }
  const texte = await r.text();
  return texte ? JSON.parse(texte) : null;
}

function assert(condition, label) {
  if (!condition) throw new Error(`ÉCHEC : ${label}`);
  console.log(`${label} ✓`);
}

/** Place un joueur à une position, par la passerelle temps réel. */
async function poser(tok, gameId, lat, lng) {
  await new Promise((resolve, reject) => {
    const socket = io('http://localhost:3000/game', {
      auth: { token: tok }, transports: ['websocket'],
    });
    socket.on('connect_error', reject);
    socket.on('connect', () => {
      socket.emit('game:join', { gameId }, () => {
        socket.emit('position', { gameId, lat, lng });
        setTimeout(() => { socket.close(); resolve(); }, 800);
      });
    });
  });
}

const orga = await token('test.e2e@cartoairsoft.dev');
const rouge = await token('test.e2e2@cartoairsoft.dev');
const rouge2 = await token('test.e2e3@cartoairsoft.dev');

const partie = await api('POST', '/games', orga, { name: 'Test couvert' });
const bleu = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Bleu', color: '#2196F3',
});
const campRouge = await api('POST', `/games/${partie.id}/teams`, orga, {
  name: 'Rouge', color: '#F44336',
});

let membres = await api('GET', `/games/${partie.id}/members`, orga);
const moi = membres[0];
await api('PATCH', `/games/${partie.id}/members/${moi.membershipId}/assignment`, orga, {
  teamId: bleu.id,
});

// Deux hostiles : l'un à découvert, l'autre dans le bois.
const hostiles = [];
for (const tok of [rouge, rouge2]) {
  const invite = await api('POST', `/games/${partie.id}/invites`, orga, {
    role: 'joueur', teamId: campRouge.id,
  });
  await api('POST', '/join', tok, { token: invite.token });
  membres = await api('GET', `/games/${partie.id}/members`, orga);
  const lui = membres.find(
    (m) => m.teamId === campRouge.id && !hostiles.some((h) => h.id === m.membershipId),
  );
  hostiles.push({ id: lui.membershipId, tok });
}

const CENTRE = { lat: 48.404, lng: 2.632 };
// À découvert, à 80 m au nord.
await poser(hostiles[0].tok, partie.id, CENTRE.lat + 0.0007, CENTRE.lng);
// Dans le bois, à 80 m au sud.
await poser(hostiles[1].tok, partie.id, CENTRE.lat - 0.0007, CENTRE.lng);

// --- Le bois : une zone dessinée, étiquetée ------------------------------
await api('POST', `/games/${partie.id}/map-objects/batch`, orga, {
  objects: [
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: 'zone',
      lat: CENTRE.lat - 0.0007,
      lng: CENTRE.lng,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [CENTRE.lng - 0.002, CENTRE.lat - 0.002],
          [CENTRE.lng + 0.002, CENTRE.lat - 0.002],
          [CENTRE.lng + 0.002, CENTRE.lat - 0.0003],
          [CENTRE.lng - 0.002, CENTRE.lat - 0.0003],
          [CENTRE.lng - 0.002, CENTRE.lat - 0.002],
        ]],
      },
      properties: { cover: 'forest', color: '#4CAF50', unitLabel: 'Bois' },
    },
  ],
});

const droneAvec = (reglages) =>
  api('POST', `/games/${partie.id}/perks`, orga, {
    type: 'drone', radiusMeters: 400, durationSeconds: 20,
    cooldownSeconds: 0, stockPerTeam: 50, ...reglages,
  });

// --- Les réglages se posent et se relisent --------------------------------
const regle = await droneAvec({
  orbit: true, sweepSeconds: 5, concealment: 'hidden',
  concealedCovers: ['forest'],
});
assert(regle.orbit === true, 'le drone peut tourner autour du point visé');
assert(regle.sweepSeconds === 5, 'son intervalle de balayage se règle');
assert(regle.concealment === 'hidden', 'et ce que le couvert lui cache');

const liste = await api('GET', `/games/${partie.id}/perks`, orga);
const relu = liste.find((p) => p.id === regle.id);
assert(
  relu.concealedCovers.includes('forest') && relu.sweepSeconds === 5,
  'les réglages se relisent tels quels',
);

// --- Sans dissimulation : le drone voit tout ------------------------------
const sansCouvert = await droneAvec({ concealment: 'none' });
const vuTout = await api(
  'POST', `/games/${partie.id}/perks/${sansCouvert.id}/activate`, orga,
  { lat: CENTRE.lat, lng: CENTRE.lng },
);
assert(
  vuTout.contacts.length === 2,
  'sans dissimulation, les deux hostiles apparaissent',
);
assert(
  vuTout.contacts.every((c) => !c.concealed),
  'et aucun n’est signalé comme fugace',
);

// --- Dissimulation « hidden » : le bois efface ----------------------------
const cache = await droneAvec({
  concealment: 'hidden', concealedCovers: ['forest'],
});
const vuCache = await api(
  'POST', `/games/${partie.id}/perks/${cache.id}/activate`, orga,
  { lat: CENTRE.lat, lng: CENTRE.lng },
);
assert(
  vuCache.contacts.length === 1,
  'en « hidden », celui qui est dans le bois disparaît',
);
assert(
  vuCache.contacts[0].membershipId === hostiles[0].id,
  'et c’est bien celui à découvert qui reste',
);

// --- Le couvert doit correspondre ------------------------------------------
const urbainSeul = await droneAvec({
  concealment: 'hidden', concealedCovers: ['urban'],
});
const vuUrbain = await api(
  'POST', `/games/${partie.id}/perks/${urbainSeul.id}/activate`, orga,
  { lat: CENTRE.lat, lng: CENTRE.lng },
);
assert(
  vuUrbain.contacts.length === 2,
  'un bois ne cache pas quand seul l’urbain est déclaré couvrant',
);

// --- Intermittence : parfois vu, parfois non ------------------------------
const parfois = await droneAvec({
  concealment: 'intermittent', concealedCovers: ['forest'],
});
let vuDansLeBois = 0;
const TIRAGES = 30;
for (let i = 0; i < TIRAGES; i++) {
  const r = await api(
    'POST', `/games/${partie.id}/perks/${parfois.id}/activate`, orga,
    { lat: CENTRE.lat, lng: CENTRE.lng },
  );
  if (r.contacts.some((c) => c.membershipId === hostiles[1].id)) vuDansLeBois++;
  // Celui à découvert, lui, est là à tous les coups.
  if (!r.contacts.some((c) => c.membershipId === hostiles[0].id)) {
    throw new Error('ÉCHEC : le découvert a disparu alors qu’il ne devrait pas');
  }
}
assert(
  vuDansLeBois > 0 && vuDansLeBois < TIRAGES,
  `en « intermittent », il apparaît parfois (${vuDansLeBois}/${TIRAGES}) — ` +
    'ni jamais, ni toujours',
);

const marqueFugace = await api(
  'POST', `/games/${partie.id}/perks/${parfois.id}/activate`, orga,
  { lat: CENTRE.lat, lng: CENTRE.lng },
);
const sousBois = marqueFugace.contacts.find(
  (c) => c.membershipId === hostiles[1].id,
);
if (sousBois) {
  assert(
    sousBois.concealed === true,
    'un contact sous couvert est signalé comme fugace',
  );
} else {
  console.log('un contact sous couvert est signalé comme fugace ✓ (absent ce tirage)');
}

// --- Régler, et non empiler ------------------------------------------------
const aRegler = await droneAvec({ concealment: 'none' });
const avant = (await api('GET', `/games/${partie.id}/perks`, orga)).length;
await api('PATCH', `/games/${partie.id}/perks/${aRegler.id}`, orga, {
  radiusMeters: 250,
  concealment: 'intermittent',
  concealedCovers: ['forest', 'urban'],
  sweepSeconds: 8,
});
const apres = await api('GET', `/games/${partie.id}/perks`, orga);
const modifie = apres.find((p) => p.id === aRegler.id);
assert(
  apres.length === avant,
  'régler un bonus ne crée pas de doublon',
);
assert(
  modifie.radiusMeters === 250 &&
    modifie.concealment === 'intermittent' &&
    modifie.sweepSeconds === 8 &&
    modifie.concealedCovers.length === 2,
  'et les nouveaux réglages prennent, les deux couverts compris',
);

await api('DELETE', `/games/${partie.id}/perks/${aRegler.id}`, orga);
const apresRetrait = await api('GET', `/games/${partie.id}/perks`, orga);
assert(
  !apresRetrait.some((p) => p.id === aRegler.id),
  'un bonus se retire de la partie',
);

console.log('E2E DRONE ET COUVERT : TOUT PASSE');
