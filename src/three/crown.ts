/**
 * The crown.
 *
 * One shape, in one place. The interface draws it as an SVG and the renderer
 * stamps it into the lacquer on every cup, and both read these paths — so the
 * mark on a cup and the mark in the lobby cannot drift into two drawings of
 * the same idea.
 *
 * Drawn in a 32 by 22 box.
 */
export const CROWN_PATH: readonly string[] = [
  'M5.2 5.1c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 2l3 4.2 5-9.1c-.8-.4-1.3-1.2-1.3-2.1C13.4 1.2 14.5 0 16 0s2.6 1.2 2.6 2.6c0 .9-.5 1.7-1.3 2.1l5 9.1 3-4.2c-.6-.5-1-1.2-1-2 0-1.4 1.1-2.5 2.5-2.5S29.3 6.2 29.3 7.6 28.2 10.1 26.8 10.1h-.2L24 18.4H8L5.4 10.1h-.2C3.8 10.1 2.7 9 2.7 7.6S3.8 5.1 5.2 5.1Z',
  'M5.6 19h20.8a1.5 1.5 0 0 1 0 3H5.6a1.5 1.5 0 0 1 0-3Z',
]
