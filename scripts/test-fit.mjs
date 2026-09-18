/*
 * The whole game fits on the phone it is being played on.
 *
 * A web app does not get the screen. iOS Safari keeps a URL bar along the
 * bottom and Chrome on Android keeps a toolbar, and both of them lie about it:
 * `100vh` is the height the page would have if the bar retracted, which it does
 * only after the player scrolls. So the controls at the foot of the table get
 * drawn under the bar, and a tap there goes to the browser rather than to the
 * game. That is what this catches — it was reported from a real phone with the
 * face rack half-eaten by the address bar, and no test in the project could
 * have seen it: jsdom has no layout, and the other browser scripts deliberately
 * use a tall window so that what-covers-what is not confused with what is below
 * the fold.
 *
 * Two questions, because they fail for different reasons and in different
 * places:
 *
 *   1. On the practice table — a real, shipped game screen, and the only one a
 *      script can reach without an account — does the page fit the window at
 *      all, and is every control above the fold.
 *
 *   2. In the preview harness, where every state of the table can be summoned
 *      at will, does the *board* fit the height a real game screen would give
 *      it. The harness's own title and tabs do not ship, so asking whether that
 *      page scrolls would be asking the wrong question.
 *
 *   npm run test:fit
 *   npm run test:fit -- --shot    # write each phone's screen to /tmp
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = Number(process.env.FIT_PORT ?? 5179)
const SHOT = process.argv.includes('--shot')
const OUT = process.env.FIT_OUT ?? '/tmp'

/*
 * The phones, at the height the page actually gets.
 *
 * Not the device's height: the browser's chrome comes off first. On iOS Safari
 * that is the top bar plus the bottom URL bar, and the figures below are the
 * small viewport — what a page is given before any scrolling retracts the bar,
 * which is the only state a player who never scrolls will ever see.
 *
 * The narrow-and-short ones are what matters. An iPhone SE is the tightest
 * screen still in real use, and if the table fits there it fits everywhere.
 */
const PHONES = [
  { name: 'iPhone SE', width: 375, height: 553 },
  { name: 'iPhone 13 mini', width: 375, height: 629 },
  { name: 'Android 360', width: 360, height: 690 },
  { name: 'iPhone 15', width: 393, height: 734 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 814 },
]

/*
 * The states with the most in the dock.
 *
 * "Your turn" is the tall one — hand, face rack, stepper, Bid, Lie and Bull all
 * at once — and a Farewell Round adds a marker to the strip. Watching is in for
 * the opposite reason: it is the state where the dock nearly empties, and a
 * layout that only works when it is full is a layout that jumps.
 */
const SCENARIOS = ['Your turn', 'A bid under Bull', 'Farewell Round', 'Waiting']

const server = await createServer({
  server: { port: PORT, strictPort: true },
  logLevel: 'error',
})
await server.listen()

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

let failures = 0

function report(ok, what, detail) {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what.padEnd(20)} ${detail}`)
}

/*
 * The height a real game screen has to fit the table into.
 *
 * Read off the live stylesheet rather than written down here, so tuning the app
 * shell's gutter cannot quietly move the target this is measured against.
 */
async function budget(page) {
  return page.evaluate(() => {
    const style = window.getComputedStyle(document.querySelector('.app'))
    const gutter = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    return Math.round(window.innerHeight - gutter)
  })
}

/**
 * How the board spent its height, and whether anything fell out of it.
 *
 * The board fills the frame it is given by construction, so "does the board
 * fit" is not a question worth asking of it — it would pass with a table one
 * pixel tall. The two that matter are whether the controls, which never shrink,
 * stayed inside the frame, and whether there is still a table above them.
 */
async function board(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.board')
    if (el === null) return null
    const part = (sel) => {
      const found = document.querySelector(sel)
      return found === null ? 0 : Math.round(found.getBoundingClientRect().height)
    }
    const frame = document.querySelector('.preview__fit').getBoundingClientRect()
    const spilled = ['.challenge__lie', '.challenge__bull', '.builder__submit', '.builder__deck']
      .map((sel) => {
        const found = document.querySelector(sel)
        return found === null
          ? null
          : { sel, under: Math.round(found.getBoundingClientRect().bottom - frame.bottom) }
      })
      .filter((c) => c !== null && c.under > 0)
    return {
      height: Math.round(el.getBoundingClientRect().height),
      stage: part('.board__stage'),
      dock: part('.board__dock'),
      spilled,
    }
  })
}

/*
 * How much of the screen the controls may take.
 *
 * The dock never shrinks — a target that has been squeezed to fit is a target
 * that has stopped working — so its height is a fixed cost, and the stage pays
 * whatever is left. Which means "everything fits" is satisfied by a dock that
 * has grown enormous and a table squeezed to a strip, and the useful question
 * is not whether the page fits but what the controls are costing.
 *
 * Three hundred and ten against the 307 they currently use: enough room for a
 * line of type to grow or a button to gain a few points, not enough for another
 * row. The floor under the table is the second guard, for the case where the
 * dock is honest and the window is simply tiny.
 *
 * It was 300, and the twenty-eight points that broke it were spent on purpose:
 * a line at the head of the dock saying whose turn it is, because the table
 * only ever glowed about it and a player reported being unable to follow turns
 * at all. Raising a cap to fit what you just added is how a cap stops meaning
 * anything, so the arithmetic is written down. The same change took the room's
 * End room button off this screen — seventy-odd points for a control nobody
 * wants to press — so the dock is smaller than it was before both, and the
 * table's share went up at every size rather than down.
 */
const MOST_CONTROLS = 310

/*
 * How little of the screen the table may be left with.
 *
 * Measured against the real document, which is why this is lower than it looks
 * like it should be: during a game the room keeps its own controls below the
 * table — End room, or Leave — and those are a fixed seventy-two points that
 * buy the player nothing while they are playing. On an iPhone SE that is a
 * seventh of the screen, and the table is what pays for it.
 *
 * Thirty-five per cent is a little under what the tightest phone in the list
 * actually gets, so this is a ratchet rather than a target: it holds today's
 * answer and fails if anything else starts taking height from the table.
 */
const LEAST_TABLE = 0.35

/** Whether the page overflows the window, and what ends up furthest down. */
async function overflow(page) {
  return page.evaluate(() => {
    const room = window.innerHeight
    const worst = ['.challenge__lie', '.challenge__bull', '.builder__submit', '.builder__deck']
      .map((sel) => {
        const el = document.querySelector(sel)
        return el === null ? null : { sel, bottom: Math.round(el.getBoundingClientRect().bottom) }
      })
      .filter((c) => c !== null)
      .reduce((acc, c) => (acc === null || c.bottom > acc.bottom ? c : acc), null)
    return {
      room,
      page: Math.round(document.documentElement.scrollHeight),
      worst,
    }
  })
}

/*
 * Nothing from the picture lies across anything you can press.
 *
 * Both tables hang labels off the chairs at their edges, and both sit directly
 * above a row of controls. The labels are placed by the camera in percentages
 * of the stage; the controls are laid out in pixels underneath it. Those two
 * agree only by arithmetic, and the arithmetic changes whenever the stage does
 * — which is how the host's own name came to be drawn across the Start button
 * the day the stage got shorter.
 *
 * Presses were never the problem there: the overlay refuses them, so the button
 * still worked. It simply looked broken, and nothing in the project could see
 * it. `test:reach` asks whether a control takes a press; this asks whether it
 * can be read.
 */
async function collisions(page, stage, controls) {
  return page.evaluate(
    ({ stage, controls }) => {
      const boxes = (sel) => [...document.querySelectorAll(sel)].map((el) => ({
        text: el.textContent.trim().slice(0, 14),
        box: el.getBoundingClientRect(),
      }))
      const over = (a, b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const found = []
      for (const label of boxes(`${stage} > li`)) {
        for (const control of controls.flatMap(boxes)) {
          if (over(label.box, control.box)) {
            found.push(`"${label.text}" lies across "${control.text}"`)
          }
        }
      }
      return found
    },
    { stage, controls },
  )
}

try {
  for (const phone of PHONES) {
    const page = await browser.newPage({ viewport: { width: phone.width, height: phone.height } })
    console.log(`== ${phone.name}  ${phone.width}x${phone.height}`)

    // ---- Every state of the table, against the height a real screen gives it.
    await page.goto(`http://localhost:${PORT}/preview`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Table' }).click()
    const room = await budget(page)

    for (const scenario of SCENARIOS) {
      await page.getByRole('button', { name: scenario }).click()
      await page.waitForTimeout(300)
      const b = await board(page)
      const share = b.stage / room
      const why =
        b.spilled.length > 0
          ? b.spilled.map((c) => `${c.sel} ${c.under}px under the fold`).join(', ')
          : b.dock > MOST_CONTROLS
            ? `the controls want ${b.dock}px, over the ${MOST_CONTROLS} they are allowed`
            : share < LEAST_TABLE
              ? `the table is down to ${Math.round(share * 100)}% of the screen`
              : null
      report(
        why === null,
        scenario,
        `table ${b.stage} / ${room} (${Math.round(share * 100)}%), controls ${b.dock}` +
          (why === null ? '' : `  — ${why}`),
      )
    }

    /*
     * ---- And the dock does not change height when a bid lands.
     *
     * Lie and Bull were not on the screen at all until somebody bid, so the
     * first bid of every round grew the dock by a row and jumped everything
     * above it upward — the hand, the face rack and the Bid button all moved
     * about seventy points, and Bull arrived exactly where a thumb had been
     * heading. Everybody at one table pressed it by accident, on the one move
     * in the game that cannot be taken back.
     */
    // The round's opening, where there is nothing on the table to doubt.
    await page.getByRole('button', { name: 'Opening the round' }).click()
    await page.waitForTimeout(300)
    const before = await page.evaluate(() =>
      Math.round(document.querySelector('.board__dock').getBoundingClientRect().height),
    )
    await page.getByRole('button', { name: 'A bid under Bull' }).click()
    await page.waitForTimeout(300)
    const after = await page.evaluate(() =>
      Math.round(document.querySelector('.board__dock').getBoundingClientRect().height),
    )
    report(
      before === after,
      'dock holds still',
      before === after
        ? `${after}px with a bid and without`
        : `${before}px before a bid, ${after}px after — everything above it jumps`,
    )

    // ---- The lobby, where a badge once landed on the Start button.
    await page.getByRole('tab', { name: 'Lobby' }).click()
    for (const room of ['Just you', 'Full house']) {
      await page.getByRole('button', { name: room }).click()
      await page.waitForTimeout(400)
      const hits = await collisions(page, '.lobby-table__seats', [
        '.lobby__controls .btn',
        '.lobby__leave',
        '.lobby__muted',
      ])
      report(hits.length === 0, `lobby, ${room}`, hits.length === 0 ? 'clear' : hits.join('; '))
    }

    // ---- The practice table: a whole real screen, in a window this size.
    await page.goto(`http://localhost:${PORT}/solo`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.builder__submit')
    await page.waitForTimeout(900)

    for (const state of ['as dealt', 'with a bid up']) {
      if (state === 'with a bid up') {
        // Lie and Bull do not exist until there is a claim to doubt, and they
        // are the tallest thing in the dock — so the state that has to fit is
        // the one after somebody has spoken.
        await page.click('.builder__submit')
        await page.waitForTimeout(900)
      }
      const hits = await collisions(page, '.board__seats', [
        '.challenge__lie',
        '.challenge__bull',
        '.builder__submit',
        '.board__mine',
      ])
      if (hits.length > 0) report(false, `table, ${state}`, hits.join('; '))

      const o = await overflow(page)
      const spill = o.worst === null ? 0 : o.worst.bottom - o.room
      const ok = o.page - o.room <= 1 && spill <= 0
      report(
        ok,
        `practice, ${state}`,
        `page ${o.page} / ${o.room}` +
          (ok
            ? ''
            : `  — ${Math.max(0, o.page - o.room)}px of scroll` +
              (spill > 0 ? `, ${o.worst.sel} ${spill}px under the fold` : '')),
      )
    }

    if (SHOT) {
      const file = `${OUT}/fit-${phone.width}x${phone.height}.png`
      writeFileSync(file, await page.screenshot())
      console.log(`        wrote ${file}`)
    }

    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} do not fit the screen.`)
  process.exit(1)
}
console.log('\nPASS  the whole table fits, on every phone, without scrolling.')
