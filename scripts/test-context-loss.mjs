/*
 * The table comes back after the GPU takes its context away.
 *
 * Browsers reclaim WebGL contexts: a phone under memory pressure, a driver
 * reset, a tab left in the background long enough. The context comes back a
 * moment later — but only if the page asked for it, and only to a canvas
 * somebody then repaints.
 *
 * This scene renders when something changes and stands still the rest of the
 * time, which is why six motionless cups cost nothing per frame. It is also
 * why the failure is silent: a restored context arrives at a canvas with no
 * loop to paint it, so the table stays black until a round happens to change a
 * seat. On a phone that is indistinguishable from a crash, and nothing in the
 * unit tests can see it — jsdom has no GPU to lose.
 *
 * So it is done for real, with WEBGL_lose_context, and judged on light: a
 * blank canvas leaves only the dark room behind the DOM overlay, so the share
 * of the stage that is not black collapses and has to come back.
 *
 *   npm run test:recover
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = Number(process.env.RECOVER_PORT ?? 5182)

/** How much of the stage has light on it, 0-1, read off the composited page. */
async function litFraction(page, stage) {
  const shot = await stage.screenshot({ type: 'png' })
  return page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(await (await fetch(png)).blob())
    const scratch = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = scratch.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    let lit = 0
    let seen = 0
    for (let i = 0; i < data.length; i += 16) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (luma > 12) lit += 1
      seen += 1
    }
    return lit / seen
  }, `data:image/png;base64,${shot.toString('base64')}`)
}

const server = await createServer({ server: { port: PORT }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

let failures = 0
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const faults = []
  page.on('pageerror', (error) => faults.push(String(error)))

  await page.goto(`http://localhost:${PORT}/preview`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.board__stage canvas')
  await page.waitForTimeout(4000)

  const stage = await page.$('.board__stage')
  const before = await litFraction(page, stage)
  console.log(`lit before the loss    ${(before * 100).toFixed(1)}%`)
  if (before < 0.5) {
    console.log('\nCANNOT TELL  the table was not drawn to begin with.')
    process.exit(1)
  }

  const lost = await page.evaluate(() => {
    const canvas = document.querySelector('.board__stage canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_lose_context')
    if (!ext) return false
    globalThis.__loseContext = ext
    ext.loseContext()
    return true
  })
  if (!lost) {
    console.log('\nCANNOT TELL  this browser has no WEBGL_lose_context.')
    process.exit(1)
  }

  await page.waitForTimeout(1200)
  const during = await litFraction(page, stage)
  console.log(`lit while it is gone   ${(during * 100).toFixed(1)}%`)
  if (during > before * 0.6) {
    // Not a failure of the product — of this test. If losing the context did
    // not blank the canvas, the measurement below proves nothing.
    console.log('\nCANNOT TELL  losing the context did not blank the canvas.')
    process.exit(1)
  }

  await page.evaluate(() => globalThis.__loseContext?.restoreContext())
  await page.waitForTimeout(3000)
  const after = await litFraction(page, stage)
  console.log(`lit after the restore  ${(after * 100).toFixed(1)}%`)

  if (after < before * 0.95) {
    failures += 1
    console.log(
      '\nFAIL  the table did not come back. A restored context arrives at a canvas\n' +
        '      with no render loop behind it, so something has to repaint it —\n' +
        '      see the webglcontextrestored handler in TableScene.',
    )
  } else {
    console.log('\nPASS  the table comes back from a lost context.')
  }

  if (faults.length > 0) {
    failures += 1
    console.log('\npage errors:')
    for (const fault of faults) console.log('  ' + fault)
  }
} finally {
  await browser.close()
  await server.close()
}

process.exit(failures === 0 ? 0 : 1)
