import { useLayoutEffect, useMemo, useState } from 'react';

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
  /** Taille réelle du tapis : sert aux animations qui partent d'un point précis. */
  width: number;
  height: number;
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
  /**
   * L'étiquette au-dessus du tas tient-elle ?
   *
   * « Pioche » et « Carte retournée » sont un confort, pas une information :
   * un dos de carte se reconnaît, et la légende chiffrée en dessous reste
   * toujours affichée. Sur un feutre très court — un iPhone SE n'en donne que
   * 226 px — les deux étiquettes se chevauchaient horizontalement et
   * débordaient sur la ligne de score des sièges. On les retire plutôt que de
   * les laisser se marcher dessus ; les lecteurs d'écran les gardent.
   */
  showPileLabels: boolean;
  /**
   * Hauteur totale d'un tas : étiquette, carte, relief et légende.
   *
   * Publiée parce que c'est **elle** qui doit tenir dans la bande centrale, et
   * non la seule hauteur de carte. La contrainte portait sur la carte : les
   * deux lignes de texte et le relief du talon débordaient donc par-dessous, et
   * la légende « 30 cartes » descendait sur la ligne d'état — visible sur un
   * iPhone SE, invisible pour un test qui ne mesurait que la carte.
   */
  pileH: number;
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

/**
 * Le relief du talon, réservé dans la géométrie.
 *
 * Cinq feuillets au maximum, chacun décalé de deux pixels et demi : un tas
 * plein dépasse donc sa carte de douze pixels vers le haut. La valeur est fixe
 * plutôt que dérivée de la largeur de carte, parce que celle-ci se déduit
 * justement de la place disponible — on tournerait en rond.
 */
export const STACK_LIFT = 12;

/**
 * Étiquette et légende, au-dessus et au-dessous de chaque tas.
 *
 * Elles n'étaient comptées nulle part : la carte prenait 62 % de la bande
 * centrale, et les deux lignes de texte débordaient par-dessous — la légende
 * « 30 cartes » descendait dans la bande réservée à la ligne d'état, où se
 * trouvent le bouton du journal et celui des réactions. Mesuré, pas supposé.
 */
const LABELS_H = 34;

/**
 * Part de la bande centrale que le tas peut occuper, texte et relief compris.
 *
 * Le reste est du blanc autour, qui n'est pas perdu : c'est lui qui empêche le
 * centre de toucher les sièges au-dessus et la ligne d'état au-dessous.
 */
const PILE_SHARE = 0.78;
export const CARD_RATIO = 1.5;

/*
 * Plancher de largeur de carte.
 *
 * Volontairement bas : sur un écran très court, mieux vaut une carte petite
 * mais entière qu'une carte confortable qui passe sous le bandeau de tour. La
 * lisibilité est vérifiée par ailleurs — voir « garde des cartes lisibles ».
 */
const CARD_W_MIN = 34;
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
export function computeLayout(
  width: number,
  height: number,
  opponents: number,
  /*
   * Ce que l'encoche mange en haut du feutre.
   *
   * `viewport-fit=cover` fait monter le tapis jusqu'au bord physique de
   * l'écran. Les sièges partaient donc de `PAD`, soit huit pixels du haut — et
   * sur un téléphone à encoche, le siège du milieu se retrouvait derrière
   * l'horloge, sa pastille de cartes coupée. Un décalage plutôt qu'une marge
   * CSS : un élément en position absolue se place par rapport à la boîte de
   * remplissage, une `padding-top` ne l'aurait pas déplacé d'un pixel.
   */
  insetTop = 0,
): FeltLayout {
  const usableW = Math.max(120, width - PAD * 2);
  const usableH = Math.max(160, height - PAD * 2 - STATUS_H - insetTop);
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
    const top = insetTop + (seatsBelowCorners ? CORNER_H : PAD) + seatH / 2;
    for (let i = 0; i < opponents; i++) {
      const t = opponents === 1 ? 0.5 : i / (opponents - 1);
      const x = seatBandX + slotW / 2 + t * (seatBandW - slotW);
      const y = top + Math.abs(t - 0.5) * 2 * arc;
      seats.push({ x: Math.round(x), y: Math.round(y) });
    }
  }

  // Ce qui reste entre le bas des sièges et la ligne d'état. Les sièges des
  // bords descendent de `arc` : on part du plus bas d'entre eux.
  const seatsBottom = opponents > 0 ? Math.max(...seats.map((s) => s.y)) + seatH / 2 : insetTop + PAD;
  const centreBand = Math.max(60, height - STATUS_H - PAD - seatsBottom);

  /*
   * Le centre remonte vers les sièges plutôt que de flotter au milieu.
   *
   * Centré dans la bande restante, il laissait un grand vide entre lui et la
   * ligne d'état sur les écrans hauts : le regard tombait dans le trou. À 42 %
   * de la bande, pioche et défausse restent dans le prolongement de la table,
   * et l'espace libre se retrouve là où il sert — au-dessus de la main.
   */
  /*
   * Deux tas côte à côte, plus leurs étiquettes et leur épaisseur.
   *
   * La carte ne peut pas dépasser le quart de la largeur, ni la moitié de la
   * bande en hauteur. `STACK_LIFT` réserve en plus le relief du talon : un tas
   * épais est plus haut qu'une carte, et sans cette réserve sa légende
   * descendait sur la barre du minuteur, en bas du feutre.
   */
  // Sous ce seuil, la bande ne peut pas porter à la fois les deux étiquettes,
  // la carte et sa légende sans que quelque chose en écrase un autre.
  const showPileLabels = centreBand >= 150;
  const labelsH = showPileLabels ? LABELS_H : LABELS_H / 2;

  const byWidth = usableW / 2 - 34;
  const byHeight = (centreBand * PILE_SHARE - labelsH - STACK_LIFT) / CARD_RATIO;
  const cardW = Math.round(Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, Math.min(byWidth, byHeight))));
  const gap = Math.max(24, Math.round(cardW * 0.55));
  const cardH = Math.round(cardW * CARD_RATIO);
  const pileH = cardH + STACK_LIFT + labelsH;

  /*
   * Le tas ne sort ni par le haut ni par le bas, quoi qu'il arrive.
   *
   * `centreY` visait 42 % de la bande — bon équilibre sur un grand écran, mais
   * rien ne l'empêchait de pousser le tas sur les sièges au-dessus ou sur la
   * ligne d'état au-dessous quand la bande devenait étroite. On borne donc la
   * position par la moitié de la hauteur réelle du tas.
   *
   * Quand la bande est plus courte que le tas lui-même — un écran minuscule —
   * les deux bornes se croisent : on centre alors dans la bande, ce qui répartit
   * le débordement des deux côtés au lieu de le concentrer d'un seul.
   */
  const half = pileH / 2;
  /*
   * Un filet d'air sous les sièges.
   *
   * `seatsBottom` s'arrête à la boîte théorique du siège ; le pseudo et le
   * score s'y logent au pixel près, si bien que le tas venait coller dessous et
   * que « Pioche » se lisait par-dessus « 0 pt » sur les écrans courts. Six
   * pixels suffisent à séparer les deux ; quand la bande est trop étroite pour
   * les offrir, le bornage plus bas répartit le manque des deux côtés.
   */
  const lowest = seatsBottom + half + 6;
  const highest = height - STATUS_H - half;
  const centreY = Math.round(
    lowest > highest
      ? (seatsBottom + height - STATUS_H) / 2
      : Math.min(Math.max(seatsBottom + centreBand * 0.42, lowest), highest),
  );

  return {
    width,
    height,
    seats,
    seatW,
    seatH,
    seatsBelowCorners,
    avatar,
    showName,
    stock: { x: Math.round(width / 2 - cardW / 2 - gap / 2), y: centreY },
    discard: { x: Math.round(width / 2 + cardW / 2 + gap / 2), y: centreY },
    cardW,
    cardH,
    pileH,
    showPileLabels,
  };
}

/** Mesure le tapis et recalcule la géométrie quand il change de taille. */
export function useFeltLayout(
  opponents: number,
): [(node: HTMLDivElement | null) => void, FeltLayout] {
  /*
   * Une référence **rappelée**, pas une référence muette.
   *
   * L'effet ne dépendait de rien et lisait `ref.current` : au premier rendu, la
   * table affiche « Connexion à la table… » et le feutre n'existe pas encore,
   * donc l'effet trouvait `null` et abandonnait — pour ne plus jamais se
   * relancer, faute de dépendance. La géométrie restait figée sur la taille par
   * défaut de 360 × 420, quel que soit le téléphone.
   *
   * Sur un grand écran, le défaut est assez proche de la réalité pour que
   * personne ne le remarque. Sur un iPhone SE, dont le feutre ne fait que
   * 226 px de haut, les cartes étaient calculées pour 420 : le tas dépassait de
   * quatre-vingt-huit pixels et le bandeau de tour le coupait en deux.
   *
   * Une référence rappelée redéclenche l'effet à l'apparition du nœud, ce
   * qu'une `RefObject` ne peut pas faire.
   */
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 360, height: 420 });

  const [insetTop, setInsetTop] = useState(0);

  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
      /*
       * L'encoche se lit sur le document, pas sur le feutre.
       *
       * `env()` n'est utilisable qu'en CSS ; on la fait donc calculer par le
       * navigateur dans une variable, qu'on relit ici en pixels. Mesurée à
       * chaque redimensionnement parce qu'elle change à la rotation — le creux
       * passe du haut au côté.
       */
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--zz-inset-top');
      setInsetTop(Number.parseFloat(raw) || 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // Mémoïsée : la géométrie ne dépend que de la taille et du nombre de joueurs,
  // alors que le composant se rend à chaque coup joué.
  const layout = useMemo(
    () => computeLayout(size.width, size.height, opponents, insetTop),
    [size.width, size.height, opponents, insetTop],
  );
  return [setNode, layout];
}
