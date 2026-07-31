import { useMemo } from 'react';
import {
  cardId,
  classify,
  comboOptions,
  findCombos,
  handValue,
  type Card,
  type ZapVariants,
} from '@zapzap/shared';
import { t as messages } from '../i18n';
import { CardFace } from './CardFace';

/**
 * La main, en éventail.
 *
 * Elle est à **sélection multiple**, ce qui la distingue de n'importe quel jeu
 * de plis : on ne pose pas une carte, on pose une combinaison. Le joueur
 * construit donc sa pose au fur et à mesure, et doit savoir à tout instant si
 * ce qu'il a sélectionné est jouable — d'où la validation en direct plutôt
 * qu'un refus au moment de valider.
 *
 * Elle reste visible en permanence, y compris pendant la donne : c'est la
 * première chose qu'on regarde, la cacher pour afficher autre chose oblige à
 * mémoriser ses cartes.
 *
 * ## L'éventail
 *
 * Les cartes étaient posées à plat, bord à bord : lisible, mais on n'avait pas
 * de main entre les doigts, on avait une rangée de vignettes. L'éventail rétablit
 * le geste — chaque carte tourne autour d'un centre situé loin **sous** la main,
 * ce qui les fait diverger vers le haut comme un vrai éventail tenu en bas.
 *
 * Deux conséquences pratiques :
 *  - le chevauchement suit l'angle : plus la main est fournie, plus les cartes
 *    se serrent, mais l'index en haut à gauche de chacune reste dégagé ;
 *  - une carte sélectionnée sort de l'arc en montant, sans tourner davantage :
 *    elle se détache sans casser la ligne de l'éventail.
 */

export interface HandFanProps {
  hand: Card[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Sélection possible ? Faux quand ce n'est pas à moi de défausser. */
  interactive: boolean;
  variants: ZapVariants;
  width: number;
  /** La main vient d'être servie : les cartes entrent une à une. */
  dealing?: boolean;
}

/** Angle total de l'éventail, ouvert progressivement avec le nombre de cartes. */
function fanSpread(count: number): number {
  if (count <= 1) return 0;
  // 4° par carte, plafonné : au-delà de 26° l'éventail mange trop de hauteur
  // sur un téléphone, et les cartes des extrémités se couchent.
  return Math.min(26, count * 4);
}

export function HandFan({ hand, selected, onToggle, interactive, variants, width, dealing }: HandFanProps) {
  const count = hand.length;

  // Largeur de carte : on part d'une taille confortable et on ne rétrécit que
  // si la main déborde vraiment, le chevauchement absorbant le reste.
  const cardW = Math.round(Math.max(52, Math.min(82, (width - 32) / Math.max(3, count * 0.62))));
  const cardH = cardW * 1.5;

  /*
   * Chevauchement : chaque carte laisse voir au moins son index, et davantage
   * quand la main est courte.
   *
   * Le plancher de 44 px n'est pas décoratif : c'est la part de carte qui reste
   * atteignable au doigt. En dessous — et une main de sept cartes y tombait —
   * on vise une carte et on en touche une autre.
   */
  const step = Math.max(44, Math.round(cardW * (count > 5 ? 0.44 : count > 3 ? 0.58 : 0.72)));
  const spread = fanSpread(count);
  const mid = (count - 1) / 2;
  // Rayon de l'arc : loin sous la main, pour une courbure douce plutôt qu'une
  // roue. Trois hauteurs de carte donnent la bonne fuite.
  const radius = cardH * 3;

  const totalW = count > 0 ? (count - 1) * step + cardW : cardW;

  /*
   * Hauteur réellement occupée par l'éventail.
   *
   * Deux choses dépassent d'une simple hauteur de carte : le creux de l'arc,
   * qui fait descendre les cartes des bords, et leur inclinaison, qui pousse
   * leur coin bas au-delà de leur propre boîte. Sans les réserver, les cartes
   * passaient sous le panneau et recouvraient le texte d'aide.
   *
   * On mesure le creux maximal, puis on remonte tout l'éventail d'autant : la
   * carte la plus basse affleure le bas du panneau, jamais en dessous.
   */
  const maxAngle = spread / 2;
  const maxDip = radius * (1 - Math.cos((maxAngle * Math.PI) / 180));
  const tiltOverhang = Math.sin((maxAngle * Math.PI) / 180) * cardW * 0.5;
  const reserved = Math.ceil(cardH + maxDip + tiltOverhang + cardH * 0.24);

  const chosen = useMemo(() => hand.filter((c) => selected.includes(cardId(c))), [hand, selected]);
  const kind = chosen.length > 0 ? classify(chosen, comboOptions(variants)) : null;

  /*
   * Les cartes encore combinables avec la sélection en cours.
   *
   * Dès qu'on choisit une carte, la question devient « avec quoi puis-je la
   * marier ? ». Y répondre de tête suppose de connaître les règles ; y répondre
   * par tâtonnement suppose d'essayer et de se faire refuser. On éteint donc
   * tout ce qui ne peut plus entrer dans une pose légale : la main se réduit
   * d'elle-même aux coups possibles.
   *
   * `null` tant que rien n'est choisi — toutes les cartes sont alors jouables.
   */
  const compatible = useMemo(() => {
    if (selected.length === 0) return null;
    const combos = findCombos(hand, comboOptions(variants)).filter((combo) =>
      selected.every((id) => combo.cards.some((c) => cardId(c) === id)),
    );
    return new Set(combos.flatMap((combo) => combo.cards.map(cardId)));
  }, [hand, selected, variants]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative"
        style={{ width: totalW, height: reserved }}
        role="group"
        aria-label={messages().hand.yourHand}
      >
        {hand.map((card, i) => {
          const id = cardId(card);
          const isSelected = selected.includes(id);
          const offset = i - mid;
          const angle = count > 1 ? (offset / mid || 0) * (spread / 2) : 0;
          // Le creux de l'arc : les cartes du centre montent, celles des bords
          // descendent — c'est ce décalage qui fait lire une courbe.
          const dip = radius * (1 - Math.cos((angle * Math.PI) / 180));

          return (
            <span
              key={id}
              className={`absolute bottom-0 origin-bottom transition-transform duration-200 ease-out ${
                dealing ? 'zz-deal-in' : ''
              }`}
              style={{
                left: i * step,
                // `dip - maxDip` : négatif ou nul, donc l'éventail est calé sur
                // sa carte la plus basse et rien ne sort du panneau.
                transform: `translateY(${dip - maxDip - (isSelected ? cardH * 0.24 : 0)}px) rotate(${angle}deg)`,
                /*
                 * L'ordre reste naturel, même sélectionnée.
                 *
                 * Faire passer la carte choisie au premier plan paraissait
                 * évident — et masquait l'index de sa voisine de droite, qu'elle
                 * recouvre par construction dans un éventail. Chaque carte garde
                 * donc son rang de dessin : c'est le décollement qui signale la
                 * sélection, et il la fait dépasser par le haut, là où rien ne
                 * la couvre.
                 */
                zIndex: i,
                // La distribution se lit carte par carte, de gauche à droite —
                // c'est le geste du donneur, pas une apparition en bloc.
                animationDelay: dealing ? `${i * 70}ms` : undefined,
              }}
            >
              <CardFace
                card={card}
                width={cardW}
                selected={isSelected}
                dimmed={compatible !== null && !compatible.has(id)}
                onClick={interactive ? () => onToggle(id) : undefined}
                disabled={!interactive}
              />
            </span>
          );
        })}
      </div>

      <ComboHint chosen={chosen} kind={kind} interactive={interactive} handTotal={handValue(hand)} />
    </div>
  );
}

const KIND_LABEL = (): Record<string, string> => ({
  single: messages().hand.single,
  set: messages().hand.set,
  run: messages().hand.run,
});

/**
 * Ce que vaut la sélection, et pourquoi elle est refusée le cas échéant.
 *
 * Dire « invalide » ne sert à rien : le joueur qui tente Roi + Dame croit avoir
 * une paire parce que les deux valent 10. La raison doit être écrite.
 */
function ComboHint({
  chosen,
  kind,
  interactive,
  handTotal,
}: {
  chosen: Card[];
  kind: string | null;
  interactive: boolean;
  handTotal: number;
}) {
  if (chosen.length === 0 && handTotal === 0 && !interactive) {
    // Avant la donne il n'y a rien à dire : afficher « votre main vaut 0 »
    // ferait croire à une main vide plutôt qu'à une main pas encore servie.
    return <p className="text-sm text-paper-300">{messages().hand.dealing}</p>;
  }
  if (!interactive) {
    return (
      <p className="text-sm text-paper-300">
        {messages().hand.worth(handTotal)}
      </p>
    );
  }
  if (chosen.length === 0) {
    return <p className="text-sm text-paper-300">{messages().hand.choose}</p>;
  }
  if (kind) {
    const value = handValue(chosen);
    return (
      <p className="text-sm font-medium text-volt-300">
        {messages().hand.dropped(KIND_LABEL()[kind] ?? kind, value)}
      </p>
    );
  }
  return <p className="text-sm text-flash-300">{whyNot(chosen)}</p>;
}

function whyNot(chosen: Card[]): string {
  if (chosen.some((c) => c.suit === 'X')) {
    return messages().hand.whyJoker;
  }
  const ranks = new Set(chosen.map((c) => c.rank));
  if (ranks.size === 1) return messages().hand.whyFour;
  if (chosen.length === 2) return messages().hand.whyPair;

  const suits = new Set(chosen.map((c) => c.suit));
  if (suits.size > 1) return messages().hand.whySuit;
  const sorted = [...chosen].map((c) => c.rank).sort((a, b) => a - b);
  if (sorted.at(-1) === 13 && sorted.includes(1)) return messages().hand.whyAce;
  return messages().hand.whyGap;
}
