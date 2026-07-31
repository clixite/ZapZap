import { useState } from 'react';
import { useT } from '../i18n';

/**
 * Inviter, par le canal que la tablée utilise déjà.
 *
 * Le partage natif est le meilleur chemin quand il existe, mais un bouton
 * WhatsApp direct convertit mieux qu'un menu système : c'est là que vivent les
 * groupes de famille et d'amis, le public exact du jeu.
 */
export function InviteButtons({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/j/${code}`;
  const text = t.invite.text(code, url);

  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  // iOS et Android ne s'accordent pas sur le séparateur du corps de SMS.
  const smsHref = isIos ? `sms:&body=${encodeURIComponent(text)}` : `sms:?body=${encodeURIComponent(text)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le lien
      // reste visible dans la bulle du code, rien n'est perdu.
    }
  };

  const nativeShare = async () => {
    await navigator.share?.({ title: 'ZapZap', text, url }).catch(() => {});
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        role="button"
        className="flex h-11 items-center rounded-xl bg-storm-700 px-4 text-sm font-medium"
      >
        {t.invite.whatsapp}
      </a>
      <a href={smsHref} role="button" className="flex h-11 items-center rounded-xl bg-storm-700 px-4 text-sm font-medium">
        {t.invite.sms}
      </a>
      {typeof navigator.share === 'function' && (
        <button
          type="button"
          onClick={() => void nativeShare()}
          className="flex h-11 items-center rounded-xl bg-storm-700 px-4 text-sm font-medium"
        >
          {t.invite.share}
        </button>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        className="flex h-11 items-center rounded-xl bg-storm-700 px-4 text-sm font-medium"
      >
        {copied ? t.invite.copied : t.invite.copy}
      </button>
    </div>
  );
}
