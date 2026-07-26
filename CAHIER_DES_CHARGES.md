# Cahier des charges — Application tactique pour l'airsoft

> Document de référence du projet. Ne pas modifier sans décision explicite du propriétaire du projet.

## 1. Vision du projet

Construire une application tactique temps réel pour l'airsoft, inspirée d'ATAK (côté cartographie/tactique) et d'ARES ALPHA (côté gamification airsoft), mais avec deux différenciateurs forts :

1. Fonctionnement hors-ligne d'abord (« offline-first ») — utilisable en forêt sans réseau fiable, contrairement à ARES ALPHA qui exige des données mobiles.
2. Architecture API-first ouverte — une API publique documentée permettant de brancher des outils tiers dès la conception.

L'application se compose de trois éléments :

* une app mobile (Android + iOS) pour les joueurs sur le terrain ;
* un backend / API qui héberge les parties et arbitre toute la logique de jeu ;
* une console web (PC) pour que les organisateurs préparent les parties.

## 2. Principes d'architecture NON-NÉGOCIABLES

Ces principes conditionnent toutes les décisions techniques. Ne jamais les contourner.

### 2.1 Le serveur est l'arbitre
Toute la logique de jeu (perks, positions des adversaires, capture d'objectifs, attribution de points, rôles) est calculée et validée côté serveur. L'app mobile n'est qu'un client d'affichage et de saisie. Aucune décision sensible ne doit dépendre du téléphone, sous peine de triche.

### 2.2 API-first
L'app mobile et la console web ne parlent jamais directement à la base de données : elles passent toujours par l'API. L'app est donc « un client parmi d'autres ». L'API publique (Phase 4) n'ajoutera qu'une couche d'authentification par jetons et de permissions ; le cœur ne changera pas. Construire une vraie API (REST ou GraphQL) dès la première ligne.

### 2.3 Offline-first
L'app doit rester utile sans réseau. Ce qui est purement personnel (poser un marqueur, dessiner, consulter la carte préchargée, voir la dernière position connue des alliés) fonctionne hors ligne. Ce qui dépend des autres en temps réel (perks, positions live) attend le réseau et s'affiche grisé avec un message clair, jamais un plantage.

### 2.4 « Membre » ≠ « connecté »
* Membre d'une partie = donnée permanente serveur (joueur + rôle + partie). Indépendante du réseau.
* Connecté = état temporaire (lien réseau actif à l'instant T).

Une perte de connexion ne doit jamais éjecter un joueur ni l'organisateur. Le joueur passe en « hors ligne / dernière position il y a X min », reste visible (grisé), et reprend sa place au retour sans re-scanner de QR. L'éjection ne se produit que sur action volontaire (départ, ou exclusion par un ORGA).

### 2.5 La partie vit sur le serveur, pas sur un téléphone
Créer une partie = envoyer une requête au serveur qui crée et détient la partie. Aucun téléphone n'est « hôte ». Si l'ORGA ferme son app, la partie continue. Pas de migration d'hôte, pas de point de défaillance unique côté client.

## 3. Stack technique recommandée

Recommandations solides ; adapter si meilleure raison.

* App mobile : Flutter (une seule base de code Android + iOS). React Native est une alternative acceptable.
* Carte : MapLibre GL (open source) ou Mapbox. Fonds multiples (satellite, topo, plan) + fonds IGN pour la France. Préchargement / cache des tuiles obligatoire pour l'offline.
* Backend / API : au choix (Node/NestJS, Python/FastAPI, Go…). Exposer REST ou GraphQL.
* Temps réel : WebSockets (positions, statuts, chat, événements de jeu). Supabase Realtime ou Firestore acceptables comme raccourcis au début.
* Auth : Firebase Auth, Supabase Auth ou Auth0 (email + social login).
* Base de données : PostgreSQL (idéalement avec PostGIS).
* Interopérabilité : s'inspirer du protocole CoT (Cursor on Target) de l'écosystème TAK, et supporter l'import GeoJSON / KML (§7.10).

## 4. Modèle de données (entités principales)

Esquisse à affiner. Les identifiants « client-generated » sont générés côté téléphone (crucial pour l'offline, §7.6).

* User : id, email, pseudo, auth.
* Game (partie) : id, nom, créateur, dates début/fin, zone de jeu, état (préparation/en cours/terminée), config des ressources et scoring, hébergée sur le serveur.
* Membership : user + game + role + statut de vie (vivant/mort/médic/soutien) + dernière position + état connexion.
* Role : ORGA, Commandant, Capitaine, Chef d'escouade, Joueur… (extensible) → porte des permissions.
* InviteToken : jeton opaque → (game, role, usages max, expiration). Base du QR (§7.2).
* Marker / Drawing : id (client-generated), type (hostile, waypoint, zone…), géométrie, auteur, horodatage de création, état de synchro.
* Objective (drapeau) : id, position, liens vers d'autres objectifs, ordre de capture optionnel, grades autorisés à capturer, récompense, équipe détentrice actuelle.
* PlayerQR / BonusQR : jeton → récompense (points, ressource, image/document en pièce jointe).
* PerkInstance : type, lanceur, cible (zone/joueur), horaire début/fin, état.
* ApiKey : jeton, propriétaire, permissions (lecture/écriture/admin), partie(s) autorisée(s), objectif déclaré.

## 5. Rôles et permissions

Système hiérarchique inspiré d'ARES ALPHA. Les rôles pilotent qui peut faire quoi : poser un objectif, activer un perk drone, voir toute la carte vs seulement son escouade, scanner tel type de QR, etc. Prévoir une matrice de permissions configurable, pas des rôles en dur. Exemples : ORGA, Commandant, Capitaine, Chef d'escouade, Joueur.

## 6. Fonctionnalités de l'app mobile

* Compte : création + connexion (email + social).
* GPS + carte avec fonds multiples et cache hors-ligne.
* Voir ses alliés en temps réel avec statut (vivant/mort/médic/soutien), position, indicateur « hors ligne / dernière position ».
* Marqueurs : forces hostiles, points de passage, points importants ; dessin de zones et de lignes.
* Messagerie instantanée intégrée (chat texte temps réel ; PAS de SMS télécom). Chat par équipe / escouade / global selon les rôles.
* Perks (§7.7) : interface d'activation, cooldowns, indisponibilité claire hors ligne.
* Scan de QR : rejoindre une partie, capturer un objectif, récupérer un bonus joueur (§7.2, §7.8, §7.9).
* Boussole / navigation vers alliés ou objectifs.

## 7. Détail des systèmes clés

### 7.1 Cartes et fonds
Plusieurs fonds commutables. Préchargement des tuiles d'une zone avant la partie pour l'usage hors-ligne. Import de couches externes (§7.10).

### 7.2 Invitations par QR code avec rôles
Le serveur peut générer plusieurs QR distincts, un par rôle. Règles impératives :

* Le QR ne contient JAMAIS le rôle en clair. Il encode un jeton opaque ; seul le serveur sait à quel rôle il correspond.
* Flux : scan → l'app envoie le jeton au serveur → le serveur ajoute le joueur à la partie avec le bon rôle.
* Usage unique ou limité pour les rôles sensibles ; réutilisable pour le rôle Joueur.
* L'ORGA peut révoquer un QR ou rétrograder/exclure un joueur.

### 7.3 Temps réel
Diffusion des positions et statuts via WebSockets. Fréquence de mise à jour réglable (compromis batterie/précision).

### 7.4 Messagerie
Chat texte temps réel, cloisonné selon les rôles (global / équipe / escouade).

### 7.5 Statuts de jeu
Vivant / mort / médic demandé / soutien (inspiré ARES ALPHA).

### 7.6 Synchronisation offline-first des marqueurs
* Marqueur posé sans réseau → enregistré localement dans une file d'attente, affiché immédiatement à son auteur, marqué « en attente de synchro ».
* Au retour du réseau → l'app vide la file vers le serveur, qui enregistre et rediffuse aux autres.
* Réconciliation inverse : au retour, l'app récupère aussi ce qu'elle a manqué.

Trois exigences techniques :
1. ID généré côté client pour chaque objet (évite les doublons à la reconnexion).
2. Horodatage de création (pas de réception).
3. Résolution de conflit simple au début : « le dernier qui synchronise gagne ».

### 7.7 Perks (arbitrés serveur)
Purement logiciels, calculés serveur. Exemples :

* Drone (révéler une zone) : le serveur masque les positions aux joueurs ; le perk dévoile temporairement les forces hostiles dans un rayon/zone donné, pendant une durée limitée.
* Brouilleur de drone : règle serveur qui annule le perk drone adverse pendant X secondes. ⚠️ Brouillage du perk virtuel uniquement, jamais un vrai brouilleur radio (illégal).
* Autres perks type EMP à concevoir sur le même modèle.

Contrainte : les perks ne fonctionnent pas hors ligne. Griser + message « indisponible hors connexion ».

### 7.8 Objectifs / drapeaux et capture par QR
Conçus dans la console PC (§8), joués sur mobile :

* Poser des drapeaux sur la carte, les relier, ordre de capture optionnel.
* Capture : scan du QR physique du drapeau. Le serveur valide (grade autorisé ? ordre respecté ?) puis attribue la possession.
* Restriction par grade. Récompense configurable (points ou ressource).

### 7.9 QR sur les joueurs (bonus)
QR portés par des joueurs, scannables par d'autres : points, ressources, ou pièces jointes. Le serveur valide et délivre.

### 7.10 Import depuis map.army et formats externes
map.army = outil de préparation externe optionnel, PAS le moteur cartographique.

* Pas d'iframe.
* Import GeoJSON (préféré) ou KML, comme calques natifs superposables et mélangeables avec les données temps réel.
* La géométrie s'importe bien ; le style visuel exact ne survit pas toujours à l'export. Sans gravité.

### 7.11 API publique (Phase 4/5)
API keys par utilisateur/organisation, permissions (lecture / écriture / admin) et portée (parties autorisées). N'ajoute que jetons + permissions + documentation. Les clés sont configurées dans la console PC à la création de partie, puis activées en jeu.

## 8. Console web PC (inspirée d'ARES ALPHA)

Interface de préparation de partie, sur ordinateur :

* Dessiner sur une carte : zones, lignes, points de passage, zones de spawn.
* Placer les objectifs / drapeaux, les relier, ordre de capture, grades autorisés, récompenses.
* Marqueurs de préparation.
* Paramètres de la partie : dates, zone de jeu, ressources, scoring, rôles disponibles.
* Générer les QR d'invitation par rôle et les QR d'objectifs/bonus, imprimables.
* Sélectionner et configurer les API keys intégrées à la partie.
* Importer une préparation externe (GeoJSON/KML).
* (Plus tard) statistiques post-partie : distances parcourues, temps passé, etc.

La console utilise la même API que l'app mobile.

## 9. Contraintes non-fonctionnelles

* Terrain : forêt / campagne, réseau faible ou absent → offline-first obligatoire, cartes préchargées.
* Batterie : GPS continu = drain rapide. Fréquence de position réglable + mode économie. Documenter l'usage d'une batterie externe.
* Android background : les constructeurs tuent les apps en arrière-plan (dontkillmyapp.com). Service de premier plan / notifications persistantes.
* iOS : pas d'envoi de SMS télécom en arrière-plan (raison de plus pour le chat intégré).
* Sécurité anti-triche : tout ce qui donne un avantage est validé serveur uniquement.

## 10. Feuille de route par phases

* Phase 1 — Socle : comptes/auth → carte + GPS + fonds multiples + cache offline → voir ses alliés en temps réel avec statut.
* Phase 2 — Tactique de base : marqueurs, dessin de zones → synchro offline-first (§7.6) → messagerie intégrée.
* Phase 3 — Parties & rôles : parties hébergées serveur → invitations QR par rôle (§7.2) → matrice de permissions → console web PC (§8).
* Phase 4 — Gamification : objectifs/drapeaux + capture QR (§7.8) → QR bonus joueurs (§7.9) → perks arbitrés serveur (§7.7).
* Phase 5 — Ouverture : API publique + gestion des clés (§7.11) → import map.army/GeoJSON (§7.10) → interopérabilité CoT → statistiques post-partie.

## 11. Instructions pour l'assistant de développement

1. Commencer par proposer une architecture concrète (schéma des composants, choix de stack définitifs, modèle de données détaillé) avant d'écrire du code, et attendre validation.
2. Respecter strictement les principes du §2 dans chaque décision.
3. Implémenter phase par phase (§10). Ne pas démarrer une phase avant que la précédente soit fonctionnelle.
4. À chaque étape, signaler explicitement les compromis (batterie, offline, sécurité) et demander un arbitrage si besoin.
5. Prévoir l'API-first et l'offline-first dès la Phase 1.
