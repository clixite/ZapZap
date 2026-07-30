import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@zapzap/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/**
 * La connexion temps réel, unique pour toute l'application.
 *
 * Elle n'est pas recréée d'un écran à l'autre : reconnecter à chaque navigation
 * ferait perdre sa place à table le temps du rétablissement, et le serveur
 * verrait un joueur partir puis revenir à chaque clic.
 */
export function connectSocket(token: string): GameSocket {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    // Un téléphone qui change de réseau doit réessayer sans se décourager :
    // c'est la situation normale, pas une panne.
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  return socket;
}

export function getSocket(): GameSocket | null {
  return socket;
}

/**
 * Un appel avec accusé de réception, en promesse.
 *
 * Le délai n'est pas une précaution de style : sans lui, un paquet perdu laisse
 * un bouton qui tourne indéfiniment, et le joueur ne sait pas si son coup est
 * passé.
 */
export function request<T>(event: keyof ClientToServerEvents, payload?: unknown, timeoutMs = 8_000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const current = socket;
    if (!current) {
      resolve({ ok: false, error: { code: 'INVALID_TOKEN', message: 'Pas de connexion au serveur.' } });
      return;
    }
    let settled = false;
    const done = (res: Ack<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timer = setTimeout(
      () => done({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Le serveur ne répond pas.' } }),
      timeoutMs,
    );

    if (payload === undefined) (current as unknown as { emit: Function }).emit(event, done);
    else (current as unknown as { emit: Function }).emit(event, payload, done);
  });
}
