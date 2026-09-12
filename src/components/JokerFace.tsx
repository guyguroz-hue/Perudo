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
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.6 12.4c0-2.9 2.1-4.6 5.3-4.4 2.6.2 4.4 1.1 5.9 1.6.9.3 1.6.4 2.2.4s1.3-.1 2.2-.4c1.5-.5 3.3-1.4 5.9-1.6 3.2-.2 5.3 1.5 5.3 4.4 0 5.9-3.9 11.2-8.2 11.2-2.4 0-3.9-1.6-5.2-1.6s-2.8 1.6-5.2 1.6c-4.3 0-8.2-5.3-8.2-11.2Zm5.2 1.9c-.5 1.5.9 3.4 3.1 3.4 1.8 0 3.1-1 3.1-2.3 0-1.5-1.9-2.8-3.9-2.8-1.1 0-2 .6-2.3 1.7Zm16.4 0c.5 1.5-.9 3.4-3.1 3.4-1.8 0-3.1-1-3.1-2.3 0-1.5 1.9-2.8 3.9-2.8 1.1 0 2 .6 2.3 1.7Z"
      />
    </svg>
  )
}
