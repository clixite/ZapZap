import { useSyncExternalStore } from 'react';
import type { HandSort } from '@zapzap/shared';

/**
 * Le dos de carte, au choix du joueur.
 *
 * C'est une préférence purement décorative, et c'est exactement pour ça qu'elle
 * compte : le dos est ce qu'on regarde le plus longtemps dans une partie —
 * cinq mains adverses et une pioche, à chaque tour, pendant vingt minutes. Tous
 * les jeux de cartes qui tiennent leurs joueurs en proposent plusieurs, et
 * c'est le premier réglage que les gens vont chercher.
 *
 * Purement local, donc : aucun aller-retour serveur, aucune incidence sur la
 * partie, et chacun voit le sien. Deux personnes à la même table peuvent avoir
 * des dos différents sans que cela ait le moindre sens de le synchroniser — un
 * dos ne porte aucune information de jeu.
 */

export const CARD_BACKS = ['storm', 'volt', 'flash', 'ink', 'paper'] as const;
export type CardBackId = (typeof CARD_BACKS)[number];

export interface CardBackStyle {
  /** Fond de la carte. */
  background: string;
  /** Liseré. */
  border: string;
  /** Motif répété, en surimpression. */
  pattern: string;
  /** Opacité du motif : un fond clair supporte moins de contraste. */
  patternOpacity: number;
  /** Couleur de l'éclair central. */
  glyph: string;
}

/**
 * Cinq dos, et pas trente : chacun doit se distinguer d'un coup d'œil à la
 * taille d'un pouce. Au-delà, on ne choisit plus, on fait défiler.
 */
export const CARD_BACK_STYLES: Record<CardBackId, CardBackStyle> = {
  storm: {
    background: 'linear-gradient(150deg, var(--color-storm-600), var(--color-storm-800))',
    border: '2px solid var(--color-storm-500)',
    pattern:
      'repeating-linear-gradient(58deg, transparent 0 5px, var(--color-volt-400) 5px 6px, transparent 6px 11px)',
    patternOpacity: 0.3,
    glyph: 'var(--color-paper-50)',
  },
  volt: {
    background: 'linear-gradient(150deg, var(--color-volt-600), var(--color-storm-800))',
    border: '2px solid var(--color-volt-400)',
    pattern:
      'repeating-linear-gradient(122deg, transparent 0 4px, var(--color-volt-200) 4px 5px, transparent 5px 12px)',
    patternOpacity: 0.28,
    glyph: 'var(--color-volt-200)',
  },
  flash: {
    background: 'linear-gradient(150deg, var(--color-flash-500), var(--color-storm-700))',
    border: '2px solid var(--color-flash-400)',
    pattern:
      'repeating-radial-gradient(circle at 50% 0%, transparent 0 8px, var(--color-flash-400) 8px 9px, transparent 9px 18px)',
    patternOpacity: 0.35,
    glyph: 'var(--color-flash-400)',
  },
  ink: {
    background: 'linear-gradient(150deg, #23222e, var(--color-ink))',
    border: '2px solid #3a3846',
    pattern:
      'repeating-linear-gradient(45deg, transparent 0 6px, rgba(255,255,255,0.5) 6px 7px, transparent 7px 14px)',
    patternOpacity: 0.16,
    glyph: 'var(--color-paper-300)',
  },
  paper: {
    background: 'linear-gradient(150deg, var(--color-paper-100), var(--color-paper-300))',
    border: '2px solid var(--color-paper-50)',
    pattern:
      'repeating-linear-gradient(58deg, transparent 0 5px, var(--color-storm-600) 5px 6px, transparent 6px 11px)',
    patternOpacity: 0.22,
    glyph: 'var(--color-storm-700)',
  },
};

const KEY = 'zapzap.cardback';
const listeners = new Set<() => void>();
let current: CardBackId = read();

function read(): CardBackId {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (CARD_BACKS as readonly string[]).includes(saved)) return saved as CardBackId;
  } catch {
    /* stockage indisponible : le dos par défaut fera l'affaire */
  }
  return 'storm';
}

export function setCardBack(id: CardBackId): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // sans stockage, le choix vaut pour la session
  }
  listeners.forEach((cb) => cb());
}

export function cardBack(): CardBackId {
  return current;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCardBack(): CardBackId {
  return useSyncExternalStore(subscribe, cardBack, cardBack);
}

/**
 * Le paquet à quatre couleurs.
 *
 * Rouge et noir sont le seul repère entre familles sur un jeu classique : pour
 * une deutéranopie ou une protanopie — près d'un homme sur douze — ♥ et ♠
 * deviennent la même carte. Le standard des jeux de cartes est le paquet à
 * quatre couleurs, et la feuille de style le portait déjà… sous un attribut que
 * personne ne posait jamais. Le mode existait donc sur le papier et nulle part
 * ailleurs. Voici l'interrupteur.
 *
 * Purement local, comme le dos : ce que je vois ne regarde pas la table.
 */
const CB_KEY = 'zapzap.colorblind';
const cbListeners = new Set<() => void>();
let colorblindOn = readColorblind();

function readColorblind(): boolean {
  try {
    return localStorage.getItem(CB_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Applique la préférence au document — c'est elle qui déclenche la règle CSS. */
function paint(): void {
  if (typeof document === 'undefined') return;
  if (colorblindOn) document.documentElement.dataset.colorblind = 'true';
  else delete document.documentElement.dataset.colorblind;
}

paint();

export function setColorblind(on: boolean): void {
  colorblindOn = on;
  try {
    localStorage.setItem(CB_KEY, String(on));
  } catch {
    // sans stockage, le choix vaut pour la session
  }
  paint();
  cbListeners.forEach((cb) => cb());
}

function colorblind(): boolean {
  return colorblindOn;
}

function subscribeColorblind(cb: () => void): () => void {
  cbListeners.add(cb);
  return () => cbListeners.delete(cb);
}

export function useColorblind(): boolean {
  return useSyncExternalStore(subscribeColorblind, colorblind, colorblind);
}

/**
 * Comment je tiens ma main : par couleur, ou par rang.
 *
 * Voir `sortHandBy` pour la raison de fond — les suites et les ensembles se
 * lisent dans des tris opposés, et n'en avoir qu'un en cache toujours la
 * moitié. La préférence est **locale et privée** : elle ne part pas au serveur,
 * personne d'autre ne la voit, et elle ne peut donc rien changer au jeu. C'est
 * exactement le statut de la façon dont on range ses cartes en main.
 *
 * Retenue d'une partie à l'autre : réarranger sa main est un geste qu'on fait
 * une fois, pas à chaque manche.
 */
const SORT_KEY = 'zapzap.handsort';
const sortListeners = new Set<() => void>();
let handSortValue: HandSort = readSort();

function readSort(): HandSort {
  try {
    return localStorage.getItem(SORT_KEY) === 'rank' ? 'rank' : 'suit';
  } catch {
    return 'suit';
  }
}

export function setHandSort(order: HandSort): void {
  handSortValue = order;
  try {
    localStorage.setItem(SORT_KEY, order);
  } catch {
    // sans stockage, le choix vaut pour la session
  }
  sortListeners.forEach((cb) => cb());
}

function handSort(): HandSort {
  return handSortValue;
}

function subscribeSort(cb: () => void): () => void {
  sortListeners.add(cb);
  return () => sortListeners.delete(cb);
}

export function useHandSort(): HandSort {
  return useSyncExternalStore(subscribeSort, handSort, handSort);
}
