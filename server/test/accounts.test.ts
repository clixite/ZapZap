import crypto from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { magicLinkRoutes } from '../src/auth/magicLink';
import { signToken } from '../src/auth/tokens';
import { openDatabase, type Db } from '../src/db/db';
import { UsersRepo } from '../src/db/users.repo';
import type { Mailer } from '../src/mail/mailer';

/**
 * Le cycle de vie d'un compte : statistiques, historique, lien magique.
 *
 * Le mailer est remplacé par une boîte aux lettres en mémoire : on teste le
 * contrat — promotion d'invité, usage unique, expiration — pas l'envoi.
 */

let db: Db;
let users: UsersRepo;
let http: HttpServer;
let url: string;
let sentLinks: { email: string; url: string }[];

function testMailer(enabled = true): Mailer {
  return {
    enabled,
    provider: enabled ? 'console' : 'none',
    sendMagicLink: async (email, link) => {
      sentLinks.push({ email, url: link });
    },
  };
}

beforeEach(async () => {
  db = openDatabase(':memory:');
  users = new UsersRepo(db);
  sentLinks = [];
  const app = express();
  app.use(express.json());
  app.use('/api', magicLinkRoutes(db, users, testMailer()));
  http = createServer(app);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
  db.close();
});

/** Extrait le jeton du lien envoyé. */
function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('t')!;
}

describe('statistiques', () => {
  it('part de zéro pour un compte neuf', () => {
    users.create('u_a', 'Alice', '⚡');
    expect(users.getStats('u_a')).toEqual({ gamesPlayed: 0, gamesWon: 0, zapsCalled: 0, zapsWon: 0, bestRound: 0 });
  });

  it('cumule les parties et garde la meilleure manche', () => {
    users.create('u_a', 'Alice', '⚡');
    users.recordGameResult('u_a', true, 2, 1, 24);
    users.recordGameResult('u_a', false, 3, 2, 12);
    expect(users.getStats('u_a')).toEqual({ gamesPlayed: 2, gamesWon: 1, zapsCalled: 5, zapsWon: 3, bestRound: 24 });
  });
});

describe('historique', () => {
  const entry = {
    code: 'ABCD',
    playedAt: 1_000,
    playersCount: 3,
    myScore: 42,
    myRank: 2,
    won: false,
    standings: [{ pseudo: 'Bob', avatar: '⚡', score: 12 }],
  };

  it('conserve et relit une partie', () => {
    users.create('u_a', 'Alice', '⚡');
    users.addHistoryEntry('u_a', entry);
    expect(users.getHistory('u_a')).toEqual([entry]);
  });

  it('rejouer le même code écrase plutôt que dupliquer', () => {
    users.create('u_a', 'Alice', '⚡');
    users.addHistoryEntry('u_a', entry);
    users.addHistoryEntry('u_a', { ...entry, myScore: 50 });
    const history = users.getHistory('u_a');
    expect(history).toHaveLength(1);
    expect(history[0].myScore).toBe(50);
  });

  it('part avec le compte à la suppression', () => {
    users.create('u_a', 'Alice', '⚡');
    users.addHistoryEntry('u_a', entry);
    users.recordGameResult('u_a', true, 1, 1, 10);
    users.deleteAccount('u_a');
    expect(users.get('u_a')).toBeNull();
    expect(users.getHistory('u_a')).toHaveLength(0);
    expect(users.getStats('u_a').gamesPlayed).toBe(0);
  });
});

describe('lien magique', () => {
  it('promeut l’invité connecté : identité et pseudo conservés', async () => {
    const guest = users.create('u_guest', 'Nico', '🔥');
    const res = await fetch(`${url}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${signToken(guest.id)}` },
      body: JSON.stringify({ email: 'nico@exemple.be' }),
    });
    expect(res.status).toBe(200);
    expect(sentLinks).toHaveLength(1);

    const verify = await fetch(`${url}/api/auth/verify?t=${tokenFromLink(sentLinks[0].url)}`);
    const body = (await verify.json()) as { user: { id: string; pseudo: string; email: string; isGuest: boolean } };
    expect(verify.status).toBe(200);
    // C'est le même compte, promu : rien à re-saisir, rien de perdu.
    expect(body.user.id).toBe('u_guest');
    expect(body.user.pseudo).toBe('Nico');
    expect(body.user.email).toBe('nico@exemple.be');
    expect(body.user.isGuest).toBe(false);
  });

  it('reconnecte un compte e-mail existant, même sans être l’invité', async () => {
    users.createWithEmail('u_mail', 'Ancienne', '⚡', 'retour@exemple.be');
    await fetch(`${url}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'retour@exemple.be' }),
    });
    const verify = await fetch(`${url}/api/auth/verify?t=${tokenFromLink(sentLinks[0].url)}`);
    const body = (await verify.json()) as { user: { id: string } };
    expect(body.user.id).toBe('u_mail');
  });

  it('n’accepte un lien qu’une seule fois', async () => {
    await fetch(`${url}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'unique@exemple.be' }),
    });
    const token = tokenFromLink(sentLinks[0].url);
    expect((await fetch(`${url}/api/auth/verify?t=${token}`)).status).toBe(200);
    // Rejouer le même lien — depuis un e-mail transféré, par exemple — échoue.
    expect((await fetch(`${url}/api/auth/verify?t=${token}`)).status).toBe(400);
  });

  it('refuse un jeton inventé', async () => {
    const fake = crypto.randomBytes(32).toString('base64url');
    expect((await fetch(`${url}/api/auth/verify?t=${fake}`)).status).toBe(400);
  });

  it('plafonne les liens actifs par adresse', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${url}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'flood@exemple.be' }),
      });
      expect(res.status).toBe(200);
    }
    const fourth = await fetch(`${url}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'flood@exemple.be' }),
    });
    expect(fourth.status).toBe(429);
  });

  it('répond 503 quand aucun fournisseur d’e-mail n’est configuré', async () => {
    const bare = express();
    bare.use(express.json());
    bare.use('/api', magicLinkRoutes(db, users, testMailer(false)));
    const server = createServer(bare);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const bareUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${bareUrl}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@exemple.be' }),
    });
    expect(res.status).toBe(503);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe('classement entre joueurs', () => {
  /** Une partie finie, avec le classement de chacun. */
  function playedTogether(code: string, results: { id: string; rank: number; score: number }[]): void {
    const standings = results.map((r) => ({ pseudo: r.id, avatar: '⚡', score: r.score }));
    for (const r of results) {
      users.addHistoryEntry(r.id, {
        code,
        playedAt: Date.now(),
        playersCount: results.length,
        myScore: r.score,
        myRank: r.rank,
        won: r.rank === 1,
        standings,
      });
    }
  }

  beforeEach(() => {
    for (const id of ['u_a', 'u_b', 'u_c', 'u_solo']) users.create(id, id, '⚡');
  });

  it('ne compte que les gens avec qui on a joué', () => {
    playedTogether('AAAA', [
      { id: 'u_a', rank: 1, score: 40 },
      { id: 'u_b', rank: 2, score: 100 },
    ]);
    // u_solo a joué ailleurs : il n'a rien à faire dans le classement de u_a.
    playedTogether('BBBB', [
      { id: 'u_solo', rank: 1, score: 10 },
      { id: 'u_c', rank: 2, score: 100 },
    ]);

    const board = users.getLeaderboard('u_a');
    expect(board.map((r) => r.userId).sort()).toEqual(['u_a', 'u_b']);
  });

  it('se compte soi-même, et se marque', () => {
    playedTogether('AAAA', [
      { id: 'u_a', rank: 1, score: 40 },
      { id: 'u_b', rank: 2, score: 100 },
    ]);
    const me = users.getLeaderboard('u_a').find((r) => r.userId === 'u_a')!;
    expect(me.isMe).toBe(true);
    expect(me.wins).toBe(1);
    expect(me.games).toBe(1);
  });

  it('classe par victoires, puis par parties', () => {
    playedTogether('AAAA', [
      { id: 'u_a', rank: 1, score: 30 },
      { id: 'u_b', rank: 2, score: 100 },
      { id: 'u_c', rank: 3, score: 110 },
    ]);
    playedTogether('BBBB', [
      { id: 'u_b', rank: 1, score: 20 },
      { id: 'u_a', rank: 2, score: 100 },
      { id: 'u_c', rank: 3, score: 120 },
    ]);
    playedTogether('CCCC', [
      { id: 'u_b', rank: 1, score: 25 },
      { id: 'u_a', rank: 2, score: 100 },
      { id: 'u_c', rank: 3, score: 130 },
    ]);

    const board = users.getLeaderboard('u_a');
    expect(board.map((r) => r.userId)).toEqual(['u_b', 'u_a', 'u_c']);
    expect(board[0].wins).toBe(2);
    expect(board[2].wins).toBe(0);
  });

  it('donne le score moyen, arrondi', () => {
    playedTogether('AAAA', [
      { id: 'u_a', rank: 1, score: 30 },
      { id: 'u_b', rank: 2, score: 101 },
    ]);
    playedTogether('BBBB', [
      { id: 'u_a', rank: 1, score: 41 },
      { id: 'u_b', rank: 2, score: 100 },
    ]);
    const me = users.getLeaderboard('u_a').find((r) => r.userId === 'u_a')!;
    expect(me.averageScore).toBe(36);
  });

  it('rend une liste vide à qui n’a jamais fini de partie', () => {
    expect(users.getLeaderboard('u_solo')).toEqual([]);
  });
});
