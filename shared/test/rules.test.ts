import { describe, expect, it } from 'vitest';
import {
  DEAL_MAX,
  DEAL_MIN,
  DEFAULT_VARIANTS,
  ELIMINATION_SCORE,
  MISS_PENALTY,
  applyRebound,
  canCallZap,
  comboOptions,
  dealFits,
  isDealChoice,
  isEliminated,
  isZapVariants,
  nextTotal,
  resolveZap,
} from '../src/rules';
import type { Card } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('bornes de la donne', () => {
  it('accepte 3 à 7, refuse le reste', () => {
    expect(isDealChoice(DEAL_MIN)).toBe(true);
    expect(isDealChoice(DEAL_MAX)).toBe(true);
    expect(isDealChoice(2)).toBe(false);
    expect(isDealChoice(8)).toBe(false);
    expect(isDealChoice(4.5)).toBe(false);
    expect(isDealChoice('5')).toBe(false);
  });

  it('vérifie que la donne tient dans le paquet, carte retournée comprise', () => {
    // Six joueurs à sept cartes : 42 servies + 1 retournée, il reste 9 cartes.
    expect(dealFits(6, 7, 52)).toBe(true);
    expect(dealFits(2, 3, 52)).toBe(true);
    // La borne haute du jeu (7) tient toujours ; le garde-fou ne sert que si
    // l'on venait un jour à élargir la plage ou à rétrécir le paquet.
    expect(dealFits(6, 9, 52)).toBe(false);
    expect(dealFits(8, 7, 52)).toBe(false);
  });
});

describe('conditions d’annonce', () => {
  it('autorise l’annonce au seuil exact', () => {
    expect(canCallZap([c('S', 5)], 5)).toBe(true);
    expect(canCallZap([c('S', 2), c('H', 3)], 5)).toBe(true);
  });

  it('refuse l’annonce au-dessus du seuil', () => {
    expect(canCallZap([c('S', 6)], 5)).toBe(false);
  });

  it('suit le seuil relevé de la variante', () => {
    expect(canCallZap([c('S', 7)], 5)).toBe(false);
    expect(canCallZap([c('S', 7)], 7)).toBe(true);
  });

  it('autorise toujours une main vide', () => {
    expect(canCallZap([], 5)).toBe(true);
  });
});

describe('résolution de l’annonce', () => {
  it('réussie : l’annonceur marque 0, chacun marque sa main', () => {
    const r = resolveZap(
      {
        alice: [c('S', 3)],
        bob: [c('H', 10), c('D', 4)],
        chloe: [c('C', 13)],
      },
      'alice',
    );
    expect(r.success).toBe(true);
    expect(r.callerValue).toBe(3);
    expect(r.scores).toEqual({ alice: 0, bob: 14, chloe: 10 });
  });

  it('ratée : l’annonceur prend 30, le contre-attaquant marque 0', () => {
    const r = resolveZap(
      {
        alice: [c('S', 5)],
        bob: [c('H', 2)],
        chloe: [c('C', 13)],
      },
      'alice',
    );
    expect(r.success).toBe(false);
    expect(r.beatenBy).toEqual(['bob']);
    expect(r.scores).toEqual({ alice: MISS_PENALTY, bob: 0, chloe: 10 });
  });

  it('l’égalité profite au contre-attaquant, jamais à l’annonceur', () => {
    const r = resolveZap({ alice: [c('S', 5)], bob: [c('H', 5)] }, 'alice');
    expect(r.success).toBe(false);
    expect(r.beatenBy).toEqual(['bob']);
    expect(r.scores.alice).toBe(MISS_PENALTY);
    expect(r.scores.bob).toBe(0);
  });

  it('la pénalité reste de 30 quel que soit le nombre de contres', () => {
    // La variante « 30 par contre-attaquant » n'est pas retenue : à quatre
    // joueurs elle rendrait toute annonce suicidaire.
    const r = resolveZap(
      {
        alice: [c('S', 5)],
        bob: [c('H', 1)],
        chloe: [c('D', 2)],
        david: [c('C', 3)],
      },
      'alice',
    );
    expect(r.beatenBy).toHaveLength(3);
    expect(r.scores.alice).toBe(30);
  });

  it('gère une main vide chez l’annonceur', () => {
    const r = resolveZap({ alice: [], bob: [c('H', 4)] }, 'alice');
    expect(r.success).toBe(true);
    expect(r.scores).toEqual({ alice: 0, bob: 4 });
  });

  it('à deux joueurs, l’adversaire à égalité l’emporte', () => {
    const r = resolveZap({ alice: [c('S', 1)], bob: [c('H', 1)] }, 'alice');
    expect(r.scores).toEqual({ alice: 30, bob: 0 });
  });
});

describe('rebond', () => {
  it('ramène 50 à 25 et 100 à 50', () => {
    expect(applyRebound(50, true)).toBe(25);
    expect(applyRebound(100, true)).toBe(50);
  });

  it('ne touche à rien d’autre — le rebond veut le compte exact', () => {
    expect(applyRebound(49, true)).toBe(49);
    expect(applyRebound(51, true)).toBe(51);
    expect(applyRebound(99, true)).toBe(99);
    expect(applyRebound(101, true)).toBe(101);
    expect(applyRebound(0, true)).toBe(0);
  });

  it('se désactive avec la variante', () => {
    expect(applyRebound(50, false)).toBe(50);
    expect(applyRebound(100, false)).toBe(100);
  });

  it('s’applique au cumul, pas au score de manche', () => {
    // 46 + 4 = 50 pile : le joueur redescend à 25 au lieu de frôler la sortie.
    expect(nextTotal(46, 4, DEFAULT_VARIANTS)).toBe(25);
    expect(nextTotal(46, 5, DEFAULT_VARIANTS)).toBe(51);
  });

  it('sauve de l’élimination quand le total tombe pile sur 100', () => {
    const total = nextTotal(70, 30, DEFAULT_VARIANTS);
    expect(total).toBe(50);
    expect(isEliminated(total)).toBe(false);
  });

  it('n’empêche pas l’élimination au-delà de 100', () => {
    const total = nextTotal(71, 30, DEFAULT_VARIANTS);
    expect(total).toBe(101);
    expect(isEliminated(total)).toBe(true);
  });
});

describe('élimination', () => {
  it('sort à partir de 100 exactement, rebond désactivé', () => {
    expect(isEliminated(ELIMINATION_SCORE - 1)).toBe(false);
    expect(isEliminated(ELIMINATION_SCORE)).toBe(true);
    expect(isEliminated(ELIMINATION_SCORE + 40)).toBe(true);
  });
});

describe('réglages de table', () => {
  it('valide les réglages par défaut', () => {
    expect(isZapVariants(DEFAULT_VARIANTS)).toBe(true);
  });

  it('refuse un seuil ou une longueur de suite hors liste', () => {
    expect(isZapVariants({ ...DEFAULT_VARIANTS, zapThreshold: 6 })).toBe(false);
    expect(isZapVariants({ ...DEFAULT_VARIANTS, minRun: 4 })).toBe(false);
    expect(isZapVariants({ ...DEFAULT_VARIANTS, rebound: 'oui' })).toBe(false);
    expect(isZapVariants(null)).toBe(false);
    expect(isZapVariants('classic')).toBe(false);
  });

  it('reporte les variantes sur les options de combinaison', () => {
    expect(comboOptions(DEFAULT_VARIANTS)).toEqual({ minRun: 3, sameSuitRuns: true });
    expect(comboOptions({ ...DEFAULT_VARIANTS, minRun: 2, sameSuitRuns: false })).toEqual({
      minRun: 2,
      sameSuitRuns: false,
    });
  });

  it('part des règles de référence par défaut', () => {
    expect(DEFAULT_VARIANTS.zapThreshold).toBe(5);
    expect(DEFAULT_VARIANTS.rebound).toBe(true);
    expect(DEFAULT_VARIANTS.jokers).toBe(false);
  });
});
