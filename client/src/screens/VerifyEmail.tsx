import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyMagicLink } from '../api';
import { useT } from '../i18n';
import { useSession } from '../store/session';
import { IconBolt } from '../components/icons';

/**
 * L'atterrissage du lien magique.
 *
 * Le joueur arrive ici depuis sa boîte mail, souvent sur un autre appareil que
 * celui de la demande : on vérifie le jeton, on adopte l'identité, et on
 * l'emmène à l'accueil — ses parties en cours l'y attendent.
 */
export function VerifyEmail() {
  const t = useT();
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
          <IconBolt size={30} className="text-volt-300" />
          <p className="text-paper-300">{t.verify.checking}</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-xl font-bold">{t.verify.invalid}</h1>
          <p className="text-sm text-paper-300">
            {t.verify.invalidDetail}
          </p>
          <Link to="/" className="mt-2 text-sm underline underline-offset-4">
            {t.verify.home}
          </Link>
        </>
      )}
    </div>
  );
}
