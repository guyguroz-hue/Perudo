// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChallengeActions } from './ChallengeActions'
import { MAX_DICE } from '../../game'
import { bid } from '../../game/testing'
import { ARM_MS } from './armed'

/**
 * The two ways of doubting, and the one of them that can pay.
 *
 * Burst Lie is the only move in the game that ever hands a die back, and never
 * above five (GAME_RULES §9.3, R-007) — so whether there is anything to win is
 * a fact about the player's own hand, and it changes under them mid-game. It
 * is worth knowing before the press rather than after, and worth pinning,
 * because a prize that quietly stopped appearing looks exactly like a prize
 * that was removed.
 */

afterEach(cleanup)

function show(burst: boolean, ownDiceCount: number) {
  const { container } = render(
    <ChallengeActions
      bid={bid(3, 1, 'alice')}
      burst={burst}
      ownDiceCount={ownDiceCount}
      onLie={vi.fn()}
      onBull={vi.fn()}
    />,
  )
  return container.querySelector('.challenge__prize')?.textContent ?? null
}

describe('what a Burst Lie is worth', () => {
  it('offers the die back to anybody with room for it', () => {
    expect(show(true, 1)).toBe('+1')
    expect(show(true, MAX_DICE - 1)).toBe('+1')
  })

  /*
   * The case that prompted this test. A player holding the maximum has watched
   * the +1 appear all game and then seen it go, which reads as something
   * breaking rather than as a rule — so the slot says what happened instead of
   * emptying.
   */
  it('says the hand is full rather than going quiet at the ceiling', () => {
    expect(show(true, MAX_DICE)).toBe('full')
  })

  // A Lie in turn never pays, whatever anybody is holding.
  it('promises nothing for a Lie made in turn', () => {
    expect(show(false, 1)).toBeNull()
    expect(show(false, MAX_DICE)).toBeNull()
  })

  it('says the same thing to a screen reader as to an eye', () => {
    render(
      <ChallengeActions
        bid={bid(3, 1, 'alice')}
        burst
        ownDiceCount={2}
        onLie={vi.fn()}
        onBull={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /win a die/i })).toBeTruthy()

    cleanup()
    render(
      <ChallengeActions
        bid={bid(3, 1, 'alice')}
        burst
        ownDiceCount={MAX_DICE}
        onLie={vi.fn()}
        onBull={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /win a die/i })).toBeNull()
    expect(screen.getByRole('button', { name: /already holding five/i })).toBeTruthy()
  })
})

/*
 * The beat after a bid lands — after EVERY bid.
 *
 * This is the wiring and not the clock: `armed.ts` has always done the waiting
 * correctly, and it was handed the wrong thing to wait on. The tiles were keyed
 * on whether there was a bid at all, a boolean that goes true once a round and
 * then stays true, so the beat happened on the opening bid and never again —
 * and every bid after it, which is every bid anybody bursts in with, armed them
 * instantly.
 *
 * Reported exactly as it behaved: "I meant to call Lie on that bid, somebody
 * cut in a hundredth of a second before I pressed, and my Lie went against
 * theirs." Every unit test in `armed.test.tsx` passed against it, because none
 * of them could see what this component was passing.
 */
describe('going inert when the claim changes', () => {
  const tiles = () => ({
    lie: document.querySelector('.challenge__lie') as HTMLButtonElement,
    bull: document.querySelector('.challenge__bull') as HTMLButtonElement,
  })

  const table = (claim: ReturnType<typeof bid>) => (
    <ChallengeActions bid={claim} burst ownDiceCount={3} onLie={vi.fn()} onBull={vi.fn()} />
  )

  it('is spent the moment a second bid lands, not only the first', () => {
    vi.useFakeTimers()
    const { rerender } = render(table(bid(3, 5, 'alice')))
    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    expect(tiles().lie.disabled).toBe(false)

    // Somebody cuts in. This is the press that was already on its way.
    rerender(table(bid(4, 5, 'carl')))
    expect(tiles().lie.disabled).toBe(true)
    expect(tiles().bull.disabled).toBe(true)

    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    expect(tiles().lie.disabled).toBe(false)
    vi.useRealTimers()
  })

  /*
   * A Bull is the same accident wearing different clothes: it changes what Lie
   * means, from "fewer than four" to "not exactly four", without the quantity
   * or the face moving at all.
   */
  it('is spent when a Bull re-reads the bid under it', () => {
    vi.useFakeTimers()
    const { rerender } = render(table(bid(4, 5, 'alice')))
    act(() => void vi.advanceTimersByTime(ARM_MS + 1))
    expect(tiles().lie.disabled).toBe(false)

    rerender(table({ ...bid(4, 5, 'alice'), bull: { callerId: 'carl' } }))
    expect(tiles().lie.disabled).toBe(true)
    vi.useRealTimers()
  })
})
