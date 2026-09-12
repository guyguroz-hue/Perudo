/**
 * Uniform random choice.
 *
 * The bytes come from outside, so the rule can be exercised against a known
 * sequence and the caller decides where randomness comes from — WebCrypto in
 * the Edge Function, a script in a test.
 *
 * Note what this is NOT for: dice. Dice are generated in the database and never
 * leave it, and that is about secrecy rather than randomness. What lives here
 * is randomness over things everybody may see.
 */

/** Supplies `n` random bytes. */
export type Bytes = (n: number) => Uint8Array

/**
 * A uniform random integer in `[0, bound)`.
 *
 * Values at or above the largest multiple of `bound` are drawn again rather
 * than folded in. A byte taken modulo 6 without that step favours 0–3 by about
 * a fifth — the same bias `roll_die()` rejects in SQL, for the same reason.
 */
export function randomBelow(bound: number, bytes: Bytes): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > 256) {
    throw new Error(`randomBelow needs a whole bound in 1..256, got ${bound}`)
  }
  if (bound === 1) return 0

  const limit = 256 - (256 % bound)
  for (;;) {
    const byte = bytes(1)[0]
    if (byte < limit) return byte % bound
  }
}
