# Mettre le serveur en ligne

Tant que le serveur de jeu tourne sur votre PC, les sites publiés ne
peuvent pas l'appeler : une page servie en HTTPS n'a pas le droit de parler
à un serveur en HTTP clair, et le navigateur bloque l'appel avant même
qu'il parte. C'est l'origine de tous les messages d'erreur que vous avez
vus, et d'eux seuls — la webapp et la console, elles, fonctionnent.

Une fois le serveur en ligne, il n'y a plus rien à régler nulle part : les
deux sites le trouvent tout seuls, sur n'importe quel téléphone, sans
tunnel, sans adresse à recopier et sans PC allumé.

Il y a deux morceaux : **la base de données** et **le serveur**.

---

## 1. La base de données

Vous avez déjà un projet Supabase — celui qui gère les comptes. Il contient
un PostgreSQL complet, inutilisé jusqu'ici. Autant s'en servir : pas de
second compte à ouvrir.

1. Ouvrez votre projet sur [supabase.com](https://supabase.com).
2. **Database → Extensions**, cherchez `postgis`, activez-la.
   Sans elle, rien de géographique ne fonctionne : zones, drone, captures.
3. **Project Settings → Database → Connection string**, onglet
   **Transaction pooler**. Copiez la ligne, elle ressemble à :

   ```
   postgresql://postgres.xxxxxxxx:MOT_DE_PASSE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres
   ```

   Remplacez `MOT_DE_PASSE` par celui de la base (celui que Supabase vous a
   demandé à la création du projet — pas celui de votre compte).

C'est votre `DATABASE_URL`. Gardez-la de côté ; elle ouvre la base, elle ne
se partage pas et elle ne se met pas dans le dépôt.

> Le pilote de l'API est déjà réglé pour ce mode de connexion
> (`prepare: false` dans `apps/api/src/db/db.module.ts`) : rien à changer.

---

## 2. Le serveur

### Ce qui se joue dans ce choix

La carte tactique repose sur une liaison permanente : les positions, le
chat et les ordres arrivent tout seuls, sans que l'application redemande.
Les hébergements gratuits ne tiennent pas cette liaison — ils ferment les
connexions inactives et endorment le serveur après quelques minutes. La
carte se chargerait, mais plus personne n'y bougerait, et le premier accès
après une pause demanderait une minute.

L'application sait se replier sur une liaison plus rustique, donc le
gratuit n'est pas inutilisable — mais pour une vraie partie, comptez
quelques euros par mois.

### Option recommandée — Fly.io (≈ 3 €/mois)

Tout est déjà écrit dans `fly.toml` : la construction, les migrations, le
contrôle de santé, et une machine qui ne s'endort pas.

```bash
# Une seule fois : installer l'outil, puis créer le compte
# https://fly.io/docs/flyctl/install/
fly auth signup

# Depuis la racine du dépôt
fly launch --no-deploy --copy-config --name carto-airsoft-api
fly secrets set DATABASE_URL="postgresql://postgres.xxxx:...@...:6543/postgres"
fly secrets set SUPABASE_URL="https://rcgrwhayagadsaqnjufj.supabase.co"
fly deploy
```

À la fin, Fly affiche l'adresse du serveur :
`https://carto-airsoft-api.fly.dev`.

### Option sans ligne de commande — Render (gratuit, avec les réserves ci-dessus)

`render.yaml` est déjà dans le dépôt.

1. Compte sur [render.com](https://render.com), connectez votre GitHub.
2. **New → Blueprint**, choisissez le dépôt `carto-airsoft`.
3. Render lit `render.yaml` et propose le service. Renseignez
   `DATABASE_URL` et `SUPABASE_URL` quand il les demande.
4. **Apply**. L'adresse ressemble à
   `https://carto-airsoft-api.onrender.com`.

---

## 3. Brancher les deux sites dessus

Une seule variable à poser sur le dépôt, et les deux sites sont
reconstruits en pointant au bon endroit — plus aucune adresse à saisir
dans l'application ni dans la console.

```bash
gh variable set API_BASE_URL --body "https://carto-airsoft-api.fly.dev/v1"
gh workflow run pages.yml
```

(Ou dans l'interface GitHub : **Settings → Secrets and variables →
Actions → Variables → New variable**, nom `API_BASE_URL`.)

Le `/v1` à la fin compte : c'est le préfixe de toutes les routes.

Puis, par sécurité, restreignez qui a le droit d'appeler l'API depuis un
navigateur :

```bash
fly secrets set CORS_ORIGINS="https://niamort36-prog.github.io"
```

---

## 4. Vérifier

```bash
curl https://carto-airsoft-api.fly.dev/v1/health
```

Doit répondre `{"status":"ok",...}`.

Ouvrez ensuite <https://niamort36-prog.github.io/carto-airsoft/> : la
connexion doit mener à « Mes parties » sans aucun message rouge. Si un
message d'adresse subsiste, c'est qu'une ancienne adresse est restée
enregistrée dans ce navigateur : bouton « Adresse du serveur », videz le
champ, validez.

---

## Ce qui reste possible sans Internet

Une partie en forêt n'a pas toujours de réseau. Le mode autonome reste là :

```bash
npm run webapp
```

Le PC sert alors la webapp **et** l'API sous une seule adresse, que chacun
ouvre depuis le même Wi-Fi ou le même partage de connexion. Rien à régler
sur les téléphones : l'application reconnaît une adresse de réseau local et
vise ce PC.
