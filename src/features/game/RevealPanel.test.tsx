// @vitest-environment jsdom
import userEvent from '@testing-library/user-event'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RevealPanel } from './RevealPanel'
import { resultHoldMs, useRevealStage } from './revealStage'
import type { RevealClaim, RevealData } from './reveal'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => setMotion(true))

const DATA: RevealData = {
  roundType: 'normal',
  quantity: 4,
  face: 5,
  bidderName: 'Alice',
  bullCallerName: null,
  challengerName: 'Bob',
  challengeKind: 'lie',
  hands: [
    { id: 'alice', name: 'Alice', dice: [5, 5, 1, 3, 2] },
    { id: 'bob', name: 'Bob', dice: [4, 6, 6, 2, 3] },
  ],
  actualCount: 3,
  claimHolds: false,
  deltas: { alice: -1 },
  eliminated: [],
}

const CLAIM: RevealClaim = { quantity: 4, face: 5, reading: 'at least' }

/**
 * The panel driven by the real sequence, the way the table drives it.
 *
 * `open` is what the table passes: a reveal is open from the moment a player
 * doubts, which is before the answer exists. It is what anchors the held beat,
 * so that the wait for the server is the pause rather than being added to it.
 */
function Panel({
  data,
  claim = CLAIM,
  open = true,
}: {
  data: RevealData | null
  claim?: RevealClaim
  open?: boolean
}) {
  const { stage, counted } = useRevealStage(data, open)
  return <RevealPanel claim={claim} data={data} stage={stage} counted={counted} />
}

function show(data: RevealData | null, claim: RevealClaim = CLAIM) {
  return render(<Panel data={data} claim={claim} />)
}

describe('while the answer is still coming', () => {
  // The pause is the drama and the network wait at once. A spinner would tell
  // the player the game is loading when the game is actually holding its breath.
  it('shows the claim and no spinner', () => {
    const { container } = show(null)
    expect(container.querySelector('[data-stage="held"]')).toBeTruthy()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(screen.getByText('at least')).toBeTruthy()
    // Nothing is counted yet, and nothing pretends to be.
    expect(container.querySelector('.verdict__total')?.textContent).toBe('·')
    expect(container.querySelectorAll('.verdict__die')).toHaveLength(0)
  })
})

describe('the count', () => {
  /*
   * The whole reason this panel exists.
   *
   * On the table the dice lie flat under a low camera and are twenty pixels
   * across; here the ones that counted are shown at a size a person can read.
   * One slot each, from the first frame of the count, so the row fills instead
   * of growing and the verdict underneath never jumps.
   */
  it('gives every counting die a slot, and fills them as the number climbs', () => {
    setMotion(false)
    vi.useFakeTimers()
    const { container } = render(<Panel data={DATA} />)

    act(() => void vi.advanceTimersByTime(3000))
    // Three fives on this table: Alice's two, and her Joker.
    expect(container.querySelectorAll('.verdict__die')).toHaveLength(3)
    expect(container.querySelectorAll('.verdict__die--in')).toHaveLength(3)
    expect(container.querySelector('.verdict__total')?.textContent).toBe('3')
  })

  it('says so plainly when nothing counted at all', () => {
    const empty: RevealData = {
      ...DATA,
      hands: [{ id: 'alice', name: 'Alice', dice: [2, 3, 4] }],
      actualCount: 0,
      deltas: { alice: -1 },
    }
    show(empty)
    expect(screen.getByText('not one')).toBeTruthy()
  })
})

describe('the result', () => {
  // Motion off: the reveal is simply at its answer, and says the same thing.
  it('arrives immediately with motion switched off', () => {
    const { container } = show(DATA)
    expect(container.querySelector('[data-stage="result"]')).toBeTruthy()
    expect(screen.getByText('Alice was wrong')).toBeTruthy()
    expect(screen.getByText(/there were\s*3/)).toBeTruthy()
  })

  // A Bull takes the claim over, so the name on trial is the Bull caller's and
  // the reading is "exactly" (GAME_RULES §8.3).
  it('puts a Bulled claim in the Bull caller’s name', () => {
    show(
      { ...DATA, bullCallerName: 'Carol', claimHolds: true, deltas: { bob: -1 } },
      { ...CLAIM, reading: 'exactly' },
    )
    expect(screen.getByText('Carol was right')).toBeTruthy()
    expect(screen.getByText('exactly')).toBeTruthy()
  })

  /*
   * What it cost, in words.
   *
   * How many dice somebody holds is the whole state of the game for them, and
   * this is the only thing that ever changes it. It used to be a row of chips
   * — "Alice −1" — which is the data rather than the sentence.
   */
  it('says who lost a die and who won one back', () => {
    const said = (over: Partial<RevealData>) =>
      [...show({ ...DATA, ...over }).container.querySelectorAll('.verdict__change')].map(
        (n) => n.textContent,
      )

    expect(said({ deltas: { alice: -1 } })).toEqual(['Alice loses a die'])
    expect(said({ deltas: { alice: -1, bob: 1 } })).toEqual([
      'Alice loses a die',
      'Bob wins a die back',
    ])
  })

  it('groups a table that all paid at once into one sentence', () => {
    // A correct Bull takes a die from everybody except the caller. At six
    // players that was five chips saying the same thing, which is a wall.
    const { container } = show({
      ...DATA,
      hands: [
        { id: 'alice', name: 'Alice', dice: [5] },
        { id: 'bob', name: 'Bob', dice: [5] },
        { id: 'carl', name: 'Carl', dice: [5] },
      ],
      deltas: { alice: -1, bob: -1, carl: -1 },
    })
    const changes = [...container.querySelectorAll('.verdict__change')].map((n) => n.textContent)
    expect(changes).toEqual(['Alice, Bob and Carl each lose a die'])
  })

  it('says somebody is out rather than saying they lost a die', () => {
    // Going out is not a loss of degree. A player reduced to nothing is not
    // told "Alice loses a die" with the ending left as an annotation.
    const { container } = show({
      ...DATA,
      deltas: { alice: -1, bob: 1 },
      eliminated: ['alice'],
    })
    const changes = [...container.querySelectorAll('.verdict__change')].map((n) => n.textContent)
    expect(changes).toEqual(['Bob wins a die back', 'Alice is out'])
  })
})

/**
 * The table moves on without being asked.
 *
 * The round after this one was dealt by the resolution that produced it, so
 * every player is already in it and the button only ever took this client's
 * curtain down. Six players each taking their own curtain down means six
 * people waiting on each other for no reason, and one of them putting their
 * phone in a pocket stops the game for everybody.
 */
describe('the result standing on its own deadline', () => {
  const held = (over: Partial<RevealData> = {}): RevealData => ({ ...DATA, ...over })

  /*
   * Asked of `resultHoldMs` rather than written down again.
   *
   * These two used to restate the arithmetic — "5000 + 700" — which made them
   * fail every time the reveal was tuned, without telling anybody anything: the
   * deadline had moved on purpose and the test was reporting that it had moved.
   * What is worth holding is that the panel waits for the number the reveal
   * computes, and not one frame less.
   */
  it('continues by itself once the result has been readable a while', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(
      <RevealPanel claim={CLAIM} data={held()} stage="result" counted={3} onDone={onDone} />,
    )

    // One player lost a die.
    const hold = resultHoldMs(1)
    act(() => void vi.advanceTimersByTime(hold - 1))
    expect(onDone).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(2))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('holds longer when there is more to read', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    // A correct Bull: everybody at the table pays, and two of them are out.
    render(
      <RevealPanel
        claim={CLAIM}
        data={held({
          hands: [
            { id: 'a', name: 'Alice', dice: [5] },
            { id: 'b', name: 'Bob', dice: [5, 5] },
            { id: 'c', name: 'Carl', dice: [2] },
            { id: 'd', name: 'Dana', dice: [6, 6] },
          ],
          deltas: { a: -1, b: -1, c: -1, d: -1 },
          eliminated: ['a', 'c'],
        })}
        stage="result"
        counted={3}
        onDone={onDone}
      />,
    )

    // Four players paid, so it holds longer than a resolution that cost one.
    const longer = resultHoldMs(4)
    expect(longer).toBeGreaterThan(resultHoldMs(1))

    act(() => void vi.advanceTimersByTime(resultHoldMs(1)))
    expect(onDone).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(longer - resultHoldMs(1) + 1))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('still lets a player who has finished reading go early', async () => {
    const onDone = vi.fn()
    render(
      <RevealPanel claim={CLAIM} data={held()} stage="result" counted={3} onDone={onDone} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Next round/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('starts no deadline before the result is on screen', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    // Still counting dice. Starting the clock here would spend the reading
    // time on the counting, and a long count is exactly when there is most to
    // read afterwards.
    render(
      <RevealPanel claim={CLAIM} data={held()} stage="counting" counted={1} onDone={onDone} />,
    )

    act(() => void vi.advanceTimersByTime(20000))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('does not continue a reveal nobody is waiting on', () => {
    vi.useFakeTimers()
    // No handler is the preview, replaying a fixture. Nothing to advance to.
    expect(() =>
      render(<RevealPanel claim={CLAIM} data={held()} stage="result" counted={3} />),
    ).not.toThrow()
    act(() => void vi.advanceTimersByTime(20000))
  })
})
