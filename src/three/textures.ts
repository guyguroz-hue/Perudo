import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { CROWN_PATH } from './crown'

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
      const r = Math.hypot(u - heartX, v - heartY) + wander * 0.13 + jitter * 0.028
      /*
       * Fine, because a table is not a dartboard.
       *
       * At sixty-two the rings came out about a dozen broad bands across the
       * whole top, which at the size this is actually seen reads as painted
       * stripes — you see the individual line before you see the figure, which
       * is the wrong way round for timber. Real grain on a board this size is
       * fine enough that the figure arrives first and the lines are what it is
       * made of.
       */
      const rings = Math.sin(r * 104) * 0.5 + 0.5
      // Rings are not sine waves: the late wood is a narrow dark band.
      const band = Math.pow(rings, 2.4)

      // Fine fibre running along the grain, which is what catches the light.
      const fibre = (fbm(noise, u * 210 + 3, v * 12 + 19) - 0.5) * 0.8

      // A slow drift across the whole board, so the table is not one flat tone
      // with a pattern on it. Boards are lighter at one end than the other.
      const drift = (fbm(noise, u * 0.8 + 41, v * 0.8 + 5) - 0.5) * 0.22

      // Kept close together on purpose. Wide swings read as marble or as fire;
      // cherry is nearly one colour, with the grain showing mostly in how it
      // takes the light rather than in how dark it is.
      // Less contrast per ring than before, because there are now twice as many
      // of them: the total figure is what stayed the same.
      const shade = clamp01(0.46 + band * 0.085 + fibre * 0.13 + drift * 0.85)
      const i = (y * size + x) * 4
      /*
       * Cherry, not walnut.
       *
       * These channels were much closer together, on the reasoning that wood
       * sits nearer grey than it feels like it should and a saturated red-brown
       * tone-maps into moulded plastic. That is true of a board in daylight and
       * wrong here: this table is lit by one warm lamp in a dark room, and ACES
       * pulls the saturation *out* of a warm midtone on its way to the screen.
       * Compensating before the tone mapper rather than after is what finally
       * made it read as timber — the wood the reference is cut from is plainly
       * red, and ours was going through the whole pipeline as cardboard.
       */
      image.data[i] = 40 + 132 * shade
      image.data[i + 1] = 24 + 76 * shade
      image.data[i + 2] = 16 + 46 * shade
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

  brand(ctx, roughCtx, size)

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.anisotropy = 8

  const rough = new CanvasTexture(roughCanvas)
  rough.wrapS = RepeatWrapping
  rough.wrapT = RepeatWrapping
  rough.anisotropy = 8

  /*
   * Stamped again once the display face has loaded.
   *
   * The scene is usually built after the fonts are in, but not always — and a
   * table branded in the fallback face while the rest of the product is in
   * Outfit is worse than one branded a moment late. Cheap: the grain is already
   * in the canvas and is not touched, only the mark is redrawn over it.
   */
  if (typeof document !== 'undefined' && document.fonts !== undefined && !hasDisplayFace()) {
    void document.fonts.ready.then(() => {
      brand(ctx, roughCtx, size)
      map.needsUpdate = true
      rough.needsUpdate = true
    })
  }

  return { map, rough }
}

/** Whether the product's own display face is loaded and usable on a canvas. */
function hasDisplayFace(): boolean {
  try {
    return document.fonts.check('700 100px Outfit')
  } catch {
    return false
  }
}

/**
 * The maker's mark, cut into the middle of the table.
 *
 * Engraved rather than printed, and that is the whole of the work: a carve is
 * dark in the groove, catches a highlight on the edge the light falls on, and
 * is rougher than the lacquer around it because the finish was cut through. All
 * three are done here — the third into the roughness map, which is what stops
 * it reading as a sticker when the table turns under the light.
 *
 * It is in the timber rather than on an object of its own, so it costs nothing
 * to draw, takes the table's own lighting for free, and cannot drift out of
 * position: the tabletop's texture coordinates are planar and centred, so the
 * middle of this canvas is the middle of the table.
 *
 * Small on purpose. It is a mark on a table somebody plays on, not a title
 * card, and the bid sits above it.
 */
function brand(ctx: CanvasRenderingContext2D, roughCtx: CanvasRenderingContext2D, size: number) {
  const mid = size / 2
  // A quarter of the texture, so it sits well inside the ring of cups. Larger,
  // it stops being a mark on a table and becomes a title card.
  const width = size * 0.25

  /*
   * Set a little toward the player rather than dead centre.
   *
   * The bid floats over the middle of the table, and a mark directly under it
   * loses its crown to the bid's own shadow. The tabletop's texture is planar
   * and the mesh is laid flat, so the bottom of this canvas is the near edge:
   * down here is toward whoever is sitting at the table.
   */
  const forward = size * 0.055

  const draw = (target: CanvasRenderingContext2D, colour: string, dx: number, dy: number) => {
    target.save()
    target.translate(mid + dx, mid + forward + dy)
    target.fillStyle = colour
    target.strokeStyle = colour

    // The crown, above the word, from the same paths the cups are stamped with.
    const crown = width * 0.34
    const scale = crown / 32
    target.save()
    target.translate(-crown / 2, -width * 0.26)
    target.scale(scale, scale)
    for (const d of CROWN_PATH) target.fill(new Path2D(d))
    target.restore()

    // The word, tracked wide the way a brand burned into wood is.
    const face = hasDisplayFace() ? 'Outfit' : 'Impact, Haettenschweiler, sans-serif'
    target.font = `700 ${Math.round(width * 0.19)}px ${face}`
    target.textAlign = 'center'
    target.textBaseline = 'middle'
    letterspaced(target, 'PERUDO', 0, width * 0.12, width * 0.055)

    // A rule under it, which is what makes a wordmark look struck rather than
    // typed.
    target.lineWidth = Math.max(1, width * 0.012)
    target.beginPath()
    target.moveTo(-width * 0.34, width * 0.26)
    target.lineTo(width * 0.34, width * 0.26)
    target.stroke()
    target.restore()
  }

  // The carve: a highlight below and to the right where the light catches the
  // far wall of the groove, then the groove itself over it.
  const lift = Math.max(1, size * 0.0022)
  ctx.globalAlpha = 0.5
  draw(ctx, 'rgba(255, 226, 180, 0.55)', lift, lift)
  ctx.globalAlpha = 0.62
  draw(ctx, 'rgba(26, 14, 6, 0.9)', 0, 0)
  ctx.globalAlpha = 1

  // Cut through the lacquer, so the mark scatters where the table reflects.
  roughCtx.globalAlpha = 0.55
  draw(roughCtx, '#ffffff', 0, 0)
  roughCtx.globalAlpha = 1
}

/**
 * Text with air between the letters.
 *
 * Canvas has no letter-spacing worth relying on, and the tracking is most of
 * what separates a mark burned into a table from a word typed onto one.
 */
function letterspaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
) {
  const widths = [...text].map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1)
  let cursor = x - total / 2
  for (const [i, glyph] of [...text].entries()) {
    ctx.fillText(glyph, cursor + widths[i] / 2, y)
    cursor += widths[i] + tracking
  }
}
