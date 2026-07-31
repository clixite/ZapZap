import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { dismissInstall, promptInstall, useInstall } from '../install';
import { vibrate } from '../haptics';

/**
 * « Mettez ZapZap sur votre écran d'accueil. »
 *
 * L'argument n'est pas « installez notre application » — personne n'installe
 * une application parce qu'on le lui demande. L'argument est **le plein
 * écran** : lancé depuis l'icône, le jeu occupe tout l'écran, sans barre
 * d'adresse ni barre d'outils. C'est ce qu'on met en avant, parce que c'est ce
 * que le joueur y gagne à l'instant même.
 *
 * Deux formes, imposées par les plateformes :
 *
 *  - **Android** : un bouton, qui ouvre la boîte de dialogue du système ;
 *  - **iOS** : trois mots et le pictogramme de partage, parce qu'Apple n'expose
 *    aucune API et que le geste doit être fait à la main.
 *
 * Et une règle de politesse : la bannière arrive **après** un instant, jamais
 * dans la première seconde. Quelqu'un qui vient d'ouvrir un lien d'invitation
 * veut rejoindre sa partie ; lui barrer l'écran à l'arrivée, c'est le perdre.
 */

/** Le pictogramme « Partager » d'iOS — celui qu'il faut aller chercher. */
function IosShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" className="inline-block align-[-3px]">
      <path
        d="M12 3v12M12 3 8.5 6.5M12 3l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const APPEAR_AFTER_MS = 2_500;

export function InstallPrompt() {
  const t = useT();
  const kind = useInstall();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!kind || !ready) return null;

  return (
    <section className="zz-fade-up flex items-start gap-3 rounded-2xl border border-volt-500/40 bg-storm-800/80 p-3">
      <span className="text-2xl leading-none" aria-hidden="true">
        ⚡
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t.install.title}</p>
        <p className="mt-0.5 text-xs text-paper-300">
          {kind === 'ios' ? (
            <>
              {t.install.iosBefore}
              <IosShareGlyph />
              {t.install.iosAfter}
            </>
          ) : (
            t.install.detail
          )}
        </p>
        {kind === 'prompt' && (
          <button
            type="button"
            onClick={() => {
              vibrate('tap');
              void promptInstall();
            }}
            className="mt-2 min-h-11 rounded-xl bg-volt-500 px-4 font-display font-bold text-storm-950"
          >
            {t.install.action}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissInstall()}
        aria-label={t.install.dismiss}
        // Cible de 44 px, sans le poids visuel qui irait avec : refuser doit
        // être facile à viser et discret à regarder.
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-lg text-paper-300"
      >
        ×
      </button>
    </section>
  );
}
