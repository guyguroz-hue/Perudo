/**
 * Player colour.
 *
 * Assigned by seat, not by name or join order, so every player sees the same
 * colour on the same person — which is the only way colour can replace reading
 * a name. Seats are fixed for the life of a room, so a colour is too.
 *
 * Six colours for six seats. They are separated by hue rather than by
 * lightness, because a cup on a phone is small and two colours that differ
 * only in brightness are one colour in a dark room.
 */
export const SEAT_TONES: readonly string[] = [
  'var(--p1)',
  'var(--p2)',
  'var(--p3)',
  'var(--p4)',
  'var(--p5)',
  'var(--p6)',
]

export function toneForSeat(seat: number): string {
  // Modulo rather than a bounds check: a seat outside 0-5 is a bug elsewhere,
  // and a player with no colour would be worse than a player sharing one.
  return SEAT_TONES[((seat % SEAT_TONES.length) + SEAT_TONES.length) % SEAT_TONES.length]
}

/**
 * The same six colours, as values rather than as CSS variables.
 *
 * The renderer cannot read a stylesheet, so it needs the numbers. They are
 * written once here and the custom properties above are generated from the
 * same list, so a colour named in one place and used in another cannot drift.
 */
export const SEAT_HEX: readonly string[] = [
  '#8b5cf6',
  '#10b981',
  '#3b82f6',
  '#e5346b',
  '#f59e0b',
  '#2b3444',
]

export function hexForSeat(seat: number): string {
  return SEAT_HEX[((seat % SEAT_HEX.length) + SEAT_HEX.length) % SEAT_HEX.length]
}
