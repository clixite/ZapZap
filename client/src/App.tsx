import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { usePwa } from './pwa';
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
   * La nouvelle version s'installe d'elle-même dès que c'est sans conséquence.
   *
   * Demander « voulez-vous recharger ? » revenait à faire arbitrer au joueur un
   * détail d'installation dont il ne peut rien savoir — et à laisser tourner des
   * versions anciennes chez ceux qui répondent non, ou qui ne lisent pas le
   * bandeau. Hors partie, le rechargement est invisible : on le fait. En pleine
   * manche, on ne touche à rien, et cet effet se redéclenchera à la fin de la
   * partie, quand `inGame` retombera.
   */
  useEffect(() => {
    if (updateReady && !inGame) applyUpdate();
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
          <Route path="/salon/:code" element={<Lobby />} />
          <Route path="/table/:code" element={<Table />} />
          <Route path="/fin/:code" element={<GameOver />} />
          <Route path="/regles" element={<Rules />} />
          <Route path="/historique" element={<History />} />
          <Route path="/profil" element={<Profile />} />
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
