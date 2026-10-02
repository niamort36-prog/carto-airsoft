// Démarre tout ce qu'il faut pour jouer, en une commande.
//
// Base de données, serveur, tunnel HTTPS : trois choses à lancer dans trois
// terminaux, dans le bon ordre, en attendant que chacune soit prête. C'est
// une corvée avant chaque partie, et chaque oubli se manifeste plus tard
// par une panne qui ne ressemble pas à sa cause.
//
// Usage : npm run terrain
// Arrêt  : Ctrl+C — tout est refermé, tunnel compris.

import { spawn, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');
const API = 'http://127.0.0.1:3000/v1/health';
const SOUS_DOMAINE = process.env.TUNNEL_SUBDOMAIN ?? '';

/**
 * Mode réseau local : pas de tunnel du tout.
 *
 * Quand tous les téléphones sont sur le même Wi-Fi que le PC, passer par
 * Internet pour revenir au PC d'à côté n'a aucun sens — et c'est ce détour
 * qui impose le HTTPS. En local, l'adresse est stable tant que le PC garde
 * la sienne, et il n'y a plus rien à recoller entre deux parties.
 */
const MODE_LOCAL = process.argv.includes('--lan');
const PORT_APP = 5174;

/** Adresse du PC sur le réseau local. */
function adresseLocale() {
  const cartes = Object.values(networkInterfaces()).flat();
  const prive = cartes.find(
    (c) => c && c.family === 'IPv4' && !c.internal && c.address.startsWith('192.168.'),
  );
  if (prive) return prive.address;
  const autre = cartes.find((c) => c && c.family === 'IPv4' && !c.internal);
  return autre ? autre.address : null;
}

/** Types servis par le petit serveur de fichiers du mode local. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.bin': 'application/octet-stream',
};

const enfants = [];
let arretEnCours = false;

/** Tue un processus ET sa descendance : sur Windows, tuer `npm` laisse
 *  `node` orphelin, et le port 3000 reste occupé. */
function tuer(child) {
  if (!child) return;
  // Le serveur de fichiers du mode local n'est pas un processus : il se
  // ferme, il ne se tue pas.
  if (child._serveur) {
    try {
      child._serveur.close();
    } catch {
      // Déjà fermé.
    }
    return;
  }
  if (child.exitCode != null) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Déjà mort : rien à faire.
  }
}

function arreter(code = 0) {
  if (arretEnCours) return;
  arretEnCours = true;
  console.log('\nArrêt…');
  enfants.forEach(tuer);
  // Laisse le temps aux processus de se refermer proprement.
  setTimeout(() => process.exit(code), 400);
}

process.on('SIGINT', () => arreter(0));
process.on('SIGTERM', () => arreter(0));

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function enLigne(url, limiteMs) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      // Pas encore prêt.
    }
    await attendre(1500);
  }
  return false;
}

function etape(n, texte) {
  console.log(`\n[${n}/3] ${texte}`);
}

// --- 1. La base de données -------------------------------------------------
etape(1, 'Base de données');
try {
  execFileSync('docker', ['compose', 'up', '-d'], {
    cwd: racine,
    stdio: 'inherit',
  });
} catch {
  console.error(
    '\nDocker ne répond pas. Ouvrez Docker Desktop, attendez qu’il affiche\n' +
      '« running », puis relancez cette commande.',
  );
  process.exit(1);
}

// --- 2. Le serveur ---------------------------------------------------------
etape(2, 'Serveur de jeu');
const api = spawn('npm', ['run', 'start:dev', '--workspace', 'apps/api'], {
  cwd: racine,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});
enfants.push(api);
// On n'affiche pas tout le journal de démarrage : il noie l'information
// utile, qui est l'adresse du tunnel. Les erreurs, elles, passent.
api.stderr.on('data', (d) => process.stderr.write(d));
api.on('exit', (code) => {
  if (!arretEnCours) {
    console.error(`\nLe serveur s’est arrêté (code ${code}).`);
    arreter(1);
  }
});

if (!(await enLigne(API, 90_000))) {
  console.error(
    '\nLe serveur n’a pas démarré en 90 s. Regardez les erreurs ci-dessus,\n' +
      'ou lancez `npm run api:dev` seul pour voir son journal complet.',
  );
  arreter(1);
}
console.log('    prêt sur http://localhost:3000');

// --- 3. Comment les téléphones joignent le serveur -------------------------
if (MODE_LOCAL) {
  etape(3, 'Service sur le réseau local');

  const siteWeb = join(racine, 'apps', 'mobile', 'build', 'web');
  if (!existsSync(join(siteWeb, 'index.html'))) {
    console.log('    première fois : construction de l’application…');
    try {
      execFileSync('flutter', ['build', 'web', '--release'], {
        cwd: join(racine, 'apps', 'mobile'),
        stdio: 'inherit',
      });
    } catch {
      console.error(
        '\nLa construction a échoué. Lancez `npm run webapp:build` seul pour\n' +
          'voir le détail.',
      );
      arreter(1);
    }
  }

  // Serveur de fichiers minimal : l'application est un site statique, et
  // tirer une dépendance pour servir quatre fichiers serait disproportionné.
  const serveur = createServer((req, res) => {
    const demande = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let chemin = join(siteWeb, normalize(demande).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(chemin) || statSync(chemin).isDirectory()) {
      // L'application gère sa propre navigation : toute route inconnue
      // retombe sur sa page d'accueil.
      chemin = join(siteWeb, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(chemin)] ?? 'application/octet-stream',
      // Exigé par le moteur de base locale de l'application.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    });
    createReadStream(chemin).pipe(res);
  });
  serveur.listen(PORT_APP, '0.0.0.0');
  enfants.push({ pid: null, exitCode: null, _serveur: serveur });

  const ip = adresseLocale();
  if (!ip) {
    console.error('\nAucune adresse réseau trouvée. Le PC est-il connecté ?');
    arreter(1);
  }

  const appUrl = `http://${ip}:${PORT_APP}`;
  const apiUrl = `http://${ip}:3000/v1`;
  const ligne = '═'.repeat(Math.max(appUrl.length, apiUrl.length) + 8);
  console.log(`\n${ligne}`);
  console.log(`  Application : ${appUrl}`);
  console.log(`  Serveur     : ${apiUrl}`);
  console.log(`${ligne}`);
  console.log(
    '\nSur chaque téléphone, CONNECTÉ AU MÊME WI-FI :\n' +
      `  ouvrir ${appUrl} — et c’est tout.\n` +
      '\nL’application voit qu’elle vient d’une adresse de réseau local\n' +
      `et vise ce même PC (${apiUrl}) : rien à recopier à la main.\n` +
      '« Adresse du serveur » reste là pour corriger.\n' +
      '\nAucun tunnel, aucun HTTPS : la page et le serveur sont tous deux en\n' +
      'clair sur le réseau local, le navigateur ne bloque rien.\n' +
      '\nCette adresse ne change pas tant que le PC garde la sienne.\n' +
      'Ctrl+C pour tout arrêter.',
  );
  try {
    if (process.platform === 'win32') {
      execFileSync('clip', [], { input: apiUrl });
      console.log('\n(adresse du serveur copiée dans le presse-papier)');
    }
  } catch {
    // Sans presse-papier, l'adresse reste lisible à l'écran.
  }
} else {
  etape(3, 'Adresse HTTPS publique');
  const cible = SOUS_DOMAINE
    ? `${SOUS_DOMAINE}:80:localhost:3000`
    : '80:localhost:3000';
  const tunnel = spawn(
    'ssh',
    [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', cible,
      'nokey@localhost.run',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  enfants.push(tunnel);

  let adresse = null;
  const lire = (donnee) => {
    const texte = donnee.toString();
    const trouve = texte.match(/https:\/\/[a-z0-9-]+\.lhr\.life/);
    if (trouve && !adresse) {
      adresse = trouve[0];
      annoncer(adresse);
    }
  };
  tunnel.stdout.on('data', lire);
  tunnel.stderr.on('data', lire);
  tunnel.on('exit', (code) => {
    if (!arretEnCours) {
      console.error(`\nLe tunnel s’est fermé (code ${code}).`);
      arreter(1);
    }
  });

  function annoncer(url) {
    const ligne = '═'.repeat(url.length + 8);
    console.log(`\n${ligne}`);
    console.log(`    ${url}`);
    console.log(`${ligne}`);
    console.log(
      '\nCollez cette adresse dans l’application (« Adresse du serveur », sur\n' +
        'l’écran de connexion) et dans la console (bouton « Serveur »).\n' +
        '\nLaissez cette fenêtre ouverte : la fermer coupe le tunnel.\n' +
        'Ctrl+C pour tout arrêter.',
    );
    // Dans le presse-papier : une adresse se recopie à la main sans erreur
    // une fois, pas dix.
    try {
      if (process.platform === 'win32') {
        execFileSync('clip', [], { input: url });
        console.log('\n(copiée dans le presse-papier)');
      }
    } catch {
      // Sans presse-papier, l'adresse reste lisible à l'écran.
    }
  }

  setTimeout(() => {
    if (!adresse) {
      console.error(
        '\nLe tunnel n’a pas donné d’adresse. Vérifiez votre connexion, ou\n' +
          'lancez la commande du guide à la main : docs/GUIDE_HTTPS.md',
      );
    }
  }, 30_000);
}
