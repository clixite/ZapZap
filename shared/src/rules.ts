import { handValue } from './cards';
import type { ComboOptions } from './combos';
import type { Card } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Bornes de la donne : le donneur choisit dans cette plage, pour toute la table. */
export const DEAL_MIN = 3;
export const DEAL_MAX = 7;
export const DEAL_CHOICES: readonly number[] = [3, 4, 5, 6, 7];

/**
 * Pénalité d'une annonce ratée : 30 points, fixes.
 *
 * La variante « 30 par contre-attaquant » figure dans les règles maison mais
 * n'est pas retenue : à quatre joueurs ou plus, le risque devient tel que plus
 * personne n'annonce, et une partie de ZapZap où personne n'annonce n'est plus
 * une partie de ZapZap. 30 points, c'est déjà trois figures en main — la
 * sanction se sent sans éteindre le jeu.
 */
export const MISS_PENALTY = 30;

export const ELIMINATION_SCORE = 100;

/**
 * Nombre de tours par joueur au-delà duquel la manche est déclarée nulle.
 *
 * Une manche ne s'achève que sur une annonce, et rien dans les règles ne
 * garantit qu'une annonce devienne possible. On repioche toujours exactement
 * une carte : une main sans combinaison ne rétrécit donc jamais, et une table
 * où chacun détient une carte basse sans pouvoir l'apparier reste bloquée
 * indéfiniment. Le cas s'observe entre robots, et rien n'empêche quatre humains
 * d'y tomber — ni un joueur de bloquer sciemment une table.
 *
 * Un serveur qui arbitre ne peut pas se permettre une partie qui ne finit
 * jamais. Passé cette borne, la manche est comptée comme si l'annonce n'avait
 * pas eu lieu : chacun marque le total de sa main, personne ne prend les 30
 * points. Trente tours par joueur, c'est près de dix fois une manche ordinaire
 * — le garde-fou ne peut se déclencher que sur un blocage réel.
 */
export const MAX_TURNS_PER_PLAYER = 30;

/* ------------------------------------------------------------------ */
/* Réglages de table                                                   */
/* ------------------------------------------------------------------ */

/**
 * Les six réglages de l'hôte.
 *
 * Tous vont dans le sens de l'assouplissement : ils servent à adapter le jeu à
 * la table — des enfants, des débutants, une partie courte — jamais à le rendre
 * plus punitif. Les valeurs par défaut sont les règles de référence.
 */
export interface ZapVariants {
  /** Total maximal en main pour pouvoir annoncer. */
  zapThreshold: 5 | 7;
  /** Longueur minimale d'une suite. */
  minRun: 2 | 3;
  /** Les suites doivent-elles être d'une seule couleur ? */
  sameSuitRuns: boolean;
  /** Rebond : score exactement à 50 → 25, exactement à 100 → 50. */
  rebound: boolean;
  /** Deux jokers dans le paquet, valant 0 point. */
  jokers: boolean;
}

/*
 * La fin de partie n'est pas une variante.
 *
 * Elle l'a été : on pouvait choisir entre « au dernier debout » — on éliminait
 * les joueurs un par un et la table continuait à trois, puis à deux — et « à la
 * première sortie ». C'est la première sortie, et rien d'autre : dès qu'un
 * joueur dépasse 100, la partie s'arrête pour tout le monde, on classe, et on
 * en relance une.
 *
 * Ce n'est pas un détail de réglage, c'est ce qui donne son rythme au jeu. À
 * quatre joueurs, « au dernier debout » demandait de continuer à jouer une
 * partie déjà décidée pendant que les sortis regardaient — la moitié de la
 * table condamnée à attendre. La partie courte garde tout le monde dedans, et
 * la revanche est immédiate.
 */

export const DEFAULT_VARIANTS: ZapVariants = {
  zapThreshold: 5,
  minRun: 3,
  sameSuitRuns: true,
  rebound: true,
  jokers: false,
};

export function isZapVariants(value: unknown): value is ZapVariants {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ZapVariants>;
  return (
    (v.zapThreshold === 5 || v.zapThreshold === 7) &&
    (v.minRun === 2 || v.minRun === 3) &&
    typeof v.sameSuitRuns === 'boolean' &&
    typeof v.rebound === 'boolean' &&
    typeof v.jokers === 'boolean'
  );
}

/** Les réglages de combinaison qui découlent des variantes de la table. */
export function comboOptions(variants: ZapVariants): ComboOptions {
  return { minRun: variants.minRun, sameSuitRuns: variants.sameSuitRuns };
}

export function isDealChoice(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= DEAL_MIN && value <= DEAL_MAX;
}

/**
 * La donne tient-elle dans le paquet ?
 *
 * À six joueurs et sept cartes, il part 42 cartes ; il en reste 10 pour la
 * pioche et la carte retournée, ce qui suffit largement — la défausse est
 * remélangée quand la pioche s'épuise. Le garde-fou existe pour que le moteur
 * ne puisse jamais distribuer plus de cartes qu'il n'en a.
 */
export function dealFits(nbPlayers: number, handSize: number, deckSize: number): boolean {
  return nbPlayers * handSize + 1 <= deckSize;
}

/* ------------------------------------------------------------------ */
/* L'annonce                                                           */
/* ------------------------------------------------------------------ */

export function canCallZap(hand: readonly Card[], threshold: number): boolean {
  return handValue(hand) <= threshold;
}

export interface ZapResolution {
  /** Total de la main de l'annonceur. */
  callerValue: number;
  /** Joueurs dont la main est inférieure OU ÉGALE à celle de l'annonceur. */
  beatenBy: string[];
  success: boolean;
  /** Points marqués par chacun sur cette manche. */
  scores: Record<string, number>;
}

/**
 * Résolution d'une annonce.
 *
 * Réussie — l'annonceur marque 0, chaque adversaire marque le total exact de sa
 * main.
 *
 * Ratée — l'annonceur prend 30, chaque joueur qui le bat **ou l'égale** marque
 * 0, les autres marquent leur main.
 *
 * L'égalité profite toujours au contre-attaquant, jamais à l'annonceur : c'est
 * ce qui fait d'une annonce à 5 pile un vrai pari plutôt qu'un calcul.
 */
export function resolveZap(
  hands: Record<string, readonly Card[]>,
  callerId: string,
): ZapResolution {
  const callerValue = handValue(hands[callerId] ?? []);
  const beatenBy = Object.keys(hands).filter((id) => id !== callerId && handValue(hands[id]) <= callerValue);
  const success = beatenBy.length === 0;

  const scores: Record<string, number> = {};
  for (const id of Object.keys(hands)) {
    if (id === callerId) {
      scores[id] = success ? 0 : MISS_PENALTY;
    } else if (!success && beatenBy.includes(id)) {
      scores[id] = 0;
    } else {
      scores[id] = handValue(hands[id]);
    }
  }

  return { callerValue, beatenBy, success, scores };
}

/* ------------------------------------------------------------------ */
/* Score cumulé                                                        */
/* ------------------------------------------------------------------ */

/**
 * Le rebond.
 *
 * Tomber pile sur 50 ramène à 25 ; tomber pile sur 100 ramène à 50 sans
 * élimination. La règle n'est pas décorative : elle relance les parties qui
 * s'enlisent, et elle transforme la fin de partie en calcul — il arrive qu'on
 * cherche à prendre exactement le nombre de points qui sauve.
 */
export function applyRebound(total: number, enabled: boolean): number {
  if (!enabled) return total;
  if (total === 50) return 25;
  if (total === 100) return 50;
  return total;
}

/** Le score total après une manche, rebond compris. */
export function nextTotal(previous: number, roundScore: number, variants: ZapVariants): number {
  return applyRebound(previous + roundScore, variants.rebound);
}

export function isEliminated(total: number): boolean {
  return total >= ELIMINATION_SCORE;
}
