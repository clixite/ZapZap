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
  INVALID_TOKEN: 'Session expirée, rechargez la page.',
  INVALID_PAYLOAD: 'Requête invalide.',
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

export interface HandlerDeps {
  io: Server;
  rooms: RoomManager;
  users: UsersRepo;
}

export function registerHandlers({ io, rooms, users }: HandlerDeps): void {
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

    /** La table où ce joueur est assis, s'il y en a une. */
    const myRoom = (): Room | undefined => {
      for (const game of rooms.gamesOf(userId)) {
        const room = rooms.get(game.code);
        if (room) return room;
      }
      return undefined;
    };

    const profile = (): Pick<Player, 'id' | 'pseudo' | 'avatar'> & { photo?: string | null } => {
      const user = users.get(userId)!;
      return { id: user.id, pseudo: user.pseudo, avatar: user.avatar, photo: user.photo };
    };

    /* -------------------------------------------------------------- */
    /* Salon                                                           */
    /* -------------------------------------------------------------- */

    socket.on('room:create', (ack) =>
      reply(ack, () => {
        const room = rooms.create(profile());
        room.attach(userId, socket);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:join', (payload, ack) =>
      reply(ack, () => {
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
        room.attach(userId, socket);
        return { ok: true, code: room.code };
      }),
    );

    socket.on('room:quickMatch', (ack) =>
      reply(ack, () => {
        const existing = myRoom();
        if (existing) {
          existing.attach(userId, socket);
          return { ok: true, code: existing.code, created: false };
        }
        const { room, created } = rooms.quickMatch(profile());
        if (!created) room.emitEvent({ type: 'player-joined', playerId: userId, pseudo: profile().pseudo });
        room.attach(userId, socket);
        return { ok: true, code: room.code, created };
      }),
    );

    socket.on('room:openTables', (ack) => reply(ack, () => ({ ok: true, tables: rooms.openTables() })));

    socket.on('room:leave', (ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        room.leave(userId, socket);
        return { ok: true };
      }),
    );

    socket.on('room:addBot', (ack) =>
      reply(ack, () => {
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
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        const playerId = (payload as { playerId?: unknown } | undefined)?.playerId;
        if (typeof playerId !== 'string') return fail('INVALID_PAYLOAD');
        room.removePlayer(playerId);
        return { ok: true };
      }),
    );

    socket.on('room:kick', (payload, ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        if (room.state.hostId !== userId) return fail('NOT_HOST');
        const playerId = (payload as { playerId?: unknown } | undefined)?.playerId;
        if (typeof playerId !== 'string' || playerId === userId) return fail('INVALID_PAYLOAD');
        room.removePlayer(playerId);
        return { ok: true };
      }),
    );

    /* -------------------------------------------------------------- */
    /* Réglages de la table                                            */
    /* -------------------------------------------------------------- */

    socket.on('room:setVariants', (payload, ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const variants = (payload as { variants?: unknown } | undefined)?.variants;
        if (!isZapVariants(variants)) return fail('ILLEGAL_VARIANT');
        const result = room.apply({ type: 'SET_VARIANTS', playerId: userId, variants });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:setPace', (payload, ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const pace = (payload as { pace?: unknown } | undefined)?.pace;
        if (!isGamePace(pace)) return fail('ILLEGAL_VARIANT');
        const result = room.apply({ type: 'SET_PACE', playerId: userId, pace });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('room:setVisibility', (payload, ack) =>
      reply(ack, () => {
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
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'START_GAME', playerId: userId });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('game:deal', (payload, ack) =>
      reply(ack, () => {
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
      reply(ack, () => {
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
      reply(ack, () => {
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
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'CALL_ZAP', playerId: userId });
        if (!result.ok) return fail(result.error);
        const call = room.state.round!.zapCall!;
        room.emitEvent({ type: 'zap-called', playerId: userId, success: call.success });
        for (const player of room.state.players.filter((p) => p.eliminated && p.finishRank !== undefined)) {
          room.emitEvent({ type: 'player-eliminated', playerId: player.id });
        }
        return { ok: true };
      }),
    );

    socket.on('game:nextRound', (ack) =>
      reply(ack, () => {
        const room = myRoom();
        if (!room) return fail('NOT_IN_ROOM');
        const result = room.apply({ type: 'NEXT_ROUND', playerId: userId });
        return result.ok ? { ok: true } : fail(result.error);
      }),
    );

    socket.on('game:emote', (payload, ack) =>
      reply(ack, () => {
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
      reply(ack, () => {
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
      for (const game of rooms.gamesOf(userId)) rooms.get(game.code)?.detach(userId, socket);
    });
  });
}
