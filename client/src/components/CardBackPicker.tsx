import { useT } from '../i18n';
import { vibrate } from '../haptics';
import {
  CARD_BACKS,
  CARD_BACK_STYLES,
  setCardBack,
  setColorblind,
  useCardBack,
  useColorblind,
  type CardBackId,
} from '../store/theme';

/**
 * Le choix du dos de carte.
 *
 * On choisit un dos en le voyant, pas en lisant son nom : chaque option est
 * donc le dos lui-même, en miniature. C'est aussi pour cela qu'il n'y en a que
 * cinq — au-delà, la rangée devient une liste qu'on fait défiler sans regarder.
 */
export function CardBackPicker() {
  const t = useT();
  const current = useCardBack();
  const colorblind = useColorblind();

  const choose = (id: CardBackId) => {
    vibrate('tap');
    setCardBack(id);
  };

  return (
    <section className="rounded-xl bg-storm-800 p-3">
      <h2 className="text-sm font-medium">{t.theme.cardBack}</h2>
      <p className="mt-0.5 text-xs text-paper-300">{t.theme.cardBackDetail}</p>
      <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label={t.theme.cardBack}>
        {CARD_BACKS.map((id) => {
          const style = CARD_BACK_STYLES[id];
          const selected = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.theme.names[id]}
              data-cardback={id}
              onClick={() => choose(id)}
              className={`rounded-lg p-1 transition-transform active:scale-95 ${
                selected ? 'bg-volt-500' : 'bg-transparent'
              }`}
            >
              <span
                className="relative block overflow-hidden rounded-[7%/4.7%]"
                style={{
                  width: 44,
                  height: 66,
                  background: style.background,
                  border: style.border,
                  boxShadow: 'var(--shadow-card)',
                }}
                aria-hidden="true"
              >
                <span
                  className="absolute inset-0"
                  style={{ backgroundImage: style.pattern, opacity: style.patternOpacity }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-center text-lg leading-none opacity-45"
                  style={{ color: style.glyph }}
                >
                  ⚡
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        Le paquet à quatre couleurs, juste sous les dos : c'est le même sujet —
        à quoi ressemblent mes cartes — et c'est là qu'on le cherchera. L'isoler
        dans un écran « accessibilité » reviendrait à le cacher à ceux qui en
        ont besoin sans savoir qu'il porte ce nom.
      */}
      <label className="mt-4 flex items-start gap-3 border-t border-storm-700 pt-3">
        <input
          type="checkbox"
          checked={colorblind}
          onChange={(e) => {
            vibrate('tap');
            setColorblind(e.target.checked);
          }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-volt-500"
        />
        <span>
          <span className="block text-sm font-medium">{t.theme.fourColours}</span>
          <span className="block text-xs text-paper-300">{t.theme.fourColoursDetail}</span>
        </span>
      </label>
    </section>
  );
}
