// E2E objectifs et bonus (§7.8, §7.9) : capture arbitrée serveur (camp,
// grade, ordre), scores, QR bonus avec quotas, et /scan qui reconnaît seul
// la nature du QR présenté.
import { io } from 'socket.io-client';

const SUPABASE = process.env.SUPABASE_URL ?? 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/v1';
const WS = API.replace(/\/v1\/?$/, '') + '/game';
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

const cdt = await token('test.e2e@cartoairsoft.dev');
const bleu = await token('test.e2e2@cartoairsoft.dev');
const rouge = await token('test.e2e3@cartoairsoft.dev');

const game = await api('POST', '/games', cdt, { name: 'Test objectifs' });
const teamBleu = await api('POST', `/games/${game.id}/teams`, cdt, { name: 'Bleu' });
const teamRouge = await api('POST', `/games/${game.id}/teams`, cdt, { name: 'Rouge' });
const invBleu = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'joueur', teamId: teamBleu.id,
});
const invRouge = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'joueur', teamId: teamRouge.id,
});
await api('POST', '/join', bleu, { token: invBleu.token });
await api('POST', '/join', rouge, { token: invRouge.token });
console.log(`partie: ${game.id} — Bleu et Rouge en place ✓`);

// 1. Poser trois drapeaux, dont deux avec ordre de capture imposé
const alpha = await api('POST', `/games/${game.id}/objectives`, cdt, {
  name: 'Drapeau Alpha', lat: 48.404, lng: 2.632,
  captureOrder: 1, reward: { points: 100 },
});
const bravo = await api('POST', `/games/${game.id}/objectives`, cdt, {
  name: 'Drapeau Bravo', lat: 48.406, lng: 2.635,
  captureOrder: 2, reward: { points: 150 },
});
const pcCommandement = await api('POST', `/games/${game.id}/objectives`, cdt, {
  name: 'PC de commandement', lat: 48.402, lng: 2.630,
  allowedRoles: ['commandant', 'capitaine'], reward: { points: 300 },
});
console.log('trois drapeaux posés (dont un réservé aux gradés) ✓');

// Le jeton du QR ne contient jamais le nom ni la récompense
for (const leak of ['alpha', 'drapeau', 'point', '100']) {
  if (alpha.token.toLowerCase().includes(leak)) {
    throw new Error(`FUITE: « ${leak} » dans le jeton du drapeau`);
  }
}
console.log(`jeton de drapeau opaque (${alpha.token.length} car.) ✓`);

// 2. L'ordre de capture est imposé : Bravo avant Alpha est refusé
await expectStatus(403,
  () => api('POST', '/scan', bleu, { token: bravo.token }),
  'capture de Bravo avant Alpha');

// 3. Alpha capturé par le Bleu → points crédités à l'équipe
const capture1 = await api('POST', '/scan', bleu, { token: alpha.token });
if (capture1.type !== 'objective' || capture1.pointsAwarded !== 100) {
  throw new Error(`capture inattendue: ${JSON.stringify(capture1)}`);
}
console.log(`Alpha capturé par le Bleu : +${capture1.pointsAwarded} pts (total ${capture1.teamScore}) ✓`);

// 4. Maintenant Bravo passe
const capture2 = await api('POST', '/scan', bleu, { token: bravo.token });
if (capture2.teamScore !== 250) throw new Error(`score: ${capture2.teamScore}`);
console.log(`Bravo capturé : total Bleu ${capture2.teamScore} pts ✓`);

// 5. Recapturer ce qu'on détient déjà est refusé
await expectStatus(410,
  () => api('POST', '/scan', bleu, { token: alpha.token }),
  'recapture d’un drapeau déjà détenu');

// 6. Mais l'adversaire peut le reprendre — l'ordre s'applique à lui aussi
await expectStatus(403,
  () => api('POST', '/scan', rouge, { token: bravo.token }),
  'Rouge capture Bravo sans tenir Alpha');
const reprise = await api('POST', '/scan', rouge, { token: alpha.token });
console.log(`Alpha repris par le Rouge : ${reprise.teamScore} pts ✓`);

// 7. Restriction par grade : un simple joueur ne prend pas le PC
await expectStatus(403,
  () => api('POST', '/scan', bleu, { token: pcCommandement.token }),
  'capture du PC par un simple joueur');

// 8. Les scores sont lisibles et cohérents
const scores = await api('GET', `/games/${game.id}/scores`, cdt);
const bleuScore = scores.find((s) => s.id === teamBleu.id).score;
const rougeScore = scores.find((s) => s.id === teamRouge.id).score;
if (bleuScore !== 250 || rougeScore !== 100) {
  throw new Error(`scores: Bleu=${bleuScore} Rouge=${rougeScore}`);
}
console.log(`scores — Bleu: ${bleuScore}, Rouge: ${rougeScore} ✓`);

// 9. QR bonus : récompense + pièce jointe, une fois par joueur
const bonus = await api('POST', `/games/${game.id}/bonus-qrs`, cdt, {
  name: 'Cache de munitions',
  reward: { points: 25 },
  attachmentUrl: 'https://example.org/plan-cache.png',
  maxScansPerPlayer: 1,
});
const gain = await api('POST', '/scan', bleu, { token: bonus.token });
if (gain.type !== 'bonus' || gain.pointsAwarded !== 25 || !gain.attachmentUrl) {
  throw new Error(`bonus inattendu: ${JSON.stringify(gain)}`);
}
console.log(`bonus récupéré : +${gain.pointsAwarded} pts + pièce jointe ✓`);
await expectStatus(410,
  () => api('POST', '/scan', bleu, { token: bonus.token }),
  'second scan du même bonus par le même joueur');

// …mais un autre joueur peut encore le prendre
const gainRouge = await api('POST', '/scan', rouge, { token: bonus.token });
if (gainRouge.pointsAwarded !== 25) throw new Error('bonus refusé au second joueur');
console.log('un autre joueur peut récupérer le même bonus ✓');

// 10. Bonus à quota global épuisable
const limite = await api('POST', `/games/${game.id}/bonus-qrs`, cdt, {
  name: 'Renseignement unique', reward: { points: 50 }, maxScansTotal: 1,
});
await api('POST', '/scan', bleu, { token: limite.token });
await expectStatus(410,
  () => api('POST', '/scan', rouge, { token: limite.token }),
  'bonus à quota global épuisé');

// 11. QR inconnu
await expectStatus(404,
  () => api('POST', '/scan', bleu, { token: 'jeton-invente-0123456789' }),
  'QR inconnu');

// 12. /scan reconnaît aussi une invitation
const invitation = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'joueur' });
const p4 = await token('test.e2e4@cartoairsoft.dev');
const rejoint = await api('POST', '/scan', p4, { token: invitation.token });
if (rejoint.type !== 'invite') throw new Error(`type: ${rejoint.type}`);
console.log(`/scan reconnaît une invitation (rôle ${rejoint.role}) ✓`);

// 13. Diffusion temps réel de la capture aux deux camps
const socket = await new Promise((resolve, reject) => {
  const s = io(WS, { auth: { token: rouge }, transports: ['websocket'] });
  s.on('connect', () => s.emit('game:join', { gameId: game.id }, (ack) =>
    ack?.ok ? resolve(s) : reject(new Error(ack?.error))));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('timeout')), 8000);
});
const evenements = [];
socket.on('game:event', (e) => evenements.push(e));
await api('POST', '/scan', bleu, { token: alpha.token });
await new Promise((r) => setTimeout(r, 800));
const capturEvent = evenements.find((e) => e.kind === 'objective:captured');
if (!capturEvent) throw new Error('aucun événement de capture reçu');
console.log(`événement temps réel reçu par l’adversaire : « ${capturEvent.name} » ✓`);

socket.close();
console.log('E2E OBJECTIFS ET BONUS : TOUT PASSE');
process.exit(0);
