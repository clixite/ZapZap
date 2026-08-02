import { useEffect, useMemo, useState } from 'react';
import {
  cardId,
  deadByRank,
  readRoundMemory,
  type Card,
  type GameView,
  type RoundEvent,
} from '@zapzap/shared';
import { useModal } from '../hooks/useModal';
import { useT } from '../i18n';
import { request } from '../socket';
import { CardFace, rankLabel } from './CardFace';

/**
 * Les cartes déjà passées — l'aide au comptage, pas l'archive.
 *
 * Compter ce qui est tombé est la compétence centrale du jeu (§9.3 du
 * règlement) : c'est elle qui décide d'annoncer ou d'attendre. Sur table, elle
 * repose sur la mémoire ; ici le journal public existe déjà, et ne pas
 * l'exploiter revenait à réserver le jeu à ceux qui notent sur un papier à côté.
 *
 * Cet écran affichait ce journal **tel quel**, à l'endroit, événement par
 * événement. C'était une archive, pas un outil : pour savoir combien de 7
 * étaient tombés, il fallait faire défiler et compter de tête — exactement
 * l'effort qu'on prétendait épargner. Il répond maintenant aux deux questions
 * qu'un joueur se pose vraiment :
 *
 *  1. **« Il en reste combien ? »** — une grille par rang, de l'As au Roi, qui
 *     dit d'un coup d'œil que les trois autres 7 sont morts et que la paire
 *     qu'on garde ne se complétera jamais ;
 *  2. **« Qui tient quoi ? »** — ce qu'on a vu chacun *ramasser* et qu'il n'a
 *     pas reposé. Rien n'est deviné : ramasser dans la défausse se fait sous
 *     les yeux de tous, et c'est le prix de ce coup.
 *
 * Le calcul vit dans `shared/memory.ts`, testé à part. Il ne lit que le journal
 * public : aucune main, aucune pioche à l'aveugle.
 */

/** Les treize rangs, dans l'ordre où un joueur les cherche. */
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const COPIES_PER_RANK = 4;

export function PassedCards({ view, onClose }: { view: GameView; onClose: () => void }) {
  const t = useT();
  const panel = useModal<HTMLDivElement>(onClose);
  /*
   * Le journal se demande à l'ouverture, il ne suit plus la vue.
   *
   * Cumulatif et renvoyé à chaque coup à chaque joueur, il représentait à lui
   * seul près des trois quarts du trafic d'une partie — pour un écran que
   * personne n'ouvre plus d'une fois ou deux par manche.
   */
  const [log, setLog] = useState<RoundEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    void request<{ log: RoundEvent[] }>('game:log').then((ack) => {
      if (alive) setLog(ack.ok ? ack.log : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const memory = useMemo(() => readRoundMemory(log ?? []), [log]);
  const counts = useMemo(() => deadByRank(memory.dead), [memory]);
  const name = (id: string) => view.players.find((p) => p.id === id)?.pseudo ?? '…';
  const holders = Object.entries(memory.held);

  return (
    <div
      ref={panel}
      /*
        Plein écran, et opaque.

        Le panneau était calé sur le tapis (`absolute`), si bien qu'il laissait
        la main visible et cliquable en dessous alors qu'il se déclare
        `aria-modal` — une promesse tenue pour le clavier depuis `useModal`,
        mais démentie par le doigt et par l'œil. Et à 95 % d'opacité, le feutre
        transparaissait au travers : les libellés « Pioche », « 31 cartes » et
        les pseudos des sièges se lisaient derrière la grille de comptage, qui
        est justement l'écran où l'on vient chercher un chiffre précis.
      */
      className="zz-safe zz-fade-up fixed inset-0 z-50 flex flex-col bg-storm-950"
      role="dialog"
      aria-modal="true"
      aria-label={t.passed.title}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">{t.passed.title}</h2>
          <p className="text-xs text-paper-300">{t.passed.detail}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-3 flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-storm-700 px-4 text-sm font-medium"
        >
          {t.passed.close}
        </button>
      </header>

      <div className="zz-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
        {log === null ? (
          <p className="py-6 text-center text-sm text-paper-300">{t.passed.loading}</p>
        ) : (
          <>
            {/*
              Le remélange périme tout, et c'est le seul moment où ça arrive.
              Un joueur qui continuerait de compter sur « les trois 7 sont
              tombés » jouerait sur une certitude devenue fausse.
            */}
            {memory.reshuffled && (
              <p className="rounded-xl bg-flash-400/15 px-3 py-2 text-sm text-flash-300">
                {t.passed.reshuffled}
              </p>
            )}

            <section>
              <h3 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
                {t.passed.remaining}
              </h3>
              <p className="mt-0.5 text-xs text-paper-300">{t.passed.remainingDetail}</p>
              <ul className="mt-2 grid grid-cols-7 gap-1.5">
                {RANKS.map((rank) => {
                  const gone = counts.get(rank) ?? 0;
                  const left = COPIES_PER_RANK - gone;
                  return (
                    <li
                      key={rank}
                      className={`flex flex-col items-center rounded-lg py-1.5 ${
                        left === 0 ? 'bg-storm-800/40 text-paper-300/40' : 'bg-storm-800'
                      }`}
                    >
                      <span className="font-display text-sm font-bold">
                        {rankLabel({ suit: 'S', rank } as Card)}
                      </span>
                      {/*
                        Des points plutôt qu'un chiffre : « il en reste deux »
                        se voit, « 2 » se lit. À la vitesse où l'on consulte ce
                        panneau — entre deux tours — la différence compte.
                      */}
                      <span className="mt-0.5 flex gap-[2px]" aria-hidden="true">
                        {Array.from({ length: COPIES_PER_RANK }, (_, i) => (
                          <span
                            key={i}
                            className={`block h-1.5 w-1.5 rounded-full ${
                              i < left ? 'bg-volt-400' : 'bg-storm-600'
                            }`}
                          />
                        ))}
                      </span>
                      <span className="sr-only">{t.passed.rankLeft(left, COPIES_PER_RANK)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {holders.length > 0 && (
              <section>
                <h3 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
                  {t.passed.known}
                </h3>
                <p className="mt-0.5 text-xs text-paper-300">{t.passed.knownDetail}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {holders.map(([playerId, cards]) => (
                    <li
                      key={playerId}
                      className="flex items-center gap-2 rounded-xl bg-storm-800/70 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{name(playerId)}</span>
                      <span className="flex shrink-0 gap-1">
                        {cards.map((card) => (
                          <CardFace key={cardId(card)} card={card} width={28} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/*
              La défausse au complet, en dernier : c'est le détail qu'on va
              chercher quand la grille ne suffit pas — pour savoir *quelle*
              couleur est tombée, et donc si la suite qu'on construit tient
              encore.
            */}
            {memory.dead.length > 0 && (
              <section>
                <h3 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
                  {t.passed.buried(memory.dead.length)}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {memory.dead.map((card) => (
                    <li key={cardId(card)}>
                      <CardFace card={card} width={26} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {memory.dead.length === 0 && holders.length === 0 && !memory.reshuffled && (
              <p className="py-4 text-center text-sm text-paper-300">{t.passed.none}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
