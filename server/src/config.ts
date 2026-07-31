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
 * Chaîne optionnelle : la variable vide compte comme absente.
 *
 * Un `env_file` Docker transmet volontiers `RESEND_API_KEY=` — présente et
 * vide — et « une clé vide » n'est jamais ce qu'on veut dire.
 */
function str(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? undefined : raw;
}

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
   * Adresse de contact déclarée aux services de notification.
   *
   * La spécification VAPID l'exige : c'est à elle qu'un opérateur de push écrit
   * si notre serveur se met à mal se comporter. Elle n'est jamais montrée aux
   * joueurs.
   */
  contactEmail: process.env.CONTACT_EMAIL ?? 'support@clixite.be',

  /**
   * Délai avant qu'un robot ne joue.
   *
   * Un robot qui joue instantanément donne l'impression d'un bug plutôt que
   * d'un joueur. Le délai n'est pas de la décoration : il rend la table
   * lisible, on voit ce qui se passe.
   */
  botDelayMs: num('BOT_DELAY_MS', 800),

  /**
   * Délai avant que le décompte de manche ne s'enchaîne tout seul.
   *
   * Bien plus long que le délai d'un coup : l'écran de décompte est celui qu'on
   * lit — qui a annoncé, qui l'a contré, ce que chacun prend. L'enchaîner au
   * rythme d'un robot le ferait disparaître avant que la table ait compris ce
   * qui vient de se passer.
   *
   * Il ne sert que quand celui qui devrait relancer n'est pas là pour le faire.
   * Tant qu'un humain tient la barre, c'est lui qui donne le rythme.
   */
  scoringAutoAdvanceMs: num('SCORING_AUTO_ADVANCE_MS', 6_000),

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

  /*
   * Envoi d'e-mails (liens magiques). Tout est facultatif : sans fournisseur,
   * les comptes e-mail sont simplement désactivés et le reste du jeu vit sa
   * vie. Voir server/src/mail/mailer.ts pour la détection.
   */
  mailProvider: str('MAIL_PROVIDER') as 'resend' | 'brevo' | 'smtp' | 'console' | 'none' | undefined,
  mailFrom: str('MAIL_FROM'),
  resendApiKey: str('RESEND_API_KEY'),
  brevoApiKey: str('BREVO_API_KEY'),
  smtpHost: str('SMTP_HOST'),
  smtpPort: num('SMTP_PORT', 465),
  smtpUser: str('SMTP_USER'),
  smtpPass: str('SMTP_PASS'),
  smtpFrom: str('SMTP_FROM'),
} as const;

export type Config = typeof config;
