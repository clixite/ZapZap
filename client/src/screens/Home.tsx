import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OpenTable } from '@zapzap/shared';
import { request } from '../socket';
import { useGame } from '../store/game';
import { AVATAR_CHOICES, randomAvatar, useSession } from '../store/session';

/**
 * L'accueil.
 *
 * Trois façons de jouer, dans l'ordre où on en a besoin : tout de suite avec
 * n'importe qui, entre amis avec un code, ou seul contre des robots. Le reste —
 * règles, réglages — vient après : quelqu'un qui ouvre l'application veut
 * jouer, pas configurer.
 */
export function Home() {
  const { user, loading, signIn } = useSession();
  const navigate = useNavigate();
  const clear = useGame((s) => s.clear);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<OpenTable[]>([]);

  useEffect(() => clear(), [clear]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = async () => {
      const ack = await request<{ tables: OpenTable[] }>('room:openTables');
      if (alive && ack.ok) setTables(ack.tables);
    };
    void refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user]);

  if (loading) return <Centered>Un instant…</Centered>;
  if (!user) return <SignIn onSubmit={signIn} />;

  const go = async (event: 'room:create' | 'room:quickMatch') => {
    setBusy(true);
    setError(null);
    const ack = await request<{ code: string }>(event);
    setBusy(false);
    if (!ack.ok) return setError(ack.error.message);
    navigate(`/salon/${ack.code}`);
  };

  const joinCode = async (raw: string) => {
    setBusy(true);
    setError(null);
    const ack = await request<{ code: string }>('room:join', { code: raw });
    setBusy(false);
    if (!ack.ok) return setError(ack.error.message);
    navigate(`/salon/${ack.code}`);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Zap<span className="text-volt-400">Zap</span>
        </h1>
        <p className="mt-1 text-sm text-paper-300">
          Défaussez, annoncez, le plus bas gagne. Bonjour {user.pseudo}&nbsp;{user.avatar}
        </p>
      </header>

      <button
        type="button"
        onClick={() => void go('room:quickMatch')}
        disabled={busy}
        className="rounded-2xl bg-volt-500 py-4 font-display text-xl font-bold text-storm-950 transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        Partie rapide
        <span className="block text-xs font-medium">avec qui est en ligne</span>
      </button>

      <button
        type="button"
        onClick={() => void go('room:create')}
        disabled={busy}
        className="rounded-2xl bg-storm-700 py-4 font-display text-lg font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        Créer une partie
        <span className="block text-xs font-medium text-paper-300">entre amis, ou contre des robots</span>
      </button>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void joinCode(code);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Code de la partie"
          className="min-w-0 flex-1 rounded-xl bg-storm-800 px-4 py-3 text-center font-display text-xl tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-paper-300/50"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="rounded-xl bg-storm-700 px-5 font-display font-bold disabled:opacity-40"
        >
          Rejoindre
        </button>
      </form>

      {error && <p className="rounded-xl bg-danger/20 px-4 py-2 text-sm text-danger">{error}</p>}

      {tables.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">Tables ouvertes</h2>
          {tables.map((table) => (
            <button
              key={table.code}
              type="button"
              onClick={() => void joinCode(table.code)}
              disabled={busy}
              className="flex items-center justify-between rounded-xl bg-storm-800 px-4 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              <span className="truncate">
                {table.hostAvatar} {table.hostPseudo}
              </span>
              <span className="shrink-0 text-sm text-paper-300">
                {table.playersCount}/{table.maxPlayers} joueurs
              </span>
            </button>
          ))}
        </section>
      )}

      <nav className="mt-auto flex justify-center gap-4 pt-4 text-sm text-paper-300">
        <a href="/regles" className="underline underline-offset-4">
          Comment on joue
        </a>
      </nav>
      <p className="text-center text-[10px] text-paper-300/60">{__APP_VERSION__}</p>
    </div>
  );
}

/**
 * Le compte, en cinq secondes.
 *
 * Un pseudo, un avatar, et c'est tout. Demander une inscription pour une partie
 * de cartes, c'est perdre la moitié de la table avant le premier coup.
 */
function SignIn({ onSubmit }: { onSubmit: (pseudo: string, avatar: string) => Promise<void> }) {
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
        } catch {
          setError('Impossible de créer le compte. Réessayez.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">
        Zap<span className="text-volt-400">Zap</span>
      </h1>
      <p className="text-center text-sm text-paper-300">Choisissez un nom, on joue tout de suite.</p>

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

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-paper-300">{children}</div>;
}
