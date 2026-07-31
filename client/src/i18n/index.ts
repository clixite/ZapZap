import { useSyncExternalStore } from 'react';
import { fr } from './locales/fr';
import { DEFAULT_LOCALE, isLocale, type Locale, type Messages } from './types';

export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isLocale } from './types';
export type { Locale, Messages } from './types';

const STORAGE_KEY = 'zapzap.locale';

/**
 * Chaque langue est un module chargé à la demande : on n'embarque pas les
 * 24 traductions dans le fichier principal. Le français, lui, est inclus
 * d'office — il sert de secours immédiat le temps du chargement.
 */
// `import: 'default'` : chaque module de langue est résolu directement sur sa
// traduction, sans passer par un objet intermédiaire.
const loaders = import.meta.glob<Messages>('./locales/*.ts', { import: 'default' });

const loaded = new Map<Locale, Messages>([['fr', fr]]);
const listeners = new Set<() => void>();
let current: Locale = 'fr';
let messages: Messages = fr;

function notify(): void {
  listeners.forEach((cb) => cb());
}

/**
 * Langue à utiliser au premier lancement : on suit les préférences du
 * téléphone, dans l'ordre déclaré par l'utilisateur, et on retient la
 * première que l'application sait parler.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    if (!tag) continue;
    // « fr-BE » ou « pt-PT » : seule la partie principale nous intéresse
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Langue retenue par l'utilisateur, sinon celle de son appareil. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLocale(saved)) return saved;
  } catch {
    // stockage indisponible : on retombe sur la détection
  }
  return detectLocale();
}

/** L'utilisateur a-t-il déjà choisi explicitement sa langue ? */
export function hasChosenLocale(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null && isLocale(saved);
  } catch {
    return false;
  }
}

async function load(locale: Locale): Promise<Messages> {
  const cached = loaded.get(locale);
  if (cached) return cached;
  const loader = loaders[`./locales/${locale}.ts`];
  if (!loader) return fr;
  try {
    const msgs = await loader();
    loaded.set(locale, msgs);
    return msgs;
  } catch {
    // Traduction absente ou illisible : on garde une interface fonctionnelle
    return fr;
  }
}

/**
 * Change la langue de l'interface.
 * `persist: false` sert à prévisualiser sans enregistrer le choix.
 */
export async function setLocale(locale: Locale, persist = true): Promise<void> {
  const msgs = await load(locale);
  current = locale;
  messages = msgs;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // sans stockage, le choix vaut pour la session
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  notify();
}

/** Applique la langue initiale au démarrage de l'application. */
export function initI18n(): Promise<void> {
  return setLocale(initialLocale(), hasChosenLocale());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getMessages(): Messages {
  return messages;
}

function getLocale(): Locale {
  return current;
}

/** Textes de l'interface dans la langue courante. */
export function useT(): Messages {
  return useSyncExternalStore(subscribe, getMessages, getMessages);
}

/** Langue courante (pour les sélecteurs et l'affichage). */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Accès hors composant (store, service worker, utilitaires). */
export function t(): Messages {
  return messages;
}
