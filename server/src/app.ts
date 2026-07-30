import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { z } from 'zod';
import { newUserId, signToken, verifyToken } from './auth/tokens';
import type { Db } from './db/db';
import { UsersRepo } from './db/users.repo';

const guestSchema = z.object({
  pseudo: z.string().trim().min(1).max(20),
  avatar: z.string().trim().min(1).max(8),
});

/**
 * L'API.
 *
 * Elle est volontairement minuscule : tout ce qui concerne une partie passe par
 * les WebSockets, où l'état est poussé plutôt que demandé. Il ne reste ici que
 * ce qui doit exister avant d'avoir une connexion temps réel — se créer une
 * identité — et ce que la supervision interroge.
 */
export function createApp(db: Db): Express {
  const app = express();
  const users = new UsersRepo(db);

  app.use(express.json({ limit: '256kb' }));
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * Un compte en cinq secondes.
   *
   * Pas de mot de passe, pas d'e-mail : demander une inscription pour une
   * partie de cartes entre amis, c'est perdre la moitié de la table avant le
   * premier coup.
   */
  app.post('/api/guest', (req, res) => {
    const parsed = guestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    const id = newUserId();
    const user = users.create(id, parsed.data.pseudo, parsed.data.avatar);
    res.json({ token: signToken(id), user });
  });

  /** Qui suis-je — sert au client à valider le jeton conservé sur l'appareil. */
  app.get('/api/me', (req, res) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const userId = token ? verifyToken(token) : null;
    const user = userId ? users.get(userId) : null;
    if (!user) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    res.json({ user });
  });

  /*
   * Le client compilé, s'il est là.
   *
   * En développement c'est Vite qui sert le client et fait proxy vers ici ; en
   * production le même processus sert l'API, les WebSockets et les fichiers.
   * Une pièce de moins à déployer.
   */
  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}
