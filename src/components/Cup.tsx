import type { CSSProperties } from 'react'
import { Crown } from './Crown'
import './Cup.css'

/**
 * A dice cup.
 *
 * The signature object of the game and the one that carries the hidden
 * information rule without a word of explanation: a cup on the table means
 * those dice are not yours to see.
 *
 * Built from gradients and two ellipses rather than a rendered image, because
 * six of these move at once on a phone. It is stylised rather than
 * photoreal — a real leather cup at 90px is a brown smudge, while a shape with
 * one clear light source and one clear silhouette reads instantly.
 *
 * `tone` is the player's colour. It is the cup's whole body, not a stripe on
 * it: at the size a cup appears on a phone, an accent is invisible and the
 * body is the only thing that can carry identity.
 */
export type CupState = 'covered' | 'shaking' | 'lifting' | 'lifted'

export function Cup({
  tone,
  state = 'covered',
  active = false,
  size = 92,
  label,
}: {
  /** The player's colour: a `--p1`…`--p6` value. */
  tone: string
  state?: CupState
  /** Whether this player holds the turn. The only reason anything here glows. */
  active?: boolean
  /**
   * How wide the cup is drawn. A number is pixels; a string is any CSS length,
   * which is how a cup on the table takes its size from the table rather than
   * from a constant that knows nothing about the camera.
   */
  size?: number | string
  label?: string
}) {
  const style = {
    '--cup-size': typeof size === 'number' ? `${size}px` : size,
    '--cup-tone': tone,
  } as CSSProperties

  return (
    <span
      className={`cup cup--${state}${active ? ' cup--active' : ''}`}
      style={style}
      role="img"
      aria-label={label ?? 'Dice cup'}
    >
      <span className="cup__glow" aria-hidden="true" />
      <span className="cup__coaster" aria-hidden="true" />
      <span className="cup__rig" aria-hidden="true">
        <span className="cup__shadow" />
        <span className="cup__body">
          <span className="cup__sheen" />
          <span className="cup__rim" />
          <Crown className="cup__crown" />
        </span>
        <span className="cup__foot" />
        <span className="cup__lid" />
      </span>
    </span>
  )
}
