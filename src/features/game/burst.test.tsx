// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUT_IN_MS, useBurst } from './burst'
import type { TableMove } from './view'

/**
 * Announcing a Burst, and — mostly — not announcing one.
 *
 * The table is refetched on every Realtime event, so the same moves arrive
 * again and again as fresh objects. Almost everything this hook does is decide
 * which of those arrivals is news.
 */

const effect = vi.fn()
vi.mock('../../lib/useSound', () => ({
  useSoundEffect: () => effect,
  useSound: () => ({ on: true, toggle: vi.fn() }),
}))

beforeEach(() => effect.mockReset())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function move(id: string, burst: boolean): TableMove {
  return { id, actorId: 'alice', text: `move ${id}`, burst }
}

/** A screen that renders whatever the hook says, so it can be read back. */
function harness(moves: readonly TableMove[]) {
  const seen: { jolting: boolean; cutIn: TableMove | null }[] = []
  function Screen({ moves: m }: { moves: readonly TableMove[] }) {
    seen.push(useBurst(m))
    return null
  }
  const view = render(<Screen moves={moves} />)
  const last = () => seen[seen.length - 1]
  return {
    ...view,
    seen,
    last,
    show: (next: readonly TableMove[]) => view.rerender(<Screen moves={next} />),
    jolted: () => seen.some((state) => state.jolting),
  }
}

describe('cutting in', () => {
  it('says so when a Burst lands', () => {
    const table = harness([move('1', false)])
    expect(table.jolted()).toBe(false)

    act(() => table.show([move('1', false), move('2', true)]))
    expect(table.jolted()).toBe(true)
    expect(effect).toHaveBeenCalledWith('burst')
    // And the move itself, because the flash cannot say who it was.
    expect(table.last().cutIn?.id).toBe('2')
  })

  it('says nothing about an ordinary bid', () => {
    const table = harness([move('1', false)])
    act(() => table.show([move('1', false), move('2', false)]))
    expect(table.jolted()).toBe(false)
    expect(effect).not.toHaveBeenCalled()
  })

  /*
   * The table is refetched on every event and between rounds, so the same move
   * comes back as a new object with the same id many times over. Announcing it
   * each time would knock at a player once per heartbeat.
   */
  it('announces one Burst once, however often the table is read again', () => {
    const moves = [move('1', false), move('2', true)]
    const table = harness([move('1', false)])
    act(() => table.show(moves))
    expect(effect).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 5; i += 1) {
      // A fresh array of fresh objects, which is what a refetch produces.
      act(() => table.show(moves.map((m) => ({ ...m }))))
    }
    expect(effect).toHaveBeenCalledTimes(1)
  })

  /*
   * Opening the app to a table where the last thing that happened was a Burst
   * is not the same as watching one happen. Announcing the state somebody
   * arrived in as news is how a game greets a returning player with an alarm.
   */
  it('stays quiet about a Burst that had already happened when you arrived', () => {
    const table = harness([move('1', false), move('2', true)])
    expect(table.jolted()).toBe(false)
    expect(effect).not.toHaveBeenCalled()
  })

  it('settles again on its own', () => {
    vi.useFakeTimers()
    const table = harness([move('1', false)])
    act(() => table.show([move('1', false), move('2', true)]))
    expect(table.last().jolting).toBe(true)

    act(() => void vi.advanceTimersByTime(500))
    expect(table.last().jolting).toBe(false)
    // The line stays up longer than the flash: it has something to read on it.
    expect(table.last().cutIn?.id).toBe('2')

    act(() => void vi.advanceTimersByTime(CUT_IN_MS))
    expect(table.last().cutIn).toBeNull()
  })

  /*
   * The bug this replaced, and it was not theoretical.
   *
   * The clocks used to be cleared by the cleanup of an effect that depends on
   * `moves`, so any move arriving inside the flash cancelled the timer that
   * ends it — and the next run returned early without setting a new one. The
   * board kept the class for good, and since the flash is a one-shot animation
   * on that class, no later Burst ever flashed again. Two people cutting in at
   * once is the exact case this feature exists to show.
   */
  it('survives a second move landing inside the first flash', () => {
    vi.useFakeTimers()
    const table = harness([move('1', false)])
    act(() => table.show([move('1', false), move('2', true)]))

    act(() => void vi.advanceTimersByTime(100))
    act(() => table.show([move('1', false), move('2', true), move('3', false)]))

    // The flash still ends.
    act(() => void vi.advanceTimersByTime(600))
    expect(table.last().jolting).toBe(false)

    // And the one after it still happens.
    act(() => table.show([move('1', false), move('2', true), move('3', false), move('4', true)]))
    expect(table.last().jolting).toBe(true)
  })

  it('announces the next one too', () => {
    const table = harness([move('1', false)])
    act(() => table.show([move('1', false), move('2', true)]))
    act(() => table.show([move('1', false), move('2', true), move('3', true)]))
    expect(effect).toHaveBeenCalledTimes(2)
  })
})
