import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './Button.css'

type Variant = 'primary' | 'quiet'

/**
 * The one button in the game. Tactile rather than flat: a lifted top edge and a
 * travel of one pixel on press, so a tap feels acknowledged before the server
 * has said anything (PART 84).
 */
export function Button({
  variant = 'primary',
  busy = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** Shows work in flight and blocks repeat submissions. */
  busy?: boolean
  children: ReactNode
}) {
  return (
    <button
      {...rest}
      className={`btn btn--${variant}${busy ? ' btn--busy' : ''}`}
      disabled={rest.disabled === true || busy}
      aria-busy={busy}
    >
      {children}
    </button>
  )
}
