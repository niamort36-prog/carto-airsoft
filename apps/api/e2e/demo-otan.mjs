// Prépare une partie de démonstration pour VOIR la symbologie OTAN sur la
// carte : une escouade avec sa fréquence radio, un véhicule étiqueté, un
// hostile. Usage : node e2e/demo-otan.mjs ["<nom>"]
//
// L'escouade est posée à l'écart du créateur : son marqueur de groupe se lit
// alors sans chevaucher l'insigne du joueur.
import { io } from 'socket.io-client';

const SUPABASE = 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = 'http://localhost:3000/v1';
const PASSWORD = 'TestE2E2026';

const login = async (email) => {
  const body = JSON.stringify({ email, password: PASSWORD });
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  let r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: h, body });
  if (!r.ok) r = await fetch(`${SUPABASE}/auth/v1/signup`, { method: 'POST', headers: h, body });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
};

const call = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

const owner = await login('test.e2e@cartoairsoft.dev');
const nom = process.argv[2] ?? 'Demo OTAN';
const game = await call('POST', '/games', owner, { name: nom });
const bleu = await call('POST', `/games/${game.id}/teams`, owner, { name: 'Bleu', color: '#2196F3' });

let membres = await call('GET', `/games/${game.id}/members`, owner);
const moi = membres[0];
await call('PATCH', `/games/${game.id}/members/${moi.membershipId}/assignment`, owner, { teamId: bleu.id });
await call('PATCH', `/games/${game.id}/members/${moi.membershipId}`, owner, { note: '446.00625' });

const alpha = await call('POST', `/games/${game.id}/squads`, owner, { teamId: bleu.id, name: 'ALPHA' });
await call('PATCH', `/games/${game.id}/squads/${alpha.id}`, owner, { note: '446.09375' });

// Quatre hommes serrés : de quoi déclencher le repli en marqueur d'escouade.
// Le créateur est à 48.404 / 2.632 (position de l'émulateur) ; l'escouade
// se tient 300 m au nord-est.
const centre = { lat: 48.4068, lng: 2.6358 };
const equipiers = ['test.e2e2', 'test.e2e3', 'test.e2e4', 'test.e2e5'];
const jetons = [];
for (const [i, prefixe] of equipiers.entries()) {
  const invite = await call('POST', `/games/${game.id}/invites`, owner, { role: 'joueur' });
  const tok = await login(`${prefixe}@cartoairsoft.dev`);
  await call('POST', '/join', tok, { token: invite.token });
  membres = await call('GET', `/games/${game.id}/members`, owner);
  const lui = membres.find((m) => m.membershipId !== moi.membershipId && m.squadId === null && m.teamId === null);
  await call('PATCH', `/games/${game.id}/members/${lui.membershipId}/assignment`, owner, { teamId: bleu.id });
  await call('PATCH', `/games/${game.id}/members/${lui.membershipId}/assignment`, owner, { squadId: alpha.id });
  await call('PATCH', `/games/${game.id}/members/${lui.membershipId}`, owner, { unitType: ['infantry', 'recon', 'sniper', 'medical'][i] });
  jetons.push({ tok, i });
}

// Un véhicule étiqueté et un hostile, posés à côté.
await call('POST', `/games/${game.id}/map-objects/batch`, owner, {
  objects: [
    {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), kind: 'marker',
      lat: centre.lat - 0.0012, lng: centre.lng - 0.0016,
      properties: { icon: 'transport_allied', unitLabel: 'Transport', note: 'V-12 · 446.5' },
    },
    {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), kind: 'marker',
      lat: centre.lat - 0.0028, lng: centre.lng + 0.0004,
      properties: { icon: 'infantry_hostile', unitLabel: 'Infanterie hostile' },
    },
  ],
});

// Les positions passent par la passerelle temps réel.
let restants = jetons.length;
for (const { tok, i } of jetons) {
  const socket = io('http://localhost:3000/game', { auth: { token: tok }, transports: ['websocket'] });
  socket.on('connect', () => {
    socket.emit('game:join', { gameId: game.id }, () => {
      const angle = (i * Math.PI) / 2;
      socket.emit('position', {
        gameId: game.id,
        lat: centre.lat + 0.0003 * Math.cos(angle),
        lng: centre.lng + 0.0005 * Math.sin(angle),
      });
      setTimeout(() => {
        socket.close();
        if (--restants === 0) {
          console.log(`« ${nom} » prête — id: ${game.id}`);
          process.exit(0);
        }
      }, 1200);
    });
  });
}
