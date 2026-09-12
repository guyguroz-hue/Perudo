import { JOKER_BOX, JOKER_PATHS } from '../three/joker'

/**
 * The Perudo wildcard: the game's crown, on the die that wears it.
 *
 * See `src/three/joker.ts` for why it is the crown and not a mark of its own.
 */
export function JokerFace({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${JOKER_BOX.width} ${JOKER_BOX.height}`}
      fill="currentColor"
      aria-hidden="true"
    >
      {JOKER_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
