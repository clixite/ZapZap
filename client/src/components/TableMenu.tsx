import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameView } from '@zapzap/shared';
import { useT } from '../i18n';

/**
 * Le menu de la table : tout ce qui n'est pas un coup de jeu.
 *
 * Avant, le coin haut gauche ne proposait qu'une chose — quitter la table —
 * et cette chose ne faisait pas ce qu'elle promettait : partie commencée, elle
 * laissait le joueur assis, marqué absent, joué par le serveur à chaque tour et
 * attendu à la manche suivante. Il n'existait donc **aucun** moyen de dire « je
 * ne reviens pas », ni de revenir au menu principal sans casser la partie des
 * autres.
 *
 * Les trois sorties sont donc distinguées, parce qu'elles ne veulent pas dire
 * la même chose :
 *
 *  - **la pause** — je reste à la table, je m'absente une minute, un robot joue
 *    mes tours. C'est la sortie de loin la plus fréquente : le téléphone sonne,
 *    le bus arrive ;
 *  - **le menu principal** — je vais voir autre chose dans l'application. Ma
 *    place m'attend, en pause, et je la reprends en rouvrant la table ;
 *  - **quitter définitivement** — je sors de cette partie. Elle continue sans
 *    moi, mon score reste au tableau, et personne ne m'attend plus.
 *
 * Le menu porte aussi les règles et le profil : ce sont les deux écrans qu'on
 * veut atteindre depuis une table — vérifier un point de règle en cours de
 * manche, montrer son avatar — et une application en plein écran n'a pas de
 * barre de navigation pour y aller.
 */

export interface TableMenuProps {
  view: GameView;
  onClose: () => void;
  onPause: (away: boolean) => void | Promise<void>;
  onMenu: () => void | Promise<void>;
  onQuit: () => void | Promise<void>;
}

export function TableMenu({ view, onClose, onPause, onMenu, onQuit }: TableMenuProps) {
  const t = useT();
  const [confirmQuit, setConfirmQuit] = useState(false);
  const me = view.players.find((p) => p.id === view.you);
  const away = me?.away ?? false;
  const inGame = view.phase !== 'lobby' && view.phase !== 'game-over';

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-storm-950/70" role="dialog" aria-modal="true">
      {/* Toucher à côté referme : c'est le geste attendu d'une feuille. */}
      <button type="button" className="flex-1" aria-label={t.menu.close} onClick={onClose} />

      <div className="zz-fade-up zz-scroll max-h-[85%] overflow-y-auto rounded-t-2xl bg-storm-900 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-storm-600" aria-hidden="true" />

        <button
          type="button"
          onClick={onClose}
          className="mb-2 w-full rounded-xl bg-volt-500 py-3 font-display text-base font-bold text-storm-950"
        >
          {t.menu.resume}
        </button>

        {inGame && (
          <MenuRow
            onClick={() => void onPause(!away)}
            title={away ? t.menu.unpause : t.menu.pause}
            detail={away ? t.menu.unpauseDetail : t.menu.pauseDetail}
          />
        )}

        <MenuRow
          onClick={() => void onMenu()}
          title={t.menu.mainMenu}
          detail={inGame ? t.menu.mainMenuInGame : t.menu.mainMenuLobby}
        />

        <MenuLink to="/regles" title={t.menu.rules} detail={t.menu.rulesDetail} />
        <MenuLink to="/profil" title={t.menu.profile} detail={t.menu.profileDetail} />

        {/*
          Le départ définitif est en dernier, en rouge, et en deux temps : il ne
          se défait pas, et il change la partie de tout le monde.
        */}
        {confirmQuit ? (
          <div className="mt-2 rounded-xl bg-danger/15 p-3">
            <p className="text-sm text-paper-100">
              {inGame ? t.menu.quitInGame : t.menu.quitLobby}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void onQuit()}
                className="min-h-11 flex-1 rounded-lg bg-danger px-3 font-bold text-white"
              >
                {t.menu.quitConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmQuit(false)}
                className="min-h-11 rounded-lg px-4 text-sm text-paper-300"
              >
                {t.menu.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            className="mt-2 min-h-11 w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-danger"
          >
            {t.menu.quit}
          </button>
        )}
      </div>
    </div>
  );
}

function MenuRow({ onClick, title, detail }: { onClick: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full rounded-xl bg-storm-800 px-4 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-0.5 block text-xs text-paper-300">{detail}</span>
    </button>
  );
}

function MenuLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link
      to={to}
      className="mt-2 block rounded-xl bg-storm-800 px-4 py-3 transition-transform active:scale-[0.99]"
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-0.5 block text-xs text-paper-300">{detail}</span>
    </Link>
  );
}
