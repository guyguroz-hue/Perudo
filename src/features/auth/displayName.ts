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
 * Validate a display name as typed, returning the trimmed value to store.
 *
 * Trimming matters: the database constraint measures the trimmed length, so a
 * name of nothing but spaces is rejected there. Checking the same way here keeps
 * the two from disagreeing.
 */
export function checkDisplayName(raw: string): DisplayNameCheck {
  const value = raw.trim()

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
