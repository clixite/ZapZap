import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  cardId,
  DEAL_MAX,
  DEAL_MIN,
  isEmoteId,
  isGamePace,
  isVisibility,
  isZapVariants,
  type Ack,
  type ErrorCode,
  type Player,
} from '@zapzap/shared';
import type { UsersRepo } from '../db/users.repo';
import { RateLimiter } from '../rateLimit';
import { normalizeCode } from '../rooms/roomCodes';
import type { RoomManager } from '../rooms/RoomManager';
import type { Room } from '../rooms/Room';
import { verifyToken } from '../auth/tokens';

/**
 * Le protocole, côté serveur.
 *
 * Deux principes qui expliquent la forme de ce fichier :
 *
 *  - **rien n'est cru**. Tout ce qui arrive du réseau est validé avant de
 *    toucher au moteur : ni le pseudo, ni le code, ni la liste de cartes. Le
 *    moteur refuserait de lui-même un coup illégal, mais il ne devrait jamais
 *    avoir à se défendre contre un objet mal formé.
 *  - **chaque appel répond**. Tous les événements prennent un accusé de
 *    réception : sans lui, un client qui perd un paquet reste bloqué sur un
 *    bouton qui tourne, sans savoir si son coup est passé.
 */

const MESSAGES: Record<ErrorCode, string> = {
  BAD_PHASE: 'Ce n’est pas le moment de faire ça.',
  BAD_STEP: 'Il faut défausser avant de piocher.',
  NOT_HOST: 'Seul l’hôte de la partie peut faire ça.',
  NOT_DEALER: 'C’est au donneur de choisir.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
  NOT_ENOUGH_PLAYERS: 'Il faut au moins deux joueurs.',
  ROOM_FULL: 'La table est complète.',
  PLAYER_NOT_FOUND: 'Joueur introuvable.',
  ILLEGAL_DEAL_COUNT: `Il faut distribuer entre ${DEAL_MIN} et ${DEAL_MAX} cartes.`,
  ILLEGAL_COMBO: 'Cette combinaison n’est pas posable.',
  ILLEGAL_DRAW: 'Cette carte n’est pas disponible.',
  ZAP_TOO_HIGH: 'Votre main est trop forte pour annoncer.',
  ILLEGAL_VARIANT: 'Réglage invalide.',
  ROOM_NOT_FOUND: 'Cette partie n’existe pas ou est terminée.',
  GAME_ALREADY_STARTED: 'La partie a déjà commencé.',
  ALREADY_IN_ROOM: 'Vous êtes déjà à une table.',
  NOT_IN_ROOM: 'Vous n’êtes à aucune table.',
  NO_OPEN_TABLE: 'Aucune table ouverte pour le moment.',
  TOO_MANY_ROOMS: 'Vous avez déjà plusieurs parties en cours. Finissez-en une d’abord.',
  RATE_LIMITED: 'Doucement ! Réessayez dans un instant.',
  INVALID_TOKEN: 'Session expirée, rechargez la page.',
  INVALID_PAYLOAD: 'Requête invalide.',
  // Le serveur n'émet jamais ces deux-là — ils décrivent son silence, et c'est
  // le client qui les fabrique. Ils figurent ici pour que la table reste
  // exhaustive : c'est ce qui garantit qu'aucun code n'arrive sans message.
  TIMEOUT: 'Le serveur ne répond pas.',
  OFFLINE: 'Pas de connexion au serveur.',
};

function fail(code: ErrorCode): Ack<never> {
  return { ok: false, error: { code, message: MESSAGES[code] } };
}

/** Enveloppe un accusé de réception pour qu'une exception ne laisse jamais le client en attente. */
function reply<T>(ack: unknown, produce: () => Ack<T>): void {
  const respond = typeof ack === 'function' ? (ack as (res: Ack<T>) => void) : () => {};
  try {
    respond(produce());
  } catch {
    respond(fail('INVALID_PAYLOAD') as Ack<T>);
  }
}

const cardIdSchema = z.string().regex(/^[SHDCX](?:[0-9]|1[0-3])$/);
const discardSchema = z.object({ cardIds: z.array(cardIdSchema).min(1).max(13) });
const drawSchema = z.union([
  z.object({ source: z.literal('stock') }),
  z.object({ source: z.literal('discard'), cardId: cardIdSchema }),
]);
const joinSchema = z.object({ code: z.string().min(1).max(16) });
const profileSchema = z.object({
  // Un pseudo est affiché à toute la table, y compris sur les parties
  // publiques : on le borne, on retire les caractères de contrôle, et le reste
  // relève du signalement, pas du filtre automatique.
  pseudo: z.string().trim().min(1).max(20),
  avatar: z.string().trim().min(1).max(8),
});

/** Parties simultanées par joueur : au-delà, il sème des tables sans les jouer. */
const MAX_ACTIVE_ROOMS = 5;

export interface HandlerDeps {
  io: Server;
  rooms: RoomManager;
  users: UsersRepo;
}

export function registerHandlers({ io, rooms, users }: HandlerDeps): void {
  /**
   * Débit par joueur sur les événements qui mutent quelque chose.
   *
   * Trente d'un coup puis huit par seconde : très au-dessus du rythme d'un
   * humain — même pressé, on joue deux actions par tour — mais assez bas pour
   * qu'un script en boucle n'occupe pas le serveur. Les émotes ont leur propre
   * seau, plus strict : c'est le seul événement qui se diffuse à toute la
   * table sans limite naturelle de tour.
   */
  const actionLimiter = new RateLimiter(30, 8);
  const emoteLimiter = new RateLimiter(5, 0.5);
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const userId = token ? verifyToken(token) : null;
    if (!userId) return next(new Error('INVALID_TOKEN'));
    const user = users.get(userId);
    if (!user) return next(new Error('INVALID_TOKEN'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    users.touch(userId);

    /** Comme `reply`, avec le seau de jetons devant : un flot d'appels est rejeté, pas traité. */
    const limited = <T,>(ack: unknown, produce: () => Ack<T>): void =>
      reply(ack, () => (actionLimiter.allow(userId) ? produce() : (fail('RATE_LIMITED') as Ack<T>)));

    /**
     * La table que **ce socket** regarde.
     *
     * Un joueur peut être assis à plusieurs tables à la fois — c'est tout
     * l'intérêt du mode asynchrone. Chercher « une table dont il est membre »
     * renvoyait alors la première venue : créer une seconde partie donnait un
     * salon où ajouter un robot, régler ou démarrer n'avait aucun effet visible,
     * parce que tout partait sur l'ancienne table.
     *
     * L'onglet dit donc explicitement où il est, à chaque fois qu'il s'assoit.
     * Le repli sur `findRoomOf` ne sert qu'aux tout premiers instants d'une
     * reconnexion, avant que le client n'ait redemandé sa table.
     */
    const focusOn = (room: Room): Room => {
      /*
       * Un onglet ne regarde qu'une table à la fois.
       *
       * Le joueur, lui, peut être assis à cinq — mais ce socket-ci n'en affiche
       * qu'une. Tant qu'il restait attaché à la précédente, les deux tables lui
       * poussaient leurs `game:view` : le client gardait la dernière arrivée,
       * et la table affichée sautait d'une partie à l'autre au gré des coups
       * des autres joueurs. On se décroche donc de l'ancienne en s'asseyant à
       * la nouvelle — le joueur y reste membre, il n'y a simplement plus d'œil
       * dessus, ce qui est exactement la vérité.
       */
      const previous = socket.data.roomCode as string | undefined;
      if (previous && previous !== room.code) rooms.get(previous)?.detach(userId, socket);
      socket.data.roomCode = room.code;
      return room;
    };

    const myRoom = (): Room | undefined => {
      const code = socket.data.roomCode as string | undefined;
      const focused = code ? rooms.get(code) : undefined;
      if (focused?.isMember(userId)) return focused;
      return rooms.findRoomOf(userId);
    };

    const profile = (): Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null } => {
      const user = users.get(userId)!;
      return { id: user.id, pseudo: user.pseudo, avatar: user.avatar, photo: user.photo };
    };

    /* -------------------------------------------------------------- */
    /* Salon                                                           */
    /* -------------------------------------------------------------- */

    socket.on('room:create', (ack) =>
      limited(ack, () => {
        if (rooms.gamesOf(userId).length >= MAX_ACTIVE_ROOMS) return fail('TOO_MANY_ROOMS');
        const room = focusOn(rooms.create(profile()));
        room.attach(userId, socket);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:join', (payload, ack) =>
      limited(ack, () => {
        const parsed = joinSchema.safeParse(payload);
        if (!parsed.success) return fail('INVALID_PAYLOAD');
        const room = rooms.get(normalizeCode(parsed.data.code));
        if (!room) return fail('ROOM_NOT_FOUND');

        if (!room.isMember(userId)) {
          if (room.state.phase !== 'lobby') return fail('GAME_ALREADY_STARTED');
          const result = room.apply({ type: 'ADD_PLAYER', player: profile() });
          if (!result.ok) return fail(result.error);
          room.emitEvent({ type: 'player-joined', playerId: userId, pseudo: profile().pseudo });
        }
        focusOn(room).attach(userId, socket);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:quickMatch', (ack) =>
      limited(ack, () => {
        /*
         * Une table où l'on est déjà **assis à attendre** n'est pas à quitter :
         * y renvoyer, c'est reprendre sa place. Une partie déjà lancée, si —
         * « partie rapide » veut dire « trouve-moi une table maintenant », et
         * renvoyer vers un jeu en cours donnait l'impression que le bouton ne
         * faisait rien. Les parties en cours ont leur propre liste à l'accueil.
         */
        const existing = myRoom();
        if (existing && existing.state.phase === 'lobby') {
          focusOn(existing).attach(userId, socket);
          return { ok: true, code: existing.code, created: false };
        }
        if (rooms.gamesOf(userId).length >= MAX_ACTIVE_ROOMS) return fail('TOO_MANY_ROOMS');
        const { room, created } = rooms.quickMatch(profile());
        if (!created) room.emitEvent({ type: 'player-joined', playerId: userId, pseudo: profile().pseudo });
        focusOn(room).attach(userId, socket);
        return { ok: true, code: room.code, created };
      }),
    );

    socket.on('room:openTables', (ack) => reply(ack, () => ({ ok: true, tables: rooms.openTables() })));

    socket.on('room:leave', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        room.leave(userId, socket);
        socket.data.roomCode = undefined;
        return { ok: true };
      }),
    );

    socket.on('room:forfeit', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.forfeit(userId, socket);
        socket.data.roomCode = undefined;
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('game:away', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const away = (payload as { away?: unknown } | undefined)?.away;
        if (typeof away !== 'boolean') return fail('INVALID_PAYLOAD');
        const result = room.apply({ type: 'SET_AWAY', playerId: userId, away });
        if (!result.ok) return fail(result.error);
        room.emitEvent({ type: 'player-away', playerId: userId, away });
        return { ok: true };
      }),
    );

    socket.on('room:addBot', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        const result = room.addBot();
        if (!result.ok) return fail(result.error);
        room.emitEvent({ type: 'player-joined', playerId: result.player.id, pseudo: result.player.pseudo });
        return { ok: true, playerId: result.player.id };
      }),
    );

    socket.on('room:removeBot', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        const playerId = (payload as { playerId?: unknown } | undefined)?.playerId;
        if (typeof playerId !== 'string') return fail('INVALID_PAYLOAD');
        const result = room.removePlayer(playerId);
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:kick', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        const playerId = (payload as { playerId?: unknown } | undefined)?.playerId;
        if (typeof playerId !== 'string' || playerId === userId) return fail('INVALID_PAYLOAD');
        // L'échec remonte tel quel : hors salon, retirer quelqu'un ne fait
        // rien, et l'hôte doit le savoir plutôt que de croire le joueur parti.
        const result = room.removePlayer(playerId);
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:rematch', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        if (room.state.phase !== 'game-over') return fail('BAD_PHASE');

        // Une toute nouvelle table, avec l'hôte seul dedans. L'événement
        // `rematch` est diffusé à l'ancienne : chaque client encore connecté
        // rejoint la nouvelle de lui-même — c'est ce qui fait basculer toute
        // la tablée sans que personne n'ait à retaper un code.
        const next = rooms.create(profile());
        room.emitEvent({ type: 'rematch', code: next.code });
        focusOn(next).attach(userId, socket);
        return { ok: true, code: next.code };
      }),
    );

    /* -------------------------------------------------------------- */
    /* Réglages de la table                                            */
    /* -------------------------------------------------------------- */

    socket.on('room:setVariants', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const variants = (payload as { variants?: unknown } | undefined)?.variants;
        if (!isZapVariants(variants)) return fail('ILLEGAL_VARIANT');
        const result = room.apply({ type: 'SET_VARIANTS', playerId: userId, variants });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:setPace', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const pace = (payload as { pace?: unknown } | undefined)?.pace;
        if (!isGamePace(pace)) return fail('ILLEGAL_VARIANT');
        const result = room.apply({ type: 'SET_PACE', playerId: userId, pace });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:setVisibility', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const visibility = (payload as { visibility?: unknown } | undefined)?.visibility;
        if (!isVisibility(visibility)) return fail('ILLEGAL_VARIANT');
        const result = room.apply({ type: 'SET_VISIBILITY', playerId: userId, visibility });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    /* -------------------------------------------------------------- */
    /* Le jeu                                                          */
    /* -------------------------------------------------------------- */

    socket.on('game:start', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'START_GAME', playerId: userId });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('game:deal', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const handSize = (payload as { handSize?: unknown } | undefined)?.handSize;
        if (typeof handSize !== 'number') return fail('INVALID_PAYLOAD');
        const result = room.apply({ type: 'DEAL', playerId: userId, handSize });
        if (!result.ok) return fail(result.error);
        room.emitEvent({ type: 'dealt', dealerId: userId, handSize });
        return { ok: true };
      }),
    );

    socket.on('game:discard', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const parsed = discardSchema.safeParse(payload);
        if (!parsed.success) return fail('INVALID_PAYLOAD');
        const result = room.apply({ type: 'DISCARD', playerId: userId, cardIds: parsed.data.cardIds });
        if (!result.ok) return fail(result.error);
        room.emitEvent({ type: 'discarded', playerId: userId, combo: room.state.round!.pendingDiscard!.combo });
        return { ok: true };
      }),
    );

    socket.on('game:draw', (payload, ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const parsed = drawSchema.safeParse(payload);
        if (!parsed.success) return fail('INVALID_PAYLOAD');
        const from = parsed.data;

        // La carte doit être lue avant le coup : après, elle a quitté la défausse.
        const taken =
          from.source === 'discard'
            ? room.state.round?.lastDiscard?.combo.cards.find((c) => cardId(c) === from.cardId)
            : undefined;

        const result = room.apply({ type: 'DRAW', playerId: userId, from });
        if (!result.ok) return fail(result.error);
        room.emitEvent(
          taken ? { type: 'drew-discard', playerId: userId, card: taken } : { type: 'drew-stock', playerId: userId },
        );
        return { ok: true };
      }),
    );

    socket.on('game:zap', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'CALL_ZAP', playerId: userId });
        if (!result.ok) return fail(result.error);
        const call = room.state.round!.zapCall!;
        room.emitEvent({ type: 'zap-called', playerId: userId, success: call.success });
        // Les éliminations sont diffusées par `Room.apply`, qui seul voit celles
        // qui viennent d'arriver. La boucle qui était ici rediffusait *tous* les
        // sortis de la partie à chaque annonce : le joueur éliminé à la manche 2
        // se faisait re-annoncer, son et animation compris, à chaque manche
        // suivante jusqu'à la fin.
        return { ok: true };
      }),
    );

    socket.on('game:nextRound', (ack) =>
      limited(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'NEXT_ROUND', playerId: userId });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('game:log', (ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (!room.isMember(userId)) return fail('NOT_IN_ROOM');
        // Journal strictement public : qui a donné, posé, ramassé, pioché à
        // l'aveugle. Aucune main, aucune carte de la pioche.
        return { ok: true, log: room.state.round?.log ?? [] };
      }),
    );

    socket.on('game:emote', (payload, ack) =>
      reply(ack, () => {
        // Seau dédié, plus strict : l'émote se diffuse à toute la table sans
        // limite naturelle de tour, c'est la seule voie de spam possible.
        if (!emoteLimiter.allow(userId)) return fail('RATE_LIMITED');
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const emote = (payload as { emote?: unknown } | undefined)?.emote;
        if (!isEmoteId(emote)) return fail('INVALID_PAYLOAD');
        room.emitEvent({ type: 'emote', playerId: userId, emote });
        return { ok: true };
      }),
    );

    /* -------------------------------------------------------------- */
    /* Profil                                                          */
    /* -------------------------------------------------------------- */

    socket.on('profile:update', (payload, ack) =>
      limited(ack, () => {
        const parsed = profileSchema.safeParse(payload);
        if (!parsed.success) return fail('INVALID_PAYLOAD');
        users.updateProfile(userId, parsed.data.pseudo, parsed.data.avatar);
        const room = myRoom();
        room?.apply({
          type: 'UPDATE_PROFILE',
          playerId: userId,
          pseudo: parsed.data.pseudo,
          avatar: parsed.data.avatar,
        });
        return { ok: true };
      }),
    );

    socket.on('disconnect', () => {
      /*
       * On se décroche de la table que ce socket regardait, et d'elle seule.
       *
       * La version précédente balayait `gamesOf(userId)`, qui **exclut les
       * parties terminées** : un onglet resté sur l'écran de fin n'était jamais
       * détaché, et la table gardait son socket mort à vie — elle continuait à
       * compter un joueur connecté, donc n'était jamais balayée, donc restait
       * en mémoire et en base. Une soirée de parties finies suffisait à faire
       * grossir le processus sans rien qui puisse le faire redescendre.
       */
      const code = socket.data.roomCode as string | undefined;
      if (code) rooms.get(code)?.detach(userId, socket);
    });
  });
}
