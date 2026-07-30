import { cardId, type Card, type DrawOption, type DiscardSlot } from '@zapzap/shared';
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
  drawOptions,
  onDrawStock,
  onDrawDiscard,
  busy,
}: TableCentreProps) {
  const canDraw = drawOptions !== null && !busy;
  const takeable = new Set((drawOptions ?? []).map((o) => o.cardId));
  const discardCards = lastDiscard?.combo.cards ?? [];

  // Une suite de trois cartes doit tenir dans la moitié du tapis : on les
  // chevauche plutôt que de rétrécir la carte. Chaque carte est recouverte par
  // sa droite, et son index vit en haut à gauche : à 45 %, il reste lisible sur
  // toutes les cartes de la pose.
  const spread = discardCards.length > 1 ? Math.round(layout.cardW * 0.45) : 0;

  return (
    <>
      <Pile
        x={layout.stock.x}
        y={layout.stock.y}
        label="Pioche"
        caption={`${stockCount} carte${stockCount > 1 ? 's' : ''}`}
      >
        <button
          type="button"
          onClick={canDraw ? onDrawStock : undefined}
          disabled={!canDraw}
          aria-label={`Piocher à l’aveugle, ${stockCount} cartes restantes`}
          className={`block rounded-lg transition-transform ${canDraw ? 'zz-turn active:scale-95' : ''}`}
        >
          <CardBack width={layout.cardW} />
        </button>
      </Pile>

      <Pile
        x={layout.discard.x}
        y={layout.discard.y}
        label="Défausse"
        caption={
          discardCards.length === 0
            ? '—'
            : takeable.size > 0 && canDraw
              ? takeable.size < discardCards.length
                ? 'Tête ou queue'
                : 'À prendre'
              : `${discardCards.length} carte${discardCards.length > 1 ? 's' : ''}`
        }
      >
        <span className="flex items-end" style={{ marginRight: spread }}>
          {discardCards.length === 0 ? (
            <EmptySlot width={layout.cardW} />
          ) : (
            discardCards.map((card) => (
              <span key={cardId(card)} style={{ marginRight: -spread }}>
                <DiscardCard
                  card={card}
                  width={layout.cardW}
                  takeable={canDraw && takeable.has(cardId(card))}
                  onTake={() => onDrawDiscard(cardId(card))}
                  someTakeable={canDraw}
                />
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
      <span className="text-[11px] font-medium tracking-wide text-paper-300 uppercase">{label}</span>
      {children}
      <span className="text-[11px] text-paper-300">{caption}</span>
    </div>
  );
}
