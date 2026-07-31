import { type GameHistoryEntry, type LeaderboardRow, type PublicUser, type UserStats } from '@zapzap/shared';
import type { Db } from './db';

export interface UserRow {
  id: string;
  pseudo: string;
  avatar: string;
  photo: string | null;
  email: string | null;
  is_guest: number;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    pseudo: row.pseudo,
    avatar: row.avatar,
    photo: row.photo,
    email: row.email,
    isGuest: row.is_guest === 1,
  };
}

export class UsersRepo {
  constructor(private db: Db) {}

  get(id: string): PublicUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toPublic(row) : null;
  }

  create(id: string, pseudo: string, avatar: string): PublicUser {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (id, pseudo, avatar, photo, email, is_guest, created_at, seen_at)
         VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)`,
      )
      .run(id, pseudo, avatar, now, now);
    this.db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)').run(id);
    return { id, pseudo, avatar, photo: null, email: null, isGuest: true };
  }

  updateProfile(id: string, pseudo: string, avatar: string): void {
    this.db
      .prepare('UPDATE users SET pseudo = ?, avatar = ?, seen_at = ? WHERE id = ?')
      .run(pseudo, avatar, Date.now(), id);
  }

  touch(id: string): void {
    this.db.prepare('UPDATE users SET seen_at = ? WHERE id = ?').run(Date.now(), id);
  }

  /* ---------------------------------------------------------------- */
  /* Comptes e-mail (liens magiques)                                   */
  /* ---------------------------------------------------------------- */

  getByEmail(email: string): PublicUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? toPublic(row) : null;
  }

  /**
   * Promotion d'un invité : le compte gagne un e-mail, garde tout le reste.
   *
   * C'est le contrat du lien magique — l'identité, le pseudo, l'historique et
   * les statistiques restent, seul le moyen de les retrouver change.
   */
  attachEmail(id: string, email: string): void {
    this.db.prepare('UPDATE users SET email = ?, is_guest = 0, seen_at = ? WHERE id = ?').run(email, Date.now(), id);
  }

  createWithEmail(id: string, pseudo: string, avatar: string, email: string): PublicUser {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (id, pseudo, avatar, photo, email, is_guest, created_at, seen_at)
         VALUES (?, ?, ?, NULL, ?, 0, ?, ?)`,
      )
      .run(id, pseudo, avatar, email, now, now);
    this.db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)').run(id);
    return { id, pseudo, avatar, photo: null, email, isGuest: false };
  }

  updatePhoto(id: string, photo: string | null): void {
    this.db.prepare('UPDATE users SET photo = ?, seen_at = ? WHERE id = ?').run(photo, Date.now(), id);
  }

  /** Suppression complète — stats et historique suivent par ON DELETE CASCADE. */
  deleteAccount(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  /* ---------------------------------------------------------------- */
  /* Statistiques et historique                                        */
  /* ---------------------------------------------------------------- */

  getStats(id: string): UserStats {
    const row = this.db.prepare('SELECT * FROM stats WHERE user_id = ?').get(id) as
      | { games_played: number; games_won: number; zaps_called: number; zaps_won: number; best_round: number }
      | undefined;
    return {
      gamesPlayed: row?.games_played ?? 0,
      gamesWon: row?.games_won ?? 0,
      zapsCalled: row?.zaps_called ?? 0,
      zapsWon: row?.zaps_won ?? 0,
      bestRound: row?.best_round ?? 0,
    };
  }

  recordGameResult(id: string, won: boolean, zapsCalled: number, zapsWon: number, bestRound: number): void {
    this.db
      .prepare(
        `INSERT INTO stats (user_id, games_played, games_won, zaps_called, zaps_won, best_round)
         VALUES (?, 1, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           games_played = games_played + 1,
           games_won    = games_won + excluded.games_won,
           zaps_called  = zaps_called + excluded.zaps_called,
           zaps_won     = zaps_won + excluded.zaps_won,
           best_round   = MAX(best_round, excluded.best_round)`,
      )
      .run(id, won ? 1 : 0, zapsCalled, zapsWon, bestRound);
  }

  addHistoryEntry(userId: string, entry: GameHistoryEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO game_history
           (code, user_id, played_at, players_count, my_score, my_rank, won, standings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.code,
        userId,
        entry.playedAt,
        entry.playersCount,
        entry.myScore,
        entry.myRank,
        entry.won ? 1 : 0,
        JSON.stringify(entry.standings),
      );
  }

  /**
   * Le classement des gens avec qui l'on joue.
   *
   * Aucune table de plus : `game_history` porte déjà une ligne par humain et
   * par partie, donc deux lignes de même code sont deux joueurs de la même
   * table. Une auto-jointure suffit à répondre à « qui ai-je affronté, et
   * comment nous en sommes-nous sortis ».
   *
   * Le tri met les victoires d'abord, puis le nombre de parties — quelqu'un qui
   * gagne une fois sur une partie ne passe pas devant un habitué — et enfin le
   * score moyen, le plus bas gagnant : c'est un jeu où l'on cherche à ne pas
   * marquer.
   */
  getLeaderboard(userId: string, limit = 20): LeaderboardRow[] {
    const rows = this.db
      .prepare(
        `SELECT other.user_id AS user_id,
                users.pseudo  AS pseudo,
                users.avatar  AS avatar,
                users.photo   AS photo,
                COUNT(*)      AS games,
                SUM(other.won) AS wins,
                AVG(other.my_score) AS average
         FROM game_history mine
         JOIN game_history other ON other.code = mine.code
         JOIN users ON users.id = other.user_id
         WHERE mine.user_id = ?
         GROUP BY other.user_id
         ORDER BY wins DESC, games DESC, average ASC
         LIMIT ?`,
      )
      .all(userId, limit) as {
      user_id: string;
      pseudo: string;
      avatar: string;
      photo: string | null;
      games: number;
      wins: number;
      average: number;
    }[];

    return rows.map((row) => ({
      userId: row.user_id,
      pseudo: row.pseudo,
      avatar: row.avatar,
      photo: row.photo,
      games: row.games,
      wins: row.wins,
      averageScore: Math.round(row.average),
      isMe: row.user_id === userId,
    }));
  }

  getHistory(userId: string, limit = 20): GameHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM game_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?')
      .all(userId, limit) as {
      code: string;
      played_at: number;
      players_count: number;
      my_score: number;
      my_rank: number;
      won: number;
      standings: string;
    }[];
    return rows.map((row) => ({
      code: row.code,
      playedAt: row.played_at,
      playersCount: row.players_count,
      myScore: row.my_score,
      myRank: row.my_rank,
      won: row.won === 1,
      standings: JSON.parse(row.standings) as GameHistoryEntry['standings'],
    }));
  }
}
