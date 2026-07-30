import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EMOTES, handValue, type EmoteId, type GameView } from '@zapzap/shared';
import { DealPicker, DealWaiting } from '../components/DealPicker';
import { HandFan } from '../components/HandFan';
import { EMOTE_GLYPHS, EventTicker, TurnCountdown, useEmoteBubbles } from '../components/LiveFeedback';
import { PassedCards } from '../components/PassedCards';
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
  const { view, error, busy, send, setError, listen, lastEvent } = useGame();
  const user = useSession((s) => s.user);
  const [selected, setSelected] = useState<string[]>([]);
  /** Premier tap sur ZapZap : armé. Deuxième : envoyé. Un raté coûte 30 points. */
  const [zapArmed, setZapArmed] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const bubbles = useEmoteBubbles(lastEvent);

  useEffect(() => listen(), [listen]);

  useEffect(() => {
    if (code && !view) void send('room:join', { code });
  }, [code, view, send]);

  // Ni la sélection ni l'annonce armée ne survivent au tour : garder l'une
  // ferait poser autre chose que ce qu'on croit, garder l'autre ferait annoncer
  // sur un simple tap au tour suivant.
  const step = view?.round?.turnStep;
  const seat = view?.round?.currentSeat;
  useEffect(() => {
    setSelected([]);
    setZapArmed(false);
  }, [step, seat, view?.phase]);

  useEffect(() => {
    if (!zapArmed) return;
    const timer = setTimeout(() => setZapArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [zapArmed]);

  useEffect(() => {
    if (view?.phase === 'game-over') navigate(`/fin/${view.code}`, { replace: true });
  }, [view?.phase, view?.code, navigate]);

  const [feltRef, layout] = useFeltLayout(Math.max(0, (view?.players.length ?? 1) - 1));

  if (!view || !user) {
    return <Centered>{error ?? 'Connexion à la table…'}</Centered>;
  }

  const round = view.round;
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

  const zap = async () => {
    if (!zapArmed) {
      setZapArmed(true);
      return;
    }
    setZapArmed(false);
    await send('game:zap');
  };

  const emote = async (id: EmoteId) => {
    setShowEmotes(false);
    await send('game:emote', { emote: id });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Le tapis */}
      <div ref={feltRef} className="relative min-h-0 flex-1">
        {round && view.phase !== 'dealing' && <PlayerSeats view={view} layout={layout} bubbles={bubbles} />}
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
          <div className="zz-scroll absolute inset-0 overflow-y-auto">
            {round?.dealChoices ? (
              <DealPicker view={view} onDeal={(handSize) => void send('game:deal', { handSize })} busy={busy} />
            ) : (
              <DealWaiting dealerPseudo={pending?.pseudo ?? '…'} />
            )}
          </div>
        )}

        {view.phase === 'round-scoring' && round && (
          <div className="zz-scroll absolute inset-0 overflow-y-auto bg-storm-900/95">
            <RoundRecap
              view={view}
              onNext={() => void send('game:nextRound')}
              canAdvance={view.pace === 'async' || view.hostId === view.you}
              busy={busy}
            />
          </div>
        )}

        {showLog && round && <PassedCards view={view} onClose={() => setShowLog(false)} />}

        {/* La ligne d'annonce, juste au-dessus de la ligne d'état */}
        <div className="absolute inset-x-0" style={{ bottom: STATUS_H }}>
          <EventTicker view={view} lastEvent={lastEvent} />
        </div>

        {/* Ligne d'état : réservée, rien ne descend dessus */}
        <div
          className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-2"
          style={{ height: STATUS_H }}
        >
          {round && view.phase === 'playing' && (
            <button
              type="button"
              onClick={() => setShowLog(true)}
              aria-label="Voir les cartes déjà passées"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-storm-800/80 text-lg"
            >
              🗂️
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
            <StatusLine view={view} myTurn={myTurn} pending={pending?.pseudo ?? null} />
            {view.turnDeadline != null && view.phase !== 'round-scoring' && (
              <TurnCountdown deadline={view.turnDeadline} mine={myTurn} />
            )}
          </div>

          {round && (
            <button
              type="button"
              onClick={() => setShowEmotes((s) => !s)}
              aria-label="Envoyer une réaction"
              aria-expanded={showEmotes}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-storm-800/80 text-lg"
            >
              😀
            </button>
          )}
        </div>

        {/* La rangée d'émotes, au-dessus de la ligne d'état */}
        {showEmotes && (
          <div
            className="zz-fade-up absolute inset-x-2 z-20 flex justify-center gap-1 rounded-2xl bg-storm-950/95 p-2"
            style={{ bottom: STATUS_H + 4 }}
            role="menu"
            aria-label="Réactions"
          >
            {EMOTES.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => void emote(id)}
                aria-label={`Réaction ${EMOTE_GLYPHS[id]}`}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-transform active:scale-90"
              >
                {EMOTE_GLYPHS[id]}
              </button>
            ))}
          </div>
        )}
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
          onZap={zap}
          zapArmed={zapArmed}
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

/**
 * Largeur utile pour l'éventail, suivie en continu.
 *
 * La mesurer une fois au montage laissait la main figée sur l'ancienne largeur
 * après une rotation de l'écran — sept cartes calibrées pour le portrait,
 * affichées en paysage.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 360 : window.innerWidth));
  useEffect(() => {
    const measure = () => setWidth(window.innerWidth);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);
  return width;
}

function HandArea({
  view,
  selected,
  onToggle,
  interactive,
  onDiscard,
  onZap,
  zapArmed,
  busy,
  total,
}: {
  view: GameView;
  selected: string[];
  onToggle: (id: string) => void;
  interactive: boolean;
  onDiscard: () => void;
  onZap: () => void;
  zapArmed: boolean;
  busy: boolean;
  total: number;
}) {
  const width = useViewportWidth();
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
          L'annonce est à part, en ambre, et en deux temps : un raté coûte 30
          points, un pari pareil ne se déclenche pas d'un pouce qui glisse. Le
          premier tap arme, le second confirme, et tout se désarme en trois
          secondes ou au changement de tour.
        */}
        {canZap && (
          <button
            type="button"
            onClick={onZap}
            disabled={busy}
            aria-live="polite"
            className={`zz-zap flex-1 rounded-xl py-3 font-display text-lg font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-50 ${
              zapArmed ? 'bg-danger text-white' : 'bg-flash-400'
            }`}
          >
            {zapArmed ? (
              <>
                Confirmer&nbsp;? <span className="text-sm font-medium">({total} pt — raté = +30)</span>
              </>
            ) : (
              <>
                ZapZap&nbsp;! <span className="text-sm font-medium">({total} pt)</span>
              </>
            )}
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
