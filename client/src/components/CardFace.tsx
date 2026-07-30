import { cardValue, isJoker, type Card } from '@zapzap/shared';

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
      className="relative flex h-full w-full flex-col justify-between rounded-[8%/5%] bg-paper-50 px-[7%] py-[5%]"
      style={{ color: ink, fontSize: width * 0.32 }}
    >
      <span className="flex items-baseline gap-[0.1em] font-display leading-none font-bold">
        {rankLabel(card)}
        <span style={{ fontSize: width * 0.2 }} aria-hidden="true">
          {glyph}
        </span>
      </span>
      <span className="self-center leading-none" style={{ fontSize: width * 0.46 }} aria-hidden="true">
        {glyph}
      </span>
      <span className="h-[1em]" aria-hidden="true" />
    </span>
  );

  const style = {
    width,
    height,
    boxShadow: selected ? 'var(--shadow-card-lifted)' : 'var(--shadow-card)',
    opacity: dimmed ? 0.42 : 1,
    // Le décalage vers le haut dit « choisie » sans changer sa taille : deux
    // cartes voisines gardent le même gabarit, la main reste lisible.
    transform: selected ? 'translateY(-14%)' : undefined,
    outline: selected ? '2px solid var(--color-volt-400)' : undefined,
    outlineOffset: 2,
  } as const;

  if (!onClick) {
    return (
      <span className="block rounded-[8%/5%] transition-transform duration-200" style={style} aria-label={name}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={name}
      className="block rounded-[8%/5%] transition-transform duration-200 disabled:cursor-not-allowed"
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

/** Dos de carte : la pioche, et les mains adverses. */
export function CardBack({ width }: { width: number }) {
  return (
    <span
      className="block rounded-[8%/5%]"
      style={{
        width,
        height: width * 1.5,
        boxShadow: 'var(--shadow-card)',
        background:
          'repeating-linear-gradient(135deg, var(--color-storm-600) 0 6px, var(--color-storm-700) 6px 12px)',
        border: '2px solid var(--color-storm-500)',
      }}
      aria-hidden="true"
    />
  );
}
