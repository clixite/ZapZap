import { useEffect, useRef, useState } from 'react';
import type { EmoteId, GameView, TransientEvent } from '@zapzap/shared';

/**
 * Ce que la table raconte pendant qu'on joue.
 *
 * Le serveur diffuse un événement transitoire à chaque geste — pose, pioche,
 * annonce, arrivée, départ. Sans restitution, un joueur ne voit la partie
 * avancer que par différence entre deux états : il sait que quelque chose s'est
 * passé, jamais quoi. Ces composants transforment le flux en trois choses :
 *
 *  - une **ligne d'annonce** éphémère, doublée d'une région `aria-live` pour
 *    les lecteurs d'écran — le même texte sert aux deux publics ;
 *  - des **bulles d'émotes** au-dessus des sièges ;
 *  - le **compte à rebours** du tour, qui rend visible ce que le serveur fait
 *    déjà : jouer à la place de celui qui laisse filer son temps.
 */

export const EMOTE_GLYPHS: Record<EmoteId, string> = {
  clap: '👏',
  slap: '🫳',
  kiss: '😘',
  laugh: '😂',
  cry: '😭',
  fire: '🔥',
  think: '🤔',
  wow: '😮',
};

const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' };
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'V', 12: 'D', 13: 'R' };

function shortCard(card: { suit: string; rank: number }): string {
  return `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_GLYPH[card.suit] ?? ''}`;
}

/** Le texte d'un événement, avec les pseudos de la table. */
export function eventText(event: TransientEvent, view: GameView): string | null {
  const name = (id: string) => view.players.find((p) => p.id === id)?.pseudo ?? '…';
  const isMe = (id: string) => id === view.you;

  switch (event.type) {
    case 'player-joined':
      return `${event.pseudo} rejoint la table`;
    case 'player-left':
      return `${event.pseudo} quitte la table`;
    case 'dealt':
      return `${isMe(event.dealerId) ? 'Vous donnez' : `${name(event.dealerId)} donne`} ${event.handSize} cartes`;
    case 'discarded': {
      if (isMe(event.playerId)) return null; // on vient de le faire soi-même
      const cards = event.combo.cards.map(shortCard).join(' ');
      return `${name(event.playerId)} pose ${cards}`;
    }
    case 'drew-stock':
      return isMe(event.playerId) ? null : `${name(event.playerId)} pioche à l’aveugle`;
    case 'drew-discard':
      // Information de jeu capitale : tout le monde doit savoir ce qui a été
      // ramassé, c'est le « il construit quelque chose » du §9.2.
      return `${isMe(event.playerId) ? 'Vous ramassez' : `${name(event.playerId)} ramasse`} le ${shortCard(event.card)}`;
    case 'zap-called':
      return `⚡ ${name(event.playerId)} annonce ZapZap — ${event.success ? 'réussi !' : 'contré !'}`;
    case 'player-eliminated':
      return `${name(event.playerId)} est éliminé`;
    case 'player-disconnected':
      return `${name(event.playerId)} a perdu la connexion`;
    case 'player-reconnected':
      return `${name(event.playerId)} est de retour`;
    case 'player-away':
      return event.away
        ? `${name(event.playerId)} fait une pause — un robot joue pour lui`
        : `${name(event.playerId)} reprend sa place`;
    case 'host-changed':
      return `${name(event.hostId)} devient l’hôte`;
    case 'round-scored':
    case 'rematch':
    case 'emote':
      return null; // rendus autrement (écran de décompte, bulle)
  }
}

/**
 * La ligne d'annonce : un événement à la fois, quelques secondes.
 *
 * Elle vit au-dessus de la ligne d'état et ne pousse rien : les annonces
 * passent, la mise en page ne bronche pas.
 */
export function EventTicker({ view, lastEvent }: { view: GameView; lastEvent: TransientEvent | null }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    const line = eventText(lastEvent, view);
    if (!line) return;
    setText(line);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // La vue change à chaque coup : ne réagir qu'à l'événement, sinon la ligne
    // se réafficherait à chaque diffusion d'état.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  return (
    <div aria-live="polite" className="pointer-events-none flex h-6 items-center justify-center px-4">
      {text && (
        <span className="zz-fade-up max-w-full truncate rounded-full bg-storm-950/80 px-3 py-0.5 text-xs text-paper-100">
          {text}
        </span>
      )}
    </div>
  );
}

/** Suit les émotes et rend, par joueur, la bulle en cours. */
export function useEmoteBubbles(lastEvent: TransientEvent | null): Record<string, EmoteId> {
  const [bubbles, setBubbles] = useState<Record<string, EmoteId>>({});

  useEffect(() => {
    if (lastEvent?.type !== 'emote') return;
    const { playerId, emote } = lastEvent;
    setBubbles((current) => ({ ...current, [playerId]: emote }));
    const timer = setTimeout(() => {
      setBubbles((current) => {
        const { [playerId]: _gone, ...rest } = current;
        return rest;
      });
    }, 2600);
    return () => clearTimeout(timer);
  }, [lastEvent]);

  return bubbles;
}

/**
 * Le compte à rebours du tour.
 *
 * Le serveur joue à la place du joueur qui laisse filer son temps — c'était
 * déjà vrai, mais invisible : on se faisait jouer une carte sans avertissement.
 * La barre descend, passe à l'ambre dans les dix dernières secondes, et le
 * texte est annoncé aux lecteurs d'écran au même moment.
 */
export function TurnCountdown({ deadline, mine }: { deadline: number; mine: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline]);

  const remaining = Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  // La durée totale n'est pas transmise : on la déduit du premier affichage.
  const totalRef = useRef(remaining);
  if (remaining > totalRef.current) totalRef.current = remaining;
  const ratio = totalRef.current > 0 ? remaining / totalRef.current : 0;
  const urgent = seconds <= 10;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-0.5">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-storm-700">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{
            width: `${ratio * 100}%`,
            background: urgent ? 'var(--color-flash-400)' : 'var(--color-volt-400)',
          }}
        />
      </div>
      {mine && urgent && (
        <span className="text-[11px] font-bold text-flash-300" role="status" aria-live="assertive">
          {seconds} s avant que le tour ne se joue tout seul
        </span>
      )}
    </div>
  );
}
