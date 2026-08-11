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
    endRule: 'La partie s’arrête dès qu’un joueur dépasse 100 points. Le plus bas score l’emporte.',
  },

  invite: {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    share: 'Partager…',
    copy: 'Copier le lien',
    copied: 'Copié ✓',
    // Le message part chez l'invité : il est dans la langue de celui qui
    // invite, la seule qu'on connaisse — et celle qu'ils parlent entre eux.
    text: (code: string, url: string) => `Rejoins ma partie de ZapZap ⚡ Code ${code} — ${url}`,
  },

  /* Ajouter à l'écran d'accueil ------------------------------------ */
  install: {
    title: 'Mettez ZapZap sur votre écran d’accueil',
    detail:
      'Le jeu s’ouvre alors en plein écran, sans barre d’adresse — et se retrouve d’un seul geste.',
    iosBefore: 'Touchez ',
    iosAfter: ' en bas de Safari, puis « Sur l’écran d’accueil ». Le jeu s’ouvrira en plein écran.',
    action: 'Ajouter',
    dismiss: 'Masquer cette suggestion',
  },

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
    yourTurnDiscard: 'À vous',
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
    myScore: (n: number, max: number) => `${n}/${max}`,
    myScoreSpoken: (n: number, left: number) => `Votre score : ${n} points, ${left} avant l’élimination`,
    nearOut: (n: number) => `, à ${n} points de l’élimination`,
    canZap: ' — peut annoncer',
    itsTheirTurn: ', c’est à lui de jouer',
    isPaused: ', en pause, un robot joue pour lui',
    hasLeft: ', a quitté la partie',
    isEliminated: ', éliminé',
  },

  /* La main et ses combinaisons ------------------------------------ */
  hand: {
    bySuit: 'Couleurs',
    byRank: 'Rangs',
    sortToRank: 'Trier ma main par rang, pour voir les ensembles',
    sortToSuit: 'Trier ma main par couleur, pour voir les suites',
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

  theme: {
    cardBack: 'Dos de carte',
    cardBackDetail: 'C’est ce que vous regardez le plus longtemps. Chacun choisit le sien.',
    fourColours: 'Couleurs distinctes',
    fourColoursDetail:
      'Pique et trèfle en noir et vert, cœur en rouge, carreau en bleu — le paquet à quatre couleurs des jeux de cartes, pour qui ne distingue pas le rouge du noir.',
    names: {
      storm: 'Orage',
      volt: 'Éclair',
      flash: 'Foudre',
      ink: 'Encre',
      paper: 'Papier',
    },
  },

  tutorial: {
    title: 'Comment on joue',
    stepOf: (a: number, b: number) => `Étape ${a} sur ${b}`,
    skip: 'Passer',
    next: 'Suivant',
    play: 'Jouer',
    goal: 'Le but : la main la plus faible',
    goalBody: 'Chaque carte vaut ses points — l’As 1, les figures 10. On ne cherche pas à gagner des cartes, on cherche à s’en débarrasser.',
    turn: 'Votre tour : posez, puis piochez',
    turnBody: 'Vous posez une carte seule, un ensemble de même rang, ou une suite d’au moins trois cartes de même couleur. Une seule combinaison par tour.',
    draw: 'On repioche toujours une carte',
    drawBody: 'Au talon à l’aveugle, ou dans la défausse du tour précédent — la tête ou la queue d’une suite. Jamais votre propre défausse.',
    call: 'ZapZap : le pari',
    callBody: 'Main à 5 points ou moins, en début de tour : vous annoncez. Personne en dessous, vous marquez 0. Quelqu’un vous égale ou vous bat, vous prenez 30.',
  },

  push: {
    title: 'Notifications',
    detail: 'Un mot quand c’est à vous, uniquement dans les parties « chacun son heure ». Jamais pendant une partie en direct.',
    on: 'Activer les notifications',
    off: 'Désactiver',
    blocked: 'Votre navigateur les a bloquées pour ce site. Réactivez-les dans ses réglages.',
  },

  leaderboard: {
    title: 'Classement entre vous',
    detail: 'Les gens avec qui vous avez fini des parties. Le score moyen le plus bas est le meilleur.',
    you: 'vous',
    wins: 'victoires',
    line: (g: number, s: number) => `${g} parties · ${s} pt en moyenne`,
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
    seeResult: 'Voir le résultat de la partie',
    callWon: 'Réussi !',
    callLost: 'Contré !',
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
    youWin: 'Vous gagnez !',
    rank: (n: number) => `${n}e`,
    first: '1er',
    rematch: 'Revanche — même table',
    home: 'Retour à l’accueil',
    share: 'Partager le résultat',
    shared: 'Partagé',
    // La carte partagée part sur WhatsApp : elle est dans la langue de celui
    // qui partage, la seule que l'on connaisse au moment de la dessiner.
    cardTitle: (rounds: number) => `Partie terminée — ${rounds} manche${rounds > 1 ? 's' : ''}`,
    cardText: (url: string) => `On vient de finir une partie de ZapZap ⚡ ${url}`,
    roundsPlayed: (n: number) => `${n} manche${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}`,
    you: 'vous',
    points: (n: number) => `${n} pt`,
    outSuffix: ' · éliminé',
  },

  /* Cartes passées -------------------------------------------------- */
  passed: {
    title: 'Cartes déjà passées',
    detail: 'Ce que la table a vu passer depuis le début de la manche.',
    none: 'Rien n’est encore passé.',
    close: 'Fermer',
    loading: 'Lecture du journal…',
    reshuffled:
      'La pioche a été remélangée : les cartes tombées avant sont revenues au talon, les comptes repartent.',
    remaining: 'Ce qui court encore',
    remainingDetail:
      'Par rang, ce qui n’est pas enterré : en main, au talon, ou encore ramassable.',
    rankLeft: (left: number, total: number) => `${left} sur ${total} encore en jeu`,
    known: 'Ce qu’on sait des mains',
    knownDetail:
      'Cartes ramassées dans la défausse, sous les yeux de tous, et pas encore reposées.',
    buried: (n: number) => `Enterré — ${n} carte${n > 1 ? 's' : ''}`,
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
    photoLabel: 'Changer la photo de profil',
    photoBadge: 'photo',
    pseudoLabel: 'Votre pseudo',
    removePhoto: 'Retirer la photo, garder l’avatar dessiné',
    avatarGroup: 'Votre avatar',
    avatarNamed: (emoji: string) => `Avatar ${emoji}`,
    saveAccount: 'Sauvegarder mon compte',
    linkedTo: 'Compte rattaché à',
    linkedDetail: 'Vos parties vous suivent sur tous vos appareils.',
    noEmail:
      'Sans e-mail, ce compte vit dans ce navigateur. Un lien magique — pas de mot de passe — le rend récupérable partout.',
    emailPlaceholder: 'vous@exemple.be',
    emailLabel: 'Votre adresse e-mail',
    send: 'Envoyer',
    linkSent: 'Lien envoyé ! Ouvrez votre boîte mail sur cet appareil.',
    redZone: 'Zone rouge',
    deleteWarning: 'Supprimer le compte efface aussi l’historique et les statistiques. C’est définitif.',
    confirmDeleteFinal: 'Confirmer la suppression définitive',
    keepMyAccount: 'Non, je garde mon compte',
  },

  /*
   * Le nom parlé des cartes ------------------------------------------
   *
   * Un lecteur d'écran ne lit pas « ♠ ». C'est le seul texte que le joueur
   * aveugle reçoit pour chaque carte de sa main, de la défausse et de
   * l'abattage : le laisser en français revenait à rendre le jeu injouable
   * dans toute autre langue pour ceux qui en dépendent le plus.
   */
  card: {
    suits: { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' } as Record<string, string>,
    ranks: { 1: 'As', 11: 'Valet', 12: 'Dame', 13: 'Roi' } as Record<number, string>,
    joker: 'Joker, 0 point',
    named: (rank: string, suit: string, value: number) =>
      `${rank} de ${suit}, ${value} point${value > 1 ? 's' : ''}`,
  },

  /*
   * Les règles ------------------------------------------------------
   *
   * En données plutôt qu'en JSX : c'est le seul écran entièrement fait de
   * prose, et le laisser dans le composant revenait à ne jamais le traduire.
   * Trois marques suffisent à porter la mise en forme sans balise :
   * `**gras**`, un `~` en tête pour une remarque en retrait, un `!` pour le
   * point à retenir, un `-` pour une puce. Le traducteur écrit des phrases,
   * pas du balisage.
   */
  rules: {
    back: '← Retour',
    title: 'Comment on joue',
    subtitle: 'De 2 à 6 joueurs, 20 à 40 minutes.',
    sections: [
      {
        title: 'Le but',
        body: [
          'Contrairement à la belote ou au whist, on ne cherche pas à faire des levées. On cherche à avoir la main la plus faible, pour pouvoir annoncer **ZapZap** avant les autres.',
          'La partie s’arrête dès qu’un joueur dépasse 100 points — pour tout le monde en même temps. Le plus bas score l’emporte, et on en relance une.',
        ],
      },
      {
        title: 'Ce que valent les cartes',
        body: [
          'As : 1 point. De 2 à 10 : leur valeur. Valet, Dame, Roi : 10 points. Joker : 0.',
          '~Cette valeur ne sert qu’au décompte. Elle n’a aucune influence sur ce que vous pouvez poser — c’est le rang qui compte. Un Roi et une Dame valent 10 tous les deux, ils ne font pas une paire pour autant.',
        ],
      },
      {
        title: 'La donne',
        body: [
          'À chaque manche, le donneur choisit combien de cartes distribuer, entre 3 et 7 — **le même nombre pour tout le monde, lui compris**. La donne tourne vers la gauche, chacun exerce ce pouvoir à son tour.',
          '~Court, la manche est une course à qui descend le premier. Long, il y a de quoi construire des suites et lâcher gros d’un coup — mais beaucoup à encaisser si quelqu’un annonce.',
        ],
      },
      {
        title: 'Votre tour : deux actions',
        body: [
          '**1. Défaussez.** Une carte seule, un ensemble (paire, brelan, carré), ou une suite d’au moins 3 cartes de même couleur. L’As est bas : A-2-3 est une suite, Dame-Roi-As non. Une seule combinaison par tour.',
          '**2. Repiochez exactement une carte.** Au talon, à l’aveugle, ou dans la défausse du tour précédent. Sur une suite, seulement la carte de tête ou de queue. Sur un ensemble, n’importe laquelle.',
          '~Vous repiochez toujours, même si vous venez de vider votre main. Il est donc impossible de finir un tour sans carte — et une main sans combinaison ne raccourcit jamais.',
        ],
      },
      {
        title: 'L’annonce',
        body: [
          'En début de tour, avant de défausser, si votre main vaut 5 points ou moins : vous pouvez annoncer. Tout le monde abat son jeu.',
          '**Personne en dessous ?** Vous marquez 0, chacun marque le total de sa main.',
          '**Quelqu’un fait aussi bien ou mieux ?** Vous prenez 30 points. Ceux qui vous battent marquent 0, les autres leur main.',
          '!L’égalité profite toujours au contre-attaquant, jamais à l’annonceur. Annoncer à 5 pile est un vrai pari.',
        ],
      },
      {
        title: 'Le rebond',
        body: [
          'Si votre score tombe **exactement** sur 50, il redescend à 25. S’il tombe exactement sur 100, il redescend à 50 et vous n’êtes pas éliminé.',
          '~C’est ce qui relance les parties qui s’enlisent — et il arrive qu’on cherche à prendre exactement le nombre de points qui sauve.',
        ],
      },
      {
        title: 'Quelques réflexes',
        body: [
          '-Purgez les figures en priorité. Trois figures, c’est 30 points si quelqu’un annonce.',
          '-Piochez à l’aveugle par défaut. Prendre dans la défausse renseigne toute la table sur ce que vous construisez.',
          '-Comptez les cartes des autres. Un joueur qui pose trois cartes par tour et n’en remonte qu’une descend vite : n’annoncez pas à 5 contre lui.',
          '-Ne gardez jamais une combinaison pour plus tard. Une paire de Rois, c’est 20 points qui dorment.',
          '-Quand vous donnez, servez court si vous menez au score.',
        ],
      },
      {
        title: 'Bon à savoir',
        body: [
          '~L’application ne vous laisse jamais jouer un coup illégal : pas d’annonce hors tour, pas de combinaison invalide, donc aucune des pénalités de maladresse du jeu sur table. Si une manche se bloque — cela arrive quand plus personne ne peut apparier ses cartes — elle se termine d’elle-même au bout d’un long moment : chacun compte sa main, sans pénalité.',
        ],
      },
    ],
  },

  /* Historique ----------------------------------------------------- */
  history: {
    title: 'Historique',
    back: '← Menu principal',
    empty: 'Aucune partie terminée pour l’instant.',
    emptyDetail: 'Vos parties apparaîtront ici dès la première fin de partie.',
    players: (n: number) => `${n} joueurs`,
    youRanked: (rank: number) => (rank === 1 ? 'Victoire' : `${rank}e place`),
    backShort: '← Retour',
    yourGames: 'Vos parties',
    tileGames: 'parties',
    tileWins: 'victoires',
    tileZaps: (won: number, called: number) => `annonces réussies (${won}/${called})`,
    loading: 'Chargement…',
    none: 'Aucune partie terminée pour l’instant. La première victoire n’attend que vous.',
    won: '🏆 Victoire',
    ranked: (rank: number, total: number) => `${rank}ᵉ sur ${total}`,
    home: 'Retour à l’accueil',
  },

  /* Vérification du lien magique ------------------------------------ */
  verify: {
    checking: 'Vérification du lien…',
    invalid: 'Lien invalide ou expiré',
    invalidDetail: 'Un lien magique ne vit que quinze minutes. Redemandez-en un depuis votre profil.',
    home: 'Retour à l’accueil',
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
    ACCOUNT_FAILED: 'Impossible de créer le compte.',
    MAIL_FAILED: 'L’envoi a échoué. Réessayez plus tard.',
  },
};

export default fr;
