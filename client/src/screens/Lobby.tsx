import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MAX_PLAYERS, MIN_PLAYERS, isBotId, type ZapVariants } from '@zapzap/shared';
import { InviteButtons } from '../components/InviteButtons';
import { useGame } from '../store/game';
import { useSession } from '../store/session';

/**
 * Le salon.
 *
 * Deux choses à y faire : réunir du monde, et se mettre d'accord sur les
 * règles. Les réglages sont présentés comme des questions plutôt que comme des
 * options — « suite de deux cartes ? » se comprend sans avoir lu le règlement,
 * « minRun = 2 » non.
 */
export function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { view, error, busy, send, setError, listen } = useGame();
  const user = useSession((s) => s.user);

  useEffect(() => listen(), [listen]);

  useEffect(() => {
    if (code && !view) void send('room:join', { code });
  }, [code, view, send]);

  useEffect(() => {
    if (view && view.phase !== 'lobby') navigate(`/table/${view.code}`, { replace: true });
  }, [view?.phase, view?.code, navigate, view]);

  if (!view || !user) return <Centered>{error ?? 'Connexion au salon…'}</Centered>;

  const isHost = view.hostId === view.you;
  const enough = view.players.length >= MIN_PLAYERS;

  const setVariants = (patch: Partial<ZapVariants>) =>
    void send('room:setVariants', { variants: { ...view.variants, ...patch } });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      <header className="text-center">
        <p className="text-xs tracking-wide text-paper-300 uppercase">Code de la partie</p>
        <p className="font-display text-5xl font-bold tracking-[0.2em] text-volt-300">{view.code}</p>
        <div className="mt-3">
          <InviteButtons code={view.code} />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
          Joueurs {view.players.length}/{MAX_PLAYERS}
        </h2>
        {view.players.map((player) => (
          <div key={player.id} className="flex items-center gap-3 rounded-xl bg-storm-800 px-4 py-2.5">
            <span className="text-xl" aria-hidden="true">
              {player.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {player.pseudo}
              {player.id === view.hostId && <span className="ml-1 text-xs text-flash-300">hôte</span>}
              {player.id === view.you && <span className="ml-1 text-xs text-paper-300">vous</span>}
            </span>
            {isHost && player.id !== view.you && (
              <button
                type="button"
                onClick={() =>
                  void send(isBotId(player.id) ? 'room:removeBot' : 'room:kick', { playerId: player.id })
                }
                aria-label={`Retirer ${player.pseudo}`}
                className="-my-2.5 flex h-11 shrink-0 items-center px-3 text-xs text-paper-300 underline underline-offset-2"
              >
                retirer
              </button>
            )}
          </div>
        ))}

        {isHost && view.players.length < MAX_PLAYERS && (
          <button
            type="button"
            onClick={() => void send('room:addBot')}
            disabled={busy}
            className="min-h-11 rounded-xl border border-dashed border-storm-500 py-3 text-sm text-paper-300 disabled:opacity-50"
          >
            + Ajouter un robot
          </button>
        )}
      </section>

      {isHost && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">Réglages</h2>

          <Choice
            label="Qui peut entrer"
            value={view.visibility}
            options={[
              ['private', 'Sur code'],
              ['public', 'Tout le monde'],
            ]}
            onChange={(v) => void send('room:setVisibility', { visibility: v })}
          />
          <Choice
            label="Rythme"
            value={view.pace}
            options={[
              ['live', 'En direct'],
              ['async', 'Chacun son heure'],
            ]}
            onChange={(v) => void send('room:setPace', { pace: v })}
          />
          <Choice
            label="On annonce à"
            value={String(view.variants.zapThreshold)}
            options={[
              ['5', '5 points'],
              ['7', '7 points'],
            ]}
            onChange={(v) => setVariants({ zapThreshold: Number(v) as 5 | 7 })}
          />
          <Choice
            label="Suites"
            value={view.variants.sameSuitRuns ? 'same' : 'any'}
            options={[
              ['same', 'Même couleur'],
              ['any', 'Toutes couleurs'],
            ]}
            onChange={(v) => setVariants({ sameSuitRuns: v === 'same' })}
          />
          <Choice
            label="Suite minimale"
            value={String(view.variants.minRun)}
            options={[
              ['3', '3 cartes'],
              ['2', '2 cartes'],
            ]}
            onChange={(v) => setVariants({ minRun: Number(v) as 2 | 3 })}
          />
          <Choice
            label="Rebond à 50 et 100"
            value={view.variants.rebound ? 'on' : 'off'}
            options={[
              ['on', 'Oui'],
              ['off', 'Non'],
            ]}
            onChange={(v) => setVariants({ rebound: v === 'on' })}
          />
          <Choice
            label="Jokers"
            value={view.variants.jokers ? 'on' : 'off'}
            options={[
              ['off', 'Sans'],
              ['on', 'Avec'],
            ]}
            onChange={(v) => setVariants({ jokers: v === 'on' })}
          />
          <Choice
            label="La partie s’arrête"
            value={view.variants.endMode}
            options={[
              ['last-standing', 'Au dernier debout'],
              ['first-out', 'À la 1re sortie'],
            ]}
            onChange={(v) => setVariants({ endMode: v as ZapVariants['endMode'] })}
          />
        </section>
      )}

      {error && <p className="rounded-xl bg-danger/20 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {isHost ? (
          <button
            type="button"
            onClick={() => void send('game:start')}
            disabled={!enough || busy}
            className="rounded-xl bg-volt-500 py-3.5 font-display text-lg font-bold text-storm-950 disabled:opacity-40"
          >
            {enough ? 'Commencer' : `Il faut ${MIN_PLAYERS} joueurs`}
          </button>
        ) : (
          <p className="text-center text-sm text-paper-300">En attente de l’hôte…</p>
        )}
        <button
          type="button"
          onClick={async () => {
            await send('room:leave');
            setError(null);
            navigate('/');
          }}
          className="min-h-11 py-3 text-sm text-paper-300 underline underline-offset-4"
        >
          Quitter la partie
        </button>
      </div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-storm-800 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
            className={`min-h-11 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              value === key ? 'bg-volt-500 text-storm-950' : 'bg-storm-700 text-paper-300'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">{children}</div>;
}
