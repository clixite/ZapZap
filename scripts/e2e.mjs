/**
 * Une vraie partie, dans un vrai navigateur.
 *
 * Les tests unitaires prouvent que le moteur applique les règles ; les tests
 * d'intégration, que le serveur ne dit à personne ce qu'il ne doit pas dire.
 * Il reste à vérifier ce qu'aucun des deux ne voit : qu'un joueur peut
 * réellement cliquer sa partie du début à la fin.
 *
 * Usage :
 *   BASE_URL=http://localhost:3111 node scripts/e2e.mjs
 *   SHOTS_DIR=/tmp/shots node scripts/e2e.mjs    # + captures d'écran
 */

import { existsSync, mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3111';
const SHOTS_DIR = process.env.SHOTS_DIR ?? '';
const PRESET_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const phone = devices['iPhone 13'];
let shot = 0;
const failures = [];

function check(condition, description) {
  if (condition) {
    console.log(`  ✓ ${description}`);
  } else {
    console.error(`  ✗ ${description}`);
    failures.push(description);
  }
}

async function capture(page, name) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  const file = `${SHOTS_DIR}/${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`    → ${file}`);
}

/** Aucune barre de défilement horizontale : le débordement est le défaut n°1 sur mobile. */
async function checkNoHorizontalOverflow(page, where) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 1, `${where} : rien ne déborde en largeur (${overflow}px)`);
}

/** Toutes les cibles tactiles font au moins 44 px : recommandation Apple, et bon sens. */
async function checkTapTargets(page, where) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button:not([disabled]), a[role="button"]')]
      .map((el) => ({ text: el.textContent?.trim().slice(0, 24) ?? '', box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44))
      .map(({ text, box }) => `${text} (${Math.round(box.width)}×${Math.round(box.height)})`),
  );
  check(small.length === 0, `${where} : cibles tactiles ≥ 44 px${small.length ? ` — ${small.join(', ')}` : ''}`);
}

const browser = await chromium.launch(existsSync(PRESET_CHROME) ? { executablePath: PRESET_CHROME } : {});
const context = await browser.newContext({ ...phone, baseURL: BASE_URL });
const page = await context.newPage();

page.on('pageerror', (error) => {
  console.error(`  ✗ erreur JavaScript : ${error.message}`);
  failures.push(`erreur JavaScript : ${error.message}`);
});

try {
  console.log('Compte invité');
  await page.goto('/');
  await page.getByLabel('Votre pseudo').fill('Nico');
  await capture(page, 'accueil-inscription');
  await page.getByRole('button', { name: 'C’est parti' }).click();
  await page.getByRole('button', { name: /Partie rapide/ }).waitFor({ timeout: 10_000 });
  check(true, 'le compte est créé et l’accueil s’affiche');
  await checkNoHorizontalOverflow(page, 'Accueil');
  await checkTapTargets(page, 'Accueil');
  await capture(page, 'accueil');

  console.log('\nSalon');
  await page.getByRole('button', { name: /Créer une partie/ }).click();
  await page.waitForURL(/\/salon\//, { timeout: 10_000 });
  const code = new URL(page.url()).pathname.split('/').pop();
  check(/^[A-Z]{4}$/.test(code ?? ''), `code de partie à 4 lettres (${code})`);

  await page.getByRole('button', { name: '+ Ajouter un robot' }).click();
  await page.getByRole('button', { name: '+ Ajouter un robot' }).click();
  await page.waitForTimeout(400);
  const players = await page.locator('text=/robot|Volt|Flash|Spark/i').count();
  check(players > 0, 'les robots ont rejoint la table');
  await checkNoHorizontalOverflow(page, 'Salon');
  await checkTapTargets(page, 'Salon');
  await capture(page, 'salon');

  console.log('\nRéglages');
  await page.getByRole('radio', { name: '7 points' }).click();
  await page.waitForTimeout(200);
  check(
    (await page.getByRole('radio', { name: '7 points' }).getAttribute('aria-checked')) === 'true',
    'le seuil d’annonce se règle',
  );
  await page.getByRole('radio', { name: '5 points' }).click();

  console.log('\nDémarrage et donne');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.waitForURL(/\/table\//, { timeout: 10_000 });

  // Le donneur est tiré au sort : soit c'est nous et il faut choisir, soit un
  // robot le fait et la manche démarre toute seule.
  const dealPicker = page.getByRole('button', { name: /^5cartes$|^5\s*cartes$/ }).first();
  const iDeal = await dealPicker.isVisible().catch(() => false);
  if (iDeal) {
    check(true, 'le choix de la taille des mains nous est proposé');
    await capture(page, 'donne');
    await dealPicker.click();
  } else {
    check(true, 'un robot donne, la manche démarre seule');
  }

  // On attend les cartes elles-mêmes : le panneau de main existe dès la phase
  // de donne, il est simplement vide.
  await page
    .locator('[role="group"][aria-label="Votre main"] button')
    .first()
    .waitFor({ timeout: 20_000 });
  const handCards = await page.locator('[role="group"][aria-label="Votre main"] button').count();
  check(handCards >= 3 && handCards <= 7, `la main compte ${handCards} cartes (3 à 7 attendues)`);
  await checkNoHorizontalOverflow(page, 'Table');
  await capture(page, 'table');

  console.log('\nUn tour complet');
  // On attend notre tour : les robots jouent vite, mais pas instantanément.
  await page.getByText('À vous — défaussez').waitFor({ timeout: 30_000 });
  check(true, 'notre tour arrive');

  const handBefore = await page.locator('[role="group"][aria-label="Votre main"] button').count();
  await page.locator('[role="group"][aria-label="Votre main"] button').first().click();
  await capture(page, 'selection');

  const discardBtn = page.getByRole('button', { name: 'Défausser' });
  check(await discardBtn.isEnabled(), 'le bouton Défausser s’active une fois une carte choisie');
  await discardBtn.click();

  await page.getByText('Maintenant, piochez').waitFor({ timeout: 10_000 });
  check(true, 'la défausse passe bien à l’étape « piocher »');
  await capture(page, 'pioche');

  await page.getByLabel(/Piocher à l’aveugle/).click();
  await page.waitForTimeout(600);
  const handAfter = await page.locator('[role="group"][aria-label="Votre main"] button').count();
  check(handAfter === handBefore, `la main reste à ${handBefore} cartes : on repioche toujours`);

  console.log('\nLes règles');
  const rules = await context.newPage();
  await rules.goto('/regles');
  await rules.getByRole('heading', { name: 'Comment on joue' }).waitFor({ timeout: 10_000 });
  await checkNoHorizontalOverflow(rules, 'Règles');
  await capture(rules, 'regles');
  check(
    await rules.getByText(/L’égalité profite toujours au contre-attaquant/).isVisible(),
    'les règles expliquent le point le plus subtil du jeu',
  );
  await rules.close();

  console.log('\nManifeste PWA');
  const manifest = await context.request.get('/manifest.webmanifest');
  const body = await manifest.json();
  check(manifest.ok(), 'le manifeste est servi');
  check(body.name?.includes('ZapZap'), 'le manifeste porte le bon nom');
  check(body.theme_color === '#1c1547', 'la couleur de thème est celle du design system');
  for (const icon of body.icons ?? []) {
    const res = await context.request.get(icon.src);
    check(res.ok(), `icône ${icon.sizes} présente`);
  }
} finally {
  await browser.close();
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} vérification(s) en échec :`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Tout est passé.');
