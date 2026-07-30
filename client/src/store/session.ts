import { create } from 'zustand';
import type { PublicUser } from '@zapzap/shared';
import { clearToken, createGuest, fetchMe, storeToken, storedToken } from '../api';
import { connectSocket } from '../socket';

const AVATARS = ['⚡', '🌩️', '🔥', '❄️', '🌊', '🍀', '🎲', '🐙', '🦊', '🐺', '🦅', '🐉'] as const;

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export const AVATAR_CHOICES = AVATARS;

interface SessionState {
  user: PublicUser | null;
  /** `true` tant qu'on n'a pas tranché entre « connecté » et « à créer ». */
  loading: boolean;
  connected: boolean;
  restore: () => Promise<void>;
  signIn: (pseudo: string, avatar: string) => Promise<void>;
  setConnected: (connected: boolean) => void;
}

/**
 * Qui joue.
 *
 * L'identité est délibérément légère : un pseudo et un avatar, gardés dans un
 * jeton sur l'appareil. Demander une inscription pour une partie de cartes
 * entre amis, c'est perdre la moitié de la table avant le premier coup.
 */
export const useSession = create<SessionState>((set, get) => ({
  user: null,
  loading: true,
  connected: false,

  restore: async () => {
    const token = storedToken();
    if (!token) {
      set({ loading: false });
      return;
    }
    const user = await fetchMe(token).catch(() => null);
    if (!user) {
      // Jeton expiré ou base repartie de zéro : on repart proprement plutôt que
      // de laisser l'application dans un état à moitié connecté.
      clearToken();
      set({ loading: false });
      return;
    }
    attach(token, set);
    set({ user, loading: false });
  },

  signIn: async (pseudo, avatar) => {
    const { token, user } = await createGuest(pseudo, avatar);
    storeToken(token);
    attach(token, set);
    set({ user, loading: false });
  },

  setConnected: (connected) => {
    if (get().connected !== connected) set({ connected });
  },
}));

function attach(token: string, set: (partial: Partial<SessionState>) => void): void {
  const socket = connectSocket(token);
  set({ connected: socket.connected });
  socket.on('connect', () => set({ connected: true }));
  socket.on('disconnect', () => set({ connected: false }));
}
