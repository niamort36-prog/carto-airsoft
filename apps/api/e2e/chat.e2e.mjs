// E2E messagerie (§7.4) : canaux cloisonnés par grade, envoi idempotent,
// delta de synchro, et diffusion WebSocket restreinte aux ayants droit.
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '') + '/game';
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
  return r.json();
}

function connect(tok, gameId) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: tok }, transports: ['websocket'] });
    s.on('connect', () =>
      s.emit('game:join', { gameId }, (ack) =>
        ack?.ok ? resolve(s) : reject(new Error(ack?.error ?? 'join refusé')),
      ),
    );
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout connexion')), 8000);
  });
}

const cdt = await token('test.e2e@cartoairsoft.dev');   // commandant
const joueur = await token('test.e2e2@cartoairsoft.dev'); // sans grade

const game = await api('POST', '/games', cdt, { name: 'Test messagerie' });
await api('POST', `/games/${game.id}/join`, joueur);
console.log(`partie: ${game.id}`);

// 1. Cloisonnement des canaux selon le grade
const cdtChannels = await api('GET', `/games/${game.id}/channels`, cdt);
const joueurChannels = await api('GET', `/games/${game.id}/channels`, joueur);
const names = (cs) => cs.map((c) => c.name).sort().join(', ');
if (cdtChannels.length !== 2) throw new Error(`commandant: ${names(cdtChannels)}`);
if (joueurChannels.length !== 1 || joueurChannels[0].scope !== 'global') {
  throw new Error(`joueur: ${names(joueurChannels)}`);
}
console.log(`commandant voit : ${names(cdtChannels)} ✓`);
console.log(`joueur sans grade voit : ${names(joueurChannels)} ✓`);

const global = cdtChannels.find((c) => c.scope === 'global');
const command = cdtChannels.find((c) => c.scope === 'command');

// 2. Le joueur ne peut ni lire ni écrire dans le canal commandement
for (const [label, call] of [
  ['lecture', () => api('GET', `/games/${game.id}/channels/${command.id}/messages`, joueur)],
  ['écriture', () => api('POST', `/games/${game.id}/channels/${command.id}/messages`, joueur, {
    id: randomUUID(), body: 'intrusion', createdAt: new Date().toISOString(),
  })],
]) {
  try {
    await call();
    throw new Error(`PROBLEME: ${label} du canal commandement autorisée`);
  } catch (e) {
    if (e.status !== 403) throw e;
    console.log(`${label} du canal commandement par un sans-grade: 403 ✓`);
  }
}

// 3. Diffusion WebSocket : le joueur reçoit le général, jamais le commandement
const sJoueur = await connect(joueur, game.id);
const received = [];
sJoueur.on('chat:message', (m) => received.push(m));

const msgId = randomUUID();
const sent = await api('POST', `/games/${game.id}/channels/${global.id}/messages`, cdt, {
  id: msgId, body: 'Contact à l’est du carrefour', createdAt: new Date().toISOString(),
});
console.log(`message envoyé par ${sent.authorName} ✓`);

await api('POST', `/games/${game.id}/channels/${command.id}/messages`, cdt, {
  id: randomUUID(), body: 'Ordre réservé aux gradés', createdAt: new Date().toISOString(),
});

await new Promise((r) => setTimeout(r, 800));
if (received.length !== 1 || received[0].id !== msgId) {
  throw new Error(`diffusion inattendue: ${received.map((m) => m.body).join(' | ')}`);
}
console.log('le joueur reçoit le message général, PAS celui du commandement ✓');

// 4. Idempotence : renvoyer le même id (file offline rejouée) ne duplique pas
await api('POST', `/games/${game.id}/channels/${global.id}/messages`, cdt, {
  id: msgId, body: 'Contact à l’est du carrefour', createdAt: new Date().toISOString(),
});
const all = await api('GET', `/games/${game.id}/channels/${global.id}/messages`, joueur);
if (all.messages.length !== 1) throw new Error(`${all.messages.length} messages au lieu d’un`);
console.log('idempotence sur id client: 1 seul message après double envoi ✓');

// 5. Delta : curseur à jour → rien de neuf
const delta = await api('GET', `/games/${game.id}/channels/${global.id}/messages?since=${encodeURIComponent(all.serverTime)}`, joueur);
if (delta.messages.length !== 0) throw new Error('delta non vide inattendu');
console.log('delta vide après curseur à jour ✓');

sJoueur.close();
console.log('E2E MESSAGERIE : TOUT PASSE');
process.exit(0);
