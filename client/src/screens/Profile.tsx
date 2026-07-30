import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAccount, requestMagicLink, updateProfile, uploadPhoto } from '../api';
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
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const [pseudo, setPseudo] = useState(user?.pseudo ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '⚡');
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <Link to="/" className="text-sm text-paper-300 underline underline-offset-4">
          ← Retour
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Votre profil</h1>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Changer la photo de profil"
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-storm-700 text-3xl"
          >
            {user.photo ? (
              <img src={user.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">{avatar}</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-storm-950/70 py-0.5 text-center text-[9px] text-paper-100">
              photo
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
            aria-label="Votre pseudo"
            className="min-w-0 flex-1 rounded-xl bg-storm-800 px-4 py-3 text-lg"
          />
        </div>

        {user.photo && (
          <button
            type="button"
            onClick={() => void uploadPhoto(null).then((u) => u && setUser(u))}
            className="self-start text-xs text-paper-300 underline underline-offset-2"
          >
            Retirer la photo, garder l’avatar dessiné
          </button>
        )}

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Votre avatar">
          {AVATAR_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={avatar === choice}
              aria-label={`Avatar ${choice}`}
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
          {saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-storm-800/70 p-4">
        <h2 className="font-display text-lg font-bold">Sauvegarder mon compte</h2>
        {user.email ? (
          <p className="text-sm text-paper-300">
            Compte rattaché à <strong className="text-paper-100">{user.email}</strong>. Vos parties vous
            suivent sur tous vos appareils.
          </p>
        ) : (
          <>
            <p className="text-sm text-paper-300">
              Sans e-mail, ce compte vit dans ce navigateur. Un lien magique — pas de mot de passe — le rend
              récupérable partout.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.be"
                aria-label="Votre adresse e-mail"
                className="min-w-0 flex-1 rounded-xl bg-storm-900 px-4 py-3"
              />
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={mailState === 'sending' || !email.trim()}
                className="shrink-0 rounded-xl bg-volt-500 px-4 font-display font-bold text-storm-950 disabled:opacity-40"
              >
                Envoyer
              </button>
            </div>
            {mailState === 'sent' && (
              <p className="text-sm text-success">Lien envoyé ! Ouvrez votre boîte mail sur cet appareil.</p>
            )}
            {mailState !== 'idle' && mailState !== 'sending' && mailState !== 'sent' && (
              <p className="text-sm text-danger">{mailState}</p>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-danger/40 p-4">
        <h2 className="font-display text-lg font-bold text-danger">Zone rouge</h2>
        <p className="text-sm text-paper-300">
          Supprimer le compte efface aussi l’historique et les statistiques. C’est définitif.
        </p>
        <button
          type="button"
          onClick={() => void destroy()}
          className={`rounded-xl py-3 font-display font-bold ${
            confirmDelete ? 'bg-danger text-white' : 'bg-storm-800 text-danger'
          }`}
        >
          {confirmDelete ? 'Confirmer la suppression définitive' : 'Supprimer mon compte'}
        </button>
        {confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-sm text-paper-300 underline underline-offset-2"
          >
            Non, je garde mon compte
          </button>
        )}
      </section>
    </div>
  );
}
