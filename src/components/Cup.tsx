import type { CSSProperties } from 'react'
import { PERUDO_GLYPH } from './perudoGlyph'
import './Cup.css'

/**
 * A dice cup, in tooled leather.
 *
 * Drawn rather than photographed or textured with an image: a cup per player
 * at up to six players, lifting at once, has to cost nothing to render on a
 * phone. The leather is a stack of gradients and the carving is the same
 * Perudo glyph the dice use, stamped twice — once dark and once light and
 * offset by a pixel — which is what tooled leather actually looks like: not a
 * drawn line but an impression catching the light on one edge.
 *
 * `lifted` is the only state. It is a transform, so lifting six of them is six
 * composited layers and no layout.
 */
export function Cup({
  lifted = false,
  size = 84,
  label,
}: {
  lifted?: boolean
  size?: number
  label?: string
}) {
  const style = { '--cup-size': `${size}px` } as CSSProperties

  return (
    <span
      className={`cup${lifted ? ' cup--lifted' : ''}`}
      style={style}
      role="img"
      aria-label={label ?? 'Dice cup'}
    >
      <span className="cup__body">
        <svg className="cup__carving" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {PERUDO_GLYPH.reduced.map((d) => (
            <g key={d}>
              <path d={d} className="cup__cut" strokeWidth="2.6" />
              <path d={d} className="cup__catch" strokeWidth="2.6" />
            </g>
          ))}
        </svg>
      </span>
      <span className="cup__shadow" aria-hidden="true" />
    </span>
  )
}
