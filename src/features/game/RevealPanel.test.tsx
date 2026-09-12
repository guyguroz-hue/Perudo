// @vitest-environment jsdom
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
