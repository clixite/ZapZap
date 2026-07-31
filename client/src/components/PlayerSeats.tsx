import { useEffect, useState } from 'react';
import { isBotId, type EmoteId, type GameView, type Player } from '@zapzap/shared';
import { useT } from '../i18n';
import { MiniCards } from './CardFace';
import { EMOTE_GLYPHS } from './LiveFeedback';
import type { FeltLayout } from './tableLayout';

/**
 * Les adversaires autour du tapis.
 *
 * Trois informations, et pas une de plus : qui c'est, **combien de cartes il
 * tient**, et son score. Le nombre de cartes est la seule donnée publique qui
 * permette d'évaluer le danger avant d'annoncer — c'est le cœur du jeu, il doit
 * se lire sans effort, d'où la pastille chiffrée plutôt qu'un empilement de dos
 * de cartes qu'il faudrait compter.
 *
 * Deux ajouts qui répondent à la même question — *qui joue, et qui a posé quoi* :
 *
 *  - l'anneau du tour entoure l'avatar de celui dont c'est le tour et **se vide
 *    avec son temps**. C'est la convention des jeux de cartes en ligne : le
 *    joueur actif n'est pas signalé quelque part, il est signalé *sur lui* ;
 *  - la pose en cours s'affiche **sous le siège de son auteur**, le temps qu'il
 *    pioche. Avant, elle n'apparaissait au centre qu'une fois son tour fini :
 *    on voyait les cartes changer sans jamais voir qui les avait mises.
 */

export interface PlayerSeatsProps {
  view: GameView;
  layout: FeltLayout;
  /** Émote en cours par joueur — rendue en bulle au-dessus du siège. */
  bubbles?: Record<string, EmoteId>;
}

export function PlayerSeats({ view, layout, bubbles = {} }: PlayerSeatsProps) {
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
            bubble={bubbles[player.id] ?? null}
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

/**
 * L'anneau du tour : le temps qui reste, tracé autour de l'avatar.
 *
 * Un simple halo disait « c'est à lui » ; il ne disait pas « il lui reste dix
 * secondes ». L'anneau se vide, passe à l'ambre sur la fin, et reste plein
 * quand la table joue sans minuteur — la même pièce sert aux deux rythmes.
 */
function TurnRing({ size, deadline }: { size: number; deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (deadline == null) return;
    setTotal(Math.max(1, deadline - Date.now()));
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const remaining = deadline == null ? 1 : Math.max(0, deadline - now);
  const ratio = deadline == null ? 1 : total > 0 ? Math.min(1, remaining / total) : 0;
  const urgent = deadline != null && remaining <= 10_000;
  const stroke = Math.max(2.5, size * 0.07);
  const r = (size - stroke) / 2 + stroke;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      className="pointer-events-none absolute -inset-[6px] -rotate-90"
      viewBox={`0 0 ${(r + stroke) * 2} ${(r + stroke) * 2}`}
      aria-hidden="true"
    >
      <circle
        cx={r + stroke}
        cy={r + stroke}
        r={r}
        fill="none"
        stroke="var(--color-storm-600)"
        strokeWidth={stroke}
      />
      <circle
        cx={r + stroke}
        cy={r + stroke}
        r={r}
        fill="none"
        stroke={urgent ? 'var(--color-flash-400)' : 'var(--color-volt-400)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
        className="transition-[stroke-dashoffset] duration-300 ease-linear"
      />
    </svg>
  );
}

function Seat({
  player,
  view,
  layout,
  x,
  y,
  cards,
  bubble,
}: {
  player: Player;
  view: GameView;
  layout: FeltLayout;
  x: number;
  y: number;
  cards: number;
  bubble: EmoteId | null;
}) {
  const t = useT();
  const round = view.round;
  const isPending =
    round !== null &&
    ((view.phase === 'dealing' && player.seat === round.dealerSeat) ||
      (view.phase === 'playing' && player.seat === round.currentSeat));
  const isDealer = round !== null && player.seat === round.dealerSeat;
  // La pose qu'il vient de faire et qui n'est pas encore passée au centre.
  const posing = round?.pendingDiscard?.playerId === player.id ? round.pendingDiscard : null;

  return (
    <div
      className="absolute flex flex-col items-center transition-opacity duration-300"
      style={{
        left: x,
        top: y,
        width: layout.seatW,
        transform: 'translate(-50%, -50%)',
        // Le joueur actif est le seul à pleine intensité : la table se lit d'un
        // coup d'œil, sans chercher lequel des cinq avatars est allumé.
        opacity: round === null || isPending ? 1 : 0.62,
      }}
    >
      <div className="relative">
        {isPending && <TurnRing size={layout.avatar} deadline={view.turnDeadline ?? null} />}
        {bubble && (
          <span
            className="zz-zap absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-paper-50 px-1.5 py-0.5 text-base shadow-lg"
            role="img"
            aria-label={`${player.pseudo} réagit`}
          >
            {EMOTE_GLYPHS[bubble]}
          </span>
        )}
        <div
          className={`flex items-center justify-center rounded-full bg-storm-700 ${isPending ? 'zz-turn' : ''}`}
          style={{
            width: layout.avatar,
            height: layout.avatar,
            fontSize: layout.avatar * 0.5,
            // Un joueur absent est estompé : la table doit voir qu'on l'attend
            // pour rien plutôt que de croire qu'il réfléchit.
            opacity: player.away || (!player.connected && !isBotId(player.id)) ? 0.45 : 1,
          }}
          aria-hidden="true"
        >
          {player.avatar}
        </div>

        {/*
          Cartes en main : l'indicateur de danger.

          C'est la seule information publique qui permette d'évaluer le risque
          avant d'annoncer, et elle se lit d'autant plus vite qu'elle est
          colorée. Deux cartes ou moins, l'adversaire peut annoncer au prochain
          tour : la pastille passe au rouge et pulse. Le chiffre seul obligeait
          à faire le tour de la table et à comparer.
        */}
        <span
          className={`absolute -right-1 -bottom-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
            cards <= 2
              ? 'zz-turn bg-danger text-white'
              : cards <= 4
                ? 'bg-flash-400 text-storm-950'
                : 'bg-volt-500 text-storm-950'
          }`}
          aria-hidden="true"
        >
          {cards}
        </span>

        {/*
          En pause : la table doit savoir qu'elle joue contre un robot sur ce
          siège. Le cacher serait mentir sur qui joue — et le rythme régulier du
          remplaçant trahirait l'absence de toute façon.
        */}
        {player.away && (
          <span
            className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-storm-950/90 px-1.5 text-[9px] font-bold text-flash-300"
            title={t.table.pausedBanner}
          >
            {t.table.paused}
          </span>
        )}

        {isDealer && (
          <span
            className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-flash-400 text-[9px] font-bold text-storm-950"
            title={t.table.dealer}
            aria-hidden="true"
          >
            D
          </span>
        )}
      </div>

      {layout.showName && (
        <span
          // `mt-2` et non `mt-1` : la pastille du nombre de cartes déborde sous
          // l'avatar, et le pseudo du joueur actif — désormais sur fond plein —
          // venait la chevaucher.
          className={`mt-2 max-w-full truncate rounded-full px-1.5 text-[11px] ${
            isPending ? 'bg-volt-500 font-bold text-storm-950' : 'text-paper-100'
          }`}
        >
          {player.pseudo}
        </span>
      )}
      <span className="text-[10px] text-paper-300">
        {player.eliminated ? (player.forfeited ? t.table.left : t.table.eliminated) : t.table.pt(player.totalScore)}
      </span>

      {/*
        Ce qu'il vient de poser, attaché à lui.

        C'est l'attribution que le centre du tapis ne peut pas donner : au
        centre, les cartes sont là, mais rien ne dit de quelle main elles
        sortent. Ici, la pose est sous son avatar tant qu'il n'a pas pioché.
      */}
      {posing && (
        <span className="zz-fade-up absolute top-full left-1/2 z-10 mt-0.5 flex -translate-x-1/2 items-center gap-1 rounded-full bg-storm-950/90 px-1.5 py-0.5 whitespace-nowrap ring-1 ring-volt-400/60">
          <MiniCards cards={posing.combo.cards} size={10} />
        </span>
      )}

      <span className="sr-only">
        {t.table.seatSummary(player.pseudo, cards, player.totalScore)}
        {cards <= 2 ? t.table.canZap : ''}
        {player.eliminated ? (player.forfeited ? t.table.hasLeft : t.table.isEliminated) : ''}
        {player.away ? t.table.isPaused : ''}
        {isPending ? t.table.itsTheirTurn : ''}
      </span>
    </div>
  );
}
