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
- [x] **Phase 2 — Tactique de base** *(terminée le 2026-07-26)*
  - [x] Pack d'icônes d'unités intégré (13 types × 4 affiliations APP-6, fourni par le propriétaire)
  - [x] Marqueurs tactiques : pose par appui long, rendu par icônes, temps réel, suppression (auteur/ORGA), serveur arbitre
  - [x] Côté serveur §7.6 : id client (idempotence), delta `sync?since=`, tombstones — validé par E2E
  - [x] Hiérarchie §5 jouable : créateur = commandant (insigne command), nomination capitaine/chef d'escouade, insignes modifiables sur rangs inférieurs, liste triée par grade
  - [x] Alliés rendus avec leur insigne d'unité à contour blanc, tailles adaptées au zoom ; heure de pose sous les marqueurs
  - [x] Sa propre position = son insigne (au choix, contour blanc épais) — remplace le point bleu en partie
  - [x] File offline locale (Drift) — validée en mode avion le 2026-07-26 : pose hors ligne (translucide « en attente »), survie au redémarrage complet, liste des parties en cache, envoi automatique à la reconnexion, réconciliation par delta
  - [x] Dessin de zones et de lignes — mode dessin (sommets au tap), validation ligne/zone, rendu remplissage+contour, tap pour la fiche, offline-first par la même file
  - [x] Insigne réservé aux gradés : un sans-grade le reçoit de sa hiérarchie
  - [x] Messagerie intégrée — canaux Général (tous) et Commandement (gradés), cloisonnement serveur y compris en diffusion temps réel, envoi offline avec file rejouée automatiquement à la reconnexion
  - [x] Service Android de premier plan — GPS actif écran éteint (validé : position reçue par le serveur avec l'écran en veille), notification persistante, sélecteur de cadence Précis/Équilibré/Éco (§9)
- [ ] **Phase 3 — Parties & rôles** *(en cours)*
  - [x] Invitations par QR (§7.2) — jeton opaque (le rôle n'est jamais encodé), empreinte SHA-256 seule en base, rôle résolu par le serveur au scan, révocation et expiration ; grade écrit sous le QR pour l'impression, QR réutilisables
  - [x] Matrice de permissions configurable (§5) — 8 permissions, matrice par défaut surchargeable par partie, plus aucun rôle codé en dur dans la logique métier ; l'app affiche ce que le serveur déclare permis
  - [ ] Équipes et escouades (débloque les canaux de chat team/squad)
  - [ ] Console web PC de préparation (§8)
- [ ] Phase 4 — Gamification (objectifs, QR bonus, perks)
- [ ] Phase 5 — Ouverture (API publique, imports, CoT, stats)

## Principes non négociables (rappel)

1. **Le serveur est l'arbitre** — aucune décision de jeu côté téléphone.
2. **API-first** — les clients ne parlent jamais directement à la base.
3. **Offline-first** — l'app reste utile sans réseau, jamais de plantage.
4. **Membre ≠ connecté** — une coupure réseau n'éjecte jamais personne.
5. **La partie vit sur le serveur** — aucun téléphone n'est « hôte ».
