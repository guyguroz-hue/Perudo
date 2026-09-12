import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Textures, generated rather than downloaded.
 *
 * A table without grain is a plastic disc, and grain is the difference between
 * "a brown circle" and "cherry". Buying that with an image file would mean a
 * megabyte on the critical path of a game people open on a phone, so it is
 * drawn instead — which is also how wood is made in every renderer: rings,
 * disturbed by noise, sampled as a distance from the heart of the trunk.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Value noise with a fixed seed, so the table looks the same every time. */
function makeNoise(seed: number) {
  const table = new Float32Array(256)
  let s = seed
  for (let i = 0; i < 256; i += 1) {
    s = (s * 1664525 + 1013904223) % 4294967296
    table[i] = s / 4294967296
  }
  const at = (x: number, y: number) => table[(x * 57 + y * 131) & 255]

  return function noise(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    // Smoothstep, so the cells do not show as a grid.
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
  }
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number): number {
  let total = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < 4; i += 1) {
    total += noise(x * freq, y * freq) * amp
    freq *= 2.1
    amp *= 0.5
  }
  return total
}

/**
 * Walnut, seen from above.
 *
 * The heart of the trunk is pushed off to one side of the tabletop, so the
 * rings run across the surface as arcs rather than as a bullseye — which is
 * what a board cut from a log actually looks like, and what stops the table
 * reading as a dartboard.
 *
 * Two things decide whether this reads as timber or as paint, and neither is
 * the pattern. The first is how many rings there are: a dozen wide bands across
 * a table is a fairground ride, and real grain is fine enough that you see the
 * figure before you see any single line. The second is the colour — wood sits
 * much closer to grey than it feels like it should, and a saturated red-brown
 * comes out of the tone mapper looking like moulded plastic.
 */
export function woodTexture(size = 1024): { map: Texture; rough: Texture } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the wood texture')

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = size
  roughCanvas.height = size
  const roughCtx = roughCanvas.getContext('2d')
  if (roughCtx === null) throw new Error('no 2d context for the wood roughness')

  const image = ctx.createImageData(size, size)
  const roughImage = roughCtx.createImageData(size, size)
  const noise = makeNoise(20260912)

  // The heart of the log, well outside the tabletop.
  const heartX = -1.9
  const heartY = 0.35

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * 2 - 1
      const v = (y / size) * 2 - 1

      // Two scales of disturbance: a slow wander that bends whole rings, and a
      // finer one that roughens their edges. Rings drawn from a clean radius
      // come out as corduroy, which is the other way this can go wrong.
      const wander = fbm(noise, u * 1.1 + 11, v * 1.1 + 7) - 0.5
      const jitter = fbm(noise, u * 11 + 31, v * 11 + 2) - 0.5
      const r = Math.hypot(u - heartX, v - heartY) + wander * 0.13 + jitter * 0.022
      const rings = Math.sin(r * 62) * 0.5 + 0.5
      // Rings are not sine waves: the late wood is a narrow dark band.
      const band = Math.pow(rings, 2.4)

      // Fine fibre running along the grain, which is what catches the light.
      const fibre = (fbm(noise, u * 210 + 3, v * 12 + 19) - 0.5) * 0.8

      // A slow drift across the whole board, so the table is not one flat tone
      // with a pattern on it. Boards are lighter at one end than the other.
      const drift = (fbm(noise, u * 0.8 + 41, v * 0.8 + 5) - 0.5) * 0.22

      // Kept close together on purpose. Wide swings read as marble or as fire;
      // walnut is nearly one colour, with the grain showing mostly in how it
      // takes the light rather than in how dark it is.
      const shade = clamp01(0.46 + band * 0.11 + fibre * 0.1 + drift * 0.8)
      const i = (y * size + x) * 4
      image.data[i] = 38 + 104 * shade
      image.data[i + 1] = 26 + 74 * shade
      image.data[i + 2] = 20 + 52 * shade
      image.data[i + 3] = 255

      // Late wood is denser and takes a polish differently, so the grain shows
      // in the reflection as well as in the colour. This is most of what makes
      // it read as a finished surface rather than a painted one.
      const rough = 0.13 + (1 - band) * 0.2 + fibre * 0.1
      const g = Math.round(rough * 255)
      roughImage.data[i] = g
      roughImage.data[i + 1] = g
      roughImage.data[i + 2] = g
      roughImage.data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  roughCtx.putImageData(roughImage, 0, 0)

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.anisotropy = 8

  const rough = new CanvasTexture(roughCanvas)
  rough.wrapS = RepeatWrapping
  rough.wrapT = RepeatWrapping
  rough.anisotropy = 8

  return { map, rough }
}
