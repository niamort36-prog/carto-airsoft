# Image du serveur arbitre.
#
# Construite depuis la RACINE du dépôt (le contexte doit la contenir) :
# l'API vit dans un monorepo npm, et son `package-lock.json` est à la racine.
#   docker build -f apps/api/Dockerfile -t carto-api .
#
# Fonctionne telle quelle chez n'importe quel hébergeur qui accepte un
# Dockerfile — c'est précisément pourquoi on passe par là plutôt que par la
# configuration maison de l'un d'eux.

# --- Compilation -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Les manifestes d'abord : tant qu'ils ne changent pas, l'installation est
# reprise du cache, et une modification de code ne réinstalle rien.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/console/package.json apps/console/
RUN npm ci --workspace apps/api --include-workspace-root

COPY apps/api apps/api
RUN npm run build --workspace apps/api

# --- Exécution -------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Les dépendances de développement restent présentes : `drizzle-kit` applique
# les migrations au déploiement, et l'exclure obligerait à une seconde image
# pour ce seul usage.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/drizzle.config.ts apps/api/drizzle.config.ts

# L'hébergeur impose souvent son port par la variable PORT ; main.ts la lit.
ENV PORT=3000
EXPOSE 3000

# Un utilisateur sans privilèges : rien ici n'a besoin de root.
USER node

WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
