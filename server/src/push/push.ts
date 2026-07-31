import webpush from 'web-push';
import type { Db } from '../db/db';
import { config } from '../config';

/**
 * Les notifications « c'est ton tour ».
 *
 * C'est la pièce qui rend le mode asynchrone jouable. Une partie où chacun joue
 * quand il peut ne tient que si l'on est prévenu qu'on est attendu : sans
 * notification, il faut penser à rouvrir l'application, et la partie meurt
 * d'oubli au bout de deux jours.
 *
 * Trois décisions, et ce sont elles qui font la différence entre une
 * notification utile et une application qu'on finit par couper :
 *
 *  1. **Jamais en direct.** Une partie en temps réel a déjà tout le monde
 *     devant l'écran ; y ajouter une notification par tour, c'est vibrer trente
 *     fois en dix minutes. Seul le rythme « chacun son heure » notifie.
 *  2. **Jamais quelqu'un qui regarde.** Un joueur dont un onglet est connecté à
 *     la table voit son tour arriver ; le prévenir est du bruit.
 *  3. **Une par quart d'heure et par appareil, au maximum.** Deux parties en
 *     parallèle qui vous attendent ne font pas deux notifications : la première
 *     suffit à faire rouvrir l'application, la seconde n'apporte rien.
 *
 * Les clés VAPID sont générées à la première utilisation et gardées en base.
 * Les mettre dans l'environnement obligerait à les fabriquer à la main avant
 * que quoi que ce soit ne fonctionne — et les changer invaliderait d'un coup
 * tous les abonnements existants.
 */

const KEY_SETTING = 'vapid';
/** Silence minimal entre deux notifications au même appareil. */
export const PUSH_COOLDOWN_MS = 15 * 60_000;

export interface PushKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class PushService {
  private keys: PushKeys;

  constructor(private db: Db) {
    this.keys = this.loadOrCreateKeys();
    webpush.setVapidDetails(`mailto:${config.contactEmail}`, this.keys.publicKey, this.keys.privateKey);
  }

  private loadOrCreateKeys(): PushKeys {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY_SETTING) as
      | { value: string }
      | undefined;
    if (row) {
      try {
        return JSON.parse(row.value) as PushKeys;
      } catch {
        // Valeur illisible : on en refait une plutôt que de partir en erreur au
        // démarrage. Les abonnements existants deviendront caducs et seront
        // nettoyés d'eux-mêmes au premier envoi.
      }
    }
    const keys = webpush.generateVAPIDKeys();
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(KEY_SETTING, JSON.stringify(keys));
    return keys;
  }

  /** La clé publique, que le navigateur doit connaître pour s'abonner. */
  publicKey(): string {
    return this.keys.publicKey;
  }

  subscribe(userId: string, sub: PushSubscription, locale: string): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, locale, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           locale = excluded.locale`,
      )
      .run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, locale, Date.now());
  }

  unsubscribe(endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  /** Le joueur a-t-il au moins un appareil abonné ? */
  hasSubscription(userId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS ok FROM push_subscriptions WHERE user_id = ? LIMIT 1')
      .get(userId) as { ok: number } | undefined;
    return row !== undefined;
  }

  /**
   * Prévient un joueur, sauf si l'un de ses appareils vient déjà de l'être.
   *
   * Rend le nombre d'appareils réellement notifiés — zéro quand le silence est
   * encore en cours, ce qui permet à l'appelant de ne pas s'inquiéter.
   */
  async notify(userId: string, payload: { title: string; body: string; url: string }): Promise<number> {
    const now = Date.now();
    const rows = this.db
      .prepare(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions
         WHERE user_id = ? AND notified_at < ?`,
      )
      .all(userId, now - PUSH_COOLDOWN_MS) as { endpoint: string; p256dh: string; auth: string }[];

    let sent = 0;
    for (const row of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
        );
        this.db
          .prepare('UPDATE push_subscriptions SET notified_at = ? WHERE endpoint = ?')
          .run(now, row.endpoint);
        sent += 1;
      } catch (error) {
        // 404 et 410 sont définitifs : l'abonnement n'existe plus côté service
        // de push. Toute autre erreur est passagère — réseau, quota — et
        // l'abonnement mérite qu'on réessaie plus tard.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) this.unsubscribe(row.endpoint);
      }
    }
    return sent;
  }
}
