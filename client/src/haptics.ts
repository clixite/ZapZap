import { isMuted } from './audio';

/**
 * L'haptique suit le son.
 *
 * Un seul réglage pour les deux : couper le son et sentir quand même le
 * téléphone vibrer serait à moitié obéir. `navigator.vibrate` n'existe pas sur
 * iOS Safari — les motifs y sont simplement sans effet, et c'est très bien
 * comme dégradation.
 */
const PATTERNS = {
  /** Sélection d'une carte. */
  tap: [8],
  /** Coup joué. */
  play: [15],
  /** Annonce réussie, victoire. */
  success: [20, 60, 40],
  /** Annonce ratée, élimination. */
  failure: [60, 40, 60],
  /** C'est votre tour. */
  nudge: [10, 30, 10],
} as const;

export function vibrate(pattern: keyof typeof PATTERNS): void {
  if (isMuted()) return;
  try {
    navigator.vibrate?.(PATTERNS[pattern] as unknown as number[]);
  } catch {
    /* pas d'haptique, pas de drame */
  }
}
