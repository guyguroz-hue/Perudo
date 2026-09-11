import './Seat.css'

/**
 * One place at the table, taken or empty.
 *
 * An empty seat reads as an invitation rather than a gap — the specification
 * asks for "there's room for another friend", not six blank cards.
 */
export function Seat({
  name,
  isHost = false,
  isYou = false,
  onMenu,
}: {
  name?: string
  isHost?: boolean
  isYou?: boolean
  /** Rendered only when the viewer may act on this player. */
  onMenu?: () => void
}) {
  if (name === undefined) {
    return (
      <div className="seat seat--empty" aria-label="Empty seat">
        <span className="seat__ring" aria-hidden="true" />
        <span className="seat__label">Open</span>
      </div>
    )
  }

  return (
    <div className={`seat${isYou ? ' seat--you' : ''}`}>
      <span className="seat__avatar" aria-hidden="true">
        {initial(name)}
      </span>
      <span className="seat__label">
        {name}
        {isYou && <span className="seat__tag"> (you)</span>}
      </span>
      {isHost && <span className="seat__host">HOST</span>}
      {onMenu !== undefined && (
        <button
          type="button"
          className="seat__menu"
          onClick={onMenu}
          aria-label={`Options for ${name}`}
        >
          ⋯
        </button>
      )}
    </div>
  )
}

function initial(name: string): string {
  // Intl.Segmenter so an emoji or a combining mark counts as one character
  // rather than rendering half a glyph.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const [first] = segmenter.segment(name.trim())
  return (first?.segment ?? '?').toUpperCase()
}
