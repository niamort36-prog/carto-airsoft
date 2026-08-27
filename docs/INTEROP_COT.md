# Interopérabilité CoT (Cursor on Target)

CoT est le format d'échange de l'écosystème TAK (ATAK, WinTAK, iTAK). Le
cahier des charges demande de **s'en inspirer** pour l'interopérabilité :
l'application n'est pas un serveur TAK, mais elle parle cette langue dans
les deux sens.

Un événement CoT dit « quoi, où, quand, et **jusqu'à quand y croire** ».
Cette dernière partie est ce qui rend le format intéressant ici : chaque
événement porte une péremption (`stale`), ce qui exprime exactement le
principe « membre ≠ connecté » du §2.3 — une position vieille de dix minutes
s'annonce comme telle au lieu de se faire passer pour fraîche.

## Ce qui ne sort jamais

**Le masquage anti-triche s'applique à CoT comme partout ailleurs** (§2.1) :

* un joueur exporte **sa** vision — son camp avec les positions, jamais
  celles d'en face ;
* une **clé d'API** obtient le terrain et les drapeaux, **jamais un joueur**,
  même de son propre camp.

Sans cette règle, brancher un client TAK serait devenu le moyen le plus
simple de contourner l'arbitre.

## Importer une situation CoT

Le CoT passe par le même point d'entrée que le GeoJSON et le KML
([docs/IMPORT_CALQUES.md](IMPORT_CALQUES.md)) — il est reconnu à ses balises
`<event>`, sans quoi il serait lu comme un KML et ne donnerait rien.

```bash
curl -X POST https://<serveur>/v1/games/<id>/layers/import \
  -H "Authorization: Bearer <jeton-de-session>" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Situation ATAK\", \"content\": $(jq -Rs . situation.cot)}"
```

L'affiliation portée par le type CoT est **conservée** : une unité hostile
venue d'un client TAK s'affiche bien en rouge chez nous.

| Type CoT | Devient |
|---|---|
| `a-f-…` | symbole allié (bleu) |
| `a-h-…`, `a-s-…`, `a-j-…`, `a-k-…` | symbole hostile (rouge) |
| `a-n-…` | symbole neutre (vert) |
| `a-u-…`, `a-p-…` | symbole inconnu (jaune) |
| `b-m-p-w` | point de passage |
| `u-d-f` avec `<link>` | ligne, ou zone si l'anneau est fermé |

Suspect (`s`), joker (`j`) et faux-ami (`k`) sont rangés du côté hostile :
sur le terrain, un doute se traite comme une menace.

## Exporter

**Pour un joueur** — sa vision, masquage compris :

```bash
curl https://<serveur>/v1/games/<id>/cot \
  -H "Authorization: Bearer <jeton-de-session>"
```

**Pour une intégration** — terrain et drapeaux, sans les joueurs :

```bash
curl https://<serveur>/v1/public/games/<id>/cot \
  -H "X-API-Key: ca_….<secret>"
```

Les deux rendent un lot `<events>` :

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>
  <event version="2.0" uid="carto-member-…" type="a-f-G-U-C"
         time="…" start="…" stale="…" how="m-g">
    <point lat="48.404" lon="2.632" hae="9999999" ce="9999999" le="9999999"/>
    <detail>
      <contact callsign="Loup-01"/>
      <__group name="…" role="Team Member"/>
      <remarks>commandant · alive</remarks>
      <carto-airsoft icon="command_allied"/>
    </detail>
  </event>
</events>
```

`<events>` n'est pas du CoT canonique — le format décrit un événement à la
fois — mais c'est l'enveloppe qu'emploient les outils qui échangent des
lots, et nos deux bouts la relisent.

Deux péremptions différentes, parce que les deux choses ne vieillissent pas
pareil :

| Contenu | `stale` |
|---|---|
| Position d'un joueur | dernière position connue + 2 min |
| Marqueur, tracé, drapeau | + 24 h |

`<carto-airsoft icon="…"/>` est une extension maison : les autres clients
l'ignorent, et un aller-retour entre deux de nos serveurs retrouve l'insigne
exact plutôt qu'un équivalent approché.

## Limites assumées

* Pas de flux temps réel CoT (TCP/UDP multicast, TAK Server) : l'export est
  une photographie sur requête. Le temps réel passe par notre WebSocket.
* Le catalogue MIL-STD-2525 n'est pas couvert : on traduit l'affiliation, la
  dimension au sol et la distinction unité / installation / point, ce qui
  suffit à afficher juste dans un client TAK.
