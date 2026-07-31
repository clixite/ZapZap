import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { play } from '../audio';
import { vibrate } from '../haptics';
import { useT } from '../i18n';
import { Confetti } from '../components/Confetti';
import { IconShare } from '../components/icons';
import { shareResult } from '../shareCard';
import { useGame, useGameChannel, useView } from '../store/game';

/** Le classement final. Le vainqueur est celui qui reste, pas celui qui marque. */
export function GameOver() {
  const t = useT();
  const clear = useGame((s) => s.clear);
  const send = useGame((s) => s.send);
  const busy = useGame((s) => s.busy);
  const view = useView();
  const navigate = useNavigate();
  const [shared, setShared] = useState(false);

  useGameChannel();

  // La revanche a basculé la table sur une nouvelle partie : la vue redevient
  // un salon, on suit — que l'on soit l'hôte qui a cliqué ou un invité qui a
  // simplement entendu l'événement.
  useEffect(() => {
    if (view?.phase === 'lobby') navigate(`/salon/${view.code}`, { replace: true });
  }, [view?.phase, view?.code, navigate]);

  const iWon = view?.players.find((p) => p.id === view.you)?.finishRank === 1;

  // La fanfare — une fois, quand le résultat est là.
  const done = view?.phase === 'game-over';
  useEffect(() => {
    if (!done) return;
    play(iWon ? 'victory' : 'defeat');
    // La victoire se sent dans la main : c'est la seule récompense du jeu, et
    // celle dont on se souvient entre deux parties.
    vibrate(iWon ? 'success' : 'failure');
    // Le résultat ne change pas : ne rejouer ni sur re-rendu ni sur revanche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!view) {
    return (
      <Centered>
        <button type="button" onClick={() => navigate('/')} className="underline underline-offset-4">
          {t.gameOver.home}
        </button>
      </Centered>
    );
  }

  const standings = [...view.players].sort(
    (a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99) || a.totalScore - b.totalScore,
  );

  const share = async () => {
    const outcome = await shareResult(view);
    if (outcome !== 'cancelled') {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-8">
      {iWon && <Confetti />}
      <header className="text-center">
        <h1 className="zz-zap font-display text-3xl font-bold">
          {iWon ? t.gameOver.youWin : t.gameOver.title}
        </h1>
        <p className="mt-1 text-sm text-paper-300">
          {t.gameOver.roundsPlayed(view.roundIndex + 1)}
        </p>
      </header>

      <ol className="flex flex-col gap-2">
        {standings.map((player, i) => (
          <li
            key={player.id}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
              player.finishRank === 1 ? 'bg-flash-400/20' : 'bg-storm-800'
            }`}
          >
            <span className="w-6 shrink-0 text-center font-display text-lg font-bold text-paper-300">
              {player.finishRank ?? i + 1}
            </span>
            <span className="text-xl" aria-hidden="true">
              {player.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {player.pseudo}
              {player.id === view.you && <span className="ml-1 text-xs text-paper-300">{t.gameOver.you}</span>}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-paper-300">
              {t.gameOver.points(player.totalScore)}
              {player.eliminated ? t.gameOver.outSuffix : ''}
            </span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => void share()}
        className="flex items-center justify-center gap-2 rounded-xl bg-storm-700 py-3 font-display font-bold"
      >
        <IconShare size={20} />
        {shared ? t.gameOver.shared : t.gameOver.share}
      </button>

      <div className="mt-auto flex flex-col gap-2">
        {view.hostId === view.you && (
          <button
            type="button"
            onClick={() => void send('room:rematch')}
            disabled={busy}
            className="rounded-xl bg-flash-400 py-3.5 font-display text-lg font-bold text-storm-950 disabled:opacity-50"
          >
            {t.gameOver.rematch}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            clear();
            navigate('/');
          }}
          className="rounded-xl bg-volt-500 py-3.5 font-display text-lg font-bold text-storm-950"
        >
          {t.gameOver.home}
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">{children}</div>;
}
