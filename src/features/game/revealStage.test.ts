// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PAY_AFTER_MS, PAY_MS, resultHoldMs, useRevealStage } from './revealStage'
import type { RevealData } from './reveal'

/** One resolution, with a couple of dice to count so the sequence has length. */
const RESOLUTION: RevealData = {
  roundType: 'normal',
  quantity: 4,
  face: 5,
  bidderName: 'Alice',
  bullCallerName: null,
  challengerName: 'Bob',
  challengeKind: 'lie',
  hands: [
    { id: 'a', name: 'Alice', dice: [5, 5] },
    { id: 'b', name: 'Bob', dice: [5, 2] },
  ],
  actualCount: 3,
  claimHolds: false,
  deltas: { a: -1 },
  eliminated: [],
}

/**
 * The reveal's pacing, as a set of promises it makes to itself.
 *
 * These are three numbers in three different places — the pause before the
 * dice move, how long they take to move, and how long the whole result stands
 * before the table goes on without being asked — and nothing about any one of
 * them says what the others are. Tuning one and advancing the table over a die
 * still in the air is the mistake this exists to make impossible.
 */
describe('the reveal’s timing', () => {
  it('never moves on while a die is still in the air', () => {
    // Every table size, from the smallest resolution to a correct Bull that
    // takes a die from five people at once.
    for (let changed = 0; changed <= 6; changed += 1) {
      expect(resultHoldMs(changed)).toBeGreaterThan(PAY_AFTER_MS + PAY_MS)
    }
  })

  it('leaves the settled table on screen long enough to be read', () => {
    // Not just longer than the animation — long enough after it that a player
    // sees what the table looks like now, which is the point of the reveal.
    for (let changed = 0; changed <= 6; changed += 1) {
      const afterwards = resultHoldMs(changed) - (PAY_AFTER_MS + PAY_MS)
      expect(afterwards).toBeGreaterThanOrEqual(2000)
    }
  })

  it('holds longer the more there is to read, up to a limit', () => {
    // A player waiting on a table that has already finished moving is a player
    // being made to wait, so it is capped rather than growing without end.
    expect(resultHoldMs(3)).toBeGreaterThan(resultHoldMs(1))
    expect(resultHoldMs(6)).toBeLessThanOrEqual(12_000)
  })

  it('gives a die long enough to be followed across the table', () => {
    // The only thing that ever changes what a player holds. Quicker than this
    // and a player who blinked has missed the result.
    expect(PAY_MS).toBeGreaterThanOrEqual(800)
  })
})

/*
 * The sequence, run twice.
 *
 * Both of these were found in a game rather than in a test, and both are the
 * same mistake: this hook lives in `GameTable`, which is mounted for the whole
 * game, so anything it remembers outlives the reveal that set it.
 */
describe('a second reveal in the same game', () => {
  it('starts at the beginning, not at the last verdict', () => {
    vi.useFakeTimers()
    const first: RevealData = { ...RESOLUTION }
    const { result, rerender } = renderHook(
      ({ data, open }: { data: RevealData | null; open: boolean }) => useRevealStage(data, open),
      { initialProps: { data: first as RevealData | null, open: true } },
    )

    // Play the first one out to its end.
    act(() => void vi.advanceTimersByTime(30_000))
    expect(result.current.stage).toBe('result')

    // The table closes it, and a later round opens another.
    rerender({ data: null, open: false })
    const second: RevealData = { ...RESOLUTION }
    rerender({ data: second, open: true })

    /*
     * The frame that first carries the new resolution must not still be showing
     * the old one's verdict. It used to: the stage stayed at `result`, so the
     * second reveal in a game opened on its own answer, held it for the length
     * of the first beat, and only then rewound to the cups lifting.
     */
    expect(result.current.stage).toBe('held')
    expect(result.current.counted).toBe(0)
    vi.useRealTimers()
  })

  it('still holds the opening beat, an hour into a game', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ data, open }: { data: RevealData | null; open: boolean }) => useRevealStage(data, open),
      { initialProps: { data: null as RevealData | null, open: false } },
    )

    // A long game happens. Nothing is revealed in it.
    act(() => void vi.advanceTimersByTime(60 * 60 * 1000))

    // Now somebody doubts, and the answer comes back at once.
    rerender({ data: null, open: true })
    rerender({ data: { ...RESOLUTION }, open: true })

    /*
     * The beat is anchored on the doubt, not on when the table was built. It
     * used to be the latter, so `HELD_MS - (an hour)` was hugely negative and
     * the pause collapsed to its ninety-millisecond floor: the held beat this
     * file is built around never happened in a real game even once.
     */
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current.stage).toBe('held')

    act(() => void vi.advanceTimersByTime(700))
    expect(result.current.stage).not.toBe('held')
    vi.useRealTimers()
  })
})
