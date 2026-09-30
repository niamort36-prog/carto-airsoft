// Simule un second joueur qui se connecte, patrouille et change de statut.
// Usage : node e2e/simulate-player.mjs "<nom de la partie>" [durée_s]
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
// Comptes de test jetables ; surchargeables par variables d'environnement.
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
const durationS = Number(process.argv[3] ?? 60);

const login = async (email, password) => {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
};

const owner = await login(OWNER_EMAIL, PASSWORD);
const games = await (
  await fetch(`${API}/games`, { headers: { Authorization: `Bearer ${owner}` } })
).json();
const target = games.find((g) => g.game.name === gameName);
if (!target) throw new Error(`partie « ${gameName} » introuvable`);
const gameId = target.game.id;

const player = await login(PLAYER_EMAIL, PASSWORD);
await fetch(`${API}/games/${gameId}/join`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${player}` },
});

const socket = io('http://localhost:3000/game', {
  auth: { token: player },
  transports: ['websocket'],
});

socket.on('connect', () => {
  socket.emit('game:join', { gameId }, (ack) => {
    if (!ack?.ok) {
      console.error('join refusé:', ack?.error);
      process.exit(1);
    }
    console.log(`Loup-02 a rejoint « ${gameName} » — patrouille ${durationS}s`);

    // Patrouille autour de la position de l'émulateur (Fontainebleau).
    const center = { lat: 48.404, lng: 2.632 };
    let step = 0;
    const timer = setInterval(() => {
      const angle = (step * Math.PI) / 8;
      socket.emit('position', {
        gameId,
        lat: center.lat + 0.0012 * Math.cos(angle),
        lng: center.lng + 0.0018 * Math.sin(angle),
      });
      if (step === 4) socket.emit('status', { gameId, lifeStatus: 'medic_needed' });
      if (step === 12) socket.emit('status', { gameId, lifeStatus: 'alive' });
      step += 1;
      if (step * 2 >= durationS) {
        clearInterval(timer);
        socket.close();
        console.log('patrouille terminée, déconnexion');
        process.exit(0);
      }
    }, 2000);
  });
});
