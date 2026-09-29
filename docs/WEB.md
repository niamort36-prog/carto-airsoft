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

## Lancer en développement

Deux sites cohabitent, sur deux ports :

```bash
npm run console:dev    # :5173 — console de préparation (React)
npm run webapp:dev     # :5174 — l'application elle-même (Flutter web)
```

Le second est la **copie exacte de l'application** : même code, mêmes
écrans, même compte. Le premier est un outil distinct, pensé pour un
clavier et un grand écran.

Sur ce port de développement, l'application vise `http://localhost:3000/v1`.
Si l'API tourne ailleurs, nul besoin de recompiler — le bouton *Adresse du
serveur*, sur l'écran de connexion, l'enregistre dans le navigateur.

## Construire et déployer

```bash
cd apps/mobile
flutter build web --release \
  --dart-define=API_BASE_URL=https://votre-serveur/v1
```

Le résultat est dans `build/web/` : des fichiers statiques, à servir tels
quels. Pour un déploiement ailleurs qu'à la racine du domaine, il faut le
dire à la compilation — sinon la page charge et reste blanche :

```bash
flutter build web --release --base-href=/app/
```

Quatre exigences côté hébergeur :

1. **HTTPS**, sans quoi ni la géolocalisation ni la caméra ne fonctionnent.
2. **`sqlite3.wasm` et `drift_worker.js`** doivent être servis depuis la
   racine du site — ils y sont déjà copiés, ne pas les élaguer. Sans eux,
   l'application démarre puis échoue à la première écriture locale.
3. L'API doit accepter l'origine du site (CORS). L'API l'autorise
   largement en développement ; à restreindre en production.
4. **Toutes les routes doivent renvoyer `index.html`**, l'application gérant
   sa navigation elle-même.

## Rester en phase avec les applications

Comme pour iOS : **le numéro de version est unique** (`pubspec.yaml`, lu par
les trois cibles) et **l'intégration continue construit les trois** à chaque
poussée. Le job web vérifie en plus que les deux fichiers de la base locale
sont bien présents et que la bibliothèque de carte est déclarée dans
`index.html` — deux oublis silencieux qui ne se verraient qu'à l'exécution.

## Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié **à l'écran**, dans un navigateur, sur le site servi :

* la compilation et le démarrage de la page ;
* l'écran de connexion dessiné et lisible, en largeur bureau comme en
  largeur téléphone ;
* `maplibre-gl` 5.24.0 chargé et disponible ;
* le réglage *Adresse du serveur* : il s'ouvre, lit l'adresse courante et
  l'enregistre dans le stockage du navigateur ;
* aucune erreur en console.

**Pas encore vérifié : tout ce qui est derrière la connexion**, et d'abord
**le rendu de la carte**. Il passe ici par une bibliothèque JavaScript et
non par le moteur natif : c'est le point le plus susceptible de différer
des applications. À regarder à la première connexion réelle.

Une remarque d'outillage : Flutter dessine dans un `canvas`. Les outils qui
inspectent le DOM — extensions, tests de bout en bout web, lecteurs
d'écran — n'y voient rien par défaut. Ce n'est pas un défaut de cette
application, c'est la nature de la cible.
