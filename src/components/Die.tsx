import type { CSSProperties } from 'react'
import type { Face } from '../game'
import './Die.css'

/**
 * A single die.
 *
 * Pips are laid out on a 3x3 grid rather than drawn, so the face scales with the
 * die and stays crisp at any size. The Perudo face is tinted brass because it is
 * the wildcard — but the pip count still says which face it is, so the meaning
 * never rests on colour alone.
 */
export function Die({
  face,
  size = 44,
  hidden = false,
  label,
}: {
  face?: Face
  size?: number
  /** A die in someone else's cup: shown as a blank, never as a value. */
  hidden?: boolean
  label?: string
}) {
  const style = { '--die-size': `${size}px` } as CSSProperties

  if (hidden || face === undefined) {
    return (
      <span className="die die--hidden" style={style} role="img" aria-label={label ?? 'Hidden die'} />
    )
  }

  return (
    <span
      className={`die${face === 1 ? ' die--perudo' : ''}`}
      style={style}
      role="img"
      aria-label={label ?? `Die showing ${face}`}
    >
      {PIPS[face].map((position) => (
        <span key={position} className={`die__pip die__pip--${position}`} />
      ))}
    </span>
  )
}

/** Grid positions for each face, named by row and column on the 3x3. */
const PIPS: Record<Face, readonly string[]> = {
  1: ['mc'],
  2: ['tl', 'br'],
  3: ['tl', 'mc', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
}
