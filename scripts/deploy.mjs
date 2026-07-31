/**
 * Pousser la dernière version en production.
 *
 * Le VPS n'est pas joignable en SSH depuis partout, mais l'API Hostinger pilote
 * son gestionnaire Docker. Un projet compose à usage unique — « zapzap-deployer »
 * — y est installé : relancé, il tire la branche, reconstruit l'image, relance
 * le service, puis s'éteint. Ce script presse ce bouton et attend le résultat.
 *
 * Le déploiement prend l'état de la branche **telle qu'elle est sur GitHub** :
 * pousser d'abord, déployer ensuite.
 *
 * Usage :
 *   HOSTINGER_API_TOKEN=… node scripts/deploy.mjs
 *   HOSTINGER_API_TOKEN=… node scripts/deploy.mjs --no-wait
 */

const TOKEN = process.env.HOSTINGER_API_TOKEN;
const VPS_ID = process.env.HOSTINGER_VPS_ID ?? '1352234';
const PROJECT = process.env.DEPLOYER_PROJECT ?? 'zapzap-deployer';
const SITE = process.env.PUBLIC_URL ?? 'https://zapzap.clixite-prod.cloud';
const API = `https://developers.hostinger.com/api/vps/v1/virtual-machines/${VPS_ID}`;
const WAIT = !process.argv.includes('--no-wait');
/** Construction complète depuis un cache froid : compter large. */
const TIMEOUT_MS = 12 * 60_000;

if (!TOKEN) {
  console.error('HOSTINGER_API_TOKEN manquant.\n  HOSTINGER_API_TOKEN=… node scripts/deploy.mjs');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function deployerLog() {
  const services = await api(`/docker/${PROJECT}/logs`);
  return services.flatMap((s) => (s.entries ?? []).map((e) => e.line));
}

/**
 * La version réellement servie.
 *
 * C'est le seul repère fiable de fin de déploiement. Le journal du déployeur ne
 * convient pas : l'API n'en renvoie qu'une fenêtre, si bien que le marqueur de
 * fin du déploiement précédent y traîne au départ puis en sort — impossible d'y
 * distinguer « fini » de « pas encore commencé ». L'estampille, elle, est
 * calculée à la compilation du client : elle ne change que si une nouvelle
 * image est construite ET servie.
 */
async function servedVersion() {
  try {
    const html = await fetch(SITE, { cache: 'no-store' }).then((r) => r.text());
    const asset = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
    if (!asset) return null;
    const js = await fetch(`${SITE}/${asset}`).then((r) => r.text());
    return js.match(/\d+\.\d+\.\d+ · \d{2}\/\d{2} \d{2}:\d{2}/)?.[0] ?? asset;
  } catch {
    return null; // conteneur en cours de remplacement
  }
}

const before = await servedVersion();
console.log(`▸ Déploiement sur ${SITE}`);
console.log(`  Version en place : ${before ?? 'inconnue'}`);

await api(`/docker/${PROJECT}/restart`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
console.log('  Déployeur relancé.');

if (!WAIT) {
  console.log('  (--no-wait : on ne suit pas la suite.)');
  process.exit(0);
}

console.log('▸ Construction, puis bascule du conteneur…');
const started = Date.now();
let now = before;

while (Date.now() - started < TIMEOUT_MS) {
  await sleep(15_000);
  now = await servedVersion();
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (now && now !== before) break;
  process.stdout.write(`  ${elapsed}s — ${now === null ? 'bascule en cours' : 'toujours l’ancienne version'}\n`);
}

if (!now || now === before) {
  console.error(`✗ La version servie n’a pas changé après ${Math.round(TIMEOUT_MS / 60_000)} min. Journal :`);
  for (const line of (await deployerLog().catch(() => [])).slice(-12)) console.error(`    ${line}`);
  process.exit(1);
}

const health = await fetch(`${SITE}/api/health`)
  .then((r) => r.json())
  .catch(() => null);
if (!health?.ok) {
  console.error('✗ La nouvelle version est servie mais /api/health ne répond pas.');
  process.exit(1);
}

console.log(`✓ En ligne — ${SITE} (${now})`);
