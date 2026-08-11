import { describe, expect, it } from 'vitest';
import { CARD_RATIO, CORNER_H, CORNER_W, STATUS_H, computeLayout } from '../src/components/tableLayout';

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
/*
 * Ce que l'encoche mange en haut.
 *
 * `0` pour un écran sans encoche ou un navigateur classique ; `47` et `59`
 * sont les valeurs réelles de l'île dynamique d'un iPhone récent en mode
 * installé, qui est **le** mode qu'on vient de promouvoir. Balayer sans elles,
 * c'était vérifier une géométrie que plus personne n'utilise en plein écran.
 */
const INSETS = [0, 47, 59];

function everyCase(check: (w: number, h: number, opp: number, inset: number) => void): void {
  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      for (const opp of OPPONENTS) {
        for (const inset of INSETS) check(w, h, opp, inset);
      }
    }
  }
}

describe('sièges', () => {
  it('en place un par adversaire', () => {
    everyCase((w, h, opp, inset) => {
      expect(computeLayout(w, h, opp, inset).seats).toHaveLength(opp);
    });
  });

  it('ne sort jamais du tapis', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      for (const seat of layout.seats) {
        expect(seat.x - layout.seatW / 2).toBeGreaterThanOrEqual(-1);
        expect(seat.x + layout.seatW / 2).toBeLessThanOrEqual(w + 1);
        expect(seat.y - layout.seatH / 2).toBeGreaterThanOrEqual(-1);
        expect(seat.y + layout.seatH / 2).toBeLessThanOrEqual(h + 1);
      }
    });
  });

  it('ne passe jamais sous l’encoche', () => {
    /*
     * L'assertion qui manquait, et qui laissait le défaut passer.
     *
     * « Ne sort jamais du tapis » bornait les sièges à `y >= 0` — le bord
     * *physique* de l'écran. Or depuis `viewport-fit=cover`, le haut du tapis
     * passe **sous** l'horloge et l'île dynamique : un siège à `y = 10` est
     * dans le tapis et pourtant invisible, sa pastille de cartes coupée. Le
     * bord utile n'est pas zéro, c'est l'encoche.
     */
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      for (const seat of layout.seats) {
        expect(seat.y - layout.seatH / 2).toBeGreaterThanOrEqual(inset - 1);
      }
    });
  });

  it('ne passe jamais sous les boutons de coin', () => {
    // La sortie de table vit en haut à gauche, les réactions en haut à droite :
    // un siège qui passe dessous devient à moitié cliquable. Soit il les
    // contourne en largeur, soit toute la rangée descend dessous.
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      for (const seat of layout.seats) {
        const left = seat.x - layout.seatW / 2;
        const right = seat.x + layout.seatW / 2;
        const top = seat.y - layout.seatH / 2;
        const clearsHorizontally = left >= CORNER_W - 1 && right <= w - CORNER_W + 1;
        const clearsVertically = top >= CORNER_H - 1;
        expect(clearsHorizontally || clearsVertically).toBe(true);
      }
    });
  });

  it('descend la rangée seulement quand elle ne peut pas contourner', () => {
    // Écran large, deux adversaires : la place ne manque pas, on contourne.
    expect(computeLayout(414, 840, 2).seatsBelowCorners).toBe(false);
    // Petit écran, cinq adversaires : contourner donnerait 39 px par siège.
    expect(computeLayout(320, 640, 5).seatsBelowCorners).toBe(true);
  });

  it('ne fait jamais chevaucher deux voisins', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      for (let i = 1; i < layout.seats.length; i++) {
        const gap = layout.seats[i].x - layout.seats[i - 1].x;
        expect(gap).toBeGreaterThanOrEqual(layout.seatW - 1);
      }
    });
  });

  it('les range de gauche à droite', () => {
    everyCase((w, h, opp, inset) => {
      const xs = computeLayout(w, h, opp, inset).seats.map((s) => s.x);
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
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      expect(layout.avatar).toBeGreaterThanOrEqual(30);
      expect(layout.avatar).toBeLessThanOrEqual(52);
    });
  });
});

describe('centre : pioche et défausse', () => {
  it('les pose côte à côte, sans chevauchement', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const gap = layout.discard.x - layout.stock.x;
      expect(gap).toBeGreaterThanOrEqual(layout.cardW);
    });
  });

  it('les garde dans le tapis', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      for (const pile of [layout.stock, layout.discard]) {
        expect(pile.x - layout.cardW / 2).toBeGreaterThanOrEqual(-1);
        expect(pile.x + layout.cardW / 2).toBeLessThanOrEqual(w + 1);
      }
    });
  });

  it('les centre symétriquement', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const middle = (layout.stock.x + layout.discard.x) / 2;
      expect(Math.abs(middle - w / 2)).toBeLessThanOrEqual(1);
    });
  });

  /*
   * Le tas entier, pas la seule carte.
   *
   * Ces deux contrôles ne mesuraient que `cardH`. Or un tas porte au-dessus son
   * étiquette et au-dessous sa légende, plus le relief du talon : près de
   * cinquante pixels que personne ne comptait. Sur un iPhone SE, la légende
   * « 30 cartes » descendait donc sur la ligne d'état et le bandeau de tour
   * coupait les cartes en deux — pendant que ces tests restaient au vert.
   */
  it('ne descend jamais sur la ligne d’état, étiquettes comprises', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const bottom = layout.stock.y + layout.pileH / 2;
      expect(bottom).toBeLessThanOrEqual(h - STATUS_H + 1);
    });
  });

  it('ne remonte jamais sur les sièges, étiquettes comprises', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const top = layout.stock.y - layout.pileH / 2;
      const seatsBottom = Math.max(0, ...layout.seats.map((s) => s.y + layout.seatH / 2));
      expect(top).toBeGreaterThanOrEqual(seatsBottom - 1);
    });
  });

  it('publie une hauteur de tas cohérente avec la carte', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      expect(layout.pileH).toBeGreaterThan(layout.cardH);
      expect(Number.isFinite(layout.pileH)).toBe(true);
    });
  });

  it('garde des cartes lisibles', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      // En dessous de 40 px, le rang n'est plus lisible.
      expect(layout.cardW).toBeGreaterThanOrEqual(40);
      expect(layout.cardH).toBe(Math.round(layout.cardW * CARD_RATIO));
    });
  });

  /*
   * La borne haute portait un chiffre, pas une raison.
   *
   * Elle recopiait le plafond de la constante — « au-delà de 84, les deux tas
   * mangent le tapis » — si bien qu'elle ne pouvait rien découvrir : elle
   * répétait le code au lieu de le contredire. Baisser le plafond l'aurait
   * laissée verte alors que les cartes seraient devenues minuscules.
   *
   * Ce qui compte vraiment, c'est que les deux tas tiennent côte à côte sans se
   * toucher ni sortir du feutre. On le mesure, cette fois, au lieu de le
   * supposer.
   */
  it('laisse les deux tas côte à côte dans le feutre', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const half = layout.cardW / 2;
      expect(layout.stock.x - half).toBeGreaterThanOrEqual(0);
      expect(layout.discard.x + half).toBeLessThanOrEqual(w);
      // Un vrai intervalle entre les deux : sans lui, on vise la pioche et on
      // ramasse la défausse.
      expect(layout.discard.x - half).toBeGreaterThan(layout.stock.x + half);
    });
  });

  /*
   * Le cas qui a réellement débordé.
   *
   * Une carte seule tenait ; c'est la **paire** qui sortait de l'écran, parce
   * que la défausse étale ses cartes et que rien dans la géométrie ne le
   * comptait. Le test précédent, qui ne mesurait qu'une carte, passait au vert
   * pendant que le tapis se décalait à l'écran.
   *
   * Deux cartes chevauchées à 32 % occupent 1,68 largeur de carte, centrées sur
   * le point de la défausse.
   */
  it('garde une défausse de deux cartes dans le feutre', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
      const fanHalf = (layout.cardW * 1.68) / 2;
      expect(layout.discard.x + fanHalf).toBeLessThanOrEqual(w);
      expect(layout.discard.x - fanHalf).toBeGreaterThan(layout.stock.x - layout.cardW / 2);
    });
  });
});

describe('robustesse', () => {
  it('ne produit jamais de valeur non finie', () => {
    everyCase((w, h, opp, inset) => {
      const layout = computeLayout(w, h, opp, inset);
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
