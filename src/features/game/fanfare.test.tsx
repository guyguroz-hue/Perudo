// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FANFARE_MS, useFanfare } from './fanfare'

afterEach(() => {
  vi.useRealTimers()
})

/*
 * "It gets missed."
 *
 * A Farewell Round changes every rule at the table for one round — one face,
 * chosen by the player it is owed to, and no wildcard — and it was announced by
 * a small brass word in the corner of the stage, in the place the screen keeps
 * standing facts nobody acts on. A table that had played several of them never
 * noticed one.
 */
describe('announcing a round nobody noticed', () => {
  it('says it once, and then stops saying it', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useFanfare(5, { name: 'Carl' }))
    expect(result.current[0]).toEqual({ name: 'Carl' })

    act(() => void vi.advanceTimersByTime(FANFARE_MS + 1))
    expect(result.current[0]).toBeNull()
  })

  it('does not come back on the re-renders a live table produces', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ round }) => useFanfare(round, { name: 'Carl' }), {
      initialProps: { round: 5 },
    })
    act(() => void vi.advanceTimersByTime(FANFARE_MS + 1))

    // The table re-reads itself on every event at it, several times a round.
    rerender({ round: 5 })
    rerender({ round: 5 })
    expect(result.current[0]).toBeNull()
  })

  it('holds the name it was given rather than following the table', () => {
    /*
     * The turn moves off the player a Farewell Round is owed to the instant
     * they bid, which is well inside the time this is on screen. A banner that
     * read the table live would rename itself halfway through being read.
     */
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ holder }: { holder: string }) => useFanfare(5, { name: holder }),
      { initialProps: { holder: 'Carl' } },
    )
    rerender({ holder: 'Maya' })
    expect(result.current[0]).toEqual({ name: 'Carl' })
  })

  it('says nothing about a round not worth announcing', () => {
    const { result, rerender } = renderHook(
      ({ round, payload }: { round: number; payload: { name: string } | null }) =>
        useFanfare(round, payload),
      { initialProps: { round: 5, payload: null as { name: string } | null } },
    )
    expect(result.current[0]).toBeNull()

    // And the next one that is worth it still gets said.
    rerender({ round: 6, payload: { name: 'Dana' } })
    expect(result.current[0]).toEqual({ name: 'Dana' })
  })

  it('can be put away with a tap', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useFanfare(5, { name: 'Carl' }))
    act(() => result.current[1]())
    expect(result.current[0]).toBeNull()
  })
})
