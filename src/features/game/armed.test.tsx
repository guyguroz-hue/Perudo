// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ARM_MS, useArmed } from './armed'

afterEach(() => {
  vi.useRealTimers()
})

/*
 * The accident this exists to prevent, reported by everybody at one table:
 * "we all pressed Bull without meaning to."
 *
 * Bull is the most expensive move in the game and it cannot be taken back — a
 * false one costs the caller a die (§8.4), a correct one costs everybody else
 * (§8.3) — so a Bull nobody meant to make changes the game for five other
 * people.
 *
 * The first cause was layout, and is fixed elsewhere: the tiles were not on
 * screen until somebody bid, so a bid grew the dock by a row and jumped
 * everything above it. This is the second cause, which survives the first. A
 * thumb takes about a fifth of a second to travel and a press is committed
 * before it lands, so a bid arriving in that window turns a dead tile live
 * underneath a finger that was never deciding about it. Nothing moved on
 * screen; what was under the finger changed meaning.
 */
describe('a control that has just come alive', () => {
  it('is inert for longer than a thumb takes to land', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ ready }) => useArmed(ready), {
      initialProps: { ready: false },
    })
    expect(result.current).toBe(false)

    // A bid lands. The tile is live, and a thumb is already on its way.
    rerender({ ready: true })
    expect(result.current).toBe(false)

    act(() => void vi.advanceTimersByTime(ARM_MS - 1))
    expect(result.current).toBe(false)

    act(() => void vi.advanceTimersByTime(2))
    expect(result.current).toBe(true)
  })

  it('leaves alone a control that was usable all along', () => {
    // Nothing changed under anybody, so there is nothing to protect them from
    // — and a player who has been looking at Lie for ten seconds should not be
    // made to wait for it.
    const { result } = renderHook(() => useArmed(true))
    expect(result.current).toBe(true)
  })

  it('does not restart its clock on a re-render that changes nothing', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ ready }) => useArmed(ready), {
      initialProps: { ready: false },
    })
    rerender({ ready: true })

    // The table re-renders on every event at it, and there are several a
    // second on a busy table. If each one restarted the clock the control
    // would arm late, or never.
    act(() => void vi.advanceTimersByTime(ARM_MS - 100))
    rerender({ ready: true })
    rerender({ ready: true })
    act(() => void vi.advanceTimersByTime(101))

    expect(result.current).toBe(true)
  })

  it('goes back to inert when the control does', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ ready }) => useArmed(ready), {
      initialProps: { ready: true },
    })
    expect(result.current).toBe(true)

    // The round resolves: there is nothing to doubt again.
    rerender({ ready: false })
    expect(result.current).toBe(false)

    // And the next bid has to wait its beat like the first one did.
    rerender({ ready: true })
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    expect(result.current).toBe(true)
  })
})
