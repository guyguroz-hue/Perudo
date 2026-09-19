import './Fanfare.css'

/**
 * A Farewell Round, said across the table.
 *
 * See `fanfare.ts` for why it is said once and then goes: an announcement that
 * stays becomes furniture, and this one would sit over the round it describes
 * for the whole length of it. It holds for a few seconds, or until it is tapped.
 */
export function FarewellFanfare({
  /** Whoever the round is owed to, or null if the table has lost track. */
  name,
  yours,
  onDismiss,
}: {
  name: string | null
  yours: boolean
  onDismiss: () => void
}) {
  return (
    <button
      type="button"
      className={`fanfare${yours ? ' fanfare--yours' : ''}`}
      onClick={onDismiss}
      /* Announced, because a player who cannot see the table is exactly the
         player this is for. Assertive rather than polite: it changes what every
         other control on the screen means, which is the one thing on this
         screen worth interrupting for. */
      aria-live="assertive"
    >
      <span className="fanfare__kicker">Farewell Round</span>
      <span className="fanfare__who">
        {yours ? 'Yours' : name === null ? 'A player is owed one' : `${name}'s`}
      </span>
      {/* Written out twice rather than assembled from parts. A sentence built
          by interpolation reads as one until somebody's name is a noun the verb
          does not agree with, and the first draft of this said "Carl open". */}
      <span className="fanfare__rule">
        {yours
          ? 'You open, and the face you pick is locked for everybody. No wildcards this round.'
          : `${name ?? 'They'} opens, and the face they pick is locked for everybody. ` +
            'No wildcards this round.'}
      </span>
    </button>
  )
}
