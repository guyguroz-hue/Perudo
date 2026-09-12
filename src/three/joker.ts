/**
 * The Perudo wildcard, as path data.
 *
 * One shape, read by the interface's SVG and by the renderer's die face alike,
 * so the mark on a drawn die and the mark on a rendered one cannot become two
 * drawings of the same idea.
 *
 * A harlequin's mask: one silhouette with two cut-outs. Kept as a silhouette
 * and its holes rather than as a single even-odd path, because the size of the
 * holes turned out to be the whole design. On a rendered die seen at the angle
 * a seated player sees it, the face is foreshortened to about half its height —
 * and a solid mark with two small holes, squashed, reads as the digit eight.
 * Wide eyes taking most of the mass read as a mask at any angle.
 *
 * Drawn in a 32 by 32 box.
 */
export const JOKER_MASK =
  'M2.6 12.4c0-2.9 2.1-4.6 5.3-4.4 2.6.2 4.4 1.1 5.9 1.6.9.3 1.6.4 2.2.4s1.3-.1 2.2-.4c1.5-.5 3.3-1.4 5.9-1.6 3.2-.2 5.3 1.5 5.3 4.4 0 5.9-3.9 11.2-8.2 11.2-2.4 0-3.9-1.6-5.2-1.6s-2.8 1.6-5.2 1.6c-4.3 0-8.2-5.3-8.2-11.2Z'

export const JOKER_EYES: readonly string[] = [
  'M6.4 13.6c1.4-2.3 5.2-2.5 7.2-.5 1.3 1.3.5 4.5-2.4 5.1-2.9.6-6.2-1.8-4.8-4.6Z',
  'M25.6 13.6c-1.4-2.3-5.2-2.5-7.2-.5-1.3 1.3-.5 4.5 2.4 5.1 2.9.6 6.2-1.8 4.8-4.6Z',
]
