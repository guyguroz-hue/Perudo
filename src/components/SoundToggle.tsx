import './SoundToggle.css'

/**
 * Sound on or off.
 *
 * A switch rather than a setting buried somewhere, because this is the one
 * preference a person forms an opinion about in the first ten seconds and
 * usually while somebody else is in the room. It sits on the table, at the
 * corner opposite the round number, where nothing else is.
 */
export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`sound${on ? ' sound--on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* The speaker, which is the same shape either way. */}
        <path
          d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
        {on ? (
          // Two arcs, near and far: loud enough to read at sixteen pixels.
          <>
            <path
              d="M15.2 9.2a4 4 0 0 1 0 5.6"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <path
              d="M18 6.6a7.8 7.8 0 0 1 0 10.8"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M15.6 9.6l5 4.8M20.6 9.6l-5 4.8"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  )
}
