import type { GameView } from '@zapzap/shared';

/**
 * Le choix du donneur.
 *
 * C'est le moment fort de ZapZap et il n'existe dans aucun autre jeu de la
 * famille : le donneur fixe la taille des mains pour toute la table, lui
 * compris. Court, la manche est une course à qui descend le premier ; long, il
 * y a de quoi construire et lâcher gros d'un coup.
 *
 * La décision se prend en regardant les scores — on sert court quand on mène,
 * long quand on est distancé. Le tableau est donc affiché juste à côté des
 * boutons : sans lui, le choix se ferait au hasard.
 */

export interface DealPickerProps {
  view: GameView;
  onDeal: (handSize: number) => void;
  busy: boolean;
}

export function DealPicker({ view, onDeal, busy }: DealPickerProps) {
  const choices = view.round?.dealChoices ?? [];
  const standings = [...view.players].filter((p) => !p.eliminated).sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="zz-fade-up flex flex-col items-center gap-4 px-5 py-6">
      <div className="text-center">
        <h2 className="font-display text-xl font-bold">À vous de donner</h2>
        <p className="mt-1 text-sm text-paper-300">
          Combien de cartes pour tout le monde&nbsp;? Vous vous servez pareil.
        </p>
      </div>

      <ol className="flex w-full max-w-xs flex-col gap-1 rounded-xl bg-storm-800/70 px-3 py-2">
        {standings.map((p) => (
          <li key={p.id} className="flex justify-between text-sm">
            <span className="truncate">
              {p.avatar} {p.pseudo}
              {p.id === view.you && <span className="text-paper-300"> (vous)</span>}
            </span>
            <span className="tabular-nums text-paper-300">{p.totalScore} pt</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap justify-center gap-2">
        {choices.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onDeal(size)}
            disabled={busy}
            className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-volt-500 font-display text-2xl font-bold text-storm-950 transition-transform active:scale-95 disabled:opacity-50"
          >
            {size}
            <span className="text-[10px] font-medium tracking-wide uppercase">cartes</span>
          </button>
        ))}
      </div>

      <p className="max-w-xs text-center text-xs text-paper-300">
        Court, on descend vite mais on construit peu. Long, on a de quoi faire des suites — et beaucoup à
        encaisser si quelqu’un annonce.
      </p>
    </div>
  );
}

/** Ce que voient les autres pendant que le donneur choisit. */
export function DealWaiting({ dealerPseudo }: { dealerPseudo: string }) {
  return (
    <div className="zz-fade-up flex flex-col items-center gap-2 px-5 py-8 text-center">
      <span className="text-3xl" aria-hidden="true">
        🎴
      </span>
      <h2 className="font-display text-lg font-bold">{dealerPseudo} donne</h2>
      <p className="text-sm text-paper-300">Il choisit combien de cartes tout le monde recevra.</p>
    </div>
  );
}
