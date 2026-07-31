/**
 * Génère les icônes de l'application.
 *
 * On les dessine plutôt que de les stocker en binaire : l'icône suit alors la
 * palette du design system, et un changement de teinte ne laisse pas derrière
 * lui une icône d'une version précédente que personne ne pense à régénérer.
 *
 * Rendu dans un vrai navigateur, comme les captures : c'est la seule façon
 * d'obtenir exactement ce que verront les appareils.
 *
 * Usage : node scripts/icons.mjs
 */

import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Chromium préinstallé.
 *
 * Certains environnements fournissent le navigateur à un emplacement fixe sans
 * que la version corresponde à celle que Playwright irait chercher. On l'utilise
 * s'il est là, plutôt que de télécharger 150 Mo à chaque génération d'icône.
 */
const PRESET_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(PRESET_CHROME) ? { executablePath: PRESET_CHROME } : {};

const OUT = new URL('../client/public/icons/', import.meta.url);
/*
 * L'icône de soumission ne part pas avec le site.
 *
 * Le 1024 sans transparence est demandé par l'App Store, une fois, au dépôt.
 * Rangé dans `client/public`, il était copié dans le paquet déployé et servi
 * publiquement — 352 Ko sur le disque de production, dans l'image Docker et
 * dans chaque sauvegarde, pour un fichier qu'aucun navigateur ne demande
 * jamais. Sa place est dans le dossier du magasin.
 */
const STORE_OUT = new URL('../store/', import.meta.url);

const STORM_950 = '#110c2e';
const STORM_800 = '#2a2069';
const VOLT_400 = '#3fd9f5';
const FLASH_400 = '#ffd34d';

/**
 * L'éclair.
 *
 * `maskable` demande que tout le sujet tienne dans le cercle de sûreté, soit
 * 80 % du côté : Android recadre l'icône selon la forme du lanceur, et un
 * éclair pleine page se ferait rogner la pointe.
 */
function markup(size, { maskable = false, transparent = false } = {}) {
  const scale = maskable ? 0.56 : 0.7;
  const radius = maskable ? size / 2 : size * 0.22;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:${transparent ? 'transparent' : STORM_950};}
  .plate{width:${size}px;height:${size}px;display:grid;place-items:center;
    border-radius:${radius}px;
    background:radial-gradient(circle at 50% 32%, ${STORM_800} 0%, ${STORM_950} 72%);}
</style></head>
<body><div class="plate">
  <svg width="${size * scale}" height="${size * scale}" viewBox="0 0 24 24" fill="none">
    <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${VOLT_400}"/><stop offset="100%" stop-color="${FLASH_400}"/>
    </linearGradient></defs>
    <path d="M13.6 1.5 4.2 13.4a.6.6 0 0 0 .47.98h5.1l-1.4 8.1a.6.6 0 0 0 1.07.46l9.4-11.9a.6.6 0 0 0-.47-.98h-5.1l1.4-8.1a.6.6 0 0 0-1.07-.46Z"
      fill="url(#b)"/>
  </svg>
</div></body></html>`;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE_OUT, { recursive: true });

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Android recadre selon la forme du lanceur et choisit la taille la plus
  // proche : sans le 192 maskable, il rétrécissait la 512 jusqu'à 48 px.
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  /*
   * iOS arrondit lui-même, et il faut le laisser faire.
   *
   * L'icône d'écran d'accueil était générée avec ses propres coins arrondis,
   * puis iOS lui appliquait son masque en « squircle » par-dessus : les coins
   * étaient rognés deux fois, ce qui laissait apparaître quatre encoches
   * sombres au bord de l'icône. Le carré plein est ce qu'Apple demande.
   */
  { file: 'apple-touch-icon.png', size: 180, square: true },
  // L'App Store exige 1024 sans transparence ni coins arrondis : il applique
  // son propre masque, et une icône déjà arrondie ressortirait doublement.
  { file: 'icon-1024.png', size: 1024, square: true, store: true },
];

for (const { file, size, maskable, square, store } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(markup(size, { maskable }));
  if (square) {
    await page.addStyleTag({ content: '.plate{border-radius:0 !important}' });
  }
  await page.screenshot({ path: new URL(file, store ? STORE_OUT : OUT).pathname, omitBackground: false });
  console.log(`${file} — ${size}×${size}`);
}

await browser.close();
