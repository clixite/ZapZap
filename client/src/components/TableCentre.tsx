import { cardId, type Card, type DrawOption, type DiscardSlot } from '@zapzap/shared';
import { useT } from '../i18n';
import { CardBack, CardFace } from './CardFace';
import type { FeltLayout } from './tableLayout';

/**
 * Le centre du tapis : la pioche et la défausse, côte à côte.
 *
 * C'est le choix qui structure chaque tour — piocher à l'aveugle, ou prendre ce
 * qu'on a vu passer. Les deux tas sont donc de même taille et à la même
 * hauteur : rien ne doit suggérer que l'un est le geste par défaut.
 *
 * Sur une suite défaussée, seules la tête et la queue sont prenables. Plutôt
 * que de refuser le clic du milieu, on éteint la carte : le joueur voit la
 * règle au lieu de la découvrir en se faisant rejeter.
 */

export interface TableCentreProps {
  layout: FeltLayout;
  stockCount: number;
  lastDiscard: DiscardSlot | null;
  /** Qui a posé ce qui est sur la défausse. `null` pour la carte de la donne. */
  author: { avatar: string; pseudo: string; isMe: boolean } | null;
  /**
   * D'où la pose arrive, en coordonnées du tapis.
   *
   * Le siège de son auteur, ou le bas de l'écran quand c'est nous. Une carte
   * qui tombe du ciel ne dit rien ; une carte qui part de quelqu'un dit qui
   * vient de jouer, avant même qu'on ait lu son nom.
   */
  origin: { x: number; y: number } | null;
  /** Cartes prenables, si c'est à moi de piocher. Sinon `null`. */
  drawOptions: DrawOption[] | null;
  onDrawStock: () => void;
  onDrawDiscard: (id: string) => void;
  busy: boolean;
}

export function TableCentre({
  layout,
  stockCount,
  lastDiscard,
  author,
  origin,
  drawOptions,
  onDrawStock,
  onDrawDiscard,
  busy,
}: TableCentreProps) {
  const t = useT();
  const canDraw = drawOptions !== null && !busy;
  const takeable = new Set((drawOptions ?? []).map((o) => o.cardId));
  const discardCards = lastDiscard?.combo.cards ?? [];

  /*
   * Une pose de plusieurs cartes doit se lire comme plusieurs cartes.
   *
   * Un simple recouvrement horizontal, même léger, donnait une paire qui
   * ressemblait à une grande carte unique. On décale donc aussi en hauteur et
   * on incline légèrement chaque carte : c'est le geste de quelqu'un qui pose
   * une combinaison sur la table, et l'œil compte les cartes sans effort.
   */
  const spread = discardCards.length > 1 ? Math.round(layout.cardW * 0.32) : 0;
  const stagger = Math.round(layout.cardW * 0.08);

  return (
    <>
      <Pile
        x={layout.stock.x}
        y={layout.stock.y}
        label={t.table.stock}
        caption={t.table.cardsLeft(stockCount)}
      >
        <button
          type="button"
          onClick={canDraw ? onDrawStock : undefined}
          disabled={!canDraw}
          aria-label={t.table.drawBlind(stockCount)}
          className={`block rounded-lg transition-transform ${canDraw ? 'zz-turn active:scale-95' : ''}`}
        >
          <CardBack width={layout.cardW} />
        </button>
      </Pile>

      <Pile
        x={layout.discard.x}
        y={layout.discard.y}
        /*
         * L'étiquette dit *qui*, pas *quoi*.
         *
         * « Défausse » était une évidence — on voit bien que c'est la défausse.
         * Ce qu'on ne voyait pas, c'est de quelle main ces cartes sortent, et
         * c'est pourtant l'information dont dépend tout le comptage : ramasser
         * le 7 que le voisin vient de lâcher n'a pas le même sens que ramasser
         * celui qu'on a soi-même écarté au tour d'avant.
         */
        label={
          lastDiscard === null
            ? t.table.discard
            : author === null
              ? t.table.turnedUp
              : author.isMe
                ? t.table.youPlayed
                : `${author.avatar} ${author.pseudo}`
        }
        caption={
          discardCards.length === 0
            ? '—'
            : takeable.size > 0 && canDraw
              ? takeable.size < discardCards.length
                ? t.table.headOrTail
                : t.table.takeable
              : t.table.cardsLeft(discardCards.length)
        }
      >
        <span className="flex items-end" style={{ marginRight: spread }}>
          {discardCards.length === 0 ? (
            <EmptySlot width={layout.cardW} />
          ) : (
            discardCards.map((card, i) => (
              <span
                key={cardId(card)}
                // `key` sur l'identifiant de carte : une pose remplace la
                // précédente, donc React démonte et remonte — l'animation
                // d'entrée se rejoue d'elle-même à chaque nouvelle défausse.
                className="zz-card-fly"
                style={
                  {
                    marginRight: -spread,
                    animationDelay: `${i * 60}ms`,
                    '--zz-dx': `${(origin?.x ?? layout.discard.x) - layout.discard.x}px`,
                    '--zz-dy': `${(origin?.y ?? layout.discard.y - 28) - layout.discard.y}px`,
                  } as React.CSSProperties
                }
              >
                {/* L'inclinaison vit sur un enfant : l'animation de vol occupe
                    déjà la transformation du parent. */}
                <span
                  className="block"
                  style={{
                    transform: `translateY(${i * stagger}px) rotate(${(i - (discardCards.length - 1) / 2) * 3}deg)`,
                  }}
                >
                  <DiscardCard
                    card={card}
                    width={layout.cardW}
                    takeable={canDraw && takeable.has(cardId(card))}
                    onTake={() => onDrawDiscard(cardId(card))}
                    someTakeable={canDraw}
                  />
                </span>
              </span>
            ))
          )}
        </span>
      </Pile>
    </>
  );
}

function DiscardCard({
  card,
  width,
  takeable,
  onTake,
  someTakeable,
}: {
  card: Card;
  width: number;
  takeable: boolean;
  onTake: () => void;
  someTakeable: boolean;
}) {
  return (
    <span className={takeable ? 'zz-turn inline-block rounded-lg' : 'inline-block'}>
      <CardFace
        card={card}
        width={width}
        // Éteinte quand elle n'est pas prenable alors que d'autres le sont :
        // c'est ainsi qu'on montre la règle « ni au milieu d'une suite ».
        dimmed={someTakeable && !takeable}
        onClick={takeable ? onTake : undefined}
        disabled={!takeable}
      />
    </span>
  );
}

function EmptySlot({ width }: { width: number }) {
  return (
    <span
      className="block rounded-lg border-2 border-dashed border-storm-500/60"
      style={{ width, height: width * 1.5 }}
      aria-hidden="true"
    />
  );
}

function Pile({
  x,
  y,
  label,
  caption,
  children,
}: {
  x: number;
  y: number;
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <span className="max-w-24 truncate text-[11px] font-medium tracking-wide text-paper-100">{label}</span>
      {children}
      <span className="text-[11px] text-paper-300">{caption}</span>
    </div>
  );
}
