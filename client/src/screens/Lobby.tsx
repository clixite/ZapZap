import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MAX_PLAYERS, MIN_PLAYERS, isBotId, type ZapVariants } from '@zapzap/shared';
import { InviteButtons } from '../components/InviteButtons';
import { useT } from '../i18n';
import { useGame, useGameChannel, useView } from '../store/game';
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
  const t = useT();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const error = useGame((s) => s.error);
  const busy = useGame((s) => s.busy);
  const send = useGame((s) => s.send);
  const setError = useGame((s) => s.setError);
    const join = useGame((s) => s.join);
  const denied = useGame((s) => s.denied);
  const view = useView();
  const user = useSession((s) => s.user);
  const connected = useSession((s) => s.connected);

  useGameChannel();

  /*
   * On demande la table que l'URL nomme — pas « une » table.
   *
   * La condition portait sur `!view` : tant qu'une vue était en mémoire, on ne
   * redemandait rien. Depuis une table ouverte, aller sur le salon d'une autre
   * partie affichait donc l'ancienne, indéfiniment. On attend toujours la
   * connexion (sinon le premier chargement d'un lien d'invitation part dans le
   * vide sans jamais réessayer), et on ne redemande pas sa place là où on vient
   * d'être retiré.
   */
  useEffect(() => {
    if (connected && code && view?.code !== code && denied !== code) void join(code);
  }, [connected, code, view?.code, join, denied]);

  // Exclu, ou table close : on ne reste pas sur un écran vide à se demander.
  useEffect(() => {
    if (denied === code) navigate('/', { replace: true });
  }, [denied, code, navigate]);

  useEffect(() => {
    if (view && view.phase !== 'lobby') navigate(`/table/${view.code}`, { replace: true });
  }, [view?.phase, view?.code, navigate, view]);

  if (!view || !user) return <Centered error={error}>{error ?? t.lobby.connecting}</Centered>;

  const isHost = view.hostId === view.you;
  const enough = view.players.length >= MIN_PLAYERS;

  const setVariants = (patch: Partial<ZapVariants>) =>
    void send('room:setVariants', { variants: { ...view.variants, ...patch } });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      {/*
        L'invitation en premier, et expliquée.

        Un code seul ne dit pas ce qu'on doit en faire. La consigne tient en une
        phrase — « envoyez ce code, ils l'entrent à l'accueil » — et elle
        transforme un nombre affiché en une action à faire.
      */}
      {/*
        Le retour au menu ne dépend d'aucun état : c'est la première chose qu'on
        cherche quand on ne sait plus où l'on est.
      */}
      <div className="-mb-2 flex items-center justify-between">
        <Link
          to="/"
          className="flex min-h-11 items-center rounded-xl px-2 text-sm text-paper-300 underline underline-offset-4"
        >
          {t.lobby.mainMenu}
        </Link>
        <Link
          to="/profil"
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-paper-300"
        >
          <span className="text-lg" aria-hidden="true">
            {user.avatar}
          </span>
          <span className="underline underline-offset-4">{t.lobby.profile}</span>
        </Link>
      </div>

      <header className="rounded-2xl bg-storm-900/70 px-4 py-4 text-center">
        <p className="text-sm font-medium text-paper-100">{t.lobby.inviteTitle}</p>
        <p className="mt-0.5 text-xs text-paper-300">
          {t.lobby.inviteDetail}
        </p>
        <p className="mt-2 font-display text-5xl font-bold tracking-[0.2em] text-volt-300">{view.code}</p>
        <div className="mt-3">
          <InviteButtons code={view.code} />
        </div>
      </header>

      {!isHost && (
        <p className="rounded-xl bg-storm-800 px-4 py-3 text-center text-sm text-paper-300">
          {t.lobby.hostRuns(view.players.find((p) => p.id === view.hostId)?.pseudo ?? t.lobby.theHost)}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
          {t.lobby.players(view.players.length, MAX_PLAYERS)}
        </h2>
        {view.players.map((player) => (
          <div key={player.id} className="flex items-center gap-3 rounded-xl bg-storm-800 px-4 py-2.5">
            <span className="text-xl" aria-hidden="true">
              {player.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {player.pseudo}
              {player.id === view.hostId && <span className="ml-1 text-xs text-flash-300">{t.lobby.host}</span>}
              {player.id === view.you && <span className="ml-1 text-xs text-paper-300">{t.lobby.you}</span>}
            </span>
            {isHost && player.id !== view.you && (
              <button
                type="button"
                onClick={() =>
                  void send(isBotId(player.id) ? 'room:removeBot' : 'room:kick', { playerId: player.id })
                }
                aria-label={t.lobby.removeNamed(player.pseudo)}
                className="-my-2.5 flex h-11 shrink-0 items-center px-3 text-xs text-paper-300 underline underline-offset-2"
              >
                {t.lobby.remove}
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
            {t.lobby.addBot}
          </button>
        )}
      </section>

      {isHost && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">{t.lobby.settings}</h2>

          <Choice
            label={t.lobby.whoCanEnter}
            value={view.visibility}
            options={[
              ['private', t.lobby.onCode],
              ['public', t.lobby.everyone],
            ]}
            onChange={(v) => void send('room:setVisibility', { visibility: v })}
          />
          <Choice
            label={t.lobby.pace}
            value={view.pace}
            options={[
              ['live', t.lobby.live],
              ['async', t.lobby.async],
            ]}
            onChange={(v) => void send('room:setPace', { pace: v })}
          />
          <Choice
            label={t.lobby.zapAt}
            value={String(view.variants.zapThreshold)}
            options={[
              ['5', t.lobby.points(5)],
              ['7', t.lobby.points(7)],
            ]}
            onChange={(v) => setVariants({ zapThreshold: Number(v) as 5 | 7 })}
          />
          <Choice
            label={t.lobby.runs}
            value={view.variants.sameSuitRuns ? 'same' : 'any'}
            options={[
              ['same', t.lobby.sameSuit],
              ['any', t.lobby.anySuit],
            ]}
            onChange={(v) => setVariants({ sameSuitRuns: v === 'same' })}
          />
          <Choice
            label={t.lobby.minRun}
            value={String(view.variants.minRun)}
            options={[
              ['3', t.lobby.cards(3)],
              ['2', t.lobby.cards(2)],
            ]}
            onChange={(v) => setVariants({ minRun: Number(v) as 2 | 3 })}
          />
          <Choice
            label={t.lobby.rebound}
            value={view.variants.rebound ? 'on' : 'off'}
            options={[
              ['on', t.lobby.yes],
              ['off', t.lobby.no],
            ]}
            onChange={(v) => setVariants({ rebound: v === 'on' })}
          />
          <Choice
            label={t.lobby.jokers}
            value={view.variants.jokers ? 'on' : 'off'}
            options={[
              ['off', t.lobby.without],
              ['on', t.lobby.with],
            ]}
            onChange={(v) => setVariants({ jokers: v === 'on' })}
          />
          <Choice
            label={t.lobby.endMode}
            value={view.variants.endMode}
            options={[
              ['last-standing', t.lobby.lastStanding],
              ['first-out', t.lobby.firstOut],
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
            {enough ? t.lobby.start : t.lobby.needPlayers(MIN_PLAYERS)}
          </button>
        ) : (
          <p className="text-center text-sm text-paper-300">{t.lobby.waitingHost}</p>
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
          {t.lobby.leave}
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
            className={`min-h-11 min-w-11 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
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

/*
 * Un écran d'attente qui échoue doit offrir une porte.
 *
 * Un code périmé, une partie déjà commencée, une table fermée : le message
 * s'affichait seul au milieu de l'écran, sans rien à toucher. Il n'y a pas de
 * barre de navigation dans une application plein écran — sans ce lien, le seul
 * recours était de fermer l'application.
 */
function Centered({ children, error }: { children: React.ReactNode; error?: string | null }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-paper-300">
      <p>{children}</p>
      {error && (
        <Link to="/" className="min-h-11 rounded-xl bg-storm-700 px-5 py-3 text-sm font-medium text-paper-100">
          {t.table.backHome}
        </Link>
      )}
    </div>
  );
}
