import { useEffect, useState } from 'react';
import { cardId, type GameView, type RoundEvent } from '@zapzap/shared';
import { useModal } from '../hooks/useModal';
import { useT } from '../i18n';
import { request } from '../socket';
import { CardFace } from './CardFace';

/**
 * Les cartes déjà passées.
 *
 * Compter ce qui est tombé est la compétence centrale du jeu (§9.3 du
 * règlement) : c'est elle qui décide d'annoncer ou d'attendre. Sur table, elle
 * repose sur la mémoire ; ici le journal public de la manche existe déjà — ne
 * pas l'afficher reviendrait à réserver le jeu à ceux qui notent sur un papier.
 *
 * On montre les poses dans l'ordre, avec leur auteur, et les ramassages — un
 * joueur qui reprend une carte annonce ce qu'il construit. Les pioches à
 * l'aveugle n'apparaissent pas : le journal ne sait pas ce qu'elles ont donné,
 * et une ligne « X a pioché » n'aide personne à compter.
 */
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
  const [log, setLog] = useState<RoundEvent[]>([]);
  useEffect(() => {
    let alive = true;
    void request<{ log: RoundEvent[] }>('game:log').then((ack) => {
      if (alive && ack.ok) setLog(ack.log);
    });
    return () => {
      alive = false;
    };
  }, []);
  const name = (id: string) => view.players.find((p) => p.id === id)?.pseudo ?? '…';

  const lines = log
    .map((event, i) => ({ event, i }))
    .filter(({ event }) => event.type === 'deal' || event.type === 'discard' || event.type === 'draw-discard' || event.type === 'reshuffle');

  return (
    <div
      ref={panel}
      className="zz-fade-up absolute inset-0 z-30 flex flex-col bg-storm-950/95"
      role="dialog"
      aria-modal="true"
      aria-label={t.passed.title}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="font-display text-lg font-bold">{t.passed.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 min-w-11 items-center justify-center rounded-xl bg-storm-700 px-4 text-sm font-medium"
        >
          {t.passed.close}
        </button>
      </header>

      <ol className="zz-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-6">
        {lines.length <= 1 && (
          <li className="py-6 text-center text-sm text-paper-300">{t.passed.none}</li>
        )}
        {lines.map(({ event, i }) => (
          <li key={i} className="flex items-center gap-2 rounded-xl bg-storm-800/70 px-3 py-2">
            <LogLine event={event} name={name} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LogLine({ event, name }: { event: RoundEvent; name: (id: string) => string }) {
  switch (event.type) {
    case 'deal':
      return (
        <>
          <span className="min-w-0 flex-1 truncate text-sm text-paper-300">
            Donne de {event.handSize} cartes, carte retournée
          </span>
          <CardFace card={event.upCard} width={28} />
        </>
      );
    case 'discard':
      return (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{name(event.playerId)} pose</span>
          <span className="flex shrink-0 gap-1">
            {event.combo.cards.map((card) => (
              <CardFace key={cardId(card)} card={card} width={28} />
            ))}
          </span>
        </>
      );
    case 'draw-discard':
      return (
        <>
          <span className="min-w-0 flex-1 truncate text-sm text-volt-300">{name(event.playerId)} ramasse</span>
          <CardFace card={event.card} width={28} />
        </>
      );
    case 'reshuffle':
      return (
        <span className="text-sm text-paper-300">
          Pioche épuisée — {event.cards} cartes remélangées : les comptes repartent
        </span>
      );
    default:
      return null;
  }
}
