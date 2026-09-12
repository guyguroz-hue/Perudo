// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from './Reveal'
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
const STANDINGS = DATA.hands.map((h) => ({ id: h.id, name: h.name, diceCount: h.dice.length }))

function show(data: RevealData | null, claim: RevealClaim = CLAIM) {
  return render(<Reveal standings={STANDINGS} claim={claim} data={data} />)
}

describe('while the answer is still coming', () => {
  // The pause is the drama and the network wait at once. A spinner would tell
  // the player the game is loading when the game is actually holding its breath.
  it('shows the cups and the claim, and no spinner', () => {
    const { container } = show(null)
    expect(container.querySelector('[data-stage="held"]')).toBeTruthy()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    // Dice counts are public, so the cups are on the table for the whole wait.
    expect(container.querySelectorAll('.cup')).toHaveLength(2)
    expect(container.querySelectorAll('.cup--lifted')).toHaveLength(0)
    expect(container.querySelectorAll('.reveal__dice')).toHaveLength(0)
    expect(screen.getByText('at least')).toBeTruthy()
  })
})

describe('the count is readable without arithmetic', () => {
  it('rings the dice that counted, wildcards included', () => {
    const { container } = show(DATA)
    // Alice holds two fives and a wild one; Bob holds nothing that counts.
    expect(container.querySelectorAll('.reveal__die--counts')).toHaveLength(3)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('stops counting ones in a Farewell Round', () => {
    const { container } = show({ ...DATA, roundType: 'farewell', actualCount: 2 })
    expect(container.querySelectorAll('.reveal__die--counts')).toHaveLength(2)
  })
})

describe('the result', () => {
  it('names the bidder when a plain bid was challenged', () => {
    show(DATA)
    expect(screen.getByText('Alice was wrong')).toBeTruthy()
  })

  // A Bull takes the bid over, so a Bull on trial is the Bull caller's claim,
  // not the bidder's (GAME_RULES §8.3).
  it('names the Bull caller when the bid had been Bulled', () => {
    show({ ...DATA, bullCallerName: 'Carol', claimHolds: true }, { ...CLAIM, reading: 'exactly' })
    expect(screen.getByText('Carol was right')).toBeTruthy()
    expect(screen.getByText(/exactly 4/)).toBeTruthy()
  })

  it('shows every die that moved, and who went out', () => {
    show({ ...DATA, deltas: { alice: -1, bob: 1 }, eliminated: ['alice'] })
    expect(screen.getByText('-1')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('out')).toBeTruthy()
  })
})

describe('with motion on', () => {
  beforeEach(() => {
    setMotion(false)
    vi.useFakeTimers()
  })

  it('holds, lifts the cups, then settles into the result', () => {
    const { container } = show(DATA)
    const stage = () => container.firstElementChild?.getAttribute('data-stage')

    expect(stage()).toBe('held')
    // The bid under trial stays on screen throughout; it is the hands that are
    // still under their cups.
    expect(container.querySelectorAll('.reveal__dice')).toHaveLength(0)

    // The dice are under the cup as it starts to rise, so the lift uncovers
    // them rather than the cup coming off an empty patch of felt.
    act(() => void vi.advanceTimersByTime(800))
    expect(stage()).toBe('lifting')
    expect(container.querySelector('.cup--lifted')).toBeTruthy()
    expect(container.querySelectorAll('.reveal__dice')).toHaveLength(2)
    expect(container.querySelectorAll('.reveal__die--counts')).toHaveLength(0)

    act(() => void vi.advanceTimersByTime(600))
    expect(stage()).toBe('settled')

    // The rings arrive with the count, which is when they mean something.
    act(() => void vi.advanceTimersByTime(400))
    expect(stage()).toBe('counting')
    expect(container.querySelectorAll('.reveal__die--counts')).toHaveLength(3)

    act(() => void vi.advanceTimersByTime(2000))
    expect(stage()).toBe('result')
    expect(screen.getByText('Alice was wrong')).toBeTruthy()
  })

  // A slow server makes the beat longer, never broken: the table simply holds
  // its breath until the answer arrives.
  it('extends the pause rather than showing anything else', () => {
    const { container, rerender } = show(null)
    act(() => void vi.advanceTimersByTime(5000))
    expect(container.firstElementChild?.getAttribute('data-stage')).toBe('held')
    // Still the cups, still no spinner, however long it takes.
    expect(container.querySelectorAll('.cup--lifted')).toHaveLength(0)

    rerender(<Reveal standings={STANDINGS} claim={CLAIM} data={DATA} />)
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByText('Alice was wrong')).toBeTruthy()
  })
})
