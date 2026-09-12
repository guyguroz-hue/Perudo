import {
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  PMREMGenerator,
  RGBAFormat,
  type Texture,
  type WebGLRenderer,
} from 'three'

/**
 * The room, as the table sees it.
 *
 * Every polished surface in the scene shows what is around it, and what is
 * around it is the single biggest difference between a render that looks
 * expensive and one that looks like plastic. Rather than download a captured
 * environment — a megabyte or two, on the critical path of a game people open
 * on a phone — the room is written: a dark interior, a cool window on one
 * side, a warm lamp on the other, and a lit ceiling above.
 *
 * The result is a real image-based light. The cups pick up a cold rim from the
 * window and a warm one from the lamp, and the tabletop reflects both.
 */
export function roomEnvironment(renderer: WebGLRenderer): Texture {
  const width = 256
  const height = 128
  const data = new Float32Array(width * height * 4)

  // Where the two lights sit, as fractions of the panorama.
  const lights = [
    // The window: cold, wide, low on the left.
    { u: 0.18, v: 0.46, size: 0.11, r: 0.34, g: 0.52, b: 1.0, power: 1.3 },
    // The lamp: warm, tighter, on the right.
    { u: 0.74, v: 0.4, size: 0.11, r: 1.5, g: 0.82, b: 0.36, power: 5.0 },
    // A little bounce off the ceiling, so the tops of things are not black.
    { u: 0.5, v: 0.06, size: 0.5, r: 0.5, g: 0.46, b: 0.52, power: 0.9 },
  ]

  for (let y = 0; y < height; y += 1) {
    const v = y / height
    for (let x = 0; x < width; x += 1) {
      const u = x / width

      // The room itself: near black, a shade warmer below the horizon where the
      // floor is, and cooler above it.
      const horizon = Math.min(1, Math.max(0, (v - 0.5) * 6))
      let r = 0.02 + horizon * 0.026
      let g = 0.015 + horizon * 0.016
      let b = 0.018 + horizon * 0.012

      for (const light of lights) {
        // Wrap horizontally: the panorama is a loop.
        let du = Math.abs(u - light.u)
        du = Math.min(du, 1 - du)
        const dv = v - light.v
        const d = Math.hypot(du * 2, dv) / light.size
        const falloff = Math.exp(-d * d)
        r += light.r * light.power * falloff
        g += light.g * light.power * falloff
        b += light.b * light.power * falloff
      }

      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 1
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
  texture.mapping = EquirectangularReflectionMapping
  texture.needsUpdate = true

  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(texture)
  pmrem.dispose()
  texture.dispose()
  return target.texture
}
