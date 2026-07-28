// Place un joueur adverse à proximité et le maintient connecté, pour
// éprouver le drone depuis l'application.
// Usage : node e2e/place-hostile.mjs "<nom de la partie>" [durée_s]
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const PASSWORD = process.env.E2E_PASSWORD ?? 'TestE2E2026';
const OWNER = process.env.E2E_EMAIL ?? 'test.e2e@cartoairsoft.dev';
const HOSTILE = process.env.E2E_EMAIL2 ?? 'test.e2e2@cartoairsoft.dev';

const gameName = process.argv[2] ?? 'Op Fontainebleau';
const durationS = Number(process.argv[3] ?? 180);

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

const games = await (await fetch(`${API}/games`, { headers: h })).json();
const target = games.find((g) => g.game.name === gameName);
if (!target) throw new Error(`partie « ${gameName} » introuvable`);
const gameId = target.game.id;

// Une équipe adverse, puis une invitation qui y place directement le joueur.
const teams = await (await fetch(`${API}/games/${gameId}/teams`, { headers: h })).json();
let rouge = teams.find((t) => t.name === 'Rouge');
if (!rouge) {
  rouge = await (
    await fetch(`${API}/games/${gameId}/teams`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ name: 'Rouge', color: '#F44336' }),
    })
  ).json();
}
const invite = await (
  await fetch(`${API}/games/${gameId}/invites`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ role: 'joueur', teamId: rouge.id }),
  })
).json();

const hostile = await login(HOSTILE);
await fetch(`${API}/join`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${hostile}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: invite.token }),
});

const socket = io(API.replace(/\/v1\/?$/, '') + '/game', {
  auth: { token: hostile }, transports: ['websocket'],
});
socket.on('connect', () => {
  socket.emit('game:join', { gameId }, (ack) => {
    if (!ack?.ok) {
      console.error('join refusé:', ack?.error);
      process.exit(1);
    }
    // À ~150 m au nord-est du joueur : dans les 400 m du drone.
    const tick = () =>
      socket.emit('position', { gameId, lat: 48.4052, lng: 2.6332 });
    tick();
    console.log(`hostile en place dans « ${gameName} » pour ${durationS}s`);
    const timer = setInterval(tick, 5000);
    setTimeout(() => {
      clearInterval(timer);
      socket.close();
      console.log('hostile retiré');
      process.exit(0);
    }, durationS * 1000);
  });
});
