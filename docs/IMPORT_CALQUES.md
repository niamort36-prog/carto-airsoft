# Importer une préparation externe (§7.10)

map.army, QGIS, Google Earth : la préparation de terrain se fait souvent
ailleurs. On l'importe ici comme **calque**, superposé aux données de jeu.

map.army reste un outil externe **optionnel** — ce n'est pas le moteur
cartographique de l'application, et il n'y a pas d'iframe.

## Ce qu'un calque devient

Les entités importées ne vivent pas dans un coin à part : ce sont des
**objets de carte ordinaires**, marqués du `layerId` de leur calque. Elles
héritent donc gratuitement de tout le reste :

* elles descendent sur les téléphones par la synchronisation habituelle,
  donc **elles fonctionnent hors ligne** (§7.6) ;
* elles arrivent **en direct** chez les joueurs déjà connectés ;
* elles se mélangent aux marqueurs posés en jeu, comme le demande le §7.10 ;
* leur retrait passe par les mêmes pierres tombales, si bien qu'un téléphone
  hors ligne au moment du retrait le rattrape à la reconnexion.

## Importer

Il faut la permission de préparation de partie (`game.manage`) — déposer un
calque modifie le terrain de tout le monde.

```bash
curl -X POST https://<serveur>/v1/games/<id>/layers/import \
  -H "Authorization: Bearer <jeton-de-session>" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Préparation zone nord\", \"content\": $(jq -Rs . terrain.geojson)}"
```

Le **format est reconnu à la lecture** du contenu, sans se fier à
l'extension : un fichier qui commence par `{` est lu en GeoJSON, un fichier
XML en KML.

```json
{ "id": "…", "name": "Préparation zone nord", "format": "geojson",
  "featureCount": 42, "createdAt": "…" }
```

## Correspondance des géométries

| Source | Devient | Remarque |
|---|---|---|
| `Point`, `MultiPoint` | marqueur | icône « point de passage » par défaut |
| `LineString`, `MultiLineString` | ligne | |
| `Polygon`, `MultiPolygon` | zone | anneau extérieur seulement |
| `GeometryCollection`, `MultiGeometry` | éclatée | une entité par géométrie |

Ce qui est repris au passage :

* le **nom** (`properties.name` en GeoJSON, `<name>` en KML) ;
* la **couleur** quand elle est là : `stroke` / `fill` / `marker-color`
  (simplestyle-spec) en GeoJSON, `<LineStyle><color>` en KML — le KML code
  la couleur en `aabbggrr`, l'inverse du web, la conversion est faite.

Le cahier des charges prévient que **le style exact ne survit pas toujours à
l'export, et que ce n'est pas grave** : la géométrie prime. Une entité
illisible est écartée sans faire échouer tout le fichier ; en revanche un
fichier entièrement inexploitable est refusé avec un message explicite,
plutôt qu'importé à moitié.

**Limite : 2000 entités par calque.** Au-delà, l'import est refusé — ces
entités descendent sur des téléphones qui doivent rester fluides en forêt.

## Lister et retirer

```bash
curl https://<serveur>/v1/games/<id>/layers \
  -H "Authorization: Bearer <jeton-de-session>"

curl -X DELETE https://<serveur>/v1/games/<id>/layers/<layerId> \
  -H "Authorization: Bearer <jeton-de-session>"
```

Le retrait répond `{ "removed": 42 }` et fait disparaître le calque des
téléphones, y compris ceux qui étaient hors ligne pendant l'opération.

## Erreurs

| Code | Cause |
|---|---|
| 400 | Format non reconnu, JSON/XML illisible, aucune géométrie, trop d'entités |
| 403 | Permission de préparation de partie absente |
| 404 | Partie ou calque inexistant |
