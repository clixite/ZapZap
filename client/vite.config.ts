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
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
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
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Le morceau qui reçoit les notifications, greffé au service worker
        // généré : on garde la mise en cache du plugin sans la réécrire.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [],
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
