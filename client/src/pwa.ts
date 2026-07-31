import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

/**
 * La mise à jour de l'application.
 *
 * Une PWA installée ne se met pas à jour comme un site : le service worker sert
 * les fichiers déjà en cache, et une nouvelle version peut rester ignorée
 * pendant des jours. Deux règles règlent la question :
 *
 *  1. **On cherche une nouvelle version à chaque ouverture.** Le navigateur ne
 *     le fait de lui-même qu'au chargement initial du service worker ; sur un
 *     téléphone, l'application n'est presque jamais rechargée — elle est
 *     rouverte. On interroge donc le serveur à chaque retour au premier plan.
 *  2. **On l'applique tout seul, sauf en pleine partie.** Recharger est
 *     instantané et le joueur n'a rien à décider : ce n'est pas un choix, c'est
 *     un détail d'installation. La seule exception est la manche en cours — un
 *     rechargement y ferait perdre la sélection de cartes et le tour de jeu —,
 *     auquel cas la version attend, et part d'elle-même à la fin de la partie.
 *
 * Le mode `prompt` du plugin est conservé exprès : c'est lui qui laisse
 * l'application décider *quand* basculer. En `autoUpdate`, les fichiers
 * changeraient sous les pieds du joueur au milieu d'une manche.
 */
interface PwaState {
  /** Une nouvelle version est téléchargée et attend un rechargement. */
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
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      /*
       * Chercher une nouvelle version à chaque ouverture.
       *
       * `update()` va interroger le serveur pour le script du service worker ;
       * s'il a changé, l'installation démarre et `onNeedRefresh` suit. L'appel
       * est bon marché — une requête conditionnelle — et il est le seul moyen
       * de découvrir une publication sans que le joueur ait rechargé la page.
       */
      const look = () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      };
      look();
      document.addEventListener('visibilitychange', look);
      // Et pendant les longues sessions ouvertes, un contrôle horaire : une
      // table qui reste ouverte tout un après-midi doit finir par se mettre à
      // jour elle aussi.
      setInterval(look, 60 * 60_000);
    },
  });
}
