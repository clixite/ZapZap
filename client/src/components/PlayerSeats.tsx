import { isBotId, type GameView, type Player } from '@zapzap/shared';
import type { FeltLayout } from './tableLayout';

/**
 * Les adversaires autour du tapis.
 *
 * Trois informations, et pas une de plus : qui c'est, **combien de cartes il
 * tient**, et son score. Le nombre de cartes est la seule donnée publique qui
 * permette d'évaluer le danger avant d'annoncer — c'est le cœur du jeu, il doit
 * se lire sans effort, d'où la pastille chiffrée plutôt qu'un empilement de dos
 * de cartes qu'il faudrait compter.
 */

export interface PlayerSeatsProps {
  view: GameView;
  layout: FeltLayout;
}

export function PlayerSeats({ view, layout }: PlayerSeatsProps) {
  const opponents = orderedOpponents(view);

  return (
    <>
      {opponents.map((player, i) => {
        const seat = layout.seats[i];
        if (!seat) return null;
        return (
          <Seat
            key={player.id}
            player={player}
            view={view}
            layout={layout}
            x={seat.x}
            y={seat.y}
            cards={view.round?.handCounts[player.id] ?? 0}
          />
        );
      })}
    </>
  );
}

/**
 * Les adversaires dans l'ordre du tour à partir de moi.
 *
 * Sans cette rotation, chacun verrait la table dans l'ordre des sièges du
 * serveur : le joueur qui suit ne serait pas au même endroit pour tout le
 * monde, et « c'est à ton voisin de gauche » perdrait tout sens.
 */
export function orderedOpponents(view: GameView): Player[] {
  const me = view.players.find((p) => p.id === view.you);
  if (!me) return view.players;
  const n = view.players.length;
  const ordered: Player[] = [];
  for (let i = 1; i < n; i++) {
    const player = view.players.find((p) => p.seat === (me.seat + i) % n);
    if (player) ordered.push(player);
  }
  return ordered;
}

function Seat({
  player,
  view,
  layout,
  x,
  y,
  cards,
}: {
  player: Player;
  view: GameView;
  layout: FeltLayout;
  x: number;
  y: number;
  cards: number;
}) {
  const round = view.round;
  const isPending =
    round !== null &&
    ((view.phase === 'dealing' && player.seat === round.dealerSeat) ||
      (view.phase === 'playing' && player.seat === round.currentSeat));
  const isDealer = round !== null && player.seat === round.dealerSeat;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: x, top: y, width: layout.seatW, transform: 'translate(-50%, -50%)' }}
    >
      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full bg-storm-700 ${isPending ? 'zz-turn' : ''}`}
          style={{
            width: layout.avatar,
            height: layout.avatar,
            fontSize: layout.avatar * 0.5,
            // Un joueur absent est estompé : la table doit voir qu'on l'attend
            // pour rien plutôt que de croire qu'il réfléchit.
            opacity: player.connected || isBotId(player.id) ? 1 : 0.45,
          }}
          aria-hidden="true"
        >
          {player.avatar}
        </div>

        {/* Cartes en main : l'indicateur de danger */}
        <span
          className="absolute -right-1 -bottom-1 flex min-w-5 items-center justify-center rounded-full bg-volt-500 px-1 text-[11px] font-bold text-storm-950"
          aria-hidden="true"
        >
          {cards}
        </span>

        {isDealer && (
          <span
            className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-flash-400 text-[9px] font-bold text-storm-950"
            title="Donneur"
            aria-hidden="true"
          >
            D
          </span>
        )}
      </div>

      {layout.showName && (
        <span className="mt-1 max-w-full truncate text-[11px] text-paper-100">{player.pseudo}</span>
      )}
      <span className="text-[10px] text-paper-300">
        {player.eliminated ? 'éliminé' : `${player.totalScore} pt`}
      </span>

      <span className="sr-only">
        {player.pseudo}, {cards} carte{cards > 1 ? 's' : ''} en main, {player.totalScore} points
        {player.eliminated ? ', éliminé' : ''}
        {isPending ? ', c’est à lui de jouer' : ''}
      </span>
    </div>
  );
}
