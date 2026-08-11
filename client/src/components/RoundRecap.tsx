import { cardId, ELIMINATION_SCORE, handValue, type GameView } from '@zapzap/shared';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { CardFace } from './CardFace';

/**
 * L'abattage.
 *
 * Toute la tension d'une manche se résout ici, et il n'y a qu'une question à
 * laquelle l'écran doit répondre : **est-ce que l'annonce est passée ?** On la
 * traite en premier, en toutes lettres, avant le détail des mains — qui sert à
 * comprendre, pas à découvrir.
 */

export interface RoundRecapProps {
  view: GameView;
  onNext: () => void;
  canAdvance: boolean;
  busy: boolean;
}

export function RoundRecap({ view, onNext, canAdvance, busy }: RoundRecapProps) {
  const t = useT();
  const round = view.round!;
  const call = round.zapCall;
  const scores = round.roundScores ?? {};
  const hands = round.revealedHands ?? {};
  const caller = call ? view.players.find((p) => p.id === call.playerId) : null;
  const iCalled = call?.playerId === view.you;
  /*
   * Cette manche était-elle la dernière ?
   *
   * La partie s'arrête au premier joueur qui dépasse 100 : le bouton ne doit
   * alors pas promettre une manche suivante qui n'existera pas. On le lit sur
   * les scores plutôt que sur la phase, parce qu'à cet instant précis la table
   * est encore en décompte — c'est justement l'écran où on l'apprend.
   */
  const lastRound = view.players.some((p) => !p.forfeited && p.totalScore >= ELIMINATION_SCORE);

  return (
    // `pt-14` : la sortie de table occupe le coin haut gauche du tapis, et la
    // première main abattue passait dessous.
    <div className="zz-fade-up flex flex-col gap-4 px-4 pt-14 pb-5">
      <header className="text-center">
        {call === null ? (
          <>
            <h2 className="font-display text-xl font-bold">{t.recap.stuck}</h2>
            <p className="mt-1 text-sm text-paper-300">{t.recap.stuckDetail}</p>
          </>
        ) : call.success ? (
          <>
            <h2 className="zz-zap font-display text-2xl font-bold text-success">
              {iCalled ? t.recap.youSucceeded : t.recap.success(caller?.pseudo ?? '…')}
            </h2>
            <p className="mt-1 text-sm text-paper-300">{t.recap.successDetail(call.value)}</p>
          </>
        ) : (
          <>
            <h2 className="zz-zap font-display text-2xl font-bold text-danger">
              {iCalled ? t.recap.youFailed : t.recap.failed(caller?.pseudo ?? '…')}
            </h2>
            <p className="mt-1 text-sm text-paper-300">
              {t.recap.beatenBy(call.beatenBy.length, caller?.pseudo ?? '…')}
            </p>
          </>
        )}
      </header>

      <ul className="flex flex-col gap-3">
        {view.players
          .filter((p) => hands[p.id] !== undefined)
          .sort((a, b) => (scores[a.id] ?? 0) - (scores[b.id] ?? 0))
          .map((player) => {
            const hand = hands[player.id] ?? [];
            const isCaller = call?.playerId === player.id;
            const beat = call?.beatenBy.includes(player.id) ?? false;
            return (
              <li
                key={player.id}
                className={`rounded-xl px-3 py-2 ${
                  isCaller ? 'bg-storm-700' : beat ? 'bg-success/15' : 'bg-storm-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                    <Avatar emoji={player.avatar} photo={player.photo} size={22} />
                    <span className="truncate">
                      {player.pseudo}
                      {isCaller && <span className="ml-1 text-flash-300">{t.recap.announces}</span>}
                      {beat && <span className="ml-1 text-success">{t.recap.counters}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span className="text-paper-300">{t.recap.inHand(handValue(hand))}</span>{' '}
                    <strong className={scores[player.id] > 0 ? 'text-danger' : 'text-success'}>
                      +{scores[player.id] ?? 0}
                    </strong>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {hand.length === 0 ? (
                    <span className="text-xs text-paper-300">{t.recap.emptyHand}</span>
                  ) : (
                    hand.map((card) => <CardFace key={cardId(card)} card={card} width={30} />)
                  )}
                </div>
              </li>
            );
          })}
      </ul>

      {/*
        Le bouton ne descend pas avec la liste : il est **toujours à l'écran**.
        À six joueurs, la feuille des mains abattues dépasse largement la
        hauteur du tapis, et il fallait faire défiler pour découvrir qu'il y
        avait quelque chose à toucher — la table entière attendait un joueur qui
        ne voyait pas le bouton.
      */}
      <div className="sticky bottom-0 z-20 -mx-4 bg-gradient-to-t from-storm-900 via-storm-900 to-transparent px-4 pt-6 pb-3">
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance || busy}
          className="w-full rounded-xl bg-volt-500 py-3 font-display text-lg font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {canAdvance ? (lastRound ? t.recap.seeResult : t.recap.next) : t.recap.waitingHost}
        </button>
      </div>
    </div>
  );
}
