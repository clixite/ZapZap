/**
 * Le français : la langue de référence.
 *
 * Ce fichier définit le contrat. `Messages = typeof fr` : toute autre langue
 * doit fournir exactement les mêmes clés, avec les mêmes signatures — un
 * paramètre oublié dans une traduction ne compile pas. C'est ce garde-fou qui
 * rend tenable la maintenance de vingt-quatre langues, et il vaut mieux qu'une
 * relecture : personne ne relit vingt-quatre fichiers.
 *
 * Les valeurs sont des chaînes quand le texte est fixe, des fonctions quand il
 * dépend de quelque chose. Une fonction plutôt qu'un gabarit à trous parce que
 * les langues ne placent pas leurs mots dans le même ordre, et que le pluriel
 * ne se décide pas de la même façon partout — le russe et le polonais en ont
 * trois formes. Chaque langue garde la main sur sa phrase entière.
 */
export const fr = {
  language: 'Langue',

  /* Accueil ------------------------------------------------------- */
  home: {
    tagline: 'Défaussez, annoncez, le plus bas gagne.',
    myProfile: (pseudo: string) => `Mon profil — ${pseudo}`,
    ongoing: 'Mes parties en cours',
    yourTurn: '⚡ À vous de jouer',
    waitingFor: (pseudo: string) => `En attente de ${pseudo}`,
    inLobby: 'Au salon',
    roundOver: 'Manche terminée',
    paused: 'En pause — un robot joue',
    gameLine: (round: number, players: number, score: number) =>
      `Manche ${round} · ${players} joueurs · ${score}/100 pt`,
    playNow: 'Jouer maintenant',
    playNowDetail:
      'On vous place à une table ouverte. S’il n’y en a pas, on en ouvre une et les autres vous rejoignent.',
    withFriends: 'Entre amis',
    createTable: 'Créer une table',
    createTableDetail: 'Vous recevez un code à envoyer par WhatsApp ou SMS — et vous choisissez les règles.',
    gotCode: 'On vous a envoyé un code ?',
    enter: 'Entrer',
    againstBots: 'S’entraîner contre deux robots',
    openTables: 'Tables ouvertes en ce moment',
    tableOf: (pseudo: string) => `Table de ${pseudo} · ouverte à tous`,
    howToPlay: 'Comment on joue',
    history: 'Historique',
  },

  /* Compte -------------------------------------------------------- */
  signIn: {
    intro: 'Choisissez un nom, on joue tout de suite.',
    invited: (code: string) => `Vous êtes invité à la table ${code}. Choisissez un nom et entrez.`,
    pseudo: 'Votre pseudo',
    avatar: 'Votre avatar',
    avatarNamed: (glyph: string) => `Avatar ${glyph}`,
    go: 'C’est parti',
    failed: 'Impossible de créer le compte. Réessayez.',
  },

  /* Salon --------------------------------------------------------- */
  lobby: {
    connecting: 'Connexion au salon…',
    mainMenu: '← Menu principal',
    profile: 'Profil',
    inviteTitle: 'Invitez vos amis',
    inviteDetail: 'Envoyez-leur ce code : ils l’entrent à l’accueil et arrivent ici.',
    hostRuns: (pseudo: string) => `${pseudo} règle la partie et donne le coup d’envoi.`,
    theHost: 'L’hôte',
    players: (count: number, max: number) => `Joueurs ${count}/${max}`,
    host: 'hôte',
    you: 'vous',
    remove: 'retirer',
    removeNamed: (pseudo: string) => `Retirer ${pseudo}`,
    addBot: '+ Ajouter un robot',
    settings: 'Réglages',
    start: 'Commencer',
    needPlayers: (min: number) => `Il faut ${min} joueurs`,
    waitingHost: 'En attente de l’hôte…',
    leave: 'Quitter la partie',
    whoCanEnter: 'Qui peut entrer',
    onCode: 'Sur code',
    everyone: 'Tout le monde',
    pace: 'Rythme',
    live: 'En direct',
    async: 'Chacun son heure',
    zapAt: 'On annonce à',
    points: (n: number) => `${n} points`,
    runs: 'Suites',
    sameSuit: 'Même couleur',
    anySuit: 'Toutes couleurs',
    minRun: 'Suite minimale',
    cards: (n: number) => `${n} cartes`,
    rebound: 'Rebond à 50 et 100',
    yes: 'Oui',
    no: 'Non',
    jokers: 'Jokers',
    without: 'Sans',
    with: 'Avec',
    endMode: 'La partie s’arrête',
    lastStanding: 'Au dernier debout',
    firstOut: 'À la 1re sortie',
  },

  invite: { whatsapp: 'WhatsApp', sms: 'SMS', share: 'Partager…', copy: 'Copier le lien', copied: 'Copié ✓' },

  /* Table --------------------------------------------------------- */
  table: {
    connecting: 'Connexion à la table…',
    backHome: 'Retour à l’accueil',
    menu: 'Menu de la partie',
    yourHand: 'Votre main',
    stock: 'Pioche',
    discard: 'Défausse',
    turnedUp: 'Carte retournée',
    youPlayed: 'Vous avez posé',
    cardsLeft: (n: number) => `${n} carte${n > 1 ? 's' : ''}`,
    headOrTail: 'Tête ou queue',
    takeable: 'À prendre',
    drawBlind: (n: number) => `Piocher à l’aveugle, ${n} cartes restantes`,
    yourDeal: 'À vous de donner',
    theirDeal: (pseudo: string) => `${pseudo} choisit la donne`,
    roundOver: 'Manche terminée',
    yourTurnDiscard: 'À vous — posez vos cartes',
    yourTurnDraw: 'À vous — piochez une carte',
    theirTurn: (pseudo: string) => `Au tour de ${pseudo}`,
    heDiscards: 'il défausse',
    heDraws: 'il pioche',
    youPlayedShort: 'vous avez posé',
    pausedBanner: 'En pause — un robot joue pour vous',
    resume: 'reprendre',
    discardAction: 'Défausser',
    chooseCards: 'Choisissez une carte, un ensemble ou une suite.',
    handWorth: (n: number) => `Votre main vaut ${n} points.`,
    zap: (n: number) => `ZapZap ! (${n} pt)`,
    zapConfirm: (n: number) => `Confirmer ? (${n} pt — raté = +30)`,
    seenCards: 'Voir les cartes déjà passées',
    react: 'Envoyer une réaction',
    reactions: 'Réactions',
    reactionNamed: (glyph: string) => `Réaction ${glyph}`,
    mute: 'Couper le son',
    unmute: 'Réactiver le son',
    secondsLeft: (n: number) => `${n} s avant que le tour ne se joue tout seul`,
    dealer: 'Donneur',
    paused: 'PAUSE',
    eliminated: 'éliminé',
    left: 'parti',
    pt: (n: number) => `${n} pt`,
    seatSummary: (pseudo: string, cards: number, score: number) =>
      `${pseudo}, ${cards} carte${cards > 1 ? 's' : ''} en main, ${score} points`,
    canZap: ' — peut annoncer',
    itsTheirTurn: ', c’est à lui de jouer',
    isPaused: ', en pause, un robot joue pour lui',
    hasLeft: ', a quitté la partie',
    isEliminated: ', éliminé',
  },

  /* La main et ses combinaisons ------------------------------------ */
  hand: {
    dealing: 'La donne arrive…',
    yourHand: 'Votre main',
    single: 'Carte seule',
    set: 'Ensemble',
    run: 'Suite',
    dropped: (kind: string, value: number) =>
      `${kind} — ${value} point${value > 1 ? 's' : ''} lâché${value > 1 ? 's' : ''}`,
    choose: 'Choisissez une carte, un ensemble ou une suite.',
    worth: (n: number) => `Votre main vaut ${n} points.`,
    whyJoker: 'Un joker se pose seul, ou par paire de jokers.',
    whyFour: 'Quatre cartes au maximum pour un carré.',
    whyPair: 'Deux cartes ne font une paire que si elles ont le même rang.',
    whySuit: 'Une suite doit être d’une seule couleur.',
    whyAce: 'L’As est bas : A-2-3 oui, Dame-Roi-As non.',
    whyGap: 'Il manque une carte pour que la suite se tienne.',
  },

  /* Menu de la table ---------------------------------------------- */
  menu: {
    resume: 'Reprendre la partie',
    pause: 'Faire une pause',
    pauseDetail: 'Un robot joue vos tours jusqu’à votre retour. Il n’annoncera jamais à votre place.',
    unpause: 'Reprendre ma place',
    unpauseDetail: 'Un robot joue vos tours en ce moment.',
    mainMenu: 'Retour au menu principal',
    mainMenuInGame: 'Votre place vous attend. Vous la retrouverez dans « Mes parties en cours ».',
    mainMenuLobby: 'Vous gardez votre place à cette table.',
    rules: 'Les règles',
    rulesDetail: 'Comment on joue, et les points litigieux.',
    profile: 'Mon profil',
    profileDetail: 'Pseudo, avatar, sauvegarde du compte.',
    quit: 'Quitter définitivement la partie',
    quitConfirm: 'Quitter définitivement',
    quitInGame: 'Vous sortez de cette partie. Elle continue sans vous, et votre score reste au tableau.',
    quitLobby: 'Vous quittez cette table.',
    cancel: 'Annuler',
    close: 'Fermer le menu',
  },

  /* La donne ------------------------------------------------------ */
  deal: {
    question: 'Combien de cartes pour tout le monde ? Vous vous servez pareil.',
    you: ' (vous)',
    yourChoice: 'À vous de donner',
    explain: 'Court, c’est une course. Long, c’est de quoi construire.',
    waiting: (pseudo: string) => `${pseudo} choisit combien de cartes distribuer…`,
    cardsUnit: 'cartes',
  },

  /* Décompte de manche -------------------------------------------- */
  recap: {
    youSucceeded: 'Annonce réussie !',
    youFailed: 'Annonce ratée',
    beatenBy: (n: number, pseudo: string) =>
      `${n === 1 ? 'Un joueur fait' : `${n} joueurs font`} aussi bien ou mieux. ${pseudo} prend 30.`,
    stuck: 'Manche bloquée',
    stuckDetail: 'Personne n’a annoncé : chacun compte sa main.',
    success: (pseudo: string) => `${pseudo} passe`,
    successDetail: (n: number) => `${n} point${n > 1 ? 's' : ''} en main, personne en dessous.`,
    failed: (pseudo: string) => `${pseudo} est contré`,
    announces: 'annonce',
    counters: 'contre',
    inHand: (n: number) => `${n} en main →`,
    emptyHand: 'Main vide',
    next: 'Manche suivante',
    waitingHost: 'En attente de l’hôte…',
  },

  /* Fin de partie -------------------------------------------------- */
  gameOver: {
    title: 'Partie terminée',
    winner: (pseudo: string) => `${pseudo} l’emporte`,
    youWin: 'Vous l’emportez !',
    rank: (n: number) => `${n}e`,
    first: '1er',
    rematch: 'Revanche',
    home: 'Retour à l’accueil',
    share: 'Partager le résultat',
  },

  /* Cartes passées -------------------------------------------------- */
  passed: {
    title: 'Cartes déjà passées',
    detail: 'Tout ce qui a été posé ou ramassé depuis le début de la manche.',
    none: 'Rien n’est encore passé.',
    close: 'Fermer',
  },

  /* Journal en direct ---------------------------------------------- */
  feed: {
    joined: (pseudo: string) => `${pseudo} rejoint la table`,
    leftTable: (pseudo: string) => `${pseudo} quitte la table`,
    youDeal: (n: number) => `Vous donnez ${n} cartes`,
    deals: (pseudo: string, n: number) => `${pseudo} donne ${n} cartes`,
    plays: (pseudo: string, cards: string) => `${pseudo} pose ${cards}`,
    drawsBlind: (pseudo: string) => `${pseudo} pioche à l’aveugle`,
    youTake: (card: string) => `Vous ramassez le ${card}`,
    takes: (pseudo: string, card: string) => `${pseudo} ramasse le ${card}`,
    zapWon: (pseudo: string) => `⚡ ${pseudo} annonce ZapZap — réussi !`,
    zapLost: (pseudo: string) => `⚡ ${pseudo} annonce ZapZap — contré !`,
    eliminated: (pseudo: string) => `${pseudo} est éliminé`,
    disconnected: (pseudo: string) => `${pseudo} a perdu la connexion`,
    reconnected: (pseudo: string) => `${pseudo} est de retour`,
    away: (pseudo: string) => `${pseudo} fait une pause — un robot joue pour lui`,
    back: (pseudo: string) => `${pseudo} reprend sa place`,
    newHost: (pseudo: string) => `${pseudo} devient l’hôte`,
    reacts: (pseudo: string) => `${pseudo} réagit`,
  },

  /* Profil --------------------------------------------------------- */
  profile: {
    title: 'Mon profil',
    back: '← Menu principal',
    identity: 'Identité',
    pseudo: 'Pseudo',
    avatar: 'Avatar',
    photo: 'Choisir une photo',
    save: 'Enregistrer',
    saved: 'Enregistré ✓',
    keepAccount: 'Garder mon compte',
    keepDetail:
      'Votre compte vit sur cet appareil. Laissez une adresse e-mail pour le retrouver ailleurs, ou après une réinstallation.',
    email: 'Votre e-mail',
    sendLink: 'M’envoyer un lien',
    sending: 'Envoi…',
    sent: 'Lien envoyé — regardez vos e-mails.',
    stats: 'Mes statistiques',
    gamesPlayed: 'Parties jouées',
    wins: 'Victoires',
    zapsWon: 'Annonces réussies',
    zapsLost: 'Annonces contrées',
    danger: 'Supprimer mon compte',
    dangerDetail: 'Efface le compte, les statistiques et l’historique. Sans retour.',
    confirmDelete: 'Confirmer la suppression',
    cancel: 'Annuler',
  },

  /* Historique ----------------------------------------------------- */
  history: {
    title: 'Historique',
    back: '← Menu principal',
    empty: 'Aucune partie terminée pour l’instant.',
    emptyDetail: 'Vos parties apparaîtront ici dès la première fin de partie.',
    players: (n: number) => `${n} joueurs`,
    youRanked: (rank: number) => (rank === 1 ? 'Victoire' : `${rank}e place`),
  },

  /* Mise à jour et connexion ---------------------------------------- */
  app: {
    reconnecting: 'Reconnexion…',
    updateReady: 'Nouvelle version prête — elle s’installera après la partie',
    loading: 'Un instant…',
  },

  /* Erreurs, par code : le serveur envoie le code, la langue vient d'ici */
  errors: {
    BAD_PHASE: 'Ce n’est pas le moment de faire ça.',
    BAD_STEP: 'Il faut défausser avant de piocher.',
    NOT_HOST: 'Seul l’hôte de la partie peut faire ça.',
    NOT_DEALER: 'C’est au donneur de choisir.',
    NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
    NOT_ENOUGH_PLAYERS: 'Il faut au moins deux joueurs.',
    ROOM_FULL: 'La table est complète.',
    PLAYER_NOT_FOUND: 'Joueur introuvable.',
    ILLEGAL_DEAL_COUNT: 'Il faut distribuer entre 3 et 7 cartes.',
    ILLEGAL_COMBO: 'Cette combinaison n’est pas posable.',
    ILLEGAL_DRAW: 'Cette carte n’est pas disponible.',
    ZAP_TOO_HIGH: 'Votre main est trop forte pour annoncer.',
    ILLEGAL_VARIANT: 'Réglage invalide.',
    ROOM_NOT_FOUND: 'Cette partie n’existe pas ou est terminée.',
    GAME_ALREADY_STARTED: 'La partie a déjà commencé.',
    ALREADY_IN_ROOM: 'Vous êtes déjà à une table.',
    NOT_IN_ROOM: 'Vous n’êtes à aucune table.',
    NO_OPEN_TABLE: 'Aucune table ouverte pour le moment.',
    TOO_MANY_ROOMS: 'Vous avez déjà plusieurs parties en cours. Finissez-en une d’abord.',
    RATE_LIMITED: 'Doucement ! Réessayez dans un instant.',
    INVALID_TOKEN: 'Session expirée, rechargez la page.',
    INVALID_PAYLOAD: 'Requête invalide.',
    OFFLINE: 'Pas de connexion au serveur.',
    TIMEOUT: 'Le serveur ne répond pas.',
    TOO_MANY_ACCOUNTS:
      'Beaucoup de comptes viennent d’être créés depuis votre connexion. Réessayez dans une minute.',
  },
};

export default fr;
