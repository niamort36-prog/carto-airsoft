// Publie la console sur son propre dépôt GitHub Pages.
//
// Ce dépôt ne contient QUE le site construit : il n'a pas de source, elle
// vit ici. Une copie de la source y divergerait au premier correctif ; une
// copie du RÉSULTAT, non — elle est réécrite à chaque publication.
//
// Usage : npm run console:publish
//
// Prérequis : `gh auth login` (le dépôt est poussé avec vos identifiants).

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEPOT = process.env.CONSOLE_REPO ?? 'niamort36-prog/carto-airsoft-console';
const BASE = `/${DEPOT.split('/')[1]}/`;
const racine = resolve(import.meta.dirname, '..');
const dist = join(racine, 'apps', 'console', 'dist');

// Sans `shell` : sur Windows il redecoupe les arguments, et un message de
// commit contenant des espaces se retrouve tronque. `git` est un vrai
// executable, il n'a besoin d'aucun shell.
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

console.log(`Construction de la console pour ${BASE}`);
execFileSync(
  'npm',
  ['run', 'build', '--workspace', 'apps/console'],
  {
    cwd: racine,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // `base` doit correspondre au sous-chemin servi par Pages, sinon la
    // page se charge et reste blanche : elle cherche ses fichiers un cran
    // trop haut.
    env: { ...process.env, CONSOLE_BASE: BASE },
  },
);

const travail = mkdtempSync(join(tmpdir(), 'console-pages-'));
try {
  cpSync(dist, travail, { recursive: true });
  // Pages n'a pas de règle de réécriture : le 404 sert de repli.
  copyFileSync(join(travail, 'index.html'), join(travail, '404.html'));
  writeFileSync(
    join(travail, 'README.md'),
    `# Console Carto Airsoft — site publié\n\n` +
      `Ce dépôt ne contient **que le site construit**. La source vit dans\n` +
      `[carto-airsoft](https://github.com/niamort36-prog/carto-airsoft),\n` +
      `sous \`apps/console/\`, et se republie par \`npm run console:publish\`.\n\n` +
      `En ligne : **https://niamort36-prog.github.io/${DEPOT.split('/')[1]}/**\n`,
  );

  run('git', ['init', '-q', '-b', 'main'], travail);
  run('git', ['add', '-A'], travail);
  run(
    'git',
    ['-c', 'user.name=console-publish', '-c', 'user.email=noreply@cartoairsoft.dev',
     'commit', '-q', '-m', `Console ${new Date().toISOString()}`],
    travail,
  );
  run('git', ['remote', 'add', 'origin', `https://github.com/${DEPOT}.git`], travail);
  // Réécriture complète : le dépôt ne garde pas d'historique de builds, il
  // n'y aurait rien à en tirer.
  run('git', ['push', '-q', '--force', 'origin', 'main'], travail);
  console.log(`\nPublié : https://niamort36-prog.github.io/${DEPOT.split('/')[1]}/`);
} finally {
  rmSync(travail, { recursive: true, force: true });
}
