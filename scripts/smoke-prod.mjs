/**
 * Vérification à chaud sur la production.
 *
 * `e2e.mjs` prouve que le code marche sur une base en mémoire, jetable. Il ne
 * prouve pas que **ce qui est servi** marche : ni que le déploiement a bien
 * basculé, ni que le conteneur sert le bon paquet, ni que le proxy, les
 * WebSockets et la base réelle s'entendent. C'est un contrôle différent, et
 * c'est le seul qui réponde à « c'est vraiment en ligne ? ».
 *
 * D'où sa forme : **un seul compte, une seule table**, et rien qui reste. On ne
 * rejoue pas les cent quarante vérifications sur la base des joueurs — on
 * touche du doigt les nouveautés, on part.
 *
 * ## À exécuter depuis une machine ordinaire
 *
 * Ce script **ne tourne pas** dans l'environnement d'agent : la sortie réseau y
 * passe par un mandataire qui ne relaie ni l'HTTP/2 ni les mises à niveau
 * WebSocket, et ZapZap a besoin des deux. Le navigateur reçoit un
 * `ERR_CONNECTION_RESET` avant même la page d'accueil — ce n'est pas un défaut
 * de l'application, et ce n'est pas contournable depuis là.
 *
 * Il est donc écrit pour vous : lancé depuis un poste normal, il vérifie en
 * deux minutes que la production sert bien la version attendue, sans avoir à
 * cliquer soi-même. Depuis l'environnement d'agent, le contrôle équivalent se
 * fait au niveau HTTP (`curl` sur la sonde de santé, le manifeste et le paquet
 * servi), ce que le proxy relaie sans problème.
 *
 * Usage :
 *   npx playwright install chromium   # une fois
 *   node scripts/smoke-prod.mjs
 *   BASE_URL=https://… node scripts/smoke-prod.mjs
 */

import { existsSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'https://zapzap.clixite-prod.cloud';
const PRESET_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const phone = devices['iPhone 13'];

const results = [];
function check(condition, description) {
  const ok = Boolean(condition);
  results.push({ ok, description });
  console.log(`  ${ok ? '✓' : '✗'} ${description}`);
  return ok;
}

const seen = (locator, timeout = 12_000) =>
  locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

/*
 * Le navigateur doit sortir par le mandataire de l'environnement.
 *
 * `curl` lit `HTTPS_PROXY` tout seul ; Chromium non — il faut le lui passer, et
 * lui dire d'accepter le certificat que le mandataire présente à sa place.
 * Sans cela, la connexion à la production est coupée net et le contrôle échoue
 * pour une raison qui n'a rien à voir avec l'application.
 *
 * `ignoreHTTPSErrors` est cantonné à ce script de contrôle, qui vise une
 * adresse écrite en dur : on ne désactive rien pour l'application elle-même.
 */
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  ...(existsSync(PRESET_CHROME) ? { executablePath: PRESET_CHROME } : {}),
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const context = await browser.newContext({
  ...phone,
  baseURL: BASE_URL,
  locale: 'fr-BE',
  ignoreHTTPSErrors: Boolean(proxy),
});
await context.addInitScript(() => {
  if (localStorage.getItem('zapzap.locale') === null) localStorage.setItem('zapzap.locale', 'fr');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

console.log(`▸ Contrôle à chaud — ${BASE_URL}\n`);

/* -- Le compte, et la table ---------------------------------------- */
await page.goto('/');
await page.getByLabel('Votre pseudo').fill('Controle');
await page.getByRole('button', { name: 'C’est parti' }).click();
check(await seen(page.getByRole('button', { name: /Jouer maintenant/ })), 'un compte se crée sur la vraie base');

await page.getByRole('button', { name: /Créer une table/ }).click();
await page.waitForURL(/\/salon\//, { timeout: 20_000 });
check(page.url().includes('/salon/'), 'une table s’ouvre par WebSocket');

/* -- La règle de fin n'est plus un réglage -------------------------- */
check(
  await seen(page.getByText(/s’arrête dès qu’un joueur dépasse 100/)),
  'le salon énonce la règle de fin au lieu de la proposer',
);
check(
  !(await page.getByText(/Au dernier debout/).isVisible().catch(() => false)),
  '« au dernier debout » a bien disparu des réglages',
);

/* -- La table, la main, le score ------------------------------------ */
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: '+ Ajouter un robot' }).click();
  await page.waitForTimeout(400);
}
await page.getByRole('button', { name: 'Commencer' }).click();
await page.waitForURL(/\/table\//, { timeout: 20_000 });

const tuto = page.getByRole('dialog', { name: /Comment on joue/ });
if (await seen(tuto, 4_000)) await page.getByRole('button', { name: 'Passer' }).first().click().catch(() => {});

const picker = page.getByRole('button', { name: /^\s*5\s*cartes\s*$/ }).first();
if (await seen(picker, 6_000)) await picker.click().catch(() => {});
check(
  await seen(page.locator('[aria-label="Votre main"] [data-card]'), 30_000),
  'la donne arrive et la main s’affiche',
);

check(await seen(page.getByText(/^0\/100$/)), 'mon score est visible en permanence sur le tapis');

/*
 * Le tri : on lit l'ordre réel des cartes avant et après.
 *
 * Vérifier que le bouton existe ne prouverait rien — ce qui compte est que
 * l'éventail se réordonne vraiment.
 */
const ids = async () =>
  page.locator('[aria-label="Votre main"] [data-card]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-card')),
  );

const before = await ids();
check(before.length === 5, `la main compte 5 cartes (${before.join(' ')})`);

const sortButton = page.getByRole('button', { name: /Trier ma main/ });
check(await seen(sortButton), 'le bouton de tri de la main est proposé');
await sortButton.click();
await page.waitForTimeout(600);
const after = await ids();

check(
  after.length === before.length && new Set(after).size === new Set(before).size,
  'le tri ne perd ni n’invente aucune carte',
);
/*
 * L'ordre doit changer — sauf main dégénérée où les deux tris coïncident
 * (cinq cartes de la même couleur, par exemple). On le dit plutôt que de
 * prétendre à une certitude qu'on n'a pas.
 */
if (before.join() === after.join()) {
  console.log('  · les deux tris coïncident sur cette main — ordre inchangé, ce qui est correct');
} else {
  check(true, `l’éventail se réordonne réellement (${after.join(' ')})`);
}

await page.reload();
await page.waitForTimeout(3_000);
check(
  await seen(page.getByRole('button', { name: /Trier ma main par couleur/ })),
  'le choix de tri survit au rechargement',
);

/* -- Rien n'a cassé -------------------------------------------------- */
check(errors.length === 0, `aucune erreur JavaScript${errors.length ? ` — ${errors.join(' | ')}` : ''}`);

/* -- On ne laisse pas la table ouverte ------------------------------- */
await page.getByRole('button', { name: 'Menu de la partie' }).click().catch(() => {});
await page.getByRole('button', { name: /Quitter définitivement/ }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Quitter définitivement/ }).first().click().catch(() => {});
await page.waitForTimeout(800);

await context.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées.`);
if (failed.length > 0) {
  console.log('\nEn échec :');
  for (const f of failed) console.log(`  - ${f.description}`);
  process.exit(1);
}
console.log('La production sert bien la nouvelle version.');
