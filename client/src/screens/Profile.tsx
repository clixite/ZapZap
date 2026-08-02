import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAccount, mailEnabled, requestMagicLink, updateProfile, uploadPhoto } from '../api';
import { CardBackPicker } from '../components/CardBackPicker';
import { LocalePicker } from '../components/LocalePicker';
import { PushToggle } from '../components/PushToggle';
import { useT } from '../i18n';
import { toAvatarPhoto } from '../photo';
import { AVATAR_CHOICES, useSession } from '../store/session';

/**
 * Le profil.
 *
 * Trois blocs, du plus courant au plus grave : l'identité (pseudo, avatar,
 * photo), la sauvegarde du compte par lien magique — c'est elle qui permet de
 * retrouver ses parties sur un autre appareil —, et la suppression, en deux
 * temps parce qu'elle emporte l'historique avec elle.
 */
export function Profile() {
  const t = useT();
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const [pseudo, setPseudo] = useState(user?.pseudo ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '⚡');
  /*
   * Le formulaire se remplit quand le compte arrive.
   *
   * Ouvrir `/profil` directement — depuis un signet, ou en rechargeant — rendait
   * l'écran une première fois sans compte : les champs naissaient vides et le
   * restaient, puisqu'un `useState` ne se réévalue pas. On voyait donc son
   * profil avec un pseudo effacé, ce qui donne surtout envie de le retaper.
   */
  const known = useRef<string | null>(null);
  if (user && known.current !== user.id) {
    known.current = user.id;
    if (user.pseudo !== pseudo) setPseudo(user.pseudo);
    if (user.avatar !== avatar) setAvatar(user.avatar);
  }
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /*
   * L'envoi d'e-mails n'est pas toujours configuré sur le serveur.
   *
   * Offrir un champ qui répondra « service indisponible » après coup fait
   * perdre son temps au joueur et ressemble à une panne. On demande d'abord,
   * et on n'affiche le bloc que s'il mène quelque part.
   */
  const [canMail, setCanMail] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void mailEnabled().then((yes) => alive && setCanMail(yes));
    return () => {
      alive = false;
    };
  }, []);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-paper-300">
        <Link to="/" className="underline underline-offset-4">
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  const save = async () => {
    const updated = await updateProfile(pseudo.trim() || user.pseudo, avatar);
    if (updated) {
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const photo = await toAvatarPhoto(file);
      const updated = await uploadPhoto(photo);
      if (updated) setUser(updated);
    } catch {
      /* image illisible : on garde l'avatar */
    }
  };

  const sendLink = async () => {
    if (!email.trim()) return;
    setMailState('sending');
    const error = await requestMagicLink(email.trim());
    setMailState(error ?? 'sent');
  };

  const destroy = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (await deleteAccount()) location.assign('/');
  };

  return (
    <div className="zz-safe mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-paper-300 underline underline-offset-4">
          {t.profile.back}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">{t.profile.title}</h1>
      </header>

      {/*
        La langue vit ici, en haut du profil : c'est l'écran où l'on va quand
        quelque chose ne va pas dans son compte, et une interface qu'on ne lit
        pas est le premier de ces problèmes.
      */}
      <LocalePicker />
      <CardBackPicker />
      <PushToggle />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t.profile.photoLabel}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-storm-700 text-3xl"
          >
            {user.photo ? (
              <img src={user.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">{avatar}</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-storm-950/70 py-0.5 text-center text-[9px] text-paper-100">
              {t.profile.photoBadge}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            maxLength={20}
            aria-label={t.profile.pseudoLabel}
            className="min-w-0 flex-1 rounded-xl bg-storm-800 px-4 py-3 text-lg"
          />
        </div>

        {user.photo && (
          <button
            type="button"
            onClick={() => void uploadPhoto(null).then((u) => u && setUser(u))}
            className="self-start text-xs text-paper-300 underline underline-offset-2"
          >
            {t.profile.removePhoto}
          </button>
        )}

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.profile.avatarGroup}>
          {AVATAR_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={avatar === choice}
              aria-label={t.profile.avatarNamed(choice)}
              onClick={() => setAvatar(choice)}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform ${
                avatar === choice ? 'bg-volt-500 scale-110' : 'bg-storm-800'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          className="rounded-xl bg-volt-500 py-3 font-display font-bold text-storm-950"
        >
          {saved ? t.profile.saved : t.profile.save}
        </button>
      </section>

      {(canMail !== false || user.email) && (
      <section className="flex flex-col gap-2 rounded-2xl bg-storm-800/70 p-4">
        <h2 className="font-display text-lg font-bold">{t.profile.saveAccount}</h2>
        {user.email ? (
          <p className="text-sm text-paper-300">
            {t.profile.linkedTo} <strong className="text-paper-100">{user.email}</strong>.{' '}
            {t.profile.linkedDetail}
          </p>
        ) : (
          <>
            <p className="text-sm text-paper-300">
              {t.profile.noEmail}
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.profile.emailPlaceholder}
                aria-label={t.profile.emailLabel}
                className="min-w-0 flex-1 rounded-xl bg-storm-900 px-4 py-3"
              />
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={mailState === 'sending' || !email.trim()}
                className="shrink-0 rounded-xl bg-volt-500 px-4 font-display font-bold text-storm-950 disabled:opacity-40"
              >
                {t.profile.send}
              </button>
            </div>
            {mailState === 'sent' && (
              <p className="text-sm text-success">{t.profile.linkSent}</p>
            )}
            {mailState !== 'idle' && mailState !== 'sending' && mailState !== 'sent' && (
              <p className="text-sm text-danger">{mailState}</p>
            )}
          </>
        )}
      </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-danger/40 p-4">
        <h2 className="font-display text-lg font-bold text-danger">{t.profile.redZone}</h2>
        <p className="text-sm text-paper-300">
          {t.profile.deleteWarning}
        </p>
        <button
          type="button"
          onClick={() => void destroy()}
          className={`rounded-xl py-3 font-display font-bold ${
            confirmDelete ? 'bg-danger-solid text-white' : 'bg-storm-800 text-danger'
          }`}
        >
          {confirmDelete ? t.profile.confirmDeleteFinal : t.profile.danger}
        </button>
        {confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-sm text-paper-300 underline underline-offset-2"
          >
            {t.profile.keepMyAccount}
          </button>
        )}
      </section>
    </div>
  );
}
