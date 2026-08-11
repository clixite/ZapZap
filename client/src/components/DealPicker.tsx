import type { GameView } from '@zapzap/shared';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { IconDeal } from './icons';

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
  const t = useT();
  const choices = view.round?.dealChoices ?? [];
  const standings = [...view.players].filter((p) => !p.eliminated).sort((a, b) => a.totalScore - b.totalScore);

  /*
   * L'écran occupe le tapis au lieu de se tasser en haut.
   *
   * Le contenu tenait dans le quart supérieur et laissait sept cents pixels de
   * feutre nu en dessous — sur la décision qui donne son tempo à la manche, et
   * que le donneur ne prend qu'une fois toutes les quatre manches. Un écran vide
   * aux trois quarts dit « écran de transition », pas « à vous de décider ».
   *
   * `min-h-full` avec la répartition verticale suffit : les trois blocs
   * respirent, et le choix arrive au milieu de l'écran, sous le pouce.
   */
  return (
    <div className="zz-fade-up flex min-h-full flex-col items-center justify-center gap-7 px-5 py-8">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold">{t.deal.yourChoice}</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-paper-300">
          {t.deal.question}
        </p>
      </div>

      <ol className="flex w-full max-w-xs flex-col gap-1.5 rounded-xl bg-storm-800/70 px-3 py-2.5">
        {standings.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate">
              <Avatar emoji={p.avatar} photo={p.photo} size={24} />
              <span className="truncate">
                {p.pseudo}
                {p.id === view.you && <span className="text-paper-300">{t.deal.you}</span>}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-paper-300">{t.table.pt(p.totalScore)}</span>
          </li>
        ))}
      </ol>

      {/*
        Cinq choix égaux se présentent comme cinq choix égaux.

        Ils étaient cinq blocs de cyan plein — la couleur d'accent dépensée cinq
        fois d'un coup, sur un écran où elle ne désignait donc plus rien. Et le
        mot « CARTES » répété cinq fois sous les chiffres n'ajoutait rien que la
        question juste au-dessus n'ait déjà dit.

        Ils sont maintenant tonals, l'accent ne portant que le chiffre. Plus
        grands aussi : c'est la cible qu'on vise, et il n'y avait aucune raison
        de la garder à 64 px quand l'écran en offrait le double.
      */}
      <div className="flex w-full max-w-xs justify-between gap-2" role="group" aria-label={t.deal.question}>
        {choices.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onDeal(size)}
            disabled={busy}
            /*
              Le mot « cartes » a quitté le bouton mais pas le libellé parlé :
              à l'œil, la question juste au-dessus le dit déjà ; à l'oreille, un
              bouton qui s'annonce « 5 » tout court ne veut rien dire.
            */
            aria-label={`${size} ${t.deal.cardsUnit}`}
            className="flex h-16 flex-1 items-center justify-center rounded-xl border border-storm-500 bg-storm-800 font-display text-2xl font-bold text-volt-300 transition-colors active:bg-storm-700 disabled:opacity-50"
          >
            {size}
          </button>
        ))}
      </div>

      <p className="max-w-xs text-center text-sm text-paper-300">
        {t.deal.explain}
      </p>
    </div>
  );
}

/** Ce que voient les autres pendant que le donneur choisit. */
export function DealWaiting({ dealerPseudo }: { dealerPseudo: string }) {
  const t = useT();
  return (
    <div className="zz-fade-up flex min-h-full flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <IconDeal size={34} className="text-volt-300" />
      <h2 className="max-w-xs font-display text-lg font-bold">{t.deal.waiting(dealerPseudo)}</h2>
    </div>
  );
}
