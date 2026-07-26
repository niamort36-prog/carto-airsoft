# Carto Airsoft

Application tactique temps réel pour l'airsoft — **offline-first** et **API-first**.
Inspirée d'ATAK (cartographie tactique) et d'ARES ALPHA (gamification airsoft).

📄 [Cahier des charges](CAHIER_DES_CHARGES.md) · [Architecture validée](ARCHITECTURE.md)

## Composants

| Dossier | Rôle | Stack |
|---|---|---|
| `apps/api` | API arbitre — héberge les parties, valide toute la logique de jeu | NestJS + PostgreSQL/PostGIS + Socket.IO |
| `apps/mobile` | App joueurs terrain (Android d'abord, iOS ensuite) | Flutter + MapLibre |
| `apps/console` | Console web de préparation pour organisateurs (Phase 3) | React + Vite + MapLibre GL JS |
| `packages/shared` | Types partagés API ↔ console | TypeScript |

## Démarrage (développement)

Prérequis : Node ≥ 22, Docker Desktop (base de données), Flutter SDK (app mobile).

```bash
# 1. Dépendances
npm install

# 2. Base de données (PostgreSQL + PostGIS)
docker compose up -d

# 3. Configuration de l'API
#    copier apps/api/.env.example vers apps/api/.env et remplir

# 4. API en mode watch
npm run api:dev
```

- Santé de l'API : http://localhost:3000/v1/health
- Documentation OpenAPI : http://localhost:3000/docs

## Tests

```bash
npm run api:test
```

Tests de bout en bout (API démarrée + base up) :

```bash
node apps/api/e2e/realtime.e2e.mjs
```

Simuler un second joueur qui patrouille (utile pour tester la carte à deux) :

```bash
node apps/api/e2e/simulate-player.mjs "Nom de la partie" 120
```

## App mobile

```bash
cd apps/mobile
flutter run
```

Sur émulateur, l'API est jointe via `10.0.2.2:3000`. Pour un téléphone réel sur
le même Wi-Fi, passer l'adresse du PC :

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.42:3000/v1
```

## Avancement (feuille de route §10 du cahier des charges)

- [x] Architecture validée (2026-07-22)
- [x] **Phase 1 — Socle** *(terminée le 2026-07-26)*
  - [x] Jalon 1 : monorepo, docker-compose PostGIS, API NestJS, `/v1/health`, OpenAPI
  - [x] Jalon 2 : auth Supabase — validé de bout en bout (compte réel → jeton ES256 → API → profil en base)
  - [x] Jalon 3 : carte MapLibre — 3 fonds commutables (OSM, Plan IGN, satellite IGN), GPS, permission propre
  - [x] Jalon 4 : cache offline des tuiles — validé en mode avion (téléchargement de zone, redémarrage complet sans réseau)
  - [x] Jalon 5 : parties hébergées serveur (`games`, `memberships`) + rejoindre + statuts de vie
  - [x] Jalon 6 : temps réel Socket.IO — alliés sur la carte, statuts, « hors ligne » sans éjection (§2.4)
- [ ] **Phase 2 — Tactique de base** *(en cours)*
  - [x] Pack d'icônes d'unités intégré (13 types × 4 affiliations APP-6, fourni par le propriétaire)
  - [x] Marqueurs tactiques : pose par appui long, rendu par icônes, temps réel, suppression (auteur/ORGA), serveur arbitre
  - [x] Côté serveur §7.6 : id client (idempotence), delta `sync?since=`, tombstones — validé par E2E
  - [x] Hiérarchie §5 jouable : créateur = commandant (insigne command), nomination capitaine/chef d'escouade, insignes modifiables sur rangs inférieurs, liste triée par grade
  - [x] Alliés rendus avec leur insigne d'unité + pastille de statut ; heure de pose sous les marqueurs
  - [ ] File offline locale des marqueurs (outbox Drift) + réconciliation à la reconnexion
  - [ ] Dessin de zones et de lignes
  - [ ] Messagerie intégrée (global/équipe/escouade)
  - [ ] Service Android premier plan (GPS écran éteint)
- [ ] Phase 3 — Parties & rôles (QR, permissions, console web)
- [ ] Phase 4 — Gamification (objectifs, QR bonus, perks)
- [ ] Phase 5 — Ouverture (API publique, imports, CoT, stats)

## Principes non négociables (rappel)

1. **Le serveur est l'arbitre** — aucune décision de jeu côté téléphone.
2. **API-first** — les clients ne parlent jamais directement à la base.
3. **Offline-first** — l'app reste utile sans réseau, jamais de plantage.
4. **Membre ≠ connecté** — une coupure réseau n'éjecte jamais personne.
5. **La partie vit sur le serveur** — aucun téléphone n'est « hôte ».
