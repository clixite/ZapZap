#!/usr/bin/env bash
#
# Installation de ZapZap sur le VPS.
#
# La machine héberge déjà d'autres services — Rikiki, entre autres — derrière un
# reverse proxy en place. Ce script part donc d'un principe simple : il n'ajoute
# que ce qui lui appartient et ne modifie jamais une configuration existante.
# Concrètement, il crée un fichier de site nginx qui n'existait pas, et démarre
# un conteneur sur un port qui n'est utilisé par personne.
#
# Usage, en root sur le VPS :
#   bash deploy/install.sh
#
# Variables acceptées :
#   DOMAIN     domaine du service   (défaut : zapzap.clixite-prod.cloud)
#   PORT       port interne publié  (défaut : 3210)
#   EMAIL      contact Let's Encrypt

set -euo pipefail

DOMAIN="${DOMAIN:-zapzap.clixite-prod.cloud}"
PORT="${PORT:-3210}"
EMAIL="${EMAIL:-ns.bruxelles@gmail.com}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

info() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "À lancer en root."

# ---------------------------------------------------------------------------
info "Docker"
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker absent, installation."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Le plugin docker compose est requis."
echo "  Docker $(docker --version | awk '{print $3}' | tr -d ,)"

# ---------------------------------------------------------------------------
info "Port interne"
# ---------------------------------------------------------------------------
# Un port déjà pris signifierait qu'on marche sur un service existant : on
# préfère s'arrêter que de casser ce qui tourne.
if ss -ltn "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT}"; then
  die "Le port ${PORT} est déjà utilisé. Relancez avec PORT=<autre> bash deploy/install.sh"
fi
echo "  ${PORT} est libre."

# ---------------------------------------------------------------------------
info "Secrets"
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]] && grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  echo "  .env existant conservé — le secret n'est pas régénéré."
  echo "  (le régénérer déconnecterait tous les joueurs.)"
else
  info "Génération du secret de signature"
  cat > "$ENV_FILE" <<EOF
PUBLIC_URL=https://${DOMAIN}
JWT_SECRET=$(openssl rand -hex 32)
BOT_DELAY_MS=800
TURN_TIMEOUT_MS=45000
EOF
  chmod 600 "$ENV_FILE"
  echo "  Écrit dans ${ENV_FILE} (lisible par root seulement)."
fi

# ---------------------------------------------------------------------------
info "Reverse proxy en place"
# ---------------------------------------------------------------------------
# Sur le VPS, c'est un Traefik en file provider qui tient les ports 80/443 : on
# le détecte avant de construire, pour attacher le conteneur au réseau `proxy`
# dès son démarrage plutôt qu'après coup.
TRAEFIK_CONFIG_DIR=""
COMPOSE_FILES=(-f deploy/docker-compose.yml)
if docker ps --format '{{.Names}}' | grep -qx traefik; then
  TRAEFIK_CONFIG_DIR="$(docker inspect traefik \
    --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
fi
if [[ -n "$TRAEFIK_CONFIG_DIR" ]]; then
  echo "  Traefik détecté (config : ${TRAEFIK_CONFIG_DIR})."
  docker network inspect proxy >/dev/null 2>&1 || die "Traefik présent mais pas de réseau « proxy »."
  COMPOSE_FILES+=(-f deploy/docker-compose.traefik.yml)
else
  echo "  Pas de Traefik : on tentera nginx plus loin."
fi

# ---------------------------------------------------------------------------
info "Construction et démarrage"
# ---------------------------------------------------------------------------
cd "$APP_DIR"
PORT_BINDING="127.0.0.1:${PORT}:3000" \
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d --build

info "Attente du serveur"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "  Le serveur répond."
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 \
  || die "Le serveur ne répond pas. Voir : docker compose -f deploy/docker-compose.yml logs"

# ---------------------------------------------------------------------------
info "Publication"
# ---------------------------------------------------------------------------
if [[ -n "$TRAEFIK_CONFIG_DIR" ]]; then
  # Traefik recharge son dossier /config à chaud : déposer le routeur suffit.
  # On ne remplace jamais un fichier existant — il peut avoir été ajusté à la
  # main, et c'est lui qui fait foi.
  if [[ -f "${TRAEFIK_CONFIG_DIR}/zapzap.yml" ]]; then
    echo "  ${TRAEFIK_CONFIG_DIR}/zapzap.yml existe déjà : conservé tel quel."
  else
    cp deploy/traefik-zapzap.yml "${TRAEFIK_CONFIG_DIR}/zapzap.yml"
    echo "  Routeur déposé : ${TRAEFIK_CONFIG_DIR}/zapzap.yml"
  fi
  info "Vérification"
  sleep 5
  if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    echo "  https://${DOMAIN} répond."
  else
    warn "https://${DOMAIN} ne répond pas encore — le certificat peut prendre"
    warn "quelques secondes. Réessayez : curl https://${DOMAIN}/api/health"
  fi
  info "Terminé"
  echo "  https://${DOMAIN}"
  echo "  Journal : docker compose ${COMPOSE_FILES[*]} logs -f"
  echo "  Mise à jour : git pull && bash deploy/install.sh"
  exit 0
fi

if ! command -v nginx >/dev/null 2>&1 || ! systemctl is-active --quiet nginx 2>/dev/null; then
  warn "Ni Traefik ni nginx actif. Le service tourne sur http://127.0.0.1:${PORT}."
  warn "Branchez-le à votre proxy et arrêtez-vous là."
  exit 0
fi

SITE="/etc/nginx/sites-available/${DOMAIN}"
if [[ -e "$SITE" ]]; then
  warn "${SITE} existe déjà : on n'y touche pas."
else
  cat > "$SITE" <<EOF
# ZapZap — ajouté par deploy/install.sh, ne modifie aucun autre site.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;

        # Le jeu vit sur des WebSockets : sans ces deux en-têtes, la connexion
        # retombe en polling et chaque coup prend une seconde.
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Une partie asynchrone peut rester ouverte des heures sans trafic.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
  ln -sfn "$SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
  echo "  Site ajouté : ${SITE}"
fi

# `nginx -t` valide TOUTE la configuration : si elle échoue, c'est notre ajout
# qui est en cause, et on le retire plutôt que de laisser le serveur en panne —
# ce qui emporterait les autres sites de la machine.
if ! nginx -t 2>/dev/null; then
  rm -f "/etc/nginx/sites-enabled/${DOMAIN}"
  nginx -t || die "La configuration nginx était déjà invalide avant notre passage."
  die "Notre bloc nginx est invalide, il a été retiré."
fi
systemctl reload nginx
echo "  nginx rechargé."

# ---------------------------------------------------------------------------
info "Certificat TLS"
# ---------------------------------------------------------------------------
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo "  Certificat déjà en place."
elif command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect \
    || warn "certbot a échoué. Le site reste accessible en HTTP."
else
  warn "certbot absent. Installez-le puis : certbot --nginx -d ${DOMAIN}"
fi

info "Terminé"
echo "  https://${DOMAIN}"
echo "  Journal  : docker compose -f deploy/docker-compose.yml logs -f"
echo "  Mise à jour : git pull && bash deploy/install.sh"
