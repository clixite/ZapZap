/**
 * L'avatar d'un joueur, dans une boîte.
 *
 * Les avatars de ZapZap sont des émoji : c'est un bon choix, parce que le joueur
 * en change d'un geste, qu'aucune image n'est à héberger et qu'un renard se
 * reconnaît dans les vingt-quatre langues. Mais un émoji posé nu dans une ligne
 * de texte n'est pas un caractère comme les autres — il est rendu par la police
 * du système, avec sa propre chasse et sa propre hauteur. Le renard dépassait la
 * capitale, la prise électrique s'affichait couchée et plus large que haute, et
 * la colonne des noms d'une feuille de score ne s'alignait sur rien.
 *
 * La pastille lui impose une boîte carrée et le centre dedans. La ligne
 * redevient une ligne, quel que soit l'émoji et quel que soit le téléphone.
 *
 * Elle porte aussi la photo de profil quand il y en a une : c'est le même rôle —
 * « qui est ce joueur » — et deux composants pour un rôle finissent toujours par
 * diverger d'un pixel.
 */

export interface AvatarProps {
  /** L'émoji choisi par le joueur. */
  emoji: string;
  /** Sa photo, si elle existe : elle passe devant l'émoji. */
  photo?: string | null;
  /** Diamètre de la pastille, en pixels. */
  size?: number;
  /** Fond de la pastille. Transparent quand la ligne en porte déjà un. */
  tone?: 'solid' | 'bare';
  className?: string;
}

export function Avatar({ emoji, photo, size = 24, tone = 'solid', className }: AvatarProps) {
  return (
    <span
      /*
       * Décoratif, toujours.
       *
       * Un avatar n'apparaît jamais seul : le pseudo est à côté, dans le même
       * groupe. Annoncer « renard » avant « Camille » n'apprend rien à qui
       * écoute et double la longueur de chaque ligne d'une feuille de score.
       */
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full leading-none ${
        tone === 'solid' ? 'bg-storm-700' : ''
      } ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
    >
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : emoji}
    </span>
  );
}
