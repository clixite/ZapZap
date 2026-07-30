import { describe, expect, it } from 'vitest';
import { botMove, botProfile, chooseDiscard, chooseDraw, chooseHandSize, isBotId, readOpponents, seenCards, shouldCallZap } from '../src/bot';
import { cardId, handValue } from '../src/cards';
import { DEFAULT_COMBO_OPTIONS } from '../src/combos';
import { applyAction, createGame, type GameAction } from '../src/engine';
import { DEAL_MAX, DEAL_MIN, DEFAULT_VARIANTS } from '../src/rules';
import type { Card, Combo, GameState, RoundEvent } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

function ok(state: GameState, action: GameAction): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`Action ${action.type} refusée : ${res.error}`);
  return res.state;
}

describe('identité des robots', () => {
  it('reconnaît un identifiant de robot', () => {
    expect(isBotId(botProfile(0).id)).toBe(true);
    expect(isBotId('u_abc')).toBe(false);
  });

  it('donne un pseudo et un avatar à chacun', () => {
    const profile = botProfile(2);
    expect(profile.pseudo).toBeTruthy();
    expect(profile.avatar).toBeTruthy();
  });
});

describe('lecture du journal', () => {
  const log: RoundEvent[] = [
    { type: 'deal', dealerSeat: 0, handSize: 5, upCard: c('S', 3) },
    { type: 'discard', playerId: 'a', combo: { kind: 'run', cards: [c('H', 4), c('H', 5), c('H', 6)] } },
    { type: 'draw-stock', playerId: 'a' },
    { type: 'discard', playerId: 'b', combo: { kind: 'single', cards: [c('D', 9)] } },
    { type: 'draw-discard', playerId: 'b', card: c('H', 6) },
  ];

  it('mesure le rythme de délestage de chacun', () => {
    const reads = readOpponents(log);
    // a a lâché 3 cartes et n'en a repris qu'une : il descend vite.
    expect(reads.a.shed).toBe(2);
    // b a posé une carte et en a repris une : il fait du surplace.
    expect(reads.b.shed).toBe(0);
    expect(reads.b.picked).toBe(1);
  });

  it('retient les cartes vues de tous', () => {
    const seen = seenCards(log).map(cardId);
    expect(seen).toContain(cardId(c('S', 3)));
    expect(seen).toContain(cardId(c('H', 4)));
    expect(seen).toContain(cardId(c('D', 9)));
  });

  it('n’apprend rien d’une pioche à l’aveugle', () => {
    const seen = seenCards([{ type: 'draw-stock', playerId: 'a' }]);
    expect(seen).toHaveLength(0);
  });
});

describe('choix de la taille des mains', () => {
  function withScores(scores: Record<string, number>): GameState {
    let state = createGame('ABCD', 's', 0, { id: 'a', pseudo: 'a', avatar: '⚡' });
    state = ok(state, { type: 'ADD_PLAYER', player: { id: 'b', pseudo: 'b', avatar: '⚡' } });
    state = structuredClone(state);
    for (const p of state.players) p.totalScore = scores[p.id] ?? 0;
    return state;
  }

  it('sert court quand il mène nettement', () => {
    // Une manche courte se joue en deux tours : personne n'a le temps de
    // construire, et le meneur a plus à perdre qu'à gagner.
    expect(chooseHandSize(withScores({ a: 10, b: 60 }), 'a')).toBe(DEAL_MIN);
  });

  it('sert long quand il est distancé', () => {
    expect(chooseHandSize(withScores({ a: 60, b: 10 }), 'a')).toBe(DEAL_MAX);
  });

  it('sert moyen quand la partie est serrée', () => {
    const size = chooseHandSize(withScores({ a: 30, b: 34 }), 'a');
    expect(size).toBeGreaterThan(DEAL_MIN);
    expect(size).toBeLessThan(DEAL_MAX);
  });

  it('reste dans les bornes quoi qu’il arrive', () => {
    for (const scores of [{ a: 0, b: 0 }, { a: 99, b: 0 }, { a: 0, b: 99 }]) {
      const size = chooseHandSize(withScores(scores), 'a');
      expect(size).toBeGreaterThanOrEqual(DEAL_MIN);
      expect(size).toBeLessThanOrEqual(DEAL_MAX);
    }
  });
});

describe('choix de la défausse', () => {
  it('lâche le plus de points possible', () => {
    // Une paire de Rois vaut 20 points : la garder, c'est garder 20 points qui
    // dorment (§9.4).
    const hand = [c('S', 13), c('H', 13), c('D', 2)];
    const combo = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS);
    expect(handValue(combo.cards)).toBe(20);
  });

  it('préfère la suite payante à la carte seule', () => {
    const hand = [c('S', 9), c('S', 10), c('S', 11), c('H', 4)];
    const combo = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS);
    expect(combo.kind).toBe('run');
    expect(handValue(combo.cards)).toBe(29);
  });

  it('purge la figure quand rien ne se combine', () => {
    const hand = [c('S', 13), c('H', 4), c('D', 2)];
    const combo = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS);
    expect(combo.cards).toEqual([c('S', 13)]);
  });

  it('ne propose jamais une pose illégale', () => {
    const hand = [c('S', 4), c('S', 5), c('S', 6), c('H', 6), c('D', 13)];
    const combo = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS);
    expect(combo.cards.every((card) => hand.some((h) => cardId(h) === cardId(card)))).toBe(true);
  });

  it('sacrifie la grosse pose quand une petite met la main sous le seuil', () => {
    // As-As-As-Roi, seuil 5 : le brelan d'As rapporte plus, mais laisse dix
    // points en main. Le Roi seul laisse trois points — l'annonce est ouverte
    // au prochain tour, et ça vaut plus que n'importe quel délestage.
    const hand = [c('S', 1), c('H', 1), c('D', 1), c('C', 13)];
    const greedy = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS);
    expect(greedy.cards).toHaveLength(3); // sans seuil : le brelan, comme avant

    const aimed = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS, 5);
    expect(aimed.cards).toEqual([c('C', 13)]);
  });

  it('entre plusieurs poses qualifiantes, laisse le moins de points possible', () => {
    // 5-5 et 3 : poser le 3 laisse 10 (> 5), poser la paire laisse 3 (≤ 5).
    const hand = [c('S', 5), c('H', 5), c('D', 3)];
    const combo = chooseDiscard(hand, DEFAULT_COMBO_OPTIONS, 5);
    expect(combo.cards).toHaveLength(2);
    expect(handValue(combo.cards)).toBe(10);
  });
});

describe('choix de la pioche', () => {
  const single = (card: Card): Combo => ({ kind: 'single', cards: [card] });

  it('pioche à l’aveugle par défaut : ramasser renseigne la table', () => {
    const hand = [c('S', 2), c('H', 9)];
    expect(chooseDraw(hand, single(c('D', 12)), DEFAULT_COMBO_OPTIONS, true).source).toBe('stock');
  });

  it('ramasse une carte quasi gratuite', () => {
    const hand = [c('S', 9), c('H', 4)];
    const choice = chooseDraw(hand, single(c('D', 1)), DEFAULT_COMBO_OPTIONS, true);
    expect(choice.source).toBe('discard');
    expect(choice.card).toEqual(c('D', 1));
  });

  it('ramasse ce qui complète une combinaison payante', () => {
    const hand = [c('S', 11), c('S', 12), c('H', 2)];
    const choice = chooseDraw(hand, single(c('S', 13)), DEFAULT_COMBO_OPTIONS, true);
    expect(choice.source).toBe('discard');
    expect(choice.card).toEqual(c('S', 13));
  });

  it('se rabat sur la défausse quand la pioche est vide', () => {
    const hand = [c('S', 2)];
    const choice = chooseDraw(hand, single(c('D', 12)), DEFAULT_COMBO_OPTIONS, false);
    expect(choice.source).toBe('discard');
  });

  it('ne ramasse jamais dans une défausse inexistante', () => {
    expect(chooseDraw([c('S', 2)], null, DEFAULT_COMBO_OPTIONS, true).source).toBe('stock');
  });

  it('ramasse un joker qui traîne : la seule carte sans aucun risque', () => {
    // Une première version l'ignorait d'office — le joker restait sur la table
    // alors qu'il vaut 0 point et offre une défausse de secours.
    const hand = [c('S', 9), c('H', 4)];
    const choice = chooseDraw(hand, single(c('X', 0)), DEFAULT_COMBO_OPTIONS, true);
    expect(choice.source).toBe('discard');
    expect(choice.card).toEqual(c('X', 0));
  });

  it('ramasse le 2 qui fait la paire, même s’il rapporte peu', () => {
    // Non-régression. En évaluant les combinaisons en points seuls, le robot
    // refusait cette paire — une paire de 2 vaut moins qu'une figure isolée —
    // et gardait une main de trois cartes sans combinaison. Or on repioche
    // toujours une carte : une main sans combinaison ne rétrécit jamais. Quatre
    // robots dans cet état, se partageant les As et les 2, et la manche ne se
    // terminait plus.
    const hand = [c('S', 1), c('H', 2), c('C', 13)];
    const choice = chooseDraw(hand, single(c('D', 2)), DEFAULT_COMBO_OPTIONS, true);
    expect(choice.source).toBe('discard');
    expect(choice.card).toEqual(c('D', 2));
  });
});

describe('décision d’annonce', () => {
  const calm = [4, 5];
  const danger = [1, 3];

  it('n’annonce jamais au-dessus du seuil', () => {
    expect(shouldCallZap([c('S', 9)], DEFAULT_VARIANTS, calm)).toBe(false);
  });

  it('annonce sans hésiter très bas', () => {
    expect(shouldCallZap([c('S', 1)], DEFAULT_VARIANTS, danger)).toBe(true);
  });

  it('annonce à la limite quand la table est fournie', () => {
    expect(shouldCallZap([c('S', 5)], DEFAULT_VARIANTS, calm)).toBe(true);
  });

  it('se méfie d’un adversaire réduit à une carte', () => {
    // Une carte adverse, c'est quelques points : annoncer à 5 pile contre ça
    // est un mauvais pari, l'égalité profitant au contre-attaquant.
    expect(shouldCallZap([c('S', 5)], DEFAULT_VARIANTS, danger)).toBe(false);
  });

  it('annonce sans adversaire', () => {
    expect(shouldCallZap([c('S', 5)], DEFAULT_VARIANTS, [])).toBe(true);
  });

  it('finit toujours par annoncer quand la table se vide', () => {
    // Le garde-fou de convergence : une manche où plus personne n'annonce ne
    // se terminerait jamais. À deux cartes partout, 4 points doivent partir.
    expect(shouldCallZap([c('S', 4)], DEFAULT_VARIANTS, [2, 2, 2])).toBe(true);
  });
});

describe('partie complète entre robots', () => {
  function botGame(seed: string, nbPlayers: number): GameState {
    const ids = Array.from({ length: nbPlayers }, (_, i) => botProfile(i).id);
    let state = createGame('ABCD', seed, 0, { ...botProfile(0) });
    for (let i = 1; i < nbPlayers; i++) {
      state = ok(state, { type: 'ADD_PLAYER', player: { ...botProfile(i) } });
    }
    state = ok(state, { type: 'START_GAME', playerId: ids[0] });

    for (let step = 0; step < 4000 && state.phase !== 'game-over'; step++) {
      if (state.phase === 'round-scoring') {
        state = ok(state, { type: 'NEXT_ROUND', playerId: state.hostId });
        continue;
      }
      const round = state.round!;
      const actorSeat = state.phase === 'dealing' ? round.dealerSeat : round.currentSeat;
      const actor = state.players.find((p) => p.seat === actorSeat)!;
      const move = botMove(state, actor.id);
      if (!move) throw new Error(`Aucun coup pour ${actor.id} en phase ${state.phase}`);

      switch (move.kind) {
        case 'deal':
          state = ok(state, { type: 'DEAL', playerId: actor.id, handSize: move.handSize });
          break;
        case 'zap':
          state = ok(state, { type: 'CALL_ZAP', playerId: actor.id });
          break;
        case 'discard':
          state = ok(state, { type: 'DISCARD', playerId: actor.id, cardIds: move.cardIds });
          break;
        case 'draw':
          state = ok(state, { type: 'DRAW', playerId: actor.id, from: move.from });
          break;
      }
    }
    return state;
  }

  it('va jusqu’au bout et désigne un vainqueur', () => {
    const state = botGame('robots', 4);
    expect(state.phase).toBe('game-over');
    const winner = state.players.find((p) => p.finishRank === 1);
    expect(winner).toBeDefined();
    expect(winner!.eliminated).toBe(false);
  });

  it('converge quel que soit le nombre de joueurs', () => {
    for (const n of [2, 3, 5, 6]) {
      const state = botGame(`table-${n}`, n);
      expect(state.phase).toBe('game-over');
      expect(state.players.filter((p) => !p.eliminated)).toHaveLength(1);
    }
  });

  it('converge quelle que soit la graine', () => {
    for (const seed of ['un', 'deux', 'trois', 'quatre', 'cinq']) {
      expect(botGame(seed, 4).phase).toBe('game-over');
    }
  });

  it('ne laisse aucun robot dominer systématiquement', () => {
    // Les robots partagent la même stratégie : sur dix parties, aucun siège ne
    // doit gagner tout le temps, sinon la place à table serait décisive.
    const wins = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const state = botGame(`equite-${i}`, 4);
      const winner = state.players.find((p) => p.finishRank === 1)!;
      wins.set(winner.id, (wins.get(winner.id) ?? 0) + 1);
    }
    expect(Math.max(...wins.values())).toBeLessThan(8);
  });

  it('annonce régulièrement : une partie sans annonce serait cassée', () => {
    const state = botGame('annonces', 4);
    expect(state.round!.zapCall).not.toBeNull();
  });
});
