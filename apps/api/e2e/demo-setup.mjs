// Prépare une partie de démonstration jouable depuis l'application :
// deux camps, deux drapeaux, drone et brouilleur.
// Usage : node e2e/demo-setup.mjs ["<nom>"]
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
const OWNER = process.env.E2E_EMAIL ?? 'test.e2e@cartoairsoft.dev';

const name = process.argv[2] ?? 'Op Fontainebleau';

const login = async (email) => {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
};

const owner = await login(OWNER);
const h = { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' };
const post = async (path, body) => {
  const r = await fetch(`${API}${path}`, {
    method: 'POST', headers: h, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path}: ${r.status}`);
  return r.json();
};

const game = await post('/games', { name });
const bleu = await post(`/games/${game.id}/teams`, { name: 'Bleu', color: '#2196F3' });
await post(`/games/${game.id}/teams`, { name: 'Rouge', color: '#F44336' });

// Le créateur rejoint le camp bleu, sinon il ne peut ni capturer ni viser.
const members = await (
  await fetch(`${API}/games/${game.id}/members`, { headers: h })
).json();
await fetch(
  `${API}/games/${game.id}/members/${members[0].membershipId}/assignment`,
  { method: 'PATCH', headers: h, body: JSON.stringify({ teamId: bleu.id }) },
);

await post(`/games/${game.id}/objectives`, {
  name: 'Drapeau Nord', lat: 48.4065, lng: 2.632, reward: { points: 100 },
});
await post(`/games/${game.id}/objectives`, {
  name: 'Drapeau Sud', lat: 48.4015, lng: 2.6335, reward: { points: 100 },
});
await post(`/games/${game.id}/perks`, {
  type: 'drone', radiusMeters: 400, durationSeconds: 60,
  cooldownSeconds: 0, stockPerTeam: 5,
});
await post(`/games/${game.id}/perks`, {
  type: 'jammer', radiusMeters: 500, durationSeconds: 20, cooldownSeconds: 0,
});

console.log(`« ${name} » prête : 2 camps, 2 drapeaux, drone + brouilleur`);
console.log(`id: ${game.id}`);
