/**
 * Les sons du jeu — entièrement synthétisés, aucun fichier.
 *
 * Le Web Audio API fabrique tout : pas d'assets à charger, pas de cache à
 * gérer, et des sons courts qui collent au thème électrique. Deux contraintes
 * réelles guident le code :
 *
 *  - iOS gèle le contexte audio tant qu'aucun geste ne l'a débloqué, et le
 *    regèle quand l'application passe en arrière-plan : on (re)déverrouille au
 *    premier geste et au retour au premier plan ;
 *  - le silence est un choix qui se respecte entre les sessions : le mute vit
 *    dans localStorage, et l'haptique le suit — on ne coupe pas le son pour
 *    sentir le téléphone vibrer à sa place.
 */

const MUTE_KEY = 'zapzap.muted';

let ctx: AudioContext | null = null;
let unlocked = false;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    /* la préférence ne survivra pas à l'onglet */
  }
}

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Échantillons                                                        */
/* ------------------------------------------------------------------ */

/**
 * Les sons enregistrés, par opposition aux sons synthétisés.
 *
 * Un seul pour l'instant : la voix qui lance « ZapZap ! ». Le moment mérite une
 * vraie voix — c'est le pari de la manche, celui qu'on entend de l'autre bout
 * de la pièce — là où un arpège synthétisé resterait un bip parmi d'autres.
 *
 * Décodés une fois puis rejoués depuis la mémoire : passer par un élément
 * `<audio>` imposerait une latence de démarrage à chaque annonce, et sur iOS un
 * élément non déclenché par un geste reste muet.
 */
const SAMPLE_URLS = {
  zapzap: '/sounds/zapzap.mp3',
  launch: '/sounds/launch.mp3',
} as const;

export type SampleName = keyof typeof SAMPLE_URLS;

const samples = new Map<SampleName, AudioBuffer>();

async function loadSample(name: SampleName): Promise<void> {
  const audio = ensureContext();
  if (!audio || samples.has(name)) return;
  try {
    const res = await fetch(SAMPLE_URLS[name]);
    if (!res.ok) return;
    samples.set(name, await audio.decodeAudioData(await res.arrayBuffer()));
  } catch {
    // Réseau coupé ou format refusé : on jouera le son de synthèse à la place.
  }
}

/** Joue un échantillon. `false` s'il n'est pas encore prêt — l'appelant se rabat. */
function playSample(name: SampleName, volume = 0.9): boolean {
  const audio = ensureContext();
  const buffer = audio && samples.get(name);
  if (!audio || !buffer) return false;
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain).connect(audio.destination);
  source.start();
  return true;
}

/** Le générique a-t-il déjà retenti dans cette session ? */
let launched = false;

/**
 * À appeler une fois au démarrage : arme le déverrouillage sur premier geste.
 *
 * Aucun navigateur ne laisse une page émettre du son avant que l'utilisateur ne
 * l'ait touchée — c'est une protection contre les publicités sonores, et elle
 * s'applique aussi à nous. Le générique part donc au **premier geste**, pas au
 * chargement : en pratique, le tout premier appui sur l'écran d'accueil.
 */
export function initAudio(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    unlocked = true;
    ensureContext();
    // Le décodage demande un contexte audio vivant : on ne peut donc précharger
    // qu'après le premier geste.
    void loadSample('launch').then(() => {
      if (!launched && !isMuted()) {
        launched = true;
        playSample('launch', 0.85);
      }
    });
    void loadSample('zapzap');
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && unlocked) ensureContext();
  });
}

/** Une note : oscillateur + enveloppe, la brique de tous les sons. */
function tone(
  frequency: number,
  startMs: number,
  durationMs: number,
  { type = 'sine' as OscillatorType, volume = 0.12 } = {},
): void {
  const audio = ensureContext();
  if (!audio) return;
  const t0 = audio.currentTime + startMs / 1000;
  const t1 = t0 + durationMs / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

/** Un « tac » de carte : bruit bref filtré, plus juste qu'une note pour un objet. */
function click(startMs = 0, volume = 0.2): void {
  const audio = ensureContext();
  if (!audio) return;
  const t0 = audio.currentTime + startMs / 1000;
  const length = Math.floor(audio.sampleRate * 0.04);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(t0);
}

export type SoundName =
  | 'deal'
  | 'discard'
  | 'draw'
  | 'yourTurn'
  | 'zapCall'
  | 'zapWin'
  | 'zapFail'
  | 'eliminated'
  | 'victory'
  | 'defeat'
  | 'join'
  | 'gameStart';

const SOUNDS: Record<SoundName, () => void> = {
  deal: () => {
    for (let i = 0; i < 4; i++) click(i * 70, 0.14);
  },
  discard: () => click(0, 0.2),
  draw: () => click(0, 0.12),
  yourTurn: () => {
    tone(660, 0, 90);
    tone(880, 100, 130);
  },
  /*
   * L'annonce elle-même : la voix.
   *
   * On la joue au moment où quelqu'un annonce, avant même de savoir si c'est
   * réussi — c'est le geste qu'on entend à une vraie table, et il fait lever la
   * tête. Le verdict suit une demi-seconde plus tard avec `zapWin`/`zapFail`.
   *
   * Repli sur un arpège synthétisé si l'échantillon n'a pas pu être chargé :
   * le moment fort du jeu ne doit jamais passer en silence.
   */
  zapCall: () => {
    if (playSample('zapzap')) return;
    tone(880, 0, 90, { volume: 0.14 });
    tone(1175, 90, 140, { volume: 0.14 });
  },
  // L'annonce réussie monte, la ratée descend : la nouvelle s'entend avant de se lire.
  zapWin: () => {
    tone(523, 0, 90);
    tone(659, 90, 90);
    tone(784, 180, 200, { volume: 0.16 });
  },
  zapFail: () => {
    tone(392, 0, 140, { type: 'square', volume: 0.08 });
    tone(262, 150, 260, { type: 'square', volume: 0.08 });
  },
  eliminated: () => {
    tone(330, 0, 180, { type: 'triangle' });
    tone(220, 190, 320, { type: 'triangle' });
  },
  victory: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 110, 160, { volume: 0.14 }));
  },
  defeat: () => {
    [392, 330, 262].forEach((f, i) => tone(f, i * 140, 200, { type: 'triangle', volume: 0.1 }));
  },
  join: () => tone(587, 0, 110),
  gameStart: () => {
    tone(440, 0, 100);
    tone(660, 110, 160);
  },
};

export function play(name: SoundName): void {
  if (isMuted()) return;
  try {
    SOUNDS[name]();
  } catch {
    // Un son qui échoue ne doit jamais casser un coup de jeu.
  }
}
