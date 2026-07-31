import { useState } from 'react';
import { AVATAR_CHOICES, randomAvatar } from '../store/session';

/**
 * Le compte, en cinq secondes.
 *
 * Un pseudo, un avatar, et c'est tout. Demander une inscription pour une partie
 * de cartes, c'est perdre la moitié de la table avant le premier coup.
 *
 * Le même formulaire sert à l'accueil et à l'arrivée sur une invitation — d'où
 * `intro`, qui remplace la phrase d'accroche par le contexte : quelqu'un qui
 * ouvre un lien reçu par WhatsApp doit lire « vous êtes invité à la table
 * ABCD », pas une présentation du jeu.
 */
export function SignIn({
  onSubmit,
  intro,
}: {
  onSubmit: (pseudo: string, avatar: string) => Promise<void>;
  intro?: React.ReactNode;
}) {
  const [pseudo, setPseudo] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-5 px-6 py-10"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pseudo.trim()) return;
        setBusy(true);
        setError(null);
        try {
          await onSubmit(pseudo.trim(), avatar);
        } catch (cause) {
          // Le message vient de l'API quand elle en a un — « trop de comptes
          // depuis cette connexion » se répare en attendant, « impossible de
          // créer le compte » non : les confondre, c'est faire abandonner.
          setError(cause instanceof Error ? cause.message : 'Impossible de créer le compte. Réessayez.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">
        Zap<span className="text-volt-400">Zap</span>
      </h1>
      {intro ?? (
        <p className="text-center text-sm text-paper-300">Choisissez un nom, on joue tout de suite.</p>
      )}

      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder="Votre pseudo"
        maxLength={20}
        autoFocus
        aria-label="Votre pseudo"
        className="rounded-xl bg-storm-800 px-4 py-3 text-center text-lg"
      />

      <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Votre avatar">
        {AVATAR_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={avatar === choice}
            aria-label={`Avatar ${choice}`}
            onClick={() => setAvatar(choice)}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform ${
              avatar === choice ? 'bg-volt-500 scale-110' : 'bg-storm-800'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || !pseudo.trim()}
        className="rounded-xl bg-volt-500 py-3 font-display text-lg font-bold text-storm-950 disabled:opacity-40"
      >
        C’est parti
      </button>
    </form>
  );
}
