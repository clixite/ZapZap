import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@zapzap/shared';
import { fetchLeaderboard } from '../api';
import { useT } from '../i18n';
import { Avatar } from './Avatar';

/**
 * Le classement entre gens qui jouent ensemble.
 *
 * Pas de liste d'amis à tenir : ceux avec qui l'on a fini des parties **sont**
 * les adversaires réguliers. Un classement mondial ne dirait rien à personne
 * dans un jeu qu'on joue à six autour d'une table ; savoir qu'on est deuxième
 * derrière son frère, si.
 *
 * Deux colonnes seulement — victoires et score moyen — et le score moyen est
 * annoncé comme « le plus bas gagne », parce qu'un chiffre de score dans un jeu
 * de défausse se lit à l'envers de l'intuition.
 */
export function Leaderboard() {
  const t = useT();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchLeaderboard().then((fresh) => {
      if (alive) setRows(fresh ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (rows === null) return null;
  // Une seule ligne, c'est soi-même : un classement d'une personne n'en est pas
  // un, et il vaut mieux ne rien montrer que de montrer sa propre victoire.
  if (rows.length < 2) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">{t.leaderboard.title}</h2>
      <p className="-mt-1 text-xs text-paper-300">{t.leaderboard.detail}</p>

      <ol className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <li
            key={row.userId}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
              row.isMe ? 'bg-storm-700 ring-1 ring-volt-400/50' : 'bg-storm-800'
            }`}
          >
            <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-paper-300">
              {i + 1}
            </span>
            {/* Le classement portait déjà la bonne pastille : elle est devenue
                le composant partagé, pour qu'elle ne dérive plus toute seule. */}
            <Avatar emoji={row.avatar} photo={row.photo} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {row.pseudo}
                {row.isMe && <span className="ml-1 text-xs text-volt-300">{t.leaderboard.you}</span>}
              </span>
              <span className="block text-xs text-paper-300">
                {t.leaderboard.line(row.games, row.averageScore)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-display text-lg font-bold text-flash-300">{row.wins}</span>
              <span className="block text-[10px] tracking-wide text-paper-300 uppercase">
                {t.leaderboard.wins}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
