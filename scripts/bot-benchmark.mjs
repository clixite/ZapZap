/**
 * Banc d'essai des joueurs automatiques.
 *
 * Fait jouer des parties entières de robot contre robot et mesure ce qui
 * détermine si le jeu tient debout :
 *
 *  - la **longueur des manches**. Une manche ne se termine que sur une annonce ;
 *    si les robots n'allègent pas leur main, elle ne finit jamais. C'est le
 *    premier risque du jeu, et le plus facile à laisser passer.
 *  - l'**équité entre sièges**. Tous les robots partagent la même stratégie :
 *    si l'un gagne bien plus souvent, c'est la place à table qui décide, pas le
 *    jeu.
 *  - le **taux de réussite des annonces**. Trop haut, annoncer est gratuit ;
 *    trop bas, personne n'ose et la manche s'éternise.
 *
 * Usage :
 *   npm run bench:bots
 *   GAMES=200 PLAYERS=4 npm run bench:bots
 */

import { botMove, botProfile } from '../shared/src/bot.ts';
import { applyAction, createGame } from '../shared/src/engine.ts';

const GAMES = Number(process.env.GAMES ?? 60);
const PLAYERS = Number(process.env.PLAYERS ?? 4);
const MAX_STEPS = 50_000;

function ok(state, action) {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`${action.type} refusée : ${res.error}`);
  return res.state;
}

function playGame(seed) {
  let state = createGame('BENC', seed, 0, { ...botProfile(0) });
  for (let i = 1; i < PLAYERS; i++) {
    state = ok(state, { type: 'ADD_PLAYER', player: { ...botProfile(i) } });
  }
  state = ok(state, { type: 'START_GAME', playerId: botProfile(0).id });

  const stats = { rounds: 0, turns: [], zapsCalled: 0, zapsWon: 0, turnsThisRound: 0 };

  for (let step = 0; step < MAX_STEPS && state.phase !== 'game-over'; step++) {
    if (state.phase === 'round-scoring') {
      const call = state.round.zapCall;
      if (call) {
        stats.zapsCalled += 1;
        if (call.success) stats.zapsWon += 1;
      }
      stats.rounds += 1;
      stats.turns.push(stats.turnsThisRound);
      stats.turnsThisRound = 0;
      state = ok(state, { type: 'NEXT_ROUND', playerId: state.hostId });
      continue;
    }

    const round = state.round;
    const seat = state.phase === 'dealing' ? round.dealerSeat : round.currentSeat;
    const actor = state.players.find((p) => p.seat === seat);
    const move = botMove(state, actor.id);
    if (!move) throw new Error(`Aucun coup pour ${actor.id} en phase ${state.phase}`);

    if (move.kind === 'deal') state = ok(state, { type: 'DEAL', playerId: actor.id, handSize: move.handSize });
    else if (move.kind === 'zap') state = ok(state, { type: 'CALL_ZAP', playerId: actor.id });
    else if (move.kind === 'discard') {
      stats.turnsThisRound += 1;
      state = ok(state, { type: 'DISCARD', playerId: actor.id, cardIds: move.cardIds });
    } else state = ok(state, { type: 'DRAW', playerId: actor.id, from: move.from });
  }

  if (state.phase !== 'game-over') throw new Error(`Partie ${seed} non terminée après ${MAX_STEPS} coups`);
  const winner = state.players.find((p) => p.finishRank === 1);
  return { ...stats, winnerSeat: winner.seat };
}

const wins = new Array(PLAYERS).fill(0);
let rounds = 0;
let zapsCalled = 0;
let zapsWon = 0;
const roundLengths = [];

const started = process.hrtime.bigint();
for (let i = 0; i < GAMES; i++) {
  const r = playGame(`bench-${PLAYERS}-${i}`);
  wins[r.winnerSeat] += 1;
  rounds += r.rounds;
  zapsCalled += r.zapsCalled;
  zapsWon += r.zapsWon;
  roundLengths.push(...r.turns);
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

roundLengths.sort((a, b) => a - b);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];

const winRates = wins.map((w) => (100 * w) / GAMES);
const spread = Math.max(...winRates) - Math.min(...winRates);

console.log(`${GAMES} parties à ${PLAYERS} joueurs, ${(elapsedMs / GAMES).toFixed(0)} ms par partie\n`);
console.log(`Manches par partie      ${(rounds / GAMES).toFixed(1)}`);
console.log(`Tours par manche        ${mean(roundLengths).toFixed(1)} (médiane ${pct(roundLengths, 50)}, p95 ${pct(roundLengths, 95)}, max ${roundLengths.at(-1)})`);
console.log(`Annonces réussies       ${((100 * zapsWon) / zapsCalled).toFixed(0)} %`);
console.log(`Victoires par siège     ${winRates.map((r) => `${r.toFixed(0)} %`).join('  ')}`);
console.log(`Écart entre sièges      ${spread.toFixed(0)} points\n`);

// Seuils volontairement larges : le banc doit signaler un jeu cassé, pas
// remettre en cause une stratégie qui se contente d'être différente.
const problems = [];
if (mean(roundLengths) > 60) problems.push(`manches trop longues (${mean(roundLengths).toFixed(1)} tours)`);
if (roundLengths.at(-1) > 250) problems.push(`une manche de ${roundLengths.at(-1)} tours : la table peut se figer`);
if (zapsWon / zapsCalled > 0.95) problems.push('les annonces réussissent presque toujours : le risque a disparu');
if (zapsWon / zapsCalled < 0.2) problems.push('les annonces échouent presque toujours : personne n’osera annoncer');
if (spread > 35) problems.push(`la place à table décide (${spread.toFixed(0)} points d’écart)`);

if (problems.length > 0) {
  console.error('Problèmes :');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Rien à signaler.');
