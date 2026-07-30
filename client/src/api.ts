import type { ActiveGame, GameHistoryEntry, PublicUser, UserStats } from '@zapzap/shared';

const TOKEN_KEY = 'zapzap.token';
const HISTORY_CACHE_KEY = 'zapzap.history-cache';

export function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Navigation privée sur iOS : `localStorage` peut lever. On joue sans
    // mémoire plutôt que d'afficher une page blanche.
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* sans mémoire, la session dure le temps de l'onglet */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* rien à nettoyer */
  }
}

export async function createGuest(pseudo: string, avatar: string): Promise<{ token: string; user: PublicUser }> {
  const res = await fetch('/api/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, avatar }),
  });
  if (!res.ok) throw new Error('Impossible de créer le compte');
  return (await res.json()) as { token: string; user: PublicUser };
}

function authHeaders(): Record<string, string> {
  const token = storedToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Valide le jeton conservé sur l'appareil. `null` s'il a expiré ou été révoqué. */
export async function fetchMe(token: string): Promise<{ user: PublicUser; stats: UserStats } | null> {
  const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json()) as { user: PublicUser; stats: UserStats };
}

/**
 * Mes parties en cours, celle qui m'attend d'abord.
 *
 * En REST et pas par le socket : en asynchrone on joue depuis plusieurs
 * appareils, le serveur fait autorité sur « qui m'attend ».
 */
export async function fetchActiveGames(): Promise<ActiveGame[] | null> {
  try {
    const res = await fetch('/api/me/games', { headers: authHeaders() });
    if (!res.ok) return null;
    const body = (await res.json()) as { games: ActiveGame[] };
    return body.games;
  } catch {
    return null; // hors ligne : l'appelant garde ce qu'il sait
  }
}

/**
 * L'historique, servi depuis le cache d'abord.
 *
 * L'écran s'affiche instantanément avec ce que l'appareil connaît, puis se
 * rafraîchit en arrière-plan — la liste de ses parties passées ne mérite pas
 * une page blanche le temps d'un aller-retour réseau.
 */
export function readCachedHistory(userId: string): GameHistoryEntry[] | null {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { userId: string; games: GameHistoryEntry[] };
    return cached.userId === userId ? cached.games : null;
  } catch {
    return null;
  }
}

export async function fetchHistory(userId: string): Promise<GameHistoryEntry[] | null> {
  try {
    const res = await fetch('/api/me/history', { headers: authHeaders() });
    if (!res.ok) return null;
    const body = (await res.json()) as { history: GameHistoryEntry[] };
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify({ userId, games: body.history }));
    return body.history;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Compte                                                              */
/* ------------------------------------------------------------------ */

export async function updateProfile(pseudo: string, avatar: string): Promise<PublicUser | null> {
  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ pseudo, avatar }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { user: PublicUser }).user;
}

export async function uploadPhoto(photo: string | null): Promise<PublicUser | null> {
  const res = await fetch('/api/me/photo', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ photo }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { user: PublicUser }).user;
}

export async function deleteAccount(): Promise<boolean> {
  const res = await fetch('/api/me', { method: 'DELETE', headers: authHeaders() });
  if (res.ok) {
    clearToken();
    try {
      localStorage.removeItem(HISTORY_CACHE_KEY);
    } catch {
      /* rien à purger */
    }
  }
  return res.ok;
}

/** Demande d'un lien magique. Renvoie le message d'erreur du serveur, ou null si parti. */
export async function requestMagicLink(email: string): Promise<string | null> {
  const res = await fetch('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ email }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? 'L’envoi a échoué. Réessayez plus tard.';
}

export async function verifyMagicLink(token: string): Promise<{ token: string; user: PublicUser } | null> {
  const res = await fetch(`/api/auth/verify?t=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  return (await res.json()) as { token: string; user: PublicUser };
}
