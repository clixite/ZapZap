import { cardId, isJoker, sortHand } from './cards';
import type { Card, Combo, ComboKind } from './types';

/**
 * Ce qu'on a le droit de poser.
 *
 * Le module est volontairement isolé du reste du moteur : il ne connaît ni les
 * joueurs, ni le tour, ni le score. Il répond à une seule question — étant donné
 * une main et les réglages de la table, quelles combinaisons peut-on poser ? —
 * et il y répond par énumération exhaustive.
 *
 * L'exhaustivité est abordable ici : une main plafonne à 7 cartes, plus les
 * cartes accumulées en cours de manche, ce qui laisse quelques dizaines de
 * combinaisons. Aucune heuristique n'est nécessaire, et l'énumération complète
 * a un mérite décisif — l'interface peut proposer *toutes* les défausses
 * légales, et le robot les évaluer une par une.
 */

export interface ComboOptions {
  /** Longueur minimale d'une suite : 3 par défaut, 2 en variante. */
  minRun: number;
  /** Les suites doivent-elles être d'une seule couleur ? */
  sameSuitRuns: boolean;
}

export const DEFAULT_COMBO_OPTIONS: ComboOptions = { minRun: 3, sameSuitRuns: true };

/**
 * Clé de regroupement pour les ensembles.
 *
 * Les jokers ne se groupent qu'entre eux : ils n'ont pas de rang comparable, et
 * les règles sont explicites — ils se posent seuls ou par paire de jokers. Sans
 * cette clé séparée, un joker de rang interne 1 formerait une paire avec un As.
 */
function setKey(card: Card): string {
  return isJoker(card) ? 'J' : `r${card.rank}`;
}

/** Toutes les parties de taille ≥ 2 d'un groupe de cartes de même rang. */
function subsetsOfAtLeastTwo(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick: Card[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(cards[i]);
    if (pick.length >= 2) out.push(pick);
  }
  return out;
}

/**
 * Toutes les suites d'une main.
 *
 * On travaille couleur par couleur (ou sur la main entière en variante « toutes
 * couleurs »), sur les rangs distincts triés : deux 7 de couleurs différentes ne
 * donnent pas deux suites distinctes, ils donnent la même suite avec un choix de
 * carte, et le joueur se moque de savoir lequel de ses deux 7 part.
 *
 * Les doublons de rang sont donc écartés d'office — on garde la première carte
 * rencontrée du rang. C'est ce qui garde l'énumération courte et la liste de
 * propositions lisible à l'écran.
 */
function findRuns(hand: readonly Card[], opts: ComboOptions): Combo[] {
  const out: Combo[] = [];
  const playable = hand.filter((c) => !isJoker(c));
  const groups: Card[][] = opts.sameSuitRuns
    ? (['S', 'H', 'D', 'C'] as const).map((s) => playable.filter((c) => c.suit === s))
    : [playable];

  for (const group of groups) {
    const byRank = new Map<number, Card>();
    for (const card of group) if (!byRank.has(card.rank)) byRank.set(card.rank, card);
    const ranks = [...byRank.keys()].sort((a, b) => a - b);

    // On repère chaque plage de rangs consécutifs, puis on en extrait toutes les
    // sous-suites de longueur suffisante.
    let start = 0;
    while (start < ranks.length) {
      let end = start;
      while (end + 1 < ranks.length && ranks[end + 1] === ranks[end] + 1) end++;
      const runLength = end - start + 1;
      for (let len = opts.minRun; len <= runLength; len++) {
        for (let from = start; from + len - 1 <= end; from++) {
          const cards = ranks.slice(from, from + len).map((r) => byRank.get(r)!);
          out.push({ kind: 'run', cards });
        }
      }
      start = end + 1;
    }
  }
  return out;
}

/** Toutes les combinaisons posables depuis cette main. */
export function findCombos(hand: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): Combo[] {
  const combos: Combo[] = hand.map((card) => ({ kind: 'single' as const, cards: [card] }));

  const groups = new Map<string, Card[]>();
  for (const card of hand) {
    const key = setKey(card);
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const subset of subsetsOfAtLeastTwo(group)) combos.push({ kind: 'set', cards: subset });
  }

  combos.push(...findRuns(hand, opts));
  return combos.map((c) => ({ ...c, cards: sortHand(c.cards) }));
}

/** La combinaison la mieux nommée pour un jeu de cartes donné, ou `null`. */
export function classify(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): ComboKind | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) return 'single';

  const jokers = cards.filter(isJoker);
  if (jokers.length > 0) {
    // Un joker ne se mélange à rien : soit la pose n'est que des jokers, soit
    // elle est invalide. Un joker ne bouche jamais un trou dans une suite.
    return jokers.length === cards.length && cards.length === 2 ? 'set' : null;
  }

  const ranks = cards.map((c) => c.rank);
  if (ranks.every((r) => r === ranks[0])) {
    // Quatre cartes maximum par rang : au-delà, la pose vient de deux paquets.
    return cards.length <= 4 ? 'set' : null;
  }

  if (cards.length < opts.minRun) return null;
  if (opts.sameSuitRuns && !cards.every((c) => c.suit === cards[0].suit)) return null;
  const sorted = [...ranks].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return null;
  }
  return 'run';
}

/** La pose est-elle légale, et effectivement tirée de la main ? */
export function isLegalCombo(
  hand: readonly Card[],
  cards: readonly Card[],
  opts: ComboOptions = DEFAULT_COMBO_OPTIONS,
): boolean {
  if (cards.length === 0) return false;

  // Chaque carte posée doit exister dans la main, et ne peut servir qu'une fois.
  const pool = new Map<string, number>();
  for (const c of hand) pool.set(cardId(c), (pool.get(cardId(c)) ?? 0) + 1);
  for (const c of cards) {
    const left = pool.get(cardId(c)) ?? 0;
    if (left === 0) return false;
    pool.set(cardId(c), left - 1);
  }

  return classify(cards, opts) !== null;
}

/**
 * Les cartes qu'on peut reprendre dans une défausse.
 *
 * Sur une suite, seules la tête et la queue — prendre au milieu casserait la
 * suite en deux et rendrait la défausse illisible pour la table. Sur un ensemble,
 * n'importe laquelle, elles sont interchangeables. Sur une carte seule, elle.
 */
export function pickableFrom(combo: Combo): Card[] {
  if (combo.kind !== 'run') return [...combo.cards];
  const sorted = [...combo.cards].sort((a, b) => a.rank - b.rank);
  const head = sorted[0];
  const tail = sorted[sorted.length - 1];
  return head === tail ? [head] : [head, tail];
}
