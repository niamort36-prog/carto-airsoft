// E2E équipes et escouades (§4/§5/§7.4) : organisation, canaux créés
// automatiquement, cloisonnement par appartenance (on ne lit pas le canal
// du camp adverse), et QR qui place directement dans son escouade.
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

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

const expectStatus = async (want, fn, label) => {
  try {
    await fn();
    throw new Error(`PROBLEME: ${label} aurait dû échouer (${want})`);
  } catch (e) {
    if (e.status !== want) throw e;
    console.log(`${label}: ${want} ✓`);
  }
};

function connect(tok, gameId) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: tok }, transports: ['websocket'] });
    s.on('connect', () =>
      s.emit('game:join', { gameId }, (ack) =>
        ack?.ok ? resolve(s) : reject(new Error(ack?.error ?? 'join refusé')),
      ),
    );
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout')), 8000);
  });
}

const cdt = await token('test.e2e@cartoairsoft.dev');
const bleu = await token('test.e2e2@cartoairsoft.dev');
const rouge = await token('test.e2e3@cartoairsoft.dev');

const game = await api('POST', '/games', cdt, { name: 'Test équipes' });
console.log(`partie: ${game.id}`);

// 1. Création des camps — chacun reçoit son canal automatiquement
const teamBleu = await api('POST', `/games/${game.id}/teams`, cdt, {
  name: 'Bleu', color: '#2196F3',
});
const teamRouge = await api('POST', `/games/${game.id}/teams`, cdt, {
  name: 'Rouge', color: '#F44336',
});
const squadAlpha = await api('POST', `/games/${game.id}/squads`, cdt, {
  teamId: teamBleu.id, name: 'Alpha',
});
console.log(`équipes créées : ${teamBleu.name}, ${teamRouge.name} + escouade ${squadAlpha.name} ✓`);

const orga = await api('GET', `/games/${game.id}/teams`, cdt);
if (orga.length !== 2 || orga.find((t) => t.id === teamBleu.id).squads.length !== 1) {
  throw new Error('organisation incohérente');
}
console.log('organisation lisible par les membres ✓');

// 2. Un QR peut placer directement dans une escouade
const inviteAlpha = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'joueur', squadId: squadAlpha.id,
});
await api('POST', '/join', bleu, { token: inviteAlpha.token });
const members = await api('GET', `/games/${game.id}/members`, cdt);
const bleuMember = members.find((m) => m.email === 'test.e2e2@cartoairsoft.dev');
if (bleuMember.squadId !== squadAlpha.id || bleuMember.teamId !== teamBleu.id) {
  throw new Error(`affectation par QR ratée: ${JSON.stringify(bleuMember)}`);
}
console.log('le scan du QR place directement dans l’escouade Alpha (et son équipe) ✓');

// 3. Un QR sans affectation laisse le joueur non affecté, puis on l'affecte
const inviteLibre = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'joueur' });
await api('POST', '/join', rouge, { token: inviteLibre.token });
let membersNow = await api('GET', `/games/${game.id}/members`, cdt);
const rougeMember = membersNow.find((m) => m.email === 'test.e2e3@cartoairsoft.dev');
if (rougeMember.teamId !== null) throw new Error('devrait être sans équipe');
await api('PATCH', `/games/${game.id}/members/${rougeMember.membershipId}/assignment`, cdt, {
  teamId: teamRouge.id,
});
membersNow = await api('GET', `/games/${game.id}/members`, cdt);
if (membersNow.find((m) => m.membershipId === rougeMember.membershipId).teamId !== teamRouge.id) {
  throw new Error('affectation manuelle ratée');
}
console.log('affectation manuelle d’un membre à une équipe ✓');

// 4. Cloisonnement : chacun ne voit que le canal de SON camp
const canauxBleu = await api('GET', `/games/${game.id}/channels`, bleu);
const canauxRouge = await api('GET', `/games/${game.id}/channels`, rouge);
const nomsBleu = canauxBleu.map((c) => c.name).sort();
const nomsRouge = canauxRouge.map((c) => c.name).sort();
if (nomsBleu.includes('Équipe Rouge') || nomsRouge.includes('Équipe Bleu')) {
  throw new Error(`FUITE: bleu=${nomsBleu} rouge=${nomsRouge}`);
}
if (!nomsBleu.includes('Équipe Bleu') || !nomsBleu.includes('Escouade Alpha')) {
  throw new Error(`canaux manquants pour bleu: ${nomsBleu}`);
}
if (nomsRouge.includes('Escouade Alpha')) {
  throw new Error('le rouge ne doit pas voir l’escouade adverse');
}
console.log(`canaux du bleu : ${nomsBleu.join(', ')} ✓`);
console.log(`canaux du rouge : ${nomsRouge.join(', ')} ✓`);

// 5. Écrire dans le canal du camp adverse est refusé
const canalBleu = canauxBleu.find((c) => c.name === 'Équipe Bleu');
await expectStatus(403,
  () => api('GET', `/games/${game.id}/channels/${canalBleu.id}/messages`, rouge),
  'lecture du canal adverse');
await expectStatus(403,
  () => api('POST', `/games/${game.id}/channels/${canalBleu.id}/messages`, rouge, {
    id: randomUUID(), body: 'espionnage', createdAt: new Date().toISOString(),
  }),
  'écriture dans le canal adverse');

// 6. Étanchéité temps réel : le message d'équipe n'atteint pas l'adversaire
const sRouge = await connect(rouge, game.id);
const recus = [];
sRouge.on('chat:message', (m) => recus.push(m));
await api('POST', `/games/${game.id}/channels/${canalBleu.id}/messages`, bleu, {
  id: randomUUID(), body: 'On progresse par le nord', createdAt: new Date().toISOString(),
});
await new Promise((r) => setTimeout(r, 800));
if (recus.length !== 0) {
  throw new Error(`FUITE WS: le rouge a reçu ${recus.map((m) => m.body).join(' | ')}`);
}
console.log('diffusion WS : le camp adverse ne reçoit rien ✓');

// 7. Une escouade ne peut pas être rattachée à la mauvaise équipe
await expectStatus(400,
  () => api('PATCH', `/games/${game.id}/members/${rougeMember.membershipId}/assignment`, cdt, {
    teamId: teamRouge.id, squadId: squadAlpha.id,
  }),
  'escouade incohérente avec l’équipe');

// 8. Gérer l'organisation exige la permission teams:manage
await expectStatus(403,
  () => api('POST', `/games/${game.id}/teams`, bleu, { name: 'Vert' }),
  'création d’équipe par un joueur');

sRouge.close();
console.log('E2E ÉQUIPES ET ESCOUADES : TOUT PASSE');
process.exit(0);
