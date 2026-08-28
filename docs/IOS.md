# Version iOS

L'application est écrite en Flutter : **le code de jeu est déjà commun aux
deux systèmes**. Tout ce qui est dans `apps/mobile/lib/` — carte, symboles,
synchronisation offline, temps réel, perks, messagerie — s'exécute
identiquement sur Android et sur iOS, sans version parallèle à maintenir.

Ce qui diverge, et qui demande du soin, ce sont les **réglages de
plateforme** et les **greffons natifs**. C'est là que se joue le
« régulièrement mise à jour en parallèle ».

## Ce qui est déjà en place

| | État |
|---|---|
| Projet Xcode (`ios/`) | présent |
| Autorisations déclarées (position, caméra, mouvement) | faites |
| Suivi écran éteint (`UIBackgroundModes: location`) | fait |
| Réglages de position propres à iOS | faits |
| `Podfile` versionné (iOS 13, permissions compilées) | fait |
| Intégration continue construisant Android **et** iOS | faite |
| Chaîne de signature TestFlight | écrite, inerte sans secrets |
| Empaquetage `.ipa` pour sideload gratuit | fait |
| **Compilation réellement effectuée** | **à la première poussée sur GitHub** |

La dernière ligne est la plus importante : **rien de tout cela n'a pu être
compilé**, faute de macOS. Voir « Ce qui reste à faire sur un Mac ».

## La différence qui compte : le suivi écran éteint

Le §9 exige que les alliés continuent de voir un joueur téléphone en poche.
Les deux systèmes le permettent, par des moyens **opposés** :

| | Android | iOS |
|---|---|---|
| Moyen | service de premier plan | mode d'arrière-plan `location` |
| Ce qui le rend visible | notification persistante | pastille bleue « position utilisée » |
| Autorisation | `FOREGROUND_SERVICE_LOCATION` | « Toujours » |
| Piège | le constructeur gèle l'app | iOS met le GPS en pause s'il vous croit arrivé |

Servir les réglages Android à iOS — ce que faisait le code au départ —
laissait le suivi s'arrêter dès la mise en poche : les alliés auraient vu un
joueur immobile sans savoir que sa position était figée. `TrackingMode`
choisit désormais `AppleSettings` sur iOS, avec :

* `allowBackgroundLocationUpdates` — sans quoi rien ne remonte en poche ;
* `showBackgroundLocationIndicator` — le joueur voit qu'il est suivi, on ne
  le suit jamais à son insu ;
* `pauseLocationUpdatesAutomatically: false` — **en airsoft, dix minutes
  d'immobilité sont une embuscade, pas une fin de trajet**. iOS couperait le
  GPS de lui-même.

## Permissions compilées

`permission_handler` embarque par défaut **tous** ses gestionnaires : le
binaire soumis contiendrait alors du code interrogeant les contacts, la
santé, les rappels. Apple demande pourquoi une application d'airsoft lit le
carnet d'adresses, et refuse la soumission. Le `Podfile` versionné n'active
que position, notifications, caméra et capteurs, et désactive explicitement
le reste.

## Rester en phase

Trois mécanismes, du plus automatique au plus humain :

1. **Le numéro de version est unique.** `pubspec.yaml` porte
   `version: 1.0.0+1` ; Android et iOS le lisent tous les deux
   (`$(FLUTTER_BUILD_NAME)` / `$(FLUTTER_BUILD_NUMBER)`). Impossible de
   publier un iOS 1.2 face à un Android 1.4.

2. **L'intégration continue construit les deux à chaque poussée**
   (`.github/workflows/mobile.yml`). Un greffon qui casse iOS se voit le
   jour même, pas le matin d'une partie. Le job iOS vérifie en plus que les
   déclarations obligatoires n'ont pas disparu de l'`Info.plist` — c'est le
   genre de ligne qu'une fusion supprime sans bruit.

   ⚠️ Les runners macOS sont facturés dix fois le tarif Linux sur dépôt
   privé. Sur dépôt public c'est gratuit. Si le coût gêne, restreindre le
   job iOS aux poussées sur `main` suffit à garder l'essentiel du filet.

3. **Toute dépendance nouvelle se vérifie des deux côtés.** Avant d'ajouter
   un greffon : a-t-il un support iOS ? quelle version minimale exige-t-il ?
   demande-t-il une déclaration dans l'`Info.plist` ?

## Compiler sans posséder de Mac

Xcode n'existe que sur macOS, et macOS ne peut légalement tourner que sur du
matériel Apple. Mais **compiler** ne demande pas de posséder la machine :
GitHub prête des runners macOS, et le job `ios` de `mobile.yml` s'en sert.
Sur dépôt **public**, ces minutes sont gratuites et illimitées ; sur dépôt
privé elles sont facturées dix fois le tarif Linux.

Il faut donc, une fois pour toutes, un dépôt distant :

```bash
git remote add origin https://github.com/<vous>/carto-airsoft.git
git push -u origin phase-1-socle
```

La CI se déclenche sur **toutes** les branches (`branches: ['**']`) : nul
besoin d'être sur `main` pour obtenir un build. À la première poussée, elle
compile Android, iOS et la version navigateur, et fait tourner les tests.
C'est là qu'apparaîtront les éventuelles incompatibilités de greffons —
sans qu'aucun Mac n'ait été acheté.

## La voie gratuite : son propre iPhone, sans abonnement

Le job iOS produit un artefact `carto-airsoft-ios-non-signe` : un `.ipa`
compilé mais non signé. Un Apple ID **gratuit** suffit à le signer et à le
poser sur son propre téléphone, et cela se fait **depuis Windows**.

1. Onglet **Actions** du dépôt → dernier build **Mobile** → télécharger
   l'artefact `carto-airsoft-ios-non-signe`.
2. Sur le PC, installer **Sideloadly** (ou **AltStore**). Brancher l'iPhone
   en USB.
3. Glisser le `.ipa`, saisir son Apple ID gratuit, installer.
4. Sur l'iPhone : *Réglages → Général → VPN et gestion de l'appareil* →
   faire confiance au développeur.

Ce que la gratuité coûte, et qu'il vaut mieux savoir avant :

| Limite | Conséquence |
|---|---|
| L'app **expire au bout de 7 jours** | il faut la réinstaller ; AltStore le fait tout seul si le PC reste allumé sur le même réseau |
| 3 applications signées à la fois | sans objet ici |
| 10 identifiants d'app par semaine | sans objet ici |
| **Chaque testeur doit sideloader lui-même** | c'est la vraie limite : impossible de distribuer à une équipe |

Le suivi en arrière-plan, la caméra et la boussole fonctionnent
normalement : ce sont des autorisations standard, pas des droits réservés
aux comptes payants. La voie gratuite permet donc de **valider sur le
terrain** ce qui n'a jamais pu l'être — le scan QR à la caméra, et la
position qui continue d'avancer téléphone en poche.

## La voie payante : TestFlight, pour faire jouer l'équipe

Distribuer à d'autres joueurs exige le **Apple Developer Program** (99 €/an)
et passe par TestFlight, qui accepte jusqu'à 10 000 testeurs.

Le workflow `.github/workflows/ios-testflight.yml` fait tout : trousseau
jetable, signature, archive, envoi. Il ne se déclenche jamais seul — publier
est une décision — et reste **inerte tant que les secrets sont absents**, en
s'arrêtant sur un message clair plutôt qu'en échouant à chaque poussée.

Sept secrets à renseigner dans *Settings → Secrets and variables → Actions* :

| Secret | Où le trouver |
|---|---|
| `IOS_CERTIFICATE_P12` | certificat de distribution exporté en `.p12`, encodé en base64 |
| `IOS_CERTIFICATE_PASSWORD` | le mot de passe choisi à l'export |
| `IOS_PROVISIONING_PROFILE` | profil App Store du portail développeur, en base64 |
| `IOS_PROVISIONING_PROFILE_NAME` | son nom exact, tel qu'affiché sur le portail |
| `IOS_TEAM_ID` | identifiant d'équipe (10 caractères), en haut du portail |
| `APPSTORE_API_KEY_ID` | clé d'API App Store Connect → *Users and Access → Integrations* |
| `APPSTORE_API_ISSUER_ID` | l'émetteur affiché sur la même page |
| `APPSTORE_API_PRIVATE_KEY` | contenu du fichier `.p8` téléchargé **une seule fois** |

Le numéro de build vient du compteur de la CI (`github.run_number`) :
App Store Connect refuse deux envois portant le même, et le prendre du
dépôt obligerait à un commit par publication.

⚠️ **La position en arrière-plan est le point le plus examiné en revue.**
Apple demandera pourquoi l'app déclare `UIBackgroundModes: location` et
réclame l'autorisation « Toujours ». La réponse est celle du §9 : les
alliés doivent voir un joueur téléphone en poche, sinon la carte ment.
Prévoir au moins un aller-retour avec le comité de revue.

⚠️ **L'icône est encore celle de Flutter par défaut.** Acceptée par
TestFlight, refusée sur l'App Store. Il faut une image carrée 1024 × 1024
pour générer les 16 tailles.

## Ce qui exige encore un Mac en main

Trois choses seulement, toutes optionnelles :

1. **Déboguer en direct** sur un iPhone branché (points d'arrêt, profileur).
2. **Ouvrir `Runner.xcworkspace`** pour inspecter les capacités à l'œil —
   la CI les vérifie déjà automatiquement dans l'`Info.plist`.
3. **Éprouver le quota de cartes hors-ligne** sur un appareil Apple.

## Points à surveiller

* **Identifiant de bundle** : iOS porte `com.cartoairsoft.cartoAirsoft`,
  Android `com.cartoairsoft.carto_airsoft`. Ils ne pourront **jamais** être
  identiques : Apple n'accepte que lettres, chiffres, tirets et points — le
  souligné d'Android y est interdit. Ce qui compte est que celui d'iOS soit
  arrêté **avant** la première publication : après, il est définitif sur
  l'App Store. Il est écrit à trois endroits — `project.pbxproj`,
  `ExportOptions.plist` et le workflow TestFlight.
* **Version minimale iOS 13**, imposée par MapLibre. Elle couvre l'iPhone 6s
  et au-delà.
* **Fonds de carte** : les tuiles IGN et OSM sont servies en HTTPS, aucune
  exception ATS n'est nécessaire.
* **Cartes hors-ligne** : le téléchargement de régions MapLibre fonctionne
  sur iOS, mais son quota de stockage n'a jamais été éprouvé sur un appareil
  Apple.
