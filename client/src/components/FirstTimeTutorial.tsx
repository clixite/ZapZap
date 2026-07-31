import { useState } from 'react';
import { useT } from '../i18n';
import { CardFace } from './CardFace';

/**
 * Ce qu'on montre à quelqu'un qui n'a jamais joué.
 *
 * ZapZap ne ressemble à aucun jeu que le joueur connaît déjà : on ne fait pas
 * de plis, on ne cherche pas à gagner des cartes, on cherche à s'en
 * débarrasser — et la manche se termine sur une annonce, pas quand les mains
 * sont vides. Un joueur lâché sur le tapis sans rien savoir de tout ça défausse
 * au hasard et croit que le jeu ne veut rien dire.
 *
 * Quatre écrans, pas dix, et **avec de vraies cartes** plutôt que des dessins :
 * ce qu'on lui montre est exactement ce qu'il verra une seconde plus tard. Le
 * texte des règles complètes reste ailleurs — ici, c'est le minimum pour jouer
 * son premier tour sans se tromper.
 *
 * Il s'ouvre tout seul à la première partie, une seule fois, et se referme d'un
 * geste : quelqu'un qui connaît déjà le jeu ne doit pas avoir à le subir.
 */

const SEEN_KEY = 'zapzap.tutorial.seen';

/** A-t-on déjà montré le tutoriel sur cet appareil ? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'true';
  } catch {
    // Sans stockage, on préfère le montrer une fois de trop que jamais.
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'true');
  } catch {
    /* la préférence ne survivra pas à l'onglet */
  }
}

export function FirstTimeTutorial({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: t.tutorial.goal,
      body: t.tutorial.goalBody,
      cards: [
        { suit: 'H', rank: 2 },
        { suit: 'S', rank: 1 },
        { suit: 'C', rank: 3 },
      ],
    },
    {
      title: t.tutorial.turn,
      body: t.tutorial.turnBody,
      cards: [
        { suit: 'D', rank: 7 },
        { suit: 'D', rank: 8 },
        { suit: 'D', rank: 9 },
      ],
    },
    {
      title: t.tutorial.draw,
      body: t.tutorial.drawBody,
      cards: [
        { suit: 'H', rank: 12 },
        { suit: 'S', rank: 13 },
      ],
    },
    {
      title: t.tutorial.call,
      body: t.tutorial.callBody,
      cards: [
        { suit: 'C', rank: 1 },
        { suit: 'D', rank: 2 },
        { suit: 'H', rank: 2 },
      ],
    },
  ] as const;

  const last = step === steps.length - 1;
  const current = steps[step];

  const finish = () => {
    markTutorialSeen();
    onClose();
  };

  return (
    <div
      // `fixed` et non `absolute` : le tutoriel couvre l'écran entier, main
      // comprise. Assombrir le tapis en laissant la main éclairée donnerait
      // envie de la toucher pendant qu'on explique comment y jouer.
      className="fixed inset-0 z-50 flex flex-col justify-end bg-storm-950/85"
      role="dialog"
      aria-modal="true"
      aria-label={t.tutorial.title}
    >
      <button type="button" className="flex-1" aria-label={t.tutorial.skip} onClick={finish} />

      <div className="zz-fade-up rounded-t-2xl bg-storm-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-paper-300 uppercase">
            {t.tutorial.stepOf(step + 1, steps.length)}
          </span>
          <button type="button" onClick={finish} className="min-h-11 px-2 text-sm text-paper-300 underline">
            {t.tutorial.skip}
          </button>
        </div>

        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {current.cards.map((c, i) => (
            <span key={i} className="zz-card-in" style={{ animationDelay: `${i * 70}ms` }}>
              <CardFace card={c as never} width={52} />
            </span>
          ))}
        </div>

        <h2 className="mt-4 font-display text-xl font-bold">{current.title}</h2>
        <p className="mt-1.5 text-sm text-paper-100">{current.body}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-volt-500' : 'bg-storm-700'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className="min-h-11 shrink-0 rounded-xl bg-volt-500 px-5 font-display font-bold text-storm-950"
          >
            {last ? t.tutorial.play : t.tutorial.next}
          </button>
        </div>
      </div>
    </div>
  );
}
