import { useMemo } from 'react';
import { cardId, classify, comboOptions, handValue, type Card, type ZapVariants } from '@zapzap/shared';
import { CardFace } from './CardFace';

/**
 * La main.
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
 */

export interface HandFanProps {
  hand: Card[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Sélection possible ? Faux quand ce n'est pas à moi de défausser. */
  interactive: boolean;
  variants: ZapVariants;
  width: number;
}

export function HandFan({ hand, selected, onToggle, interactive, variants, width }: HandFanProps) {
  // La main s'élargit avec le nombre de cartes : à sept cartes sur un petit
  // écran, elles se chevauchent plutôt que de rétrécir jusqu'à l'illisible.
  const cardW = Math.round(Math.max(46, Math.min(76, (width - 24) / Math.max(4, hand.length) - 4)));
  const overlap = hand.length > 6 ? Math.round(cardW * 0.24) : 0;

  const chosen = useMemo(() => hand.filter((c) => selected.includes(cardId(c))), [hand, selected]);
  const kind = chosen.length > 0 ? classify(chosen, comboOptions(variants)) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-end justify-center px-3 pt-4"
        style={{ marginRight: overlap }}
        role="group"
        aria-label="Votre main"
      >
        {hand.map((card) => {
          const id = cardId(card);
          const isSelected = selected.includes(id);
          return (
            <span key={id} style={{ marginRight: -overlap, zIndex: isSelected ? 20 : 1 }}>
              <CardFace
                card={card}
                width={cardW}
                selected={isSelected}
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

const KIND_LABEL: Record<string, string> = {
  single: 'Carte seule',
  set: 'Ensemble',
  run: 'Suite',
};

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
    return <p className="text-sm text-paper-300">La donne arrive…</p>;
  }
  if (!interactive) {
    return <p className="text-sm text-paper-300">Votre main vaut {handTotal} points.</p>;
  }
  if (chosen.length === 0) {
    return <p className="text-sm text-paper-300">Choisissez une carte, un ensemble ou une suite.</p>;
  }
  if (kind) {
    return (
      <p className="text-sm font-medium text-volt-300">
        {KIND_LABEL[kind]} — {handValue(chosen)} point{handValue(chosen) > 1 ? 's' : ''} lâché
        {handValue(chosen) > 1 ? 's' : ''}
      </p>
    );
  }
  return <p className="text-sm text-flash-300">{whyNot(chosen)}</p>;
}

function whyNot(chosen: Card[]): string {
  if (chosen.some((c) => c.suit === 'X')) {
    return 'Un joker se pose seul, ou par paire de jokers.';
  }
  const ranks = new Set(chosen.map((c) => c.rank));
  if (ranks.size === 1) return 'Quatre cartes au maximum pour un carré.';
  if (chosen.length === 2) return 'Deux cartes ne font une paire que si elles ont le même rang.';

  const suits = new Set(chosen.map((c) => c.suit));
  if (suits.size > 1) return 'Une suite doit être d’une seule couleur.';
  const sorted = [...chosen].map((c) => c.rank).sort((a, b) => a - b);
  if (sorted.at(-1) === 13 && sorted.includes(1)) return 'L’As est bas : A-2-3 oui, Dame-Roi-As non.';
  return 'Il manque une carte pour que la suite se tienne.';
}
