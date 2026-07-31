/**
 * Pousser la dernière version en production.
 *
 * Le VPS n'est pas joignable en SSH depuis partout, mais l'API Hostinger pilote
 * son gestionnaire Docker. Un projet compose à usage unique — « zapzap-deployer »
 * — y est installé : relancé, il tire la branche, reconstruit l'image, relance
 * le service, puis s'éteint. Ce script ne fait que presser ce bouton et
 * attendre le résultat.
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

if (!TOKEN) {
  console.error('HOSTINGER_API_TOKEN manquant.\n  HOSTINGER_API_TOKEN=… node scripts/deploy.mjs');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Les dernières lignes du journal du déployeur. */
async function deployerLog() {
  const services = await api(`/docker/${PROJECT}/logs`);
  return services.flatMap((s) => (s.entries ?? []).map((e) => e.line));
}

const MARKER = 'ZAPZAP_DEPLOY_OK';
const countMarkers = (lines) => lines.filter((l) => l.includes(MARKER)).length;

console.log(`▸ Déploiement de la branche distante sur ${SITE}`);

/*
 * Le journal du conteneur survit à son redémarrage : chercher le marqueur de
 * fin sans autre précaution le trouve immédiatement — celui du déploiement
 * précédent. On compte donc les marqueurs AVANT, et on attend qu'il y en ait un
 * de plus. Sans ce repère, le script annonçait la mise en ligne pendant que
 * l'image se construisait encore, et rapportait l'ancienne version.
 */
const markersBefore = countMarkers(await deployerLog().catch(() => []));

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

console.log('▸ Construction en cours…');
const started = Date.now();
let done = false;

// La construction prend une à deux minutes : on sonde le journal jusqu'à voir
// un marqueur de plus qu'au départ, plutôt que de deviner un délai.
for (let i = 0; i < 40 && !done; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  const lines = await deployerLog().catch(() => []);
  done = countMarkers(lines) > markersBefore;
  const last = lines.at(-1) ?? '';
  process.stdout.write(`  ${Math.round((Date.now() - started) / 1000)}s — ${last.slice(0, 90)}\n`);
}

if (!done) {
  console.error('✗ Le marqueur de fin n’est pas apparu. Journal :');
  for (const line of (await deployerLog()).slice(-15)) console.error(`    ${line}`);
  process.exit(1);
}

console.log('▸ Vérification');

// Le conteneur se remplace juste après le marqueur : le site est brièvement
// injoignable. On patiente plutôt que de conclure sur cette fenêtre.
let health = null;
for (let i = 0; i < 20 && !health?.ok; i++) {
  await new Promise((r) => setTimeout(r, 3_000));
  health = await fetch(`${SITE}/api/health`)
    .then((r) => r.json())
    .catch(() => null);
}
if (!health?.ok) {
  console.error('✗ /api/health ne répond pas correctement.');
  process.exit(1);
}

// La version est estampillée dans le bundle client au moment de la compilation :
// c'est la seule preuve que la nouvelle image est bien celle qui est servie.
const html = await fetch(SITE).then((r) => r.text());
const asset = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
const stamp = asset
  ? (await fetch(`${SITE}/${asset}`).then((r) => r.text())).match(/\d+\.\d+\.\d+ · \d{2}\/\d{2} \d{2}:\d{2}/)?.[0]
  : null;

console.log(`✓ En ligne — ${SITE}${stamp ? ` (version ${stamp})` : ''}`);
