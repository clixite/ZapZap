import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Version affichée dans l'application : indispensable pour savoir d'un coup
// d'œil quelle version tourne réellement sur un appareil donné.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const d = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const buildStamp =
  process.env.BUILD_ID ??
  `${version} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildStamp),
  },
  resolve: {
    alias: {
      '@zapzap/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `prompt` : la nouvelle version attend qu'on la déclenche. En
      // `autoUpdate`, les fichiers basculaient silencieusement au milieu d'une
      // manche — voir client/src/pwa.ts.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        /*
         * `id` et `scope` ne sont pas décoratifs.
         *
         * Sans `id`, le navigateur identifie l'application installée par son
         * `start_url` : le jour où celui-ci change, Chrome et Android
         * considèrent que c'est une **autre** application et en installent une
         * seconde à côté de la première. Sans `scope`, une navigation hors du
         * chemin de départ sort de la fenêtre d'application et rouvre le
         * navigateur — ce qui arrivait sur les liens d'invitation `/j/CODE`.
         */
        id: '/',
        scope: '/',
        name: 'ZapZap — le jeu de cartes entre amis',
        short_name: 'ZapZap',
        description: 'Défausse, annonce, et le plus bas gagne. À plusieurs, chacun sur son téléphone.',
        lang: 'fr',
        // Le classement des magasins et des annuaires d'applications web s'y
        // adosse ; sans elles, l'application n'apparaît dans aucune catégorie.
        categories: ['games', 'entertainment'],
        /*
         * Plein écran, avec repli.
         *
         * `display_override` est essayé dans l'ordre : `fullscreen` d'abord —
         * plus de barre d'état, plus de barre système, tout l'écran pour le
         * tapis — puis `standalone` là où le plein écran n'existe pas. `display`
         * reste la réponse pour les navigateurs qui ne connaissent pas
         * `display_override` du tout, et doit donc rester une valeur ancienne.
         *
         * Ce que cela ne fait pas, et qu'aucun réglage ne fera : rendre plein
         * écran une page **ouverte depuis un lien**. Un lien WhatsApp ouvre le
         * navigateur, avec ses barres, sur les deux plateformes — le plein
         * écran est une propriété de l'application installée, pas du site.
         * D'où la bannière d'ajout à l'écran d'accueil : c'est le seul chemin.
         */
        display: 'standalone',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        /*
         * Une fois installée, l'application capte ses propres liens.
         *
         * Sans cela, un joueur qui a ZapZap sur son écran d'accueil et qui
         * touche un lien d'invitation repartait dans le navigateur : deuxième
         * session, barres de navigation, et deux ZapZap ouverts en parallèle.
         * `navigate-existing` amène l'invitation dans la fenêtre déjà ouverte
         * plutôt que d'en créer une seconde.
         */
        handle_links: 'preferred',
        launch_handler: { client_mode: 'navigate-existing' },
        /*
         * Les raccourcis de l'icône : un appui long sur l'écran d'accueil.
         *
         * Les deux gestes qui amènent quelqu'un à ouvrir le jeu — reprendre une
         * partie, en lancer une avec des amis — sont à deux écrans du
         * lancement. Les mettre sous l'icône les met à zéro.
         */
        shortcuts: [
          { name: 'Jouer maintenant', url: '/?rapide=1', description: 'Rejoindre une table ouverte' },
          { name: 'Créer une table', url: '/?creer=1', description: 'Inviter ses amis par code' },
        ],
        background_color: '#110c2e',
        theme_color: '#1c1547',
        /*
         * Deux jeux d'icônes, pour deux façons de les découper.
         *
         * `any` est l'icône telle quelle, avec ses coins arrondis dessinés :
         * c'est ce qu'affichent les listes, les onglets et les anciens
         * lanceurs. `maskable` est une icône **à fond perdu**, dont le sujet
         * tient dans le cercle de sûreté : Android la recadre selon la forme du
         * lanceur — cercle, carré arrondi, goutte — et une icône `any` s'y
         * retrouve avec ses coins rognés et un halo blanc autour.
         *
         * Il en faut une en 192 et pas seulement en 512 : Chrome choisit la
         * taille la plus proche de ce dont il a besoin, et redimensionner une
         * 512 vers 48 px donne un éclair mou.
         */
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Le morceau qui reçoit les notifications, greffé au service worker
        // généré : on garde la mise en cache du plugin sans la réécrire.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        /*
         * Les douze traductions qu'on ne parle pas ne se téléchargent pas.
         *
         * Le préchargement embarquait les treize catalogues : cent quatre-vingts
         * kilo-octets pour douze langues qu'un joueur donné n'ouvrira jamais,
         * téléchargés à la première visite avant qu'il ait touché quoi que ce
         * soit. Le français est dans le paquet principal — il est toujours là,
         * même hors ligne, et il sert de secours. Les autres arrivent quand on
         * les choisit, et restent en cache d'exécution ensuite : la deuxième
         * ouverture en néerlandais est hors ligne comme les autres.
         */
        globIgnores: ['**/assets/{cs,da,de,en,es,fi,it,nl,pl,pt,ro,sv}-*.js'],
        runtimeCaching: [
          {
            // Une traduction est immuable : son nom porte son empreinte.
            urlPattern: /\/assets\/(cs|da|de|en|es|fi|it|nl|pl|pt|ro|sv)-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zapzap-locales',
              expiration: { maxEntries: 13, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            /*
             * Polices et sons : lourds, immuables, et absents du préchargement.
             *
             * Ils vivent dans `public/`, que le préchargement ne balaie pas.
             * Résultat : la police repartait du réseau à chaque lancement — le
             * texte s'affichait dans la police de secours puis sautait — et le
             * son de lancement ne se jouait pas hors ligne. Ils ne changent
             * jamais sans changer de nom : `CacheFirst` est exactement leur cas.
             */
            urlPattern: /\/(fonts|sounds)\/[^/]+$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zapzap-media',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
