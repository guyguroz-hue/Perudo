import type { CSSProperties } from 'react'
import type { Face } from '../game'
import { JokerFace } from './JokerFace'
import './Die.css'

/**
 * A die.
 *
 * The one canonical die in the product. Every place a face is shown — a hand,
 * the bid builder, the current bid, the reveal, a player's dice count — renders
 * this, so there is exactly one answer to what a die looks like and exactly one
 * place the wildcard rule lives.
 *
 * Faces 2-6 are pips on a 3x3 grid, which scale without ever going soft. The
 * one is never a pip and never a numeral: it is the Joker (GAME_RULES §3).
 */
export function Die({
  face,
  size = 44,
  hidden = false,
  tone,
  label,
}: {
  face?: Face
  size?: number
  /** A die in somebody else's cup: drawn as a blank, never as a value. */
  hidden?: boolean
  /** Player colour, for the blanks that stand in for a player's dice count. */
  tone?: string
  label?: string
}) {
  const style = {
    '--die-size': `${size}px`,
    ...(tone === undefined ? {} : { '--die-tone': tone }),
  } as CSSProperties

  if (hidden || face === undefined) {
    return (
      <span
        className="die die--hidden"
        style={style}
        role="img"
        aria-label={label ?? 'Hidden die'}
      />
    )
  }

  if (face === 1) {
    return (
      <span className="die die--joker" style={style} role="img" aria-label={label ?? 'Joker'}>
        <JokerFace className="die__joker" />
      </span>
    )
  }

  return (
    <span className="die" style={style} role="img" aria-label={label ?? `Die showing ${face}`}>
      {PIPS[face].map((position) => (
        <span key={position} className={`die__pip die__pip--${position}`} />
      ))}
    </span>
  )
}

/** Grid positions for each face, named by row and column on the 3x3. */
const PIPS: Record<Exclude<Face, 1>, readonly string[]> = {
  2: ['tl', 'br'],
  3: ['tl', 'mc', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
}
