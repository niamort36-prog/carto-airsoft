# Symbologie OTAN sur la carte

L'application dessine ses symboles selon **APP-6 / MIL-STD-2525** : un
symbole au centre, et autour de lui des *champs modificateurs* désignés par
une lettre. La position d'un champ porte autant de sens que son texte —
« ALPHA » à gauche du cadre et « ALPHA » à droite ne disent pas la même
chose à qui lit la carte.

## Les champs rendus

| Champ | Nom OTAN | Position | Ce que l'app y met |
|-------|----------|----------|--------------------|
| **W** | Groupe date-heure | Colonne de gauche, en haut | L'heure de pose d'un marqueur, dans la couleur de son camp |
| **T** | Désignation propre | Colonne de gauche | Le nom d'une escouade repliée en un marqueur |
| **H** | Information complémentaire | Colonne de droite, en haut | Le texte libre : fréquence radio, immatriculation, consigne courte |
| **M** | Formation supérieure | Colonne de droite | L'escouade dont relève un allié |
| **B** | Échelon | Au-dessus du cadre | La taille du groupe : points ou barre |
| **N** | « ENY » | Colonne de droite, en bas | Marque réglementaire des symboles hostiles |

## L'échelle des échelons (champ B)

La marque portée au-dessus du cadre dit la taille de l'unité. L'app la
déduit de l'effectif du groupe :

| Marque | Échelon | Effectif |
|--------|---------|----------|
| Ø | Équipe ou binôme | 2 à 5 |
| ● | Groupe ou escouade | 6 à 12 |
| ●●● | Section | 13 à 40 |
| ❘ | Compagnie | 41 à 250 |
| ❘❘ | Bataillon | 251 à 1 000 |
| ❘❘❘ | Régiment ou groupement | 1 001 à 3 000 |
| ✕ | Brigade | 3 001 à 5 000 |
| ✕✕ | Division | 5 001 à 20 000 |
| ✕✕✕ | Corps d'armée | 20 001 à 50 000 |
| ✕✕✕✕ | Armée | au-delà |

Le tableau officiel laisse des trous — il ne dit rien de 6 ou 7 hommes ;
l'app prolonge l'échelon inférieur jusqu'au suivant, de sorte qu'aucun
effectif ne reste sans marque.

Deux marques de la norme ne sont jamais posées, faute de la donnée qui les
distingue : le **double point** (groupe *avec* mitrailleuses — c'est un
armement, pas un effectif) et le **quadruple point** (Staffel, propre à
l'armée allemande).

## Les unites s emboitent

Une unite declare son echelon et peut en contenir d autres, a condition
qu elles soient d un echelon STRICTEMENT inferieur : une compagnie contient
des sections, une section des groupes, un groupe des equipes. On ne met pas
une section dans un groupe.

Une unite releve soit d une unite parente, soit d un grade en direct —
jamais des deux, sinon l organigramme dirait deux choses differentes. Cela
laisse ouverte la possibilite qu un groupe depende directement d un
commandant, sans section au-dessus.

L echelon est DECLARE, pas deduit de l effectif : une section reste une
section le jour ou six hommes seulement sont presents. L effectif ne sert
plus qu a suggerer un echelon a la creation.

Une partie peut compter plusieurs commandants, chacun avec ses unites.
Quand il y en a plusieurs, une unite que rien ne rattache devient un sommet
a part entiere plutot que d etre accrochee au premier venu : inventer une
subordination que personne n a donnee serait pire que de la montrer absente.
Le dernier commandant ne peut pas etre retrograde — la partie perdrait son
arbitre.

Tout cela se lit et se modifie depuis l organigramme du panneau des allies.

## Deux contraintes de mise en œuvre

**Les textes sont peints DANS l'image du symbole**, jamais posés par une
couche de texte MapLibre. Une couche de texte réclame des polices servies
par un serveur de glyphes ; hors ligne, les libellés disparaîtraient — ce
que l'offline-first (§2.3) interdit. Conséquence : chaque combinaison
symbole + champs est une image distincte, fabriquée à la demande et gardée
en cache pour la session. C'est pourquoi `SymbolFields.key` entre dans
l'identifiant d'image : le rendu natif garde la **première** image
enregistrée sous un identifiant donné, deux jeux de champs différents
doivent donc porter deux identifiants.

**L'échelon est tracé au pinceau, pas écrit.** Un « ● » dépend d'une police
qui peut manquer sur l'appareil ; un cercle rempli ne dépend de rien.

## Où c'est écrit

- `apps/mobile/lib/map/unit_icons.dart` — `SymbolFields`, `SymbolEchelon`,
  `UnitIcons.fieldedPng`, `UnitIcons.squadFramePng`
- `apps/mobile/lib/map/map_screen.dart` — `_markerFields`, `_allyFields`,
  `_squadFields` : ce que l'app décide de mettre dans chaque champ
- `apps/mobile/test/unit_icons_test.dart` — les règles d'identifiant et
  d'échelon, vérifiables sans carte

## Poser une étiquette (champ H)

- **Sur soi** : panneau des alliés → son propre nom → « Ajouter une
  étiquette ». Toujours permis, sans grade particulier.
- **Sur un homme** : même menu, sur lui. Demande la permission
  `members:badge` et un grade strictement supérieur — une fréquence se
  donne vers le bas de la chaîne, jamais vers le haut.
- **Sur une escouade** : marqueur de groupe → « Ajouter une étiquette au
  groupe ». Demande `squads:manage`.
- **Sur un marqueur posé** : fiche de l'objet → « Ajouter une étiquette ».
  Passe par la file hors ligne comme le reste de la fiche.

Vider le champ efface l'étiquette. Elle est bornée à 24 caractères : au-delà
elle mange la carte au lieu de l'informer.
