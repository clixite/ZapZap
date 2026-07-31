import type { Server, Socket } from 'socket.io';
import {
  applyAction,
  botMove,
  botProfile,
  cardId,
  createGame,
  defaultDealChoice,
  defaultDiscard,
  defaultDraw,
  isBotId,
  type EngineErrorCode,
  type EngineResult,
  type GameAction,
  type GameState,
  type Player,
  type TransientEvent,
} from '@zapzap/shared';
import { config } from '../config';
import { dealChoicesFor, viewFor } from '../sockets/views';

export interface RoomCallbacks {
  onChanged?: (room: Room) => void;
  onGameOver?: (room: Room) => void;
  onEmpty?: (room: Room) => void;
}

export interface RoomOptions {
  botDelayMs?: number;
  turnTimeoutMs?: number;
  disconnectGraceMs?: number;
}

/**
 * Une table.
 *
 * La `Room` ne connaît pas les règles : elle possède l'état, l'expose à chacun
 * selon ce qu'il a le droit de voir, et fait avancer ce que personne ne joue —
 * les robots, et le tour de celui qui a laissé filer son temps.
 *
 * Tout ce qui touche au jeu passe par `apply`, qui est le seul point où l'état
 * change. C'est ce qui garantit qu'une diffusion, une sauvegarde et un
 * réarmement de minuteur suivent forcément chaque coup.
 */
export class Room {
  state: GameState;

  private sockets = new Map<string, Set<Socket>>();
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoplayTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnDeadline: number | null = null;
  /** Clé du tour courant : sert à ne pas réarmer le minuteur pour rien. */
  private lastTurnKey: string | null = null;
  private disposed = false;

  /**
   * Statistiques de session, accumulées manche après manche.
   *
   * Le journal d'une manche est remis à zéro à la suivante : ce qui doit
   * survivre à la partie — qui a annoncé, qui a réussi, la meilleure manche de
   * chacun — s'accumule donc ici, au fil des passages en décompte. Jamais
   * persisté : après un redémarrage serveur, une partie reprise repart avec des
   * compteurs vides, ce qui ampute au pire une ligne de statistiques annexes.
   */
  readonly zapStats: Record<string, { called: number; won: number }> = {};
  readonly bestRounds: Record<string, number> = {};

  updatedAt: number;

  constructor(
    private io: Server,
    code: string,
    host: Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null },
    private callbacks: RoomCallbacks = {},
    private options: RoomOptions = {},
    restored?: GameState,
  ) {
    this.state = restored ?? createGame(code, `${code}:${Date.now()}:${Math.random()}`, Date.now(), host);
    this.updatedAt = Date.now();
    if (restored) {
      // Une partie ressuscitée déjà finie a déjà été comptée avant le
      // redémarrage : la notifier à nouveau doublerait les statistiques.
      this.gameOverNotified = restored.phase === 'game-over';
      this.afterChange();
    }
  }

  get code(): string {
    return this.state.code;
  }

  /* ---------------------------------------------------------------- */
  /* Le point de passage unique                                        */
  /* ---------------------------------------------------------------- */

  apply(action: GameAction): EngineResult {
    const eliminatedBefore = new Set(this.state.players.filter((p) => p.eliminated).map((p) => p.id));
    const phaseBefore = this.state.phase;
    const result = applyAction(this.state, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.updatedAt = Date.now();
    if (phaseBefore !== 'round-scoring' && this.state.phase === 'round-scoring') {
      this.accumulateRoundStats();
    }
    this.afterChange();
    // Ici et pas dans les gestionnaires : une élimination peut sortir d'une
    // annonce comme d'une manche bloquée qui se clôt sur une simple pioche.
    // Le point de passage unique est le seul endroit qui les voit toutes.
    this.emitNewEliminations(eliminatedBefore);
    return result;
  }

  /** Au passage en décompte — le seul moment où la manche est à la fois finie et lisible. */
  private accumulateRoundStats(): void {
    const round = this.state.round;
    if (!round) return;
    if (round.zapCall) {
      const stat = (this.zapStats[round.zapCall.playerId] ??= { called: 0, won: 0 });
      stat.called += 1;
      if (round.zapCall.success) stat.won += 1;
    }
    // La « meilleure manche » d'un jeu où l'on fuit les points est celle où
    // l'on en prend le moins... mais 0 est banal. On retient la plus grosse
    // annonce réussie n'aurait de sens que pour l'annonceur ; on garde donc le
    // plus haut score infligé aux autres par une annonce réussie.
    if (round.zapCall?.success && round.roundScores) {
      const inflicted = Object.entries(round.roundScores)
        .filter(([id]) => id !== round.zapCall!.playerId)
        .reduce((sum, [, score]) => sum + score, 0);
      const caller = round.zapCall.playerId;
      this.bestRounds[caller] = Math.max(this.bestRounds[caller] ?? 0, inflicted);
    }
  }

  /** Diffusion, minuteur, robots, sauvegarde : dans cet ordre, après chaque coup. */
  private afterChange(): void {
    if (this.disposed) return;
    this.armTurnTimer();
    this.broadcastViews();
    this.scheduleAutoplay();
    this.callbacks.onChanged?.(this);
    // Sur le front montant uniquement : après la fin, une simple reconnexion
    // passe encore par apply (SET_CONNECTED) et aurait recompté la partie.
    if (this.state.phase === 'game-over' && !this.gameOverNotified) {
      this.gameOverNotified = true;
      this.callbacks.onGameOver?.(this);
    }
  }

  private gameOverNotified = false;

  /* ---------------------------------------------------------------- */
  /* Diffusion                                                         */
  /* ---------------------------------------------------------------- */

  broadcastViews(): void {
    for (const [userId, sockets] of this.sockets) {
      const view = viewFor(this.state, userId, this.turnDeadline);
      for (const socket of sockets) socket.emit('game:view', view);
    }
  }

  emitEvent(event: TransientEvent): void {
    this.io.to(this.code).emit('game:event', event);
  }

  /* ---------------------------------------------------------------- */
  /* Qui doit jouer                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Le joueur attendu, et à quel titre.
   *
   * En phase de donne c'est le donneur, sinon c'est celui dont c'est le tour.
   * `null` quand la table n'attend personne — salon, décompte, fin de partie.
   */
  private pendingPlayer(): Player | null {
    const round = this.state.round;
    if (!round) return null;
    if (this.state.phase === 'dealing') {
      return this.state.players.find((p) => p.seat === round.dealerSeat) ?? null;
    }
    if (this.state.phase !== 'playing') return null;
    return this.state.players.find((p) => p.seat === round.currentSeat) ?? null;
  }

  /** Identifie le tour en cours : change dès que la main passe ou que l'étape avance. */
  private turnKey(): string | null {
    const pending = this.pendingPlayer();
    if (!pending) return null;
    const round = this.state.round!;
    return `${this.state.phase}:${round.roundIndex}:${pending.id}:${round.turnStep}:${round.turnsPlayed}`;
  }

  /* ---------------------------------------------------------------- */
  /* Minuteur de tour                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Arme le compte à rebours du joueur attendu.
   *
   * Uniquement en temps réel, et jamais pour un robot : en asynchrone personne
   * n'est joué à sa place, c'est tout l'intérêt du mode, et un robot a son
   * propre délai.
   */
  private armTurnTimer(): void {
    const key = this.turnKey();
    if (key === this.lastTurnKey) return;
    this.lastTurnKey = key;

    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = null;

    const pending = this.pendingPlayer();
    if (!pending || this.state.pace === 'async' || isBotId(pending.id)) return;

    const delay = this.options.turnTimeoutMs ?? config.turnTimeoutMs;
    this.turnDeadline = Date.now() + delay;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(pending.id), delay);
  }

  /**
   * Le temps est écoulé : on joue à sa place, le plus neutre possible.
   *
   * Jamais le meilleur coup — un joueur absent ne doit ni être avantagé, ni
   * voir sa partie sabotée. Surtout, on n'annonce jamais à sa place : une
   * annonce est un pari, elle appartient au joueur.
   */
  private onTurnTimeout(playerId: string): void {
    if (this.disposed) return;
    const pending = this.pendingPlayer();
    if (!pending || pending.id !== playerId) return;

    const action = this.neutralAction(playerId);
    if (action) this.apply(action);
  }

  private neutralAction(playerId: string): GameAction | null {
    if (this.state.phase === 'dealing') {
      const choices = dealChoicesFor(this.state);
      const handSize = choices.includes(defaultDealChoice()) ? defaultDealChoice() : choices[0];
      return { type: 'DEAL', playerId, handSize };
    }
    if (this.state.phase !== 'playing') return null;
    return this.state.round!.turnStep === 'discard'
      ? { type: 'DISCARD', playerId, cardIds: defaultDiscard(this.state, playerId) }
      : { type: 'DRAW', playerId, from: defaultDraw(this.state) };
  }

  /* ---------------------------------------------------------------- */
  /* Robots                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Qui laisse la machine jouer : les robots, et les joueurs en pause.
   *
   * Le remplaçant d'un joueur en pause est le même robot que les adversaires
   * artificiels — il lit le journal public, pas la main des autres. Ce n'est
   * donc pas un avantage : c'est exactement ce que la table sait déjà.
   */
  private playsItself(player: { id: string; away?: boolean }): boolean {
    return isBotId(player.id) || player.away === true;
  }

  private scheduleAutoplay(): void {
    if (this.autoplayTimer) return;
    const pending = this.pendingPlayer();
    if (!pending || !this.playsItself(pending)) return;

    const delay = this.options.botDelayMs ?? config.botDelayMs;
    this.autoplayTimer = setTimeout(() => {
      this.autoplayTimer = null;
      if (this.disposed) return;
      this.playBotTurn();
    }, delay);
  }

  private playBotTurn(): void {
    const pending = this.pendingPlayer();
    if (!pending || !this.playsItself(pending)) return;

    const move = botMove(this.state, pending.id, { announce: isBotId(pending.id) });
    if (!move) return;

    switch (move.kind) {
      case 'deal':
        this.apply({ type: 'DEAL', playerId: pending.id, handSize: move.handSize });
        this.emitEvent({ type: 'dealt', dealerId: pending.id, handSize: move.handSize });
        break;
      case 'zap': {
        const result = this.apply({ type: 'CALL_ZAP', playerId: pending.id });
        if (result.ok) {
          this.emitEvent({
            type: 'zap-called',
            playerId: pending.id,
            success: this.state.round!.zapCall?.success ?? false,
          });
        }
        break;
      }
      case 'discard': {
        const result = this.apply({ type: 'DISCARD', playerId: pending.id, cardIds: move.cardIds });
        if (result.ok) {
          this.emitEvent({ type: 'discarded', playerId: pending.id, combo: this.state.round!.pendingDiscard!.combo });
        }
        break;
      }
      case 'draw': {
        const from = move.from;
        // La carte doit être lue avant le coup : après, elle a quitté la défausse.
        const taken =
          from.source === 'discard'
            ? this.state.round!.lastDiscard?.combo.cards.find((c) => cardId(c) === from.cardId)
            : undefined;
        const result = this.apply({ type: 'DRAW', playerId: pending.id, from });
        if (result.ok && taken) this.emitEvent({ type: 'drew-discard', playerId: pending.id, card: taken });
        else if (result.ok) this.emitEvent({ type: 'drew-stock', playerId: pending.id });
        break;
      }
    }
  }

  /**
   * Signale les joueurs sortis par le coup qui vient d'être joué — et eux
   * seulement. Rediffuser tous les éliminés de la partie ferait rejouer le son
   * et l'animation de sortie aux mêmes joueurs à chaque manche.
   */
  private emitNewEliminations(before: ReadonlySet<string>): void {
    for (const player of this.state.players) {
      if (player.eliminated && !before.has(player.id)) {
        this.emitEvent({ type: 'player-eliminated', playerId: player.id });
      }
    }
  }

  addBot(): { ok: true; player: ReturnType<typeof botProfile> } | { ok: false; error: EngineErrorCode } {
    const taken = new Set(this.state.players.map((p) => p.id));
    let index = 0;
    while (taken.has(botProfile(index).id)) index++;
    const profile = botProfile(index);
    const result = this.apply({ type: 'ADD_PLAYER', player: profile });
    return result.ok ? { ok: true, player: profile } : { ok: false, error: result.error };
  }

  /* ---------------------------------------------------------------- */
  /* Connexions                                                        */
  /* ---------------------------------------------------------------- */

  isMember(userId: string): boolean {
    return this.state.players.some((p) => p.id === userId);
  }

  attach(userId: string, socket: Socket): void {
    const grace = this.graceTimers.get(userId);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(userId);
    }
    // On se fie à l'état, pas au minuteur de grâce : après un redémarrage du
    // serveur, les joueurs sont marqués déconnectés sans qu'aucun minuteur
    // n'existe — conditionner la reconnexion au minuteur les laissait absents
    // pour toujours.
    const player = this.state.players.find((p) => p.id === userId);
    if (player && !player.connected) {
      this.apply({ type: 'SET_CONNECTED', playerId: userId, connected: true });
      this.emitEvent({ type: 'player-reconnected', playerId: userId });
    }

    let set = this.sockets.get(userId);
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socket);
    void socket.join(this.code);
    socket.emit('game:view', viewFor(this.state, userId, this.turnDeadline));
  }

  /**
   * Un socket s'en va.
   *
   * On ne retire pas le joueur tout de suite : un téléphone qui passe du wifi à
   * la 4G, une application mise en arrière-plan, un tunnel — la coupure est le
   * cas courant, l'abandon est l'exception. D'où le délai de grâce.
   */
  detach(userId: string, socket: Socket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size > 0) return;
    this.sockets.delete(userId);
    if (!this.isMember(userId)) return;

    this.apply({ type: 'SET_CONNECTED', playerId: userId, connected: false });
    const graceMs = this.options.disconnectGraceMs ?? config.disconnectGraceMs;
    this.emitEvent({
      type: 'player-disconnected',
      playerId: userId,
      graceSeconds: Math.round(graceMs / 1000),
    });

    const timer = setTimeout(() => {
      this.graceTimers.delete(userId);
      this.onGraceExpired(userId);
    }, graceMs);
    this.graceTimers.set(userId, timer);
  }

  private onGraceExpired(userId: string): void {
    if (this.disposed || this.sockets.has(userId)) return;
    // Une partie commencée ne perd pas un joueur : le retirer décalerait les
    // sièges et fausserait les scores. Il reste à table, marqué déconnecté, et
    // son tour finit par se jouer tout seul.
    if (this.state.phase === 'lobby') this.removePlayer(userId);
    if (this.connectedCount() === 0) this.callbacks.onEmpty?.(this);
  }

  removePlayer(userId: string): { ok: true } | { ok: false; error: EngineErrorCode } {
    const player = this.state.players.find((p) => p.id === userId);
    if (!player) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    const wasHost = this.state.hostId === userId;
    const result = this.apply({ type: 'REMOVE_PLAYER', playerId: userId });
    // L'échec remonte à l'appelant : « retirer » un joueur d'une partie
    // commencée ne fait rien (les sièges et les scores en dépendent), et
    // répondre ok:true à l'hôte lui ferait croire le contraire.
    if (!result.ok) return result;

    // Les connexions de l'exclu sont libérées, sinon il continuerait de
    // recevoir les vues et les événements d'une table où il n'est plus.
    const sockets = this.sockets.get(userId);
    if (sockets) {
      for (const socket of sockets) {
        socket.emit('room:closed', { reason: 'Vous avez été retiré de la partie.' });
        void socket.leave(this.code);
      }
      this.sockets.delete(userId);
    }

    this.emitEvent({ type: 'player-left', playerId: userId, pseudo: player.pseudo });
    if (wasHost && this.state.players.length > 0) {
      this.emitEvent({ type: 'host-changed', hostId: this.state.hostId });
    }
    return { ok: true };
  }

  leave(userId: string, socket: Socket): void {
    const set = this.sockets.get(userId);
    set?.delete(socket);
    if (set?.size === 0) this.sockets.delete(userId);
    void socket.leave(this.code);
    const removed = this.removePlayer(userId);
    // Une partie commencée ne rend pas les sièges : celui qui quitte reste à
    // table, marqué absent, et son tour se jouera tout seul. Sans ce marquage,
    // la table le croirait présent et l'attendrait à chaque tour.
    if (!removed.ok && this.isMember(userId) && !this.sockets.has(userId)) {
      this.apply({ type: 'SET_CONNECTED', playerId: userId, connected: false });
    }
    if (this.connectedCount() === 0) this.callbacks.onEmpty?.(this);
  }

  /**
   * Le départ définitif, quel que soit l'état de la partie.
   *
   * `leave` rend le siège au salon, mais en cours de partie il ne fait que
   * marquer absent : la table gardait le joueur, jouait ses tours à sa place et
   * l'attendait à la manche suivante. Il n'y avait donc aucun moyen de dire
   * « je ne reviens pas » — et c'est pourtant la seule chose qu'on veut dire
   * quand on ferme l'application au milieu d'une partie qui traîne.
   *
   * Le siège reste au tableau des scores : les points des autres en dépendent.
   * Seule change la mention — parti, et non éliminé à cent points.
   */
  forfeit(userId: string, socket?: Socket): { ok: true } | { ok: false; error: EngineErrorCode } {
    const player = this.state.players.find((p) => p.id === userId);
    if (!player) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    const pseudo = player.pseudo;

    const result = this.apply({ type: 'FORFEIT', playerId: userId });
    if (!result.ok) return result;

    if (socket) {
      const set = this.sockets.get(userId);
      set?.delete(socket);
      if (set?.size === 0) this.sockets.delete(userId);
      void socket.leave(this.code);
    }
    this.emitEvent({ type: 'player-left', playerId: userId, pseudo });
    if (this.connectedCount() === 0) this.callbacks.onEmpty?.(this);
    return { ok: true };
  }

  connectedCount(): number {
    return this.sockets.size;
  }

  /** Joueurs humains présents : sert à décider si une table publique est joignable. */
  humanCount(): number {
    return this.state.players.filter((p) => !isBotId(p.id)).length;
  }

  /* ---------------------------------------------------------------- */
  /* Fin de vie                                                        */
  /* ---------------------------------------------------------------- */

  close(reason: string): void {
    this.io.to(this.code).emit('room:closed', { reason });
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
    if (this.autoplayTimer) clearTimeout(this.autoplayTimer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
    this.autoplayTimer = null;
    this.turnTimer = null;
    for (const sockets of this.sockets.values()) {
      for (const socket of sockets) void socket.leave(this.code);
    }
    this.sockets.clear();
  }
}
