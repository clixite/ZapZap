/**
 * Les icônes de l'interface.
 *
 * En SVG et non en émoji : un émoji est rendu par la police du système, donc
 * il change de dessin, de couleur et de taille d'un appareil à l'autre — 🗂️
 * est un classeur coloré sur un téléphone, un carré terne sur un autre. Sur les
 * commandes du jeu, cette loterie se voit tout de suite.
 *
 * Elles héritent de `currentColor` et se dimensionnent au texte : un seul trait
 * de 1,75 px, arrondi, cohérent avec la typographie.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 22, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Retour / sortie de table. */
export function IconBack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Svg>
  );
}

/** Les cartes déjà passées : un empilement. */
export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7" width="12" height="14" rx="2" />
      <path d="M8 4h9a2 2 0 0 1 2 2v11" />
      <path d="M7 12h4M7 16h4" />
    </Svg>
  );
}

/** Les réactions. */
export function IconSmile(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </Svg>
  );
}

/** Son actif. */
export function IconSound(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  );
}

/** Son coupé. */
export function IconMuted(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </Svg>
  );
}

/** Partage. */
export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </Svg>
  );
}

/**
 * La donne : deux cartes en éventail.
 *
 * L'attente du donneur portait un 🎴 — l'émoji « fleur sur carte à jouer », un
 * hanafuda japonais qui n'a rien à voir avec un jeu de 52 cartes, rendu rouge
 * vif sur un appareil et gris plat sur un autre. Dessinée, l'icône dit ce qui se
 * passe et se tait sur le reste.
 */
export function IconDeal(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="5" width="11" height="15" rx="2" />
      <path d="M13.5 4.2 5.9 6.6a2 2 0 0 0-1.3 2.5l3 9.6" />
    </Svg>
  );
}

/** L'éclair du jeu — marque, pas décor. */
export function IconBolt({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.6 1.5 4.2 13.4a.6.6 0 0 0 .47.98h5.1l-1.4 8.1a.6.6 0 0 0 1.07.46l9.4-11.9a.6.6 0 0 0-.47-.98h-5.1l1.4-8.1a.6.6 0 0 0-1.07-.46Z" />
    </svg>
  );
}
