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
  size,
  hidden = false,
  tone,
  label,
  className,
}: {
  face?: Face
  /**
   * How big, in pixels.
   *
   * Left off where the size belongs to the layout rather than to the call:
   * `--die-size` then comes from the stylesheet, and a die in the player's
   * hand can be given one size on a tall phone and a smaller one on a short
   * phone by a media query. An inline custom property cannot be beaten by an
   * ordinary rule, so a die that hard-codes its size cannot be made to respond
   * to anything.
   */
  size?: number
  /** A die in somebody else's cup: drawn as a blank, never as a value. */
  hidden?: boolean
  /** Player colour, for the blanks that stand in for a player's dice count. */
  tone?: string
  label?: string
  /** For the one caller that sizes its dice from the stylesheet. */
  className?: string
}) {
  const style = {
    ...(size === undefined ? {} : { '--die-size': `${size}px` }),
    ...(tone === undefined ? {} : { '--die-tone': tone }),
  } as CSSProperties
  const classes = (base: string) => (className === undefined ? base : `${base} ${className}`)

  if (hidden || face === undefined) {
    return (
      <span
        className={classes('die die--hidden')}
        style={style}
        role="img"
        aria-label={label ?? 'Hidden die'}
      />
    )
  }

  if (face === 1) {
    return (
      <span className={classes('die die--joker')} style={style} role="img" aria-label={label ?? 'Joker'}>
        <JokerFace className="die__joker" />
      </span>
    )
  }

  return (
    <span className={classes('die')} style={style} role="img" aria-label={label ?? `Die showing ${face}`}>
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
