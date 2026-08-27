# API publique et clés d'accès (§7.11)

Cette porte sert aux intégrations extérieures à l'app : affichage des scores
sur un écran, site du club, pupitre d'organisation, script maison. Elle
utilise la même API que l'app mobile et la console — il n'existe pas de
« deuxième serveur » (§2.2).

## Ce qui ne sort jamais par cette porte

Deux garanties tiennent **quelle que soit la portée de la clé**, y compris
`admin` :

* **Aucune position de joueur.** La composition des équipes est lisible, les
  coordonnées ne le sont pas. Sans cette règle, une clé de lecture donnerait
  un avantage de terrain à qui la détient, ce que le §2.1 interdit.
* **Aucun jeton de QR** (invitation, objectif, bonus). Divulguer le jeton
  d'un drapeau permettrait de le capturer sans y aller.

Autrement dit : une clé qui fuite fait perdre de la confidentialité
d'organisation, jamais l'équité d'une partie en cours.

## Créer une clé

Les clés se gèrent avec un **compte** (jeton Supabase), pas avec une autre
clé. Depuis la console PC, ou directement :

```bash
curl -X POST https://<serveur>/v1/api-keys \
  -H "Authorization: Bearer <jeton-de-session>" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "Tableau des scores du club",
        "scopes": ["read"],
        "gameIds": ["<id-de-partie>"]
      }'
```

Réponse :

```json
{
  "id": "…",
  "name": "Tableau des scores du club",
  "prefix": "ca_7Fq2xK9m",
  "scopes": ["read"],
  "gameIds": ["…"],
  "token": "ca_7Fq2xK9m.<secret>"
}
```

**Le champ `token` n'apparaît qu'ici.** Le serveur n'en conserve que
l'empreinte SHA-256, comme pour les jetons d'invitation : ni la base ni les
journaux ne permettent de le retrouver. S'il est perdu, on révoque et on en
crée une autre.

Le `prefix` est en clair : il identifie la clé dans une liste et permet au
serveur de la retrouver sans rien divulguer.

| Champ | Rôle |
|---|---|
| `name` | Libellé, pour vous y retrouver plus tard |
| `scopes` | `read`, `write`, `admin` — voir plus bas |
| `gameIds` | Parties visées. **Vide = toutes vos parties** |
| `expiresAt` | Expiration ISO 8601, facultative |

## Portées

Elles s'emboîtent : `admin` contient `write`, qui contient `read`.

| Portée | Ce qu'elle permet |
|---|---|
| `read` | Consulter : partie, scores, objectifs, composition, captures |
| `write` | En plus : lancer ou arrêter la partie |
| `admin` | En plus : réservé aux futures routes de préparation |

Une clé ne peut viser que des parties **dont vous êtes propriétaire**. Le
lien est revérifié à chaque appel : une clé ne suit pas une partie qui
changerait de mains, et une liste `gameIds` vide ne l'ouvre jamais au-delà de
vos propres parties.

## S'authentifier

```bash
curl https://<serveur>/v1/public/games/<id>/scores \
  -H "X-API-Key: ca_7Fq2xK9m.<secret>"
```

L'en-tête `Authorization: Bearer ca_…` est accepté aussi, pour les clients
qui ne savent envoyer qu'un en-tête standard.

## Routes

| Méthode | Route | Portée | Contenu |
|---|---|---|---|
| GET | `/v1/public/games/:id` | `read` | Nom, statut, dates |
| GET | `/v1/public/games/:id/scores` | `read` | Score par équipe, décroissant |
| GET | `/v1/public/games/:id/objectives` | `read` | Objectifs, position, détenteur |
| GET | `/v1/public/games/:id/members` | `read` | Pseudo, grade, équipe, en ligne |
| GET | `/v1/public/games/:id/captures` | `read` | Historique des captures |
| PATCH | `/v1/public/games/:id/status` | `write` | `{"status":"live"}` |

La description complète et interrogeable est servie sur `/docs` (OpenAPI).

## Révoquer

```bash
curl -X DELETE https://<serveur>/v1/api-keys/<id-de-cle> \
  -H "Authorization: Bearer <jeton-de-session>"
```

Effet immédiat. La ligne est conservée : savoir qu'une clé a existé et quand
elle a servi pour la dernière fois (`lastUsedAt`) fait partie de ce qu'on veut
pouvoir relire après coup. `GET /v1/api-keys` liste les vôtres, sans secrets.

## Réponses d'erreur

| Code | Cause |
|---|---|
| 401 | Clé absente, inconnue, révoquée, expirée, ou secret faux |
| 403 | Portée insuffisante, ou partie hors du champ de la clé |
| 404 | Partie inexistante |

---

## Statistiques et rejeu

Le bilan (`GET /v1/games/:id/stats`) et le rejeu (`GET /v1/games/:id/replay`)
ne s'ouvrent **qu'une fois la partie terminée** : ils montrent les positions
de tout le monde, ce qui donnerait pendant le jeu une vue complète du terrain
adverse — exactement ce que le §2.1 refuse.

Chacun peut en revanche consulter **sa propre trace** à tout moment
(`GET /v1/games/:id/my-track`) : elle ne révèle que ce qu'il sait déjà.

La trace est écrite au fil du jeu avec deux garde-fous, appliqués à
l'écriture plutôt qu'en nettoyage après coup : **un point toutes les dix
secondes au plus**, et **rien si le joueur n'a pas bougé** d'au moins
quelques mètres. Un joueur immobile ne produit donc aucune ligne, ce qui est
aussi la vérité de sa trace.
