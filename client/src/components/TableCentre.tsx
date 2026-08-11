import { cardId, type Card, type DrawOption, type DiscardSlot } from '@zapzap/shared';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { CardBack, CardFace, CardStack } from './CardFace';
import { STACK_LIFT, type FeltLayout } from './tableLayout';

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
  /**
   * Ce qui dort sous la défausse — enterré, plus ramassable.
   *
   * Sert uniquement à donner son épaisseur au tas : c'est un compte, déjà
   * public, et il rend au tapis la matière qu'une carte seule ne donne pas.
   */
  discardPileCount: number;
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
  discardPileCount,
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
  /*
   * L'éventail de la défausse se resserre plutôt que de sortir du tapis.
   *
   * La géométrie réserve la place d'une pose de deux cartes — le cas courant,
   * la paire. Mais on pose aussi des suites, et une suite de cinq cartes
   * étalées fait presque trois largeurs de carte : à taille pleine elle sortait
   * du feutre par la droite, ce qui élargissait la page et décalait tout le
   * tapis, bouton de sortie compris.
   *
   * On ne peut pas figer ce pire cas dans la géométrie : la défausse ne porte
   * qu'une ou deux cartes pendant l'essentiel de la partie, et rapetisser en
   * permanence pour une suite de cinq qui arrive une fois par manche serait
   * payer tout le temps le prix d'un cas rare. La pose s'ajuste donc à sa
   * propre largeur, au moment où elle est posée.
   *
   * `room` est le plus large bloc centré sur le point de la défausse qui tienne
   * encore dans le feutre : c'est de part et d'autre de ce point que l'éventail
   * s'ouvre, donc c'est le plus petit des deux côtés qui commande.
   */
  const fanUnits = 0.68 * Math.max(1, discardCards.length) + 0.32;
  const room = Math.min(layout.discard.x, layout.width - layout.discard.x) * 2 - 8;
  const fanW = Math.max(26, Math.min(layout.cardW, Math.floor(room / fanUnits)));

  const spread = discardCards.length > 1 ? Math.round(fanW * 0.32) : 0;
  const stagger = Math.round(fanW * 0.08);

  return (
    <>
      <Pile
        x={layout.stock.x}
        y={layout.stock.y}
        slotH={layout.cardH + STACK_LIFT}
        showLabel={layout.showPileLabels}
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
          {/*
            L'épaisseur du talon est une information, pas une décoration : elle
            dit combien de tours restent avant le remélange, et le remélange
            remet à zéro tout le comptage de la manche.
          */}
          <CardStack width={layout.cardW} count={stockCount}>
            <CardBack width={layout.cardW} />
          </CardStack>
        </button>
      </Pile>

      <Pile
        x={layout.discard.x}
        y={layout.discard.y}
        slotH={layout.cardH + STACK_LIFT}
        showLabel={layout.showPileLabels}
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
                : (
                    <>
                      <Avatar emoji={author.avatar} size={18} />
                      <span className="truncate">{author.pseudo}</span>
                    </>
                  )
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
        <span className="relative flex items-end" style={{ marginRight: spread }}>
          {/*
            Ce qui dort dessous, en tranches.

            Le tas de la défausse grossit toute la manche et n'en montrait
            jamais rien : la table paraissait plate, et l'épaisseur — qui dit
            d'un coup d'œil qu'on est en fin de manche — était perdue. Les
            tranches sont en papier, pas en dos de carte : ces cartes-là sont
            face visible, leur montrer des dos serait mentir sur ce qu'il y a
            dessous.
          */}
          {discardPileCount > 0 && discardCards.length > 0 && (
            <span className="pointer-events-none absolute bottom-0 left-0" aria-hidden="true">
              <CardStack width={fanW} count={discardPileCount} tone="paper" />
            </span>
          )}
          {discardCards.length === 0 ? (
            <EmptySlot width={fanW} />
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
                    width={fanW}
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
  slotH,
  showLabel,
  label,
  caption,
  children,
}: {
  x: number;
  y: number;
  /** Voir `showPileLabels` : sur un feutre court, l'étiquette gêne plus qu'elle n'aide. */
  showLabel: boolean;
  /**
   * Hauteur réservée au tas, épaisseur comprise.
   *
   * Les deux tas ne contiennent pas la même chose — le talon est épais dès la
   * donne, la défausse s'épaissit en cours de manche — et sans emplacement de
   * hauteur fixe, leurs étiquettes se retrouvaient à deux hauteurs
   * différentes, ce qui se voit immédiatement. Le contenu est calé en bas de
   * l'emplacement : c'est la table qui porte les cartes, pas l'inverse.
   */
  slotH: number;
  /*
   * Un nœud, pas une chaîne : l'étiquette de la défausse porte l'avatar de
   * celui qui vient de poser, et un émoji lâché dans une ligne de texte prend
   * la hauteur que lui donne la police du système — la prise électrique
   * s'affichait couchée et plus haute que la capitale d'à côté, si bien que le
   * nom du joueur ne s'alignait sur rien. Il lui faut une boîte.
   */
  label: React.ReactNode;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      {/*
        L'étiquette suit la carte : elle était plafonnée à 96 px quand la carte
        en faisait 84, ce qui se tenait. La carte en fait maintenant jusqu'à
        132, et un nom de six lettres se coupait sous un tas deux fois plus
        large que lui.
      */}
      <span
        className={`flex max-w-36 items-center gap-1.5 truncate text-[11px] font-medium tracking-wide text-paper-100 ${
          showLabel ? '' : 'sr-only'
        }`}
      >
        {label}
      </span>
      <span className="flex items-end justify-center" style={{ height: slotH }}>
        {children}
      </span>
      <span className="text-[11px] text-paper-300">{caption}</span>
    </div>
  );
}
