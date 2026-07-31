import type { ZapVariants } from './rules';

/** `X` est la couleur fictive des jokers. */
export type Suit = 'S' | 'H' | 'D' | 'C' | 'X';

/**
 * Rang d'une carte. L'As vaut 1 et se range en bas (A-2-3 est une suite,
 * D-R-A n'en est pas une), donc pas de rang 14.
 *
 * Les rangs 0 et 1 en couleur `X` sont les deux jokers : ils ne servent qu'à
 * leur donner des identifiants distincts et ne sont jamais comparés à un rang
 * ordinaire — toute la logique de combinaison traite les jokers à part.
 */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Identifiant compact d'une carte, ex. `S13` = roi de pique. */
export type CardId = string;

/* ------------------------------------------------------------------ */
/* Combinaisons                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on peut poser en un tour.
 *
 * - `single` : une carte, toujours légal ;
 * - `set`    : 2 à 4 cartes de même rang (paire, brelan, carré), ou 2 jokers ;
 * - `run`    : au moins 3 cartes consécutives de même couleur (variante : 2, ou
 *              toutes couleurs). Jamais de joker dedans.
 */
export type ComboKind = 'single' | 'set' | 'run';

export interface Combo {
  kind: ComboKind;
  cards: Card[];
}

/* ------------------------------------------------------------------ */
/* Joueurs et comptes                                                  */
/* ------------------------------------------------------------------ */

export interface PublicUser {
  id: string;
  pseudo: string;
  avatar: string;
  /** Photo de profil en JPEG data URL (96×96) ; `null` pour un avatar dessiné. */
  photo: string | null;
  email: string | null;
  isGuest: boolean;
}

export interface Player {
  id: string;
  pseudo: string;
  avatar: string;
  photo?: string | null;
  seat: number;
  connected: boolean;
  totalScore: number;
  /**
   * Sorti de la partie pour avoir atteint 100 points.
   *
   * Sans équivalent dans un jeu à durée fixe : ici un joueur peut quitter la
   * table alors que la partie continue. Son siège est sauté dans l'ordre du tour
   * comme dans la rotation du donneur, mais il reste affiché au tableau des
   * scores — c'est le sel de la fin de partie.
   */
  eliminated: boolean;
  /**
   * En pause : un robot joue à sa place, jusqu'à ce qu'il revienne.
   *
   * Différent de `connected`, qui subit la coupure réseau : celui-ci est un
   * choix. On quitte une table sans quitter la partie — le téléphone sonne, le
   * bus arrive, le repas est prêt — et la table continue de tourner à la même
   * vitesse au lieu d'attendre trente secondes de minuteur à chaque tour.
   *
   * Le remplaçant ne fait qu'une chose de moins que le joueur : il n'annonce
   * jamais. Une annonce est un pari à trente points, elle appartient à celui
   * qui la prend.
   */
  away: boolean;
  /**
   * Parti pour de bon, de son plein gré.
   *
   * `eliminated` sans `forfeited` veut dire « sorti à 100 points » ; les deux
   * ensemble, « a quitté la partie ». La distinction se lit au tableau des
   * scores, et elle évite de faire passer un départ pour une défaite.
   */
  forfeited?: boolean;
  /** Rang final (1 = vainqueur), renseigné à mesure que les joueurs sortent. */
  finishRank?: number;
}

/* ------------------------------------------------------------------ */
/* Journal de manche                                                   */
/* ------------------------------------------------------------------ */

/**
 * Tout ce qui s'est passé publiquement dans la manche.
 *
 * Compter les cartes qui sont passées est une compétence centrale du jeu (§9.3
 * des règles) : l'information ne peut donc pas être reconstruite après coup ou
 * approximée côté client. Le journal est la source unique — il alimente le
 * panneau « cartes déjà passées », il sert de mémoire aux robots, et il permet
 * de rejouer une manche à l'identique.
 *
 * Il ne contient **que** de l'information publique. Une pioche à l'aveugle y
 * figure comme un événement sans carte : tout le monde sait que le joueur a
 * pioché, personne ne sait quoi.
 */
export type RoundEvent =
  | { type: 'deal'; dealerSeat: number; handSize: number; upCard: Card }
  | { type: 'discard'; playerId: string; combo: Combo }
  | { type: 'draw-stock'; playerId: string }
  | { type: 'draw-discard'; playerId: string; card: Card }
  | { type: 'reshuffle'; cards: number }
  | { type: 'zap'; playerId: string; handValue: number; success: boolean }
  | { type: 'stalemate'; turns: number };

/* ------------------------------------------------------------------ */
/* État de partie                                                      */
/* ------------------------------------------------------------------ */

export type Phase = 'lobby' | 'dealing' | 'playing' | 'round-scoring' | 'game-over';

/**
 * L'étape en cours du tour.
 *
 * Un tour de ZapZap n'est pas atomique : on défausse **puis** on repioche, dans
 * cet ordre, sans pouvoir s'arrêter au milieu. Le moteur, le minuteur de tour et
 * les robots raisonnent tous sur le couple (siège, étape).
 */
export type TurnStep = 'discard' | 'draw';

/** Une défausse posée sur la table. */
export interface DiscardSlot {
  /** Auteur de la pose ; chaîne vide pour la carte retournée à la donne. */
  playerId: string;
  combo: Combo;
}

export interface ZapCall {
  playerId: string;
  /** Total de la main de l'annonceur au moment de l'annonce. */
  value: number;
  /** Mains abattues par tout le monde, annonceur compris. */
  hands: Record<string, Card[]>;
  /** Joueurs dont la main est inférieure ou égale à celle de l'annonceur. */
  beatenBy: string[];
  success: boolean;
}

export interface RoundState {
  roundIndex: number;
  dealerSeat: number;
  /**
   * Taille des mains, choisie par le donneur entre 3 et 7 — la même pour tout le
   * monde, lui compris. `null` tant qu'il n'a pas choisi.
   */
  handSize: number | null;
  /** Mains complètes — côté serveur uniquement, jamais diffusées telles quelles. */
  hands: Record<string, Card[]>;
  /** Pioche, face cachée. */
  stock: Card[];
  /** Cartes enterrées : plus ramassables, mais remises en jeu si la pioche s'épuise. */
  discardPile: Card[];
  /**
   * La défausse du tour précédent : la seule dans laquelle le joueur courant
   * puisse puiser.
   */
  lastDiscard: DiscardSlot | null;
  /**
   * Ce que le joueur courant vient de poser, en attendant qu'il ait pioché.
   *
   * C'est cette case qui interdit de reprendre sa propre défausse, et elle le
   * fait par construction plutôt que par contrôle : tant que le tour n'est pas
   * fini, la pose reste ici, hors de portée de `lastDiscard`. Elle ne devient
   * ramassable qu'une fois la main passée au joueur suivant.
   */
  pendingDiscard: DiscardSlot | null;
  currentSeat: number;
  turnStep: TurnStep;
  /** Tours achevés dans la manche : sert à détecter une table bloquée. */
  turnsPlayed: number;
  log: RoundEvent[];
  /** `null` si la manche s'est achevée sur un blocage plutôt que sur une annonce. */
  zapCall: ZapCall | null;
  roundScores: Record<string, number> | null;
}

/**
 * Qui peut s'asseoir à cette table.
 *
 * - `private` : uniquement sur code à 4 lettres ou lien d'invitation. C'est le
 *   mode d'une partie entre amis, et le défaut.
 * - `public`  : la table apparaît dans « parties ouvertes » et n'importe quel
 *   joueur connecté peut la rejoindre. C'est ce qui permet de jouer tout de
 *   suite quand on n'a personne sous la main, sans meubler avec des robots.
 */
export const VISIBILITIES = ['private', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const DEFAULT_VISIBILITY: Visibility = 'private';

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value);
}

/** Une table ouverte, telle qu'affichée dans la liste des parties publiques. */
export interface OpenTable {
  code: string;
  hostPseudo: string;
  hostAvatar: string;
  playersCount: number;
  maxPlayers: number;
  variants: ZapVariants;
  pace: GamePace;
  createdAt: number;
}

export interface GameState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  maxPlayers: number;
  variants: ZapVariants;
  pace: GamePace;
  visibility: Visibility;
  round: RoundState | null;
  /** Numéro de la manche en cours, 0 pour la première. */
  roundIndex: number;
  createdAt: number;
  seed: string;
  groupId?: string | null;
}

/**
 * Rythme de la partie.
 *
 * - `live`  : tout le monde est là. Un joueur qui traîne bloque la table, son
 *   tour finit par se jouer tout seul.
 * - `async` : chacun joue quand il peut, sur des heures ou des jours. Personne
 *   n'est jamais joué à sa place et la table ne se ferme pas parce qu'elle est
 *   vide — c'est l'état normal d'une partie asynchrone.
 */
export const GAME_PACES = ['live', 'async'] as const;
export type GamePace = (typeof GAME_PACES)[number];
export const DEFAULT_PACE: GamePace = 'live';

export function isGamePace(value: unknown): value is GamePace {
  return typeof value === 'string' && (GAME_PACES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Vues (anti-triche)                                                  */
/* ------------------------------------------------------------------ */

/** Une carte ramassable dans la défausse, avec la raison de sa disponibilité. */
export interface DrawOption {
  cardId: CardId;
  card: Card;
}

/** La manche telle que vue par UN joueur : jamais les mains adverses. */
export interface RoundView extends Omit<RoundState, 'hands' | 'stock' | 'discardPile'> {
  myHand: Card[];
  handCounts: Record<string, number>;
  stockCount: number;
  discardPileCount: number;
  /** Combinaisons posables, si c'est à moi de défausser. Sinon `null`. */
  legalCombos: Combo[] | null;
  /** Cartes ramassables dans la défausse, si c'est à moi de piocher. Sinon `null`. */
  drawOptions: DrawOption[] | null;
  /** Puis-je annoncer maintenant ? */
  canZap: boolean;
  /** Tailles de main proposées, si c'est à moi de donner. Sinon `null`. */
  dealChoices: number[] | null;
  /** Mains abattues à l'annonce — renseigné en phase de décompte uniquement. */
  revealedHands: Record<string, Card[]> | null;
}

export interface GameView extends Omit<GameState, 'round' | 'seed'> {
  /** Mon playerId dans cette partie. */
  you: string;
  round: RoundView | null;
  /**
   * Horodatage (ms) auquel le joueur attendu sera joué automatiquement.
   * Calculé par le serveur, jamais persisté. `null` quand personne n'est
   * attendu, ou quand c'est le tour d'un robot.
   */
  turnDeadline?: number | null;
}

/* ------------------------------------------------------------------ */
/* Historique, statistiques, groupes                                   */
/* ------------------------------------------------------------------ */

export interface GameHistoryEntry {
  code: string;
  playedAt: number;
  playersCount: number;
  myScore: number;
  myRank: number;
  won: boolean;
  standings: { pseudo: string; avatar: string; score: number }[];
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  /** Annonces tentées et réussies : le vrai indicateur de niveau à ZapZap. */
  zapsCalled: number;
  zapsWon: number;
  bestRound: number;
}

export interface ActiveGame {
  code: string;
  phase: Phase;
  pace: GamePace;
  playersCount: number;
  myTurn: boolean;
  waitingFor: string | null;
  round: number;
  myScore: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  /** Code de partage à 6 lettres (distinct du code de partie à 4 lettres). */
  code: string;
  ownerId: string;
  createdAt: number;
  membersCount: number;
  gamesCount: number;
}

export interface GroupMember {
  userId: string;
  pseudo: string;
  avatar: string;
  joinedAt: number;
  isOwner: boolean;
}

export interface GroupStanding {
  userId: string;
  pseudo: string;
  avatar: string;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
}

export interface GroupGame {
  code: string;
  playedAt: number;
  results: { userId: string; pseudo: string; avatar: string; score: number; rank: number; won: boolean }[];
}

export interface GroupDetail {
  group: Group;
  members: GroupMember[];
  standings: GroupStanding[];
  recentGames: GroupGame[];
}
