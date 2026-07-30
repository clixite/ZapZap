/**
 * Photo de profil : réduite sur l'appareil, jamais envoyée en pleine taille.
 *
 * La photo repart dans chaque vue de partie diffusée à toute la table — elle
 * doit peser quelques kilo-octets, pas quelques mégaoctets. On la recadre en
 * carré, on la réduit à 96 px et on l'encode en JPEG avant qu'elle ne quitte
 * le téléphone.
 */
const SIZE = 96;
const QUALITY = 0.8;

export async function toAvatarPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');

    // Recadrage carré centré : on coupe le bord long, pas le visage.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}
