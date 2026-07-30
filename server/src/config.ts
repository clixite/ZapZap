/**
 * Configuration du serveur, lue une fois au démarrage.
 *
 * Tout est optionnel sauf en production : le jeu doit pouvoir démarrer d'un
 * `npm run dev:server` sans fichier `.env`, sinon la première prise en main
 * bute sur de la configuration au lieu du jeu.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} doit être un nombre, reçu « ${raw} »`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secret de signature des jetons.
 *
 * En développement on en fabrique un : personne ne veut générer une clé pour
 * lancer le serveur en local. En production on refuse de démarrer sans, parce
 * qu'un secret par défaut laisserait n'importe qui se forger une identité.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction) throw new Error('JWT_SECRET est obligatoire en production');
  return 'zapzap-dev-secret-non-securise';
}

export const config = {
  port: num('PORT', 3000),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${num('PORT', 3000)}`,
  jwtSecret: jwtSecret(),
  dbPath: process.env.DB_PATH ?? './data/zapzap.db',
  isProduction,

  /**
   * Délai avant qu'un robot ne joue.
   *
   * Un robot qui joue instantanément donne l'impression d'un bug plutôt que
   * d'un joueur. Le délai n'est pas de la décoration : il rend la table
   * lisible, on voit ce qui se passe.
   */
  botDelayMs: num('BOT_DELAY_MS', 800),

  /**
   * Temps laissé à un joueur avant que son tour ne se joue tout seul.
   *
   * En temps réel seulement : en asynchrone, personne n'est jamais joué à sa
   * place, c'est le principe même du mode.
   */
  turnTimeoutMs: num('TURN_TIMEOUT_MS', 45_000),

  /** Délai de grâce avant de considérer qu'un joueur déconnecté a quitté. */
  disconnectGraceMs: num('DISCONNECT_GRACE_MS', 60_000),

  /** Au-delà, une table sans personne est fermée et oubliée. */
  roomIdleMs: num('ROOM_IDLE_MS', 30 * 60_000),

  /**
   * Une partie asynchrone n'est pas abandonnée parce qu'elle est vide : c'est
   * son état normal. On lui laisse plusieurs jours.
   */
  asyncRoomIdleMs: num('ASYNC_ROOM_IDLE_MS', 7 * 24 * 60 * 60_000),
} as const;
