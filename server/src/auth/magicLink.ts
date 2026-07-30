import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { Db } from '../db/db';
import type { UsersRepo } from '../db/users.repo';
import type { Mailer } from '../mail/mailer';
import { newUserId, signToken, verifyToken } from './tokens';

/**
 * Le lien magique : un compte sans mot de passe qu'on retrouve sur tout appareil.
 *
 * Le geste : le joueur donne son e-mail, reçoit un lien, le clique — de
 * n'importe où. Trois cas au clic, dans cet ordre :
 *
 *  1. un compte porte déjà cet e-mail → on s'y connecte ;
 *  2. la demande venait d'un invité connecté → **promotion** : le compte gagne
 *     l'e-mail et garde tout — pseudo, avatar, statistiques, historique ;
 *  3. sinon → nouveau compte rattaché à l'e-mail.
 *
 * Côté serveur, seul le condensat du jeton est stocké, l'usage est unique et
 * l'échéance courte : un lien magique est un geste, pas un mot de passe.
 */

const LINK_TTL_MS = 15 * 60_000;
/** Liens actifs simultanés par adresse : au-delà, quelqu'un s'amuse. */
const MAX_ACTIVE_LINKS = 3;

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function bearerUserId(req: Request): string | null {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyToken(token) : null;
}

export function magicLinkRoutes(db: Db, users: UsersRepo, mailer: Mailer): Router {
  const router = Router();

  router.post('/auth/magic-link', async (req, res) => {
    if (!mailer.enabled) {
      res
        .status(503)
        .json({ error: 'MAIL_DISABLED', message: 'L’envoi d’e-mails n’est pas configuré sur ce serveur.' });
      return;
    }
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Adresse e-mail invalide.' });
      return;
    }
    const { email } = parsed.data;

    const active = db
      .prepare('SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND expires_at > ? AND used_at IS NULL')
      .get(email, Date.now()) as { n: number };
    if (active.n >= MAX_ACTIVE_LINKS) {
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Trop de demandes. Réessayez dans quelques minutes.' });
      return;
    }

    // Si la demande vient d'un invité connecté, c'est lui qu'on promouvra.
    const requesterId = bearerUserId(req);

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    db.prepare('INSERT INTO magic_links (token_hash, user_id, email, expires_at) VALUES (?, ?, ?, ?)').run(
      tokenHash,
      requesterId,
      email,
      Date.now() + LINK_TTL_MS,
    );

    const url = `${config.publicUrl.replace(/\/$/, '')}/verify?t=${token}`;
    try {
      await mailer.sendMagicLink(email, url);
    } catch (error) {
      console.error('[mail] échec d’envoi du lien magique :', error);
      // Le lien n'est jamais parti : le laisser en base le ferait compter dans
      // le quota pendant quinze minutes et bloquerait les tentatives suivantes
      // alors que le joueur n'a rien reçu.
      db.prepare('DELETE FROM magic_links WHERE token_hash = ?').run(tokenHash);
      res.status(502).json({ error: 'MAIL_FAILED', message: 'L’e-mail n’a pas pu partir. Réessayez plus tard.' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/auth/verify', (req, res) => {
    const token = String(req.query.t ?? '');
    if (!token) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Lien invalide.' });
      return;
    }
    const row = db.prepare('SELECT * FROM magic_links WHERE token_hash = ?').get(hashToken(token)) as
      | { token_hash: string; user_id: string | null; email: string; expires_at: number; used_at: number | null }
      | undefined;
    if (!row || row.used_at !== null || row.expires_at < Date.now()) {
      res.status(400).json({ error: 'LINK_EXPIRED', message: 'Lien invalide ou expiré.' });
      return;
    }
    db.prepare('UPDATE magic_links SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);

    // 1. Un compte porte déjà cet e-mail : connexion.
    let user = users.getByEmail(row.email);
    if (!user) {
      const requester = row.user_id ? users.get(row.user_id) : null;
      if (requester && requester.isGuest) {
        // 2. Promotion de l'invité : identité, pseudo et statistiques conservés.
        users.attachEmail(requester.id, row.email);
        user = users.get(requester.id);
      } else {
        // 3. Nouveau compte, pseudo tiré de l'adresse.
        const pseudo = row.email.split('@')[0].slice(0, 20) || 'Joueur';
        user = users.createWithEmail(newUserId(), pseudo, '⚡', row.email);
      }
    }
    res.json({ token: signToken(user!.id), user });
  });

  return router;
}
