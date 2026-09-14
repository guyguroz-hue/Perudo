// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Countdown } from './Countdown'

/**
 * The three seconds between the lobby and the table.
 *
 * This looks like the most trivial component in the product and sits in the
 * one place a stall is unrecoverable: every client reaches it the same way and
 * waits for its own clock, so a clock that does not finish is a table nobody
 * arrives at, with nothing on screen to press.
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function run(onDone = vi.fn()) {
  const view = render(<Countdown onDone={onDone} />)
  return { ...view, onDone }
}

/**
 * Let the clock run, one scheduled beat at a time.
 *
 * Not one long advance. Each tick sets state, and the timer for the tick after
 * it is not scheduled until React has re-rendered and run the effect — which
 * happens at the *end* of an advance, so the new timer lands outside the window
 * that just ran. One long jump therefore moves this component exactly one step
 * however far it jumps, which looks like a stopped countdown and is a fake
 * clock being asked the wrong question.
 */
async function beats(count: number, ms = 700) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }
}

describe('counting everyone in', () => {
  it('reaches the table', async () => {
    vi.useFakeTimers()
    const { onDone } = run()

    expect(screen.getByText('3')).toBeTruthy()
    await beats(3)
    expect(screen.getByText('Play')).toBeTruthy()
    await beats(1, 500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  /*
   * The reason this test exists.
   *
   * `onDone` is written at the call site as an arrow, so it is a new function
   * on every render — and this sits inside a live room that re-renders on every
   * Realtime event and every heartbeat any of six clients sends. With the
   * callback in the effect's dependencies each of those cleared the running
   * timer and started a fresh one, so a busy room held the count on three and
   * never reached the table.
   */
  it('does not restart when the room around it re-renders', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    // A fresh arrow each time, which is how every caller writes it.
    const { rerender } = render(<Countdown onDone={() => onDone()} />)

    // Re-rendered more often than the clock ticks, which is what a room full
    // of heartbeats does.
    for (let i = 0; i < 12; i += 1) {
      await beats(1, 200)
      rerender(<Countdown onDone={() => onDone()} />)
    }

    // 2400ms of a 2100ms count: it should be at "Play" regardless of how many
    // times the room moved underneath it.
    expect(screen.getByText('Play')).toBeTruthy()
    await beats(1, 500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls back once, and not again', async () => {
    vi.useFakeTimers()
    const { onDone } = run()
    await beats(4)
    await beats(10, 5_000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
