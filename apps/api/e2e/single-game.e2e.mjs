// E2E « une seule partie créée à la fois » : créer une partie efface la
// précédente ET tout ce qu'elle contenait, MAIS ne touche jamais aux parties
// d'autrui que l'on a rejointes.
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

const moi = await token('test.e2e@cartoairsoft.dev');
const autre = await token('test.e2e2@cartoairsoft.dev');

// L'autre joueur crée SA partie et m'y invite : elle ne doit jamais être
// supprimée par mes propres créations.
const sienne = await api('POST', '/games', autre, { name: 'Partie de l’autre' });
const invitation = await api('POST', `/games/${sienne.id}/invites`, autre, { role: 'joueur' });
await api('POST', '/join', moi, { token: invitation.token });
console.log(`partie d’autrui rejointe : ${sienne.name} ✓`);

// 1. Je crée une première partie et j'y mets du contenu
const premiere = await api('POST', '/games', moi, { name: 'Première partie' });
await api('POST', `/games/${premiere.id}/teams`, moi, { name: 'Bleu' });
await api('POST', `/games/${premiere.id}/invites`, moi, { role: 'joueur' });
await api('POST', `/games/${premiere.id}/map-objects/batch`, moi, {
  objects: [{
    id: randomUUID(), markerType: 'unit', lat: 48.4, lng: 2.6,
    properties: { icon: 'infantry_hostile' }, createdAt: new Date().toISOString(),
  }],
});
const canaux = await api('GET', `/games/${premiere.id}/channels`, moi);
await api('POST', `/games/${premiere.id}/channels/${canaux[0].id}/messages`, moi, {
  id: randomUUID(), body: 'message de la première', createdAt: new Date().toISOString(),
});
console.log('première partie créée et garnie (équipe, QR, marqueur, message) ✓');

let mesParties = await api('GET', '/games', moi);
const miennes = mesParties.filter((g) => g.role === 'commandant');
if (miennes.length !== 1 || miennes[0].game.id !== premiere.id) {
  throw new Error(`attendu 1 partie créée, obtenu ${miennes.length}`);
}
console.log('une seule partie créée dans ma liste ✓');

// 2. J'en crée une seconde : la première disparaît
const seconde = await api('POST', '/games', moi, { name: 'Seconde partie' });
mesParties = await api('GET', '/games', moi);
const miennesApres = mesParties.filter((g) => g.role === 'commandant');
if (miennesApres.length !== 1 || miennesApres[0].game.id !== seconde.id) {
  throw new Error(
    `après création: ${miennesApres.map((g) => g.game.name).join(', ')}`,
  );
}
console.log('la nouvelle partie a remplacé l’ancienne ✓');

// 3. L'ancienne est réellement inaccessible (et non juste masquée)
try {
  await api('GET', `/games/${premiere.id}/members`, moi);
  throw new Error('PROBLEME: l’ancienne partie répond encore');
} catch (e) {
  if (e.status !== 403 && e.status !== 404) throw e;
  console.log(`ancienne partie inaccessible: ${e.status} ✓`);
}

// 4. La partie d'autrui que j'avais rejointe est intacte
mesParties = await api('GET', '/games', moi);
const toujoursLa = mesParties.find((g) => g.game.id === sienne.id);
if (!toujoursLa) throw new Error('la partie d’autrui a été supprimée !');
const membres = await api('GET', `/games/${sienne.id}/members`, autre);
if (membres.length !== 2) throw new Error('les membres d’autrui ont été touchés');
console.log('la partie rejointe chez autrui est intacte ✓');

// 5. Son propriétaire la voit toujours
const sesParties = await api('GET', '/games', autre);
if (!sesParties.some((g) => g.game.id === sienne.id)) {
  throw new Error('le propriétaire a perdu sa partie');
}
console.log('le propriétaire garde bien sa partie ✓');

console.log('E2E PARTIE UNIQUE : TOUT PASSE');
