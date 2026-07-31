import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAudio } from './audio';
import { initI18n } from './i18n';
import { initInstall } from './install';
import { initPwa } from './pwa';
import './styles/index.css';

void initI18n();
initPwa();
// Avant le premier rendu : `beforeinstallprompt` part très tôt et ne se
// rejoue pas — un écouteur posé après coup ne l'entend jamais.
initInstall();
initAudio();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
