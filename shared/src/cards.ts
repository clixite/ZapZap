import type { Card, CardId, Rank, Suit } from './types';

/**
 * Le paquet de ZapZap.
 *
 * Deux différences avec un paquet de jeu de plis, et elles comptent :
 *
 *  - l'As vaut 1 et se range **en bas** — A-2-3 est une suite, D-R-A n'en est pas
 *    une. Le rang est donc 1→13 et non 2→14 : il n'y a pas de « As fort » à
 *    représenter, donc pas de rang 14 ;
 *  - le joker existe. Il ne remplace aucune carte dans une suite, ne se pose que
 *    seul ou par paire de jokers, et vaut 0 point. On lui donne la couleur
 *    fictive `X` et deux rangs distincts (0 et 1) pour que les deux jokers d'un
 *    même paquet gardent des identifiants différents.
 */

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const JOKER_SUIT = 'X' as const;

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const JOKER_COUNT = 2;

export function isJoker(card: Card): boolean {
  return card.suit === JOKER_SUIT;
}

/**
 * Valeur d'une carte pour le décompte de fin de manche.
 * As 1, 2→10 faciale, Valet/Dame/Roi 10, joker 0.
 *
 * Cette valeur n'a aucune influence sur ce qu'on peut poser : c'est le rang qui
 * détermine les combinaisons. Un Roi et une Dame valent tous deux 10 points mais
 * ne forment pas une paire.
 */
export function cardValue(card: Card): number {
  if (isJoker(card)) return 0;
  return card.rank >= 11 ? 10 : card.rank;
}

export function handValue(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

/** Identifiant compact et stable, ex. `S13` = roi de pique, `X0` = premier joker. */
export function cardId(card: Card): CardId {
  return `${card.suit}${card.rank}`;
}

export function cardFromId(id: CardId): Card {
  const suit = id[0] as Suit;
  const rank = Number(id.slice(1)) as Rank;
  return { suit, rank };
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function fullDeck(withJokers: boolean): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  if (withJokers) {
    for (let i = 0; i < JOKER_COUNT; i++) deck.push({ suit: JOKER_SUIT, rank: i as Rank });
  }
  return deck;
}

/* ------------------------------------------------------------------ */
/* Aléatoire reproductible                                             */
/* ------------------------------------------------------------------ */

/**
 * Générateur déterministe : à graine égale, distribution égale.
 *
 * Ce n'est pas un détail de test. Le serveur redémarre, les parties en cours
 * sont ressuscitées depuis SQLite ; sans distribution reproductible il faudrait
 * persister chaque main à chaque coup.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Battage de Fisher-Yates, sur une copie. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, D: 2, C: 3, [JOKER_SUIT]: 4 };

/**
 * Les deux façons de tenir sa main — et pourquoi il en faut deux.
 *
 * ZapZap a **deux familles de combinaison qui se lisent dans des tris
 * opposés** :
 *
 *  - une **suite** est faite de cartes de même couleur qui se suivent : elle ne
 *    saute aux yeux que si la main est triée par couleur ;
 *  - un **ensemble** est fait de cartes de même rang, forcément de couleurs
 *    différentes : il ne saute aux yeux que si la main est triée par rang.
 *
 * Un seul tri en cache donc systématiquement la moitié. Trié par couleur —
 * l'ordre que le moteur applique — une paire de 7 se retrouve aux deux bouts de
 * l'éventail, et le joueur doit balayer sa main carte par carte pour la voir.
 * Or repérer ses combinaisons *est* le jeu.
 *
 * Sur une table réelle, la question ne se pose pas : on tient ses cartes et on
 * les réarrange sans y penser, dans un sens puis dans l'autre. La version
 * numérique, en figeant l'ordre, était donc **moins jouable que le carton**.
 * Ces deux tris rendent ce geste.
 *
 * Dans les deux cas les jokers finissent à droite, où l'œil les retrouve sans
 * les confondre avec une figure.
 */
export type HandSort = 'suit' | 'rank';

/** Par couleur puis rang croissant : les suites se lisent d'un coup. */
export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return s !== 0 ? s : a.rank - b.rank;
  });
}

/**
 * Par rang puis couleur : les ensembles se lisent d'un coup.
 *
 * Les jokers restent au bout plutôt qu'en tête malgré leur rang nul : ils
 * valent 0 point et ne forment un ensemble qu'entre eux, les ranger parmi les
 * as n'aiderait personne.
 */
export function sortHandByRank(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const aJoker = a.suit === JOKER_SUIT;
    const bJoker = b.suit === JOKER_SUIT;
    if (aJoker !== bJoker) return aJoker ? 1 : -1;
    const r = a.rank - b.rank;
    return r !== 0 ? r : SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

/** Le tri demandé, appliqué. */
export function sortHandBy(cards: readonly Card[], order: HandSort): Card[] {
  return order === 'rank' ? sortHandByRank(cards) : sortHand(cards);
}
