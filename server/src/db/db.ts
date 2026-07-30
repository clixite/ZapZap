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
  `);

  return db;
}

export type Db = Database.Database;
