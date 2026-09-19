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
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    /*
     * A microphone that is always there and always says something.
     *
     * Chromium's fake capture device plays a tone, which is exactly what a
     * voice test needs: it goes in one browser's microphone and has to come
     * out of another's speaker, through a real RTCPeerConnection, before
     * anything on screen can say so.
     */
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
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
    /*
     * A refusal is a 4xx, and the browser logs every one of them.
     *
     * Not noise from a fault: the server says no by status code, which is what
     * "that claim is yours" and "somebody got there first" both are, and both
     * happen in ordinary play. What a real fault looks like is a pageerror,
     * which is listened for above and never filtered.
     */
    if (/Failed to load resource/i.test(text)) return
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

/** Whoever is sitting behind a display name, for checks that read the table. */
const idOfName = (name) =>
  db.tables.profiles.find((row) => row.display_name === name)?.id ?? null


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
// A fourth friend, who turned up a minute late
// -----------------------------------------------------------------------------
// The door that used to be shut. Tapping the link after the host pressed Start
// produced "that game is already under way" and a Back button — to somebody who
// had been invited and was standing there.

const latecomer = await openPlayer('Dee')
await latecomer.page.fill('input[aria-label="Room code"]', code)
await latecomer.page.click('button:has-text("Join")')

const offered = await latecomer.page
  .waitForSelector('.choice', { timeout: 15_000 })
  .then(() => true)
  .catch(() => false)
check(offered, 'a game already under way offers a way in rather than a wall')

await latecomer.page.click('button:has-text("Ask for a seat")')
await latecomer.page.waitForSelector('.board', { timeout: 25_000 })
pass('and watching starts at the table itself')

const watching = await latecomer.page.evaluate(() => ({
  dock: document.querySelector('.board__dock')?.textContent ?? '',
  canBid: document.querySelector('.builder__submit') !== null,
  canDoubt: document.querySelector('.challenge__lie') !== null,
}))
check(/Watching/i.test(watching.dock), 'a spectator is told they are watching', watching.dock)
check(
  !watching.canBid && !watching.canDoubt,
  'and is offered no move to make',
  JSON.stringify(watching),
)

/*
 * Nobody asks for a hand that is not theirs.
 *
 * The other half of that question — whether the database would REFUSE such a
 * read — is not this harness's to answer and it does not pretend to: RLS is
 * proved against a real Postgres by `npm run test:db`, where a spectator
 * selects `player_dice` and gets nothing. What is checked here is the thing a
 * policy cannot check for you, which is what the client actually sends. A
 * browser that asks for the whole table and leans on a policy to trim it is one
 * policy change away from dealing everybody else's hand on to the screen.
 */
{
  const hands = harness.asked.filter((query) => query.table === 'player_dice')
  const overreaching = hands.filter(
    (query) =>
      !query.filters.some(
        (filter) => filter.op === 'eq' && filter.col === 'player_id' && filter.val === query.actor,
      ),
  )
  check(hands.length > 0, 'somebody did ask for their own dice, so this proves something')
  check(
    overreaching.length === 0,
    'and no client ever asks for a hand that is not its own',
    `${overreaching.length} of ${hands.length} reads were unscoped`,
  )
}

/*
 * And the host is not interrupted by it.
 *
 * The first version put a card over the middle of the host's screen and left it
 * there until it was answered — three bids into a round, while they were
 * working out whether the six on the table was a lie. "Make sure the request
 * does not ruin the host's round" was the note. So during a game nothing opens
 * by itself: a chip appears in the corner the room already owns, and the host
 * goes and looks at it when the round is over.
 */
{
  const chip = await host.page
    .waitForSelector('.askchip', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  check(chip, 'the host is told, in the corner, wherever they are')

  const uninterrupted = await host.page.evaluate(() => ({
    card: document.querySelector('.ask') !== null,
    canBid: document.querySelector('.builder__submit') !== null,
  }))
  check(!uninterrupted.card, 'and nothing opens over the table by itself')
  check(uninterrupted.canBid, 'and the controls are still theirs to use')

  await host.page.click('.askchip')
  const opened = await host.page
    .waitForSelector('.ask', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  check(opened, 'the chip opens the question when they are ready')

  if (opened) {
    // Put away without answering, which is the whole point of Later: the
    // question keeps, the round does not.
    await host.page.click('button:has-text("Later")')
    const away = await host.page.evaluate(() => document.querySelector('.ask') === null)
    const kept = await host.page.evaluate(() => document.querySelector('.askchip') !== null)
    check(away && kept, 'and Later puts it away without losing it')

    await host.page.click('.askchip')
    await host.page.waitForSelector('.ask', { timeout: 10_000 })
    await host.page.click('button:has-text("Deal them in")')
    const answered = await host.page
      .waitForFunction(() => document.querySelector('.ask') === null, null, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    check(answered, 'and answering puts the question away')
  }
}

check(
  db.tables.room_members.filter((m) => m.left_at === null && m.role === 'player').length === 4,
  'an approved spectator holds a seat',
)
check(
  db.tables.game_players.filter((p) => p.user_id === idOfName('Dee')).length === 0,
  'and is not dealt into the round already being played',
)

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
// Two of them talking
// -----------------------------------------------------------------------------
// Perudo is played out loud, so the table runs a voice call between its
// players. What is proved here is the whole chain and not a mock of it: a tone
// goes into one browser's microphone, crosses a real RTCPeerConnection, comes
// out of another browser's speaker, and is loud enough there that the screen
// says who is talking.
//
// Chromium's fake capture device is what makes that testable. What it cannot
// test is Safari on a phone, which is where this will actually be used.

{
  const [ada, bo] = players
  for (const player of [ada, bo]) {
    await player.page.click('.mic')
    const joined = await player.page
      .waitForSelector('.mic--live', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check(joined, `${player.name} can join the call`)
  }

  const paired = await ada.page
    .waitForFunction(() => document.querySelector('.mic__count')?.textContent === '1', null, {
      timeout: 20_000,
    })
    .then(() => true)
    .catch(() => false)
  check(paired, 'and each of them finds the other in it')

  // The claim that matters: a voice crossed the connection and arrived loud.
  const heard = await ada.page
    .waitForFunction(() => document.querySelectorAll('.badge--talking').length > 0, null, {
      timeout: 25_000,
    })
    .then(() => true)
    .catch(() => false)
  check(heard, 'and a voice actually crosses between them')

  const muted = await bo.page.evaluate(async () => {
    document.querySelector('.mic').click()
    await new Promise((r) => setTimeout(r, 400))
    return document.querySelector('.mic--muted') !== null
  })
  check(muted, 'muting is one tap, and does not leave the call')

  const stillIn = await bo.page.evaluate(
    () => document.querySelector('.mic--live') !== null,
  )
  check(stillIn, 'and they are still in it while muted')

  // Everybody not in the call is unaffected, which is the point of it being
  // optional: Cy never pressed anything.
  const cyAlone = await players[2].page.evaluate(() => ({
    live: document.querySelector('.mic--live') !== null,
    canBid: document.querySelector('.builder__submit') !== null,
  }))
  check(!cyAlone.live && cyAlone.canBid, 'and somebody who never joined plays on regardless')
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
  const count = () => document.querySelector('.challenge__lie .challenge__count')?.textContent
  const lie = () => document.querySelector('.challenge__lie')
  const row = document.querySelector('.challenge')

  return new Promise((resolve) => {
    if (count() !== '–') {
      resolve({ sawArrival: false, inertOnArrival: null, armedLater: null })
      return
    }

    /*
     * Read at the instant the claim lands, not a poll later.
     *
     * Timing this from the outside does not work here and the attempt is worth
     * recording: a bid arriving rebuilds the 3D scene, which blocks the main
     * thread for a few hundred milliseconds, so a poll can first SEE the claim
     * after the tile has already armed and report that nothing protected
     * anybody. An observer callback runs as a microtask on the commit that
     * changed the DOM, so what it reads is what was on screen at that moment,
     * however long the frame took.
     */
    let inertOnArrival = null
    const observer = new MutationObserver(() => {
      if (inertOnArrival === null && count() !== '–') {
        inertOnArrival = lie().hasAttribute('disabled')
      }
    })
    observer.observe(row, { childList: true, subtree: true, characterData: true, attributes: true })

    const started = performance.now()
    const timer = setInterval(() => {
      if (inertOnArrival !== null && !lie().hasAttribute('disabled')) {
        clearInterval(timer)
        observer.disconnect()
        resolve({ sawArrival: true, inertOnArrival, armedLater: true })
      }
      if (performance.now() - started > 8000) {
        clearInterval(timer)
        observer.disconnect()
        resolve({ sawArrival: inertOnArrival !== null, inertOnArrival, armedLater: false })
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
  () => document.querySelector('.note--refused')?.textContent ?? null,
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
  armed.sawArrival && armed.inertOnArrival === true,
  'Lie and Bull are spent at the instant a bid arrives',
  armed.sawArrival ? 'live the moment the claim landed' : 'never saw the claim land',
)
check(armed.armedLater === true, 'and come alive a beat later, rather than staying spent')

// -----------------------------------------------------------------------------
// The die under your thumb does not move by itself
// -----------------------------------------------------------------------------
// Reported from a real table: "last turn I bid threes, the bid went up, the
// highlighted die became a four, and I bid fours without meaning to." The
// builder used to reset to the smallest raise, which prefers moving the face.

{
  const watching = someoneElse()
  const chosen = await watching.page.evaluate(() => {
    const pick = [...document.querySelectorAll('.builder__face')].find(
      (b) => !b.hasAttribute('disabled') && b.getAttribute('aria-label') !== 'Joker',
    )
    pick.click()
    return pick.getAttribute('aria-label')
  })

  await raise(turnHolder())

  const still = await watching.page.evaluate(
    () =>
      document
        .querySelector('.builder__face[aria-pressed="true"]')
        ?.getAttribute('aria-label') ?? null,
  )
  check(still === chosen, 'the face a player picked survives somebody else bidding', `${chosen} became ${still}`)
}

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
    () => document.querySelector('.note--refused')?.textContent ?? null,
  )
  check(refusal === null, 'and pressing Bull is not an error', refusal)

  const reading = await caller.page.evaluate(
    () => document.querySelector('.challenge__lie .challenge__reading')?.textContent,
  )
  check(reading === 'exactly', 'Lie now doubts the Bulled reading of the claim', reading)

  /*
   * A Bull out of turn is a Burst, so the line above the dock gives itself over
   * to saying who — and the dock must not move an inch while it does. A pill
   * two points taller than the line it replaces would shift every control under
   * it every time somebody cut in, which is the fault that put Bull under a
   * thumb aiming at Bid arriving again by the back door.
   */
  const watcher2 = players.find((p) => p !== caller)
  const cut = await watcher2.page.evaluate(() => {
    const line = document.querySelector('.turn')
    const dock = document.querySelector('.board__dock')
    return {
      saying: line?.className.includes('turn--cutting') === true,
      text: line?.textContent ?? '',
      dock: Math.round((dock?.getBoundingClientRect().height ?? 0) * 10) / 10,
      marked: document.querySelectorAll('.badge--cut').length,
    }
  })
  check(cut.saying, 'the line above the dock says who cut in', cut.text)
  check(cut.marked === 1, 'and their seat is marked, so you can find them', `${cut.marked} marked`)
  check(
    Math.abs(cut.dock - after) < 1,
    'and the dock does not move to say it',
    `${after}px then ${cut.dock}px`,
  )

  /*
   * And a notice that takes itself off the screen.
   *
   * "You cannot get it off the screen and it does not move until you bid
   * again" — said about a refusal, on a table where what it had just said was
   * that the bid did not take.
   *
   * Provoked with the one refusal that cannot disturb the game: the claim on
   * the table now belongs to the player who just Bulled it, and a player may
   * not doubt their own claim.
   */
  await caller.page.evaluate(() => document.querySelector('.challenge__lie').click())
  const shown = await caller.page
    .waitForSelector('.note', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  check(shown, 'a refusal is said on screen')

  const gone = await caller.page
    .waitForFunction(() => document.querySelector('.note') === null, null, {
      timeout: 12_000,
    })
    .then(() => true)
    .catch(() => false)
  check(gone, 'and takes itself off again without anybody bidding')
}

// -----------------------------------------------------------------------------
// A round played out, and everybody watching it
// -----------------------------------------------------------------------------

/**
 * Make a bid, and do not go on until the table has it.
 *
 * Waiting a fixed moment after the click was enough until it was not: a press
 * that the server refuses looks exactly like a press that worked, and the check
 * that failed afterwards was several steps away and blamed the wrong thing.
 */
async function raise(player) {
  const before = db.tables.game_events.length
  await player.page.waitForSelector('.builder__submit:not([disabled])', { timeout: 15_000 })
  await player.page.click('.builder__submit')

  const deadline = Date.now() + 10_000
  while (db.tables.game_events.length === before) {
    if (Date.now() > deadline) {
      const why = await player.page.evaluate(
        () => document.querySelector('.note')?.textContent ?? 'no answer at all',
      )
      throw new Error(`${player.name}'s bid never reached the table: ${why}`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  await new Promise((r) => setTimeout(r, 250))
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

/*
 * And the newcomer is in it (R-014).
 *
 * The next deal is where they arrive — never inside a round, because a round is
 * a set of claims about a fixed number of dice — and they arrive with a full
 * hand, which is the part the host was asked to judge.
 */
{
  const dealt = db.tables.game_players.find((p) => p.user_id === idOfName('Dee')) ?? null
  check(dealt !== null, 'the next round deals the newcomer in')
  check(dealt?.dice_count === 5, 'with five dice, as R-014 says', `${dealt?.dice_count} dice`)

  const nowPlaying = await latecomer.page
    .waitForFunction(
      () => document.querySelectorAll('.board__die').length === 5,
      null,
      { timeout: 25_000 },
    )
    .then(() => true)
    .catch(() => false)
  check(nowPlaying, 'and they are holding them on screen, without reloading')

  const told = await players[0].page.evaluate(() =>
    /joined with 5 dice/i.test(document.querySelector('.log')?.textContent ?? ''),
  )
  check(told, 'and the whole table is told they arrived')
}

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
  // Two left holding a die each, everybody else out — including the newcomer,
  // who is a real player at this table now and has to be accounted for.
  const survivors = new Set([idOf(players[0]), idOf(players[1])])
  for (const player of db.tables.game_players) {
    player.dice_count = survivors.has(player.user_id) ? 1 : 0
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
const canDoubt = await last.page
  .waitForSelector('.challenge__lie:not([disabled])', { timeout: 20_000 })
  .then(() => true)
  .catch(() => false)
check(
  canDoubt,
  `${last.name} can doubt the last bid of the game`,
  await last.page.evaluate(() => {
    const dock = document.querySelector('.board__dock')
    return dock === null ? 'no dock at all' : dock.textContent?.slice(0, 120)
  }),
)
if (canDoubt) await last.page.click('.challenge__lie')

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
