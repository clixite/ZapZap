import { create } from 'zustand';
import type { CardId, GameView, TransientEvent } from '@zapzap/shared';
import { getSocket, request } from '../socket';
import { applyPending, type Pending } from './optimistic';

interface GameStore {
  /** La vue du serveur, brute. Les écrans lisent `view()`. */
  serverView: GameView | null;
  /** Le coup parti mais pas encore confirmé. */
  pending: Pending;
  /** Dernier message d'erreur à montrer au joueur, effacé dès qu'il agit. */
  error: string | null;
  /** Un coup est parti, on attend la réponse : sert à figer les boutons. */
  busy: boolean;
  lastEvent: TransientEvent | null;

  /** La vue à afficher : celle du serveur, plus le coup en vol. */
  view: () => GameView | null;

  listen: () => () => void;
  setError: (error: string | null) => void;
  send: (event: Parameters<typeof request>[0], payload?: unknown) => Promise<boolean>;
  /** Un coup de jeu, montré immédiatement puis confirmé (ou repris) par le serveur. */
  play: (event: Parameters<typeof request>[0], payload: unknown, pending: Pending) => Promise<boolean>;
  clear: () => void;
}

/**
 * L'état de la partie, tel que le serveur le dit.
 *
 * Il n'y a délibérément aucune logique de jeu ici : le client affiche la vue
 * qu'on lui envoie et transmet les intentions. Recalculer côté client ce que le
 * serveur arbitre déjà, c'est se garantir deux vérités qui finiront par diverger
 * — et donner au joueur l'impression d'un coup refusé sans raison.
 *
 * La seule liberté prise est d'avance, pas d'autorité : `pending` montre
 * immédiatement un coup que le serveur a déjà déclaré légal, et la première vue
 * reçue l'efface. Voir `optimistic.ts`.
 */
export const useGame = create<GameStore>((set, get) => ({
  serverView: null,
  pending: null,
  error: null,
  busy: false,
  lastEvent: null,

  view: () => {
    const { serverView, pending } = get();
    return serverView ? applyPending(serverView, pending) : null;
  },

  listen: () => {
    const socket = getSocket();
    if (!socket) return () => {};

    // Toute vue serveur fait autorité : le coup en vol a atterri.
    const onView = (view: GameView) => set({ serverView: view, pending: null });
    const onEvent = (event: TransientEvent) => {
      set({ lastEvent: event });
      // La revanche bascule toute la table : l'hôte a ouvert une nouvelle
      // partie, chacun la rejoint de lui-même en entendant l'événement.
      if (event.type === 'rematch') void get().send('room:join', { code: event.code });
    };
    const onClosed = ({ reason }: { reason: string }) =>
      set({ serverView: null, pending: null, error: reason });
    /**
     * Reconnexion : on se rassoit d'office à la table.
     *
     * Sans cet appel, une coupure réseau laissait l'écran figé sur la dernière
     * vue reçue — la vue n'étant jamais remise à zéro, l'effet « rejoindre si
     * pas de vue » des écrans ne se redéclenchait pas, et le serveur ne nous
     * comptait plus à la table. Rejoindre est idempotent côté serveur : membre,
     * on est simplement rattaché et on reçoit une vue fraîche.
     */
    const onReconnect = () => {
      const view = get().serverView;
      if (view) void get().send('room:join', { code: view.code });
    };

    socket.on('game:view', onView);
    socket.on('game:event', onEvent);
    socket.on('room:closed', onClosed);
    socket.on('connect', onReconnect);
    return () => {
      socket.off('game:view', onView);
      socket.off('game:event', onEvent);
      socket.off('room:closed', onClosed);
      socket.off('connect', onReconnect);
    };
  },

  setError: (error) => set({ error }),

  send: async (event, payload) => {
    set({ busy: true, error: null });
    const ack = await request(event, payload);
    set({ busy: false });
    if (!ack.ok) {
      set({ error: ack.error.message });
      return false;
    }
    return true;
  },

  play: async (event, payload, pending) => {
    // On montre d'abord, on demande ensuite : le geste doit répondre au doigt.
    set({ pending, error: null, busy: true });
    const ack = await request(event, payload);
    set({ busy: false });
    if (!ack.ok) {
      // Refusé : on remet la vue du serveur telle quelle et on dit pourquoi.
      // Le cas est rare — le coup venait de la liste des coups légaux — mais il
      // existe : minuteur expiré, tour passé entre-temps.
      set({ pending: null, error: ack.error.message });
      return false;
    }
    // On ne vide pas `pending` ici : la vue serveur qui suit s'en charge, et
    // l'effacer avant son arrivée ferait clignoter la carte à sa place initiale.
    return true;
  },

  clear: () => set({ serverView: null, pending: null, error: null, lastEvent: null }),
}));

/** Raccourci de lecture : la vue affichée, réactive. */
export function useView(): GameView | null {
  const serverView = useGame((s) => s.serverView);
  const pending = useGame((s) => s.pending);
  return serverView ? applyPending(serverView, pending) : null;
}

export type { CardId };
