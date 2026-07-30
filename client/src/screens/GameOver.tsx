import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/game';

/** Le classement final. Le vainqueur est celui qui reste, pas celui qui marque. */
export function GameOver() {
  const { view, listen, clear } = useGame();
  const navigate = useNavigate();

  useEffect(() => listen(), [listen]);

  if (!view) {
    return (
      <Centered>
        <button type="button" onClick={() => navigate('/')} className="underline underline-offset-4">
          Retour à l’accueil
        </button>
      </Centered>
    );
  }

  const standings = [...view.players].sort(
    (a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99) || a.totalScore - b.totalScore,
  );
  const iWon = view.players.find((p) => p.id === view.you)?.finishRank === 1;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <h1 className="zz-zap font-display text-3xl font-bold">
          {iWon ? 'Vous gagnez !' : 'Partie terminée'}
        </h1>
        <p className="mt-1 text-sm text-paper-300">
          {view.roundIndex + 1} manche{view.roundIndex > 0 ? 's' : ''} jouée{view.roundIndex > 0 ? 's' : ''}
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
              {player.id === view.you && <span className="ml-1 text-xs text-paper-300">vous</span>}
            </span>
            <span className="shrink-0 tabular-nums text-sm text-paper-300">{player.totalScore} pt</span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          clear();
          navigate('/');
        }}
        className="mt-auto rounded-xl bg-volt-500 py-3.5 font-display text-lg font-bold text-storm-950"
      >
        Nouvelle partie
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">{children}</div>;
}
