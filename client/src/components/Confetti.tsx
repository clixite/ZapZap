import { useEffect, useState } from 'react';

/**
 * La fanfare visuelle de la victoire.
 *
 * Gagner ne se disait que par une ligne de classement et un son. Les jeux qui
 * tiennent leurs joueurs marquent ce moment — c'est la seule récompense du jeu,
 * et celle dont on se souvient entre deux parties. Trois secondes suffisent :
 * au-delà, on empêche le joueur de lire son score.
 *
 * Pas de canvas, pas de bibliothèque : quarante `span` animés en CSS, que le
 * compositeur du navigateur porte tout seul sur `transform` et `opacity`. Rien
 * à charger, rien à nettoyer, et aucun travail sur le fil principal.
 *
 * `prefers-reduced-motion` la supprime entièrement — une pluie de particules
 * est exactement ce que ce réglage désigne, et le classement se lit sans elle.
 */

const COLOURS = [
  'var(--color-volt-400)',
  'var(--color-flash-400)',
  'var(--color-volt-200)',
  'var(--color-paper-50)',
  'var(--color-storm-400)',
];

/** Suite déterministe : deux rendus successifs ne doivent pas se contredire. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const PIECES = Array.from({ length: 40 }, (_, i) => ({
  left: pseudoRandom(i + 1) * 100,
  delay: pseudoRandom(i + 7) * 700,
  duration: 1800 + pseudoRandom(i + 13) * 1400,
  size: 6 + pseudoRandom(i + 21) * 7,
  colour: COLOURS[i % COLOURS.length],
  spin: pseudoRandom(i + 31) * 720 - 360,
}));

export function Confetti() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 3_400);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div className="zz-confetti pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="zz-confetti-piece absolute top-0 block rounded-[1px]"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 1.6,
            background: piece.colour,
            animationDelay: `${piece.delay}ms`,
            animationDuration: `${piece.duration}ms`,
            ['--zz-spin' as string]: `${piece.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
