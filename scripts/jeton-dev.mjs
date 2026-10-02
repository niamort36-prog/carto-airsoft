// Forge un jeton d'accès local, sans Supabase.
//
// L'API accepte deux modes d'authentification (apps/api/src/auth/
// supabase-token.service.ts) : les clés publiques du projet Supabase, ou un
// secret partagé HS256. Le second existe pour le développement — il permet
// de faire tourner la pile entière sur un PC sans compte, sans mot de passe
// et sans réseau.
//
// Usage :
//   node scripts/jeton-dev.mjs "Nom affiché"
//
// Le jeton obtenu n'est accepté QUE par une API lancée avec le même
// SUPABASE_JWT_SECRET. Sur l'API de production, qui vérifie les signatures
// de Supabase, il ne vaut rien.
import { createHmac, randomUUID } from 'node:crypto';
import { basename } from 'node:path';

const SECRET_DEFAUT = 'secret-de-developpement';
const DUREE_H = 24;

/** UUID déterministe dérivé du pseudo. */
function uuidDepuis(texte) {
  const h = createHmac('sha256', 'carto-airsoft-dev')
    .update(texte)
    .digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * Forge un jeton HS256 pour `pseudo`.
 *
 * L'identifiant est dérivé du pseudo : rejouer le script ne crée pas un
 * second joueur du même nom, et un scénario reste rejouable.
 */
export function forgerJeton(pseudo = 'Dev', options = {}) {
  const secret =
    options.secret ?? process.env.SUPABASE_JWT_SECRET ?? SECRET_DEFAUT;
  const sub = options.sub ?? uuidDepuis(pseudo);
  const maintenant = Math.floor(Date.now() / 1000);
  const charge = {
    sub,
    aud: process.env.SUPABASE_JWT_AUD ?? 'authenticated',
    role: 'authenticated',
    email: `${pseudo.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@dev.local`,
    user_metadata: { pseudo },
    iat: maintenant,
    exp: maintenant + (options.dureeHeures ?? DUREE_H) * 3600,
    // Supabase le pose ; des clients le lisent pour savoir qui ils sont.
    session_id: randomUUID(),
  };
  const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(charge)}`;
  const signature = createHmac('sha256', secret)
    .update(corps)
    .digest('base64url');
  return { jeton: `${corps}.${signature}`, ...charge };
}

// Exécuté directement : on imprime le jeton.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  // Les drapeaux ne sont pas des arguments : sans ce tri, `--json` passait
  // pour un identifiant d'utilisateur.
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const infos = forgerJeton(args[0] ?? 'Dev', { sub: args[1] });
  console.log(
    process.argv.includes('--json') ? JSON.stringify(infos) : infos.jeton,
  );
}
