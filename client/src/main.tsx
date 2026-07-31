import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAudio } from './audio';
import { initI18n } from './i18n';
import { initPwa } from './pwa';
import './styles/index.css';

void initI18n();
initPwa();
initAudio();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
