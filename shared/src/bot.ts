import { cardId, cardValue, handValue } from './cards';
import { findCombos, pickableFrom, type ComboOptions } from './combos';
import { DEAL_CHOICES, comboOptions, type ZapVariants } from './rules';
import type { Card, Combo, GameState, RoundEvent } from './types';

/**
 * Le joueur automatique.
 *
 * Il ne triche pas : il ne reçoit que ce qu'un humain assis à sa place verrait —
 * sa main, les tailles des mains adverses, et le journal public de la manche.
 * Toute sa lecture des adversaires vient du journal, exactement comme la nôtre.
 *
 * Sa stratégie est celle des cinq réflexes du règlement (§9), dans l'ordre :
 * purger les figures, piocher à l'aveugle par défaut, compter les mains
 * adverses, ne jamais garder une combinaison pour plus tard, et — quand c'est à
 * lui de donner — choisir la taille de main qui le sert au tableau des scores.
 */

const BOT_PREFIX = 'bot:';

export function isBotId(id: string): boolean {
  return id.startsWith(BOT_PREFIX);
}

export function botId(n: number): string {
  return `${BOT_PREFIX}${n}`;
}

export interface BotProfile {
  id: string;
  pseudo: string;
  avatar: string;
}

const BOT_NAMES = ['Volt', 'Flash', 'Spark', 'Tesla', 'Bolt'] as const;
const BOT_AVATARS = ['⚡', '🔌', '💥', '🔋', '✨'] as const;

export function botProfile(index: number): BotProfile {
  return {
    id: botId(index),
    pseudo: BOT_NAMES[index % BOT_NAMES.length],
    avatar: BOT_AVATARS[index % BOT_AVATARS.length],
  };
}

/* ------------------------------------------------------------------ */
/* Lecture du journal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ce que le journal apprend sur un adversaire.
 *
 * Un joueur qui pose trois cartes par tour et n'en remonte qu'une descend vite :
 * c'est le signal du §9.3, et c'est ce qui doit dissuader d'annoncer à la limite
 * du seuil. On mesure donc le rythme de délestage, pas la valeur des mains — que
 * personne ne connaît.
 */
export interface OpponentRead {
  /** Cartes lâchées, moins les cartes reprises. Plus c'est haut, plus il descend. */
  shed: number;
  /** A-t-il ramassé dans la défausse ? Signe qu'il construit une combinaison. */
  picked: number;
}

export function readOpponents(log: readonly RoundEvent[]): Record<string, OpponentRead> {
  const reads: Record<string, OpponentRead> = {};
  const of = (id: string): OpponentRead => (reads[id] ??= { shed: 0, picked: 0 });
  for (const event of log) {
    switch (event.type) {
      case 'discard':
        of(event.playerId).shed += event.combo.cards.length;
        break;
      case 'draw-stock':
        of(event.playerId).shed -= 1;
        break;
      case 'draw-discard':
        of(event.playerId).shed -= 1;
        of(event.playerId).picked += 1;
        break;
      default:
        break;
    }
  }
  return reads;
}

/** Cartes déjà tombées et vues de tous : la mémoire du compteur de cartes. */
export function seenCards(log: readonly RoundEvent[]): Card[] {
  const seen: Card[] = [];
  for (const event of log) {
    if (event.type === 'deal') seen.push(event.upCard);
    else if (event.type === 'discard') seen.push(...event.combo.cards);
  }
  return seen;
}

/* ------------------------------------------------------------------ */
/* Décisions                                                           */
/* ------------------------------------------------------------------ */

/**
 * La donne.
 *
 * Le donneur fixe le tempo de la manche pour tout le monde, lui compris. Quand
 * il mène, il sert court : une manche de trois cartes se joue en deux tours,
 * personne n'a le temps de construire, et un meneur a plus à perdre qu'à gagner
 * d'une manche longue. Quand il est distancé, il sert long — il lui faut du
 * matériel pour lâcher gros et refaire son retard.
 */
export function chooseHandSize(state: GameState, playerId: string): number {
  const me = state.players.find((p) => p.id === playerId);
  const others = state.players.filter((p) => !p.eliminated && p.id !== playerId);
  if (!me || others.length === 0) return 5;

  const best = Math.min(...others.map((p) => p.totalScore));
  const lead = best - me.totalScore;
  // `lead > 0` : je suis devant. Le seuil de 12 points vaut à peu près une
  // manche perdue — en deçà, l'écart n'est pas assez net pour figer la partie.
  if (lead > 12) return DEAL_CHOICES[0];
  if (lead < -12) return DEAL_CHOICES[DEAL_CHOICES.length - 1];
  return DEAL_CHOICES[Math.floor(DEAL_CHOICES.length / 2)];
}

/**
 * Prime accordée à chaque carte dont la pose allège la main.
 *
 * On repioche exactement une carte quel que soit le nombre de cartes posées :
 * une pose de k cartes raccourcit donc la main de k−1. Et c'est la longueur de
 * la main, bien plus que sa valeur, qui décide de la manche — à cinq cartes on
 * n'atteint jamais un total de 5, quelles que soient les cartes.
 *
 * Sans cette prime, le robot lâche la figure isolée plutôt que la petite paire,
 * garde une main de cinq cartes indéfiniment et la manche ne finit plus :
 * mesuré à 51 tours de moyenne et jusqu'à 202 au pire. À 8 — la valeur d'une
 * carte moyenne encore en main, plus le bénéfice d'être une carte plus près de
 * pouvoir annoncer — on tombe à 31 tours de moyenne et 85 au pire.
 */
const SHRINK_BONUS = 8;

/**
 * Prime écrasante pour une pose qui met la main sous le seuil d'annonce.
 *
 * Elle domine volontairement tout le barème ordinaire (qui plafonne vers 80) :
 * pouvoir annoncer au prochain tour vaut plus que n'importe quel délestage.
 * Sans elle, le robot posait mécaniquement sa plus grosse combinaison — avec
 * As-As-As-Roi il lâchait le brelan d'As et gardait dix points en main, alors
 * que poser le Roi seul le laissait à trois points, prêt à annoncer.
 */
const ZAP_SETUP_BONUS = 1000;

/**
 * La défausse.
 *
 * On ne garde jamais une combinaison pour plus tard (§9.4) : une paire de Rois
 * en main, ce sont vingt points qui dorment. Entre deux poses, on arbitre entre
 * les points lâchés et les cartes dont on se débarrasse — sauf quand une pose
 * ouvre la porte de l'annonce, auquel cas elle gagne d'office.
 *
 * `zapThreshold` vaut -1 par défaut : la prime ne se déclenche jamais, et les
 * appels existants gardent leur comportement.
 */
export function chooseDiscard(hand: readonly Card[], opts: ComboOptions, zapThreshold = -1): Combo {
  const combos = findCombos(hand, opts);
  const total = handValue(hand);
  const score = (combo: Combo): number => {
    const remaining = total - handValue(combo.cards);
    const base = comboScore(combo);
    // À plusieurs poses qualifiantes, on préfère celle qui laisse le moins de
    // points : l'égalité profitant au contre-attaquant, chaque point compte.
    return remaining <= zapThreshold ? base + ZAP_SETUP_BONUS + (zapThreshold - remaining) : base;
  };
  return combos.reduce((best, combo) => (score(combo) > score(best) ? combo : best), combos[0]);
}

function comboScore(combo: Combo): number {
  return handValue(combo.cards) + (combo.cards.length - 1) * SHRINK_BONUS;
}

/**
 * La pioche.
 *
 * Par défaut à l'aveugle : ramasser dans la défausse renseigne toute la table
 * sur ce qu'on construit (§9.2). On ne s'en écarte que si la carte complète
 * réellement une combinaison, ou si elle est assez basse pour être quasi
 * gratuite à garder.
 */
export interface DrawChoice {
  source: 'stock' | 'discard';
  card?: Card;
}

const CHEAP_ENOUGH = 2;

export function chooseDraw(
  hand: readonly Card[],
  discard: Combo | null,
  opts: ComboOptions,
  stockAvailable: boolean,
): DrawChoice {
  if (!discard) return { source: 'stock' };

  const candidates = pickableFrom(discard);
  let best: { card: Card; gain: number } | null = null;
  const before = bestComboScore(hand, opts);

  for (const card of candidates) {
    // Le joker est évalué comme les autres : il vaut 0, donc il passe toujours
    // le critère « quasi gratuite » — à raison. Le porter ne coûte rien, et il
    // offre une défausse de secours pour un tour sans combinaison. L'ignorer
    // (comme le faisait une première version) laissait traîner sur la table la
    // seule carte du paquet qui ne présente aucun risque.
    const gain = bestComboScore([...hand, card], opts) - before - cardValue(card);
    if (!best || gain > best.gain) best = { card, gain };
  }

  if (best && (best.gain > 0 || cardValue(best.card) <= CHEAP_ENOUGH)) {
    return { source: 'discard', card: best.card };
  }
  return stockAvailable ? { source: 'stock' } : { source: 'discard', card: candidates[0] };
}

/**
 * Ce que vaut la meilleure pose de cette main.
 *
 * On réutilise sciemment le barème de la défausse, prime d'allègement comprise.
 * Mesurer en points seuls avait une conséquence qu'on ne voit qu'en jouant : le
 * robot refusait de ramasser le 2 qui lui aurait fait une paire, parce qu'une
 * paire de 2 rapporte moins de points qu'une figure isolée. Il gardait donc une
 * main de trois cartes sans combinaison — et comme on repioche toujours une
 * carte, une main sans combinaison ne rétrécit jamais. Quatre robots dans cet
 * état, chacun tenant un As et un 2, et la manche ne se terminait plus.
 */
function bestComboScore(hand: readonly Card[], opts: ComboOptions): number {
  const combos = findCombos(hand, opts);
  return combos.reduce((max, c) => Math.max(max, comboScore(c)), 0);
}

/**
 * Valeur qu'on prête à une carte adverse inconnue.
 *
 * La moyenne brute d'un paquet est de 6,5. Mais personne ne garde ses figures :
 * tout le monde purge par le haut, si bien qu'une carte encore en main en cours
 * de manche vaut nettement moins que la moyenne du paquet. Quatre est
 * l'estimation qui colle aux parties observées, et elle a le mérite d'être
 * prudente — elle surestime légèrement le danger plutôt que l'inverse.
 */
const TYPICAL_CARD_VALUE = 4;

/**
 * L'annonce.
 *
 * L'égalité profitant au contre-attaquant, annoncer sous le seuil n'est jamais
 * automatique : encore faut-il croire que personne ne fera mieux. Le seul
 * indice honnête est public — le **nombre de cartes** que chacun a en main.
 * Trois cartes, c'est une douzaine de points environ ; une seule, c'est une
 * menace immédiate.
 *
 * On compte donc les cartes adverses, pas les coups joués : un compteur qui
 * s'accumulerait sur toute la manche finirait par déclarer tout le monde
 * menaçant, et la manche ne se terminerait jamais.
 */
export function shouldCallZap(
  hand: readonly Card[],
  variants: ZapVariants,
  opponentHandCounts: readonly number[],
): boolean {
  const value = handValue(hand);
  if (value > variants.zapThreshold) return false;
  // Deux points ou moins : presque rien ne bat ça, on ne laisse pas passer.
  if (value <= 2) return true;
  if (opponentHandCounts.length === 0) return true;

  const lowestThreat = Math.min(...opponentHandCounts) * TYPICAL_CARD_VALUE;
  // Strictement inférieur : à estimation égale, le contre-attaquant l'emporte.
  return value < lowestThreat;
}

/* ------------------------------------------------------------------ */
/* Coup complet                                                        */
/* ------------------------------------------------------------------ */

export type BotMove =
  | { kind: 'deal'; handSize: number }
  | { kind: 'zap' }
  | { kind: 'discard'; cardIds: string[] }
  | { kind: 'draw'; from: { source: 'stock' } | { source: 'discard'; cardId: string } };

/** Le coup que joue le robot dans l'état courant, ou `null` si ce n'est pas son tour. */
/**
 * Options de remplacement.
 *
 * `announce: false` sert au joueur en pause : le robot joue sa main, mais ne
 * prend pas ses paris. Rater une annonce coûte trente points, et personne ne
 * doit les perdre pendant qu'il répond au téléphone.
 */
export interface BotMoveOptions {
  announce?: boolean;
}

export function botMove(
  state: GameState,
  playerId: string,
  { announce = true }: BotMoveOptions = {},
): BotMove | null {
  const round = state.round;
  if (!round) return null;
  const opts = comboOptions(state.variants);

  if (state.phase === 'dealing') {
    const dealer = state.players.find((p) => p.seat === round.dealerSeat);
    if (dealer?.id !== playerId) return null;
    return { kind: 'deal', handSize: chooseHandSize(state, playerId) };
  }

  if (state.phase !== 'playing') return null;
  const current = state.players.find((p) => p.seat === round.currentSeat);
  if (current?.id !== playerId) return null;
  const hand = round.hands[playerId] ?? [];

  if (round.turnStep === 'discard') {
    // `.length` seulement : le nombre de cartes de chacun est public — la vue
    // client l'expose sous `handCounts`. Le robot ne lit jamais le contenu.
    const opponentCounts = state.players
      .filter((p) => !p.eliminated && p.id !== playerId)
      .map((p) => (round.hands[p.id] ?? []).length);
    if (announce && shouldCallZap(hand, state.variants, opponentCounts)) return { kind: 'zap' };
    const combo = chooseDiscard(hand, opts, state.variants.zapThreshold);
    return { kind: 'discard', cardIds: combo.cards.map(cardId) };
  }

  const choice = chooseDraw(
    hand,
    round.lastDiscard?.combo ?? null,
    opts,
    round.stock.length > 0 || round.discardPile.length > 0,
  );
  return choice.source === 'stock'
    ? { kind: 'draw', from: { source: 'stock' } }
    : { kind: 'draw', from: { source: 'discard', cardId: cardId(choice.card!) } };
}
