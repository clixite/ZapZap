import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

/**
 * La base.
 *
 * SQLite en fichier : le jeu tient sur une seule machine, les écritures sont
 * rares (une partie terminée, un profil modifié) et les lectures triviales. Une
 * base serveur serait une pièce de plus à administrer pour aucun gain.
 */
export function openDatabase(path = config.dbPath): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);

  // WAL : les lectures ne bloquent plus les écritures. Sans lui, sauvegarder
  // une partie en cours fige les requêtes du reste de la table.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      pseudo      TEXT NOT NULL,
      avatar      TEXT NOT NULL,
      photo       TEXT,
      email       TEXT UNIQUE,
      is_guest    INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      seen_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stats (
      user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won    INTEGER NOT NULL DEFAULT 0,
      zaps_called  INTEGER NOT NULL DEFAULT 0,
      zaps_won     INTEGER NOT NULL DEFAULT 0,
      best_round   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS game_history (
      code         TEXT NOT NULL,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      played_at    INTEGER NOT NULL,
      players_count INTEGER NOT NULL,
      my_score     INTEGER NOT NULL,
      my_rank      INTEGER NOT NULL,
      won          INTEGER NOT NULL,
      standings    TEXT NOT NULL,
      PRIMARY KEY (code, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id, played_at DESC);

    /*
     * Liens magiques : connexion sans mot de passe, par e-mail.
     *
     * On ne stocke que le condensat du jeton — un vol de base ne donne aucun
     * lien utilisable — et une échéance courte : un lien magique est un geste,
     * pas un mot de passe de secours.
     */
    CREATE TABLE IF NOT EXISTS magic_links (
      token_hash TEXT PRIMARY KEY,
      /* Invité connecté au moment de la demande : celui qu'on promeut. */
      user_id    TEXT,
      email      TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

    /*
     * Les parties en cours.
     *
     * Une partie asynchrone peut durer des jours : elle doit survivre à un
     * redémarrage du serveur. L'état est sérialisé tel quel — le moteur étant
     * déterministe et sans effet de bord, le relire suffit à reprendre.
     */
    CREATE TABLE IF NOT EXISTS live_rooms (
      code       TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    /*
     * Abonnements aux notifications, un par appareil.
     *
     * La clé est l'adresse d'envoi : c'est elle que le navigateur renouvelle, et
     * deux appareils du même joueur en ont deux différentes. On garde donc
     * plusieurs lignes par personne — quelqu'un qui joue sur son téléphone et
     * sa tablette doit être prévenu sur les deux.
     *
     * notified_at porte le silence : on ne réveille pas le même appareil deux
     * fois de suite parce que deux parties l'attendent.
     */
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      locale     TEXT NOT NULL DEFAULT 'fr',
      created_at INTEGER NOT NULL,
      notified_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

    /*
     * Réglages du serveur qui doivent survivre à un redémarrage.
     *
     * Une seule entrée pour l'instant : la paire de clés VAPID. Elle pourrait
     * vivre dans l'environnement, mais alors une installation neuve exigerait
     * de la générer à la main avant que les notifications ne fonctionnent — et
     * la changer invaliderait tous les abonnements existants. La base est
     * l'endroit où l'on garde ce qui doit rester stable sans être configuré.
     */
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export type Db = Database.Database;
