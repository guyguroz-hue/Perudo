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
  '#14b8c6',
]

export function hexForSeat(seat: number): string {
  return SEAT_HEX[((seat % SEAT_HEX.length) + SEAT_HEX.length) % SEAT_HEX.length]
}

/**
 * The same six colours as a lacquered object rather than as a label.
 *
 * A cup is not its swatch. The colours above are chosen to stay legible as a
 * name tag on a dark screen, which makes them mid-value — and a mid-value
 * albedo under a bright lamp comes back out of the tone mapper as a flat,
 * chalky fill. It is the single reason the table read as a diagram of cups
 * instead of six objects: real moulded plastic is *dark*, and everything that
 * makes it look like plastic is the highlight sitting on top of that dark.
 *
 * So the body is the seat's hue taken down to roughly a third of its lightness
 * and pushed up in saturation, and the clearcoat is left to supply the range.
 * Same hue, same identity, same six colours — a player's cup and their badge
 * are still recognisably one thing.
 */
export const CUP_HEX: readonly string[] = [
  '#3a1178',
  '#08744a',
  '#0c357f',
  '#74061f',
  '#8c4402',
  '#045a66',
]

export function cupHexForSeat(seat: number): string {
  return CUP_HEX[((seat % CUP_HEX.length) + CUP_HEX.length) % CUP_HEX.length]
}
