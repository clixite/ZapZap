import { useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { usePwa } from './pwa';
import { GameOver } from './screens/GameOver';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Profile } from './screens/Profile';
import { Rules } from './screens/Rules';
import { Table } from './screens/Table';
import { VerifyEmail } from './screens/VerifyEmail';
import { useGame } from './store/game';
import { useSession } from './store/session';

export function App() {
  const restore = useSession((s) => s.restore);
  const connected = useSession((s) => s.connected);
  const user = useSession((s) => s.user);
  const updateReady = usePwa((s) => s.updateReady);
  const applyUpdate = usePwa((s) => s.apply);
  // Le bandeau de mise à jour attend la fin de la manche : recharger en plein
  // tour, même volontairement, ferait perdre la sélection en cours.
  const view = useGame((s) => s.view);
  const inGame = view !== null && view.phase !== 'lobby' && view.phase !== 'game-over';

  useEffect(() => {
    void restore();
  }, [restore]);

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
      {/* La nouvelle version attend le geste du joueur — jamais en plein tour. */}
      {updateReady && !inGame && (
        <button
          type="button"
          onClick={applyUpdate}
          className="fixed inset-x-4 top-2 z-50 rounded-xl bg-volt-500 px-4 py-3 text-sm font-bold text-storm-950 shadow-lg"
        >
          Nouvelle version disponible — toucher pour recharger
        </button>
      )}
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
    </Router>
  );
}

function InviteLink() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/salon/${(code ?? '').toUpperCase()}`} replace />;
}
