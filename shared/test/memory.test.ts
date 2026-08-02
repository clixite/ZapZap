import { describe, expect, it } from 'vitest';
import { cardId } from '../src/cards';
import { deadByRank, readRoundMemory } from '../src/memory';
import type { Card, RoundEvent } from '../src/types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const ids = (cards: readonly Card[]) => cards.map(cardId).sort();

/** Une pose d'une seule carte, la forme la plus courante du journal. */
const poses = (playerId: string, card: Card): RoundEvent => ({
  type: 'discard',
  playerId,
  combo: { kind: 'single', cards: [card] },
});

const donne = (upCard: Card): RoundEvent => ({ type: 'deal', dealerSeat: 0, handSize: 5, upCard });

describe('ce que la table a vu passer', () => {
  it('ne compte pas la dernière pose parmi les cartes mortes', () => {
    /*
     * C'est le point délicat de tout le module : la dernière pose est sur la
     * défausse, donc visible, mais elle est **encore ramassable** par le joueur
     * suivant. La compter comme morte serait faux au sens le plus fort — c'est
     * précisément la seule carte que quelqu'un peut encore récupérer.
     */
    const memory = readRoundMemory([donne(c('S', 2)), poses('a', c('H', 7))]);
    expect(ids(memory.dead)).toEqual(ids([c('S', 2)]));
    expect(ids(memory.dead)).not.toContain(cardId(c('H', 7)));
  });

  it('enterre une pose dès que la suivante arrive', () => {
    const memory = readRoundMemory([donne(c('S', 2)), poses('a', c('H', 7)), poses('b', c('D', 9))]);
    expect(ids(memory.dead)).toEqual(ids([c('S', 2), c('H', 7)]));
  });

  it('sait qui tient une carte ramassée', () => {
    // Reprendre dans la défausse se fait sous les yeux de tous : c'est le prix
    // de ce coup, et la raison pour laquelle piocher à l'aveugle est le défaut.
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-discard', playerId: 'b', card: c('H', 7) },
    ]);
    expect(ids(memory.held['b'] ?? [])).toEqual(ids([c('H', 7)]));
    // Et elle n'est ni morte ni sur la table : elle est dans une main.
    expect(ids(memory.dead)).toEqual(ids([c('S', 2)]));
  });

  it('oublie ce qu’un joueur repose', () => {
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-discard', playerId: 'b', card: c('H', 7) },
      poses('b', c('H', 7)),
    ]);
    expect(memory.held['b']).toBeUndefined();
  });

  it('ne retient d’une pose que les cartes qu’on lui connaissait', () => {
    // `b` avait ramassé le 7♥ ; il pose une paire de 7. Le 7♠ n'a jamais été
    // vu chez lui, mais le 7♥ doit bien quitter ce qu'on lui connaît.
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-discard', playerId: 'b', card: c('H', 7) },
      { type: 'discard', playerId: 'b', combo: { kind: 'set', cards: [c('H', 7), c('S', 7)] } },
    ]);
    expect(memory.held['b']).toBeUndefined();
  });

  it('la carte retournée à la donne est ramassable, donc pas morte', () => {
    const memory = readRoundMemory([donne(c('S', 2))]);
    expect(memory.dead).toEqual([]);
  });

  it('un remélange remet les compteurs à zéro, et le dit', () => {
    /*
     * Le seul moment où l'information se périme d'un coup. Un joueur qui
     * continuerait de compter sur « les trois 7 sont tombés » jouerait sur une
     * certitude devenue fausse — le pire des états.
     */
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      poses('b', c('D', 9)),
      { type: 'reshuffle', cards: 12 },
    ]);
    expect(memory.dead).toEqual([]);
    expect(memory.reshuffled).toBe(true);
  });

  it('mais un remélange ne fait pas oublier ce qu’on sait des mains', () => {
    // Ces cartes-là sont chez quelqu'un, pas dans le tas qu'on vient de battre.
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-discard', playerId: 'b', card: c('H', 7) },
      { type: 'reshuffle', cards: 12 },
    ]);
    expect(ids(memory.held['b'] ?? [])).toEqual(ids([c('H', 7)]));
  });

  it('ignore les pioches à l’aveugle — on ne sait pas ce qu’elles donnent', () => {
    const blind = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-stock', playerId: 'a' },
    ]);
    expect(blind.held).toEqual({});
  });

  it('ne devine jamais une main : seul le journal parle', () => {
    // Un journal vide ne dit rien de personne. C'est la garantie que ce panneau
    // ne peut pas divulguer d'information cachée.
    const memory = readRoundMemory([]);
    expect(memory.dead).toEqual([]);
    expect(memory.held).toEqual({});
    expect(memory.reshuffled).toBe(false);
  });

  it('compte les tombées par rang, ce qui est la vraie question', () => {
    const memory = readRoundMemory([
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      poses('b', c('D', 7)),
      poses('c', c('C', 7)),
      poses('a', c('S', 9)),
    ]);
    const counts = deadByRank(memory.dead);
    // Trois 7 sont morts : le quatrième court encore, et la paire qu'on gardait
    // ne se complétera qu'avec lui.
    expect(counts.get(7)).toBe(3);
    expect(counts.get(2)).toBe(1);
    // Le 9 vient d'être posé : il est encore ramassable, donc pas compté.
    expect(counts.get(9)).toBeUndefined();
  });

  it('ne perd aucune carte au fil d’une manche entière', () => {
    // Invariant : tout ce qui a été posé est soit mort, soit sur la table, soit
    // dans une main connue. Rien ne doit s'évaporer.
    const log: RoundEvent[] = [
      donne(c('S', 2)),
      poses('a', c('H', 7)),
      { type: 'draw-discard', playerId: 'b', card: c('H', 7) },
      poses('b', c('D', 3)),
      { type: 'draw-stock', playerId: 'c' },
      poses('c', c('C', 10)),
    ];
    const memory = readRoundMemory(log);
    const accounted = new Set([
      ...memory.dead.map(cardId),
      ...Object.values(memory.held).flat().map(cardId),
      // La dernière pose, encore en jeu.
      cardId(c('C', 10)),
    ]);
    // Les quatre cartes entrées dans le registre public : la retournée, celle
    // que `b` a reprise, et les deux posées depuis.
    expect(accounted).toEqual(
      new Set([cardId(c('S', 2)), cardId(c('H', 7)), cardId(c('D', 3)), cardId(c('C', 10))]),
    );
    // Le 7♥ est reparti dans la main de `b`, qui ne l'a pas reposé.
    expect(ids(memory.held['b'] ?? [])).toEqual(ids([c('H', 7)]));
  });
});
