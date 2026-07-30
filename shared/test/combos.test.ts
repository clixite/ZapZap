import { describe, expect, it } from 'vitest';
import { JOKER_SUIT, cardId } from '../src/cards';
import { DEFAULT_COMBO_OPTIONS, classify, findCombos, isLegalCombo, pickableFrom } from '../src/combos';
import type { Card, Combo } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const J0 = c(JOKER_SUIT, 0);
const J1 = c(JOKER_SUIT, 1);

const ANY_SUIT = { minRun: 3, sameSuitRuns: false } as const;
const SHORT_RUN = { minRun: 2, sameSuitRuns: true } as const;

describe('classification d’une pose', () => {
  it('accepte une carte seule', () => {
    expect(classify([c('S', 7)])).toBe('single');
  });

  it('accepte paire, brelan et carré', () => {
    expect(classify([c('S', 7), c('H', 7)])).toBe('set');
    expect(classify([c('S', 7), c('H', 7), c('D', 7)])).toBe('set');
    expect(classify([c('S', 7), c('H', 7), c('D', 7), c('C', 7)])).toBe('set');
  });

  it('refuse deux cartes de même valeur mais de rangs différents', () => {
    // Roi et Dame valent 10 tous les deux ; ce n'est pas une paire pour autant.
    expect(classify([c('S', 13), c('H', 12)])).toBeNull();
  });

  it('accepte une suite de trois cartes de même couleur', () => {
    expect(classify([c('S', 4), c('S', 5), c('S', 6)])).toBe('run');
  });

  it('accepte A-2-3 : l’As est bas', () => {
    expect(classify([c('H', 1), c('H', 2), c('H', 3)])).toBe('run');
  });

  it('refuse D-R-A : l’As ne boucle pas', () => {
    expect(classify([c('H', 12), c('H', 13), c('H', 1)])).toBeNull();
  });

  it('refuse une suite trouée', () => {
    expect(classify([c('S', 4), c('S', 5), c('S', 7)])).toBeNull();
  });

  it('refuse une suite de deux cartes par défaut, l’accepte en variante', () => {
    const pair = [c('S', 4), c('S', 5)];
    expect(classify(pair)).toBeNull();
    expect(classify(pair, SHORT_RUN)).toBe('run');
  });

  it('refuse une suite bicolore par défaut, l’accepte en variante', () => {
    const mixed = [c('S', 4), c('H', 5), c('S', 6)];
    expect(classify(mixed)).toBeNull();
    expect(classify(mixed, ANY_SUIT)).toBe('run');
  });

  it('accepte le joker seul et la paire de jokers', () => {
    expect(classify([J0])).toBe('single');
    expect(classify([J0, J1])).toBe('set');
  });

  it('refuse un joker mêlé à une vraie carte', () => {
    // Le joker ne remplace aucune carte dans une suite, ni dans un ensemble.
    expect(classify([J0, c('S', 7)])).toBeNull();
    expect(classify([c('S', 4), J0, c('S', 6)])).toBeNull();
    expect(classify([c('S', 7), c('H', 7), J0])).toBeNull();
  });

  it('refuse une pose vide', () => {
    expect(classify([])).toBeNull();
  });
});

describe('légalité d’une pose', () => {
  const hand = [c('S', 4), c('S', 5), c('S', 6), c('H', 4)];

  it('accepte une combinaison tirée de la main', () => {
    expect(isLegalCombo(hand, [c('S', 4), c('S', 5), c('S', 6)])).toBe(true);
    expect(isLegalCombo(hand, [c('S', 4), c('H', 4)])).toBe(true);
  });

  it('refuse une carte absente de la main', () => {
    expect(isLegalCombo(hand, [c('D', 9)])).toBe(false);
  });

  it('refuse de jouer deux fois la même carte', () => {
    expect(isLegalCombo(hand, [c('S', 4), c('S', 4)])).toBe(false);
  });

  it('refuse une pose vide', () => {
    expect(isLegalCombo(hand, [])).toBe(false);
  });
});

describe('énumération des combinaisons', () => {
  it('propose toujours chaque carte seule', () => {
    const hand = [c('S', 4), c('H', 9), c('D', 13)];
    const singles = findCombos(hand).filter((x) => x.kind === 'single');
    expect(singles).toHaveLength(3);
  });

  it('propose paire, brelan et les trois paires d’un brelan', () => {
    const hand = [c('S', 7), c('H', 7), c('D', 7)];
    const sets = findCombos(hand).filter((x) => x.kind === 'set');
    // 3 paires + 1 brelan
    expect(sets).toHaveLength(4);
    expect(sets.filter((s) => s.cards.length === 3)).toHaveLength(1);
  });

  it('propose les sous-suites d’une longue suite', () => {
    const hand = [c('S', 4), c('S', 5), c('S', 6), c('S', 7)];
    const runs = findCombos(hand).filter((x) => x.kind === 'run');
    // 4-5-6, 5-6-7, 4-5-6-7
    expect(runs).toHaveLength(3);
  });

  it('ne propose pas de suite plus courte que le minimum', () => {
    const hand = [c('S', 4), c('S', 5)];
    expect(findCombos(hand).filter((x) => x.kind === 'run')).toHaveLength(0);
    expect(findCombos(hand, SHORT_RUN).filter((x) => x.kind === 'run')).toHaveLength(1);
  });

  it('ne met jamais de joker dans une suite', () => {
    const hand = [c('S', 4), J0, c('S', 6)];
    expect(findCombos(hand).filter((x) => x.kind === 'run')).toHaveLength(0);
  });

  it('groupe les jokers entre eux et jamais avec un As', () => {
    const hand = [J0, J1, c('S', 1)];
    const sets = findCombos(hand).filter((x) => x.kind === 'set');
    expect(sets).toHaveLength(1);
    expect(sets[0].cards.every((card) => card.suit === JOKER_SUIT)).toBe(true);
  });

  it('ne renvoie que des combinaisons effectivement légales', () => {
    const hand = [c('S', 4), c('S', 5), c('S', 6), c('H', 6), c('D', 6), J0];
    for (const combo of findCombos(hand)) {
      expect(isLegalCombo(hand, combo.cards)).toBe(true);
      expect(classify(combo.cards)).toBe(combo.kind);
    }
  });

  it('reste raisonnable sur la plus grosse main possible', () => {
    // Sept cartes est le maximum distribuable ; la main peut ensuite grossir un
    // peu si le joueur pose seul et repioche. L'énumération doit rester courte.
    const hand = [
      c('S', 2), c('S', 3), c('S', 4), c('S', 5), c('S', 6), c('S', 7), c('S', 8),
      c('H', 2), c('H', 3),
    ];
    expect(findCombos(hand).length).toBeLessThan(80);
  });
});

describe('ce qu’on peut reprendre dans une défausse', () => {
  const run: Combo = { kind: 'run', cards: [c('S', 4), c('S', 5), c('S', 6)] };

  it('ne laisse prendre que la tête ou la queue d’une suite', () => {
    const ids = pickableFrom(run).map(cardId);
    expect(ids).toContain(cardId(c('S', 4)));
    expect(ids).toContain(cardId(c('S', 6)));
    expect(ids).not.toContain(cardId(c('S', 5)));
  });

  it('laisse prendre n’importe quelle carte d’un ensemble', () => {
    const set: Combo = { kind: 'set', cards: [c('S', 7), c('H', 7), c('D', 7)] };
    expect(pickableFrom(set)).toHaveLength(3);
  });

  it('laisse prendre la carte d’une pose simple', () => {
    expect(pickableFrom({ kind: 'single', cards: [c('S', 7)] })).toHaveLength(1);
  });

  it('ne propose qu’une carte si la suite a été réduite à une seule', () => {
    const stub: Combo = { kind: 'run', cards: [c('S', 5)] };
    expect(pickableFrom(stub)).toHaveLength(1);
  });

  it('respecte les options par défaut du jeu', () => {
    expect(DEFAULT_COMBO_OPTIONS).toEqual({ minRun: 3, sameSuitRuns: true });
  });
});
