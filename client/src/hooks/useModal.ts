import { useEffect, useRef } from 'react';

/**
 * Ce qu'une fenêtre modale doit faire, et que la nôtre ne faisait pas.
 *
 * Trois panneaux se superposent au tapis — le menu de la partie, le tutoriel de
 * première partie, les cartes déjà passées. Tous les trois portaient
 * `role="dialog"` et `aria-modal="true"`, ce qui **promet** au lecteur d'écran
 * que le reste de la page est inerte. Aucun ne tenait la promesse : la
 * tabulation continuait de descendre dans le tapis derrière le voile, et le
 * joueur au clavier se retrouvait à sélectionner des cartes qu'il ne voyait
 * plus, sans aucun moyen de revenir. Échap ne faisait rien non plus.
 *
 * Trois choses, donc, et rien d'autre :
 *
 *  - **le focus entre** dans le panneau à l'ouverture, sinon un lecteur d'écran
 *    continue de lire là où il était, derrière ;
 *  - **il y reste** : la tabulation boucle sur les éléments du panneau ;
 *  - **Échap ferme**, et le focus revient d'où il venait — c'est ce qui rend la
 *    fermeture réversible plutôt que désorientante.
 */
export function useModal<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;

    /** Ce qui peut recevoir le focus, dans l'ordre du document. */
    const focusables = (): HTMLElement[] =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);

    // Le panneau lui-même en dernier recours : un panneau sans bouton — le
    // temps d'un rendu, ou par conception — ne doit pas laisser le focus dehors.
    const first = focusables()[0];
    if (first) first.focus();
    else {
      panel.tabIndex = -1;
      panel.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      // Seulement au bord : partout ailleurs, la tabulation native fait très
      // bien son travail, et la lui reprendre casserait l'ordre du document.
      if (document.activeElement === edge || !panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // `isConnected` : après une navigation, l'élément d'où l'on venait n'est
      // plus dans le document et lui rendre le focus ne ferait rien de bon.
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  return ref;
}
