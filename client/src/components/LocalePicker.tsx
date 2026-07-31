import { useState } from 'react';
import { LOCALES, LOCALE_NAMES, setLocale, useLocale, useT, type Locale } from '../i18n';
import { vibrate } from '../haptics';

/**
 * Le choix de la langue.
 *
 * La langue de l'appareil s'applique d'office au premier lancement : ce
 * sélecteur ne sert qu'à la corriger — quelqu'un qui vit en Belgique et dont le
 * téléphone est en anglais, un joueur de passage. Il n'a donc aucune raison de
 * monopoliser l'écran, et il est replié par défaut.
 *
 * Les langues sont écrites **dans leur propre langue**. C'est la seule façon de
 * reconnaître la sienne quand l'interface est dans une langue qu'on ne lit pas,
 * et c'est précisément la situation de celui qui cherche ce réglage.
 */
export function LocalePicker({ variant = 'row' }: { variant?: 'row' | 'inline' }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(variant === 'inline');

  const choose = (next: Locale) => {
    vibrate('tap');
    void setLocale(next);
    if (variant === 'row') setOpen(false);
  };

  const list = (
    <div className="zz-scroll grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto" role="listbox" aria-label={t.language}>
      {LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="option"
            aria-selected={selected}
            data-locale={code}
            onClick={() => choose(code)}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm transition active:scale-95 ${
              selected ? 'bg-volt-500 font-bold text-storm-950' : 'bg-storm-800 text-paper-100'
            }`}
          >
            <span className="text-[10px] font-bold tracking-wide uppercase opacity-60">{code}</span>
            <span className="min-w-0 flex-1 truncate">{LOCALE_NAMES[code]}</span>
            {selected && <span aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );

  if (variant === 'inline') return list;

  return (
    <div className="rounded-xl bg-storm-800 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 text-left"
      >
        <span aria-hidden="true" className="text-lg">
          🌍
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t.language}</span>
          <span className="block text-xs text-paper-300">{LOCALE_NAMES[locale]}</span>
        </span>
        <span className={`text-paper-300 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && <div className="pt-3">{list}</div>}
    </div>
  );
}
