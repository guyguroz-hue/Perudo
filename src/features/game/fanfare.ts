import { useCallback, useEffect, useState } from 'react'

/**
 * The one thing that happens in this game that nobody notices.
 *
 * A Farewell Round changes every rule at once: one face is chosen for the whole
 * table by the player it is owed to, and the wildcard stops being wild
 * (GAME_RULES §10). All of that was announced by a small brass word in the
 * corner of the stage, next to the round number — a standing label, in the
 * place the screen keeps facts nobody acts on. "It gets missed" was the report,
 * from a table that had played several of them.
 *
 * So it is said once, across the table, at the size of a thing that matters,
 * and then it goes. Announcements that stay become furniture, and this one
 * would sit over a round it is describing for the whole length of it.
 */

/**
 * How long it holds.
 *
 * Long enough to read twice at a table where somebody is talking, short enough
 * that it is gone before anybody wants to bid. A tap takes it sooner.
 */
export const FANFARE_MS = 4200

const NOTHING = Symbol('nothing announced yet')

/**
 * Announce `payload` once, when `key` changes to something worth announcing.
 *
 * The payload is captured at that moment rather than read live, which is the
 * whole reason this is a hook and not an `&&`: a Farewell Round is announced
 * for the player it is owed to, and the turn moves off them the instant they
 * bid — so a banner reading the table live would rename itself halfway through
 * being read.
 */
export function useFanfare<T>(
  key: unknown,
  payload: T | null,
  hold = FANFARE_MS,
): [T | null, () => void] {
  const [shown, setShown] = useState<T | null>(null)
  const [announced, setAnnounced] = useState<unknown>(NOTHING)

  // React's own pattern for adjusting state when an input changes, and it
  // belongs in render: the frame the round arrives on is the frame it is
  // announced on.
  if (key !== announced) {
    setAnnounced(key)
    setShown(payload)
  }

  useEffect(() => {
    if (shown === null) return
    const ends = setTimeout(() => setShown(null), hold)
    return () => clearTimeout(ends)
  }, [shown, hold])

  return [shown, useCallback(() => setShown(null), [])]
}
