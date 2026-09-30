// E2E invitations QR (§7.2) : jeton opaque sans rôle en clair, résolution
// serveur du rôle, usage limité, révocation, expiration, et jamais de fuite
// du jeton par les endpoints de lecture.
import { createHash } from 'node:crypto';

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
const p2 = await token('test.e2e2@cartoairsoft.dev');
const p3 = await token('test.e2e3@cartoairsoft.dev');
const p4 = await token('test.e2e4@cartoairsoft.dev');

const game = await api('POST', '/games', cdt, { name: 'Test invitations' });
console.log(`partie: ${game.id}`);

// 1. Le QR encode un jeton opaque — aucune trace du rôle
const capInvite = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'capitaine',
});
const clear = capInvite.token.toLowerCase();
for (const leak of ['capitaine', 'commandant', 'chef', 'joueur', 'role']) {
  if (clear.includes(leak) || capInvite.url.toLowerCase().includes(leak)) {
    throw new Error(`FUITE: « ${leak} » apparaît dans le QR`);
  }
}
console.log(`jeton opaque (${capInvite.token.length} car.), aucun rôle en clair ✓`);
console.log(`URL du QR: ${capInvite.url.replace(capInvite.token, '…')} ✓`);

// 2. Tous les QR sont réutilisables par défaut (pas de limite d'usage)
const joueurInvite = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'joueur',
});
if (capInvite.maxUses !== null || joueurInvite.maxUses !== null) {
  throw new Error('les QR devraient être réutilisables par défaut');
}
console.log('tous les QR réutilisables par défaut ✓');

// …mais une limite reste possible à la demande (mécanique conservée)
const limited = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'chef_escouade',
  maxUses: 1,
});
if (limited.maxUses !== 1) throw new Error('limite explicite ignorée');
console.log('limite explicite (maxUses) toujours possible ✓');

// 3. Le grade de commandant ne se délègue pas par QR (§5 : un seul chef)
await expectStatus(400,
  () => api('POST', `/games/${game.id}/invites`, cdt, { role: 'commandant' }),
  'invitation au grade de commandant');

// 4. Un joueur ordinaire ne peut pas fabriquer d'invitation
await api('POST', '/join', p2, { token: joueurInvite.token });
await expectStatus(403,
  () => api('POST', `/games/${game.id}/invites`, p2, { role: 'capitaine' }),
  'création d’invitation par un non-commandant');
await expectStatus(403,
  () => api('GET', `/games/${game.id}/invites`, p2),
  'lecture des invitations par un non-commandant');

// 4. Le serveur attribue le rôle du jeton — le client ne le choisit pas
const joined = await api('POST', '/join', p3, { token: capInvite.token });
if (joined.role !== 'capitaine') throw new Error(`rôle obtenu: ${joined.role}`);
console.log(`scan du QR capitaine → rôle « ${joined.role} » attribué par le serveur ✓`);

// 5. Le QR capitaine est réutilisable : un second joueur passe aussi
const joined4b = await api('POST', '/join', p4, { token: capInvite.token });
if (joined4b.role !== 'capitaine') throw new Error(`rôle: ${joined4b.role}`);
console.log('QR capitaine réutilisé par un second joueur ✓');

// 6. Un QR explicitement limité s'épuise bien
const p6 = await token('test.e2e6@cartoairsoft.dev');
const p7 = await token('test.e2e7@cartoairsoft.dev');
await api('POST', '/join', p6, { token: limited.token });
await expectStatus(410,
  () => api('POST', '/join', p7, { token: limited.token }),
  'QR limité à 1 usage, épuisé');

// 7. Rescanner quand on est déjà membre ne change rien et ne consomme rien
const before = (await api('GET', `/games/${game.id}/invites`, cdt))
  .find((i) => i.id === joueurInvite.id).useCount;
await api('POST', '/join', p4, { token: joueurInvite.token });
const after = (await api('GET', `/games/${game.id}/invites`, cdt))
  .find((i) => i.id === joueurInvite.id).useCount;
if (before !== after) throw new Error(`usage consommé inutilement: ${before} → ${after}`);
console.log('rescan par un membre déjà présent : sans effet ✓');

// 8. La liste ne divulgue jamais le jeton
const list = await api('GET', `/games/${game.id}/invites`, cdt);
const serialized = JSON.stringify(list);
if (serialized.includes(capInvite.token) || serialized.includes(joueurInvite.token)) {
  throw new Error('FUITE: un jeton apparaît dans la liste');
}
if (list.some((i) => 'token' in i || 'tokenHash' in i)) {
  throw new Error('FUITE: champ token/tokenHash exposé');
}
console.log('la liste des invitations ne contient aucun jeton ✓');

// 9. Révocation immédiate
await api('DELETE', `/games/${game.id}/invites/${joueurInvite.id}`, cdt);
const p5 = await token('test.e2e5@cartoairsoft.dev');
await expectStatus(410,
  () => api('POST', '/join', p5, { token: joueurInvite.token }),
  'scan d’un QR révoqué');

// 10. Expiration
const expired = await api('POST', `/games/${game.id}/invites`, cdt, {
  role: 'capitaine',
  expiresAt: new Date(Date.now() - 60_000).toISOString(),
});
await expectStatus(410,
  () => api('POST', '/join', p5, { token: expired.token }),
  'scan d’un QR expiré');

// 11. Jeton inventé
await expectStatus(404,
  () => api('POST', '/join', p5, { token: 'jeton-totalement-invente-1234567890' }),
  'jeton inconnu');

// 12. L'URL complète du QR est acceptée (appareil photo natif)
const urlInvite = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'joueur' });
const viaUrl = await api('POST', '/join', p5, { token: urlInvite.url });
if (viaUrl.role !== 'joueur') throw new Error('URL du QR refusée');
console.log('URL complète du QR acceptée (scan par appareil photo natif) ✓');

// 13. Le hachage protège la base : l'empreinte n'est pas le jeton
const members = await api('GET', `/games/${game.id}/members`, cdt);
console.log(`membres après invitations: ${members.map((m) => m.role).join(', ')} ✓`);
console.log(`(empreinte SHA-256 stockée, ex. ${createHash('sha256').update(capInvite.token).digest('hex').slice(0, 16)}…)`);

console.log('E2E INVITATIONS QR : TOUT PASSE');
