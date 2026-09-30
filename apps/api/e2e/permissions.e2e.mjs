// E2E matrice de permissions (§5) : les capacités ne sont plus liées à un
// rôle codé en dur — on retire une permission au capitaine et son pouvoir
// disparaît, on l'accorde à un joueur et il l'obtient, sans redéploiement.
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

const expect403 = async (fn, label) => {
  try {
    await fn();
    throw new Error(`PROBLEME: ${label} aurait dû être refusé`);
  } catch (e) {
    if (e.status !== 403) throw e;
    console.log(`${label}: 403 ✓`);
  }
};

const cdt = await token('test.e2e@cartoairsoft.dev');
const cap = await token('test.e2e2@cartoairsoft.dev');
const joueur = await token('test.e2e3@cartoairsoft.dev');

const game = await api('POST', '/games', cdt, { name: 'Test permissions' });
const capInvite = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'capitaine' });
const joueurInvite = await api('POST', `/games/${game.id}/invites`, cdt, { role: 'joueur' });
await api('POST', '/join', cap, { token: capInvite.token });
await api('POST', '/join', joueur, { token: joueurInvite.token });
console.log(`partie: ${game.id}`);

// 1. Matrice par défaut exposée, avec mes propres permissions
const asCdt = await api('GET', `/games/${game.id}/permissions`, cdt);
const asJoueur = await api('GET', `/games/${game.id}/permissions`, joueur);
if (!asCdt.mine.includes('game:manage')) throw new Error('commandant sans game:manage');
if (asJoueur.mine.length !== 0) throw new Error(`joueur: ${asJoueur.mine}`);
console.log(`catalogue: ${asCdt.catalogue.length} permissions ✓`);
console.log(`commandant: ${asCdt.mine.length} permissions, joueur: ${asJoueur.mine.length} ✓`);

// 2. Le capitaine gère les invitations par défaut…
const made = await api('POST', `/games/${game.id}/invites`, cap, { role: 'joueur' });
console.log('capitaine génère une invitation (défaut) ✓');

// 3. …on lui retire la permission : son pouvoir disparaît, sans redéploiement
await api('PATCH', `/games/${game.id}/permissions`, cdt, {
  role: 'capitaine',
  changes: { 'invites:manage': false },
});
await expect403(
  () => api('POST', `/games/${game.id}/invites`, cap, { role: 'joueur' }),
  'invitation par un capitaine privé de invites:manage');

// 4. On l'accorde à un simple joueur : il l'obtient aussitôt
await api('PATCH', `/games/${game.id}/permissions`, cdt, {
  role: 'joueur',
  changes: { 'invites:manage': true },
});
const byJoueur = await api('POST', `/games/${game.id}/invites`, joueur, { role: 'joueur' });
if (!byJoueur.token) throw new Error('le joueur habilité devrait pouvoir inviter');
console.log('joueur habilité génère une invitation ✓');

// 5. La hiérarchie reste un garde-fou : même habilité, on n'invite pas
//    à un grade supérieur ou égal au sien
await expect403(
  () => api('POST', `/games/${game.id}/invites`, joueur, { role: 'capitaine' }),
  'joueur habilité invitant au grade de capitaine');

// 6. Le canal commandement suit la permission chat:command
const capChannelsBefore = await api('GET', `/games/${game.id}/channels`, cap);
if (!capChannelsBefore.some((c) => c.scope === 'command')) {
  throw new Error('le capitaine devrait voir le canal commandement');
}
await api('PATCH', `/games/${game.id}/permissions`, cdt, {
  role: 'capitaine',
  changes: { 'chat:command': false },
});
const capChannelsAfter = await api('GET', `/games/${game.id}/channels`, cap);
if (capChannelsAfter.some((c) => c.scope === 'command')) {
  throw new Error('canal commandement encore visible après retrait');
}
console.log('canal commandement retiré au capitaine par la matrice ✓');

// …et un joueur peut y accéder si on le lui accorde
await api('PATCH', `/games/${game.id}/permissions`, cdt, {
  role: 'joueur',
  changes: { 'chat:command': true },
});
const joueurChannels = await api('GET', `/games/${game.id}/channels`, joueur);
if (!joueurChannels.some((c) => c.scope === 'command')) {
  throw new Error('joueur habilité devrait voir le canal commandement');
}
console.log('canal commandement ouvert à un joueur par la matrice ✓');

// 7. Modifier la matrice exige game:manage
await expect403(
  () => api('PATCH', `/games/${game.id}/permissions`, joueur, {
    role: 'joueur', changes: { 'game:manage': true },
  }),
  'modification de la matrice par un non-habilité');

// 8. La matrice est bien persistée par partie
const reread = await api('GET', `/games/${game.id}/permissions`, cdt);
if (reread.matrix.capitaine.includes('invites:manage')) {
  throw new Error('surcharge non persistée');
}
if (!reread.matrix.joueur.includes('chat:command')) {
  throw new Error('surcharge joueur non persistée');
}
console.log('surcharges persistées et relues ✓');

// 9. Une autre partie garde les défauts (surcharges non contagieuses)
const other = await api('POST', '/games', cdt, { name: 'Test permissions 2' });
const otherMatrix = await api('GET', `/games/${other.id}/permissions`, cdt);
if (!otherMatrix.matrix.capitaine.includes('invites:manage')) {
  throw new Error('les surcharges ont fuité vers une autre partie');
}
console.log('surcharges isolées par partie ✓');

console.log('E2E PERMISSIONS : TOUT PASSE');
