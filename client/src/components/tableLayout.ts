import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

/**
 * Géométrie du tapis.
 *
 * Tout est calculé depuis la taille réelle du feutre plutôt que fixé en
 * pourcentages : à six joueurs sur un petit téléphone, des positions écrites à
 * la main finissent toujours par se chevaucher.
 *
 * Le tapis se lit en trois bandes, de haut en bas :
 *
 *  - les **sièges adverses**, sur un arc surbaissé — rien ne sort du tapis,
 *    rien ne chevauche son voisin ;
 *  - le **centre**, où voisinent la pioche et la défausse. C'est la pièce
 *    propre à ZapZap : il n'y a pas de pli à montrer, mais deux tas entre
 *    lesquels le joueur doit choisir à chaque tour, donc ils doivent être
 *    côte à côte et de même taille ;
 *  - la **ligne d'état**, réservée en bas, où vivent « au tour de… » et les
 *    réactions. Rien ne doit y descendre, sinon le texte passe sous une carte.
 *
 * La main, elle, ne vit pas sur le tapis : elle a son propre panneau, toujours
 * visible, y compris pendant la donne.
 */

export interface Point {
  x: number;
  y: number;
}

export interface FeltLayout {
  /** Centre de chaque siège adverse, dans l'ordre du tour à partir de moi. */
  seats: Point[];
  seatW: number;
  seatH: number;
  /**
   * Les sièges occupent-ils toute la largeur, sous les boutons de coin ?
   * Vrai seulement quand la table est trop serrée pour les contourner.
   */
  seatsBelowCorners: boolean;
  avatar: number;
  /** Le pseudo tient-il sous l'avatar, ou la table est-elle trop serrée ? */
  showName: boolean;
  /** Centre de la pioche et de la défausse. */
  stock: Point;
  discard: Point;
  cardW: number;
  cardH: number;
}

const PAD = 8;
/**
 * Marge réservée en haut à gauche et à droite : la sortie de table et, plus
 * tard, tout bouton de coin. Sans elle, le premier siège passait sous le bouton
 * retour et son avatar devenait à moitié cliquable.
 */
export const CORNER_W = 52;
/** Hauteur de ces mêmes boutons, marge comprise. */
export const CORNER_H = 52;
/** Respiration minimale entre deux sièges voisins. */
const GUTTER = 6;
/** En dessous, un siège n'a plus la place d'un avatar tactile. */
const SEAT_W_MIN = 44;
/**
 * Bande réservée en bas du tapis : ligne d'état et bouton des réactions.
 * Rien du centre ne doit y descendre.
 */
export const STATUS_H = 48;
export const CARD_RATIO = 1.5;

const CARD_W_MIN = 40;
const CARD_W_MAX = 84;
const AVATAR_MIN = 30;
const AVATAR_MAX = 52;

/** Hauteur réellement occupée par un siège : avatar, pseudo, pastille de cartes. */
function seatHeight(avatar: number, withName: boolean): number {
  return avatar + (withName ? 40 : 30);
}

/**
 * La géométrie, pour une taille de tapis et un nombre d'adversaires donnés.
 *
 * Fonction pure : c'est ce qui permet de la balayer sur toutes les tailles
 * d'écran plausibles dans un test unitaire, plutôt que de découvrir un
 * chevauchement sur un téléphone qu'on n'a pas sous la main.
 */
export function computeLayout(width: number, height: number, opponents: number): FeltLayout {
  const usableW = Math.max(120, width - PAD * 2);
  const usableH = Math.max(160, height - PAD * 2 - STATUS_H);
  const n = Math.max(1, opponents);

  /*
   * Les coins du haut appartiennent aux boutons — sortie de table à gauche,
   * réactions à droite. La bande des sièges les contourne… tant qu'elle le
   * peut : à cinq adversaires sur un écran de 320 px, les éviter ne laisse plus
   * que 39 px par siège et les avatars se chevauchent. Dans ce cas on reprend
   * toute la largeur et on fait **descendre** les sièges sous les boutons :
   * mieux vaut une table un cran plus basse que des voisins empilés.
   */
  const insetBandW = Math.max(120, width - (PAD + CORNER_W) * 2);
  const fitsBesideCorners = insetBandW / n - GUTTER >= SEAT_W_MIN;
  const seatsBelowCorners = !fitsBesideCorners;
  const seatBandX = fitsBesideCorners ? PAD + CORNER_W : PAD;
  const seatBandW = fitsBesideCorners ? insetBandW : usableW;

  // Le siège doit tenir dans la bande, quel que soit le nombre d'adversaires.
  const slotW = Math.max(SEAT_W_MIN, seatBandW / n - GUTTER);
  const avatar = Math.round(Math.min(AVATAR_MAX, Math.max(AVATAR_MIN, Math.min(slotW * 0.62, usableH * 0.16))));
  // Sous 56 px de large, le pseudo est illisible : mieux vaut ne pas l'afficher
  // que de le tronquer à deux lettres.
  const showName = slotW >= 56;
  const seatH = seatHeight(avatar, showName);
  const seatW = Math.round(slotW);

  const seats: Point[] = [];
  if (opponents > 0) {
    // Arc surbaissé : les sièges des extrémités descendent un peu, ce qui
    // creuse le haut du tapis et fait lire une table plutôt qu'une barre.
    const arc = Math.min(usableH * 0.08, 22);
    // Sous les boutons quand on n'a pas pu les contourner.
    const top = (seatsBelowCorners ? CORNER_H : PAD) + seatH / 2;
    for (let i = 0; i < opponents; i++) {
      const t = opponents === 1 ? 0.5 : i / (opponents - 1);
      const x = seatBandX + slotW / 2 + t * (seatBandW - slotW);
      const y = top + Math.abs(t - 0.5) * 2 * arc;
      seats.push({ x: Math.round(x), y: Math.round(y) });
    }
  }

  // Ce qui reste entre le bas des sièges et la ligne d'état. Les sièges des
  // bords descendent de `arc` : on part du plus bas d'entre eux.
  const seatsBottom = opponents > 0 ? Math.max(...seats.map((s) => s.y)) + seatH / 2 : PAD;
  const centreBand = Math.max(60, height - STATUS_H - PAD - seatsBottom);

  /*
   * Le centre remonte vers les sièges plutôt que de flotter au milieu.
   *
   * Centré dans la bande restante, il laissait un grand vide entre lui et la
   * ligne d'état sur les écrans hauts : le regard tombait dans le trou. À 42 %
   * de la bande, pioche et défausse restent dans le prolongement de la table,
   * et l'espace libre se retrouve là où il sert — au-dessus de la main.
   */
  const centreY = Math.round(seatsBottom + centreBand * 0.42);

  // Deux tas côte à côte, plus leurs étiquettes : la carte ne peut pas dépasser
  // le quart de la largeur, ni la moitié de la bande en hauteur.
  const byWidth = usableW / 2 - 34;
  const byHeight = (centreBand * 0.62) / CARD_RATIO;
  const cardW = Math.round(Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, Math.min(byWidth, byHeight))));
  const gap = Math.max(24, Math.round(cardW * 0.55));

  return {
    seats,
    seatW,
    seatH,
    seatsBelowCorners,
    avatar,
    showName,
    stock: { x: Math.round(width / 2 - cardW / 2 - gap / 2), y: centreY },
    discard: { x: Math.round(width / 2 + cardW / 2 + gap / 2), y: centreY },
    cardW,
    cardH: Math.round(cardW * CARD_RATIO),
  };
}

/** Mesure le tapis et recalcule la géométrie quand il change de taille. */
export function useFeltLayout(opponents: number): [RefObject<HTMLDivElement>, FeltLayout] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 360, height: 420 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Mémoïsée : la géométrie ne dépend que de la taille et du nombre de joueurs,
  // alors que le composant se rend à chaque coup joué.
  const layout = useMemo(
    () => computeLayout(size.width, size.height, opponents),
    [size.width, size.height, opponents],
  );
  return [ref, layout];
}
