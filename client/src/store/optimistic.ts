import { cardId, handValue, type CardId, type GameView } from '@zapzap/shared';

/**
 * L'action qu'on montre avant que le serveur ne l'ait confirmée.
 *
 * Sur un réseau mobile, l'aller-retour d'un coup coûte 80 à 300 ms : sans rien,
 * on tape une carte et il ne se passe rien pendant un tiers de seconde. C'est
 * exactement la sensation qui distingue une application soignée d'un prototype.
 *
 * Le principe est strict : **on ne rejoue aucune règle**. Le serveur a déjà dit
 * ce qui était jouable (`legalCombos`, `drawOptions`) ; on se contente de
 * déplacer à l'écran ce qu'il avait autorisé, et la première vue reçue efface
 * tout. Le client ne devient jamais une seconde source de vérité — il n'a que
 * de l'avance.
 */
export type Pending =
  | { kind: 'discard'; cardIds: CardId[] }
  | { kind: 'draw'; from: 'stock' | 'discard'; cardId?: CardId }
  | { kind: 'zap' }
  | null;

/**
 * La vue telle qu'on l'affiche : celle du serveur, plus le coup en vol.
 *
 * Les compteurs suivent aussi (cartes en main, taille de la pioche) : une main
 * qui se vide pendant que la pastille du haut reste figée trahit l'illusion.
 */
export function applyPending(view: GameView, pending: Pending): GameView {
  if (!pending || !view.round) return view;
  const round = view.round;

  switch (pending.kind) {
    case 'discard': {
      const posed = new Set(pending.cardIds);
      const myHand = round.myHand.filter((c) => !posed.has(cardId(c)));
      const cards = round.myHand.filter((c) => posed.has(cardId(c)));
      return {
        ...view,
        round: {
          ...round,
          myHand,
          handCounts: { ...round.handCounts, [view.you]: myHand.length },
          // La pose apparaît tout de suite au centre, à l'endroit exact où le
          // serveur la placera : c'est ce qui donne l'impression que la carte
          // « part ».
          pendingDiscard: { playerId: view.you, combo: { kind: 'single', cards } },
          turnStep: 'draw',
          legalCombos: null,
          canZap: false,
        },
      };
    }

    case 'draw': {
      const taken =
        pending.from === 'discard'
          ? (round.drawOptions ?? []).find((o) => o.cardId === pending.cardId)?.card
          : undefined;
      return {
        ...view,
        round: {
          ...round,
          myHand: taken ? [...round.myHand, taken] : round.myHand,
          handCounts: { ...round.handCounts, [view.you]: round.myHand.length + 1 },
          stockCount: pending.from === 'stock' ? Math.max(0, round.stockCount - 1) : round.stockCount,
          // Le tour est fini de notre point de vue : on éteint les cibles
          // plutôt que de laisser piocher deux fois.
          drawOptions: null,
        },
      };
    }

    case 'zap':
      // Rien à déplacer : l'annonce se résout entièrement côté serveur. On
      // éteint seulement le bouton pour qu'un second appui ne parte pas.
      return { ...view, round: { ...round, canZap: false, legalCombos: null } };
  }
}

/** Total affiché sous la main, cohérent avec le coup en vol. */
export function displayedHandValue(view: GameView): number {
  return handValue(view.round?.myHand ?? []);
}
