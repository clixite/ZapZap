import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: string;
}

/**
 * Identité du joueur.
 *
 * Pas de mot de passe, pas d'inscription : un pseudo, un avatar, et c'est
 * parti. L'identité tient dans un jeton signé conservé sur l'appareil — ce qui
 * suffit à retrouver sa partie après un rafraîchissement ou une coupure, sans
 * rien demander à personne.
 *
 * Le jeton est long parce qu'un joueur qui revient trois semaines plus tard ne
 * doit pas retrouver une table qui ne le reconnaît plus.
 */
const TOKEN_TTL = '365d';

export function newUserId(): string {
  return `u_${randomUUID()}`;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
