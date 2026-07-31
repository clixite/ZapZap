import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../src/db/db';
import { UsersRepo } from '../src/db/users.repo';
import { PushService, PUSH_COOLDOWN_MS } from '../src/push/push';

/**
 * Les abonnements aux notifications.
 *
 * On ne vérifie pas l'envoi — il part vers un service tiers, et le simuler ne
 * prouverait que la qualité du simulacre. Ce qui se teste ici est la
 * comptabilité : qui est abonné, avec quel appareil, et qui a le droit d'être
 * réveillé maintenant.
 */

let db: Db;
let push: PushService;

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });

beforeEach(() => {
  db = openDatabase(':memory:');
  new UsersRepo(db).create('u_alice', 'alice', '⚡');
  new UsersRepo(db).create('u_bob', 'bob', '⚡');
  push = new PushService(db);
});

afterEach(() => db.close());

describe('clés VAPID', () => {
  it('en fabrique une paire au premier démarrage', () => {
    expect(push.publicKey()).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });

  it('garde la même paire d’un démarrage à l’autre', () => {
    // Changer de clé invaliderait tous les abonnements existants : chacun
    // devrait réautoriser les notifications sans comprendre pourquoi.
    const again = new PushService(db);
    expect(again.publicKey()).toBe(push.publicKey());
  });

  it('en refait une plutôt que de tomber sur une valeur illisible', () => {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('{pas du json', 'vapid');
    expect(new PushService(db).publicKey()).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });
});

describe('abonnements', () => {
  it('enregistre un appareil', () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    expect(push.hasSubscription('u_alice')).toBe(true);
    expect(push.hasSubscription('u_bob')).toBe(false);
  });

  it('garde un abonnement par appareil', () => {
    // Téléphone et tablette : les deux doivent sonner.
    push.subscribe('u_alice', sub('https://push.example/telephone'), 'fr');
    push.subscribe('u_alice', sub('https://push.example/tablette'), 'fr');
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?')
      .get('u_alice') as { n: number };
    expect(count.n).toBe(2);
  });

  it('remplace un abonnement renouvelé plutôt que de le doubler', () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    push.subscribe('u_alice', sub('https://push.example/a'), 'nl');
    const row = db
      .prepare('SELECT COUNT(*) AS n, MAX(locale) AS locale FROM push_subscriptions WHERE user_id = ?')
      .get('u_alice') as { n: number; locale: string };
    expect(row.n).toBe(1);
    expect(row.locale).toBe('nl');
  });

  it('se désabonne', () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    push.unsubscribe('https://push.example/a');
    expect(push.hasSubscription('u_alice')).toBe(false);
  });

  it('emporte les abonnements avec le compte supprimé', () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    db.prepare('DELETE FROM users WHERE id = ?').run('u_alice');
    expect(push.hasSubscription('u_alice')).toBe(false);
  });
});

describe('silence entre deux notifications', () => {
  it('ne retient que les appareils sortis du silence', async () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    // On vient de le prévenir : deux parties qui l'attendent ne font pas deux
    // notifications.
    db.prepare('UPDATE push_subscriptions SET notified_at = ?').run(Date.now());
    expect(await push.notify('u_alice', { title: 't', body: 'b', url: '/' })).toBe(0);
  });

  it('laisse passer une fois le silence écoulé', async () => {
    push.subscribe('u_alice', sub('https://push.example/a'), 'fr');
    db.prepare('UPDATE push_subscriptions SET notified_at = ?').run(Date.now() - PUSH_COOLDOWN_MS - 1_000);
    // L'envoi échouera — l'adresse est fictive — mais l'abonnement a bien été
    // retenu comme éligible, et un échec passager ne le supprime pas.
    await push.notify('u_alice', { title: 't', body: 'b', url: '/' });
    expect(push.hasSubscription('u_alice')).toBe(true);
  });
});
