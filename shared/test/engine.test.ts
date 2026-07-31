import { beforeEach, describe, expect, it } from 'vitest';
import { cardId, handValue } from '../src/cards';
import { applyAction, createGame, defaultDiscard, type GameAction } from '../src/engine';
import { DEFAULT_VARIANTS, MAX_TURNS_PER_PLAYER, MISS_PENALTY } from '../src/rules';
import type { Card, GameState } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

/** Applique une action et exige qu'elle réussisse. */
function ok(state: GameState, action: GameAction): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`Action ${action.type} refusée : ${res.error}`);
  return res.state;
}

/** Applique une action et exige qu'elle échoue avec ce code. */
function fails(state: GameState, action: GameAction, code: string): void {
  const res = applyAction(state, action);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toBe(code);
}

function lobby(playerIds: string[], seed = 'graine'): GameState {
  let state = createGame('ABCD', seed, 0, { id: playerIds[0], pseudo: playerIds[0], avatar: '⚡' });
  for (const id of playerIds.slice(1)) {
    state = ok(state, { type: 'ADD_PLAYER', player: { id, pseudo: id, avatar: '⚡' } });
  }
  return state;
}

/** Partie démarrée, donne faite, prête à jouer. */
function playing(playerIds: string[], handSize = 5, seed = 'graine'): GameState {
  let state = ok(lobby(playerIds, seed), { type: 'START_GAME', playerId: playerIds[0] });
  const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
  return ok(state, { type: 'DEAL', playerId: dealer.id, handSize });
}

function current(state: GameState): string {
  return state.players.find((p) => p.seat === state.round!.currentSeat)!.id;
}

/** Force une main précise — indispensable pour tester les cas de score. */
function setHand(state: GameState, playerId: string, hand: Card[]): GameState {
  const next = structuredClone(state);
  next.round!.hands[playerId] = hand;
  return next;
}

/** Joue un tour complet neutre : pose la première carte, pioche à l'aveugle. */
function playNeutralTurn(state: GameState): GameState {
  const me = current(state);
  const first = state.round!.hands[me][0];
  let next = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(first)] });
  return ok(next, { type: 'DRAW', playerId: me, from: { source: 'stock' } });
}

describe('salon', () => {
  it('démarre à deux joueurs, pas à un', () => {
    fails(lobby(['a']), { type: 'START_GAME', playerId: 'a' }, 'NOT_ENOUGH_PLAYERS');
    expect(ok(lobby(['a', 'b']), { type: 'START_GAME', playerId: 'a' }).phase).toBe('dealing');
  });

  it('plafonne à six joueurs', () => {
    const full = lobby(['a', 'b', 'c', 'd', 'e', 'f']);
    fails(full, { type: 'ADD_PLAYER', player: { id: 'g', pseudo: 'g', avatar: '⚡' } }, 'ROOM_FULL');
  });

  it('n’accepte les réglages que de l’hôte, et seulement au salon', () => {
    const state = lobby(['a', 'b']);
    fails(state, { type: 'SET_VARIANTS', playerId: 'b', variants: DEFAULT_VARIANTS }, 'NOT_HOST');
    const started = ok(state, { type: 'START_GAME', playerId: 'a' });
    fails(started, { type: 'SET_VARIANTS', playerId: 'a', variants: DEFAULT_VARIANTS }, 'BAD_PHASE');
  });

  it('ouvre la table au public sur demande de l’hôte', () => {
    const state = ok(lobby(['a', 'b']), { type: 'SET_VISIBILITY', playerId: 'a', visibility: 'public' });
    expect(state.visibility).toBe('public');
  });

  it('est privée par défaut', () => {
    expect(lobby(['a', 'b']).visibility).toBe('private');
  });

  it('réattribue les sièges quand un joueur part', () => {
    let state = lobby(['a', 'b', 'c']);
    state = ok(state, { type: 'REMOVE_PLAYER', playerId: 'b' });
    expect(state.players.map((p) => p.seat)).toEqual([0, 1]);
  });
});

describe('la donne', () => {
  it('attend le choix du donneur avant de distribuer', () => {
    const state = ok(lobby(['a', 'b', 'c']), { type: 'START_GAME', playerId: 'a' });
    expect(state.phase).toBe('dealing');
    expect(state.round!.handSize).toBeNull();
    expect(Object.keys(state.round!.hands)).toHaveLength(0);
  });

  it('n’accepte le choix que du donneur', () => {
    const state = ok(lobby(['a', 'b', 'c']), { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    const other = state.players.find((p) => p.id !== dealer.id)!;
    fails(state, { type: 'DEAL', playerId: other.id, handSize: 5 }, 'NOT_DEALER');
  });

  it('refuse une taille hors des bornes 3–7', () => {
    const state = ok(lobby(['a', 'b']), { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    fails(state, { type: 'DEAL', playerId: dealer.id, handSize: 2 }, 'ILLEGAL_DEAL_COUNT');
    fails(state, { type: 'DEAL', playerId: dealer.id, handSize: 8 }, 'ILLEGAL_DEAL_COUNT');
  });

  it('sert le même nombre de cartes à tout le monde, donneur compris', () => {
    for (const handSize of [3, 4, 5, 6, 7]) {
      const state = playing(['a', 'b', 'c', 'd'], handSize);
      for (const p of state.players) {
        expect(state.round!.hands[p.id]).toHaveLength(handSize);
      }
    }
  });

  it('retourne une carte pour ouvrir la défausse', () => {
    const state = playing(['a', 'b', 'c']);
    expect(state.round!.lastDiscard).not.toBeNull();
    expect(state.round!.lastDiscard!.combo.cards).toHaveLength(1);
    // Elle n'appartient à personne : le premier joueur peut la ramasser.
    expect(state.round!.lastDiscard!.playerId).toBe('');
  });

  it('conserve toutes les cartes du paquet', () => {
    const state = playing(['a', 'b', 'c', 'd'], 7);
    const round = state.round!;
    const all = [
      ...Object.values(round.hands).flat(),
      ...round.stock,
      ...round.discardPile,
      ...round.lastDiscard!.combo.cards,
    ];
    expect(all).toHaveLength(52);
    expect(new Set(all.map(cardId)).size).toBe(52);
  });

  it('donne la parole au joueur à gauche du donneur', () => {
    const state = playing(['a', 'b', 'c']);
    const expected = (state.round!.dealerSeat + 1) % 3;
    expect(state.round!.currentSeat).toBe(expected);
    expect(state.round!.turnStep).toBe('discard');
  });

  it('distribue à l’identique à graine égale', () => {
    const a = playing(['a', 'b', 'c'], 5, 'même');
    const b = playing(['a', 'b', 'c'], 5, 'même');
    expect(a.round!.hands).toEqual(b.round!.hands);
  });

  it('ajoute les jokers quand la variante est active', () => {
    let state = lobby(['a', 'b']);
    state = ok(state, {
      type: 'SET_VARIANTS',
      playerId: 'a',
      variants: { ...DEFAULT_VARIANTS, jokers: true },
    });
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 5 });
    const round = state.round!;
    const all = [
      ...Object.values(round.hands).flat(),
      ...round.stock,
      ...round.discardPile,
      ...round.lastDiscard!.combo.cards,
    ];
    expect(all).toHaveLength(54);
  });
});

describe('le tour : défausser puis piocher', () => {
  let state: GameState;

  beforeEach(() => {
    state = playing(['a', 'b', 'c']);
  });

  it('refuse de piocher avant d’avoir défaussé', () => {
    const me = current(state);
    fails(state, { type: 'DRAW', playerId: me, from: { source: 'stock' } }, 'BAD_STEP');
  });

  it('refuse de défausser deux fois', () => {
    const me = current(state);
    const [first, second] = state.round!.hands[me];
    const after = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(first)] });
    fails(after, { type: 'DISCARD', playerId: me, cardIds: [cardId(second)] }, 'BAD_STEP');
  });

  it('refuse le coup d’un joueur dont ce n’est pas le tour', () => {
    const me = current(state);
    const other = state.players.find((p) => p.id !== me)!;
    const card = state.round!.hands[other.id][0];
    fails(state, { type: 'DISCARD', playerId: other.id, cardIds: [cardId(card)] }, 'NOT_YOUR_TURN');
  });

  it('refuse une combinaison illégale', () => {
    const me = current(state);
    const hand = state.round!.hands[me];
    const bad = [hand[0], hand[1]];
    // Deux cartes quelconques ne font ni paire ni suite dans la quasi-totalité
    // des cas ; on force une main sans combinaison possible pour être sûr.
    const forced = setHand(state, me, [c('S', 2), c('H', 9), c('D', 13)]);
    fails(
      forced,
      { type: 'DISCARD', playerId: me, cardIds: [cardId(c('S', 2)), cardId(c('H', 9))] },
      'ILLEGAL_COMBO',
    );
    expect(bad).toHaveLength(2);
  });

  it('refuse de poser une carte qu’on n’a pas', () => {
    const me = current(state);
    const forced = setHand(state, me, [c('S', 2)]);
    fails(forced, { type: 'DISCARD', playerId: me, cardIds: [cardId(c('C', 11))] }, 'ILLEGAL_COMBO');
  });

  it('retire la combinaison de la main et passe à la pioche', () => {
    const me = current(state);
    const before = state.round!.hands[me].length;
    const card = state.round!.hands[me][0];
    const after = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(card)] });
    expect(after.round!.hands[me]).toHaveLength(before - 1);
    expect(after.round!.turnStep).toBe('draw');
    expect(after.round!.pendingDiscard!.playerId).toBe(me);
  });

  it('rend la main au joueur suivant après la pioche', () => {
    const me = current(state);
    const after = playNeutralTurn(state);
    expect(current(after)).not.toBe(me);
    expect(after.round!.turnStep).toBe('discard');
  });

  it('fait toujours repiocher, même quand la main est vidée', () => {
    const me = current(state);
    let forced = setHand(state, me, [c('S', 4), c('S', 5), c('S', 6)]);
    forced = ok(forced, {
      type: 'DISCARD',
      playerId: me,
      cardIds: [cardId(c('S', 4)), cardId(c('S', 5)), cardId(c('S', 6))],
    });
    expect(forced.round!.hands[me]).toHaveLength(0);
    forced = ok(forced, { type: 'DRAW', playerId: me, from: { source: 'stock' } });
    // Il est impossible de finir un tour sans carte.
    expect(forced.round!.hands[me]).toHaveLength(1);
  });

  it('conserve le compte des cartes tout au long de la manche', () => {
    let s = state;
    for (let i = 0; i < 12; i++) s = playNeutralTurn(s);
    const round = s.round!;
    const all = [
      ...Object.values(round.hands).flat(),
      ...round.stock,
      ...round.discardPile,
      ...(round.lastDiscard?.combo.cards ?? []),
      ...(round.pendingDiscard?.combo.cards ?? []),
    ];
    expect(all).toHaveLength(52);
    expect(new Set(all.map(cardId)).size).toBe(52);
  });
});

describe('le ramassage dans la défausse', () => {
  it('ne laisse prendre que la tête ou la queue d’une suite', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 4), c('S', 5), c('S', 6), c('H', 9)]);
    state = ok(state, {
      type: 'DISCARD',
      playerId: me,
      cardIds: [cardId(c('S', 4)), cardId(c('S', 5)), cardId(c('S', 6))],
    });
    state = ok(state, { type: 'DRAW', playerId: me, from: { source: 'stock' } });

    const next = current(state);
    state = setHand(state, next, [c('D', 2)]);
    state = ok(state, { type: 'DISCARD', playerId: next, cardIds: [cardId(c('D', 2))] });

    fails(
      state,
      { type: 'DRAW', playerId: next, from: { source: 'discard', cardId: cardId(c('S', 5)) } },
      'ILLEGAL_DRAW',
    );
    const taken = ok(state, {
      type: 'DRAW',
      playerId: next,
      from: { source: 'discard', cardId: cardId(c('S', 6)) },
    });
    expect(taken.round!.hands[next].map(cardId)).toContain(cardId(c('S', 6)));
  });

  it('interdit structurellement de reprendre sa propre défausse', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 13), c('H', 9)]);
    state = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(c('S', 13))] });
    // Le Roi qu'on vient de poser attend dans `pendingDiscard`, hors d'atteinte.
    fails(
      state,
      { type: 'DRAW', playerId: me, from: { source: 'discard', cardId: cardId(c('S', 13)) } },
      'ILLEGAL_DRAW',
    );
  });

  it('ne laisse jamais puiser dans une défausse plus ancienne que le tour précédent', () => {
    let state = playing(['a', 'b', 'c']);
    const first = current(state);
    state = setHand(state, first, [c('S', 13), c('H', 9)]);
    state = ok(state, { type: 'DISCARD', playerId: first, cardIds: [cardId(c('S', 13))] });
    state = ok(state, { type: 'DRAW', playerId: first, from: { source: 'stock' } });

    // Un tour passe : le Roi est enterré.
    state = playNeutralTurn(state);

    const third = current(state);
    state = setHand(state, third, [c('D', 3)]);
    state = ok(state, { type: 'DISCARD', playerId: third, cardIds: [cardId(c('D', 3))] });
    fails(
      state,
      { type: 'DRAW', playerId: third, from: { source: 'discard', cardId: cardId(c('S', 13)) } },
      'ILLEGAL_DRAW',
    );
  });

  it('laisse le premier joueur ramasser la carte retournée', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    const upCard = state.round!.lastDiscard!.combo.cards[0];
    const card = state.round!.hands[me][0];
    state = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(card)] });
    state = ok(state, {
      type: 'DRAW',
      playerId: me,
      from: { source: 'discard', cardId: cardId(upCard) },
    });
    expect(state.round!.hands[me].map(cardId)).toContain(cardId(upCard));
  });

  it('enterre le reste de la défausse une fois le tour fini', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 7), c('H', 7), c('D', 2)]);
    state = ok(state, {
      type: 'DISCARD',
      playerId: me,
      cardIds: [cardId(c('S', 7)), cardId(c('H', 7))],
    });
    state = ok(state, { type: 'DRAW', playerId: me, from: { source: 'stock' } });

    const next = current(state);
    state = setHand(state, next, [c('C', 3)]);
    state = ok(state, { type: 'DISCARD', playerId: next, cardIds: [cardId(c('C', 3))] });
    state = ok(state, {
      type: 'DRAW',
      playerId: next,
      from: { source: 'discard', cardId: cardId(c('S', 7)) },
    });
    // Le 7 non repris rejoint les cartes enterrées.
    expect(state.round!.discardPile.map(cardId)).toContain(cardId(c('H', 7)));
  });

  it('remélange les cartes enterrées quand la pioche s’épuise', () => {
    let state = playing(['a', 'b'], 3);
    const round = state.round!;
    // On vide la pioche et on garnit les cartes enterrées.
    state = structuredClone(state);
    state.round!.discardPile = [...round.stock];
    state.round!.stock = [];

    const me = current(state);
    const card = state.round!.hands[me][0];
    state = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(card)] });
    const buried = state.round!.discardPile.length;
    state = ok(state, { type: 'DRAW', playerId: me, from: { source: 'stock' } });

    expect(buried).toBeGreaterThan(0);
    const reshuffle = state.round!.log.find((e) => e.type === 'reshuffle');
    expect(reshuffle).toMatchObject({ type: 'reshuffle', cards: buried });
    // La pioche est repartie des cartes enterrées, moins celle qu'on vient de
    // tirer ; seule la défausse du tour qui s'achève est retombée sur la pile.
    expect(state.round!.stock).toHaveLength(buried - 1);
    expect(state.round!.discardPile).toHaveLength(1);
  });
});

describe('l’annonce', () => {
  it('ne se fait qu’au début du tour, avant toute défausse', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 2), c('H', 3)]);
    const discarded = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(c('S', 2))] });
    fails(discarded, { type: 'CALL_ZAP', playerId: me }, 'BAD_STEP');
  });

  it('refuse une annonce au-dessus du seuil', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 13)]);
    fails(state, { type: 'CALL_ZAP', playerId: me }, 'ZAP_TOO_HIGH');
  });

  it('refuse l’annonce d’un joueur dont ce n’est pas le tour', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    const other = state.players.find((p) => p.id !== me)!;
    state = setHand(state, other.id, [c('S', 1)]);
    fails(state, { type: 'CALL_ZAP', playerId: other.id }, 'NOT_YOUR_TURN');
  });

  it('réussie : 0 pour l’annonceur, sa main pour chacun', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    const others = state.players.filter((p) => p.id !== me);
    state = setHand(state, me, [c('S', 2)]);
    state = setHand(state, others[0].id, [c('H', 13)]);
    state = setHand(state, others[1].id, [c('D', 9), c('C', 4)]);

    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.phase).toBe('round-scoring');
    expect(state.round!.zapCall!.success).toBe(true);
    expect(state.round!.roundScores).toEqual({ [me]: 0, [others[0].id]: 10, [others[1].id]: 13 });
  });

  it('ratée : 30 pour l’annonceur, 0 pour le contre', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    const others = state.players.filter((p) => p.id !== me);
    state = setHand(state, me, [c('S', 5)]);
    state = setHand(state, others[0].id, [c('H', 1)]);
    state = setHand(state, others[1].id, [c('D', 9)]);

    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.round!.zapCall!.success).toBe(false);
    expect(state.round!.roundScores![me]).toBe(MISS_PENALTY);
    expect(state.round!.roundScores![others[0].id]).toBe(0);
    expect(state.round!.roundScores![others[1].id]).toBe(9);
  });

  it('donne l’égalité au contre-attaquant', () => {
    let state = playing(['a', 'b']);
    const me = current(state);
    const other = state.players.find((p) => p.id !== me)!;
    state = setHand(state, me, [c('S', 5)]);
    state = setHand(state, other.id, [c('H', 5)]);

    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.round!.zapCall!.success).toBe(false);
    expect(state.round!.roundScores![me]).toBe(MISS_PENALTY);
    expect(state.round!.roundScores![other.id]).toBe(0);
  });

  it('abat toutes les mains pour l’écran de décompte', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    state = setHand(state, me, [c('S', 1)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(Object.keys(state.round!.zapCall!.hands)).toHaveLength(3);
  });

  it('cumule les scores sur le total du joueur', () => {
    let state = playing(['a', 'b']);
    const me = current(state);
    const other = state.players.find((p) => p.id !== me)!;
    state = setHand(state, me, [c('S', 1)]);
    state = setHand(state, other.id, [c('H', 13), c('D', 12)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.players.find((p) => p.id === other.id)!.totalScore).toBe(20);
  });

  it('suit le seuil relevé de la variante', () => {
    let state = lobby(['a', 'b']);
    state = ok(state, {
      type: 'SET_VARIANTS',
      playerId: 'a',
      variants: { ...DEFAULT_VARIANTS, zapThreshold: 7 },
    });
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 3 });
    const me = current(state);
    state = setHand(state, me, [c('S', 7)]);
    expect(applyAction(state, { type: 'CALL_ZAP', playerId: me }).ok).toBe(true);
  });
});

describe('enchaînement des manches', () => {
  function scoredRound(ids: string[]): GameState {
    let state = playing(ids);
    const me = current(state);
    state = setHand(state, me, [c('S', 1)]);
    return ok(state, { type: 'CALL_ZAP', playerId: me });
  }

  it('rouvre une phase de donne, donneur décalé à gauche', () => {
    const state = scoredRound(['a', 'b', 'c']);
    const before = state.round!.dealerSeat;
    const next = ok(state, { type: 'NEXT_ROUND', playerId: 'a' });
    expect(next.phase).toBe('dealing');
    expect(next.round!.dealerSeat).toBe((before + 1) % 3);
    expect(next.round!.handSize).toBeNull();
    expect(next.roundIndex).toBe(1);
  });

  it('réserve la relance à l’hôte en temps réel', () => {
    const state = scoredRound(['a', 'b', 'c']);
    fails(state, { type: 'NEXT_ROUND', playerId: 'b' }, 'NOT_HOST');
  });

  it('laisse chacun relancer en asynchrone', () => {
    let state = lobby(['a', 'b', 'c']);
    state = ok(state, { type: 'SET_PACE', playerId: 'a', pace: 'async' });
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 3 });
    const me = current(state);
    state = setHand(state, me, [c('S', 1)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(applyAction(state, { type: 'NEXT_ROUND', playerId: 'b' }).ok).toBe(true);
  });

  it('distribue des mains différentes d’une manche à l’autre', () => {
    let state = scoredRound(['a', 'b', 'c']);
    const firstHands = structuredClone(state.round!.hands);
    state = ok(state, { type: 'NEXT_ROUND', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 5 });
    expect(state.round!.hands).not.toEqual(firstHands);
  });
});

describe('élimination et fin de partie', () => {
  /** Amène un joueur juste sous la barre, puis lui fait passer les 100. */
  function withScores(ids: string[], scores: Record<string, number>): GameState {
    const state = structuredClone(playing(ids));
    for (const p of state.players) p.totalScore = scores[p.id] ?? 0;
    return state;
  }

  it('sort un joueur qui atteint 100', () => {
    let state = withScores(['a', 'b', 'c'], { a: 95, b: 0, c: 0 });
    const me = current(state);
    const victim = state.players.find((p) => p.id === 'a')!;
    state = setHand(state, me, [c('S', 1)]);
    state = setHand(state, victim.id, [c('H', 13), c('D', 12)]);
    if (me === 'a') return; // l'annonceur n'encaisse pas sa propre main
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.players.find((p) => p.id === 'a')!.totalScore).toBe(115);
    expect(state.players.find((p) => p.id === 'a')!.eliminated).toBe(true);
  });

  it('sauve du rebond le joueur qui tombe pile sur 100', () => {
    let state = withScores(['a', 'b', 'c'], { a: 80, b: 0, c: 0 });
    const me = current(state);
    if (me === 'a') return;
    state = setHand(state, me, [c('S', 1)]);
    state = setHand(state, 'a', [c('H', 13), c('D', 10)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    const a = state.players.find((p) => p.id === 'a')!;
    expect(a.totalScore).toBe(50);
    expect(a.eliminated).toBe(false);
  });

  it('saute le siège d’un éliminé dans l’ordre du tour', () => {
    let state = playing(['a', 'b', 'c']);
    state = structuredClone(state);
    const victim = state.players.find((p) => p.seat === (state.round!.currentSeat + 1) % 3)!;
    victim.eliminated = true;

    const me = current(state);
    state = playNeutralTurn(state);
    expect(current(state)).not.toBe(victim.id);
    expect(current(state)).not.toBe(me);
  });

  it('termine la partie quand il ne reste qu’un joueur', () => {
    let state = withScores(['a', 'b'], { a: 95, b: 0 });
    const me = current(state);
    const other = state.players.find((p) => p.id !== me)!;
    state = setHand(state, me, [c('S', 1)]);
    state = setHand(state, other.id, [c('H', 13), c('D', 12)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    expect(state.players.find((p) => p.id === other.id)!.eliminated).toBe(true);

    state = ok(state, { type: 'NEXT_ROUND', playerId: state.hostId });
    expect(state.phase).toBe('game-over');
    expect(state.players.find((p) => p.id === me)!.finishRank).toBe(1);
  });

  it('s’arrête dès que quelqu’un dépasse 100, sans réglage à activer', () => {
    // Règle absolue du jeu : la partie ne se joue pas « au dernier debout ».
    // Le premier qui saute arrête tout le monde, et on en relance une.
    let state = lobby(['a', 'b', 'c']);
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 3 });
    state = structuredClone(state);
    for (const p of state.players) p.totalScore = p.id === 'c' ? 95 : 0;

    const me = current(state);
    if (me === 'c') return;
    state = setHand(state, me, [c('S', 1)]);
    state = setHand(state, 'c', [c('H', 13), c('D', 12)]);
    state = ok(state, { type: 'CALL_ZAP', playerId: me });
    state = ok(state, { type: 'NEXT_ROUND', playerId: 'a' });
    expect(state.phase).toBe('game-over');
  });
});

describe('la fin de partie, règle absolue', () => {
  /**
   * Dès qu'un joueur dépasse 100, la partie s'arrête **pour tout le monde**.
   * Ce n'était qu'une variante ; c'est désormais la règle, et ces tests sont là
   * pour qu'elle ne redevienne jamais un réglage par accident.
   */
  function scoredGame(totals: Record<string, number>): GameState {
    let state = playing(Object.keys(totals), 3);
    state = structuredClone(state);
    for (const p of state.players) p.totalScore = totals[p.id];
    return state;
  }

  /** Clôt la manche sur une annonce du joueur donné, puis avance. */
  function finishRound(state: GameState, callerHand: Card[]): GameState {
    const me = current(state);
    let next = setHand(state, me, callerHand);
    next = ok(next, { type: 'CALL_ZAP', playerId: me });
    return ok(next, { type: 'NEXT_ROUND', playerId: next.hostId });
  }

  it('ne laisse aucun réglage la désactiver', () => {
    // `endMode` n'existe plus : le moteur refuse un objet de variantes qui
    // prétendrait le porter — donc personne ne peut rallonger la partie.
    expect(Object.keys(DEFAULT_VARIANTS)).not.toContain('endMode');
  });

  it('s’arrête au premier joueur au-dessus de 100, les autres encore debout', () => {
    let state = scoredGame({ a: 0, b: 0, c: 98 });
    // `c` prend sa main en pleine figure : il passe 100 et tout s'arrête.
    state = setHand(state, 'c', [c('H', 13), c('D', 12)]);
    const me = current(state);
    if (me === 'c') return;
    state = finishRound(state, [c('S', 1)]);

    expect(state.phase).toBe('game-over');
    expect(state.players.find((p) => p.id === 'c')!.eliminated).toBe(true);
    // Les deux autres n'ont pas été éliminés : la partie s'est arrêtée avant.
    expect(state.players.filter((p) => !p.eliminated)).toHaveLength(2);
  });

  it('classe tout le monde, du plus bas score au plus haut', () => {
    let state = scoredGame({ a: 0, b: 0, c: 98 });
    state = setHand(state, 'c', [c('H', 13), c('D', 12)]);
    const me = current(state);
    if (me === 'c') return;
    state = finishRound(state, [c('S', 1)]);

    const ranked = [...state.players].sort((x, y) => x.finishRank! - y.finishRank!);
    expect(ranked.map((p) => p.finishRank)).toEqual([1, 2, 3]);
    // Celui qui a fait sauter la partie est forcément dernier : il est le seul
    // au-dessus de 100.
    expect(ranked[2].id).toBe('c');
    // Et le classement suit le total, puisque tout le jeu est de ne pas marquer.
    expect(ranked[0].totalScore).toBeLessThanOrEqual(ranked[1].totalScore);
  });

  it('range les partants derrière ceux qui ont joué jusqu’au bout', () => {
    // Abandonner n'est pas finir : classer un déserteur au score
    // récompenserait celui qui s'en va pendant qu'il mène.
    let state = scoredGame({ a: 0, b: 0, c: 98 });
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    state = setHand(state, 'c', [c('H', 13), c('D', 12)]);
    if (current(state) === 'c') return;
    state = finishRound(state, [c('S', 1)]);

    expect(state.phase).toBe('game-over');
    const b = state.players.find((p) => p.id === 'b')!;
    const others = state.players.filter((p) => p.id !== 'b');
    for (const p of others) expect(p.finishRank!).toBeLessThan(b.finishRank!);
  });
});

describe('manche bloquée', () => {
  /**
   * Une manche ne s'achève que sur une annonce, et rien ne garantit qu'une
   * annonce devienne possible : une main sans combinaison ne rétrécit jamais,
   * puisqu'on repioche toujours exactement une carte. Un serveur qui arbitre ne
   * peut pas laisser une table dans cet état.
   */
  function stalemate(ids: string[]): GameState {
    let state = playing(ids, 3);
    state = structuredClone(state);
    state.round!.turnsPlayed = MAX_TURNS_PER_PLAYER * ids.length - 1;
    // Des mains basses : leur total reste très en deçà des 30 points de la
    // pénalité, ce qui rend visible qu'aucune sanction n'est appliquée.
    for (const id of ids) state = setHand(state, id, [c('S', 2), c('H', 3), c('D', 4)]);
    return playNeutralTurn(state);
  }

  it('finit par se clore d’elle-même', () => {
    expect(stalemate(['a', 'b', 'c']).phase).toBe('round-scoring');
  });

  it('fait marquer à chacun le total de sa main', () => {
    const state = stalemate(['a', 'b', 'c']);
    for (const p of state.players) {
      expect(state.round!.roundScores![p.id]).toBe(handValue(state.round!.hands[p.id]));
    }
  });

  it('ne sanctionne personne : il n’y a pas eu d’annonce ratée', () => {
    const state = stalemate(['a', 'b', 'c']);
    expect(state.round!.zapCall).toBeNull();
    for (const p of state.players) {
      expect(state.round!.roundScores![p.id]).toBeLessThan(MISS_PENALTY);
    }
  });

  it('le consigne au journal', () => {
    const state = stalemate(['a', 'b', 'c']);
    expect(state.round!.log.some((e) => e.type === 'stalemate')).toBe(true);
  });

  it('élimine quand même celui qui passe les 100', () => {
    let state = playing(['a', 'b'], 3);
    state = structuredClone(state);
    state.round!.turnsPlayed = MAX_TURNS_PER_PLAYER * 2 - 1;
    state.players.find((p) => p.id === 'b')!.totalScore = 95;
    state = setHand(state, 'a', [c('S', 2), c('H', 3), c('D', 4)]);
    state = setHand(state, 'b', [c('S', 13), c('H', 12), c('D', 11)]);
    state = playNeutralTurn(state);
    expect(state.players.find((p) => p.id === 'b')!.eliminated).toBe(true);
  });

  it('ne se déclenche jamais sur une manche ordinaire', () => {
    // Le banc d'essai mesure une manche à 26 tours en moyenne et 120 au pire ;
    // le garde-fou se situe très au-dessus.
    let state = playing(['a', 'b', 'c']);
    for (let i = 0; i < 40; i++) state = playNeutralTurn(state);
    expect(state.phase).toBe('playing');
  });
});

describe('journal de manche', () => {
  it('consigne la donne, les poses et les pioches', () => {
    let state = playing(['a', 'b', 'c']);
    state = playNeutralTurn(state);
    const kinds = state.round!.log.map((e) => e.type);
    expect(kinds[0]).toBe('deal');
    expect(kinds).toContain('discard');
    expect(kinds).toContain('draw-stock');
  });

  it('ne révèle jamais la carte piochée à l’aveugle', () => {
    let state = playing(['a', 'b', 'c']);
    state = playNeutralTurn(state);
    const drew = state.round!.log.find((e) => e.type === 'draw-stock')!;
    expect(Object.keys(drew)).toEqual(['type', 'playerId']);
  });

  it('révèle la carte reprise dans la défausse : tout le monde l’a vue', () => {
    let state = playing(['a', 'b', 'c']);
    const me = current(state);
    const upCard = state.round!.lastDiscard!.combo.cards[0];
    const card = state.round!.hands[me][0];
    state = ok(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(card)] });
    state = ok(state, {
      type: 'DRAW',
      playerId: me,
      from: { source: 'discard', cardId: cardId(upCard) },
    });
    const drew = state.round!.log.find((e) => e.type === 'draw-discard');
    expect(drew).toMatchObject({ type: 'draw-discard', playerId: me, card: upCard });
  });
});

describe('immuabilité', () => {
  it('ne modifie jamais l’état reçu', () => {
    const state = playing(['a', 'b', 'c']);
    const snapshot = structuredClone(state);
    const me = current(state);
    applyAction(state, { type: 'DISCARD', playerId: me, cardIds: [cardId(state.round!.hands[me][0])] });
    expect(state).toEqual(snapshot);
  });

  it('laisse l’état intact quand l’action est refusée', () => {
    const state = playing(['a', 'b', 'c']);
    const snapshot = structuredClone(state);
    applyAction(state, { type: 'CALL_ZAP', playerId: 'zzz' });
    expect(state).toEqual(snapshot);
  });
});

describe('partie complète', () => {
  it('va jusqu’au bout sans jamais perdre une carte', () => {
    let state = playing(['a', 'b', 'c', 'd'], 7, 'partie-longue');
    for (let turn = 0; turn < 60 && state.phase === 'playing'; turn++) {
      const me = current(state);
      const hand = state.round!.hands[me];
      if (handValue(hand) <= state.variants.zapThreshold) {
        state = ok(state, { type: 'CALL_ZAP', playerId: me });
        break;
      }
      state = playNeutralTurn(state);

      const round = state.round!;
      const all = [
        ...Object.values(round.hands).flat(),
        ...round.stock,
        ...round.discardPile,
        ...(round.lastDiscard?.combo.cards ?? []),
        ...(round.pendingDiscard?.combo.cards ?? []),
      ];
      expect(new Set(all.map((x) => cardId(x))).size).toBe(52);
    }
    expect(['playing', 'round-scoring']).toContain(state.phase);
  });
});

describe('pause et départ volontaire', () => {
  it('met un joueur en pause et l’en sort', () => {
    let state = playing(['a', 'b', 'c']);
    state = ok(state, { type: 'SET_AWAY', playerId: 'b', away: true });
    expect(state.players.find((p) => p.id === 'b')!.away).toBe(true);
    state = ok(state, { type: 'SET_AWAY', playerId: 'b', away: false });
    expect(state.players.find((p) => p.id === 'b')!.away).toBe(false);
  });

  it('la pause ne change rien à l’ordre du tour', () => {
    let state = playing(['a', 'b', 'c']);
    const before = state.round!.currentSeat;
    state = ok(state, { type: 'SET_AWAY', playerId: current(state), away: true });
    expect(state.round!.currentSeat).toBe(before);
  });

  it('au salon, partir libère le siège', () => {
    let state = lobby(['a', 'b', 'c']);
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    expect(state.players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(state.players.map((p) => p.seat)).toEqual([0, 1]);
  });

  it('en partie, partir vaut sortie sans effacer le tableau', () => {
    let state = playing(['a', 'b', 'c']);
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    const b = state.players.find((p) => p.id === 'b')!;
    expect(b.eliminated).toBe(true);
    expect(b.forfeited).toBe(true);
    // Le siège reste : les scores des autres en dépendent.
    expect(state.players).toHaveLength(3);
  });

  it('rend les cartes du partant à la défausse', () => {
    let state = playing(['a', 'b', 'c'], 5);
    const hand = [...state.round!.hands['b']!];
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    // Contenance et non compte exact : clore le tour retire aussi la défausse
    // du tour précédent, qui n'était plus ramassable.
    const pile = state.round!.discardPile.map(cardId);
    for (const card of hand) expect(pile).toContain(cardId(card));
    expect(state.round!.hands['b']).toEqual([]);
  });

  it('passe la main quand c’est le partant qui devait jouer', () => {
    let state = playing(['a', 'b', 'c']);
    const leaver = current(state);
    state = ok(state, { type: 'FORFEIT', playerId: leaver });
    expect(current(state)).not.toBe(leaver);
    expect(state.round!.turnStep).toBe('discard');
    // Et la table repart : le suivant peut jouer.
    expect(() => playNeutralTurn(state)).not.toThrow();
  });

  it('passe la donne quand c’est le donneur qui part', () => {
    // Sans cela, la manche attendait une donne qui ne viendrait jamais.
    let state = ok(lobby(['a', 'b', 'c']), { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'FORFEIT', playerId: dealer.id });
    const next = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    expect(next.id).not.toBe(dealer.id);
    expect(() => ok(state, { type: 'DEAL', playerId: next.id, handSize: 5 })).not.toThrow();
  });

  it('termine la partie quand il ne reste qu’un joueur', () => {
    let state = playing(['a', 'b']);
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    expect(state.phase).toBe('game-over');
    expect(state.players.find((p) => p.id === 'a')!.finishRank).toBe(1);
  });

  it('ne fait rien si le joueur est déjà sorti', () => {
    let state = playing(['a', 'b', 'c']);
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    const snapshot = structuredClone(state);
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    expect(state).toEqual(snapshot);
  });

  it('refuse de faire partir un inconnu', () => {
    fails(playing(['a', 'b', 'c']), { type: 'FORFEIT', playerId: 'zzz' }, 'PLAYER_NOT_FOUND');
  });

  it('l’hôte qui part passe la barre à quelqu’un', () => {
    // Sans transfert, plus personne ne peut lancer la manche suivante : la
    // table reste bloquée sur l'écran de score jusqu'à expiration.
    let state = playing(['a', 'b', 'c']);
    expect(state.hostId).toBe('a');
    state = ok(state, { type: 'FORFEIT', playerId: 'a' });
    expect(state.hostId).not.toBe('a');
    expect(['b', 'c']).toContain(state.hostId);
  });

  it('l’hôte qui part préfère un humain à un robot', () => {
    let state = ok(lobby(['a', 'bot:0']), {
      type: 'ADD_PLAYER',
      player: { id: 'c', pseudo: 'c', avatar: '⚡' },
    });
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 5 });
    state = ok(state, { type: 'FORFEIT', playerId: 'a' });
    expect(state.hostId).toBe('c');
  });

  it('un départ volontaire n’arrête pas la partie des autres', () => {
    // La partie s'arrête au premier qui dépasse 100, pas au premier qui s'en
    // va : claquer la porte au deuxième tour terminerait la partie des autres.
    let state = lobby(['a', 'b', 'c']);
    state = ok(state, { type: 'START_GAME', playerId: 'a' });
    const dealer = state.players.find((p) => p.seat === state.round!.dealerSeat)!;
    state = ok(state, { type: 'DEAL', playerId: dealer.id, handSize: 5 });
    state = ok(state, { type: 'FORFEIT', playerId: 'b' });
    expect(state.phase).not.toBe('game-over');
  });
});

describe('coups de secours', () => {
  it('ne défausse rien quand la main est vide', () => {
    // Chemin appelé depuis un minuteur : une exception y arrêterait le serveur
    // entier, pas seulement cette table.
    const state = setHand(playing(['a', 'b']), 'a', []);
    expect(defaultDiscard(state, 'a')).toEqual([]);
  });

  it('ne défausse rien pour un joueur qu’elle ne connaît pas', () => {
    expect(defaultDiscard(playing(['a', 'b']), 'zzz')).toEqual([]);
  });

  it('pose la carte la plus chère quand la main en a une', () => {
    const state = setHand(playing(['a', 'b']), 'a', [c('H', 3), c('S', 13), c('D', 2)]);
    expect(defaultDiscard(state, 'a')).toEqual([cardId(c('S', 13))]);
  });
});
