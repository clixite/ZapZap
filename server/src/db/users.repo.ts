import { type PublicUser } from '@zapzap/shared';
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
}
