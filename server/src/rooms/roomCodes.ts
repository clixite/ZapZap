/**
 * Codes de partie.
 *
 * Quatre lettres, à dire à voix haute et à taper sur un téléphone. On écarte
 * donc les lettres qui se confondent à l'oral ou à l'écrit :
 *
 *  - `I`, `O` — confondues avec 1 et 0 ;
 *  - `Q` — se lit « cul » en épelant vite, et se confond avec O ;
 *  - `U` et `V`, `M` et `N` — indistinguables au téléphone dans un salon bruyant.
 *
 * Restent 20 lettres, soit 160 000 codes : largement de quoi ne jamais tomber
 * deux fois sur le même parmi les parties simultanées.
 */
const ALPHABET = 'ABCDEFGHJKLPRSTWXYZ';

export const CODE_LENGTH = 4;

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}

/**
 * Normalise ce que le joueur a tapé.
 *
 * On accepte les minuscules, les espaces et les tirets : quelqu'un qui recopie
 * un code depuis un message ne doit pas se faire refuser pour une majuscule.
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function generateCode(isTaken: (code: string) => boolean): string {
  // 160 000 combinaisons : la collision est improbable, mais un tirage borné
  // vaut mieux qu'une boucle qui pourrait ne jamais sortir.
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Impossible de tirer un code de partie libre');
}
