import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

/**
 * La mise à jour de l'application.
 *
 * En `autoUpdate`, le service worker remplaçait les fichiers dès qu'une
 * nouvelle version était publiée — y compris au beau milieu d'une manche, avec
 * le risque d'un client à moitié ancien, à moitié nouveau. On passe en mode
 * manuel : la nouvelle version attend, un bandeau la propose, et c'est le
 * joueur qui choisit le moment de recharger.
 */
interface PwaState {
  updateReady: boolean;
  /** Recharge sur la nouvelle version. */
  apply: () => void;
}

let doUpdate: ((reload?: boolean) => Promise<void>) | undefined;

export const usePwa = create<PwaState>(() => ({
  updateReady: false,
  apply: () => {
    void doUpdate?.(true);
  },
}));

export function initPwa(): void {
  if (typeof window === 'undefined') return;
  doUpdate = registerSW({
    onNeedRefresh() {
      usePwa.setState({ updateReady: true });
    },
  });
}
