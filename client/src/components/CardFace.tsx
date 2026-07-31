import { cardId, cardValue, isJoker, type Card } from '@zapzap/shared';

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

const SUIT_NAME: Record<string, string> = {
  S: 'pique',
  H: 'cœur',
  D: 'carreau',
  C: 'trèfle',
};

const RANK_NAME: Record<number, string> = { 1: 'As', 11: 'Valet', 12: 'Dame', 13: 'Roi' };

/** Nom parlé de la carte : les lecteurs d'écran ne lisent pas « ♠ ». */
export function describeCard(card: Card): string {
  if (isJoker(card)) return 'Joker, 0 point';
  const rank = RANK_NAME[card.rank] ?? String(card.rank);
  return `${rank} de ${SUIT_NAME[card.suit]}, ${cardValue(card)} point${cardValue(card) > 1 ? 's' : ''}`;
}

/**
 * Dos de carte : la pioche, et les mains adverses.
 *
 * Un motif d'éclairs en diagonale plutôt que de simples rayures — le dos est ce
 * qu'on regarde le plus longtemps dans une partie, il porte l'identité du jeu.
 */
export function CardBack({ width }: { width: number }) {
  return (
    <span
      className="relative block overflow-hidden rounded-[7%/4.7%]"
      style={{
        width,
        height: width * 1.5,
        boxShadow: 'var(--shadow-card)',
        background: 'linear-gradient(150deg, var(--color-storm-600), var(--color-storm-800))',
        border: '2px solid var(--color-storm-500)',
      }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(58deg, transparent 0 5px, var(--color-volt-400) 5px 6px, transparent 6px 11px)',
        }}
      />
      <span
        className="absolute inset-0 flex items-center justify-center leading-none opacity-40"
        style={{ fontSize: width * 0.4 }}
      >
        ⚡
      </span>
    </span>
  );
}
