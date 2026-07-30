import {
  DEAL_CHOICES,
  activePlayers,
  cardId,
  comboOptions,
  dealFits,
  findCombos,
  fullDeck,
  handValue,
  pickableFrom,
  type Combo,
  type DrawOption,
  type GameState,
  type GameView,
  type RoundView,
} from '@zapzap/shared';

/**
 * Ce qu'un joueur a le droit de voir.
 *
 * C'est la pièce qui rend la triche impossible, et elle n'a qu'une règle : ce
 * qui n'est pas dans la vue n'existe pas pour le client. Les mains adverses ne
 * sont jamais sérialisées, même pas « masquées » — un état masqué envoyé au
 * navigateur reste lisible dans l'onglet réseau.
 *
 * Le corollaire est que les coups légaux sont calculés ici, côté serveur. Le
 * client n'a pas à savoir ce qui est jouable, il l'apprend.
 */

/** Combinaisons proposées, dédoublonnées et triées pour l'affichage. */
function legalCombosFor(state: GameState, playerId: string): Combo[] {
  const hand = state.round!.hands[playerId] ?? [];
  const combos = findCombos(hand, comboOptions(state.variants));

  // Deux combinaisons portant exactement les mêmes cartes ne sont qu'une seule
  // proposition à l'écran. `findCombos` peut en produire (une paire de 2 est un
  // ensemble ; en variante « suite de 2 » elle pourrait aussi être lue comme
  // une suite), et proposer deux fois la même chose brouille la lecture.
  const seen = new Set<string>();
  const unique: Combo[] = [];
  for (const combo of combos) {
    const key = combo.cards.map(cardId).join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(combo);
  }

  // Les poses les plus payantes d'abord : c'est ce qu'on cherche en premier.
  return unique.sort((a, b) => {
    const value = handValue(b.cards) - handValue(a.cards);
    return value !== 0 ? value : b.cards.length - a.cards.length;
  });
}

function drawOptionsFor(state: GameState): DrawOption[] {
  const discard = state.round!.lastDiscard;
  if (!discard) return [];
  return pickableFrom(discard.combo).map((card) => ({ cardId: cardId(card), card }));
}

/** Tailles de main que le donneur peut choisir, celles qui tiennent dans le paquet. */
export function dealChoicesFor(state: GameState): number[] {
  const deckSize = fullDeck(state.variants.jokers).length;
  const count = activePlayers(state).length;
  return DEAL_CHOICES.filter((size) => dealFits(count, size, deckSize));
}

function roundViewFor(state: GameState, playerId: string): RoundView {
  const round = state.round!;
  const { hands, stock, discardPile, ...shared } = round;

  const isDealer = state.players.find((p) => p.seat === round.dealerSeat)?.id === playerId;
  const isCurrent = state.players.find((p) => p.seat === round.currentSeat)?.id === playerId;
  const myHand = hands[playerId] ?? [];
  const myTurnToDiscard = state.phase === 'playing' && isCurrent && round.turnStep === 'discard';
  const myTurnToDraw = state.phase === 'playing' && isCurrent && round.turnStep === 'draw';

  return {
    ...shared,
    myHand,
    handCounts: Object.fromEntries(state.players.map((p) => [p.id, (hands[p.id] ?? []).length])),
    stockCount: stock.length,
    discardPileCount: discardPile.length,
    legalCombos: myTurnToDiscard ? legalCombosFor(state, playerId) : null,
    drawOptions: myTurnToDraw ? drawOptionsFor(state) : null,
    canZap: myTurnToDiscard && handValue(myHand) <= state.variants.zapThreshold,
    dealChoices: state.phase === 'dealing' && isDealer ? dealChoicesFor(state) : null,
    // Les mains ne sont abattues qu'une fois la manche close : les révéler plus
    // tôt, même à l'annonceur, donnerait la partie.
    revealedHands: state.phase === 'round-scoring' ? (round.zapCall?.hands ?? hands) : null,
  };
}

export function viewFor(state: GameState, playerId: string, turnDeadline: number | null = null): GameView {
  const { round, seed, ...shared } = state;
  return {
    ...shared,
    you: playerId,
    round: round ? roundViewFor(state, playerId) : null,
    turnDeadline,
  };
}
