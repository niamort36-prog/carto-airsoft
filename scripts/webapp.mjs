// Sert la webapp ET l'API sous une seule adresse.
//
// Le navigateur traite une page et son serveur comme deux mondes dès qu'ils
// diffèrent d'un port : il faut alors du CORS, parfois du HTTPS, et chaque
// joueur doit recopier l'adresse du serveur à la main. En plaçant les deux
// derrière la même origine, tout cela disparaît — il reste une adresse à
// ouvrir, et rien à régler.
//
// Usage :
//   node scripts/webapp.mjs                 # :5180, API sur :3000
//   node scripts/webapp.mjs --api 3001      # vise une autre API
//   node scripts/webapp.mjs --port 8080
//   node scripts/webapp.mjs --dir build/web-dev
//
// Ce qui commence par /v1 ou /socket.io part vers l'API ; tout le reste est
// un fichier de la webapp.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');

/** Lit une option `--nom valeur`. */
const option = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
};

const PORT = Number(option('port', 5180));
const PORT_API = Number(option('api', 3000));
const SITE = resolve(racine, option('dir', 'apps/mobile/build/web'));

if (!existsSync(join(SITE, 'index.html'))) {
  console.error(
    `Rien à servir dans ${SITE}.\n` +
      'Construisez d’abord la webapp :\n' +
      '  cd apps/mobile && flutter build web --release',
  );
  process.exit(1);
}

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

/** Vrai pour ce qui doit partir vers l'API plutôt que vers les fichiers. */
const versApi = (url) =>
  url.startsWith('/v1') || url.startsWith('/socket.io') || url.startsWith('/j/');

const serveur = createServer((req, res) => {
  if (versApi(req.url ?? '/')) {
    const relais = httpRequest(
      {
        host: '127.0.0.1',
        port: PORT_API,
        path: req.url,
        method: req.method,
        // L'API voit la requête telle que le navigateur l'a faite.
        headers: { ...req.headers, host: `127.0.0.1:${PORT_API}` },
      },
      (reponse) => {
        res.writeHead(reponse.statusCode ?? 502, reponse.headers);
        reponse.pipe(res);
      },
    );
    relais.on('error', (e) => {
      // Dire que l'API est absente, plutôt que de laisser le navigateur
      // conclure à une panne réseau : les deux ne se corrigent pas pareil.
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          message:
            `Serveur de jeu injoignable sur le port ${PORT_API} (${e.code}). ` +
            'Est-il démarré ?',
        }),
      );
    });
    req.pipe(relais);
    return;
  }

  const demande = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let chemin = join(SITE, normalize(demande));
  const dedans = relative(SITE, chemin);
  if (dedans.startsWith('..') || isAbsolute(dedans)) chemin = join(SITE, 'index.html');
  if (!existsSync(chemin) || statSync(chemin).isDirectory()) {
    // La webapp gère sa propre navigation : toute route inconnue retombe
    // sur sa page d'accueil.
    chemin = join(SITE, 'index.html');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(chemin)] ?? 'application/octet-stream',
    // Exigées par le moteur de base locale de la webapp.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  });
  createReadStream(chemin).pipe(res);
});

// Le temps réel passe par une montée en WebSocket, que le relais HTTP
// ordinaire ne couvre pas : sans ceci, la carte ne verrait jamais bouger
// personne.
serveur.on('upgrade', (req, socket, head) => {
  if (!versApi(req.url ?? '/')) return socket.destroy();
  const amont = netConnect(PORT_API, '127.0.0.1', () => {
    const entetes = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    amont.write(`${req.method} ${req.url} HTTP/1.1\r\n${entetes}\r\n\r\n`);
    if (head?.length) amont.write(head);
    amont.pipe(socket);
    socket.pipe(amont);
  });
  amont.on('error', () => socket.destroy());
  socket.on('error', () => amont.destroy());
});

/** Adresse du PC sur le réseau local. */
function adresseLocale() {
  const cartes = Object.values(networkInterfaces()).flat();
  const prive = cartes.find(
    (c) => c && c.family === 'IPv4' && !c.internal && c.address.startsWith('192.168.'),
  );
  if (prive) return prive.address;
  const autre = cartes.find((c) => c && c.family === 'IPv4' && !c.internal);
  return autre ? autre.address : 'localhost';
}

serveur.listen(PORT, '0.0.0.0', () => {
  const url = `http://${adresseLocale()}:${PORT}`;
  const ligne = '═'.repeat(url.length + 8);
  console.log(`\n${ligne}\n    ${url}\n${ligne}`);
  console.log(
    `\nLa webapp et l’API (port ${PORT_API}) partagent cette adresse : rien à\n` +
      'régler sur les téléphones, il suffit de l’ouvrir depuis le même Wi-Fi.\n' +
      '\nCtrl+C pour arrêter.',
  );
});
