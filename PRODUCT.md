# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ZapZap se joue dans trois situations, toutes confirmées par le porteur du projet,
et aucune n'est secondaire :

1. **À distance, chacun chez soi.** Le mode principal. Les joueurs ne se voient
   pas. Rendre les autres présents — qui joue, qui hésite, qui s'est absenté —
   est le travail de l'interface, pas un ornement. C'est là que le mode
   asynchrone et les notifications prennent leur sens.
2. **Même pièce, chacun sur son téléphone.** Soirée entre amis, table de
   famille. Le joueur lève les yeux de son écran plus qu'il ne le fixe : l'état
   de la partie doit se relire en une seconde après une conversation, sans
   relecture.
3. **Seul contre des robots.** Apprendre le jeu, occuper cinq minutes. Le rythme
   doit être plus serré qu'à plusieurs, sans temps mort d'attente.

Public visé : **le cercle proche d'abord, le grand public ensuite**, dans cet
ordre. Les décisions se prennent en gardant la porte du grand public ouverte
sans en payer immédiatement le coût.

## Product Purpose

Faire jouer à ZapZap — un jeu de défausse de tradition orale, joué en famille —
des gens qui ne sont pas dans la même pièce, sans qu'aucun d'eux n'ait à
arbitrer les règles.

Le succès se mesure à une chose : une partie commencée va jusqu'au bout. Pas au
temps passé dans l'application. Une partie de ZapZap dure une dizaine de manches
et se termine ; c'est un jeu qu'on quitte, pas un jeu qui retient.

## Positioning

Trois choses qu'un jeu de cartes voisin ne pourrait pas reprendre telles quelles :

- **La donne est une décision, pas un réglage.** À chaque manche, le donneur
  choisit librement combien de cartes distribuer, entre 3 et 7, pour toute la
  table et lui compris. Manche courte quand il mène pour figer les scores,
  manche longue quand il est distancé pour se refaire. La donne tourne, donc
  chacun exerce ce pouvoir à son tour. C'est la signature du jeu.
- **L'annonce est un pari public.** Descendre sous le seuil et annoncer : si
  personne n'est aussi bas, l'annonceur marque zéro. Si quelqu'un l'égale — même
  à égalité stricte — il prend 30 points fixes et le contre-attaquant marque
  zéro. Le jeu se gagne en lisant les autres, pas en accumulant.
- **La mémoire de la défausse est la compétence du jeu.** Tout ce qui est passé
  est de l'information publique. L'application l'assume : elle donne l'outil de
  comptage au lieu de le laisser aux bons souvenirs de chacun.

## Operating Context

- Téléphone tenu à une main, en portrait, souvent en mode installé plein écran
  sans barre de navigation. L'encoche et la barre d'accueil sont des contraintes
  permanentes, pas des cas limites.
- Une partie se rejoint par un lien ou un code à quatre caractères. Aucun compte
  n'est requis pour jouer ; la connexion par lien magique ne sert qu'à retrouver
  son historique et ses groupes.
- Réseau mobile réel : coupures, arrière-plan, téléphone verrouillé au milieu
  d'un tour. Un joueur absent est remplacé par un robot plutôt que de bloquer la
  table.
- Le serveur arbitre tout. Le client ne connaît jamais les mains adverses.

## Capabilities and Constraints

- 2 à 6 joueurs. Robots ajoutables pour compléter une table.
- Un tour = deux actions ordonnées : défausser, puis piocher exactement une
  carte. L'interface doit rendre cette séquence évidente sans texte.
- **Fin de partie, règle absolue :** dès qu'un joueur dépasse 100 points, la
  partie s'arrête pour tout le monde et on en relance une. Ce n'est pas un
  réglage.
- Réglages de l'hôte : seuil d'annonce 5 ou 7, suites même couleur ou toutes
  couleurs, suite minimale 2 ou 3, rebond, jokers, rythme direct ou asynchrone,
  visibilité de la table.
- Progressive web app installable. Mise à jour automatique à chaque ouverture.
- 13 langues livrées (fr, nl, en, de, es, it, pt, pl, ro, cs, da, fi, sv), 11
  langues de l'Union européenne restant à faire. Le catalogue français est le
  contrat de typage : une clé manquante est une erreur de compilation.
- Le français est la langue de référence du produit et des commentaires de code.
- Version en production : 0.8.0, sur `zapzap.clixite-prod.cloud`.

## Brand Commitments

- Nom : **ZapZap**. Éditeur : Clixite SRL, Belgique.
- Identité visuelle « orage électrique » : indigo profond, éclair cyan, ambre
  foudre, typographie arrondie. **Confirmée comme acquise :** le travail en
  cours l'affûte, il ne la remplace pas.
- Préfixe `zz-` pour les classes et animations propres au projet.

## Evidence on Hand

- `store/icon-1024.png` — la seule ressource graphique fournie.
- Aucun témoignage, aucun chiffre d'usage, aucune donnée d'audience. Un retour
  d'une testeuse est attendu mais n'a pas encore été transmis : rien ne doit être
  écrit en son nom.
- Aucune tarification, aucun engagement de disponibilité. Le jeu est gratuit et
  sans publicité ; ce n'est pas une promesse commerciale publiée mais l'état de
  fait actuel.

## Product Principles

1. **La table avant le châssis.** L'écran de jeu est le produit. Tout le reste —
   accueil, salon, profil, historique — existe pour y amener et n'a droit qu'à
   la place qu'il mérite.
2. **Se relire en une seconde.** Le joueur revient d'une conversation ou d'une
   notification. À qui de jouer, où j'en suis, ce que je peux faire : trois
   réponses avant toute lecture.
3. **Une partie ne s'arrête jamais à cause d'un joueur.** Absence, coupure,
   verrouillage, départ : la table continue. Personne n'attend un fantôme.
4. **L'information publique est publique pour de bon.** Ce qui est passé sous
   les yeux de tous reste consultable. Compter de tête est un plaisir, pas une
   épreuve de mémoire imposée.
5. **Aucun coup illégal proposé.** L'interface ne montre jamais une action que
   le serveur refuserait. Les pénalités de maladresse du jeu de table n'ont pas
   de sens ici.

## Accessibility & Inclusion

- Cibles tactiles d'au moins 44 px, atteignables au pouce sur un grand téléphone.
- Mode daltonien à quatre couleurs pour les enseignes.
- `prefers-reduced-motion` et `prefers-contrast: more` respectés.
- Contraste AA vérifié sur chaque paire texte/fond.
- Annonces vocales des événements de partie pour les lecteurs d'écran.
