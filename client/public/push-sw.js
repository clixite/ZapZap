/*
 * La partie du service worker qui reçoit les notifications.
 *
 * Elle vit dans un fichier à part, importé par le service worker généré : le
 * plugin PWA fabrique lui-même la mise en cache et on ne veut pas reprendre ce
 * travail à la main pour ajouter deux écouteurs.
 *
 * Deux comportements, et le second compte autant que le premier :
 *
 *  - **on affiche** la notification reçue ;
 *  - **on ramène le joueur là où il était attendu** quand il la touche. Ouvrir
 *    l'accueil l'obligerait à retrouver sa table, et un onglet déjà ouvert doit
 *    être réutilisé plutôt que dupliqué — sinon on se retrouve avec cinq
 *    fenêtres du même jeu.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Charge utile illisible : on notifie quand même, sans détail. Mieux vaut
    // un « à vous de jouer » nu que rien du tout.
  }
  const title = payload.title || 'ZapZap';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Une seule notification ZapZap à la fois : trois parties qui vous
      // attendent ne doivent pas empiler trois lignes dans le tiroir.
      tag: 'zapzap-turn',
      renotify: true,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          // On navigue l'onglet existant : le joueur retrouve sa session, son
          // compte et sa connexion, au lieu d'en ouvrir une seconde.
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
