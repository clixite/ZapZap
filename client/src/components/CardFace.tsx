import { cardId, cardValue, isJoker, type Card } from '@zapzap/shared';
import { t } from '../i18n';
import { CARD_BACK_STYLES, useCardBack } from '../store/theme';

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
        <span
          className="absolute leading-none opacity-30"
          style={{ fontSize: width * 0.3, bottom: '4%', right: '6%' }}
          aria-hidden="true"
        >
          {glyph}
        </span>
      </span>
    );
  }

  const pips = PIP_LAYOUTS[card.rank] ?? PIP_LAYOUTS[1];
  // Les points se resserrent quand ils sont nombreux, sinon un 10 déborde.
  const pipSize = width * (card.rank >= 9 ? 0.17 : card.rank >= 7 ? 0.2 : 0.24);

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
    opacity: dimmed ? 0.4 : 1,
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
        ⚡
      </span>
    </span>
  );
}
