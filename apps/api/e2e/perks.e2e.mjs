// E2E perks (§7.7) : le drone révèle les hostiles d'un rayon — et
// UNIQUEMENT à l'équipe qui l'a lancé ; le brouilleur coupe les drones
// adverses. Vérifie aussi stock, recharge et grade habilité.
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

function connect(tok, gameId) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: tok }, transports: ['websocket'] });
    s.on('connect', () => s.emit('game:join', { gameId }, (ack) =>
      ack?.ok ? resolve(s) : reject(new Error(ack?.error))));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout')), 8000);
  });
}

const cdt = await token('test.e2e@cartoairsoft.dev');
const bleu = await token('test.e2e2@cartoairsoft.dev');
const rouge = await token('test.e2e3@cartoairsoft.dev');
const rouge2 = await token('test.e2e4@cartoairsoft.dev');

const game = await api('POST', '/games', cdt, { name: 'Test perks' });
const teamBleu = await api('POST', `/games/${game.id}/teams`, cdt, { name: 'Bleu' });
const teamRouge = await api('POST', `/games/${game.id}/teams`, cdt, { name: 'Rouge' });
const invB = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'capitaine', teamId: teamBleu.id });
const invR = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'joueur', teamId: teamRouge.id });
await api('POST', '/join', bleu, { token: invB.token });
await api('POST', '/join', rouge, { token: invR.token });
await api('POST', '/join', rouge2, { token: invR.token });
console.log(`partie: ${game.id} — Bleu (capitaine) vs Rouge (2 joueurs) ✓`);

// Les rouges se placent : un dans la zone visée, l'autre à 3 km.
const sRouge = await connect(rouge, game.id);
const sRouge2 = await connect(rouge2, game.id);
sRouge.emit('position', { gameId: game.id, lat: 48.4045, lng: 2.6325 });
sRouge2.emit('position', { gameId: game.id, lat: 48.4300, lng: 2.6800 });
await new Promise((r) => setTimeout(r, 1200));
console.log('rouges positionnés : un proche, un lointain ✓');

// 0. Invariant fondamental : SANS drone, les positions adverses ne sont
//    pas connues du camp d'en face — sinon le perk n'aurait aucun sens.
const vuDuBleu = await api('GET', `/games/${game.id}/members`, bleu);
const rougesVus = vuDuBleu.filter((m) => m.teamId === teamRouge.id);
if (rougesVus.length !== 2) throw new Error('le Bleu devrait voir QUI joue');
if (rougesVus.some((m) => m.lastPosition !== null)) {
  throw new Error('FUITE: les positions rouges sont visibles sans drone !');
}
console.log('sans drone : le Bleu sait qui joue, mais pas où ✓');

// 1. Perks configurés par l'organisateur
const drone = await api('POST', `/games/${game.id}/perks`, cdt, {
  type: 'drone', radiusMeters: 300, durationSeconds: 30,
  cooldownSeconds: 0, stockPerTeam: 2, allowedRoles: ['commandant', 'capitaine'],
});
const brouilleur = await api('POST', `/games/${game.id}/perks`, cdt, {
  type: 'jammer', radiusMeters: 500, durationSeconds: 20, cooldownSeconds: 0,
});
console.log('drone (300 m, 2 par équipe, gradés) et brouilleur configurés ✓');

// 2. Un simple joueur n'a pas le droit d'activer le drone
await expectStatus(403,
  () => api('POST', `/games/${game.id}/perks/${drone.id}/activate`, rouge, {
    lat: 48.404, lng: 2.632,
  }),
  'drone activé par un simple joueur');

// 3. Le capitaine bleu lance le drone : il voit le rouge proche, pas le lointain
const sBleu = await connect(bleu, game.id);
const revelations = [];
sBleu.on('perk:reveal', (r) => revelations.push(r));

const resultat = await api('POST', `/games/${game.id}/perks/${drone.id}/activate`, bleu, {
  lat: 48.404, lng: 2.632,
});
if (resultat.contacts.length !== 1) {
  throw new Error(`contacts: ${JSON.stringify(resultat.contacts)}`);
}
console.log(`drone : ${resultat.contacts.length} hostile révélé dans les 300 m ✓`);
console.log(`  (le rouge à 3 km n’apparaît pas — rayon PostGIS respecté) ✓`);

// 4. L'invariant anti-triche : le camp adverse ne reçoit RIEN
const espionnage = [];
sRouge.on('perk:reveal', (r) => espionnage.push(r));
await new Promise((r) => setTimeout(r, 800));
if (espionnage.length !== 0) {
  throw new Error('FUITE: le camp espionné a reçu la révélation !');
}
if (revelations.length === 0) throw new Error('le lanceur n’a rien reçu');
console.log('révélation reçue par le lanceur seul, jamais par l’adversaire ✓');

// 5. Stock d'équipe : 2 utilisations, la 3e est refusée
await api('POST', `/games/${game.id}/perks/${drone.id}/activate`, bleu, {
  lat: 48.404, lng: 2.632,
});
await expectStatus(403,
  () => api('POST', `/games/${game.id}/perks/${drone.id}/activate`, bleu, {
    lat: 48.404, lng: 2.632,
  }),
  'drone au-delà du stock d’équipe');

// 6. Le stock restant est visible pour son équipe
const vueBleu = await api('GET', `/games/${game.id}/perks`, bleu);
const droneVu = vueBleu.find((p) => p.type === 'drone');
if (droneVu.remaining !== 0) throw new Error(`restant: ${droneVu.remaining}`);
const vueRouge = await api('GET', `/games/${game.id}/perks`, rouge);
if (vueRouge.find((p) => p.type === 'drone').remaining !== 2) {
  throw new Error('le stock du Rouge devrait être intact');
}
console.log('stock par équipe : Bleu 0 restant, Rouge 2 restants ✓');

// 7. Brouilleur : le Rouge coupe le drone bleu encore actif
const droneRouge = await api('POST', `/games/${game.id}/perks`, cdt, {
  type: 'drone', radiusMeters: 300, durationSeconds: 60, cooldownSeconds: 0,
});
await api('POST', `/games/${game.id}/perks/${droneRouge.id}/activate`, rouge, {
  lat: 48.404, lng: 2.632,
});
const brouillage = await api('POST', `/games/${game.id}/perks/${brouilleur.id}/activate`, bleu, {
  lat: 48.404, lng: 2.632,
});
if (brouillage.jammed < 1) {
  throw new Error(`aucun drone brouillé: ${JSON.stringify(brouillage)}`);
}
console.log(`brouilleur : ${brouillage.jammed} drone(s) adverse(s) coupé(s) ✓`);

// 8. Recharge : un perk avec cooldown refuse la seconde activation immédiate
const droneLent = await api('POST', `/games/${game.id}/perks`, cdt, {
  type: 'drone', radiusMeters: 200, durationSeconds: 10, cooldownSeconds: 600,
});
await api('POST', `/games/${game.id}/perks/${droneLent.id}/activate`, rouge, {
  lat: 48.404, lng: 2.632,
});
await expectStatus(403,
  () => api('POST', `/games/${game.id}/perks/${droneLent.id}/activate`, rouge, {
    lat: 48.404, lng: 2.632,
  }),
  'activation pendant la recharge');

sBleu.close(); sRouge.close(); sRouge2.close();
console.log('E2E PERKS : TOUT PASSE');
process.exit(0);
