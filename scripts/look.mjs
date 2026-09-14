/*
 * What the table actually looks like.
 *
 * Tuning a renderer by reading its source is guessing. A material's numbers say
 * almost nothing about the pixel that comes out the other end: the albedo goes
 * through a warm key light, an image-based environment, a clearcoat lobe and
 * ACES tone mapping before anybody sees it, and every one of those moves the
 * colour. So this renders the real scene in a real browser and reads the
 * pixels back.
 *
 * It reports each region as three numbers — the dark decile, the median and the
 * bright decile — because that range is the thing that separates a rendered
 * object from a flat fill, and it is exactly what is lost when you compare two
 * screenshots by eye. A cup whose median is right and whose range is half what
 * it should be looks like paint, and no amount of adjusting the hue fixes it.
 *
 * Targets are sampled from docs/reference.png, the look this is aiming at, so
 * "closer" is a number rather than an opinion.
 *
 *   node scripts/look.mjs            # the table, at 390
 *   node scripts/look.mjs --shot     # also write the frames to /tmp
 *
 * The software renderer in CI draws about six frames a second, so this waits
 * on the canvas settling rather than on a clock. Colour it gets right; do not
 * use it to time an animation.
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = Number(process.env.LOOK_PORT ?? 5177)
const SHOT = process.argv.includes('--shot')
const OUT = process.env.LOOK_OUT ?? '/tmp'

/**
 * Where each thing is on the table, as a fraction of the stage.
 *
 * Fractions rather than pixels so the probe survives a change of viewport, and
 * boxes rather than points because one pixel of a lit object is a highlight or
 * a shadow and tells you nothing about the object.
 */
const REGIONS = {
  // The six cups, by seat, at a table of six. Read off the projection rather
  // than guessed: these are the boxes the cups actually land in.
  'cup near': [0.42, 0.6, 0.58, 0.75],
  'cup far': [0.42, 0.28, 0.58, 0.4],
  'cup left': [0.13, 0.44, 0.28, 0.58],
  'cup right': [0.72, 0.44, 0.87, 0.58],
  // Timber with nothing standing on it, between the near cup and the rim.
  wood: [0.3, 0.76, 0.7, 0.86],
  // The room behind the table, above the far rim.
  room: [0.05, 0.04, 0.95, 0.2],
}

/**
 * The reference, sampled the same way.
 *
 * The look is a warm lounge at night: deep bodies with a hot specular, timber
 * that is genuinely red rather than brown-grey, and a room that carries both a
 * cold window and a warm lamp. What these numbers encode is mostly *range* —
 * the reference's cups run from near-black to a bright rim, and flatness is the
 * single thing that reads as unfinished.
 */
const TARGET = {
  wood: { dark: '#3c1409', mid: '#923a19', bright: '#de7743' },
  room: { dark: '#130c11', mid: '#2d2449', bright: '#ce6d37' },
  cup: { spread: 0.55 },
}

const hex = (r, g, b) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

const luma = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]

/** The dark decile, the median and the bright decile of a box of pixels. */
function band(pixels) {
  const sorted = [...pixels].sort((a, b) => luma(a) - luma(b))
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  const [d, m, b] = [at(0.1), at(0.5), at(0.9)]
  return {
    dark: hex(...d),
    mid: hex(...m),
    bright: hex(...b),
    // How far the object travels from its shadow to its highlight, 0-1. A flat
    // fill sits near zero however well its median matches.
    spread: (luma(b) - luma(d)) / 255,
  }
}

/** Distance between two colours, 0-1, weighted the way an eye weights them. */
function apart(a, b) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [n(a), n(b)]
  return Math.sqrt(
    (2 * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + 3 * (x[2] - y[2]) ** 2) / 9,
  ) / 255
}

const server = await createServer({ server: { port: PORT }, logLevel: 'error' })
await server.listen()

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
  const faults = []
  page.on('pageerror', (error) => faults.push(String(error)))

  await page.goto(`http://localhost:${PORT}/preview`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.board__stage canvas')

  /*
   * Wait for the picture, not for a clock.
   *
   * The scene fades its lights up and the cups settle from a deal, and on a
   * software renderer that takes as long as it takes. Two consecutive frames
   * that hash the same mean it has stopped moving, which is the only condition
   * that actually matters here.
   *
   * Read as a screenshot rather than off the canvas. A WebGL context keeps no
   * drawing buffer between frames unless it is asked to, so `toDataURL` on the
   * live canvas comes back a clean black — which does not fail, it quietly
   * reports that everything in the game is the same colour.
   */
  const stage = await page.$('.board__stage')
  const frame = async () => stage.screenshot({ type: 'png' })

  let last = null
  let still = 0
  let shot = null
  for (let i = 0; i < 40 && still < 2; i += 1) {
    await page.waitForTimeout(400)
    shot = await frame()
    const now = createHash('sha1').update(shot).digest('hex')
    still = now === last ? still + 1 : 0
    last = now
  }

  const box = await stage.boundingBox()

  if (SHOT) {
    writeFileSync(`${OUT}/look-table.png`, shot)
    writeFileSync(`${OUT}/look-page.png`, await page.screenshot())
    console.log(`wrote ${OUT}/look-table.png and ${OUT}/look-page.png`)
  }

  // Decoded back inside the page, where there is an image decoder and a 2D
  // canvas already. Node has neither without a dependency, and a probe that
  // needs a build step is a probe nobody runs.
  const read = await page.evaluate(
    async ({ regions, png }) => {
      const blob = await (await fetch(png)).blob()
      const bitmap = await createImageBitmap(blob)
      const scratch = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = scratch.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)

      const out = {}
      for (const [name, [x0, y0, x1, y1]] of Object.entries(regions)) {
        const x = Math.floor(x0 * bitmap.width)
        const y = Math.floor(y0 * bitmap.height)
        const w = Math.max(1, Math.floor((x1 - x0) * bitmap.width))
        const h = Math.max(1, Math.floor((y1 - y0) * bitmap.height))
        const { data } = ctx.getImageData(x, y, w, h)
        const pixels = []
        // Every fourth pixel is plenty for a decile and keeps this instant.
        for (let i = 0; i < data.length; i += 16) pixels.push([data[i], data[i + 1], data[i + 2]])
        out[name] = pixels
      }
      return out
    },
    { regions: REGIONS, png: `data:image/png;base64,${shot.toString('base64')}` },
  )

  console.log(`stage ${Math.round(box.width)}x${Math.round(box.height)}\n`)
  console.log('region      dark     mid      bright   spread  vs reference')

  const cupSpreads = []
  for (const [name, pixels] of Object.entries(read)) {
    const got = band(pixels)
    const want = TARGET[name]
    const note =
      want === undefined
        ? ''
        : `mid ${(apart(got.mid, want.mid) * 100).toFixed(0)}%  ` +
          `bright ${(apart(got.bright, want.bright) * 100).toFixed(0)}%`
    if (name.startsWith('cup ')) cupSpreads.push(got.spread)
    console.log(
      `${name.padEnd(11)} ${got.dark}  ${got.mid}  ${got.bright}  ` +
        `${got.spread.toFixed(2)}    ${note}`,
    )
  }

  const mean = cupSpreads.reduce((a, b) => a + b, 0) / (cupSpreads.length || 1)
  console.log(
    `\ncup spread ${mean.toFixed(2)} against ${TARGET.cup.spread} wanted` +
      `${mean < TARGET.cup.spread * 0.8 ? '  — FLAT, the bodies are reading as paint' : ''}`,
  )

  if (faults.length > 0) {
    console.log('\npage errors:')
    for (const fault of faults) console.log('  ' + fault)
  }
} finally {
  await browser.close()
  await server.close()
}
