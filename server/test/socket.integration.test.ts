import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack, GameView, OpenTable, TransientEvent } from '@zapzap/shared';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/db';
import { UsersRepo } from '../src/db/users.repo';
import { RoomManager } from '../src/rooms/RoomManager';
import { registerHandlers } from '../src/sockets/handlers';
import { signToken } from '../src/auth/tokens';

/**
 * Le protocole vu du client.
 *
 * Ces tests passent par de vraies WebSockets plutôt que d'appeler les gestionnaires
 * en direct : ce qu'on veut vérifier, ce n'est pas que le moteur applique les
 * règles — les tests du moteur s'en chargent — mais que le serveur ne laisse
 * jamais un client voir ce qu'il ne doit pas voir, ni rester sans réponse.
 */

let http: HttpServer;
let ioServer: Server;
let rooms: RoomManager;
let db: Db;
let url: string;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  db = openDatabase(':memory:');
  http = createServer(createApp(db));
  ioServer = new Server(http, { cors: { origin: false } });
  rooms = new RoomManager(ioServer, db, {
    // Les robots jouent tout de suite : on teste le protocole, pas la patience.
    botDelayMs: 1,
    turnTimeoutMs: 50,
    disconnectGraceMs: 40,
  });
  registerHandlers({ io: ioServer, rooms, users: new UsersRepo(db) });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  rooms.stop();
  ioServer.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
  db.close();
});

/** Un joueur connecté, avec son identité et sa dernière vue reçue. */
interface TestPlayer {
  socket: ClientSocket;
  id: string;
  view: () => GameView;
  events: TransientEvent[];
  emit: <T>(event: string, payload?: unknown) => Promise<Ack<T>>;
  nextView: (predicate: (v: GameView) => boolean) => Promise<GameView>;
}

async function join(pseudo: string): Promise<TestPlayer> {
  const users = new UsersRepo(db);
  const id = `u_${pseudo}`;
  users.create(id, pseudo, '⚡');

  const socket = connect(url, { auth: { token: signToken(id) }, transports: ['websocket'] });
  clients.push(socket);

  let latest: GameView | null = null;
  const events: TransientEvent[] = [];
  const waiters: { predicate: (v: GameView) => boolean; resolve: (v: GameView) => void }[] = [];

  socket.on('game:view', (view: GameView) => {
    latest = view;
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(view)) waiters.splice(i, 1)[0].resolve(view);
    }
  });
  socket.on('game:event', (event: TransientEvent) => events.push(event));

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });

  return {
    socket,
    id,
    events,
    view: () => {
      if (!latest) throw new Error(`${pseudo} n'a reçu aucune vue`);
      return latest;
    },
    emit: <T,>(event: string, payload?: unknown) =>
      new Promise<Ack<T>>((resolve) => {
        if (payload === undefined) socket.emit(event, resolve);
        else socket.emit(event, payload, resolve);
      }),
    nextView: (predicate) =>
      new Promise<GameView>((resolve, reject) => {
        if (latest && predicate(latest)) return resolve(latest);
        waiters.push({ predicate, resolve });
        setTimeout(() => reject(new Error(`${pseudo} : vue attendue jamais reçue`)), 8000);
      }),
  };
}

function expectOk<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`Refusé : ${ack.error.code} — ${ack.error.message}`);
  return ack as T;
}

describe('identité', () => {
  it('refuse une connexion sans jeton valide', async () => {
    const socket = connect(url, { auth: { token: 'faux' }, transports: ['websocket'] });
    clients.push(socket);
    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(error.message).toBe('INVALID_TOKEN');
  });

  it('crée un compte invité par l’API', async () => {
    const res = await fetch(`${url}/api/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pseudo: 'Alice', avatar: '⚡' }),
    });
    const body = (await res.json()) as { token: string; user: { pseudo: string; isGuest: boolean } };
    expect(res.status).toBe(200);
    expect(body.user).toMatchObject({ pseudo: 'Alice', isGuest: true });
    expect(body.token).toBeTruthy();
  });

  it('refuse un pseudo vide', async () => {
    const res = await fetch(`${url}/api/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pseudo: '   ', avatar: '⚡' }),
    });
    expect(res.status).toBe(400);
  });

  it('répond à la surveillance', async () => {
    const res = await fetch(`${url}/api/health`);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('salon', () => {
  it('crée une table et y assoit l’hôte', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    expect(code).toMatch(/^[A-Z]{4}$/);
    const view = await alice.nextView((v) => v.code === code);
    expect(view.players).toHaveLength(1);
    expect(view.hostId).toBe(alice.id);
  });

  it('accepte un code en minuscules et avec des espaces', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    const joined = expectOk(await bob.emit<{ code: string }>('room:join', { code: ` ${code.toLowerCase()} ` }));
    expect(joined.code).toBe(code);
  });

  it('refuse un code inconnu', async () => {
    const alice = await join('alice');
    const ack = await alice.emit('room:join', { code: 'ZZZZ' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('refuse de rejoindre une partie commencée', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    expectOk(await alice.emit('room:addBot'));
    expectOk(await alice.emit('game:start'));

    const bob = await join('bob');
    const ack = await bob.emit('room:join', { code });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('GAME_ALREADY_STARTED');
  });

  it('n’autorise que l’hôte à régler la table', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));

    const ack = await bob.emit('room:setPace', { pace: 'async' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('NOT_HOST');
  });

  it('refuse un réglage inventé', async () => {
    const alice = await join('alice');
    expectOk(await alice.emit('room:create'));
    const ack = await alice.emit('room:setVariants', { variants: { zapThreshold: 99 } });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('ILLEGAL_VARIANT');
  });

  it('prévient la table quand quelqu’un arrive', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    await alice.nextView((v) => v.players.length === 2);
    expect(alice.events.some((e) => e.type === 'player-joined')).toBe(true);
  });
});

describe('tables publiques', () => {
  it('n’expose pas les tables privées', async () => {
    const alice = await join('alice');
    expectOk(await alice.emit('room:create'));
    const bob = await join('bob');
    const { tables } = expectOk(await bob.emit<{ tables: OpenTable[] }>('room:openTables'));
    expect(tables).toHaveLength(0);
  });

  it('expose une table ouverte par son hôte', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    expectOk(await alice.emit('room:setVisibility', { visibility: 'public' }));

    const bob = await join('bob');
    const { tables } = expectOk(await bob.emit<{ tables: OpenTable[] }>('room:openTables'));
    expect(tables.map((t) => t.code)).toEqual([code]);
    expect(tables[0].hostPseudo).toBe('alice');
  });

  it('ouvre une table à la première partie rapide', async () => {
    const alice = await join('alice');
    const res = expectOk(await alice.emit<{ code: string; created: boolean }>('room:quickMatch'));
    expect(res.created).toBe(true);
    const view = await alice.nextView((v) => v.code === res.code);
    expect(view.visibility).toBe('public');
  });

  it('assoit le second joueur à la table du premier plutôt que d’en ouvrir une', async () => {
    // Sans cette préférence, dix joueurs arrivant ensemble ouvriraient dix
    // tables d'un joueur et personne ne jouerait.
    const alice = await join('alice');
    const first = expectOk(await alice.emit<{ code: string; created: boolean }>('room:quickMatch'));
    const bob = await join('bob');
    const second = expectOk(await bob.emit<{ code: string; created: boolean }>('room:quickMatch'));

    expect(second.created).toBe(false);
    expect(second.code).toBe(first.code);
    const view = await bob.nextView((v) => v.players.length === 2);
    expect(view.players.map((p) => p.pseudo).sort()).toEqual(['alice', 'bob']);
  });

  it('ne propose plus une table dont la partie a commencé', async () => {
    const alice = await join('alice');
    expectOk(await alice.emit('room:quickMatch'));
    expectOk(await alice.emit('room:addBot'));
    expectOk(await alice.emit('game:start'));

    const bob = await join('bob');
    const { tables } = expectOk(await bob.emit<{ tables: OpenTable[] }>('room:openTables'));
    expect(tables).toHaveLength(0);
  });
});

describe('anti-triche', () => {
  async function startedGame() {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    expectOk(await alice.emit('game:start'));
    return { alice, bob, code };
  }

  it('ne diffuse jamais la main d’un adversaire', async () => {
    const { alice, bob } = await startedGame();
    const dealerView = await alice.nextView((v) => v.phase === 'dealing');
    const dealerId = dealerView.players.find((p) => p.seat === dealerView.round!.dealerSeat)!.id;
    const dealer = dealerId === alice.id ? alice : bob;
    expectOk(await dealer.emit('game:deal', { handSize: 5 }));

    const view = await alice.nextView((v) => v.phase === 'playing');
    // La vue ne porte que ma main, plus le nombre de cartes des autres.
    expect(view.round!.myHand).toHaveLength(5);
    expect(Object.values(view.round!.handCounts)).toEqual([5, 5]);
    expect(JSON.stringify(view)).not.toContain('"hands"');
    expect(view.round as unknown as { stock?: unknown }).not.toHaveProperty('stock');
  });

  it('ne révèle jamais la graine de distribution', async () => {
    const { alice } = await startedGame();
    const view = await alice.nextView((v) => v.phase === 'dealing');
    expect(view as unknown as { seed?: unknown }).not.toHaveProperty('seed');
  });

  it('ne propose de coups légaux qu’au joueur attendu', async () => {
    const { alice, bob } = await startedGame();
    const dealerView = await alice.nextView((v) => v.phase === 'dealing');
    const dealerId = dealerView.players.find((p) => p.seat === dealerView.round!.dealerSeat)!.id;
    const dealer = dealerId === alice.id ? alice : bob;
    const waiter = dealerId === alice.id ? bob : alice;

    // En phase de donne, seul le donneur reçoit les tailles proposées.
    expect((await dealer.nextView((v) => v.phase === 'dealing')).round!.dealChoices).not.toBeNull();
    expect((await waiter.nextView((v) => v.phase === 'dealing')).round!.dealChoices).toBeNull();

    expectOk(await dealer.emit('game:deal', { handSize: 5 }));
    const playing = await alice.nextView((v) => v.phase === 'playing');
    const currentId = playing.players.find((p) => p.seat === playing.round!.currentSeat)!.id;
    const current = currentId === alice.id ? alice : bob;
    const other = currentId === alice.id ? bob : alice;

    expect((await current.nextView((v) => v.phase === 'playing')).round!.legalCombos).not.toBeNull();
    expect((await other.nextView((v) => v.phase === 'playing')).round!.legalCombos).toBeNull();
  });

  it('refuse le coup d’un joueur dont ce n’est pas le tour', async () => {
    const { alice, bob } = await startedGame();
    const dealerView = await alice.nextView((v) => v.phase === 'dealing');
    const dealerId = dealerView.players.find((p) => p.seat === dealerView.round!.dealerSeat)!.id;
    const other = dealerId === alice.id ? bob : alice;
    const ack = await other.emit('game:deal', { handSize: 5 });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('NOT_DEALER');
  });

  it('refuse une charge utile mal formée sans planter', async () => {
    const { alice } = await startedGame();
    for (const payload of [null, {}, { cardIds: [] }, { cardIds: ['nimporte'] }, { cardIds: [1, 2] }]) {
      const ack = await alice.emit('game:discard', payload);
      expect(ack.ok).toBe(false);
    }
    // Le serveur répond toujours : rien ne doit rester en attente.
    expect((await alice.emit('room:openTables')).ok).toBe(true);
  });
});

describe('robots', () => {
  it('jouent leur tour tout seuls jusqu’à la fin de la manche', async () => {
    const alice = await join('alice');
    expectOk(await alice.emit('room:create'));
    expectOk(await alice.emit('room:addBot'));
    expectOk(await alice.emit('room:addBot'));
    // En asynchrone, le tour d'Alice ne se joue jamais à sa place : on isole
    // ainsi le comportement des robots de celui du minuteur.
    expectOk(await alice.emit('room:setPace', { pace: 'async' }));
    expectOk(await alice.emit('game:start'));

    const dealing = await alice.nextView((v) => v.phase === 'dealing');
    const dealerId = dealing.players.find((p) => p.seat === dealing.round!.dealerSeat)!.id;
    if (dealerId === alice.id) expectOk(await alice.emit('game:deal', { handSize: 3 }));

    // Les robots enchaînent jusqu'à ce que la main revienne à Alice.
    const view = await alice.nextView(
      (v) =>
        v.phase === 'playing' &&
        v.players.find((p) => p.seat === v.round!.currentSeat)!.id === alice.id &&
        v.round!.legalCombos !== null,
    );
    expect(view.round!.myHand.length).toBeGreaterThan(0);
  });

  it('ne deviennent jamais hôtes tant qu’il reste un humain', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    expectOk(await alice.emit('room:addBot'));

    await alice.nextView((v) => v.players.length === 3);
    expectOk(await alice.emit('room:leave'));

    const view = await bob.nextView((v) => v.hostId === bob.id);
    expect(view.hostId).toBe(bob.id);
  });
});

describe('déconnexion', () => {
  it('marque le joueur absent sans le retirer d’une partie commencée', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    expectOk(await alice.emit('room:setPace', { pace: 'async' }));
    expectOk(await alice.emit('game:start'));
    await alice.nextView((v) => v.phase === 'dealing');

    bob.socket.disconnect();
    const view = await alice.nextView((v) => v.players.some((p) => p.id === bob.id && !p.connected));
    // Le retirer décalerait les sièges et fausserait les scores.
    expect(view.players).toHaveLength(2);
  });

  it('libère la place d’un joueur parti du salon', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    await alice.nextView((v) => v.players.length === 2);

    bob.socket.disconnect();
    const view = await alice.nextView((v) => v.players.length === 1);
    expect(view.players[0].id).toBe(alice.id);
  });
});

describe('exclusion', () => {
  it('refuse de retirer un joueur d’une partie commencée, et le dit', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    expectOk(await alice.emit('game:start'));

    // Une première version répondait ok:true sans rien faire : l'hôte croyait
    // le joueur parti, la table le gardait.
    const ack = await alice.emit('room:kick', { playerId: bob.id });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe('BAD_PHASE');
  });

  it('coupe les vues de l’exclu : il ne voit plus la table', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    const bob = await join('bob');
    expectOk(await bob.emit('room:join', { code }));
    await alice.nextView((v) => v.players.length === 2);

    const closed = new Promise<{ reason: string }>((resolve) => bob.socket.once('room:closed', resolve));
    expectOk(await alice.emit('room:kick', { playerId: bob.id }));
    expect((await closed).reason).toBeTruthy();

    // Alice continue de jouer : les diffusions suivantes n'atteignent plus Bob.
    const bobViews = bob.events.length;
    expectOk(await alice.emit('room:addBot'));
    await alice.nextView((v) => v.players.length === 2);
    expect(bob.events.length).toBe(bobViews);
  });
});

describe('limitation de débit', () => {
  it('finit par rejeter un flot d’émotes', async () => {
    const alice = await join('alice');
    expectOk(await alice.emit<{ code: string }>('room:create'));

    let refused = false;
    for (let i = 0; i < 12; i++) {
      const ack = await alice.emit('game:emote', { emote: 'fire' });
      if (!ack.ok) {
        expect(ack.error.code).toBe('RATE_LIMITED');
        refused = true;
        break;
      }
    }
    expect(refused).toBe(true);
  });

  it('plafonne les parties simultanées d’un même joueur', async () => {
    const alice = await join('alice');
    // On quitte à chaque fois ? Non : on enchaîne les créations sans quitter.
    // gamesOf ne compte que les tables où l'on siège encore.
    let refused = false;
    for (let i = 0; i < 8; i++) {
      const ack = await alice.emit<{ code: string }>('room:create');
      if (!ack.ok) {
        expect(ack.error.code).toBe('TOO_MANY_ROOMS');
        refused = true;
        break;
      }
    }
    expect(refused).toBe(true);
  });

  it('borne la création de comptes par adresse', async () => {
    let refused = false;
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${url}/api/guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pseudo: `Robot${i}`, avatar: '⚡' }),
      });
      if (res.status === 429) {
        refused = true;
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(refused).toBe(true);
  });
});

describe('persistance', () => {
  it('retrouve une partie en cours après un redémarrage', async () => {
    const alice = await join('alice');
    const { code } = expectOk(await alice.emit<{ code: string }>('room:create'));
    expectOk(await alice.emit('room:addBot'));
    expectOk(await alice.emit('room:setPace', { pace: 'async' }));
    expectOk(await alice.emit('game:start'));
    await alice.nextView((v) => v.phase === 'dealing' || v.phase === 'playing');

    // Le serveur redémarre : les tables sont relues depuis la base.
    rooms.stop();
    const revived = new RoomManager(ioServer, db, { botDelayMs: 1 });
    const room = revived.get(code);
    expect(room).toBeDefined();
    expect(room!.state.players).toHaveLength(2);
    expect(room!.state.phase).not.toBe('lobby');
    // Personne n'est connecté au redémarrage, quoi qu'en dise l'état persisté.
    expect(room!.state.players.find((p) => p.id === alice.id)!.connected).toBe(false);

    // Le retour du joueur le remet « connecté » : la reconnexion se fonde sur
    // l'état, pas sur un minuteur de grâce — qui n'existe plus après un
    // redémarrage. Une première version le laissait absent pour toujours.
    const fakeSocket = { join: async () => {}, leave: async () => {}, emit: () => {} };
    room!.attach(alice.id, fakeSocket as never);
    expect(room!.state.players.find((p) => p.id === alice.id)!.connected).toBe(true);
    revived.stop();
  });
});
