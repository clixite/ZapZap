import type { Server } from 'socket.io';
import { isBotId, type ActiveGame, type GameState, type OpenTable, type Player } from '@zapzap/shared';
import { config } from '../config';
import type { Db } from '../db/db';
import { Room, type RoomOptions } from './Room';
import { generateCode } from './roomCodes';

type HostInfo = Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null };

/**
 * L'ensemble des tables.
 *
 * Deux responsabilités qu'on aurait tort de séparer : garder les tables
 * vivantes en mémoire, et les faire survivre à un redémarrage. Le second point
 * n'est pas un luxe — une partie asynchrone dure des jours, et un déploiement
 * ne doit pas la perdre.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweepTimer: ReturnType<typeof setInterval>;

  constructor(
    private io: Server,
    private db: Db | null = null,
    private roomOptions: RoomOptions = {},
    /** Appelé une fois par partie, au passage en fin de partie : stats, historique. */
    private onGameOver?: (room: Room) => void,
    /** Appelé quand la table attend quelqu'un qui n'a pas d'onglet ouvert. */
    private onTurnAwaited?: (room: Room, playerId: string) => void,
  ) {
    this.restore();
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    // Le balayage ne doit pas empêcher le processus de s'arrêter.
    this.sweepTimer.unref?.();
  }

  /* ---------------------------------------------------------------- */
  /* Persistance                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * L'écriture, préparée une fois pour toutes.
   *
   * `db.prepare()` recompile la requête à chaque appel. Sur un chemin parcouru à
   * chaque coup de chaque table, c'est une recompilation par coup pour rien.
   */
  private writeStmt: { run: (...args: [string, string, number]) => unknown } | null = null;

  /** Tables dont l'état a changé et attend d'être écrit. */
  private dirty = new Map<string, Room>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * L'état part sur le disque, mais pas à chaque coup.
   *
   * `better-sqlite3` est **synchrone** : chaque écriture bloque la boucle
   * d'événements pour toutes les autres tables. Une partie à cinq produisait
   * près de quatre cents écritures de six kilo-octets — deux mégaoctets par
   * partie et par table, sur le fil qui doit diffuser les vues de tout le monde.
   *
   * On regroupe donc : au plus une écriture toutes les deux secondes par table.
   * Ce qu'on risque en cas de coupure brutale, c'est deux secondes de jeu —
   * alors que les moments qui comptent vraiment (changement de phase, fin de
   * partie, table vide, arrêt du serveur) forcent l'écriture immédiate.
   */
  private persist(room: Room, immediate = false): void {
    if (!this.db) return;
    if (immediate) {
      this.dirty.delete(room.code);
      this.write(room);
      return;
    }
    this.dirty.set(room.code, room);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 2_000);
    this.flushTimer.unref?.();
  }

  /** Écrit tout ce qui attend. Appelé par le minuteur et à l'arrêt. */
  private flush(): void {
    for (const room of this.dirty.values()) this.write(room);
    this.dirty.clear();
  }

  private write(room: Room): void {
    if (!this.db) return;
    this.writeStmt ??= this.db.prepare(
      `INSERT INTO live_rooms (code, state, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    );
    this.writeStmt.run(room.code, JSON.stringify(room.state), room.updatedAt);
  }

  private forget(code: string): void {
    this.db?.prepare('DELETE FROM live_rooms WHERE code = ?').run(code);
  }

  private restore(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT code, state, updated_at FROM live_rooms').all() as {
      code: string;
      state: string;
      updated_at: number;
    }[];

    for (const row of rows) {
      let state: GameState;
      try {
        state = JSON.parse(row.state) as GameState;
      } catch {
        // Un état illisible vient d'une version antérieure du format : on
        // l'oublie plutôt que de faire échouer tout le démarrage.
        this.forget(row.code);
        continue;
      }
      const host = state.players.find((p) => p.id === state.hostId) ?? state.players[0];
      if (!host) {
        this.forget(row.code);
        continue;
      }
      const room = new Room(this.io, state.code, host, this.callbacks(), this.roomOptions, state);
      room.updatedAt = row.updated_at;
      // Personne n'est connecté au redémarrage : l'état persisté peut affirmer
      // le contraire, il faut le remettre d'équerre avant la première diffusion.
      for (const player of state.players) {
        if (!isBotId(player.id) && player.connected) {
          room.apply({ type: 'SET_CONNECTED', playerId: player.id, connected: false });
        }
      }
      this.rooms.set(room.code, room);
    }
  }

  private callbacks() {
    return {
      onChanged: (room: Room) => this.persist(room),
      onGameOver: (room: Room) => {
        // Fin de partie : on écrit tout de suite, c'est l'état qu'on ne veut
        // perdre sous aucun prétexte.
        this.persist(room, true);
        try {
          this.onGameOver?.(room);
        } catch (error) {
          // L'enregistrement des statistiques ne doit jamais faire tomber la
          // table : la partie est finie, les joueurs regardent le classement.
          console.error('onGameOver a échoué :', error);
        }
      },
      onEmpty: (room: Room) => {
        // Une table vide n'est pas fermée sur-le-champ : quelqu'un peut revenir,
        // et une partie asynchrone est vide par nature. Le balayage tranchera.
        // Écriture immédiate : plus personne ne jouera pour déclencher le
        // regroupement.
        this.persist(room, true);
      },
      onTurnAwaited: (room: Room, playerId: string) => {
        try {
          this.onTurnAwaited?.(room, playerId);
        } catch (error) {
          // Une notification qui échoue ne doit jamais bloquer la partie : le
          // joueur rouvrira l'application de lui-même, c'est le pire des cas.
          console.error('onTurnAwaited a échoué :', error);
        }
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* Cycle de vie                                                      */
  /* ---------------------------------------------------------------- */

  create(host: HostInfo): Room {
    const code = generateCode((c) => this.rooms.has(c));
    const room = new Room(this.io, code, host, this.callbacks(), this.roomOptions);
    this.rooms.set(code, room);
    this.persist(room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /**
   * La table où ce joueur est assis — partie finie comprise.
   *
   * `gamesOf` exclut les parties terminées (elles n'ont rien à faire dans
   * « mes parties en cours »), mais la revanche se demande précisément depuis
   * l'écran de fin : il faut pouvoir retrouver cette table-là.
   */
  findRoomOf(userId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.isMember(userId)) return room;
    }
    return undefined;
  }

  remove(code: string, reason: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.close(reason);
    this.rooms.delete(code);
    this.forget(code);
  }

  /** Les tables où ce joueur est assis, et lesquelles l'attendent. */
  gamesOf(userId: string): ActiveGame[] {
    const games: ActiveGame[] = [];
    for (const room of this.rooms.values()) {
      const state = room.state;
      if (state.phase === 'game-over' || !room.isMember(userId)) continue;
      const me = state.players.find((p) => p.id === userId)!;

      const round = state.round;
      const pendingSeat =
        state.phase === 'dealing' ? round?.dealerSeat : state.phase === 'playing' ? round?.currentSeat : undefined;
      const pending = pendingSeat === undefined ? null : (state.players.find((p) => p.seat === pendingSeat) ?? null);

      games.push({
        code: state.code,
        phase: state.phase,
        pace: state.pace,
        playersCount: state.players.length,
        myTurn: pending?.id === userId,
        waitingFor: pending && pending.id !== userId ? pending.pseudo : null,
        round: state.roundIndex + 1,
        myScore: me.totalScore,
        updatedAt: room.updatedAt,
      });
    }
    // Celle qui attend après nous d'abord : c'est la seule qu'on cherche.
    return games.sort((a, b) => Number(b.myTurn) - Number(a.myTurn) || b.updatedAt - a.updatedAt);
  }

  /* ---------------------------------------------------------------- */
  /* Tables publiques                                                  */
  /* ---------------------------------------------------------------- */

  /** Une table joignable par n'importe qui : publique, au salon, pas pleine. */
  private isOpen(room: Room): boolean {
    const state = room.state;
    return (
      state.visibility === 'public' &&
      state.phase === 'lobby' &&
      state.players.length < state.maxPlayers &&
      room.humanCount() >= 1
    );
  }

  openTables(): OpenTable[] {
    const tables: OpenTable[] = [];
    for (const room of this.rooms.values()) {
      if (!this.isOpen(room)) continue;
      const state = room.state;
      const host = state.players.find((p) => p.id === state.hostId);
      tables.push({
        code: state.code,
        hostPseudo: host?.pseudo ?? '?',
        hostAvatar: host?.avatar ?? '⚡',
        playersCount: state.players.length,
        maxPlayers: state.maxPlayers,
        variants: state.variants,
        pace: state.pace,
        createdAt: state.createdAt,
      });
    }
    // La plus remplie d'abord : on complète une table plutôt que d'en semer.
    return tables.sort((a, b) => b.playersCount - a.playersCount || a.createdAt - b.createdAt);
  }

  /**
   * Partie rapide.
   *
   * On s'assoit à la table publique la plus avancée plutôt que d'en ouvrir une
   * de plus : sans cette préférence, dix joueurs arrivant en même temps
   * ouvriraient dix tables d'un joueur et personne ne jouerait.
   */
  quickMatch(user: HostInfo): { room: Room; created: boolean } {
    for (const table of this.openTables()) {
      const room = this.rooms.get(table.code);
      if (!room || room.isMember(user.id)) continue;
      const result = room.apply({ type: 'ADD_PLAYER', player: user });
      if (result.ok) return { room, created: false };
    }

    const room = this.create(user);
    room.apply({ type: 'SET_VISIBILITY', playerId: user.id, visibility: 'public' });
    return { room, created: true };
  }

  /* ---------------------------------------------------------------- */
  /* Balayage                                                          */
  /* ---------------------------------------------------------------- */

  sweep(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (room.connectedCount() > 0) continue;
      // Une partie asynchrone est vide par nature : la fermer parce que
      // personne n'est en ligne serait exactement l'inverse du mode.
      const idleMs = room.state.pace === 'async' ? config.asyncRoomIdleMs : config.roomIdleMs;
      const finished = room.state.phase === 'game-over';
      if (finished || now - room.updatedAt > idleMs) {
        room.dispose();
        this.rooms.delete(code);
        this.forget(code);
      }
    }
  }

  stop(): void {
    clearInterval(this.sweepTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    // Rien ne doit rester en attente d'écriture quand le processus s'arrête :
    // c'est le seul moment où le regroupement pourrait coûter une partie.
    this.flush();
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
