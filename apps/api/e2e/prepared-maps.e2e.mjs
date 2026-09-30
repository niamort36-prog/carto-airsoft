// E2E « cartes préparées » : un terrain dessiné une fois, réutilisé d'une
// partie à l'autre. Le point qui compte : l'association RECOPIE le contenu,
// elle ne le référence pas — une partie en cours ne doit jamais changer
// sous les pieds de ceux qui la jouent.

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
  // Certaines routes repondent sans corps : le parser echouerait dessus.
  const texte = await r.text();
  return texte ? JSON.parse(texte) : null;
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
const autre = await token('test.e2e2@cartoairsoft.dev');

// --- Une carte se crée, se garnit, se relit -------------------------------
const carte = await api('POST', '/maps', orga, {
  name: 'Forêt de Franchard',
  basemap: 'ortho_ign',
});
assert(carte.basemap === 'ortho_ign', 'une carte choisit son fond');
assert(
  carte.objectCount === 0 && carte.objectiveCount === 0,
  'et naît vide',
);

const contenu = {
  objects: [
    {
      kind: 'zone',
      lat: 48.404, lng: 2.632,
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.630, 48.402], [2.635, 48.402], [2.635, 48.406], [2.630, 48.402]]],
      },
      properties: { color: '#F44336', unitLabel: 'Zone interdite' },
    },
    {
      kind: 'marker',
      lat: 48.4055, lng: 2.6335,
      properties: { icon: 'fob_allied', color: '#2196F3', unitLabel: 'Base' },
    },
  ],
  objectives: [
    { name: 'Drapeau Nord', lat: 48.4065, lng: 2.632 },
    { name: 'Drapeau Sud', lat: 48.4015, lng: 2.6335 },
  ],
};
await api('PATCH', `/maps/${carte.id}`, orga, {
  content: contenu,
  centerLat: 48.404,
  centerLng: 2.632,
  zoom: 14,
});

const relue = await api('GET', `/maps/${carte.id}`, orga);
assert(
  relue.objectCount === 2 && relue.objectiveCount === 2,
  'ses dessins et ses drapeaux se relisent',
);
assert(relue.zoom === 14, 'et elle se rouvre là où on l’a laissée');

const liste = await api('GET', '/maps', orga);
assert(
  liste.some((m) => m.id === carte.id),
  'elle apparaît dans mes cartes',
);

// --- Une carte appartient à son auteur ------------------------------------
const chezLautre = await refus(() => api('GET', `/maps/${carte.id}`, autre));
assert(chezLautre === 404, 'la carte d’un autre reste invisible');
const listeAutre = await api('GET', '/maps', autre);
assert(
  !listeAutre.some((m) => m.id === carte.id),
  'et n’apparaît pas dans sa liste',
);

// --- L'association RECOPIE -------------------------------------------------
const partie = await api('POST', '/games', orga, { name: 'Test carte' });
const pose = await api('POST', `/games/${partie.id}/map`, orga, {
  mapId: carte.id,
});
assert(
  pose.objects === 2 && pose.objectives === 2,
  'associer une carte y recopie dessins et drapeaux',
);

const objets = await api('GET', `/games/${partie.id}/sync`, orga);
assert(
  objets.objects.length === 2,
  'les dessins sont bien dans la partie',
);
const drapeaux = await api('GET', `/games/${partie.id}/objectives`, orga);
assert(drapeaux.length === 2, 'les drapeaux aussi');
assert(
  drapeaux.every((d) => d.id),
  'et chacun a reçu son propre jeton de capture',
);

// --- Modifier la carte ne touche pas la partie ----------------------------
await api('PATCH', `/maps/${carte.id}`, orga, {
  content: { objects: [], objectives: [] },
});
const apresVidage = await api('GET', `/games/${partie.id}/sync`, orga);
assert(
  apresVidage.objects.length === 2,
  'vider le modèle ne vide pas la partie déjà montée',
);

// --- Supprimer la carte ne vide pas la partie non plus ---------------------
await api('DELETE', `/maps/${carte.id}`, orga);
const apresSuppression = await api('GET', `/games/${partie.id}/sync`, orga);
assert(
  apresSuppression.objects.length === 2,
  'supprimer le modèle laisse la partie intacte',
);
const partieOrpheline = await api('GET', '/games', orga);
assert(
  partieOrpheline.some((g) => g.game.id === partie.id),
  'la partie survit à la carte dont elle est issue',
);

// --- Ce qui ne passe pas ---------------------------------------------------
const inventee = await refus(() =>
  api('POST', `/games/${partie.id}/map`, orga, {
    mapId: '00000000-0000-0000-0000-000000000000',
  }),
);
assert(inventee === 404, 'une carte inexistante ne s’associe pas');

console.log('E2E CARTES PRÉPARÉES : TOUT PASSE');
