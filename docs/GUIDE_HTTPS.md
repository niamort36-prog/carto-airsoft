# Rendre le site en ligne capable de parler à votre serveur

Guide pas à pas. Aucune installation : tout ce qui suit utilise des outils
déjà présents sur votre PC.

## Le problème, en une phrase

Le site publié est servi en **HTTPS** (adresse qui commence par `https://`).
Votre serveur, lui, tourne en **HTTP** sur votre PC. Un navigateur refuse
qu'une page HTTPS appelle une adresse HTTP — il bloque l'appel **avant même
qu'il parte**.

Résultat trompeur : vous arrivez à vous connecter (la connexion passe par
Supabase, qui est en HTTPS), puis plus rien ne marche. Rien n'est en panne
pour autant.

**La solution** : donner à votre serveur une adresse en `https://`. C'est le
rôle d'un *tunnel*.

---

## D'abord : avez-vous vraiment besoin d'un tunnel ?

| Ce que vous voulez faire | Ce qu'il faut |
|---|---|
| Tester **seul, sur ce PC** | **Rien.** Voir « Le raccourci » ci-dessous |
| Tester **depuis votre téléphone** | Le tunnel |
| Faire tester **à des amis** | Le tunnel |

### Le raccourci : tout en local

Un navigateur fait confiance à `localhost`. En ouvrant l'application
*depuis votre PC*, il n'y a aucun problème HTTPS, donc rien à installer :

```bash
npm run webapp:dev
```

Puis ouvrez **http://localhost:5174**. C'est la même application que le site
en ligne. Pour la console : `npm run console:dev`, puis
**http://localhost:5173**.

Si cela vous suffit, vous pouvez vous arrêter ici.

---

## Le tunnel, pas à pas

### Étape 1 — Démarrer la base de données

Ouvrez **Docker Desktop** et attendez qu'il affiche « running ». Puis, dans
un terminal à la racine du projet :

```bash
docker compose up -d
```

### Étape 2 — Démarrer le serveur

Dans le **même** terminal :

```bash
npm run api:dev
```

Laissez-le tourner. Il doit finir par afficher `Nest application successfully
started`. Pour vérifier, ouvrez **http://localhost:3000/v1/health** : vous
devez lire `{"status":"ok",...}`.

### Étape 3 — Ouvrir le tunnel

Ouvrez un **second** terminal (le premier est occupé par le serveur) et
collez :

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

> La toute première fois, il demande `Are you sure you want to continue
> connecting?` — répondez `yes`.

Après quelques secondes, une adresse apparaît, du genre :

```
https://433cef3b402af0.lhr.life tunneled with tls termination
```

**C'est votre adresse HTTPS.** Copiez-la (sans le texte qui suit).

⚠️ **Laissez ce terminal ouvert.** Fermer la fenêtre ferme le tunnel.

### Étape 4 — Donner l'adresse à l'application

Sur **https://niamort36-prog.github.io/carto-airsoft/** :

1. Sur l'écran de connexion, touchez **« Adresse du serveur »** en bas.
2. Collez l'adresse du tunnel.
3. **Enregistrer**.

Sur **https://niamort36-prog.github.io/carto-airsoft-console/** :

1. Cliquez **« Serveur »**, en haut à droite.
2. Collez la même adresse.
3. **OK** — la page se recharge toute seule.

Vous pouvez coller l'adresse telle quelle. Les deux comprennent
`433cef3b402af0.lhr.life` aussi bien que
`https://433cef3b402af0.lhr.life/v1`.

### Étape 5 — Vérifier

Connectez-vous. Si la liste de vos parties s'affiche, c'est gagné.

---

## Ce qui va vous surprendre

**L'adresse change à chaque fois.** Refermer le terminal et relancer la
commande donne une **nouvelle** adresse. Il faut alors la recoller
(étape 4). C'est le prix du gratuit sans compte.

**Le tunnel coupe si le PC se met en veille.** Le serveur de jeu vit sur
votre PC : il doit rester allumé et éveillé pendant toute la partie.

**Tout le monde doit coller la même adresse.** Chaque joueur règle la sienne
sur son téléphone. Si l'un d'eux ne voit rien, c'est la première chose à
vérifier.

---

## Si ça ne marche pas

| Ce que vous voyez | Ce que c'est |
|---|---|
| « Impossible de joindre le serveur » | Le serveur n'est pas démarré (étape 2) ou le tunnel est fermé (étape 3) |
| Le message sur le HTTPS | L'adresse n'a pas été collée, ou elle commence par `http://` au lieu de `https://` |
| `connection refused` dans le terminal du tunnel | Le serveur n'écoute pas sur le port 3000 — reprenez l'étape 2 |
| La page ne change pas après avoir collé l'adresse | Rechargez en forçant : **Ctrl+Maj+R** |

---

## Pour aller plus loin : une adresse qui ne change pas

Deux voies, le jour où recoller l'adresse à chaque fois devient pénible :

1. **Cloudflare Tunnel avec un compte gratuit** — l'adresse devient fixe.
   `winget install Cloudflare.cloudflared`, puis suivre
   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
2. **Héberger le serveur** sur une petite machine en ligne (environ 5 €/mois).
   C'est la vraie réponse si l'application doit servir sans votre PC.
