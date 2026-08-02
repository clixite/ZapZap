import { cardId, sortHand } from './cards';
import type { Card, RoundEvent } from './types';

/**
 * Ce que la table a vu passer — la compétence centrale du jeu, rendue lisible.
 *
 * Le règlement le dit (§9.3) et le jeu le confirme à chaque manche : *compter*
 * est ce qui sépare un bon joueur d'un joueur ordinaire. Savoir que les trois
 * autres 7 sont tombés change tout — la paire qu'on gardait ne se complétera
 * jamais, et il faut la lâcher.
 *
 * Sur une table réelle, cette compétence repose sur la mémoire et sur
 * l'attention. Ici, le journal public de la manche contient déjà l'information
 * **en entier**. Ne pas l'exploiter, c'était réserver le jeu à ceux qui notent
 * sur un papier à côté — et un joueur qui note gagne contre un joueur qui ne
 * note pas, ce qui n'est pas le jeu qu'on veut.
 *
 * L'écran précédent affichait ce journal tel quel, à l'endroit, événement par
 * événement. C'est une archive, pas un outil : pour savoir combien de 7 sont
 * tombés, il fallait faire défiler et compter de tête — exactement l'effort
 * qu'on prétendait épargner.
 *
 * ## Deux informations, et rien qui ne soit public
 *
 * Tout ce qui est calculé ici est **déjà connu de toute la table** : ce qu'on a
 * posé face visible, et ce qu'on a repris dans la défausse sous les yeux des
 * autres. Aucune main n'est lue, aucune pioche à l'aveugle n'est devinée. Un
 * joueur très attentif arriverait aux mêmes conclusions ; on lui épargne la
 * tenue de comptes, pas le raisonnement.
 *
 *  - **`dead`** — les cartes qui dorment dans la défausse, hors d'atteinte.
 *    Elles ne reviendront pas dans une main de cette manche, sauf remélange ;
 *  - **`held`** — les cartes qu'on a vu quelqu'un *ramasser* et qu'il n'a pas
 *    reposées depuis. Celles-là, on sait qui les a. C'est le prix que paie un
 *    joueur qui préfère la défausse au talon, et c'est pour cette raison que
 *    piocher à l'aveugle est le coup par défaut.
 */
export interface RoundMemory {
  /** Dans la défausse, plus ramassables — sauf la dernière pose, encore en jeu. */
  dead: Card[];
  /** Ce que l'on sait de la main de chacun, faute qu'il l'ait cachée. */
  held: Record<string, Card[]>;
  /** La pioche a-t-elle été remélangée ? Les comptes repartent alors de zéro. */
  reshuffled: boolean;
}

/**
 * Rejoue le journal et en tire ce que la table sait.
 *
 * La subtilité est la **dernière pose** : elle est sur la défausse, donc visible
 * de tous, mais elle est encore ramassable par le joueur suivant. La compter
 * parmi les cartes mortes serait faux — c'est précisément la seule que
 * quelqu'un peut encore récupérer. Elle est donc exclue, ce qui explique le
 * suivi de `pending` ci-dessous.
 */
export function readRoundMemory(log: readonly RoundEvent[]): RoundMemory {
  let dead: Card[] = [];
  let held: Record<string, Card[]> = {};
  let reshuffled = false;
  /** La pose du tour précédent : sur la table, mais encore à prendre. */
  let live: Card[] = [];

  for (const event of log) {
    switch (event.type) {
      case 'deal':
        // La carte retournée ouvre la défausse : elle appartient à personne et
        // le premier joueur peut la prendre. Elle est donc « en jeu ».
        live = [event.upCard];
        break;

      case 'discard': {
        // Ce qui était ramassable ne l'est plus : ça rejoint le tas mort.
        dead = dead.concat(live);
        live = [...event.combo.cards];
        // Poser une carte qu'on nous avait vu ramasser, c'est la rendre.
        const known = held[event.playerId];
        if (known) {
          const posed = new Set(event.combo.cards.map(cardId));
          held[event.playerId] = known.filter((c) => !posed.has(cardId(c)));
        }
        break;
      }

      case 'draw-discard': {
        // Reprise dans la défausse : tout le monde a vu quelle carte, et chez
        // qui elle part.
        const taken = cardId(event.card);
        live = live.filter((c) => cardId(c) !== taken);
        dead = dead.filter((c) => cardId(c) !== taken);
        held[event.playerId] = [...(held[event.playerId] ?? []), event.card];
        break;
      }

      case 'reshuffle':
        /*
         * La défausse retourne au talon : les comptes repartent.
         *
         * C'est le seul moment de la manche où l'information se périme d'un
         * coup, et c'est exactement pourquoi il faut le dire. Un joueur qui
         * continuerait de compter sur « les trois 7 sont tombés » jouerait sur
         * une certitude devenue fausse — le pire des états.
         *
         * Ce que l'on sait des mains, en revanche, reste vrai : ces cartes-là
         * sont chez quelqu'un, pas dans le tas remélangé.
         */
        dead = [];
        reshuffled = true;
        break;

      default:
        break;
    }
  }

  // Trié comme une main : c'est fait pour être lu, pas pour être parcouru.
  const heldSorted: Record<string, Card[]> = {};
  for (const [playerId, cards] of Object.entries(held)) {
    if (cards.length > 0) heldSorted[playerId] = sortHand(cards);
  }

  return { dead: sortHand(dead), held: heldSorted, reshuffled };
}

/**
 * Combien d'exemplaires de chaque rang sont tombés.
 *
 * C'est la forme sous laquelle un joueur se pose vraiment la question : « il en
 * reste combien ? ». Quatre cartes par rang dans un paquet ordinaire, donc
 * `4 - tombées` dit ce qui court encore — entre les mains, le talon, et la
 * défausse encore ramassable.
 */
export function deadByRank(dead: readonly Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of dead) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}
