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
| **Compilation réellement effectuée** | **jamais** |

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

## Ce qui reste à faire sur un Mac

Aucune de ces étapes n'est possible depuis Windows.

1. `cd apps/mobile/ios && pod install` — première résolution CocoaPods.
2. `flutter build ios --no-codesign` — la vraie première compilation. C'est
   ici qu'apparaîtront les incompatibilités éventuelles de greffons.
3. Ouvrir `Runner.xcworkspace`, choisir l'équipe de signature, vérifier que
   les capacités **Background Modes → Location updates** sont bien cochées.
4. Essayer sur un iPhone réel : autoriser « Toujours », mettre le téléphone
   en poche, vérifier chez un allié que la position continue d'avancer.
5. **Scanner un QR avec la caméra** — jamais validé nulle part, l'émulateur
   Android n'ayant pas de caméra utilisable.

## Points à surveiller

* **Identifiant de bundle** : iOS porte `com.cartoairsoft.cartoAirsoft`
  (majuscule héritée de la génération Flutter), Android
  `com.cartoairsoft.carto_airsoft`. Sans conséquence technique, mais à
  uniformiser **avant** la première publication — après, l'identifiant est
  définitif sur l'App Store.
* **Version minimale iOS 13**, imposée par MapLibre. Elle couvre l'iPhone 6s
  et au-delà.
* **Fonds de carte** : les tuiles IGN et OSM sont servies en HTTPS, aucune
  exception ATS n'est nécessaire.
* **Cartes hors-ligne** : le téléchargement de régions MapLibre fonctionne
  sur iOS, mais son quota de stockage n'a jamais été éprouvé sur un appareil
  Apple.
