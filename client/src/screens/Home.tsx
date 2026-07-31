import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ActiveGame, OpenTable } from '@zapzap/shared';
import { fetchActiveGames } from '../api';
import { InstallPrompt } from '../components/InstallPrompt';
import { SignIn } from '../components/SignIn';
import { useT } from '../i18n';
import { request } from '../socket';
import { useGame } from '../store/game';
import { useSession } from '../store/session';

/**
 * L'accueil.
 *
 * Un accueil de jeu doit répondre à une seule question : *comment je commence
 * une partie tout de suite ?* La version précédente présentait « Partie
 * rapide » et « Créer une partie » comme deux boutons jumeaux, sans dire ce
 * qui les distingue — et le second n'expliquait pas qu'il produit un **code à
 * partager**, qui est pourtant tout son intérêt.
 *
 * D'où trois niveaux nettement séparés :
 *
 *  1. **Reprendre** — les parties en cours d'abord. Celui qui rouvre
 *     l'application y revient neuf fois sur dix ;
 *  2. **Jouer maintenant** — une seule action, la plus grosse, sans réglage :
 *     on est placé à une table ;
 *  3. **Entre amis** — un bloc à part, avec les deux moitiés de la même
 *     mécanique côte à côte : *j'invite* (je crée, je reçois un code) et *je
 *     suis invité* (je saisis le code reçu). Elles se répondent, donc elles
 *     doivent se voir ensemble.
 *
 * Et un raccourci solo, « contre des robots », qui monte la table et lance la
 * partie d'un seul geste : c'est le chemin d'un premier essai, et il ne doit
 * pas passer par un salon vide qu'il faut comprendre avant de jouer.
 */
export function Home() {
  const t = useT();
  const { user, loading, signIn } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clear = useGame((s) => s.clear);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<OpenTable[]>([]);
  const [myGames, setMyGames] = useState<ActiveGame[] | null>(null);

  useEffect(() => clear(), [clear]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = async () => {
      const ack = await request<{ tables: OpenTable[] }>('room:openTables');
      if (alive && ack.ok) setTables(ack.tables);
    };
    void refresh();
    /*
     * On ne sonde que quand l'écran est devant les yeux.
     *
     * L'intervalle tournait sans condition : application en arrière-plan,
     * téléphone dans la poche, écran éteint — une requête toutes les cinq
     * secondes, indéfiniment. Sur une session laissée ouverte une journée, cela
     * fait quinze mille appels pour une liste que personne ne regarde, et
     * autant de radio réveillée sur la batterie du joueur.
     *
     * Au retour au premier plan on rafraîchit tout de suite : la liste doit
     * être à jour au moment précis où on la regarde, pas cinq secondes après.
     */
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(refresh, 5_000);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else stop();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  // Mes parties en cours : rafraîchies au montage et à chaque retour au premier
  // plan — c'est en rouvrant l'application qu'on veut savoir qui nous attend.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = async () => {
      const games = await fetchActiveGames();
      if (alive && games !== null) setMyGames(games);
    };
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  /*
   * Ouvrir une table, ou en rejoindre une — l'action, sans son bouton.
   *
   * Déclarée ici, au-dessus des retours anticipés, parce que les raccourcis de
   * l'icône d'application (appui long sur l'écran d'accueil) doivent pouvoir la
   * déclencher depuis un effet, et qu'un effet ne peut pas vivre plus bas.
   */
  const go = useCallback(
    async (event: 'room:create' | 'room:quickMatch') => {
      setBusy(true);
      setError(null);
      const ack = await request<{ code: string; created?: boolean }>(event);
      setBusy(false);
      if (!ack.ok) return setError(ack.error.message);
      /*
       * « Jouer maintenant » doit faire jouer.
       *
       * Le serveur répond `created: true` quand aucune table n'attendait et
       * qu'il a fallu en ouvrir une. On atterrissait alors dans un salon vide,
       * devant huit réglages et un bouton grisé « il faut 2 joueurs » — la
       * promesse du plus gros bouton de l'application débouchait sur une
       * impasse silencieuse, et c'est justement le bouton que touche quelqu'un
       * qui découvre le jeu.
       *
       * Le salon sait maintenant qu'il est né d'une partie rapide : il cherche
       * du monde à voix haute et propose de commencer sans attendre.
       */
      navigate(`/salon/${ack.code}${ack.created ? '?rapide=1' : ''}`);
    },
    [navigate],
  );

  /*
   * Les raccourcis de l'icône : `?rapide=1` et `?creer=1`.
   *
   * Android les propose sur un appui long sur l'icône, iOS dans le menu de
   * partage. Ils n'ont de valeur que s'ils agissent : atterrir sur l'accueil
   * ordinaire après avoir choisi « Créer une table » serait pire que de ne rien
   * proposer. On consomme le paramètre tout de suite — sans quoi un simple
   * retour arrière relancerait une seconde table.
   */
  const shortcut = params.get('rapide') ? 'room:quickMatch' : params.get('creer') ? 'room:create' : null;
  useEffect(() => {
    if (!user || !shortcut) return;
    setParams({}, { replace: true });
    void go(shortcut);
  }, [user, shortcut, go, setParams]);

  if (loading) return <Centered>{t.app.loading}</Centered>;
  if (!user) return <SignIn onSubmit={signIn} />;


  /*
   * Le solo, d'un seul geste.
   *
   * Monter la table puis attendre dans un salon vide n'a pas de sens quand on
   * joue contre la machine : on enchaîne création, robots et coup d'envoi, et
   * on atterrit directement à table. Trois joueurs, c'est ce qui donne une
   * vraie partie — à deux, la mémoire de la défausse ne sert presque pas.
   */
  const playBots = async () => {
    setBusy(true);
    setError(null);
    const created = await request<{ code: string }>('room:create');
    if (!created.ok) {
      setBusy(false);
      return setError(created.error.message);
    }
    for (let i = 0; i < 2; i++) {
      const bot = await request('room:addBot');
      if (!bot.ok) {
        setBusy(false);
        return setError(bot.error.message);
      }
    }
    const start = await request('game:start');
    setBusy(false);
    // Si le coup d'envoi échoue, le salon existe : on y va, l'hôte finira à la
    // main plutôt que de se retrouver devant un message sans issue.
    if (!start.ok) {
      setError(start.error.message);
      return navigate(`/salon/${created.code}`);
    }
    navigate(`/table/${created.code}`);
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
      {/*
        Le profil est une **cible**, pas une phrase.
        
        Son avatar et son pseudo se lisaient dans le texte d'accueil, et le seul
        chemin vers le profil était un lien discret tout en bas de l'écran. On
        ne trouve pas ce qu'on ne peut pas toucher : la pastille est en haut à
        droite, à l'endroit où toutes les applications la mettent.
      */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold tracking-tight">
            Zap<span className="text-volt-400">Zap</span>
          </h1>
          <p className="mt-1 text-sm text-paper-300">{t.home.tagline}</p>
        </div>
        <Link
          to="/profil"
          aria-label={t.home.myProfile(user.pseudo)}
          className="flex shrink-0 items-center gap-2 rounded-full bg-storm-800 py-1.5 pr-3 pl-1.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-storm-700 text-lg">
            {user.photo ? (
              <img src={user.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              user.avatar
            )}
          </span>
          <span className="max-w-20 truncate text-xs font-medium">{user.pseudo}</span>
        </Link>
      </header>

      {myGames !== null && myGames.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">{t.home.ongoing}</h2>
          {myGames.map((game) => (
            <button
              key={game.code}
              type="button"
              onClick={() => navigate(game.phase === 'lobby' ? `/salon/${game.code}` : `/table/${game.code}`)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-transform active:scale-[0.99] ${
                game.myTurn ? 'zz-turn bg-storm-700' : 'bg-storm-800'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {game.myTurn ? (
                    <span className="text-volt-300">{t.home.yourTurn}</span>
                  ) : game.waitingFor ? (
                    t.home.waitingFor(game.waitingFor)
                  ) : game.phase === 'lobby' ? (
                    t.home.inLobby
                  ) : (
                    t.home.roundOver
                  )}
                </span>
                <span className="block text-xs text-paper-300">
                  {t.home.gameLine(game.round, game.playersCount, game.myScore)}
                </span>
              </span>
              <span className="shrink-0 font-display text-sm font-bold tracking-widest text-paper-300">
                {game.code}
              </span>
            </button>
          ))}
        </section>
      )}

      {/* 2. Jouer maintenant — l'action par défaut, sans réglage à comprendre. */}
      <button
        type="button"
        onClick={() => void go('room:quickMatch')}
        disabled={busy}
        className="rounded-2xl bg-volt-500 px-4 py-4 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        <span className="flex items-center gap-2 font-display text-2xl font-bold text-storm-950">
          <span aria-hidden="true">⚡</span> {t.home.playNow}
        </span>
        <span className="mt-0.5 block text-xs font-medium text-storm-800">
          {t.home.playNowDetail}
        </span>
      </button>

      {/* 3. Entre amis — inviter et être invité, côte à côte. */}
      <section className="flex flex-col gap-2 rounded-2xl bg-storm-900/70 p-3">
        <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">{t.home.withFriends}</h2>

        <button
          type="button"
          onClick={() => void go('room:create')}
          disabled={busy}
          className="rounded-xl bg-storm-700 px-4 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <span className="font-display text-base font-bold">{t.home.createTable}</span>
          <span className="mt-0.5 block text-xs text-paper-300">
            {t.home.createTableDetail}
          </span>
        </button>

        <form
          className="flex flex-col gap-2 rounded-xl bg-storm-800 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void joinCode(code);
          }}
        >
          <label htmlFor="join-code" className="font-display text-base font-bold">
            {t.home.gotCode}
          </label>
          <div className="flex gap-2">
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg bg-storm-950/60 px-3 py-3 text-center font-display text-xl tracking-[0.3em] uppercase placeholder:tracking-[0.3em] placeholder:text-paper-300/30"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="shrink-0 rounded-lg bg-volt-500 px-5 font-display font-bold text-storm-950 disabled:opacity-30"
            >
              {t.home.enter}
            </button>
          </div>
        </form>
      </section>

      {/* Le solo, discret mais direct : un premier essai sans personne. */}
      <button
        type="button"
        onClick={() => void playBots()}
        disabled={busy}
        className="min-h-11 rounded-xl border border-storm-600 py-3 text-sm font-medium text-paper-100 transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {t.home.againstBots}
      </button>

      {error && <p className="rounded-xl bg-danger/20 px-4 py-2 text-sm text-danger">{error}</p>}

      {tables.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-paper-300 uppercase">
            {t.home.openTables}
          </h2>
          {tables.map((table) => (
            <button
              key={table.code}
              type="button"
              onClick={() => void joinCode(table.code)}
              disabled={busy}
              className="flex items-center justify-between gap-2 rounded-xl bg-storm-800 px-4 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="text-sm">
                  {table.hostAvatar} {table.hostPseudo}
                </span>
                <span className="block text-xs text-paper-300">{t.home.tableOf(table.hostPseudo)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-storm-700 px-2 py-1 text-xs text-paper-100">
                {table.playersCount}/{table.maxPlayers}
              </span>
            </button>
          ))}
        </section>
      )}

      {/*
        La suggestion d'ajout à l'écran d'accueil, en bas plutôt qu'en haut.

        Elle n'est pas ce que le joueur est venu faire : « Jouer maintenant » et
        ses parties en cours passent avant. Placée au-dessus d'elles, elle
        repoussait l'action principale sous la ligne de flottaison sur un petit
        écran — et une bannière qui gêne pour jouer est une bannière qu'on ferme
        sans la lire.
      */}
      <InstallPrompt />

      <nav className="mt-auto flex justify-center gap-4 pt-4 text-sm text-paper-300">
        <Link to="/regles" className="underline underline-offset-4">
          {t.home.howToPlay}
        </Link>
        <Link to="/historique" className="underline underline-offset-4">
          {t.home.history}
        </Link>
      </nav>
      <p className="text-center text-[10px] text-paper-300/60">{__APP_VERSION__}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-paper-300">{children}</div>;
}
