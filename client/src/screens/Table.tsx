import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EMOTES, handValue, type EmoteId, type GameView } from '@zapzap/shared';
import { isMuted, play, setMuted } from '../audio';
import { DealPicker, DealWaiting } from '../components/DealPicker';
import { HandFan } from '../components/HandFan';
import { EMOTE_GLYPHS, EventTicker, TurnCountdown, useEmoteBubbles } from '../components/LiveFeedback';
import { IconBack, IconHistory, IconMuted, IconSmile, IconSound } from '../components/icons';
import { PassedCards } from '../components/PassedCards';
import { PlayerSeats } from '../components/PlayerSeats';
import { RoundRecap } from '../components/RoundRecap';
import { TableCentre } from '../components/TableCentre';
import { STATUS_H, useFeltLayout } from '../components/tableLayout';
import { vibrate } from '../haptics';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGame, useView } from '../store/game';
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
  // Sélecteurs unitaires : `send` bascule `busy` deux fois par coup, et
  // prendre le store entier faisait re-rendre tout le tapis à chaque bascule.
  const error = useGame((s) => s.error);
  const busy = useGame((s) => s.busy);
  const send = useGame((s) => s.send);
  const playMove = useGame((s) => s.play);
  const setError = useGame((s) => s.setError);
  const listen = useGame((s) => s.listen);
  const lastEvent = useGame((s) => s.lastEvent);
  const view = useView();
  const user = useSession((s) => s.user);
  const [selected, setSelected] = useState<string[]>([]);
  /** Premier tap sur ZapZap : armé. Deuxième : envoyé. Un raté coûte 30 points. */
  const [zapArmed, setZapArmed] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const bubbles = useEmoteBubbles(lastEvent);
  /** Vrai pendant la seconde qui suit la donne : la main entre carte par carte. */
  const [dealing, setDealing] = useState(false);

  useEffect(() => listen(), [listen]);

  // L'écran reste allumé tant qu'on est à table : regarder les autres jouer,
  // c'est ne pas toucher son téléphone.
  useWakeLock(view !== null && view.phase !== 'game-over');

  // La bande-son de la table : chaque événement s'entend, l'haptique suit.
  useEffect(() => {
    if (!lastEvent || !view) return;
    switch (lastEvent.type) {
      case 'dealt':
        play('deal');
        break;
      case 'discarded':
        if (lastEvent.playerId !== view.you) play('discard');
        break;
      case 'drew-stock':
      case 'drew-discard':
        if (lastEvent.playerId !== view.you) play('draw');
        break;
      case 'zap-called':
        play(lastEvent.success ? 'zapWin' : 'zapFail');
        vibrate(lastEvent.success ? 'success' : 'failure');
        break;
      case 'player-eliminated':
        play('eliminated');
        if (lastEvent.playerId === view.you) vibrate('failure');
        break;
      case 'player-joined':
        play('join');
        break;
      default:
        break;
    }
    // Réagir à l'événement seul : la vue change à chaque diffusion d'état.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

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

  // « C'est à toi » s'entend : le joueur a souvent l'écran dans la poche.
  const pendingSeatNow = view?.phase === 'dealing' ? view.round?.dealerSeat : view?.round?.currentSeat;
  const pendingIsMe =
    view !== null && view.players.find((p) => p.seat === pendingSeatNow)?.id === view.you;
  useEffect(() => {
    if (pendingIsMe) {
      play('yourTurn');
      vibrate('nudge');
    }
  }, [pendingIsMe]);

  // La distribution s'anime une fois par manche, au passage en jeu.
  const roundIndex = view?.round?.roundIndex;
  const inPlay = view?.phase === 'playing';
  useEffect(() => {
    if (!inPlay) return;
    setDealing(true);
    const timer = setTimeout(() => setDealing(false), 900);
    return () => clearTimeout(timer);
  }, [inPlay, roundIndex]);

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

  const toggle = (id: string) => {
    vibrate('tap');
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const discard = async () => {
    if (selected.length === 0) return;
    // Le son et l'haptique partent avec le geste, pas avec la réponse : c'est
    // le doigt qui doit être récompensé, pas le réseau.
    play('discard');
    vibrate('play');
    setSelected([]);
    await playMove('game:discard', { cardIds: selected }, { kind: 'discard', cardIds: selected });
  };

  const draw = async (from: { source: 'stock' } | { source: 'discard'; cardId: string }) => {
    play('draw');
    vibrate('play');
    await playMove('game:draw', from, {
      kind: 'draw',
      from: from.source,
      cardId: from.source === 'discard' ? from.cardId : undefined,
    });
  };

  const zap = async () => {
    if (!zapArmed) {
      setZapArmed(true);
      return;
    }
    setZapArmed(false);
    await playMove('game:zap', undefined, { kind: 'zap' });
  };

  const emote = async (id: EmoteId) => {
    setShowEmotes(false);
    await send('game:emote', { emote: id });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Le tapis */}
      <div
        ref={feltRef}
        // Le feutre a sa propre matière, distincte du fond de l'application :
        // sans elle, la table n'était qu'une zone du dégradé général.
        className="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_75%_60%_at_50%_42%,var(--color-storm-800),transparent_72%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.3)]"
      >
        {/* Sortie de partie : discrète, en deux temps — elle affecte toute la table. */}
        <div className="absolute top-1 left-1 z-20">
          {confirmLeave ? (
            <div className="zz-fade-up flex items-center gap-1 rounded-xl bg-storm-950/95 p-1">
              <button
                type="button"
                onClick={async () => {
                  await send('room:leave');
                  setError(null);
                  navigate('/');
                }}
                className="flex h-11 items-center rounded-lg bg-danger px-3 text-xs font-bold text-white"
              >
                Quitter la table
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="flex h-11 items-center rounded-lg px-3 text-xs text-paper-300"
              >
                Rester
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label="Quitter la partie"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-storm-950/60 text-paper-300"
            >
              <IconBack />
            </button>
          )}
        </div>
        {round && view.phase !== 'dealing' && <PlayerSeats view={view} layout={layout} bubbles={bubbles} />}
        {round && view.phase === 'playing' && (
          <TableCentre
            layout={layout}
            stockCount={round.stockCount}
            lastDiscard={round.lastDiscard}
            drawOptions={round.drawOptions}
            onDrawStock={() => void draw({ source: 'stock' })}
            onDrawDiscard={(id) => void draw({ source: 'discard', cardId: id })}
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-storm-800/80 text-paper-300"
            >
              <IconHistory />
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-storm-800/80 text-paper-300"
            >
              <IconSmile />
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
            {/* Le silence se décide d'un geste, sans quitter la table. */}
            <button
              type="button"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setMutedState(next);
              }}
              aria-label={muted ? 'Réactiver le son' : 'Couper le son'}
              aria-pressed={muted}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-storm-800 text-paper-300"
            >
              {muted ? <IconMuted /> : <IconSound />}
            </button>
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
          dealing={dealing}
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
  dealing,
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
  dealing: boolean;
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
        dealing={dealing}
      />

      <div className="flex gap-3 px-3">
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
            className={`zz-zap w-32 flex-none rounded-xl py-3 font-display text-base font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-50 ${
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
