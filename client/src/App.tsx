import { useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { GameOver } from './screens/GameOver';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Rules } from './screens/Rules';
import { Table } from './screens/Table';
import { useSession } from './store/session';

export function App() {
  const restore = useSession((s) => s.restore);
  const connected = useSession((s) => s.connected);
  const user = useSession((s) => s.user);

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/salon/:code" element={<Lobby />} />
        <Route path="/table/:code" element={<Table />} />
        <Route path="/fin/:code" element={<GameOver />} />
        <Route path="/regles" element={<Rules />} />
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
