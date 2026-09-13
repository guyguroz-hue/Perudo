/*
 * Every control the game offers can actually be pressed.
 *
 * This exists because a control that is on screen, enabled, correctly wired and
 * covered by an invisible box is a control that does nothing — and every test
 * this project has is blind to it. The unit tests run in jsdom, which has no
 * layout: it will happily report a button as visible and enabled while a
 * neighbouring element lies across it.
 *
 * That is not hypothetical. Both the table and the lobby deliberately pull
 * their controls up into the band of empty floor at the foot of the scene, so
 * the stage's box reaches down over them — and positioned content paints above
 * static content. For one release the host could not start a game: the tap
 * landed on the stage, nothing happened, and nothing on screen suggested why.
 *
 * So this asks the only question that matters, in a real browser with real
 * layout: if a person puts their finger in the middle of this button, does the
 * button get it?
 *
 * Run with the preview build being served — `npm run test:reach`.
 */
import { chromium } from 'playwright'

const URL = process.env.PREVIEW_URL ?? 'http://localhost:4188/preview'
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/** The widths a phone is actually held at. */
const WIDTHS = [360, 390, 430]

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

let failures = 0

/** Does a press in the middle of this element reach it? */
async function reachable(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return 'missing'
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return 'no size'
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    if (hit === null) return 'off screen'
    if (el === hit || el.contains(hit)) return true
    // Name the thing in the way; "it does not work" is not a bug report.
    return `covered by ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`
  }, selector)
}

async function check(page, what, selector) {
  const answer = await reachable(page, selector)
  if (answer === true) return
  failures += 1
  console.log(`  FAIL  ${what} — ${answer}`)
}

for (const width of WIDTHS) {
  // Tall on purpose: this is about what covers what, not about what is below
  // the fold, and a short window would hide half the controls behind a scroll.
  const page = await browser.newPage({ viewport: { width, height: 1600 } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  console.log(`== ${width}px`)

  // The lobby, at every size of table. Six seats is the tightest.
  await page.getByRole('tab', { name: 'Lobby' }).click()
  for (const scenario of ['Just you', 'Enough to start', 'Four, one chair apart', 'Full house']) {
    await page.getByRole('button', { name: scenario }).click()
    await page.waitForTimeout(400)
    await check(page, `lobby / ${scenario} / start`, '.lobby__controls .btn')
    await check(page, `lobby / ${scenario} / leave`, '.lobby__leave')
    await check(page, `lobby / ${scenario} / room code`, '.code__value')
    await check(page, `lobby / ${scenario} / invite`, '.code__share')
    await check(page, `lobby / ${scenario} / sound`, '.lobby__invite .sound')
  }
  // The host's one control inside the table itself, which the rest of that
  // table deliberately refuses presses for.
  await check(page, 'lobby / host menu', '.badge__menu')

  // The table.
  await page.getByRole('tab', { name: 'Table' }).click()
  for (const scenario of ['Your turn', 'Waiting', 'A bid under Bull', 'Farewell Round']) {
    await page.getByRole('button', { name: scenario }).click()
    await page.waitForTimeout(400)
    await check(page, `table / ${scenario} / lie`, '.challenge__lie')
    await check(page, `table / ${scenario} / bull`, '.challenge__bull')
    await check(page, `table / ${scenario} / bid`, '.builder__submit')
    await check(page, `table / ${scenario} / sound`, '.board__sound button')
  }

  /*
   * The two tables with no room behind them. Their controls sit over the same
   * scene the real game does, pulled up into the same band of floor, so they
   * are subject to exactly the fault this script exists to catch.
   */
  await page.goto(URL.replace('/preview', '/solo'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await check(page, 'practice / bid', '.builder__submit')
  // Lie and Bull do not exist until there is a claim to doubt, so one is made.
  await page.click('.builder__submit')
  await page.waitForTimeout(500)
  await check(page, 'practice / lie', '.challenge__lie')
  await check(page, 'practice / bull', '.challenge__bull')

  await page.goto(URL.replace('/preview', '/learn'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await check(page, 'tutorial / next', '.coach__next')
  await check(page, 'tutorial / bid', '.builder__submit')

  await page.close()
}

await browser.close()

if (failures > 0) {
  console.log(`\n${failures} control${failures === 1 ? '' : 's'} cannot be pressed.`)
  process.exit(1)
}
console.log('\nPASS  every control is reachable at every width.')
