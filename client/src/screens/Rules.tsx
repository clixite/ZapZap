import { Link } from 'react-router-dom';
import { DEAL_MAX, DEAL_MIN, ELIMINATION_SCORE, MISS_PENALTY } from '@zapzap/shared';

/**
 * Les règles.
 *
 * Écrites dans l'ordre où on en a besoin quand on apprend : le but d'abord, le
 * tour ensuite, l'annonce — qui est le vrai sujet — en son milieu, et les
 * subtilités à la fin. Le tutoriel animé viendra s'y greffer : lire des règles
 * ne remplace pas voir une manche se jouer.
 */
export function Rules() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <Link to="/" className="text-sm text-paper-300 underline underline-offset-4">
          ← Retour
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Comment on joue</h1>
        <p className="mt-1 text-sm text-paper-300">De 2 à 6 joueurs, 20 à 40 minutes.</p>
      </header>

      <Section title="Le but">
        <p>
          Contrairement à la belote ou au whist, on ne cherche pas à faire des levées. On cherche à avoir la
          main la plus faible, pour pouvoir annoncer <strong>ZapZap</strong> avant les autres.
        </p>
        <p>
          Le premier joueur à atteindre {ELIMINATION_SCORE} points est éliminé. On joue jusqu’au dernier
          debout.
        </p>
      </Section>

      <Section title="Ce que valent les cartes">
        <p>
          As&nbsp;: 1 point. De 2 à 10&nbsp;: leur valeur. Valet, Dame, Roi&nbsp;: 10 points. Joker&nbsp;: 0.
        </p>
        <p className="text-paper-300">
          Cette valeur ne sert qu’au décompte. Elle n’a aucune influence sur ce que vous pouvez poser —
          c’est le rang qui compte. Un Roi et une Dame valent 10 tous les deux, ils ne font pas une paire
          pour autant.
        </p>
      </Section>

      <Section title="La donne">
        <p>
          À chaque manche, le donneur choisit combien de cartes distribuer, entre {DEAL_MIN} et {DEAL_MAX}
          &nbsp;— <strong>le même nombre pour tout le monde, lui compris</strong>. La donne tourne vers la
          gauche, chacun exerce ce pouvoir à son tour.
        </p>
        <p className="text-paper-300">
          Court, la manche est une course à qui descend le premier. Long, il y a de quoi construire des
          suites et lâcher gros d’un coup — mais beaucoup à encaisser si quelqu’un annonce.
        </p>
      </Section>

      <Section title="Votre tour : deux actions">
        <p>
          <strong>1. Défaussez.</strong> Une carte seule, un ensemble (paire, brelan, carré), ou une suite
          d’au moins 3 cartes de même couleur. L’As est bas&nbsp;: A-2-3 est une suite, Dame-Roi-As non. Une
          seule combinaison par tour.
        </p>
        <p>
          <strong>2. Repiochez exactement une carte.</strong> Au talon, à l’aveugle, ou dans la défausse du
          tour précédent. Sur une suite, seulement la carte de tête ou de queue. Sur un ensemble, n’importe
          laquelle.
        </p>
        <p className="text-paper-300">
          Vous repiochez toujours, même si vous venez de vider votre main. Il est donc impossible de finir un
          tour sans carte — et une main sans combinaison ne raccourcit jamais.
        </p>
      </Section>

      <Section title="L’annonce">
        <p>
          En début de tour, avant de défausser, si votre main vaut 5 points ou moins&nbsp;: vous pouvez
          annoncer. Tout le monde abat son jeu.
        </p>
        <p>
          <strong>Personne en dessous&nbsp;?</strong> Vous marquez 0, chacun marque le total de sa main.
        </p>
        <p>
          <strong>Quelqu’un fait aussi bien ou mieux&nbsp;?</strong> Vous prenez {MISS_PENALTY} points. Ceux
          qui vous battent marquent 0, les autres leur main.
        </p>
        <p className="font-medium text-flash-300">
          L’égalité profite toujours au contre-attaquant, jamais à l’annonceur. Annoncer à 5 pile est un vrai
          pari.
        </p>
      </Section>

      <Section title="Le rebond">
        <p>
          Si votre score tombe <strong>exactement</strong> sur 50, il redescend à 25. S’il tombe exactement
          sur 100, il redescend à 50 et vous n’êtes pas éliminé.
        </p>
        <p className="text-paper-300">
          C’est ce qui relance les parties qui s’enlisent — et il arrive qu’on cherche à prendre exactement
          le nombre de points qui sauve.
        </p>
      </Section>

      <Section title="Quelques réflexes">
        <ul className="list-disc pl-5">
          <li>Purgez les figures en priorité. Trois figures, c’est 30 points si quelqu’un annonce.</li>
          <li>
            Piochez à l’aveugle par défaut. Prendre dans la défausse renseigne toute la table sur ce que vous
            construisez.
          </li>
          <li>
            Comptez les cartes des autres. Un joueur qui pose trois cartes par tour et n’en remonte qu’une
            descend vite&nbsp;: n’annoncez pas à 5 contre lui.
          </li>
          <li>Ne gardez jamais une combinaison pour plus tard. Une paire de Rois, c’est 20 points qui dorment.</li>
          <li>Quand vous donnez, servez court si vous menez au score.</li>
        </ul>
      </Section>

      <Section title="Bon à savoir">
        <p className="text-paper-300">
          L’application ne vous laisse jamais jouer un coup illégal&nbsp;: pas d’annonce hors tour, pas de
          combinaison invalide, donc aucune des pénalités de maladresse du jeu sur table. Si une manche se
          bloque — cela arrive quand plus personne ne peut apparier ses cartes — elle se termine d’elle-même
          au bout d’un long moment&nbsp;: chacun compte sa main, sans pénalité.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-volt-300">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
