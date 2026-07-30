/**
 * Limitation de débit, en mémoire.
 *
 * Un seau de jetons par clé (adresse IP, socket…) : chaque appel consomme un
 * jeton, le seau se remplit au fil de l'eau. C'est volontairement simple — le
 * jeu tient sur un seul processus, et l'objectif n'est pas de résister à une
 * attaque distribuée (c'est le rôle du proxy en amont) mais d'empêcher qu'un
 * client emballé ou malveillant ne monopolise la table : création de comptes en
 * boucle, spam d'émotes, rafale d'actions de jeu.
 */

interface Bucket {
  tokens: number;
  last: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    /** Jetons disponibles au départ, et plafond du seau. */
    private capacity: number,
    /** Jetons rendus par seconde. */
    private refillPerSecond: number,
  ) {}

  /** Consomme un jeton. `false` = trop d'appels, rejeter celui-ci. */
  allow(key: string, now = Date.now()): boolean {
    this.sweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, last: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = (now - bucket.last) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.last = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /**
   * Oublie les seaux redevenus pleins, au plus une fois par minute.
   *
   * Sans ce ménage, chaque visiteur laisserait une entrée pour toujours — une
   * fuite lente mais certaine sur un serveur qui tourne des mois.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const fullAfter = (this.capacity / this.refillPerSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.last > fullAfter) this.buckets.delete(key);
    }
  }

  /** Nombre de seaux suivis — pour les tests. */
  size(): number {
    return this.buckets.size;
  }
}
