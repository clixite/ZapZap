import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimit';

describe('seau de jetons', () => {
  it('laisse passer la rafale initiale puis bloque', () => {
    const limiter = new RateLimiter(3, 1);
    const t = 1_000_000;
    expect(limiter.allow('a', t)).toBe(true);
    expect(limiter.allow('a', t)).toBe(true);
    expect(limiter.allow('a', t)).toBe(true);
    expect(limiter.allow('a', t)).toBe(false);
  });

  it('rend des jetons au fil du temps', () => {
    const limiter = new RateLimiter(2, 1);
    const t = 1_000_000;
    limiter.allow('a', t);
    limiter.allow('a', t);
    expect(limiter.allow('a', t)).toBe(false);
    // Une seconde plus tard, un jeton est revenu.
    expect(limiter.allow('a', t + 1_000)).toBe(true);
    expect(limiter.allow('a', t + 1_000)).toBe(false);
  });

  it('ne dépasse jamais le plafond, même après une longue absence', () => {
    const limiter = new RateLimiter(2, 1);
    const t = 1_000_000;
    limiter.allow('a', t);
    // Une heure d'inactivité ne donne pas droit à 3600 appels d'un coup.
    expect(limiter.allow('a', t + 3_600_000)).toBe(true);
    expect(limiter.allow('a', t + 3_600_000)).toBe(true);
    expect(limiter.allow('a', t + 3_600_000)).toBe(false);
  });

  it('sépare les clés : un abuseur ne bloque pas les autres', () => {
    const limiter = new RateLimiter(1, 0.1);
    const t = 1_000_000;
    expect(limiter.allow('abuseur', t)).toBe(true);
    expect(limiter.allow('abuseur', t)).toBe(false);
    expect(limiter.allow('honnête', t)).toBe(true);
  });

  it('oublie les seaux redevenus pleins : pas de fuite mémoire', () => {
    const limiter = new RateLimiter(2, 1);
    const t = 1_000_000;
    for (let i = 0; i < 100; i++) limiter.allow(`visiteur-${i}`, t);
    expect(limiter.size()).toBe(100);
    // Dix minutes plus tard, tous les seaux sont pleins : le balayage (déclenché
    // par un nouvel appel) les oublie.
    limiter.allow('nouveau', t + 600_000);
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});
