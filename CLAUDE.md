# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Langue

Le code (identifiants, types, noms de fichiers) est en **anglais**. Tout le
reste — commentaires, docs, messages de commit, libellés d'interface,
noms de tests — est en **français**. Les messages d'erreur renvoyés par
l'API sont en français : ils s'affichent tels quels dans l'app.

Les références `§N` dans les commentaires pointent vers
[CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md), qui fait autorité sur le
comportement attendu. [ARCHITECTURE.md](ARCHITECTURE.md) justifie les choix
de stack.

## Commandes

```bash
npm install                       # racine : installe api + console + shared
docker compose up -d              # PostgreSQL 16 + PostGIS (obligatoire)
npm run api:dev                   # API en watch sur :3000 (/docs = OpenAPI)
npm run api:test                  # Jest (apps/api/src/**/*.spec.ts)
npm run api:build
npm run lint --workspace apps/api
```

Un seul test Jest :

```bash
npm run test --workspace apps/api -- --testPathPattern=cot
npm run test --workspace apps/api -- -t "nom du test"
```

Base de données (après toute modification de `apps/api/src/db/schema.ts`) :

```bash
npm run db:generate --workspace apps/api   # écrit apps/api/drizzle/NNNN_*.sql
npm run db:migrate  --workspace apps/api   # applique
```

Mobile (depuis `apps/mobile`) :

```bash
flutter analyze
flutter test                      # tout
flutter test test/command_tree_test.dart
flutter run                       # émulateur : l'API est jointe via 10.0.2.2
flutter build apk --debug
```

Console web :

```bash
npm run dev  --workspace apps/console      # :5173
npm run test --workspace apps/console      # vitest
```

### Tests E2E

`apps/api/e2e/*.e2e.mjs` sont des **scripts Node autonomes**, pas des tests
Jest. Ils exigent Docker + l'API lancée, et créent de vrais comptes sur le
projet Supabase de test.

Le mot de passe de ces comptes ne vit **pas** dans le dépôt : il vient de
`E2E_PASSWORD`. Sans cette variable, chaque script s'arrête sur un message
explicite. Préfixer les commandes :
`E2E_PASSWORD=... node apps/api/e2e/...`

```bash
node apps/api/e2e/unit-nesting.e2e.mjs
node apps/api/e2e/demo-terrain.mjs "Nom de partie"   # partie peuplée, pour regarder la carte
node apps/api/e2e/simulate-player.mjs "Nom" 120      # un second joueur qui patrouille
```

Les fichiers sans suffixe `.e2e` (`demo-*.mjs`, `simulate-player.mjs`,
`place-hostile.mjs`, `send-chat.mjs`) sont des outils de mise en situation,
pas des tests.

## Architecture

Monorepo npm workspaces. `apps/api` (NestJS) est l'**arbitre** ; `apps/mobile`
(Flutter) et `apps/console` (React + Vite) sont des clients sans autorité.

### Les cinq invariants (§2)

Ils ne sont pas des vœux : ils expliquent la forme du code, et une
modification qui les enfreint est un bug même si elle compile.

1. **Le serveur arbitre** — aucune décision de jeu côté client. L'app
   n'affiche que ce que le serveur lui a déclaré permis.
2. **API-first** — ni l'app ni la console ne parlent à PostgreSQL. Supabase
   ne sert qu'à l'**authentification** (l'API vérifie les JWT via JWKS).
3. **Offline-first** — l'app reste utile sans réseau et ne plante jamais.
4. **Membre ≠ connecté** — une coupure n'éjecte personne ; la dernière
   position connue reste affichée, estompée.
5. **La partie vit sur le serveur** — aucun téléphone n'est « hôte ».

### Temps réel : les rooms SONT le cloisonnement

`apps/api/src/realtime/game.gateway.ts` filtre **avant** de diffuser, dans
les rooms `game:<id>`, `team:<id>`, `game:<id>:sans-equipe`,
`channel:<id>`. Une position complète ne part que dans la room de son
équipe ; un message de commandement ne part que dans la room de son canal.
Brancher un client directement sur la base contournerait cet arbitrage —
c'est pourquoi Supabase Realtime n'est pas utilisé.

### Permissions : une donnée, pas un `if (role === …)`

`apps/api/src/permissions/permissions.ts` porte la matrice. Aucun rôle n'est
codé en dur dans la logique métier, et la matrice est surchargeable par
partie. La règle de lecture : **la permission dit quoi, le grade dit sur
qui**. Une action se vérifie donc deux fois — `permissions.assert(...)` pour
la capacité, puis une comparaison de `ROLE_RANK` pour la portée (on n'agit
jamais sur son propre rang ni au-dessus, sauf sur soi-même).

### Offline-first, mécaniquement

- Les objets carte portent un **UUID généré par le client** : rejouer un
  envoi est idempotent.
- L'app écrit d'abord dans Drift avec `pending=true` (rendu translucide),
  puis vide la file à la reconnexion (`apps/mobile/lib/game/object_sync.dart`).
- La réconciliation se fait par delta : `GET /games/:id/sync?since=` renvoie
  aussi les tombstones des objets supprimés.

### Chaîne de commandement (§5)

Trois liens distincts, à ne pas confondre :

- `memberships.reportsToMembershipId` — un homme sous les ordres de
  quelqu'un, **sans grade ni escouade**.
- `squads.parentSquadId` — les unités s'emboîtent (compagnie › section ›
  groupe › équipe). Le parent doit être d'un échelon **strictement
  supérieur**, du même camp, et sans boucle.
- `squads.reportsToMembershipId` — une unité rattachée directement à un
  gradé. **Exclusif** avec `parentSquadId`.

La table s'appelle encore `squads` mais porte des unités de tout échelon.
`squads.echelon` est **déclaré**, jamais déduit de l'effectif. Une partie
peut compter plusieurs commandants ; le dernier ne peut pas être rétrogradé.

L'arbre est reconstruit côté client par `apps/mobile/lib/map/command_tree.dart`
— fonction pure, testable sans carte. Même principe pour le repli des
escouades au dézoom (`squad_grouping.dart`).

### Deux pièges du rendu carte mobile

Les deux ont déjà coûté des heures ; ne les redécouvrez pas.

1. **Une couche `symbol` ou `line` dont la source GeoJSON est créée VIDE
   reste muette définitivement** sous MapLibre Native. Tout ce qui est
   ponctuel passe donc par une source unique, non vide à la création
   (`_markersGeoJson` dans `map_screen.dart`).
2. **Aucune police distante.** Une couche de texte MapLibre exige un serveur
   de glyphes ; hors ligne les libellés disparaîtraient (§2.3). Les textes
   sont donc **peints dans l'image de l'icône** (`UnitIcons.fieldedPng`).
   Conséquence : chaque combinaison symbole + champs est une image
   distincte, et son identifiant doit varier avec son contenu — le rendu
   natif garde la **première** image enregistrée sous un identifiant donné.

La symbologie suit APP-6 / MIL-STD-2525 ; voir
[docs/SYMBOLOGIE_OTAN.md](docs/SYMBOLOGIE_OTAN.md) pour la position des
champs et l'échelle des échelons.

### Icônes

Le pack d'icônes d'unités est **fourni par le propriétaire du projet**
(`apps/mobile/assets/icons/`). Ne jamais coder un symbole en dur ni en
inventer un : si une icône manque, le signaler.

## Vérification

Un changement n'est pas terminé tant qu'il n'a pas été **vu tourner**.
Pour le mobile cela veut dire : émulateur Android démarré, API et Docker
actifs, APK installé, capture d'écran à l'appui. `flutter analyze` et
`flutter test` passent, mais ne prouvent pas le rendu.

Émulateur et API tombent régulièrement dans cet environnement : vérifier
`adb devices`, `docker ps` et `/v1/health` avant de conclure qu'un
comportement est cassé.

Le simulateur n'a ni caméra utilisable ni vrai GPS : le **scan de QR** et le
suivi de position réel ne peuvent être validés que sur un téléphone.

## CI

`.github/workflows/mobile.yml` construit Android, iOS (non signé, runner
macOS) et web à chaque poussée. `ios-testflight.yml` signe et publie, mais
reste inerte tant que les secrets ne sont pas renseignés — voir
[docs/IOS.md](docs/IOS.md).
