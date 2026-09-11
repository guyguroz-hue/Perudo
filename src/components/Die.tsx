import type { CSSProperties } from 'react'
import type { Face } from '../game'
import { GLYPH_DETAIL_THRESHOLD, PERUDO_GLYPH, glyphStrokeWidth } from './perudoGlyph'
import './Die.css'

/**
 * A single die.
 *
 * Faces 2–6 are pips on a 3×3 grid, so they scale without ever going soft. The
 * one is not a pip at all: it is the Perudo glyph, because the wildcard is a
 * different kind of thing from a number and the die should say so. Tinting a
 * pip would have carried the same meaning in colour alone, which is no meaning
 * at all to anyone glancing quickly or not seeing the tint.
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

  if (face === 1) {
    const detailed = size >= GLYPH_DETAIL_THRESHOLD
    const paths = detailed ? PERUDO_GLYPH.detailed : PERUDO_GLYPH.reduced

    return (
      <span className="die die--perudo" style={style} role="img" aria-label={label ?? 'Perudo'}>
        <svg className="die__glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {paths.map((d) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={glyphStrokeWidth(size)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
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

/** Grid positions for each face, named by row and column on the 3×3. */
const PIPS: Record<Exclude<Face, 1>, readonly string[]> = {
  2: ['tl', 'br'],
  3: ['tl', 'mc', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
}
