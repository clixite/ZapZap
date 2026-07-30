import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cardId, handValue, type GameView } from '@zapzap/shared';
import { DealPicker, DealWaiting } from '../components/DealPicker';
import { HandFan } from '../components/HandFan';
import { PlayerSeats } from '../components/PlayerSeats';
import { RoundRecap } from '../components/RoundRecap';
import { TableCentre } from '../components/TableCentre';
import { STATUS_H, useFeltLayout } from '../components/tableLayout';
import { useGame } from '../store/game';
import { useSession } from '../store/session';

/**
 * La table.
 *
 * L'écran est en deux parties fixes : le tapis en haut, la main en bas. La main
 * ne bouge jamais et n'est jamais masquée — pas même pendant la donne ou le
 * décompte — parce qu'un joueur qui doit se souvenir de ses cartes pour lire un
 * panneau joue mal.
 */
export function Table() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { view, error, busy, send, setError, listen } = useGame();
  const user = useSession((s) => s.user);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => listen(), [listen]);

  useEffect(() => {
    if (code && !view) void send('room:join', { code });
  }, [code, view, send]);

  // La sélection ne survit pas au tour : garder des cartes cochées d'un tour à
  // l'autre ferait poser autre chose que ce qu'on croit.
  const step = view?.round?.turnStep;
  const seat = view?.round?.currentSeat;
  useEffect(() => setSelected([]), [step, seat, view?.phase]);

  useEffect(() => {
    if (view?.phase === 'game-over') navigate(`/fin/${view.code}`, { replace: true });
  }, [view?.phase, view?.code, navigate]);

  const [feltRef, layout] = useFeltLayout(Math.max(0, (view?.players.length ?? 1) - 1));

  if (!view || !user) {
    return <Centered>{error ?? 'Connexion à la table…'}</Centered>;
  }

  const round = view.round;
  const me = view.players.find((p) => p.id === view.you)!;
  const pendingSeat = view.phase === 'dealing' ? round?.dealerSeat : round?.currentSeat;
  const pending = view.players.find((p) => p.seat === pendingSeat) ?? null;
  const myTurn = pending?.id === view.you;
  const canDiscard = view.phase === 'playing' && myTurn && round?.turnStep === 'discard';

  const hand = round?.myHand ?? [];
  const total = handValue(hand);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const discard = async () => {
    if (selected.length === 0) return;
    const done = await send('game:discard', { cardIds: selected });
    if (done) setSelected([]);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Le tapis */}
      <div ref={feltRef} className="relative min-h-0 flex-1">
        {round && view.phase !== 'dealing' && <PlayerSeats view={view} layout={layout} />}
        {round && view.phase === 'playing' && (
          <TableCentre
            layout={layout}
            stockCount={round.stockCount}
            lastDiscard={round.lastDiscard}
            drawOptions={round.drawOptions}
            onDrawStock={() => void send('game:draw', { source: 'stock' })}
            onDrawDiscard={(id) => void send('game:draw', { source: 'discard', cardId: id })}
            busy={busy}
          />
        )}

        {view.phase === 'dealing' && (
          <div className="absolute inset-0 overflow-y-auto zz-scroll">
            {round?.dealChoices ? (
              <DealPicker view={view} onDeal={(handSize) => void send('game:deal', { handSize })} busy={busy} />
            ) : (
              <DealWaiting dealerPseudo={pending?.pseudo ?? '…'} />
            )}
          </div>
        )}

        {view.phase === 'round-scoring' && round && (
          <div className="absolute inset-0 overflow-y-auto zz-scroll bg-storm-900/95">
            <RoundRecap
              view={view}
              onNext={() => void send('game:nextRound')}
              canAdvance={view.pace === 'async' || view.hostId === view.you}
              busy={busy}
            />
          </div>
        )}

        {/* Ligne d'état : réservée, rien ne descend dessus */}
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-center px-3"
          style={{ height: STATUS_H }}
        >
          <StatusLine view={view} myTurn={myTurn} pending={pending?.pseudo ?? null} />
        </div>
      </div>

      {/* La main, toujours visible */}
      <div
        className="shrink-0 rounded-t-2xl bg-storm-800/80 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ boxShadow: 'var(--shadow-panel)' }}
      >
        <HandArea
          view={view}
          selected={selected}
          onToggle={toggle}
          interactive={canDiscard && !busy}
          onDiscard={discard}
          onZap={() => void send('game:zap')}
          busy={busy}
          total={total}
        />
      </div>

      {error && (
        <button
          type="button"
          onClick={() => setError(null)}
          className="zz-fade-up fixed inset-x-4 bottom-24 z-50 rounded-xl bg-danger px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {error}
        </button>
      )}
    </div>
  );
}

function HandArea({
  view,
  selected,
  onToggle,
  interactive,
  onDiscard,
  onZap,
  busy,
  total,
}: {
  view: GameView;
  selected: string[];
  onToggle: (id: string) => void;
  interactive: boolean;
  onDiscard: () => void;
  onZap: () => void;
  busy: boolean;
  total: number;
}) {
  const width = useMemo(() => (typeof window === 'undefined' ? 360 : window.innerWidth), []);
  const round = view.round;
  const hand = round?.myHand ?? [];
  const canZap = round?.canZap ?? false;

  return (
    <div className="flex flex-col gap-2">
      <HandFan
        hand={hand}
        selected={selected}
        onToggle={onToggle}
        interactive={interactive}
        variants={view.variants}
        width={width}
      />

      <div className="flex gap-2 px-3">
        {/*
          L'annonce est à part et en ambre : c'est un pari, pas un coup. La
          confondre avec « défausser » ferait perdre des parties sur un geste.
        */}
        {canZap && (
          <button
            type="button"
            onClick={onZap}
            disabled={busy}
            className="zz-zap flex-1 rounded-xl bg-flash-400 py-3 font-display text-lg font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            ZapZap ! <span className="text-sm font-medium">({total} pt)</span>
          </button>
        )}
        <button
          type="button"
          onClick={onDiscard}
          disabled={!interactive || selected.length === 0 || busy}
          className="flex-1 rounded-xl bg-volt-500 py-3 font-display text-lg font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          Défausser
        </button>
      </div>
    </div>
  );
}

function StatusLine({ view, myTurn, pending }: { view: GameView; myTurn: boolean; pending: string | null }) {
  const round = view.round;
  let text: string;

  if (view.phase === 'dealing') {
    text = myTurn ? 'À vous de donner' : `${pending ?? '…'} donne`;
  } else if (view.phase === 'round-scoring') {
    text = 'Manche terminée';
  } else if (myTurn) {
    text = round?.turnStep === 'discard' ? 'À vous — défaussez' : 'Maintenant, piochez';
  } else {
    text = `Au tour de ${pending ?? '…'}`;
  }

  return (
    <p
      className={`truncate text-sm font-medium ${myTurn ? 'text-volt-300' : 'text-paper-300'}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </p>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">{children}</div>;
}

export { cardId };
