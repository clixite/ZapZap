import { useEffect } from 'react';
import { create } from 'zustand';
import type { CardId, GameView, TransientEvent } from '@zapzap/shared';
import { getSocket, request } from '../socket';
import { applyPending, type Pending } from './optimistic';
import { useSession } from './session';

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
  /**
   * La table où l'on veut être assis, indépendamment de ce qu'on a déjà reçu.
   *
   * Elle existe parce que l'intention précède la vue : au chargement direct de
   * `/table/ABCD`, on sait où l'on va bien avant que le serveur n'ait envoyé
   * quoi que ce soit. Sans elle, une connexion établie après le premier essai
   * de `room:join` ne pouvait pas savoir quoi rejoindre.
   */
  wantedCode: string | null;
  /**
   * La table dont on vient d'être sorti — exclusion, table close, départ.
   *
   * Contrepoids indispensable à `wantedCode` : dès lors que l'application sait
   * se rasseoir toute seule, il faut lui dire une fois où ne pas se rasseoir.
   * Sinon l'exclusion ne tient pas trois secondes — l'écran voit qu'il n'a plus
   * de vue et redemande poliment sa place.
   */
  denied: string | null;

  /** La vue à afficher : celle du serveur, plus le coup en vol. */
  view: () => GameView | null;

  listen: () => () => void;
  /** Rejoindre une table et s'en souvenir, pour pouvoir y revenir seul. */
  join: (code: string) => Promise<boolean>;
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
  wantedCode: null,
  denied: null,

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
      set({
        serverView: null,
        pending: null,
        error: reason,
        wantedCode: null,
        denied: get().serverView?.code ?? get().wantedCode ?? null,
      });
    /**
     * Connexion établie : on se rassoit d'office à la table.
     *
     * Deux situations, une seule réponse. La coupure réseau d'abord : sans cet
     * appel, l'écran restait figé sur la dernière vue reçue et le serveur ne
     * nous comptait plus à la table. Le **chargement direct** ensuite —
     * rouvrir l'application sur `/table/ABCD`, recharger la page, suivre un
     * lien d'invitation : l'écran demandait à rejoindre avant que la session
     * n'ait produit une connexion, la demande partait dans le vide et rien ne
     * la relançait. On repartait donc de « Pas de connexion au serveur » sans
     * aucune issue. C'est `wantedCode` qui permet de rattraper les deux, la
     * vue reçue n'étant plus la seule mémoire de l'endroit où l'on va.
     *
     * Rejoindre est idempotent côté serveur : membre, on est simplement
     * rattaché et on reçoit une vue fraîche.
     */
    const onReconnect = () => {
      const code = get().wantedCode ?? get().serverView?.code;
      if (code) void get().join(code);
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

  join: async (code) => {
    set({ wantedCode: code, denied: null });
    return get().send('room:join', { code });
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

  clear: () =>
    set({ serverView: null, pending: null, error: null, lastEvent: null, wantedCode: null, denied: null }),
}));

/**
 * Brancher l'écoute de la partie — et la rebrancher quand la connexion arrive.
 *
 * `listen` ne peut s'abonner qu'à une connexion existante. Or au **chargement
 * direct** d'un écran de partie, la session est encore en train de valider le
 * jeton : la connexion n'existe pas, `listen` ne s'abonne à rien, et comme il
 * ne se rejouait qu'une fois, il ne s'abonnait jamais. L'écran restait sur
 * « Connexion à la table… » alors que tout, en dessous, fonctionnait — les vues
 * arrivaient bien, personne ne les écoutait.
 *
 * Réabonner à chaque bascule de connexion règle le cas de départ comme celui de
 * la coupure, et le désabonnement du rendu précédent évite les doublons.
 */
export function useGameChannel(): void {
  const listen = useGame((s) => s.listen);
  const connected = useSession((s) => s.connected);
  useEffect(() => listen(), [listen, connected]);
}

/** Raccourci de lecture : la vue affichée, réactive. */
export function useView(): GameView | null {
  const serverView = useGame((s) => s.serverView);
  const pending = useGame((s) => s.pending);
  return serverView ? applyPending(serverView, pending) : null;
}

export type { CardId };
