import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request } from 'express';
import { z } from 'zod';
import type { ActiveGame } from '@zapzap/shared';
import { newUserId, signToken, verifyToken } from './auth/tokens';
import type { Db } from './db/db';
import { UsersRepo } from './db/users.repo';
import type { PushService } from './push/push';
import { RateLimiter } from './rateLimit';

/** Ce que l'API attend du gestionnaire de tables — juste la liste par joueur. */
export interface RoomsPort {
  gamesOf(userId: string): ActiveGame[];
}

/** L'identité portée par l'en-tête Authorization, ou null. */
function bearerUserId(req: Request): string | null {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyToken(token) : null;
}

const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1024),
    keys: z.object({ p256dh: z.string().max(256), auth: z.string().max(256) }),
  }),
  locale: z.string().max(8).optional(),
});

const guestSchema = z.object({
  pseudo: z.string().trim().min(1).max(20),
  avatar: z.string().trim().min(1).max(8),
});

/**
 * Création de comptes : 30 d'un coup, puis un toutes les vingt secondes.
 *
 * Chaque compte est une ligne en base pour toujours : sans plafond, une boucle
 * `curl` remplit le disque. Mais la limite est par **adresse IP**, et une
 * adresse IP n'est pas une personne : derrière la box d'un café, d'une école ou
 * d'une famille, tout le monde partage la même. Dix d'un coup — la valeur
 * précédente — refusait le compte au onzième joueur d'une soirée, avec pour
 * seul recours d'attendre une minute sans savoir pourquoi. Trente laisse passer
 * une tablée entière et arrête toujours net une boucle automatisée.
 */
const guestLimiter = new RateLimiter(30, 1 / 20);

/**
 * L'API.
 *
 * Tout ce qui concerne une partie en cours passe par les WebSockets, où l'état
 * est poussé plutôt que demandé. Restent ici l'identité, l'historique — et la
 * liste des parties en cours, en REST délibérément : en asynchrone on joue
 * depuis plusieurs appareils, c'est le serveur qui fait autorité sur « qui
 * m'attend », pas la mémoire d'un onglet.
 *
 * `getRooms` est un accesseur paresseux : le gestionnaire de tables naît après
 * l'application (il a besoin du serveur HTTP, qui a besoin d'elle).
 */
export function createApp(
  db: Db,
  getRooms: () => RoomsPort | null = () => null,
  push: PushService | null = null,
): Express {
  const app = express();
  const users = new UsersRepo(db);

  app.use(express.json({ limit: '256kb' }));
  app.disable('x-powered-by');
  // Derrière Traefik, l'adresse du client est dans X-Forwarded-For : sans ce
  // réglage, tout le monde partagerait l'IP du proxy — et son seau de jetons.
  app.set('trust proxy', 1);

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
    if (!guestLimiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    const parsed = guestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    const id = newUserId();
    const user = users.create(id, parsed.data.pseudo, parsed.data.avatar);
    res.json({ token: signToken(id), user });
  });

  /*
   * Notifications : la clé publique, l'abonnement, le désabonnement.
   *
   * La clé publique n'est pas un secret — le navigateur en a besoin pour
   * fabriquer un abonnement, et elle n'autorise personne à écrire à sa place.
   * Le service est optionnel : sans lui, la route répond « pas de clé » et le
   * client se contente de ne rien proposer, plutôt que de tomber en erreur.
   */
  app.get('/api/push/key', (_req, res) => {
    if (!push) {
      res.status(503).json({ error: 'PUSH_UNAVAILABLE' });
      return;
    }
    res.json({ key: push.publicKey() });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !push) {
      res.status(userId ? 503 : 401).json({ error: userId ? 'PUSH_UNAVAILABLE' : 'INVALID_TOKEN' });
      return;
    }
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    push.subscribe(userId, parsed.data.subscription, parsed.data.locale ?? 'fr');
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !push) {
      res.status(userId ? 503 : 401).json({ error: userId ? 'PUSH_UNAVAILABLE' : 'INVALID_TOKEN' });
      return;
    }
    const endpoint = (req.body as { endpoint?: unknown })?.endpoint;
    if (typeof endpoint !== 'string') {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    push.unsubscribe(endpoint);
    res.json({ ok: true });
  });

  /** Qui suis-je — avec les statistiques, pour l'écran d'historique. */
  app.get('/api/me', (req, res) => {
    const userId = bearerUserId(req);
    const user = userId ? users.get(userId) : null;
    if (!user || !userId) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    res.json({ user, stats: users.getStats(userId) });
  });

  /**
   * Mes parties en cours, celle qui m'attend d'abord.
   *
   * En asynchrone on peut avoir cinq tables ouvertes sur plusieurs jours : il
   * faut pouvoir les lister et voir d'un coup d'œil laquelle attend après nous.
   */
  app.get('/api/me/games', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    res.json({ games: getRooms()?.gamesOf(userId) ?? [] });
  });

  /** Mes parties passées, les plus récentes d'abord. */
  app.get('/api/me/history', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    res.json({ history: users.getHistory(userId) });
  });

  /**
   * Le classement entre joueurs qui se connaissent.
   *
   * Aucune liste d'amis à tenir : ceux avec qui l'on a fini des parties *sont*
   * les adversaires réguliers, et c'est la seule comparaison qui ait un sens —
   * un classement mondial dans un jeu qu'on joue à six autour d'une table ne
   * dit rien à personne.
   */
  app.get('/api/me/leaderboard', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    res.json({ leaderboard: users.getLeaderboard(userId) });
  });

  /** Mise à jour du profil : pseudo et avatar. */
  app.patch('/api/me', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    const parsed = guestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    users.updateProfile(userId, parsed.data.pseudo, parsed.data.avatar);
    res.json({ user: users.get(userId) });
  });

  /**
   * Photo de profil : un JPEG en data URL, réduit côté client (96–192 px).
   *
   * La borne est stricte parce que la photo repart dans chaque vue de partie
   * diffusée à toute la table : une image lourde ralentirait chaque coup.
   */
  app.put('/api/me/photo', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    const photo = (req.body as { photo?: unknown } | undefined)?.photo;
    if (photo !== null && (typeof photo !== 'string' || !photo.startsWith('data:image/jpeg;base64,') || photo.length > 64_000)) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' });
      return;
    }
    users.updatePhoto(userId, photo);
    res.json({ user: users.get(userId) });
  });

  /**
   * Suppression du compte — droit élémentaire, et exigence des magasins
   * d'applications. Stats et historique partent avec (ON DELETE CASCADE).
   */
  app.delete('/api/me', (req, res) => {
    const userId = bearerUserId(req);
    if (!userId || !users.get(userId)) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }
    users.deleteAccount(userId);
    res.json({ ok: true });
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
