import { describe, expect, it } from 'vitest';
import { CARD_RATIO, STATUS_H, computeLayout } from '../src/components/tableLayout';

/**
 * La géométrie du tapis, verrouillée.
 *
 * On balaie toutes les tailles d'écran plausibles plutôt que de vérifier trois
 * cas choisis : un chevauchement n'apparaît jamais sur le téléphone qu'on a
 * sous la main, il apparaît à six joueurs sur le plus petit écran du marché.
 */

/** Des plus petits téléphones encore en service aux plus grandes tablettes. */
const WIDTHS = [320, 360, 375, 390, 414, 428, 480, 600, 768, 1024];
const HEIGHTS = [480, 560, 640, 700, 780, 844, 926, 1000, 1180];
const OPPONENTS = [1, 2, 3, 4, 5];

function everyCase(check: (w: number, h: number, opp: number) => void): void {
  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      for (const opp of OPPONENTS) check(w, h, opp);
    }
  }
}

describe('sièges', () => {
  it('en place un par adversaire', () => {
    everyCase((w, h, opp) => {
      expect(computeLayout(w, h, opp).seats).toHaveLength(opp);
    });
  });

  it('ne sort jamais du tapis', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      for (const seat of layout.seats) {
        expect(seat.x - layout.seatW / 2).toBeGreaterThanOrEqual(-1);
        expect(seat.x + layout.seatW / 2).toBeLessThanOrEqual(w + 1);
        expect(seat.y - layout.seatH / 2).toBeGreaterThanOrEqual(-1);
        expect(seat.y + layout.seatH / 2).toBeLessThanOrEqual(h + 1);
      }
    });
  });

  it('ne fait jamais chevaucher deux voisins', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      for (let i = 1; i < layout.seats.length; i++) {
        const gap = layout.seats[i].x - layout.seats[i - 1].x;
        expect(gap).toBeGreaterThanOrEqual(layout.seatW - 1);
      }
    });
  });

  it('les range de gauche à droite', () => {
    everyCase((w, h, opp) => {
      const xs = computeLayout(w, h, opp).seats.map((s) => s.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    });
  });

  it('cache le pseudo plutôt que de le tronquer quand c’est serré', () => {
    // À six joueurs sur un écran de 320 px, un pseudo tiendrait sur deux
    // lettres : mieux vaut l'avatar seul, le nom reste lisible au tour du joueur.
    expect(computeLayout(320, 640, 5).showName).toBe(false);
    expect(computeLayout(414, 840, 2).showName).toBe(true);
  });

  it('garde des avatars de taille tactile', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      expect(layout.avatar).toBeGreaterThanOrEqual(30);
      expect(layout.avatar).toBeLessThanOrEqual(52);
    });
  });
});

describe('centre : pioche et défausse', () => {
  it('les pose côte à côte, sans chevauchement', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      const gap = layout.discard.x - layout.stock.x;
      expect(gap).toBeGreaterThanOrEqual(layout.cardW);
    });
  });

  it('les garde dans le tapis', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      for (const pile of [layout.stock, layout.discard]) {
        expect(pile.x - layout.cardW / 2).toBeGreaterThanOrEqual(-1);
        expect(pile.x + layout.cardW / 2).toBeLessThanOrEqual(w + 1);
      }
    });
  });

  it('les centre symétriquement', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      const middle = (layout.stock.x + layout.discard.x) / 2;
      expect(Math.abs(middle - w / 2)).toBeLessThanOrEqual(1);
    });
  });

  it('ne descend jamais sur la ligne d’état', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      const bottom = layout.stock.y + layout.cardH / 2;
      expect(bottom).toBeLessThanOrEqual(h - STATUS_H + 1);
    });
  });

  it('ne remonte jamais sur les sièges', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      const top = layout.stock.y - layout.cardH / 2;
      const seatsBottom = Math.max(0, ...layout.seats.map((s) => s.y + layout.seatH / 2));
      expect(top).toBeGreaterThanOrEqual(seatsBottom - 1);
    });
  });

  it('garde des cartes lisibles', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      // En dessous de 40 px, le rang n'est plus lisible ; au-delà de 84, les
      // deux tas mangent le tapis.
      expect(layout.cardW).toBeGreaterThanOrEqual(40);
      expect(layout.cardW).toBeLessThanOrEqual(84);
      expect(layout.cardH).toBe(Math.round(layout.cardW * CARD_RATIO));
    });
  });
});

describe('robustesse', () => {
  it('ne produit jamais de valeur non finie', () => {
    everyCase((w, h, opp) => {
      const layout = computeLayout(w, h, opp);
      const numbers = [
        layout.seatW,
        layout.seatH,
        layout.avatar,
        layout.cardW,
        layout.cardH,
        layout.stock.x,
        layout.stock.y,
        layout.discard.x,
        layout.discard.y,
        ...layout.seats.flatMap((s) => [s.x, s.y]),
      ];
      for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    });
  });

  it('tient sur un tapis dégénéré sans lever', () => {
    // Une mesure à zéro arrive au premier rendu, avant que le tapis ait sa
    // taille : elle ne doit pas produire de NaN ni faire tomber l'écran.
    for (const opp of OPPONENTS) {
      const layout = computeLayout(0, 0, opp);
      expect(Number.isFinite(layout.cardW)).toBe(true);
      expect(layout.seats).toHaveLength(opp);
    }
  });
});
