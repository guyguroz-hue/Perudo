/**
 * The Perudo face — the mark that replaces the one.
 *
 * A curled Andean serpent-hook, in the spirit of the glyph on a real Perudo
 * die: a heavy crescent, a coiled eye, and a tail sweeping away. Drawn rather
 * than copied — the mark on the commercial dice is somebody's artwork.
 *
 * Two levels of detail, because one cannot serve both ends of the range. The
 * full drawing is right in your own hand and in the bid builder; at the size a
 * player scans the table with, its interior collapses into a smudge. The
 * reduction keeps the same gesture — the hook, the coil, the tail — with the
 * strokes that only read when large removed.
 *
 * This is the usual icon practice, not a compromise: the player sees one mark,
 * drawn as well as its size allows.
 */

/** Below this, the full drawing stops resolving and the reduction is used. */
export const GLYPH_DETAIL_THRESHOLD = 30

export const PERUDO_GLYPH = {
  /** Full drawing. Legible from roughly 30px up. */
  detailed: [
    'M9.5 7.5c5.4-1.9 11 .6 12 5.2.7 3.3-1.4 6-4.2 6.2-2.2.2-3.8-1.2-3.9-2.9-.1-1.5 1-2.6 2.3-2.6 1 0 1.8.7 1.8 1.6',
    'M9.5 7.5C6.2 8.7 4.4 11.4 5 14.2c.5 2.3 2.5 3.6 4.5 3.3',
    'M9.8 20.6c1.6 2.9 5 4.5 8.4 3.9 3.6-.6 6-3.3 6-6.4',
    'M24.2 18.1c1.5.5 2.6 1.7 2.8 3.1',
  ],
  /** Same gesture, fewer strokes. Holds together small. */
  reduced: [
    'M10 7.6c6-1.6 11.6 1.4 12.2 6.2.5 3.8-2.5 6.6-5.8 6.2-2.4-.3-3.9-2-3.7-3.9',
    'M10 7.6C6.4 9 4.6 12.2 5.4 15.3c.8 3 3.9 5 7.3 4.6',
    'M11.5 20.4c2 3 5.9 4.4 9.4 3.3',
  ],
} as const

/**
 * Stroke weight, matched to the pips rather than chosen by eye.
 *
 * A pip is 18% of the die across. At the same visual weight the glyph's stroke
 * wants to be close to that, or the Perudo face reads as faded next to a five —
 * which is exactly backwards for the one face a player is always counting.
 * Thinner lines also disappear first to anti-aliasing, so the reduction carries
 * more weight again.
 */
export function glyphStrokeWidth(size: number): number {
  return size >= GLYPH_DETAIL_THRESHOLD ? 2.9 : 3.8
}
