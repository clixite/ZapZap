/**
 * Une capture de chaque écran, sur plusieurs formats.
 *
 * Un défaut visuel ne se voit pas dans une suite de tests. La géométrie du
 * tapis a tourné pendant des semaines sur sa taille par défaut, avec les tas
 * qui débordaient de quatre-vingts pixels, sans qu'aucune des cent quarante
 * vérifications ne bronche : elles regardaient les rôles, les libellés et les
 * cibles tactiles — jamais l'image.
 *
 * Ce script ne vérifie rien. Il **montre**. C'est l'outil qu'il faut avant de
 * juger un écran, et après l'avoir corrigé.
 *
 * Trois formats, choisis pour ce qu'ils révèlent :
 *  - 375×667, l'iPhone SE : le plus petit encore vendu, celui où tout casse ;
 *  - 393×852, le format courant des téléphones de 2024-2026 ;
 *  - 430×932, un grand écran, où l'on vérifie que rien ne se dilue.
 *
 * Usage :
 *   BASE_URL=http://localhost:3111 SHOTS_DIR=/tmp/ecrans node scripts/screens.mjs
 */

import { existsSync, mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3111';
const SHOTS_DIR = process.env.SHOTS_DIR ?? '/tmp/ecrans';
const PRESET_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const FORMATS = [
  { name: 'se', width: 375, height: 667 },
  { name: 'std', width: 393, height: 852 },
  { name: 'max', width: 430, height: 932 },
];

mkdirSync(SHOTS_DIR, { recursive: true });
const browser = await chromium.launch(existsSync(PRESET_CHROME) ? { executablePath: PRESET_CHROME } : {});

async function shoot(page, format, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS_DIR}/${name}-${format.name}.png` });
  console.log(`  ${name}-${format.name}.png`);
}

for (const format of FORMATS) {
  console.log(`▸ ${format.name} — ${format.width}×${format.height}`);
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: format.width, height: format.height },
    baseURL: BASE_URL,
    locale: 'fr-BE',
  });
  await context.addInitScript(() => {
    if (localStorage.getItem('zapzap.locale') === null) localStorage.setItem('zapzap.locale', 'fr');
  });
  const page = await context.newPage();

  /* -- L'entrée : le seul écran qu'un nouveau joueur voit ------------- */
  await page.goto('/');
  await shoot(page, format, '01-entree');

  await page.getByLabel('Votre pseudo').fill('Camille');
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await page.getByRole('button', { name: /Jouer maintenant/ }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2_800); // la suggestion d'installation apparaît après 2,5 s
  await shoot(page, format, '02-accueil');

  /* -- Les écrans annexes -------------------------------------------- */
  await page.goto('/regles');
  await shoot(page, format, '03-regles');
  await page.goto('/profil');
  await shoot(page, format, '04-profil');
  await page.goto('/historique');
  await shoot(page, format, '05-historique');

  /* -- Le salon ------------------------------------------------------- */
  await page.goto('/');
  await page.getByRole('button', { name: /Créer une table/ }).click();
  await page.waitForURL(/\/salon\//, { timeout: 20_000 });
  await shoot(page, format, '06-salon');

  /* -- La table ------------------------------------------------------- */
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '+ Ajouter un robot' }).click();
    await page.waitForTimeout(300);
  }
  await shoot(page, format, '07-salon-plein');

  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.waitForURL(/\/table\//, { timeout: 20_000 });

  const tuto = page.getByRole('dialog', { name: /Comment on joue/ });
  if (await tuto.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await shoot(page, format, '08-tutoriel');
    await page.getByRole('button', { name: 'Passer' }).first().click().catch(() => {});
  }

  const picker = page.getByRole('button', { name: /^\s*[3-7]\s*cartes\s*$/ }).first();
  if (await picker.isVisible({ timeout: 6_000 }).catch(() => false)) {
    await shoot(page, format, '09-donne');
    await picker.click().catch(() => {});
  }

  await page
    .locator('[aria-label="Votre main"] [data-card]')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(1_500);
  await shoot(page, format, '10-table');

  // Une carte sélectionnée : l'état le plus dense de l'écran.
  await page.locator('[aria-label="Votre main"] [data-card]').first().click().catch(() => {});
  await shoot(page, format, '11-table-selection');

  // Le panneau de comptage, et le menu.
  await page.getByLabel('Voir les cartes déjà passées').click().catch(() => {});
  await shoot(page, format, '12-comptage');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Menu de la partie' }).click().catch(() => {});
  await shoot(page, format, '13-menu');
  await page.keyboard.press('Escape').catch(() => {});

  await context.close();
}

await browser.close();
console.log(`\nCaptures dans ${SHOTS_DIR}`);
