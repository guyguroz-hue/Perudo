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

/*
 * The sizes a phone is actually held at.
 *
 * The height matters as much as the width, and for a while this script only
 * varied one of them. A tall window is right for asking what covers what — it
 * keeps "something is lying across this control" from being confused with
 * "this control is below the fold", which is a different fault with a different
 * fix. But it is also the one window in which a layout that only breaks when
 * the screen is short can never break, and the table is laid out against the
 * height it is given: shrink it and every control moves.
 *
 * So both. The tall window asks the covering question cleanly, and the real
 * phone heights ask it again in the layout a player actually gets.
 */
const TALL = [
  { width: 360, height: 1600 },
  { width: 390, height: 1600 },
  { width: 430, height: 1600 },
]

/*
 * And the sizes a phone is actually held at.
 *
 * Only the real screens get these. The preview harness is a scrolling page with
 * a title, a row of tabs and a row of scenario buttons above the table, and in
 * a 553-point window that pushes the whole dock past the fold — which this
 * script would report as twenty controls nobody can press, every run, for a
 * page no player ever opens. The practice table and the tutorial have no such
 * chrome: they are laid out against the height they are given, exactly as the
 * real game is, so a control that cannot be reached in one of those windows is
 * a control a player cannot reach.
 */
const PHONES = [
  { width: 375, height: 553 },
  { width: 393, height: 734 },
]

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

let failures = 0

/** Enough clicks to walk the lesson; it is twelve cards long. */
const LESSON_STEPS = 20

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

for (const { width, height } of TALL) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  console.log(`== preview ${width}x${height}`)

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

  await page.close()
}

/*
 * The two tables with no room behind them.
 *
 * Their controls sit over the same scene the real game does, in the same app
 * shell, with no harness around them — so they are the closest a script can get
 * to the screen a player is holding, and the only ones where a short window
 * asks an honest question.
 */
for (const { width, height } of [...TALL, ...PHONES]) {
  const page = await browser.newPage({ viewport: { width, height } })
  console.log(`== real screens ${width}x${height}`)

  await page.goto(URL.replace('/preview', '/solo'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await check(page, 'practice / bid', '.builder__submit')
  // Lie and Bull do not exist until there is a claim to doubt, so one is made.
  await page.click('.builder__submit')
  await page.waitForTimeout(900)
  await check(page, 'practice / lie', '.challenge__lie')
  await check(page, 'practice / bull', '.challenge__bull')

  await page.goto(URL.replace('/preview', '/learn'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await check(page, 'tutorial / next', '.coach__next')

  /*
   * And the control the lesson is pointing at.
   *
   * The coach card is a fixed panel over the table, and on the steps that ask
   * the player to press something it moves to the top of the screen so that
   * something is clear — which is a promise, and this is the check that it is
   * kept. Only on those steps: on a reading step the card sits at the bottom
   * and does lie across the dock on a short phone, which is a real defect but a
   * different one, and asserting it here would only mean this file stops being
   * run.
   */
  for (let i = 0; i < LESSON_STEPS && (await page.$('.coach--bid')) === null; i += 1) {
    const next = await page.$('.coach__next')
    if (next === null) break
    await next.click()
    await page.waitForTimeout(500)
  }
  if ((await page.$('.coach--bid')) !== null) {
    await check(page, 'tutorial / bid, with the coach pointing at it', '.builder__submit')
  } else {
    failures += 1
    console.log('  FAIL  tutorial / never reached the step that points at Bid')
  }

  await page.close()
}

await browser.close()

if (failures > 0) {
  console.log(`\n${failures} control${failures === 1 ? '' : 's'} cannot be pressed.`)
  process.exit(1)
}
console.log('\nPASS  every control is reachable at every width.')
