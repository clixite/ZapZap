import type { PublicUser } from '@zapzap/shared';

const TOKEN_KEY = 'zapzap.token';

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

/** Valide le jeton conservé sur l'appareil. `null` s'il a expiré ou été révoqué. */
export async function fetchMe(token: string): Promise<PublicUser | null> {
  const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: PublicUser };
  return body.user;
}
