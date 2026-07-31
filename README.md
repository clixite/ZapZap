# ZapZap ⚡

**Le jeu de défausse entre amis, chacun sur son téléphone.**
Créez une partie, partagez un code à 4 lettres, et jouez — sans installation,
sans inscription.

🎮 **[zapzap.clixite-prod.cloud](https://zapzap.clixite-prod.cloud)**

Application web progressive (installable sur iOS et Android) adossée à un
serveur Node.js/Socket.IO qui arbitre la partie : la logique de jeu vit
entièrement côté serveur, aucun joueur ne voit la main d'un autre.

## Le jeu

Le but n'est pas de faire des levées, mais d'avoir la main la plus faible
possible pour annoncer « ZapZap » avant les autres. Le premier à 100 points est
éliminé.

- **Une donne qui se décide** — à chaque manche, le donneur choisit entre 3 et 7
  cartes, le même nombre pour toute la table. Court, c'est une course à qui
  descend le premier ; long, c'est de quoi construire et lâcher gros. La donne
  tourne, chacun exerce ce pouvoir à son tour.
- **Deux actions par tour** — on défausse une carte, un ensemble ou une suite,
  puis on repioche exactement une carte : au talon, ou dans la défausse du tour
  précédent — tête ou queue d'une suite, jamais le milieu.
- **L'annonce** — main à 5 points ou moins, en début de tour. Personne en
  dessous, vous marquez 0 et les autres comptent leur main. Quelqu'un vous égale
  ou vous bat, vous prenez 30. **L'égalité profite au contre-attaquant** : à 5
  pile, c'est un pari.
- **Le rebond** — tomber pile sur 50 ramène à 25, pile sur 100 ramène à 50 sans
  élimination. De quoi relancer les parties qui s'enlisent.

De 2 à 6 joueurs, 20 à 40 minutes.

## Structure

| Dossier | Rôle |
| --- | --- |
| `shared/` | Types et logique de jeu pure (cartes, combinaisons, règles, moteur, robots) |
| `server/` | Express + Socket.IO, authentification JWT, salons, SQLite |
| `client/` | React + Vite + Tailwind, PWA |
| `deploy/` | Dockerfile, compose, nginx, installation automatisée |
| `scripts/` | Bancs d'essai et tests de bout en bout (Playwright) |

## Développement

```bash
npm install
npm test                 # règles, combinaisons, moteur, robots
npm run dev:server       # serveur sur :3000
npm run dev:client       # client Vite sur :5173 (proxy vers :3000)
```

**Banc d'essai des robots** — des parties entières de robot contre robot, pour
vérifier que les manches se terminent, que les annonces gardent leur part de
risque, et qu'aucun siège ne gagne plus souvent qu'un autre :

```bash
npm run bench:bots
GAMES=200 PLAYERS=6 npm run bench:bots
```

**Parcours de bout en bout** — la suite Playwright est écrite comme une liste
d'histoires utilisateur : inscription, accueil, salon, invitation par code et par
lien, exclusion, deux tables ouvertes en même temps, un tour complet, reconnexion,
règles, profil, manifeste. Chaque histoire est autonome — une qui casse n'emporte
pas les suivantes, on obtient le bilan complet en une exécution.

```bash
npm run build -w client
PORT=3111 DB_PATH=:memory: JWT_SECRET=dev npx tsx server/src/index.ts &
BASE_URL=http://localhost:3111 npm run e2e
BASE_URL=http://localhost:3111 FULL_GAME=1 npm run e2e   # + la partie jusqu'à la fin
ONLY="salon" BASE_URL=http://localhost:3111 npm run e2e  # une seule histoire
```

## Production

```bash
npm run build            # client (Vite) puis serveur (esbuild → server/dist)
npm start                # sert l'API, les WebSockets et le client compilé
```

---

© 2026 **Clixite SRL** — Avenue Reine Astrid 53, 1300 Wavre, Belgique — BE 0871.430.776.
Tous droits réservés.
