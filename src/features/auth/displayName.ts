/**
 * Display-name rules.
 *
 * These MUST match the `profiles_display_name_length` constraint in
 * supabase/migrations/20260911120000_phase1_core_schema.sql. The database is the
 * authority; this module exists so a player finds out before submitting rather
 * than after a round trip, and so the message is a sentence instead of a
 * Postgres error.
 */

export const DISPLAY_NAME_MIN = 1
export const DISPLAY_NAME_MAX = 24

export type DisplayNameRejection = 'EMPTY' | 'TOO_LONG'

export type DisplayNameCheck =
  | { readonly valid: true; readonly value: string }
  | { readonly valid: false; readonly reason: DisplayNameRejection; readonly message: string }

/**
 * Characters a name may not carry, in two groups that want opposite handling.
 *
 * The invisible ones go first and go entirely. Bidi overrides and isolates
 * (U+202A-202E, U+2066-2069) draw nothing; they change the direction of the
 * text *around* them. Dropped into a display name they reach out of the badge
 * and reorder the sentence it is sitting in — this game renders moves as prose
 * with a player-supplied noun in them, and who said what is most of what a
 * player is reasoning about, so a name that can rewrite somebody else's move is
 * a way to cheat rather than a way to be rude. The zero-width characters go
 * with them for a quieter version of the same trick: invisible, so two players
 * can hold names that read identically and compare differently.
 *
 * Removed before anything else, because a browser counts U+FEFF as whitespace
 * and would otherwise turn "Da<U+FEFF>na" into two words. Inside a word it is a
 * joiner, not a separator.
 *
 * Ordinary right-to-left text is untouched. Hebrew letters carry their own
 * direction; an override is a separate thing that exists to lie about it, and
 * this game is played in Hebrew.
 */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu

/**
 * The control characters, less the ones that are really whitespace.
 *
 * A newline or a tab pasted into the field stands for a space and is collapsed
 * into one before this runs — "line<newline>break" is two words, not one. What
 * is left is not a letter in any script, and a name holding one was pasted
 * rather than typed.
 */
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/gu

export function checkDisplayName(raw: string): DisplayNameCheck {
  const value = raw
    .replace(INVISIBLE, '')
    // Any run of whitespace is one space, which is also what turns a pasted
    // newline into the separator it stands for.
    .replace(/\s+/gu, ' ')
    .replace(CONTROL, '')
    .trim()

  if (value.length < DISPLAY_NAME_MIN) {
    return { valid: false, reason: 'EMPTY', message: 'Pick a name to play under.' }
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return {
      valid: false,
      reason: 'TOO_LONG',
      message: `That is ${value.length} characters — keep it to ${DISPLAY_NAME_MAX}.`,
    }
  }
  return { valid: true, value }
}
