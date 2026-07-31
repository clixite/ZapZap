import { useEffect, useState } from 'react';
import { locale as currentLocale } from './i18n';
import { storedToken } from './api';

/**
 * S'abonner aux notifications « c'est à vous ».
 *
 * Deux principes qui décident de tout le reste :
 *
 *  1. **L'autorisation se demande après avoir expliqué pourquoi.** Un navigateur
 *     ne pose la question qu'une fois : demander à l'ouverture, avant que le
 *     joueur ne sache ce que l'application fait, c'est se faire refuser
 *     définitivement par la moitié des gens. La demande part donc d'un bouton,
 *     dans le profil, sous une phrase qui dit à quoi ça sert.
 *  2. **Le refus n'est pas une panne.** Tout ici échoue en silence : pas de
 *     service worker, permission refusée, service de push injoignable — le jeu
 *     fonctionne exactement pareil, il faut simplement rouvrir l'application
 *     pour voir son tour arriver.
 */

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function pushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushState;
}

/**
 * La clé publique du serveur, en octets — c'est ce que `subscribe` attend.
 *
 * Le type de retour est explicite : `Uint8Array.from` produit un tableau adossé
 * à un `ArrayBufferLike`, que TypeScript refuse là où la spécification exige un
 * `ArrayBuffer`. On alloue donc le tampon nous-mêmes.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function post(path: string, body: unknown): Promise<boolean> {
  const token = storedToken();
  if (!token) return false;
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Demande l'autorisation puis enregistre l'appareil.
 *
 * Rend `true` seulement si tout a abouti : l'appelant peut donc afficher un
 * état franc — abonné ou pas — sans avoir à deviner.
 */
export async function enablePush(): Promise<boolean> {
  if (pushState() === 'unsupported') return false;

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const res = await fetch('/api/push/key');
    if (!res.ok) return false;
    const { key } = (await res.json()) as { key: string };

    // Un abonnement existant est réutilisé : en redemander un second au même
    // navigateur échoue si la clé du serveur a changé, et le message d'erreur
    // n'apprendrait rien au joueur.
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Obligatoire depuis Chrome 52 : on ne peut pas envoyer de notification
        // silencieuse, et c'est tant mieux.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));

    return await post('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      locale: currentLocale(),
    });
  } catch {
    return false;
  }
}

/** Coupe les notifications sur cet appareil, des deux côtés. */
export async function disablePush(): Promise<void> {
  if (pushState() === 'unsupported') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await post('/api/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch {
    /* rien à couper, ou navigateur qui refuse : sans conséquence */
  }
}

/** Cet appareil est-il déjà abonné ? */
export async function isSubscribed(): Promise<boolean> {
  if (pushState() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/** L'état de l'abonnement, suivi pour un écran de réglages. */
export function usePushSubscription(): { state: PushState; subscribed: boolean; refresh: () => void } {
  const [state, setState] = useState<PushState>(pushState);
  const [subscribed, setSubscribed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState(pushState());
    void isSubscribed().then((yes) => alive && setSubscribed(yes));
    return () => {
      alive = false;
    };
  }, [tick]);

  return { state, subscribed, refresh: () => setTick((t) => t + 1) };
}
