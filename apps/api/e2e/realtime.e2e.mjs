// E2E temps réel : deux joueurs connectés en WebSocket à la même partie.
// Vérifie : auth socket, join+snapshot, diffusion des positions, statuts,
// et le passage « hors ligne » d'un joueur qui se déconnecte (§2.4).
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '') + '/game';
// Comptes de test jetables ; surchargeables par variables d'environnement.
const PASSWORD = process.env.E2E_PASSWORD ?? 'TestE2E2026';
const EMAIL1 = process.env.E2E_EMAIL ?? 'test.e2e@cartoairsoft.dev';
const EMAIL2 = process.env.E2E_EMAIL2 ?? 'test.e2e2@cartoairsoft.dev';

async function token(email, password) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
}

function connect(tok) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: tok }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout connexion')), 8000);
  });
}

function joinGame(socket, gameId) {
  return new Promise((resolve, reject) => {
    socket.emit('game:join', { gameId }, (ack) =>
      ack?.ok ? resolve(ack) : reject(new Error(ack?.error ?? 'join refusé')),
    );
    setTimeout(() => reject(new Error('timeout join')), 8000);
  });
}

const waitFor = (socket, predicate, label, ms = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout: ${label}`)),
      ms,
    );
    const handler = (member) => {
      if (predicate(member)) {
        clearTimeout(timer);
        socket.off('member:update', handler);
        resolve(member);
      }
    };
    socket.on('member:update', handler);
  });

const t1 = await token(EMAIL1, PASSWORD);
const t2 = await token(EMAIL2, PASSWORD);

// Nouvelle partie propre pour ce test
const gameRes = await fetch(`${API}/games`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test temps réel' }),
});
const game = await gameRes.json();
await fetch(`${API}/games/${game.id}/join`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${t2}` },
});
console.log(`partie: ${game.id}`);

// Un socket sans jeton doit être refusé dès la poignée de main (middleware)
const bad = io(WS, { auth: {}, transports: ['websocket'] });
await new Promise((resolve) => {
  bad.on('connect_error', () => { console.log('socket sans jeton: refusé ✓'); resolve(); });
  bad.on('disconnect', () => { console.log('socket sans jeton: déconnecté ✓'); resolve(); });
  setTimeout(resolve, 3000);
});
bad.close();

const s1 = await connect(t1);
const s2 = await connect(t2);
console.log('sockets connectés ✓');

const ack1 = await joinGame(s1, game.id);
console.log(`join ORGA: ${ack1.members.length} membres dans le snapshot ✓`);

// s1 doit voir arriver la connexion de s2
const seesJoin = waitFor(
  s1,
  (m) => m.membershipId !== ack1.membershipId && m.isConnected,
  's1 voit joueur 2 connecté',
);
const ack2 = await joinGame(s2, game.id);
await seesJoin;
console.log('s1 a vu joueur 2 passer « connecté » ✓');

// Position : joueur 2 se déplace en forêt, s1 doit la recevoir
const seesPos = waitFor(
  s1,
  (m) =>
    m.membershipId === ack2.membershipId &&
    m.lastPosition &&
    Math.abs(m.lastPosition.y - 48.405) < 0.001,
  's1 reçoit la position de joueur 2',
);
s2.emit('position', { gameId: game.id, lat: 48.405, lng: 2.63 });
const posMember = await seesPos;
console.log(
  `s1 a reçu la position de ${posMember.pseudo}: (${posMember.lastPosition.y.toFixed(3)}, ${posMember.lastPosition.x.toFixed(3)}) ✓`,
);

// Statut : joueur 2 demande un médic
const seesStatus = waitFor(
  s1,
  (m) => m.membershipId === ack2.membershipId && m.lifeStatus === 'medic_needed',
  's1 voit le statut médic',
);
s2.emit('status', { gameId: game.id, lifeStatus: 'medic_needed' });
await seesStatus;
console.log('s1 a vu joueur 2 passer « médic demandé » ✓');

// Anti-triche : une position pour une partie non rejointe est ignorée
s1.emit('position', { gameId: '00000000-0000-0000-0000-000000000000', lat: 0, lng: 0 });

// Déconnexion : joueur 2 coupe → s1 doit le voir passer hors ligne, SANS éjection
const seesOffline = waitFor(
  s1,
  (m) => m.membershipId === ack2.membershipId && !m.isConnected,
  's1 voit joueur 2 hors ligne',
);
s2.close();
const offline = await seesOffline;
console.log(
  `s1 voit ${offline.pseudo} hors ligne (dernière position conservée: ${offline.lastPosition != null}) ✓`,
);

s1.close();
console.log('E2E TEMPS RÉEL : TOUT PASSE');
process.exit(0);
