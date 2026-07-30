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

/**
 * Tri de la main.
 *
 * Contrairement à un jeu de plis, où on trie par couleur pour repérer ce qu'on
 * peut fournir, ici on trie pour faire **sauter les combinaisons aux yeux** :
 * couleur puis rang croissant met les suites côte à côte, et les cartes de même
 * rang restent voisines à une couleur près. Les jokers finissent à droite, où
 * l'œil les retrouve sans les confondre avec une figure.
 */
export function sortHand(cards: readonly Card[]): Card[] {
  const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3, [JOKER_SUIT]: 4 };
  return [...cards].sort((a, b) => {
    const s = suitOrder[a.suit] - suitOrder[b.suit];
    return s !== 0 ? s : a.rank - b.rank;
  });
}
