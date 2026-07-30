import type { GameView } from '@zapzap/shared';

/**
 * La carte de fin de partie, à partager.
 *
 * Un carré de 1080 px dessiné au canvas — le format des messageries et des
 * réseaux — avec le classement complet. C'est le seul endroit où le jeu sort
 * de l'application : la carte porte donc l'identité entière (tapis d'orage,
 * halo, éclair) et l'adresse du site, pour que l'image donne envie et le moyen
 * de venir jouer.
 */

const SIZE = 1080;

const STORM_950 = '#110c2e';
const STORM_800 = '#2a2069';
const STORM_700 = '#392c8a';
const VOLT_300 = '#8aecff';
const FLASH_400 = '#ffd34d';
const PAPER_50 = '#fbfcff';
const PAPER_300 = '#cbd2e2';

/** Couleur de pastille stable par joueur : le même id donne toujours la même. */
function pastille(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 45%)`;
}

export function drawShareCard(view: GameView): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Le tapis : fond profond, halo central — la signature visuelle du jeu.
  ctx.fillStyle = STORM_950;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const halo = ctx.createRadialGradient(SIZE / 2, SIZE * 0.3, 60, SIZE / 2, SIZE * 0.3, SIZE * 0.75);
  halo.addColorStop(0, STORM_700);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // L'éclair en filigrane.
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.translate(SIZE * 0.78, SIZE * 0.16);
  ctx.scale(11, 11);
  ctx.fillStyle = VOLT_300;
  ctx.beginPath();
  ctx.moveTo(13.6, 1.5);
  ctx.lineTo(4.2, 13.4);
  ctx.lineTo(9.7, 13.9);
  ctx.lineTo(8.3, 22);
  ctx.lineTo(17.7, 10.1);
  ctx.lineTo(12.2, 9.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Titre.
  ctx.fillStyle = PAPER_50;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ZapZap ⚡', SIZE / 2, 150);
  ctx.fillStyle = PAPER_300;
  ctx.font = '40px system-ui, sans-serif';
  ctx.fillText(`Partie terminée — ${view.roundIndex + 1} manche${view.roundIndex > 0 ? 's' : ''}`, SIZE / 2, 215);

  // Classement : rang final d'abord, éliminés grisés.
  const standings = [...view.players].sort(
    (a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99) || a.totalScore - b.totalScore,
  );
  const rowH = Math.min(96, 640 / standings.length);
  const top = 300;

  standings.forEach((player, i) => {
    const y = top + i * (rowH + 14);
    const isWinner = player.finishRank === 1;

    ctx.fillStyle = isWinner ? 'rgba(255, 211, 77, 0.16)' : STORM_800;
    ctx.beginPath();
    ctx.roundRect(90, y, SIZE - 180, rowH, 22);
    ctx.fill();

    // Pastille avatar.
    ctx.fillStyle = pastille(player.id);
    ctx.beginPath();
    ctx.arc(160, y + rowH / 2, rowH * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(rowH * 0.4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(player.avatar, 160, y + rowH / 2 + rowH * 0.14);

    // Rang + pseudo.
    ctx.textAlign = 'left';
    ctx.fillStyle = isWinner ? FLASH_400 : player.eliminated ? PAPER_300 : PAPER_50;
    ctx.font = `bold ${Math.round(rowH * 0.4)}px system-ui, sans-serif`;
    const name = player.pseudo.length > 14 ? `${player.pseudo.slice(0, 13)}…` : player.pseudo;
    ctx.fillText(`${isWinner ? '🏆' : `${player.finishRank ?? i + 1}.`} ${name}`, 225, y + rowH * 0.62);

    // Score.
    ctx.textAlign = 'right';
    ctx.fillStyle = PAPER_300;
    ctx.font = `${Math.round(rowH * 0.34)}px system-ui, sans-serif`;
    ctx.fillText(`${player.totalScore} pt${player.eliminated ? ' · éliminé' : ''}`, SIZE - 120, y + rowH * 0.62);
  });

  // Pied : l'adresse — l'image doit donner le moyen de venir jouer.
  ctx.textAlign = 'center';
  ctx.fillStyle = VOLT_300;
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.fillText(location.host, SIZE / 2, SIZE - 70);

  return canvas;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Partage la carte : image native si possible, sinon téléchargement. */
export async function shareResult(view: GameView): Promise<ShareOutcome> {
  const canvas = drawShareCard(view);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const text = `On vient de finir une partie de ZapZap ⚡ ${location.origin}`;

  if (blob) {
    const file = new File([blob], 'zapzap.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return 'shared';
      } catch {
        return 'cancelled'; // le joueur a refermé la feuille de partage
      }
    }
    // Pas de partage de fichiers (ordinateur de bureau) : on télécharge.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zapzap.png';
    a.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  }

  if (navigator.share) {
    await navigator.share({ text }).catch(() => {});
    return 'shared';
  }
  return 'cancelled';
}
