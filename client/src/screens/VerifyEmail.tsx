import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyMagicLink } from '../api';
import { useSession } from '../store/session';

/**
 * L'atterrissage du lien magique.
 *
 * Le joueur arrive ici depuis sa boîte mail, souvent sur un autre appareil que
 * celui de la demande : on vérifie le jeton, on adopte l'identité, et on
 * l'emmène à l'accueil — ses parties en cours l'y attendent.
 */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const adopt = useSession((s) => s.adopt);
  const [state, setState] = useState<'pending' | 'error'>('pending');

  useEffect(() => {
    const token = params.get('t');
    if (!token) {
      setState('error');
      return;
    }
    let alive = true;
    void verifyMagicLink(token).then((result) => {
      if (!alive) return;
      if (!result) {
        setState('error');
        return;
      }
      adopt(result.token, result.user);
      navigate('/', { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [params, adopt, navigate]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {state === 'pending' ? (
        <>
          <span className="text-3xl" aria-hidden="true">
            ⚡
          </span>
          <p className="text-paper-300">Vérification du lien…</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-xl font-bold">Lien invalide ou expiré</h1>
          <p className="text-sm text-paper-300">
            Un lien magique ne vit que quinze minutes. Redemandez-en un depuis votre profil.
          </p>
          <Link to="/" className="mt-2 text-sm underline underline-offset-4">
            Retour à l’accueil
          </Link>
        </>
      )}
    </div>
  );
}
