import { useSyncExternalStore } from 'react';

/**
 * Ajouter ZapZap à l'écran d'accueil.
 *
 * Ce n'est pas un confort : c'est **la seule façon d'avoir le jeu en plein
 * écran**. Un lien ouvert depuis WhatsApp s'ouvre dans le navigateur, avec sa
 * barre d'adresse en haut et sa barre d'outils en bas — soit près d'un sixième
 * de la hauteur perdue, sur un écran où l'on doit voir six sièges, la pioche,
 * la défausse et sa main. Lancée depuis l'icône, la même application occupe
 * tout l'écran. Aucune API ne permet de forcer le plein écran depuis un lien,
 * ni sur iOS ni sur Android : passer par l'icône est le chemin, et le rôle de
 * ce module est de le proposer au bon moment.
 *
 * Les deux plateformes ne se ressemblent pas du tout :
 *
 *  - **Android / Chrome** donne une vraie API. Le navigateur décide que le site
 *    est installable et émet `beforeinstallprompt` ; on le retient, et le
 *    bouton déclenche la boîte de dialogue native du système ;
 *  - **iOS / Safari** n'a *rien*. Apple n'expose aucune API d'installation :
 *    le seul chemin est Partager → « Sur l'écran d'accueil », à la main. Tout
 *    ce qu'on peut faire est de l'expliquer, au bon endroit, avec le bon
 *    pictogramme — et de se taire dès que c'est fait.
 */

/** L'événement de Chrome, absent des types du DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallKind =
  /** Chrome nous a donné la main : un bouton suffit. */
  | 'prompt'
  /** iOS : rien à déclencher, seulement à expliquer. */
  | 'ios'
  /** Déjà installée, ou navigateur sans installation : on se tait. */
  | null;

const DISMISS_KEY = 'zapzap.install.dismissed';
/**
 * Trente jours avant de reproposer.
 *
 * Un refus n'est pas définitif — on change de téléphone, on prend goût au jeu.
 * Mais reproposer à la session suivante, c'est du harcèlement : c'est le défaut
 * qui fait désinstaller. Un mois est la distance qui rend la deuxième demande
 * acceptable.
 */
const DISMISS_MS = 30 * 24 * 60 * 60_000;

let deferred: BeforeInstallPromptEvent | null = null;
let kind: InstallKind = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

/**
 * Sommes-nous déjà lancés depuis l'icône ?
 *
 * Deux tests parce que les deux plateformes répondent différemment :
 * `display-mode` est la question standard, `navigator.standalone` est la
 * réponse d'Apple, qui n'implémente toujours pas la première pour les PWA
 * installées.
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneNav = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    standaloneNav ||
    ['fullscreen', 'standalone', 'minimal-ui'].some(
      (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
    )
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // `MacIntel` + écran tactile : c'est un iPad sous iPadOS, qui se déclare Mac
  // depuis iPadOS 13 et passait donc entre les mailles du filet.
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Sommes-nous dans un navigateur qui sait ajouter à l'écran d'accueil ?
 *
 * Sur iOS, « Sur l'écran d'accueil » n'existe que dans Safari. Les navigateurs
 * embarqués — celui de WhatsApp, de Messenger, d'Instagram — n'ont pas cette
 * entrée dans leur menu de partage, et c'est précisément d'eux qu'arrivent nos
 * joueurs, par le lien d'invitation. Leur expliquer un geste impossible serait
 * pire que de se taire : on ne dit rien, et la bannière reviendra quand ils
 * ouvriront le lien dans Safari.
 */
function isRealSafari(): boolean {
  const ua = navigator.userAgent;
  if (/FxiOS|CriOS|EdgiOS|OPiOS/.test(ua)) return false;
  // Les navigateurs embarqués n'annoncent pas « Safari » dans leur signature.
  return /Safari/.test(ua);
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/** Le joueur a dit non : on range la bannière et on n'y revient pas de sitôt. */
export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // sans stockage, le refus ne vaut que pour cette session
  }
  kind = null;
  notify();
}

/** Déclenche la boîte de dialogue native. Rend `true` si l'installation est acceptée. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  // Un `beforeinstallprompt` ne se rejoue pas : une fois consommé, il est mort,
  // qu'on ait accepté ou refusé. On le libère avant d'attendre la réponse.
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') {
    kind = null;
  } else {
    dismissInstall();
  }
  notify();
  return outcome === 'accepted';
}

export function initInstall(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Sans ce `preventDefault`, Chrome affiche sa propre mini-barre en bas de
    // l'écran : elle recouvre la main du joueur et ne se laisse pas placer.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    if (!isInstalled() && !dismissedRecently()) {
      kind = 'prompt';
      notify();
    }
  });

  // Installée depuis la bannière, ou par le menu du navigateur : dans les deux
  // cas il n'y a plus rien à proposer.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    kind = null;
    notify();
  });

  if (isIos() && isRealSafari() && !isInstalled() && !dismissedRecently()) {
    kind = 'ios';
    notify();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot(): InstallKind {
  return kind;
}

/** Ce qu'on peut proposer maintenant : un bouton, une explication, ou rien. */
export function useInstall(): InstallKind {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
