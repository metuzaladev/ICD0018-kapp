import { randomInt } from 'node:crypto';

/**
 * Human-friendly random codes (invite codes, redemption codes). Crockford-like alphabet without
 * 0/O, 1/I/L, so a code read aloud at a counter cannot be mistyped. `randomInt` is the CSPRNG, so
 * codes are unguessable: 10 characters from 31 symbols ≈ 50 bits.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
