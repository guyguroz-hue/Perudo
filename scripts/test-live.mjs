/*
 * Three phones, one room, the screen people actually play on.
 *
 * Everything else this project can run tests the game somewhere it is not
 * played. jsdom has no layout and no second player. `/preview` renders fixtures
 * and `/solo` plays bots in one tab — neither has a room around it, and the
 * real screen is `.app > .lobby > .game > .board`, three components deep
 * inside a lobby that is still mounted. That difference has already shipped a
 * bug that every other check passed: a CSS rule written against `.app > .game`
 * matched in both harnesses and matched nothing in the real game.
 *
 * So this drives the real thing. Real `RoomScreen`, real `LobbyView`, real
 * `GameScreen`, real `useGame`, real `api.ts` and `read.ts`, real refusals from
 * the real action layer — in three separate browser contexts sitting at one
 * table, taking turns, bursting at each other and resolving rounds.
 *
 * What is NOT real: the transport and Postgres. `scripts/harness/` puts an
 * in-memory table behind the client and runs `supabase/functions/game/` against
 * it. The SQL itself is tested where it lives, against a real Postgres, by
 * `npm run test:db`; the live project is tested by playing on it. This covers
 * the half neither of those can see — the browser's.
 *
 *   npm run test:live
 */
import { chromium } from 'playwright'
import { startHarness } from './harness/server.mjs'

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = Number(process.env.HARNESS_PORT ?? 5199)
const PHONE = { width: 393, height: 734 }

let failures = 0
const fail = (what, detail) => {
  failures += 1
  console.log(`  FAIL  ${what}${detail === undefined ? '' : ` — ${detail}`}`)
}
const pass = (what) => console.log(`  PASS  ${what}`)
const check = (ok, what, detail) => (ok ? pass(what) : fail(what, detail))

const harness = await startHarness({ port: PORT })
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

const db = harness.db
const NAMES = ['Ada', 'Bo', 'Cy']

/** Anything the page itself complained about, gathered for the whole run. */
const noise = []

async function openPlayer(name) {
  const context = await browser.newContext({ viewport: PHONE })
  const page = await context.newPage()
  page.on('pageerror', (error) => noise.push(`${name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // WebGL under SwiftShader complains about things a phone does not.
    if (/WebGL|SwiftShader|GroupMarker/i.test(text)) return
    noise.push(`${name}: ${text}`)
  })
  await page.goto(harness.url + '/', { waitUntil: 'domcontentloaded' })
  await page.fill('#display-name', name)
  await page.click('button:has-text("Take a seat")')
  await page.waitForSelector('.home__title', { timeout: 15_000 })
  return { name, page, context }
}

console.log('== three players, one table')
const players = []
for (const name of NAMES) players.push(await openPlayer(name))
const [host, ...guests] = players

await host.page.click('button:has-text("Create room")')
await host.page.waitForSelector('.lobby', { timeout: 15_000 })
const code = db.tables.rooms[0].code

for (const guest of guests) {
  await guest.page.fill('input[aria-label="Room code"]', code)
  await guest.page.click('button:has-text("Join")')
  await guest.page.waitForSelector('.lobby', { timeout: 15_000 })
}

await host.page.waitForFunction(
  () => document.querySelectorAll('.lobby .seat, .lobby [class*="seat"]').length > 0,
  null,
  { timeout: 10_000 },
).catch(() => {})
await host.page.waitForFunction(
  (want) => (document.body.textContent ?? '').includes(want),
  NAMES[2],
  { timeout: 15_000 },
)
check(db.tables.room_members.filter((m) => m.left_at === null).length === 3, 'three seats taken')

await host.page.click('button:has-text("Start game")')
for (const { page } of players) {
  await page.waitForSelector('.board', { timeout: 25_000 })
}
pass('every client reached the table')

// -----------------------------------------------------------------------------
// The shape of the real screen
// -----------------------------------------------------------------------------

for (const { name, page } of players) {
  const nesting = await page.evaluate(() => {
    const board = document.querySelector('.app .lobby .game .board')
    return board !== null
  })
  check(nesting, `${name}: the table is inside the lobby, as it ships`)

  const scroll = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return { over: el.scrollHeight - el.clientHeight, height: el.clientHeight }
  })
  check(scroll.over <= 1, `${name}: nothing scrolls`, `${scroll.over}px past the fold`)
}

// -----------------------------------------------------------------------------
// The two faults reported from a real table
// -----------------------------------------------------------------------------

const liveRound = () => db.tables.rounds.find((r) => r.status !== 'resolved') ?? null
const playerOf = (id) => players.find((p) => idOf(p) === id)
const ids = new Map()
for (const player of players) {
  const profile = db.tables.profiles.find((row) => row.display_name === player.name)
  ids.set(player, profile.id)
}
const idOf = (player) => ids.get(player)

const turnHolder = () => playerOf(liveRound().turn_player_id)
const someoneElse = () => players.find((p) => p !== turnHolder())

/**
 * Every screen has caught up with the round the table is on.
 *
 * Realtime is a notification, so a client can still be drawing the round before
 * this one — which is fine in a game and not fine in a script that is about to
 * press a button on behalf of somebody. Without it the press lands on the
 * previous round's controls and the refusal it earns looks like a bug in the
 * thing being tested.
 */
async function settle() {
  const number = liveRound().round_number
  await Promise.all(
    players.map(({ page }) =>
      page.waitForFunction(
        (want) => document.querySelector('.board__round')?.textContent === `Round ${want}`,
        number,
        { timeout: 25_000 },
      ),
    ),
  )
}

/** The dock's height, which must not change when a bid lands. */
const dockHeight = (page) =>
  page.evaluate(() => document.querySelector('.board__dock')?.getBoundingClientRect().height ?? 0)

const watcher = someoneElse()
const before = await dockHeight(watcher.page)

/*
 * Watch the Lie button through the moment a bid arrives.
 *
 * Both halves of the accidental-Bull fix are here: the dock must not grow when
 * the tiles come alive (which is what moved Bull under a thumb aiming at Bid),
 * and the tiles must not answer to a press for a beat afterwards (which is what
 * caught the thumb already travelling).
 */
const armWatch = watcher.page.evaluate(() => {
  const lie = document.querySelector('.challenge__lie')
  const count = () => document.querySelector('.challenge__lie .challenge__count')?.textContent
  const wasBlank = count() === '–'
  return new Promise((resolve) => {
    const started = performance.now()
    let arrived = null
    const timer = setInterval(() => {
      if (arrived === null && wasBlank && count() !== '–') arrived = performance.now()
      if (arrived !== null && !lie.hasAttribute('disabled')) {
        clearInterval(timer)
        resolve({ armedAfter: performance.now() - arrived, sawArrival: true })
      }
      if (performance.now() - started > 8000) {
        clearInterval(timer)
        resolve({ armedAfter: null, sawArrival: arrived !== null })
      }
    }, 20)
  })
})

const opener = turnHolder()

/*
 * Two presses in one frame, which is what a double tap is.
 *
 * Playwright's own click waits for the button to be actionable, so it can never
 * produce this: the second press has to be dispatched before React has
 * re-rendered. Both got through once, and the second was refused on the version
 * check — so the player was told somebody else had got there first, about their
 * own second tap, at a table where nobody had moved.
 */
await opener.page.evaluate(() => {
  const submit = document.querySelector('.builder__submit')
  submit.click()
  submit.click()
})

await opener.page.waitForFunction(
  () => document.querySelectorAll('.log li, .moves li, [class*="move"]').length >= 0,
  null,
  { timeout: 5000 },
).catch(() => {})
await new Promise((r) => setTimeout(r, 1500))

const bidsLogged = db.tables.game_events.filter((e) => e.kind.endsWith('bid')).length
check(bidsLogged === 1, 'a double tap places one bid, not two', `${bidsLogged} bids logged`)

const complaint = await opener.page.evaluate(
  () => document.querySelector('.game__error')?.textContent ?? null,
)
check(complaint === null, 'and nobody is told they were beaten by themselves', complaint)

const after = await dockHeight(watcher.page)
check(
  Math.abs(after - before) < 1,
  'the dock does not move when the first bid lands',
  `${before.toFixed(1)}px then ${after.toFixed(1)}px`,
)

const armed = await armWatch
check(
  armed.sawArrival && armed.armedAfter !== null && armed.armedAfter >= 200,
  'Lie and Bull stay spent for a beat after a bid arrives',
  armed.armedAfter === null ? 'never armed' : `armed after ${Math.round(armed.armedAfter)}ms`,
)

// -----------------------------------------------------------------------------
// Bull, pressed on the real table
// -----------------------------------------------------------------------------
// The button that did not work for four days, and could not have been caught
// here: the fault was a missing function in the live database, not in any of
// this. What this does cover is everything around it — that the press is
// accepted, that the claim on the table changes reading, that a second Bull is
// spent rather than refused, and that a later bid brings it back (§8.2).

{
  const caller = someoneElse()
  await caller.page.waitForSelector('.challenge__bull:not([disabled])', { timeout: 20_000 })
  await caller.page.click('.challenge__bull')

  for (const { name, page } of players) {
    const bulled = await page
      .waitForFunction(
        () => {
          const bull = document.querySelector('.challenge__bull')
          return (
            bull !== null &&
            bull.hasAttribute('disabled') &&
            /already been called/i.test(bull.getAttribute('aria-label') ?? '')
          )
        },
        null,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false)
    check(bulled, `${name}: sees the bid has been Bulled`)
  }

  const refusal = await caller.page.evaluate(
    () => document.querySelector('.game__error')?.textContent ?? null,
  )
  check(refusal === null, 'and pressing Bull is not an error', refusal)

  const reading = await caller.page.evaluate(
    () => document.querySelector('.challenge__lie .challenge__reading')?.textContent,
  )
  check(reading === 'exactly', 'Lie now doubts the Bulled reading of the claim', reading)
}

// -----------------------------------------------------------------------------
// A round played out, and everybody watching it
// -----------------------------------------------------------------------------

async function raise(player) {
  await player.page.waitForSelector('.builder__submit:not([disabled])', { timeout: 15_000 })
  await player.page.click('.builder__submit')
  await new Promise((r) => setTimeout(r, 400))
}

const roundBefore = liveRound().id
await raise(turnHolder())

// A new bid supersedes the Bull entirely (GAME_RULES §8.2), so the tile comes
// back to life rather than staying spent for the rest of the round.
for (const { name, page } of players) {
  const freedBull = await page
    .waitForSelector('.challenge__bull:not([disabled])', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  check(freedBull, `${name}: a new bid clears the Bull hanging off the old one`)
}

await raise(turnHolder())

const doubter = turnHolder()
await doubter.page.waitForFunction(
  () => {
    const lie = document.querySelector('.challenge__lie')
    return lie !== null && !lie.hasAttribute('disabled')
  },
  null,
  { timeout: 15_000 },
)
await doubter.page.click('.challenge__lie')

for (const { name, page } of players) {
  const sawReveal = await page
    .waitForSelector('.verdict', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  check(sawReveal, `${name}: sees the cups come off`)
}

await Promise.all(
  players.map(({ page }) =>
    page.waitForFunction(() => document.querySelector('.verdict__result') !== null, null, {
      timeout: 25_000,
    }),
  ),
)
pass('the verdict lands on every screen')

check(liveRound().id !== roundBefore, 'the round moved on')

// Everybody back to a playable table, without anybody pressing anything.
for (const { name, page } of players) {
  const back = await page
    .waitForFunction(() => document.querySelector('.board__dock .challenge') !== null, null, {
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false)
  check(back, `${name}: the next round arrives on its own`)
}

// -----------------------------------------------------------------------------
// R-013: the opening bid of a Farewell Round is not up for grabs
// -----------------------------------------------------------------------------
// Reached by hand rather than by playing to it: a Farewell Round needs somebody
// down to their last die, which is a dozen rounds away and not what is being
// asked about here. The state is the real one — the same row the server would
// have written — and everything above it is the real client.

const owed = players[1]
{
  const round = liveRound()
  round.type = 'farewell'
  round.locked_face = null
  round.bid_quantity = null
  round.bid_face = null
  round.bid_player_id = null
  round.bull_player_id = null
  round.turn_player_id = idOf(owed)
  round.version += 1
  db.touch('rounds', round)
}

const cutter = players.find((p) => p !== owed)
const barred = await cutter.page
  .waitForFunction(
    () => {
      const submit = document.querySelector('.builder__submit')
      return (
        submit !== null &&
        /cannot cut in/i.test(submit.getAttribute('aria-label') ?? '') &&
        submit.hasAttribute('disabled')
      )
    },
    null,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false)
check(barred, 'a Farewell Round cannot be burst into before it is opened')

const told = await cutter.page.evaluate(() =>
  /opens with their bid/i.test(document.body.textContent ?? ''),
)
check(told, 'and the player is told whose bid it is')

await raise(owed)
const locked = liveRound().locked_face
check(locked !== null, 'the player it is owed to can open it', `locked_face=${locked}`)

const freed = await cutter.page
  .waitForFunction(
    () => {
      const submit = document.querySelector('.builder__submit')
      return (
        submit !== null &&
        submit.getAttribute('aria-label') === 'Burst bid' &&
        !submit.hasAttribute('disabled')
      )
    },
    null,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false)
check(
  freed,
  'and cutting in is offered again the moment the face is set',
  freed
    ? undefined
    : JSON.stringify(
        await cutter.page.evaluate(() =>
          [...document.querySelectorAll('.board__dock button')].map((b) => ({
            text: b.textContent?.trim().slice(0, 30),
            label: b.getAttribute('aria-label'),
            off: b.hasAttribute('disabled'),
          })),
        ),
      ),
)

// -----------------------------------------------------------------------------
// The last die, which is the part nobody ever reaches in testing
// -----------------------------------------------------------------------------
// An evening of Perudo ends exactly once, and until now nothing had ever seen
// it happen on this screen: every check stopped somewhere in the middle of a
// game. What a table full of friends will certainly do is play one to the end.
//
// Set up rather than played to, for the same reason as the Farewell Round
// above — two players on their last die each, the third already out — and then
// played out through the real controls.

{
  const gameId = db.tables.games[0].id
  const out = players[2]
  for (const player of db.tables.game_players) {
    player.dice_count = player.user_id === idOf(out) ? 0 : 1
    if (player.dice_count === 0) player.eliminated_at = new Date().toISOString()
    db.touch('game_players', player)
  }

  const stale = liveRound()
  db.tables.rounds.splice(db.tables.rounds.indexOf(stale), 1)
  for (let i = db.tables.player_dice.length - 1; i >= 0; i -= 1) {
    if (db.tables.player_dice[i].round_id === stale.id) db.tables.player_dice.splice(i, 1)
  }
  await harness.store.openRound(gameId, 'normal', idOf(players[0]))
}

await settle()
await raise(turnHolder())

// The bid has moved the turn on, so the holder now is the one who did not make
// it — challenging your own claim is refused, and rightly.
const last = turnHolder()
await last.page.waitForSelector('.challenge__lie:not([disabled])', { timeout: 20_000 })
await last.page.click('.challenge__lie')

for (const { name, page } of players) {
  const finished = await page
    .waitForSelector('.finish', { timeout: 40_000 })
    .then(() => true)
    .catch(() => false)
  check(finished, `${name}: the game ends on the table it was played on`)
}

const winnerId = db.tables.games[0].winner_id
check(db.tables.games[0].status === 'completed', 'the game is recorded as completed')
check(db.tables.rooms[0].status === 'finished', 'and the room follows it out of the game')

for (const player of players) {
  const said = await player.page.evaluate(() => document.querySelector('.finish__who')?.textContent)
  const youWon = idOf(player) === winnerId
  check(
    youWon ? said === 'You won' : said?.endsWith('won') === true && said !== 'You won',
    `${player.name}: is told the right thing about who won`,
    said,
  )
}

await host.page.waitForSelector('button:has-text("Play again")', { timeout: 20_000 })
await host.page.click('button:has-text("Play again")')
for (const { name, page } of players) {
  const back = await page
    .waitForFunction(() => document.querySelector('.lobby__head') !== null, null, {
      timeout: 20_000,
    })
    .then(() => true)
    .catch(() => false)
  check(back, `${name}: is back in the lobby for another game`)
}

// -----------------------------------------------------------------------------

for (const { name, page } of players) {
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return el.scrollHeight - el.clientHeight
  })
  check(over <= 1, `${name}: still nothing scrolls, several rounds in`, `${over}px`)
}

check(noise.length === 0, 'no page reported an error', noise.slice(0, 4).join(' | '))

await browser.close()
await harness.close()

console.log(failures === 0 ? '\n================ LIVE GAME PASSED ================' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
