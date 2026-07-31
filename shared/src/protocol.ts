import type { EngineErrorCode } from './engine';
import type { ZapVariants } from './rules';
import type { Card, CardId, Combo, GamePace, GameView, OpenTable, RoundEvent, Visibility } from './types';

export type ErrorCode =
  | EngineErrorCode
  | 'ROOM_NOT_FOUND'
  | 'GAME_ALREADY_STARTED'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'NO_OPEN_TABLE'
  | 'TOO_MANY_ROOMS'
  | 'RATE_LIMITED'
  | 'INVALID_TOKEN'
  | 'INVALID_PAYLOAD'
  /*
   * Les deux seuls codes que le serveur n'émet jamais : ils décrivent son
   * silence. Le client fabrique lui-même l'accusé de réception quand la
   * demande n'aboutit pas — sans eux, une absence de réponse se déguisait en
   * `INVALID_PAYLOAD`, et le joueur lisait « requête invalide » là où sa
   * connexion avait simplement lâché.
   */
  | 'TIMEOUT'
  | 'OFFLINE';

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type Ack<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: ProtocolError };

/** Événements transitoires, pour les animations et les annonces vocales. */
export type TransientEvent =
  | { type: 'player-joined'; playerId: string; pseudo: string }
  | { type: 'player-left'; playerId: string; pseudo: string }
  | { type: 'dealt'; dealerId: string; handSize: number }
  | { type: 'discarded'; playerId: string; combo: Combo }
  | { type: 'drew-stock'; playerId: string }
  | { type: 'drew-discard'; playerId: string; card: Card }
  | { type: 'zap-called'; playerId: string; success: boolean }
  | { type: 'player-eliminated'; playerId: string }
  | { type: 'round-scored' }
  | { type: 'player-disconnected'; playerId: string; graceSeconds: number }
  | { type: 'player-reconnected'; playerId: string }
  /** Mise en pause : un robot prend la main jusqu'au retour du joueur. */
  | { type: 'player-away'; playerId: string; away: boolean }
  | { type: 'host-changed'; hostId: string }
  | { type: 'rematch'; code: string }
  | { type: 'emote'; playerId: string; emote: EmoteId };

/**
 * Réactions envoyables à la table.
 *
 * Une liste courte et fermée : elle se traduit toute seule, ne demande aucune
 * modération, et ne peut pas servir de messagerie détournée — ce qui compte
 * d'autant plus sur les tables publiques, où l'on joue avec des inconnus.
 */
export const EMOTES = ['clap', 'slap', 'kiss', 'laugh', 'cry', 'fire', 'think', 'wow'] as const;
export type EmoteId = (typeof EMOTES)[number];

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && (EMOTES as readonly string[]).includes(value);
}

export interface ClientToServerEvents {
  'room:create': (ack: (res: Ack<{ code: string }>) => void) => void;
  'room:join': (payload: { code: string }, ack: (res: Ack<{ code: string }>) => void) => void;
  /**
   * Partie rapide : on s'assoit à une table publique en attente, ou on en ouvre
   * une. C'est ce qui permet de jouer sans connaître personne.
   */
  'room:quickMatch': (ack: (res: Ack<{ code: string; created: boolean }>) => void) => void;
  /** Les tables publiques qui attendent des joueurs. */
  'room:openTables': (ack: (res: Ack<{ tables: OpenTable[] }>) => void) => void;
  'room:leave': (ack: (res: Ack) => void) => void;
  /**
   * Quitter pour de bon, partie commencée comprise.
   *
   * `room:leave` rend le siège au salon, mais une fois la partie lancée il ne
   * fait que marquer absent : la table continuait d'attendre un joueur qui ne
   * reviendrait pas. Celui-ci sort vraiment.
   */
  'room:forfeit': (ack: (res: Ack) => void) => void;
  /** Mettre sa place en pause, ou la reprendre : un robot joue l'intervalle. */
  'game:away': (payload: { away: boolean }, ack: (res: Ack) => void) => void;
  'room:kick': (payload: { playerId: string }, ack: (res: Ack) => void) => void;
  'room:addBot': (ack: (res: Ack<{ playerId: string }>) => void) => void;
  'room:removeBot': (payload: { playerId: string }, ack: (res: Ack) => void) => void;
  'room:setVariants': (payload: { variants: ZapVariants }, ack: (res: Ack) => void) => void;
  'room:setPace': (payload: { pace: GamePace }, ack: (res: Ack) => void) => void;
  'room:setVisibility': (payload: { visibility: Visibility }, ack: (res: Ack) => void) => void;
  'room:setGroup': (payload: { groupId: string | null }, ack: (res: Ack) => void) => void;
  'room:rematch': (ack: (res: Ack<{ code: string }>) => void) => void;
  'game:start': (ack: (res: Ack) => void) => void;
  /** Le donneur fixe la taille des mains, la même pour toute la table. */
  'game:deal': (payload: { handSize: number }, ack: (res: Ack) => void) => void;
  'game:discard': (payload: { cardIds: CardId[] }, ack: (res: Ack) => void) => void;
  'game:draw': (
    payload: { source: 'stock' } | { source: 'discard'; cardId: CardId },
    ack: (res: Ack) => void,
  ) => void;
  'game:zap': (ack: (res: Ack) => void) => void;
  'game:nextRound': (ack: (res: Ack) => void) => void;
  /**
   * Le journal public de la manche en cours, à la demande.
   *
   * Il ne suit plus la vue : cumulatif et renvoyé à chaque coup, il pesait à lui
   * seul les trois quarts du trafic d'une partie. L'écran des cartes passées le
   * demande à son ouverture — c'est le seul moment où quiconque le lit.
   */
  'game:log': (ack: (res: Ack<{ log: RoundEvent[] }>) => void) => void;
  'profile:update': (payload: { pseudo: string; avatar: string }, ack: (res: Ack) => void) => void;
  'game:emote': (payload: { emote: EmoteId }, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'game:view': (view: GameView) => void;
  'game:event': (event: TransientEvent) => void;
  'room:closed': (payload: { reason: string }) => void;
}
