import { useEffect, useState } from 'react';
import type { TransientEvent } from '@zapzap/shared';
import { useT } from '../i18n';

/**
 * L'annonce, en plein écran, une seconde et demie.
 *
 * C'est le moment du jeu. Quelqu'un dit « ZapZap », tout le monde abat, et la
 * manche se joue là — mais rien à l'écran ne le marquait : la table passait du
 * tapis au décompte, et un joueur qui regardait sa main découvrait le résultat
 * sans avoir vu l'annonce. Le son était déjà là, avec sa fenêtre de 950 ms
 * entre la voix et le verdict ; il ne lui manquait qu'une image.
 *
 * Le rythme suit exactement celui du son : le nom de l'annonceur d'abord, puis
 * le verdict quand la voix a fini de le dire. Un joueur sans le son voit donc
 * la même chose, dans le même ordre, que celui qui l'a — ce qui est la seule
 * façon d'avoir un jeu qui se joue en silence dans le train.
 */

const VERDICT_AT = 950;
const GONE_AT = 2_400;

export function ZapCallout({ event, nameOf }: { event: TransientEvent | null; nameOf: (id: string) => string }) {
  const t = useT();
  const [call, setCall] = useState<{ pseudo: string; success: boolean; key: number } | null>(null);
  const [verdict, setVerdict] = useState(false);

  const isZap = event?.type === 'zap-called';
  const playerId = isZap ? event.playerId : null;
  const success = isZap ? event.success : false;

  useEffect(() => {
    if (!playerId) return;
    setVerdict(false);
    // La clé rend l'animation rejouable : deux annonces d'affilée — ce qui
    // arrive à chaque manche — doivent chacune avoir leur entrée.
    setCall({ pseudo: nameOf(playerId), success, key: Date.now() });
    const toVerdict = setTimeout(() => setVerdict(true), VERDICT_AT);
    const toGone = setTimeout(() => setCall(null), GONE_AT);
    return () => {
      clearTimeout(toVerdict);
      clearTimeout(toGone);
    };
    // Sur l'événement seul : la vue change à chaque coup, pas l'annonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, success, event]);

  if (!call) return null;

  return (
    <div
      key={call.key}
      className="zz-fade-up pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-storm-950/55"
      // `status` et non `alert` : c'est un compte rendu de ce qui vient de se
      // passer, pas une erreur à corriger. Le lecteur d'écran l'annonce sans
      // couper ce qu'il est en train de lire.
      role="status"
    >
      <span className="zz-zap font-display text-4xl font-bold text-flash-400 drop-shadow-lg">⚡ ZapZap !</span>
      <span className="text-lg font-medium text-paper-50">{call.pseudo}</span>
      {verdict && (
        <span
          className={`zz-zap mt-1 rounded-full px-4 py-1.5 font-display text-lg font-bold ${
            call.success ? 'bg-success text-storm-950' : 'bg-danger-solid text-white'
          }`}
        >
          {call.success ? t.recap.callWon : t.recap.callLost}
        </span>
      )}
    </div>
  );
}
