# Version navigateur

Le même code Flutter que les applications Android et iOS, compilé pour le
navigateur. `flutter build web` produit un site statique à déposer derrière
n'importe quel hébergeur.

## À quoi elle sert vraiment

Excellente pour :

* **regarder** — un organisateur sur son portable, un blessé sur le banc, un
  spectateur qui suit la partie ;
* **préparer et débriefer** — poser des marqueurs, lire le bilan ;
* **dépanner** — quelqu'un arrive sans avoir installé l'application.

Mauvaise pour : **jouer**. Ce n'est pas une préférence, c'est une contrainte
du navigateur, et elle est expliquée ci-dessous.

## Ce qu'un navigateur ne sait pas faire

### Le suivi s'arrête quand l'écran s'éteint

Un onglet est **suspendu** dès qu'il passe en arrière-plan ou que l'écran se
verrouille. Le JavaScript s'arrête, donc la position cesse d'être transmise.
Téléphone en poche, un joueur en version navigateur **disparaît de la carte
de son équipe**.

C'est exactement ce que le §9 cherche à éviter, et c'est aussi pourquoi
Android emploie un service de premier plan et iOS un mode d'arrière-plan :
aucun équivalent n'existe côté web. Aucun réglage ne contourne cela.

Deux garde-fous ont été posés :

* **Les alliés ne sont pas trompés.** La liaison temps réel tombe avec
  l'onglet : le joueur passe « hors ligne », son insigne s'estompe et sa
  dernière position est datée — le mécanisme du §2.4 fonctionne déjà.
* **Le joueur non plus.** Un bandeau l'avertit en entrant en partie depuis
  un navigateur. Sans lui, il croirait être suivi alors qu'il a disparu.

### Le hors-ligne n'est pas le même

Le préchargement d'une zone de tuiles (§2.3) est une fonction du moteur
natif de MapLibre ; la version navigateur ne l'a pas. La base locale, elle,
fonctionne (SQLite compilé en WebAssembly), donc la file d'attente des
marqueurs et le cache des objets tiennent — mais **le fond de carte, lui,
exige du réseau**. En forêt sans couverture, l'écran sera vide.

### Divers

* **Boussole** : pas d'implémentation navigateur ; le bandeau affiche
  `---°` plutôt qu'un cap inventé.
* **Batterie** : l'API a été retirée de plusieurs navigateurs, l'indicateur
  peut rester à `--`.
* **Caméra (QR)** : fonctionne, mais **exige HTTPS** — en `http://`, le
  navigateur refuse l'accès à la caméra. À prévoir pour l'hébergement.

## Construire et déployer

```bash
cd apps/mobile
flutter build web --release \
  --dart-define=API_BASE_URL=https://votre-serveur/v1
```

Le résultat est dans `build/web/` : des fichiers statiques, à servir tels
quels. Trois exigences côté hébergeur :

1. **HTTPS**, sans quoi ni la géolocalisation ni la caméra ne fonctionnent.
2. **`sqlite3.wasm` et `drift_worker.js`** doivent être servis depuis la
   racine du site — ils y sont déjà copiés, ne pas les élaguer. Sans eux,
   l'application démarre puis échoue à la première écriture locale.
3. L'API doit accepter l'origine du site (CORS). L'API l'autorise
   largement en développement ; à restreindre en production.

## Rester en phase avec les applications

Comme pour iOS : **le numéro de version est unique** (`pubspec.yaml`, lu par
les trois cibles) et **l'intégration continue construit les trois** à chaque
poussée. Le job web vérifie en plus que les deux fichiers de la base locale
sont bien présents et que la bibliothèque de carte est déclarée dans
`index.html` — deux oublis silencieux qui ne se verraient qu'à l'exécution.

## Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié : la compilation, le démarrage de la page, le chargement de
`maplibre-gl`, la présence et le service des fichiers de la base locale,
l'absence d'erreur en console.

**Pas vérifié : l'application à l'usage.** Le panneau d'aperçu de
l'environnement de développement n'a aucune dimension (`0×0`), donc Flutter
n'y dessine rien. Ni la carte, ni la connexion, ni le bandeau n'ont pu être
vus à l'écran. À faire au premier déploiement — en particulier le rendu de
la carte, qui passe ici par une bibliothèque JavaScript et non par le moteur
natif.
