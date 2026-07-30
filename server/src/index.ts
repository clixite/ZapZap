import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { config } from './config';
import { openDatabase } from './db/db';
import { UsersRepo } from './db/users.repo';
import { RoomManager } from './rooms/RoomManager';
import { registerHandlers } from './sockets/handlers';

const db = openDatabase();
const app = createApp(db);
const http = createServer(app);
const io = new Server(http, {
  // Le client est servi par le même processus : aucune origine tierce à
  // autoriser. En développement, Vite fait proxy, donc même origine également.
  cors: { origin: false },
  // Un téléphone qui passe du wifi à la 4G doit pouvoir reprendre sa session
  // plutôt que d'en ouvrir une nouvelle et de perdre sa place à table.
  connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
});

const rooms = new RoomManager(io, db);
registerHandlers({ io, rooms, users: new UsersRepo(db) });

http.listen(config.port, () => {
  console.log(`ZapZap écoute sur le port ${config.port} — ${config.publicUrl}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} reçu, arrêt.`);
  rooms.stop();
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
