import { useState } from 'react';
import { useT } from '../i18n';
import { disablePush, enablePush, usePushSubscription } from '../push';

/**
 * Le réglage des notifications.
 *
 * Il ne demande jamais l'autorisation de lui-même : le navigateur ne pose la
 * question qu'une fois dans la vie de l'installation, et la poser avant que le
 * joueur ne sache ce que fait l'application, c'est se la faire refuser
 * définitivement. Elle part donc d'un bouton, sous une phrase qui dit à quoi
 * ça sert et ce que ça ne fait pas — jamais en pleine partie en direct.
 *
 * Le refus est traité comme un état, pas comme une erreur : quand le navigateur
 * a dit non, aucun bouton ne peut le faire changer d'avis, et lui en proposer
 * un serait mentir. On explique où le réglage se trouve, et on s'arrête là.
 */
export function PushToggle() {
  const t = useT();
  const { state, subscribed, refresh } = usePushSubscription();
  const [busy, setBusy] = useState(false);

  if (state === 'unsupported') return null;

  const toggle = async () => {
    setBusy(true);
    if (subscribed) await disablePush();
    else await enablePush();
    setBusy(false);
    refresh();
  };

  return (
    <section className="rounded-xl bg-storm-800 p-3">
      <h2 className="text-sm font-medium">{t.push.title}</h2>
      <p className="mt-0.5 text-xs text-paper-300">{t.push.detail}</p>

      {state === 'denied' ? (
        <p className="mt-3 rounded-lg bg-storm-900 px-3 py-2 text-xs text-paper-300">{t.push.blocked}</p>
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={subscribed}
          data-push-toggle
          className={`mt-3 min-h-11 w-full rounded-lg py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
            subscribed ? 'bg-storm-700 text-paper-100' : 'bg-volt-500 text-storm-950'
          }`}
        >
          {subscribed ? t.push.off : t.push.on}
        </button>
      )}
    </section>
  );
}
