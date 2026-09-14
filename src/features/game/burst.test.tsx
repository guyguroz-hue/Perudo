// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBurst } from './burst'
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
  const seen: boolean[] = []
  function Screen({ moves: m }: { moves: readonly TableMove[] }) {
    seen.push(useBurst(m))
    return null
  }
  const view = render(<Screen moves={moves} />)
  return {
    ...view,
    seen,
    show: (next: readonly TableMove[]) => view.rerender(<Screen moves={next} />),
    jolted: () => seen.some(Boolean),
  }
}

describe('cutting in', () => {
  it('says so when a Burst lands', () => {
    const table = harness([move('1', false)])
    expect(table.jolted()).toBe(false)

    act(() => table.show([move('1', false), move('2', true)]))
    expect(table.jolted()).toBe(true)
    expect(effect).toHaveBeenCalledWith('burst')
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
    expect(table.seen[table.seen.length - 1]).toBe(true)

    act(() => void vi.advanceTimersByTime(500))
    expect(table.seen[table.seen.length - 1]).toBe(false)
  })

  it('announces the next one too', () => {
    const table = harness([move('1', false)])
    act(() => table.show([move('1', false), move('2', true)]))
    act(() => table.show([move('1', false), move('2', true), move('3', true)]))
    expect(effect).toHaveBeenCalledTimes(2)
  })
})
