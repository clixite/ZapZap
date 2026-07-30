import { isBotId } from './bot';
import {
  cardFromId,
  cardId,
  cardValue,
  fullDeck,
  handValue,
  hashSeed,
  mulberry32,
  sameCard,
  shuffle,
  sortHand,
} from './cards';
import { classify, findCombos, isLegalCombo, pickableFrom } from './combos';
import {
  DEAL_CHOICES,
  DEFAULT_VARIANTS,
  MAX_PLAYERS,
  MAX_TURNS_PER_PLAYER,
  MIN_PLAYERS,
  comboOptions,
  dealFits,
  isDealChoice,
  isEliminated,
  isZapVariants,
  nextTotal,
  resolveZap,
  type ZapVariants,
} from './rules';
import {
  DEFAULT_PACE,
  DEFAULT_VISIBILITY,
  isGamePace,
  isVisibility,
  type CardId,
  type Combo,
  type GamePace,
  type GameState,
  type Player,
  type RoundState,
  type Visibility,
} from './types';

export type EngineErrorCode =
  | 'BAD_PHASE'
  | 'BAD_STEP'
  | 'NOT_HOST'
  | 'NOT_DEALER'
  | 'NOT_YOUR_TURN'
  | 'NOT_ENOUGH_PLAYERS'
  | 'ROOM_FULL'
  | 'PLAYER_NOT_FOUND'
  | 'ILLEGAL_DEAL_COUNT'
  | 'ILLEGAL_COMBO'
  | 'ILLEGAL_DRAW'
  | 'ZAP_TOO_HIGH'
  | 'ILLEGAL_VARIANT';

export type DrawSource = { source: 'stock' } | { source: 'discard'; cardId: CardId };

export type GameAction =
  | { type: 'ADD_PLAYER'; player: Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null } }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'UPDATE_PROFILE'; playerId: string; pseudo: string; avatar: string; photo?: string | null }
  | { type: 'SET_CONNECTED'; playerId: string; connected: boolean }
  | { type: 'SET_VARIANTS'; playerId: string; variants: ZapVariants }
  | { type: 'SET_PACE'; playerId: string; pace: GamePace }
  | { type: 'SET_VISIBILITY'; playerId: string; visibility: Visibility }
  | { type: 'SET_GROUP'; playerId: string; groupId: string | null }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'DEAL'; playerId: string; handSize: number }
  | { type: 'DISCARD'; playerId: string; cardIds: CardId[] }
  | { type: 'DRAW'; playerId: string; from: DrawSource }
  | { type: 'CALL_ZAP'; playerId: string }
  | { type: 'NEXT_ROUND'; playerId: string };

export type EngineResult = { ok: true; state: GameState } | { ok: false; error: EngineErrorCode };

function err(error: EngineErrorCode): EngineResult {
  return { ok: false, error };
}

export function createGame(
  code: string,
  seed: string,
  createdAt: number,
  host: Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null },
): GameState {
  return {
    code,
    hostId: host.id,
    phase: 'lobby',
    players: [{ ...host, seat: 0, connected: true, totalScore: 0, eliminated: false }],
    maxPlayers: MAX_PLAYERS,
    variants: { ...DEFAULT_VARIANTS },
    pace: DEFAULT_PACE,
    visibility: DEFAULT_VISIBILITY,
    round: null,
    roundIndex: 0,
    createdAt,
    seed,
  };
}

/* ------------------------------------------------------------------ */
/* Ordre du tour                                                       */
/* ------------------------------------------------------------------ */

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !p.eliminated);
}

function playerBySeat(state: GameState, seat: number): Player {
  const p = state.players.find((pl) => pl.seat === seat);
  if (!p) throw new Error(`Aucun joueur au siège ${seat}`);
  return p;
}

/**
 * Siège suivant, en sautant les éliminés.
 *
 * Un joueur sorti garde son siège — il reste au tableau des scores et sa place
 * autour de la table ne bouge pas — mais il est ignoré par l'ordre du tour comme
 * par la rotation du donneur.
 */
function nextActiveSeat(state: GameState, seat: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const candidate = (seat + i) % n;
    if (!playerBySeat(state, candidate).eliminated) return candidate;
  }
  return seat;
}

/* ------------------------------------------------------------------ */
/* Cycle de la manche                                                  */
/* ------------------------------------------------------------------ */

/** Ouvre la phase de donne : le donneur doit encore choisir la taille des mains. */
function openDealing(state: GameState, roundIndex: number, dealerSeat: number): void {
  state.roundIndex = roundIndex;
  state.round = {
    roundIndex,
    dealerSeat,
    handSize: null,
    hands: {},
    stock: [],
    discardPile: [],
    lastDiscard: null,
    pendingDiscard: null,
    currentSeat: dealerSeat,
    turnStep: 'discard',
    turnsPlayed: 0,
    log: [],
    zapCall: null,
    roundScores: null,
  };
  state.phase = 'dealing';
}

/** Le donneur a tranché : on distribue et la manche commence. */
function dealRound(state: GameState, handSize: number): void {
  const round = state.round!;
  const players = activePlayers(state);
  const rand = mulberry32(hashSeed(`${state.seed}:round:${round.roundIndex}`));
  const deck = shuffle(fullDeck(state.variants.jokers), rand);

  const hands: RoundState['hands'] = {};
  players.forEach((p, i) => {
    hands[p.id] = sortHand(deck.slice(i * handSize, (i + 1) * handSize));
  });

  const dealt = players.length * handSize;
  const upCard = deck[dealt];
  const stock = deck.slice(dealt + 1);

  round.handSize = handSize;
  round.hands = hands;
  round.stock = stock;
  round.discardPile = [];
  // La carte retournée ouvre la défausse. Elle n'appartient à personne, donc le
  // premier joueur peut la ramasser : c'est la seule fois de la manche où la
  // défausse disponible ne vient pas d'un adversaire.
  round.lastDiscard = { playerId: '', combo: { kind: 'single', cards: [upCard] } };
  round.pendingDiscard = null;
  round.currentSeat = nextActiveSeat(state, round.dealerSeat);
  round.turnStep = 'discard';
  round.log = [{ type: 'deal', dealerSeat: round.dealerSeat, handSize, upCard }];
  state.phase = 'playing';
}

/**
 * Fin de tour : on enterre la défausse devenue inaccessible et on passe la main.
 *
 * C'est ici que se joue l'interdiction de reprendre sa propre défausse, et elle
 * se joue par construction plutôt que par contrôle : ce que le joueur vient de
 * poser attend dans `pendingDiscard`, hors de portée, et ne devient ramassable
 * qu'une fois la main passée au suivant.
 */
function endTurn(state: GameState): void {
  const round = state.round!;
  if (round.lastDiscard) round.discardPile.push(...round.lastDiscard.combo.cards);
  round.lastDiscard = round.pendingDiscard;
  round.pendingDiscard = null;
  round.currentSeat = nextActiveSeat(state, round.currentSeat);
  round.turnStep = 'discard';
  round.turnsPlayed += 1;

  if (round.turnsPlayed >= MAX_TURNS_PER_PLAYER * activePlayers(state).length) {
    endRoundStalemate(state);
  }
}

/**
 * Manche bloquée : personne n'a pu annoncer, on compte les mains.
 *
 * Chacun marque le total de sa main, personne ne prend les 30 points — il n'y a
 * pas eu d'annonce, donc pas d'annonce ratée à sanctionner. Voir
 * `MAX_TURNS_PER_PLAYER` pour la raison d'être de ce garde-fou.
 */
function endRoundStalemate(state: GameState): void {
  const round = state.round!;
  const players = activePlayers(state);

  round.roundScores = Object.fromEntries(players.map((p) => [p.id, handValue(round.hands[p.id] ?? [])]));
  round.zapCall = null;
  round.log.push({ type: 'stalemate', turns: round.turnsPlayed });

  for (const p of players) {
    p.totalScore = nextTotal(p.totalScore, round.roundScores[p.id] ?? 0, state.variants);
  }
  eliminateBusted(state, players);
  state.phase = 'round-scoring';
}

/** Clôt la manche sur une annonce et calcule les scores. */
function scoreRound(state: GameState, callerId: string): void {
  const round = state.round!;
  const players = activePlayers(state);
  const hands = Object.fromEntries(players.map((p) => [p.id, round.hands[p.id] ?? []]));
  const resolution = resolveZap(hands, callerId);

  round.zapCall = {
    playerId: callerId,
    value: resolution.callerValue,
    hands,
    beatenBy: resolution.beatenBy,
    success: resolution.success,
  };
  round.roundScores = resolution.scores;
  round.log.push({
    type: 'zap',
    playerId: callerId,
    handValue: resolution.callerValue,
    success: resolution.success,
  });

  for (const p of players) {
    p.totalScore = nextTotal(p.totalScore, resolution.scores[p.id] ?? 0, state.variants);
  }
  eliminateBusted(state, players);
  state.phase = 'round-scoring';
}

/**
 * Sort les joueurs qui viennent d'atteindre 100.
 *
 * Tous ceux qui sortent sur la même manche partagent le même rang : ils sont
 * sortis ensemble, rien ne permet de les départager.
 */
function eliminateBusted(state: GameState, players: Player[]): void {
  const newlyOut = players.filter((p) => isEliminated(p.totalScore));
  if (newlyOut.length === 0) return;
  const rankAfter = players.length - newlyOut.length + 1;
  for (const p of newlyOut) {
    p.eliminated = true;
    p.finishRank = rankAfter;
  }
}

/** La partie est-elle finie ? */
function isGameOver(state: GameState): boolean {
  const alive = activePlayers(state);
  if (state.variants.endMode === 'first-out') {
    return state.players.some((p) => p.eliminated);
  }
  return alive.length <= 1;
}

/** Classement final des survivants : le moins de points d'abord. */
function rankSurvivors(state: GameState): void {
  const alive = [...activePlayers(state)].sort((a, b) => a.totalScore - b.totalScore);
  alive.forEach((p, i) => {
    p.finishRank = i + 1;
  });
}

/* ------------------------------------------------------------------ */
/* Réducteur                                                           */
/* ------------------------------------------------------------------ */

export function applyAction(prev: GameState, action: GameAction): EngineResult {
  const state = structuredClone(prev);

  switch (action.type) {
    case 'ADD_PLAYER': {
      if (state.players.some((p) => p.id === action.player.id)) return { ok: true, state };
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (state.players.length >= state.maxPlayers) return err('ROOM_FULL');
      state.players.push({
        ...action.player,
        seat: state.players.length,
        connected: true,
        totalScore: 0,
        eliminated: false,
      });
      return { ok: true, state };
    }

    case 'REMOVE_PLAYER': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      const idx = state.players.findIndex((p) => p.id === action.playerId);
      if (idx === -1) return err('PLAYER_NOT_FOUND');
      state.players.splice(idx, 1);
      state.players.forEach((p, i) => (p.seat = i));
      if (state.hostId === action.playerId && state.players.length > 0) {
        // Un robot ne devient jamais hôte tant qu'il reste un humain.
        const human = state.players.find((p) => !isBotId(p.id));
        state.hostId = (human ?? state.players[0]).id;
      }
      return { ok: true, state };
    }

    case 'UPDATE_PROFILE': {
      const p = state.players.find((pl) => pl.id === action.playerId);
      if (!p) return err('PLAYER_NOT_FOUND');
      p.pseudo = action.pseudo;
      p.avatar = action.avatar;
      if (action.photo !== undefined) p.photo = action.photo;
      return { ok: true, state };
    }

    case 'SET_CONNECTED': {
      const p = state.players.find((pl) => pl.id === action.playerId);
      if (!p) return err('PLAYER_NOT_FOUND');
      p.connected = action.connected;
      return { ok: true, state };
    }

    case 'SET_VARIANTS': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (action.playerId !== state.hostId) return err('NOT_HOST');
      if (!isZapVariants(action.variants)) return err('ILLEGAL_VARIANT');
      state.variants = { ...action.variants };
      return { ok: true, state };
    }

    case 'SET_PACE': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (action.playerId !== state.hostId) return err('NOT_HOST');
      if (!isGamePace(action.pace)) return err('ILLEGAL_VARIANT');
      state.pace = action.pace;
      return { ok: true, state };
    }

    case 'SET_VISIBILITY': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (action.playerId !== state.hostId) return err('NOT_HOST');
      if (!isVisibility(action.visibility)) return err('ILLEGAL_VARIANT');
      state.visibility = action.visibility;
      return { ok: true, state };
    }

    case 'SET_GROUP': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (action.playerId !== state.hostId) return err('NOT_HOST');
      state.groupId = action.groupId;
      return { ok: true, state };
    }

    case 'START_GAME': {
      if (state.phase !== 'lobby') return err('BAD_PHASE');
      if (action.playerId !== state.hostId) return err('NOT_HOST');
      if (state.players.length < MIN_PLAYERS) return err('NOT_ENOUGH_PLAYERS');
      const rand = mulberry32(hashSeed(`${state.seed}:dealer`));
      openDealing(state, 0, Math.floor(rand() * state.players.length));
      return { ok: true, state };
    }

    case 'DEAL': {
      if (state.phase !== 'dealing' || !state.round) return err('BAD_PHASE');
      const dealer = playerBySeat(state, state.round.dealerSeat);
      if (dealer.id !== action.playerId) return err('NOT_DEALER');
      if (!isDealChoice(action.handSize)) return err('ILLEGAL_DEAL_COUNT');
      const deckSize = fullDeck(state.variants.jokers).length;
      if (!dealFits(activePlayers(state).length, action.handSize, deckSize)) return err('ILLEGAL_DEAL_COUNT');
      dealRound(state, action.handSize);
      return { ok: true, state };
    }

    case 'CALL_ZAP': {
      if (state.phase !== 'playing' || !state.round) return err('BAD_PHASE');
      const round = state.round;
      // L'annonce se fait au début de son tour, avant toute défausse : une fois
      // la carte posée, il est trop tard.
      if (round.turnStep !== 'discard') return err('BAD_STEP');
      if (playerBySeat(state, round.currentSeat).id !== action.playerId) return err('NOT_YOUR_TURN');
      if (handValue(round.hands[action.playerId] ?? []) > state.variants.zapThreshold) return err('ZAP_TOO_HIGH');
      scoreRound(state, action.playerId);
      return { ok: true, state };
    }

    case 'DISCARD': {
      if (state.phase !== 'playing' || !state.round) return err('BAD_PHASE');
      const round = state.round;
      if (round.turnStep !== 'discard') return err('BAD_STEP');
      if (playerBySeat(state, round.currentSeat).id !== action.playerId) return err('NOT_YOUR_TURN');

      const hand = round.hands[action.playerId] ?? [];
      const opts = comboOptions(state.variants);
      const cards = action.cardIds.map(cardFromId);
      if (!isLegalCombo(hand, cards, opts)) return err('ILLEGAL_COMBO');

      const kind = classify(cards, opts)!;
      const combo: Combo = { kind, cards: sortHand(cards) };

      // Retrait carte par carte : `filter` sur l'identifiant retirerait les deux
      // exemplaires si le paquet en contenait deux du même identifiant.
      const remaining = [...hand];
      for (const card of cards) {
        const idx = remaining.findIndex((c) => sameCard(c, card));
        remaining.splice(idx, 1);
      }
      round.hands[action.playerId] = sortHand(remaining);
      round.pendingDiscard = { playerId: action.playerId, combo };
      round.turnStep = 'draw';
      round.log.push({ type: 'discard', playerId: action.playerId, combo });
      return { ok: true, state };
    }

    case 'DRAW': {
      if (state.phase !== 'playing' || !state.round) return err('BAD_PHASE');
      const round = state.round;
      if (round.turnStep !== 'draw') return err('BAD_STEP');
      if (playerBySeat(state, round.currentSeat).id !== action.playerId) return err('NOT_YOUR_TURN');

      if (action.from.source === 'stock') {
        if (round.stock.length === 0) {
          // Pioche épuisée : on remélange les cartes enterrées. La défausse
          // ramassable reste sur la table, elle est encore en jeu.
          if (round.discardPile.length === 0) return err('ILLEGAL_DRAW');
          const rand = mulberry32(hashSeed(`${state.seed}:reshuffle:${round.roundIndex}:${round.log.length}`));
          round.stock = shuffle(round.discardPile, rand);
          round.log.push({ type: 'reshuffle', cards: round.discardPile.length });
          round.discardPile = [];
        }
        const card = round.stock.shift()!;
        round.hands[action.playerId] = sortHand([...(round.hands[action.playerId] ?? []), card]);
        round.log.push({ type: 'draw-stock', playerId: action.playerId });
      } else {
        if (!round.lastDiscard) return err('ILLEGAL_DRAW');
        const wanted = cardFromId(action.from.cardId);
        const pickable = pickableFrom(round.lastDiscard.combo);
        if (!pickable.some((c) => sameCard(c, wanted))) return err('ILLEGAL_DRAW');
        const idx = round.lastDiscard.combo.cards.findIndex((c) => sameCard(c, wanted));
        const [card] = round.lastDiscard.combo.cards.splice(idx, 1);
        round.hands[action.playerId] = sortHand([...(round.hands[action.playerId] ?? []), card]);
        round.log.push({ type: 'draw-discard', playerId: action.playerId, card });
      }

      endTurn(state);
      return { ok: true, state };
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'round-scoring' || !state.round) return err('BAD_PHASE');
      // En temps réel l'hôte donne le rythme, il laisse la table lire les
      // scores. En asynchrone il peut être absent des heures : chacun peut
      // relancer, sinon la partie s'arrête sur son absence.
      const canAdvance =
        state.pace === 'async'
          ? state.players.some((p) => p.id === action.playerId)
          : action.playerId === state.hostId;
      if (!canAdvance) return err('NOT_HOST');

      if (isGameOver(state)) {
        rankSurvivors(state);
        state.phase = 'game-over';
        return { ok: true, state };
      }
      openDealing(state, state.roundIndex + 1, nextActiveSeat(state, state.round.dealerSeat));
      return { ok: true, state };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Coups par défaut (auto-play serveur)                                */
/* ------------------------------------------------------------------ */

/**
 * Ce que joue le serveur pour un joueur qui laisse expirer son tour.
 *
 * Le principe est celui de Rikiki : jamais le meilleur coup, toujours le plus
 * neutre. Un joueur absent ne doit ni être avantagé ni voir sa partie sabotée.
 */
export function defaultDealChoice(): number {
  return DEAL_CHOICES[Math.floor(DEAL_CHOICES.length / 2)];
}

/** La carte la plus chère, posée seule : purger les figures ne dessert personne. */
export function defaultDiscard(state: GameState, playerId: string): CardId[] {
  const hand = state.round!.hands[playerId] ?? [];
  const worst = hand.reduce((max, c) => (cardValue(c) > cardValue(max) ? c : max), hand[0]);
  return [cardId(worst)];
}

/** Pioche à l'aveugle : le coup qui ne renseigne personne. */
export function defaultDraw(state: GameState): DrawSource {
  const round = state.round!;
  if (round.stock.length > 0 || round.discardPile.length > 0) return { source: 'stock' };
  return { source: 'discard', cardId: cardId(pickableFrom(round.lastDiscard!.combo)[0]) };
}

export { cardFromId, cardId, findCombos, pickableFrom };
