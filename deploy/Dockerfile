# syntax=docker/dockerfile:1

# ---- Compilation -----------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 se compile à l'installation : sans ces outils, `npm ci` échoue
# sur une image slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Les manifestes d'abord : la couche d'installation est réutilisée tant que les
# dépendances ne bougent pas, ce qui change tout sur le temps de déploiement.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

# ---- Exécution -------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Le serveur compilé garde ses dépendances natives en externe ; le client, lui,
# est entièrement embarqué dans les fichiers statiques.
RUN npm ci --omit=dev -w server --include-workspace-root \
    && npm cache clean --force \
    && apt-get purge -y python3 make g++ || true

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

# La base vit sur un volume : elle doit survivre au remplacement du conteneur.
RUN mkdir -p /data
ENV DB_PATH=/data/zapzap.db
VOLUME ["/data"]

EXPOSE 3000
# Le healthcheck sert au déploiement : on ne bascule le trafic qu'une fois le
# serveur réellement prêt à répondre.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
