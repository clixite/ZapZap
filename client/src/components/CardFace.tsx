import { cardId, cardValue, isJoker, type Card } from '@zapzap/shared';
import { t } from '../i18n';
import { CARD_BACK_STYLES, useCardBack } from '../store/theme';
import { IconBolt } from './icons';

const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', X: '⚡' };
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'V', 12: 'D', 13: 'R' };

export function rankLabel(card: Card): string {
  if (isJoker(card)) return '★';
  return RANK_LABEL[card.rank] ?? String(card.rank);
}

/**
 * La couleur d'encre d'une famille.
 *
 * Le rouge et le noir sont le seul repère entre familles sur un jeu classique,
 * et ils deviennent identiques pour une deutéranopie. Le mode daltonien bascule
 * sur le paquet à quatre couleurs — le standard des jeux de cartes — via des
 * variables CSS qui n'existent que dans ce mode, d'où le repli en cascade.
 */
function inkFor(card: Card): string {
  if (isJoker(card)) return 'var(--color-volt-600)';
  switch (card.suit) {
    case 'H':
      return 'var(--color-suit-red)';
    case 'S':
      return 'var(--color-suit-black)';
    case 'D':
      return 'var(--color-suit-diamond, var(--color-suit-red))';
    default:
      return 'var(--color-suit-club, var(--color-suit-black))';
  }
}

/**
 * Disposition des points, en fractions de la surface centrale.
 *
 * C'est la mise en page normalisée des jeux de cartes depuis le XIXᵉ siècle, et
 * l'œil la reconnaît sans la lire : un 5 se compte en quinconce, pas en
 * alignement. Un seul gros symbole au centre — ce qu'on avait — dit « vignette »
 * plutôt que « carte à jouer ».
 *
 * Coordonnées en [0, 1] : x depuis la gauche, y depuis le haut. Les points de la
 * moitié basse sont retournés, comme sur une vraie carte.
 */
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.16],
    [0.5, 0.84],
  ],
  3: [
    [0.5, 0.16],
    [0.5, 0.5],
    [0.5, 0.84],
  ],
  4: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  5: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.5, 0.5],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  6: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  7: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.5, 0.33],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  8: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.5, 0.33],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.5, 0.67],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  9: [
    [0.26, 0.14],
    [0.74, 0.14],
    [0.26, 0.38],
    [0.74, 0.38],
    [0.5, 0.5],
    [0.26, 0.62],
    [0.74, 0.62],
    [0.26, 0.86],
    [0.74, 0.86],
  ],
  10: [
    [0.26, 0.14],
    [0.74, 0.14],
    [0.5, 0.26],
    [0.26, 0.38],
    [0.74, 0.38],
    [0.26, 0.62],
    [0.74, 0.62],
    [0.5, 0.74],
    [0.26, 0.86],
    [0.74, 0.86],
  ],
};

/** Le corps de la carte : points pour les nombres, grande lettre pour les figures. */
function CardBody({ card, width, ink, glyph }: { card: Card; width: number; ink: string; glyph: string }) {
  const isCourt = !isJoker(card) && card.rank >= 11;

  if (isJoker(card)) {
    return (
      <span className="flex flex-1 items-center justify-center leading-none" style={{ fontSize: width * 0.44 }}>
        {glyph}
      </span>
    );
  }

  if (isCourt) {
    // Figures : l'initiale en grand, adossée à son symbole. Un dessin de
    // personnage serait illisible à 50 px de large — la lettre porte mieux.
    return (
      <span className="relative flex flex-1 items-center justify-center">
        <span className="font-display leading-none font-bold" style={{ fontSize: width * 0.56, color: ink }}>
          {RANK_LABEL[card.rank]}
        </span>
        {/*
          Le symbole d'appui de la figure.

          À 30 % d'opacité il passait inaperçu tant que les cartes du centre
          faisaient 84 px. Elles en font maintenant 132 : à cette taille, un
          trèfle presque effacé sous un « V » énorme ne se lit plus comme un
          appui mais comme un défaut d'affichage, et la figure paraît à moitié
          imprimée. Il reprend le poids qui la tient.
        */}
        <span
          className="absolute leading-none opacity-55"
          style={{ fontSize: width * 0.34, bottom: '4%', right: '6%' }}
          aria-hidden="true"
        >
          {glyph}
        </span>
      </span>
    );
  }

  const pips = PIP_LAYOUTS[card.rank] ?? PIP_LAYOUTS[1];
  // Les points se resserrent quand ils sont nombreux, sinon un 10 déborde.
  /*
   * L'As porte un gros symbole, comme sur un vrai jeu.
   *
   * Il suivait le barème des petites valeurs : un trèfle de la taille de ceux
   * d'un 2, seul au milieu d'une carte devenue grande. Sur un jeu de cartes,
   * l'As a toujours eu son symbole agrandi — c'est ce qui le fait reconnaître à
   * la volée, et dans ZapZap il vaut 1 point, donc c'est la carte qu'on cherche.
   */
  const pipSize = width * (card.rank === 1 ? 0.42 : card.rank >= 9 ? 0.17 : card.rank >= 7 ? 0.2 : 0.24);

  return (
    <span className="relative flex-1" aria-hidden="true">
      {pips.map(([x, y], i) => (
        <span
          key={i}
          className="absolute leading-none"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            fontSize: pipSize,
            // Les points du bas sont retournés, comme sur une vraie carte.
            transform: `translate(-50%, -50%)${y > 0.55 ? ' rotate(180deg)' : ''}`,
          }}
        >
          {glyph}
        </span>
      ))}
    </span>
  );
}

export interface CardFaceProps {
  card: Card;
  width: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** Rend la carte cliquable au clavier et annonce son rôle. */
  label?: string;
  disabled?: boolean;
}

export function CardFace({ card, width, selected, dimmed, onClick, label, disabled }: CardFaceProps) {
  const height = width * 1.5;
  const ink = inkFor(card);
  const glyph = SUIT_GLYPH[card.suit] ?? '?';
  const name = label ?? describeCard(card);

  /*
   * Un seul index, en haut à gauche.
   *
   * Une carte physique répète son rang en bas à droite, tête-bêche, pour qu'on
   * puisse la lire dans les deux sens en éventail. À l'écran la carte n'est
   * jamais retournée, et à cette taille l'index pivoté fait des dégâts : un 6
   * tourné à 180° se lit 9, et un 9 se lit 6. On l'enlève plutôt que d'ajouter
   * la barre de soulignement qui les distingue sur les vrais jeux — elle serait
   * illisible à 46 px de large.
   */
  const content = (
    <span
      className="relative flex h-full w-full flex-col rounded-[7%/4.7%] bg-paper-50 px-[6%] py-[4%]"
      style={{ color: ink, fontSize: width * 0.3 }}
    >
      <span className="flex shrink-0 items-baseline gap-[0.08em] font-display leading-none font-bold">
        {rankLabel(card)}
        <span style={{ fontSize: width * 0.19 }} aria-hidden="true">
          {glyph}
        </span>
      </span>
      <CardBody card={card} width={width} ink={ink} glyph={glyph} />
    </span>
  );

  const style = {
    width,
    height,
    boxShadow: selected ? 'var(--shadow-card-lifted)' : 'var(--shadow-card)',
    /*
     * Éteinte veut dire « pas mariable avec ta sélection », pas « morte ».
     *
     * À 40 % d'opacité sur un feutre indigo, la carte virait au gris sale : son
     * rang ne se lisait plus, et une carte qu'on ne peut plus lire est une carte
     * dont on ne peut plus décider — alors qu'il suffit de désélectionner pour
     * qu'elle redevienne jouable. L'écran disait « interdit » là où le jeu dit
     * « pas avec celles-là ».
     *
     * Elle recule maintenant sans s'effacer : elle perd sa couleur et un peu de
     * présence, garde son rang parfaitement lisible.
     *
     * Sans assombrissement : une carte blanche qu'on assombrit sur un feutre
     * indigo ne devient pas discrète, elle devient grise — une autre carte,
     * sale, et non la même en retrait. Seules la transparence et la couleur
     * cèdent ; la valeur claire du carton, elle, tient.
     */
    opacity: dimmed ? 0.8 : 1,
    filter: dimmed ? 'saturate(0.2)' : undefined,
    // Le liseré n'est pas une bordure de la carte : il l'entoure, pour qu'une
    // carte choisie se repère dans un éventail serré sans changer de gabarit.
    outline: selected ? '2.5px solid var(--color-volt-400)' : undefined,
    outlineOffset: 1,
  } as const;

  if (!onClick) {
    return (
      <span
        data-card={cardId(card)}
        /*
         * `role="img"` n'est pas décoratif : sans lui, ce `span` a le rôle
         * `generic`, sur lequel la spécification ARIA **interdit** `aria-label`
         * — VoiceOver et NVDA l'ignorent purement et simplement. La défausse,
         * l'abattage de fin de manche et le journal des cartes passées étaient
         * donc totalement muets, alors que savoir ce qu'il y a sur la défausse
         * est la décision centrale de chaque tour.
         */
        role="img"
        className="block rounded-[7%/4.7%] transition-[filter,opacity] duration-150"
        style={style}
        aria-label={name}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-card={cardId(card)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={name}
      className="block rounded-[7%/4.7%] transition-[filter,opacity] duration-150 active:brightness-95 disabled:cursor-not-allowed"
      style={style}
    >
      {content}
    </button>
  );
}

/**
 * Une combinaison en tout petit : « 7♥ 8♥ », aux couleurs des familles.
 *
 * Sert partout où il faut dire *quelles* cartes sans avoir la place de les
 * dessiner — l'étiquette d'une pose au siège de son auteur, le rappel de sa
 * propre pose pendant qu'on pioche. Une vraie carte miniature à cette échelle
 * n'est plus lisible ; le rang et le symbole, si.
 */
export function MiniCards({ cards, size = 11 }: { cards: Card[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[0.35em]" style={{ fontSize: size }}>
      {cards.map((card) => (
        <span
          key={cardId(card)}
          role="img"
          className="rounded-[3px] bg-paper-50 px-[0.28em] font-display leading-[1.35] font-bold"
          style={{ color: inkFor(card) }}
          aria-label={describeCard(card)}
        >
          {rankLabel(card)}
          <span aria-hidden="true">{SUIT_GLYPH[card.suit] ?? ''}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Nom parlé de la carte : les lecteurs d'écran ne lisent pas « ♠ ».
 *
 * Par `t()` et non par `useT()` : la fonction sert aussi de valeur par défaut à
 * `CardFace` et `MiniCards`, appelée pendant le rendu de composants qui n'ont
 * pas de raison d'être abonnés à la langue — le libellé est recalculé au rendu
 * suivant, que le changement de langue déclenche de toute façon.
 */
export function describeCard(card: Card): string {
  const names = t().card;
  if (isJoker(card)) return names.joker;
  const rank = names.ranks[card.rank] ?? String(card.rank);
  return names.named(rank, names.suits[card.suit] ?? card.suit, cardValue(card));
}

/**
 * Dos de carte : la pioche, et les mains adverses.
 *
 * Un motif d'éclairs en diagonale plutôt que de simples rayures — le dos est ce
 * qu'on regarde le plus longtemps dans une partie, il porte l'identité du jeu.
 * Et comme on le regarde longtemps, le joueur peut en changer : le motif vient
 * de sa préférence locale, sans que la table en sache rien. Un dos ne porte
 * aucune information de jeu, il n'y a donc rien à synchroniser.
 */
/**
 * Un tas de cartes, dont l'épaisseur dit ce qu'il contient.
 *
 * La pioche était dessinée comme **une seule carte**. Trente cartes ou trois,
 * le tapis avait exactement le même aspect — alors que sur une vraie table,
 * l'épaisseur du talon est une information qu'on lit sans y penser : elle dit
 * combien de tours il reste avant le remélange, et le remélange remet à zéro
 * tout le comptage de la manche. C'est donc doublement une perte : le tapis
 * paraissait plat, et il taisait quelque chose d'utile.
 *
 * L'épaisseur est **plafonnée**. Un talon de quarante cartes empilé au pixel
 * près déborderait de son emplacement et écraserait la défausse ; six feuillets
 * suffisent largement à faire lire « il en reste beaucoup », et la disparition
 * des derniers feuillets se voit très bien quand le tas maigrit.
 *
 * Les feuillets du dessous sont purement décoratifs : ils ne portent ni motif
 * ni éclair, seulement leur tranche. Dessiner six dos complets pour n'en voir
 * que deux millimètres serait du travail de rendu jeté par la fenêtre, à chaque
 * coup de chaque joueur.
 */
export function CardStack({
  width,
  count,
  tone = 'back',
  children,
}: {
  width: number;
  count: number;
  /**
   * De quoi le tas est fait.
   *
   * `back` pour le talon, dont on ne voit que les dos. `paper` pour la
   * défausse : ces cartes-là sont **face visible**, et leur montrer des dos
   * serait mentir sur ce qu'il y a dessous.
   */
  tone?: 'back' | 'paper';
  children?: React.ReactNode;
}) {
  const theme = CARD_BACK_STYLES[useCardBack()];
  const layerStyle =
    tone === 'paper'
      ? { background: 'var(--color-paper-300)', border: '1px solid var(--color-paper-100)' }
      : { background: theme.background, border: theme.border };

  // Un feuillet par tranche de quatre cartes : le tas maigrit visiblement au
  // fil de la manche sans clignoter à chaque pioche.
  const layers = Math.max(0, Math.min(5, Math.ceil(count / 4) - 1));
  const step = Math.max(1.5, width * 0.028);
  /*
   * Le tas **réserve** son épaisseur au lieu de déborder.
   *
   * Première version : les feuillets étaient posés en dehors de la boîte de la
   * carte, vers le haut et la gauche. Résultat, ils passaient par-dessus
   * l'étiquette « Pioche » juste au-dessus et la rendaient illisible. Un tas
   * épais occupe plus de place qu'une carte — c'est vrai sur une table aussi,
   * et la mise en page doit en tenir compte plutôt que de faire semblant.
   */
  const lift = layers * step;
  const shift = lift * 0.6;

  return (
    <span
      className="relative block"
      style={{ width: width + shift, height: width * 1.5 + lift }}
    >
      {Array.from({ length: layers }, (_, i) => {
        const depth = (layers - i) * step;
        return (
          <span
            key={i}
            className="absolute rounded-[7%/4.7%]"
            style={{
              left: shift - depth * 0.6,
              top: lift - depth,
              width,
              height: width * 1.5,
              ...layerStyle,
              boxShadow: '0 1px 2px rgb(0 0 0 / 0.35)',
            }}
          />
        );
      })}
      <span className="absolute" style={{ left: shift, top: lift, width, height: width * 1.5 }}>
        {children}
      </span>
    </span>
  );
}

export function CardBack({ width }: { width: number }) {
  const theme = CARD_BACK_STYLES[useCardBack()];
  return (
    <span
      className="relative block overflow-hidden rounded-[7%/4.7%]"
      style={{
        width,
        height: width * 1.5,
        boxShadow: 'var(--shadow-card)',
        background: theme.background,
        border: theme.border,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0"
        style={{ backgroundImage: theme.pattern, opacity: theme.patternOpacity }}
      />
      <span
        className="absolute inset-0 flex items-center justify-center leading-none opacity-45"
        style={{ fontSize: width * 0.4, color: theme.glyph }}
      >
        <IconBolt size={width * 0.4} />
      </span>
    </span>
  );
}
