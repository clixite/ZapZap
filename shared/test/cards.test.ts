import { describe, expect, it } from 'vitest';
import {
  JOKER_SUIT,
  cardFromId,
  cardId,
  cardValue,
  fullDeck,
  handValue,
  hashSeed,
  isJoker,
  mulberry32,
  shuffle,
  sortHand,
} from '../src/cards';
import type { Card } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('valeur des cartes', () => {
  it('compte l’As pour 1 et les figures pour 10', () => {
    expect(cardValue(c('S', 1))).toBe(1);
    expect(cardValue(c('H', 7))).toBe(7);
    expect(cardValue(c('D', 10))).toBe(10);
    expect(cardValue(c('C', 11))).toBe(10);
    expect(cardValue(c('S', 12))).toBe(10);
    expect(cardValue(c('H', 13))).toBe(10);
  });

  it('compte le joker pour 0', () => {
    expect(cardValue(c(JOKER_SUIT, 0))).toBe(0);
    expect(cardValue(c(JOKER_SUIT, 1))).toBe(0);
  });

  it('additionne une main', () => {
    // Trois figures : 30 points, exactement la pénalité d'une annonce ratée.
    expect(handValue([c('S', 11), c('H', 12), c('D', 13)])).toBe(30);
    expect(handValue([])).toBe(0);
  });
});

describe('identifiants', () => {
  it('fait l’aller-retour', () => {
    for (const card of fullDeck(true)) {
      expect(cardFromId(cardId(card))).toEqual(card);
    }
  });

  it('donne un identifiant distinct aux deux jokers', () => {
    const ids = fullDeck(true)
      .filter(isJoker)
      .map(cardId);
    expect(new Set(ids).size).toBe(2);
  });

  it('ne confond jamais un joker et un As', () => {
    expect(cardId(c(JOKER_SUIT, 1))).not.toBe(cardId(c('S', 1)));
  });
});

describe('paquet', () => {
  it('contient 52 cartes, 54 avec les jokers', () => {
    expect(fullDeck(false)).toHaveLength(52);
    expect(fullDeck(true)).toHaveLength(54);
  });

  it('n’a aucun doublon', () => {
    const ids = fullDeck(true).map(cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('n’a pas de rang 14 : l’As est bas', () => {
    expect(fullDeck(false).every((card) => card.rank >= 1 && card.rank <= 13)).toBe(true);
  });
});

describe('battage', () => {
  it('est reproductible à graine égale', () => {
    const a = shuffle(fullDeck(false), mulberry32(hashSeed('graine')));
    const b = shuffle(fullDeck(false), mulberry32(hashSeed('graine')));
    expect(a).toEqual(b);
  });

  it('diffère d’une graine à l’autre', () => {
    const a = shuffle(fullDeck(false), mulberry32(hashSeed('une')));
    const b = shuffle(fullDeck(false), mulberry32(hashSeed('autre')));
    expect(a).not.toEqual(b);
  });

  it('conserve toutes les cartes', () => {
    const shuffled = shuffle(fullDeck(true), mulberry32(hashSeed('x')));
    expect(new Set(shuffled.map(cardId)).size).toBe(54);
  });

  it('ne modifie pas le paquet d’origine', () => {
    const deck = fullDeck(false);
    const before = [...deck];
    shuffle(deck, mulberry32(1));
    expect(deck).toEqual(before);
  });
});

describe('tri de la main', () => {
  it('groupe par couleur puis par rang croissant', () => {
    const hand = [c('H', 5), c('S', 13), c('H', 3), c('S', 1)];
    expect(sortHand(hand)).toEqual([c('S', 1), c('S', 13), c('H', 3), c('H', 5)]);
  });

  it('renvoie les jokers à droite', () => {
    const hand = [c(JOKER_SUIT, 0), c('C', 4)];
    expect(sortHand(hand)[1]).toEqual(c(JOKER_SUIT, 0));
  });
});
