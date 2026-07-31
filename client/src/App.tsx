import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { SignIn } from './components/SignIn';
import { isLaunching, usePwa } from './pwa';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { useView } from './store/game';
import { useSession } from './store/session';

/*
 * Chargés à la demande.
 *
 * Accueil, salon et table sont le chemin critique : on les garde dans le
 * premier paquet. Les autres écrans — règles, historique, profil, fin de
 * partie, vérification d'e-mail — ne sont visités qu'occasionnellement et
 * n'ont aucune raison de retarder l'affichage du jeu.
 */
const GameOver = lazy(() => import('./screens/GameOver').then((m) => ({ default: m.GameOver })));
const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })));
const Profile = lazy(() => import('./screens/Profile').then((m) => ({ default: m.Profile })));
const Rules = lazy(() => import('./screens/Rules').then((m) => ({ default: m.Rules })));
const VerifyEmail = lazy(() => import('./screens/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));

export function App() {
  const restore = useSession((s) => s.restore);
  const connected = useSession((s) => s.connected);
  const user = useSession((s) => s.user);
  const updateReady = usePwa((s) => s.updateReady);
  const applyUpdate = usePwa((s) => s.apply);
  // La mise à jour attend la fin de la manche : recharger en plein tour ferait
  // perdre la sélection de cartes et le tour de jeu.
  const view = useView();
  const inGame = view !== null && view.phase !== 'lobby' && view.phase !== 'game-over';

  useEffect(() => {
    void restore();
  }, [restore]);

  /*
   * La nouvelle version s'installe d'elle-même.
   *
   * Demander « voulez-vous recharger ? » revenait à faire arbitrer au joueur un
   * détail d'installation dont il ne peut rien savoir — et à laisser tourner des
   * versions anciennes chez ceux qui répondent non, ou qui ne lisent pas le
   * bandeau.
   *
   * **Au lancement, c'est sans condition** : c'est précisément le moment où l'on
   * veut la certitude de tourner sur la dernière version, et il n'y a rien à
   * perdre — pas de sélection de cartes en cours, pas de tour entamé. Passé les
   * premières secondes, la prudence revient : une version qui arrive en pleine
   * manche attend la fin de la partie, et cet effet se redéclenche quand
   * `inGame` retombe.
   */
  useEffect(() => {
    if (updateReady && (isLaunching() || !inGame)) applyUpdate();
  }, [updateReady, inGame, applyUpdate]);

  return (
    <Router>
      {/*
        La perte de connexion est signalée en permanence plutôt qu'en fugace :
        sur un téléphone qui change de réseau, le joueur doit comprendre
        pourquoi ses coups ne partent pas, sans avoir à deviner.
      */}
      {user && !connected && (
        <div
          className="fixed inset-x-0 top-0 z-50 bg-flash-400 py-1 text-center text-xs font-medium text-storm-950"
          role="status"
        >
          Reconnexion…
        </div>
      )}
      {/*
        En pleine partie, la version prête ne s'installe pas : on la signale, et
        celui qui préfère ne pas attendre la fin peut la prendre tout de suite.
      */}
      {updateReady && inGame && (
        <button
          type="button"
          onClick={applyUpdate}
          className="fixed inset-x-4 top-2 z-50 rounded-xl bg-volt-500 px-4 py-3 text-sm font-bold text-storm-950 shadow-lg"
        >
          Nouvelle version prête — elle s’installera après la partie
        </button>
      )}
      <Suspense fallback={<div className="h-full" />}>
          <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/salon/:code"
            element={
              <RequireAccount>
                <Lobby />
              </RequireAccount>
            }
          />
          <Route
            path="/table/:code"
            element={
              <RequireAccount>
                <Table />
              </RequireAccount>
            }
          />
          <Route
            path="/fin/:code"
            element={
              <RequireAccount>
                <GameOver />
              </RequireAccount>
            }
          />
          <Route path="/regles" element={<Rules />} />
          <Route
            path="/historique"
            element={
              <RequireAccount>
                <History />
              </RequireAccount>
            }
          />
          <Route
            path="/profil"
            element={
              <RequireAccount>
                <Profile />
              </RequireAccount>
            }
          />
        {/* L'atterrissage du lien magique reçu par e-mail. */}
          <Route path="/verify" element={<VerifyEmail />} />
        {/* Lien d'invitation court : /j/CODE ouvre directement le salon. */}
          <Route path="/j/:code" element={<InviteLink />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

function InviteLink() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/salon/${(code ?? '').toUpperCase()}`} replace />;
}

/**
 * Le passage obligé par le compte — et le point de rupture de l'invitation.
 *
 * Un ami reçoit le lien par WhatsApp, le touche, arrive sur `/salon/ABCD` et…
 * n'a pas de compte. L'écran attendait une session qui ne viendrait jamais et
 * affichait « Connexion au salon… » indéfiniment : l'invitation ne menait
 * nulle part, et c'est celui qu'on invite — donc le nouveau joueur, celui qu'on
 * ne peut pas se permettre de perdre — qui restait dehors.
 *
 * L'inscription se fait donc **sur place**, sans détour par l'accueil et sans
 * perdre le code : le formulaire s'affiche à la place de l'écran demandé, en
 * disant à quelle table on est attendu, puis l'écran s'ouvre de lui-même — la
 * route n'a pas changé, seul le compte manquait.
 */
function RequireAccount({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn } = useSession();
  const { code } = useParams<{ code: string }>();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-paper-300">Un instant…</div>;
  }
  if (user) return <>{children}</>;

  return (
    <SignIn
      onSubmit={signIn}
      intro={
        code ? (
          <p className="text-center text-sm text-paper-300">
            Vous êtes invité à la table{' '}
            <strong className="font-display tracking-widest text-volt-300">{code}</strong>. Choisissez un
            nom et entrez.
          </p>
        ) : undefined
      }
    />
  );
}
