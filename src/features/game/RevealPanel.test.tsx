// @vitest-environment jsdom
import userEvent from '@testing-library/user-event'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RevealPanel } from './RevealPanel'
import { useRevealStage } from './revealStage'
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

/** The panel driven by the real sequence, the way the table drives it. */
function Panel({ data, claim = CLAIM }: { data: RevealData | null; claim?: RevealClaim }) {
  const { stage, counted } = useRevealStage(data)
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

  it('names who paid and who was paid', () => {
    const { container } = show({
      ...DATA,
      deltas: { alice: -1, bob: 1 },
      eliminated: ['alice'],
    })
    const changes = [...container.querySelectorAll('.verdict__change')].map((n) => n.textContent)
    expect(changes).toHaveLength(2)
    expect(changes[0]).toContain('-1')
    expect(changes[0]).toContain('out')
    expect(changes[1]).toContain('+1')
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

  it('continues by itself once the result has been readable a while', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(
      <RevealPanel claim={CLAIM} data={held()} stage="result" counted={3} onDone={onDone} />,
    )

    // One player lost a die: 5000 + 700.
    act(() => void vi.advanceTimersByTime(5699))
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

    // The single-change hold would have fired long before this.
    act(() => void vi.advanceTimersByTime(5700))
    expect(onDone).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(2101))
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
