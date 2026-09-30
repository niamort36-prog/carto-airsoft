// Envoie un message dans le canal Général d'une partie, au nom du joueur 2.
// Utile pour voir arriver un message en direct dans l'app.
// Usage : node e2e/send-chat.mjs "<nom de la partie>" "<message>"
import { randomUUID } from 'node:crypto';

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
const OWNER_EMAIL = process.env.E2E_EMAIL ?? 'test.e2e@cartoairsoft.dev';
const PLAYER_EMAIL = process.env.E2E_EMAIL2 ?? 'test.e2e2@cartoairsoft.dev';

const gameName = process.argv[2] ?? 'Test temps réel';
const body = process.argv[3] ?? 'Contact à l’est du carrefour';

const login = async (email) => {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
};

const owner = await login(OWNER_EMAIL);
const games = await (
  await fetch(`${API}/games`, { headers: { Authorization: `Bearer ${owner}` } })
).json();
const target = games.find((g) => g.game.name === gameName);
if (!target) throw new Error(`partie « ${gameName} » introuvable`);
const gameId = target.game.id;

const player = await login(PLAYER_EMAIL);
await fetch(`${API}/games/${gameId}/join`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${player}` },
});

const channels = await (
  await fetch(`${API}/games/${gameId}/channels`, {
    headers: { Authorization: `Bearer ${player}` },
  })
).json();
const global = channels.find((c) => c.scope === 'global');

const res = await fetch(
  `${API}/games/${gameId}/channels/${global.id}/messages`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${player}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: randomUUID(),
      body,
      createdAt: new Date().toISOString(),
    }),
  },
);
if (!res.ok) throw new Error(`envoi: ${res.status}`);
const sent = await res.json();
console.log(`« ${sent.body} » envoyé par ${sent.authorName} dans ${global.name}`);
