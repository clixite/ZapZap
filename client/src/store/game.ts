import { create } from 'zustand';
import type { GameView, TransientEvent } from '@zapzap/shared';
import { getSocket, request } from '../socket';

interface GameStore {
  view: GameView | null;
  /** Dernier message d'erreur à montrer au joueur, effacé dès qu'il agit. */
  error: string | null;
  /** Un coup est parti, on attend la réponse : sert à figer les boutons. */
  busy: boolean;
  lastEvent: TransientEvent | null;

  listen: () => () => void;
  setError: (error: string | null) => void;
  send: (event: Parameters<typeof request>[0], payload?: unknown) => Promise<boolean>;
  clear: () => void;
}

/**
 * L'état de la partie, tel que le serveur le dit.
 *
 * Il n'y a délibérément aucune logique de jeu ici : le client affiche la vue
 * qu'on lui envoie et transmet les intentions. Recalculer côté client ce que le
 * serveur arbitre déjà, c'est se garantir deux vérités qui finiront par diverger
 * — et donner au joueur l'impression d'un coup refusé sans raison.
 */
export const useGame = create<GameStore>((set) => ({
  view: null,
  error: null,
  busy: false,
  lastEvent: null,

  listen: () => {
    const socket = getSocket();
    if (!socket) return () => {};

    const onView = (view: GameView) => set({ view });
    const onEvent = (event: TransientEvent) => set({ lastEvent: event });
    const onClosed = ({ reason }: { reason: string }) => set({ view: null, error: reason });

    socket.on('game:view', onView);
    socket.on('game:event', onEvent);
    socket.on('room:closed', onClosed);
    return () => {
      socket.off('game:view', onView);
      socket.off('game:event', onEvent);
      socket.off('room:closed', onClosed);
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

  clear: () => set({ view: null, error: null, lastEvent: null }),
}));
