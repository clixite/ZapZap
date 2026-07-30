import { useEffect } from 'react';

/**
 * Garde l'écran allumé pendant la partie.
 *
 * Regarder les autres jouer, c'est ne pas toucher son téléphone — et sans
 * verrou, l'écran s'éteint au milieu de la manche. Le verrou est relâché par
 * le système au passage en arrière-plan : on le redemande au retour.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let alive = true;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Batterie faible ou permission refusée : le jeu continue, l'écran
        // suivra le réglage du téléphone.
      }
    };

    const onVisible = () => {
      if (alive && document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
