import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameHistoryEntry, UserStats } from '@zapzap/shared';
import { fetchHistory, fetchMe, readCachedHistory, storedToken } from '../api';
import { useSession } from '../store/session';

/**
 * L'historique et les statistiques.
 *
 * Cache d'abord : l'écran s'affiche instantanément avec ce que l'appareil
 * connaît, puis se rafraîchit en arrière-plan. La statistique reine de ZapZap
 * n'est pas le score — on le fuit — mais l'annonce : combien tentées, combien
 * passées. C'est elle qui dit si on joue bien.
 */
export function History() {
  const user = useSession((s) => s.user);
  const [games, setGames] = useState<GameHistoryEntry[] | null>(() =>
    user ? readCachedHistory(user.id) : null,
  );
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void fetchHistory(user.id).then((fresh) => {
      if (alive && fresh) setGames(fresh);
    });
    const token = storedToken();
    if (token) {
      void fetchMe(token).then((me) => {
        if (alive && me) setStats(me.stats);
      });
    }
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) {
    return (
      <Centered>
        <Link to="/" className="underline underline-offset-4">
          Retour à l’accueil
        </Link>
      </Centered>
    );
  }

  const zapRate = stats && stats.zapsCalled > 0 ? Math.round((100 * stats.zapsWon) / stats.zapsCalled) : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <Link to="/" className="text-sm text-paper-300 underline underline-offset-4">
          ← Retour
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Vos parties</h1>
      </header>

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Tile value={stats.gamesPlayed} label="parties" />
          <Tile value={stats.gamesWon} label="victoires" />
          <Tile
            value={zapRate === null ? '—' : `${zapRate}%`}
            label={`annonces réussies (${stats.zapsWon}/${stats.zapsCalled})`}
          />
        </div>
      )}

      {games === null ? (
        <p className="py-8 text-center text-sm text-paper-300">Chargement…</p>
      ) : games.length === 0 ? (
        <p className="py-8 text-center text-sm text-paper-300">
          Aucune partie terminée pour l’instant. La première victoire n’attend que vous.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {games.map((game) => (
            <li key={`${game.code}-${game.playedAt}`} className="rounded-xl bg-storm-800 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${game.won ? 'text-flash-300' : 'text-paper-100'}`}>
                  {game.won ? '🏆 Victoire' : `${game.myRank}ᵉ sur ${game.playersCount}`}
                </span>
                <span className="text-xs text-paper-300">
                  {new Date(game.playedAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-paper-300">
                {game.standings.map((s) => `${s.avatar} ${s.pseudo} ${s.score}`).join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-storm-800 px-2 py-3 text-center">
      <span className="font-display text-2xl font-bold text-volt-300">{value}</span>
      <span className="text-[10px] leading-tight text-paper-300">{label}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">{children}</div>;
}
