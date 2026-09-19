// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ARM_MS, useSettled } from './armed'

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
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: 'none' },
    })
    expect(result.current).toBe(true)

    // A bid lands. The tile is live, and a thumb is already on its way.
    rerender({ claim: '4x5' })
    expect(result.current).toBe(false)

    act(() => void vi.advanceTimersByTime(ARM_MS - 1))
    expect(result.current).toBe(false)

    act(() => void vi.advanceTimersByTime(2))
    expect(result.current).toBe(true)
  })

  it('leaves alone a control nothing has happened to', () => {
    // Nothing changed under anybody, so there is nothing to protect them from
    // — and a player who has been looking at Lie for ten seconds should not be
    // made to wait for it.
    const { result } = renderHook(() => useSettled('4x5'))
    expect(result.current).toBe(true)
  })

  it('does not restart its clock on a re-render that changes nothing', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: 'none' },
    })
    rerender({ claim: '4x5' })

    // The table re-renders on every event at it, and there are several a
    // second on a busy table. If each one restarted the clock the control
    // would arm late, or never.
    act(() => void vi.advanceTimersByTime(ARM_MS - 100))
    rerender({ claim: '4x5' })
    rerender({ claim: '4x5' })
    act(() => void vi.advanceTimersByTime(101))

    expect(result.current).toBe(true)
  })

  /*
   * The bug this file's first version had, and it shipped.
   *
   * The challenge tiles were keyed on whether there was a bid at all — a
   * boolean that goes true once a round and then stays true. So the beat
   * happened on the opening bid and never again, and every bid after it, which
   * is every bid anybody bursts in with, armed the tiles instantly. Reported
   * exactly as it behaved: "I meant to call Lie on that bid, somebody cut in a
   * hundredth of a second before I pressed, and my Lie went against theirs."
   */
  it('goes inert again on the second change, and the third', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: '4x5' },
    })

    for (const claim of ['4x6', '5x6', '5x6|bull']) {
      rerender({ claim })
      expect(result.current).toBe(false)
      act(() => void vi.advanceTimersByTime(ARM_MS + 1))
      expect(result.current).toBe(true)
    }
  })

  it('goes back to inert when the round takes the bid away', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: '4x5' },
    })

    // The round resolves: there is nothing to doubt again.
    rerender({ claim: 'none' })
    expect(result.current).toBe(false)

    // And the next bid has to wait its beat like the first one did.
    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    rerender({ claim: '2x3' })
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    expect(result.current).toBe(true)
  })
})

/*
 * And the same accident without a dead control anywhere in it.
 *
 * Two players burst at once, the bid moves twice inside a second, and the
 * button a finger is already travelling towards said Burst when the finger set
 * off and says Bid by the time it lands. It was never disabled; it is raising
 * a different claim from the one that was read.
 */
describe('a control whose meaning changed', () => {
  it('will not take the press that was already on its way', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: '4x5|true' },
    })
    expect(result.current).toBe(true)

    // Somebody bursts. Same button, different bid under it.
    rerender({ claim: '5x5|false' })
    expect(result.current).toBe(false)

    act(() => void vi.advanceTimersByTime(ARM_MS - 1))
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(2))
    expect(result.current).toBe(true)
  })

  it('costs nothing at a table where nothing is happening', () => {
    // The commonest case by far: the turn comes round, the player looks at the
    // bid for a while and presses. Nothing changed, so nothing waits.
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ claim }) => useSettled(claim), {
      initialProps: { claim: '4x5|false' },
    })
    rerender({ claim: '4x5|false' })
    rerender({ claim: '4x5|false' })
    expect(result.current).toBe(true)
  })
})
