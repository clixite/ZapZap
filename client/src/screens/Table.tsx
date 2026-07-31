import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EMOTES, handValue, type EmoteId, type GameView, type Player } from '@zapzap/shared';
import { isMuted, play, setMuted } from '../audio';
import { MiniCards } from '../components/CardFace';
import { DealPicker, DealWaiting } from '../components/DealPicker';
import { HandFan } from '../components/HandFan';
import { EMOTE_GLYPHS, EventTicker, TurnCountdown, useEmoteBubbles } from '../components/LiveFeedback';
import { IconBack, IconHistory, IconMuted, IconSmile, IconSound } from '../components/icons';
import { PassedCards } from '../components/PassedCards';
import { PlayerSeats } from '../components/PlayerSeats';
import { RoundRecap } from '../components/RoundRecap';
import { TableCentre } from '../components/TableCentre';
import { TableMenu } from '../components/TableMenu';
import { STATUS_H, useFeltLayout } from '../components/tableLayout';
import { vibrate } from '../haptics';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGame, useGameChannel, useView } from '../store/game';
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
    const join = useGame((s) => s.join);
  const denied = useGame((s) => s.denied);
  const lastEvent = useGame((s) => s.lastEvent);
  const view = useView();
  const user = useSession((s) => s.user);
  const connected = useSession((s) => s.connected);
  const [selected, setSelected] = useState<string[]>([]);
  /** Premier tap sur ZapZap : armé. Deuxième : envoyé. Un raté coûte 30 points. */
  const [zapArmed, setZapArmed] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const bubbles = useEmoteBubbles(lastEvent);
  /** Vrai pendant la seconde qui suit la donne : la main entre carte par carte. */
  const [dealing, setDealing] = useState(false);

  useGameChannel();

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
      case 'zap-called': {
        // La voix d'abord — c'est l'annonce qu'on entend à une vraie table —
        // puis le verdict, le temps qu'elle finisse de le dire.
        play('zapCall');
        const success = lastEvent.success;
        const timer = setTimeout(() => {
          play(success ? 'zapWin' : 'zapFail');
          vibrate(success ? 'success' : 'failure');
        }, 950);
        return () => clearTimeout(timer);
      }
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

  // On ne demande à s'asseoir qu'une fois la connexion établie : au chargement
  // direct de l'écran, la session est encore en train de se rétablir, et une
  // demande partie trop tôt n'aboutit nulle part.
  useEffect(() => {
    if (connected && code && !view && denied !== code) void join(code);
  }, [connected, code, view, join, denied]);

  // Retiré de la table, ou table close : on repart de l'accueil plutôt que de
  // rester devant un tapis qui ne se remplira plus.
  useEffect(() => {
    if (denied === code) navigate('/', { replace: true });
  }, [denied, code, navigate]);

  /*
   * Revenir à table, c'est reprendre sa place.
   *
   * Quitter vers le menu principal met la place en pause — un robot joue
   * l'intervalle. Rouvrir la table doit donc la rendre, sans un geste de plus :
   * personne ne pense à « reprendre » avant de jouer, et découvrir qu'un robot
   * a joué son tour alors qu'on regardait l'écran serait insupportable.
   *
   * Une seule fois par arrivée : sinon la pause demandée depuis cet écran même
   * serait annulée dans la seconde.
   */
  const resumed = useRef(false);
  const iAmAway = view?.players.find((p) => p.id === view.you)?.away ?? false;
  useEffect(() => {
    if (!view || resumed.current) return;
    resumed.current = true;
    if (iAmAway) void send('game:away', { away: false });
  }, [view, iAmAway, send]);

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
    return <Centered error={error}>{error ?? 'Connexion à la table…'}</Centered>;
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
        {/* Le menu : la porte de sortie, et tout ce qui n'est pas un coup de jeu. */}
        <div className="absolute top-1 left-1 z-20">
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            aria-label="Menu de la partie"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-storm-950/60 text-paper-300"
          >
            <IconBack />
          </button>
        </div>

        {showMenu && (
          <TableMenu
            view={view}
            onClose={() => setShowMenu(false)}
            onPause={async (away) => {
              setShowMenu(false);
              await send('game:away', { away });
            }}
            onMenu={async () => {
              setShowMenu(false);
              // On garde sa place, on la met en pause : la table continue de
              // tourner à son rythme au lieu d'attendre trente secondes par tour.
              if (view.phase !== 'game-over') await send('game:away', { away: true });
              setError(null);
              navigate('/');
            }}
            onQuit={async () => {
              setShowMenu(false);
              await send('room:forfeit');
              setError(null);
              navigate('/');
            }}
          />
        )}

        {round && view.phase !== 'dealing' && <PlayerSeats view={view} layout={layout} bubbles={bubbles} />}
        {round && view.phase === 'playing' && (
          <TableCentre
            layout={layout}
            stockCount={round.stockCount}
            lastDiscard={round.lastDiscard}
            author={authorOf(view, round.lastDiscard?.playerId)}
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

        {/*
          La ligne d'annonce, juste au-dessus de la ligne d'état — sauf pendant
          le décompte, où elle passait par-dessus la feuille des scores et
          barrait le nom d'un joueur au moment précis où on lisait sa main.
        */}
        {view.phase !== 'round-scoring' && (
          <div className="absolute inset-x-0" style={{ bottom: STATUS_H }}>
            <EventTicker view={view} lastEvent={lastEvent} />
          </div>
        )}

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

          {/*
            La ligne d'état a quitté cette barre pour le bandeau au-dessus de la
            main : à mi-hauteur de l'écran, en petit, entre deux icônes, « au
            tour de… » se lisait rarement. Ne reste ici que le décompte, qui est
            une jauge et non un texte.
          */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
            {view.turnDeadline != null && view.phase !== 'round-scoring' && (
              <TurnCountdown deadline={view.turnDeadline} mine={myTurn} />
            )}
          </div>

          {round && view.phase !== 'round-scoring' && (
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

      {/* La main, toujours visible, coiffée du bandeau de tour */}
      <div
        className="shrink-0 rounded-t-2xl bg-storm-800/80 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ boxShadow: 'var(--shadow-panel)' }}
      >
        {/*
          Ma propre pause passe avant tout le reste : tant qu'elle dure, savoir
          de qui c'est le tour n'a aucun intérêt — mes tours ne m'attendent pas.
        */}
        {iAmAway ? (
          <button
            type="button"
            onClick={() => void send('game:away', { away: false })}
            className="zz-turn flex min-h-9 w-full items-center justify-center gap-2 rounded-t-2xl bg-flash-400 px-3 py-1.5 text-sm font-bold text-storm-950"
          >
            En pause — un robot joue pour vous · <span className="underline">reprendre</span>
          </button>
        ) : (
          <TurnBanner view={view} myTurn={myTurn} pending={pending} />
        )}
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
        {/*
          Hors du temps de jeu — la donne, le décompte —, le bouton disparaît au
          lieu de rester grisé. Un bouton éteint invite quand même à appuyer, et
          on l'appuie : pendant le décompte, « Défausser » était le geste le plus
          visible de l'écran alors qu'il n'y avait rien à défausser.
        */}
        {view.phase === 'playing' && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={!interactive || selected.length === 0 || busy}
            className="flex-1 rounded-xl bg-volt-500 py-3 font-display text-lg font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            Défausser
          </button>
        )}
      </div>
    </div>
  );
}

/** Qui a posé les cartes visibles au centre — `null` pour la carte de la donne. */
function authorOf(view: GameView, playerId: string | undefined) {
  if (!playerId) return null;
  const player = view.players.find((p) => p.id === playerId);
  if (!player) return null;
  return { avatar: player.avatar, pseudo: player.pseudo, isMe: player.id === view.you };
}

/**
 * Le bandeau de tour : qui joue, et ce qu'il doit faire.
 *
 * Il est collé au-dessus de la main — là où le regard revient entre deux coups —
 * plutôt qu'au milieu de l'écran. Quand c'est mon tour il prend la couleur
 * d'accent sur toute la largeur : impossible de croire qu'on attend quelqu'un
 * d'autre. Quand ce n'est pas mon tour, il porte l'avatar de celui qu'on attend,
 * pour que le nom du bandeau et l'anneau sur le tapis désignent visiblement la
 * même personne.
 *
 * Il porte aussi le rappel de ma propre pose pendant que je pioche : mes cartes
 * ont quitté ma main mais ne sont pas encore au centre, et sans ce rappel elles
 * n'existaient nulle part.
 */
function TurnBanner({ view, myTurn, pending }: { view: GameView; myTurn: boolean; pending: Player | null }) {
  const round = view.round;
  const myPose = round?.pendingDiscard?.playerId === view.you ? round.pendingDiscard : null;

  let text: string;
  if (view.phase === 'dealing') {
    text = myTurn ? 'À vous de donner' : `${pending?.pseudo ?? '…'} choisit la donne`;
  } else if (view.phase === 'round-scoring') {
    text = 'Manche terminée';
  } else if (myTurn) {
    text = round?.turnStep === 'discard' ? 'À vous — posez vos cartes' : 'À vous — piochez une carte';
  } else {
    text = `Au tour de ${pending?.pseudo ?? '…'}`;
  }

  const hint =
    !myTurn && view.phase === 'playing'
      ? round?.turnStep === 'discard'
        ? 'il défausse'
        : 'il pioche'
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      // `relative z-10` : les cartes de la donne s'animent depuis le tapis et
      // passaient par-dessus le bandeau, illisible pendant une seconde.
      className={`relative z-10 flex min-h-9 items-center justify-center gap-2 rounded-t-2xl px-3 py-1.5 text-sm font-bold transition-colors ${
        myTurn ? 'zz-turn bg-volt-500 text-storm-950' : 'bg-storm-900/80 text-paper-100'
      }`}
    >
      {!myTurn && pending && (
        <span className="text-base leading-none" aria-hidden="true">
          {pending.avatar}
        </span>
      )}
      <span className="truncate">{text}</span>
      {hint && <span className="shrink-0 text-xs font-medium text-paper-300">· {hint}</span>}
      {myPose && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs font-medium">vous avez posé</span>
          <MiniCards cards={myPose.combo.cards} size={11} />
        </span>
      )}
    </div>
  );
}

/** Même porte de sortie qu'au salon : un message d'erreur seul enferme. */
function Centered({ children, error }: { children: React.ReactNode; error?: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-paper-300">
      <p>{children}</p>
      {error && (
        <Link to="/" className="min-h-11 rounded-xl bg-storm-700 px-5 py-3 text-sm font-medium text-paper-100">
          Retour à l’accueil
        </Link>
      )}
    </div>
  );
}
