import { Link } from 'react-router-dom';
import { useT } from '../i18n';

/**
 * Les règles.
 *
 * Écrites dans l'ordre où on en a besoin quand on apprend : le but d'abord, le
 * tour ensuite, l'annonce — qui est le vrai sujet — en son milieu, et les
 * subtilités à la fin. Le tutoriel animé viendra s'y greffer : lire des règles
 * ne remplace pas voir une manche se jouer.
 *
 * Le texte lui-même vit dans les catalogues de traduction, pas ici. C'était le
 * dernier écran entièrement en français en dur : deux cents mots de prose qui
 * accueillaient en français un joueur qui avait choisi le néerlandais, sur
 * l'écran précisément fait pour celui qui ne connaît pas encore le jeu.
 */
export function Rules() {
  const t = useT();

  return (
    <div className="zz-safe mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <Link to="/" className="text-sm text-paper-300 underline underline-offset-4">
          {t.rules.back}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">{t.rules.title}</h1>
        <p className="mt-1 text-sm text-paper-300">{t.rules.subtitle}</p>
      </header>

      {t.rules.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-volt-300">{section.title}</h2>
          <Body lines={section.body} />
        </section>
      ))}
    </div>
  );
}

/**
 * Rend les lignes d'une section.
 *
 * Les puces d'une même section forment une seule liste — sinon un lecteur
 * d'écran annonce « liste de un élément » cinq fois d'affilée là où il devrait
 * annoncer « liste de cinq éléments ».
 */
function Body({ lines }: { lines: readonly string[] }) {
  const bullets = lines.filter((line) => line.startsWith('-'));
  const paragraphs = lines.filter((line) => !line.startsWith('-'));

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {paragraphs.map((line) => (
        <p key={line} className={line.startsWith('~') ? 'text-paper-300' : line.startsWith('!') ? 'font-medium text-flash-300' : undefined}>
          <Inline text={strip(line)} />
        </p>
      ))}
      {bullets.length > 0 && (
        <ul className="list-disc pl-5">
          {bullets.map((line) => (
            <li key={line}>
              <Inline text={strip(line)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Retire la marque de tête, qui n'appartient pas au texte lu. */
function strip(line: string): string {
  return /^[~!-]/.test(line) ? line.slice(1) : line;
}

/** `**gras**` — la seule mise en forme dans le texte, et la seule dont il ait besoin. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
