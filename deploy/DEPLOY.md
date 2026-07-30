# Mettre ZapZap en ligne

Le service tourne sur le VPS `srv1352234.hstgr.cloud` (`76.13.46.55`), qui héberge
déjà d'autres applications derrière Traefik — dont Rikiki. Tout ce qui suit est
conçu pour **cohabiter sans rien toucher** : port interne dédié, conteneur et
volume nommés à part, et un seul fichier de routeur ajouté à la configuration du proxy.

## Le proxy de la machine : Traefik

Les ports 80/443 sont tenus par un **Traefik v3 en file provider** (pas de labels
Docker) : les services le rejoignent par le réseau `proxy`, et il publie ce que
décrivent les fichiers déposés dans son dossier `/config`, rechargé à chaud.
`install.sh` détecte ce Traefik, attache le conteneur au réseau via
`deploy/docker-compose.traefik.yml`, et dépose `deploy/traefik-zapzap.yml` dans
sa configuration. Le fichier nginx n'est utilisé que si un nginx actif est le
proxy — pas sur ce VPS.

## Ce qui est déjà en place

- **Le DNS n'a rien à faire.** La zone `clixite-prod.cloud` porte un
  enregistrement générique `A * → 76.13.46.55`, et `zapzap.clixite-prod.cloud`
  résout déjà par ce biais. C'est exactement ainsi que Rikiki est servi : il n'a
  pas d'enregistrement propre. Rien à créer, et surtout rien à modifier dans une
  zone qui sert six autres services.

## Installation, en une commande

En root sur le VPS :

```bash
git clone https://github.com/clixite/ZapZap.git /opt/zapzap
cd /opt/zapzap
git checkout claude/zapzap-card-game-rikiki-qs9gn5
bash deploy/install.sh
```

Le script :

1. installe Docker s'il manque ;
2. **vérifie que le port 3210 est libre** et s'arrête sinon, plutôt que de
   marcher sur un service existant ;
3. génère un `JWT_SECRET` dans `/opt/zapzap/.env` — et ne le régénère jamais si
   le fichier existe déjà, parce que cela déconnecterait tous les joueurs ;
4. construit l'image et démarre le conteneur ;
5. attend que `/api/health` réponde ;
6. ajoute `/etc/nginx/sites-available/zapzap.clixite-prod.cloud`, **sans toucher
   aux autres sites**. Si `nginx -t` échoue, notre bloc est retiré aussitôt : une
   configuration invalide emporterait tous les sites de la machine ;
7. demande le certificat à Let's Encrypt.

Pour choisir un autre port : `PORT=3211 bash deploy/install.sh`.

## Mise à jour

```bash
cd /opt/zapzap && git pull && bash deploy/install.sh
```

Le `.env` est conservé, donc les sessions des joueurs survivent. Les parties en
cours aussi : elles sont persistées en SQLite sur le volume `zapzap-data` et
relues au démarrage.

## Vérifier

```bash
curl https://zapzap.clixite-prod.cloud/api/health     # {"ok":true}
curl https://rikiki.clixite-prod.cloud/api/health     # Rikiki doit rester debout
docker compose -f deploy/docker-compose.yml logs -f
```

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `PORT` | port d'écoute dans le conteneur | `3000` |
| `PUBLIC_URL` | base des liens d'invitation `/j/CODE` | — |
| `JWT_SECRET` | signature des jetons. **Obligatoire en production** | — |
| `DB_PATH` | fichier SQLite | `/data/zapzap.db` |
| `BOT_DELAY_MS` | délai avant qu'un robot ne joue | `800` |
| `TURN_TIMEOUT_MS` | avant qu'un tour ne se joue tout seul (temps réel) | `45000` |

Le serveur **refuse de démarrer en production sans `JWT_SECRET`** : un secret par
défaut laisserait n'importe qui se forger une identité.

## Sauvegarde

Toute la base tient dans le volume `zapzap-data` :

```bash
docker run --rm -v zapzap-data:/data -v "$PWD":/out alpine \
  tar czf /out/zapzap-$(date +%F).tar.gz -C /data .
```

## En cas de souci

| Symptôme | Piste |
| --- | --- |
| `502 Bad Gateway` | le conteneur n'est pas démarré : `docker compose logs` |
| Les coups mettent une seconde | les en-têtes `Upgrade`/`Connection` manquent dans nginx, la connexion est retombée en polling |
| « Session expirée » pour tout le monde | le `JWT_SECRET` a changé |
| Le port est pris | `PORT=3211 bash deploy/install.sh` |
