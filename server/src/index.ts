import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { isBotId } from '@zapzap/shared';
import { magicLinkRoutes } from './auth/magicLink';
import { createApp } from './app';
import { config } from './config';
import { openDatabase } from './db/db';
import { UsersRepo } from './db/users.repo';
import { createMailer } from './mail/mailer';
import { PushService } from './push/push';
import type { Room } from './rooms/Room';
import { RoomManager } from './rooms/RoomManager';
import { registerHandlers } from './sockets/handlers';

const db = openDatabase();
const users = new UsersRepo(db);
// Accesseur paresseux : l'application naît avant le gestionnaire de tables.
let rooms: RoomManager | null = null;
const push = new PushService(db);
const app = createApp(db, () => rooms, push);
app.use('/api', magicLinkRoutes(db, users, createMailer(config)));
const http = createServer(app);

/**
 * Fin de partie : chaque humain repart avec sa ligne d'historique et ses
 * statistiques. Les robots ne comptent pas — personne ne consulte le palmarès
 * de Volt.
 */
function recordGameOver(room: Room): void {
  const state = room.state;
  const playedAt = Date.now();
  const ranked = [...state.players].sort(
    (a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99) || a.totalScore - b.totalScore,
  );
  const standings = ranked.map((p) => ({ pseudo: p.pseudo, avatar: p.avatar, score: p.totalScore }));

  for (const player of state.players) {
    if (isBotId(player.id) || !users.get(player.id)) continue;
    const rank = player.finishRank ?? ranked.findIndex((p) => p.id === player.id) + 1;
    const zaps = room.zapStats[player.id] ?? { called: 0, won: 0 };
    users.recordGameResult(player.id, rank === 1, zaps.called, zaps.won, room.bestRounds[player.id] ?? 0);
    users.addHistoryEntry(player.id, {
      code: state.code,
      playedAt,
      playersCount: state.players.length,
      myScore: player.totalScore,
      myRank: rank,
      won: rank === 1,
      standings,
    });
  }
}
const io = new Server(http, {
  // Le client est servi par le même processus : aucune origine tierce à
  // autoriser. En développement, Vite fait proxy, donc même origine également.
  cors: { origin: false },
  // Un téléphone qui passe du wifi à la 4G doit pouvoir reprendre sa session
  // plutôt que d'en ouvrir une nouvelle et de perdre sa place à table.
  connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
  /*
   * Les vues de partie se compressent très bien — ce sont des objets JSON
   * répétitifs — et Socket.IO ne compresse rien par défaut. Le seuil évite de
   * payer le coût du dégonflage sur les petits messages, où il ne rapporte rien.
   */
  perMessageDeflate: { threshold: 1024 },
});

/**
 * « C'est à toi » — le message qui fait vivre le mode asynchrone.
 *
 * Court et sans détail de jeu : une notification s'affiche sur un écran
 * verrouillé, parfois devant quelqu'un d'autre. Le code de la table suffit à
 * savoir laquelle rouvrir, la main du joueur ne regarde personne.
 */
function notifyAwaited(room: Room, playerId: string): void {
  const opponents = room.state.players.filter((p) => p.id !== playerId).length;
  void push
    .notify(playerId, {
      title: 'ZapZap — c’est à vous',
      body: `Table ${room.code}, ${opponents} adversaire${opponents > 1 ? 's' : ''} vous attend${opponents > 1 ? 'ent' : ''}.`,
      url: `/table/${room.code}`,
    })
    .catch(() => {
      // Le service de push est injoignable : rien à faire de plus ici, les
      // abonnements morts sont nettoyés dans `notify`.
    });
}

rooms = new RoomManager(io, db, {}, recordGameOver, notifyAwaited);
registerHandlers({ io, rooms, users });

http.listen(config.port, () => {
  console.log(`ZapZap écoute sur le port ${config.port} — ${config.publicUrl}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} reçu, arrêt.`);
  rooms?.stop();
  io.close();
  http.close(() => {
    db.close();
    process.exit(0);
  });
  // Si une connexion traîne, on ne laisse pas le déploiement s'éterniser.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/*
 * Le filet de sécurité : une table qui tombe ne fait pas tomber les autres.
 *
 * Un seul processus sert toutes les parties. Par défaut, la moindre exception
 * échappée d'un rappel asynchrone — un minuteur de tour, une notification
 * poussée, une écriture disque — arrête Node, et *toutes* les tables en cours
 * perdent leur connexion d'un coup. Les chemins sensibles ont chacun leur
 * `try`/`catch` ; ceci rattrape ce qu'on n'a pas prévu, journalise, et laisse
 * le serveur debout. Un état incohérent sur une table vaut mieux qu'une soirée
 * interrompue pour tout le monde.
 */
process.on('uncaughtException', (error) => {
  console.error('Exception non rattrapée — le serveur continue.', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée sans traitement — le serveur continue.', reason);
});
