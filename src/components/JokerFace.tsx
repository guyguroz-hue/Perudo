import { JOKER_EYES, JOKER_MASK } from '../three/joker'

/**
 * The Perudo wildcard.
 *
 * The face that would carry a single pip never shows a "1" anywhere in this
 * product. The one is not a quantity — it is the die that counts as any other,
 * and a numeral says none of that.
 *
 * A harlequin's mask: one silhouette with two cut-outs. The shape was chosen
 * for the size it has to survive rather than for how it looks large — at 22px,
 * one of five dice in somebody's hand, a drawing made of strokes turns to
 * mush, while a solid form with big holes in it still reads. Two earlier
 * attempts at a jester's cap failed exactly there: one became a horseshoe, the
 * next a tuning fork.
 *
 * It also happens to be the right idea. This is a game about lying convincingly
 * about what is under your cup, and the mask is the face you put on to do it.
 *
 * Not a star, not a question mark, not an emoji. Those are all somebody else's
 * symbol; this one is only ours.
 */
export function JokerFace({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      {/* The silhouette and its holes, punched with the even-odd rule. */}
      <path fillRule="evenodd" clipRule="evenodd" d={`${JOKER_MASK}${JOKER_EYES.join('')}`} />
    </svg>
  )
}
