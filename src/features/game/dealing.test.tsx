// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAKE_MS, useDealShake } from './dealing'

afterEach(cleanup)
beforeEach(() => {
  vi.useFakeTimers()
  // jsdom answers every media query with "no match", which is the reading this
  // needs: a player who has not asked for less motion.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})
afterEach(() => vi.useRealTimers())

function Cups({ round }: { round: number }) {
  return <span data-testid="cups">{useDealShake(round) ? 'shaking' : 'still'}</span>
}

/*
 * Rendered the way the app renders, under StrictMode.
 *
 * That is not decoration: StrictMode runs effects twice on mount, and React is
 * free to re-run any effect at any time. A version of this hook that recorded
 * the round it had seen inside its own effect passed every test written without
 * it and shook for the rest of the game in the browser.
 */
function Table({ round }: { round: number }) {
  return (
    <StrictMode>
      <Cups round={round} />
    </StrictMode>
  )
}

const cups = () => document.querySelector('[data-testid="cups"]')?.textContent

describe('the cups shake when a round is dealt', () => {
  // Opening the app into round seven is not round seven being dealt, and
  // neither is a reload. Only a round arriving while you are watching is.
  it('says nothing on arrival, whatever round it is', () => {
    render(<Table round={7} />)
    expect(cups()).toBe('still')
    act(() => void vi.advanceTimersByTime(SHAKE_MS * 2))
    expect(cups()).toBe('still')
  })

  it('shakes for a beat when the round moves, then settles', () => {
    const { rerender } = render(<Table round={3} />)
    act(() => rerender(<Table round={4} />))
    expect(cups()).toBe('shaking')

    act(() => void vi.advanceTimersByTime(SHAKE_MS - 50))
    expect(cups()).toBe('shaking')

    act(() => void vi.advanceTimersByTime(100))
    expect(cups()).toBe('still')
  })

  /*
   * The bug this shape of hook exists to avoid.
   *
   * Written as a ref recorded inside an effect, the second of React's paired
   * development renders found the round already recorded, took the early exit,
   * and never replaced the timer the first render's cleanup had just cancelled.
   * The cups then shook for the rest of the game. Re-rendering without changing
   * the round has to leave the beat exactly as long as it was.
   */
  it('is not extended by renders that change nothing', () => {
    const { rerender } = render(<Table round={3} />)
    act(() => rerender(<Table round={4} />))

    act(() => void vi.advanceTimersByTime(400))
    act(() => rerender(<Table round={4} />))
    act(() => rerender(<Table round={4} />))
    expect(cups()).toBe('shaking')

    act(() => void vi.advanceTimersByTime(SHAKE_MS - 400 + 50))
    expect(cups()).toBe('still')
  })

  // Every round in a long game, not just the first one after you opened it.
  it('shakes again on the next round', () => {
    const { rerender } = render(<Table round={3} />)
    act(() => rerender(<Table round={4} />))
    act(() => void vi.advanceTimersByTime(SHAKE_MS + 10))
    expect(cups()).toBe('still')

    act(() => rerender(<Table round={5} />))
    expect(cups()).toBe('shaking')
  })
})
