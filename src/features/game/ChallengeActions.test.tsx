// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChallengeActions } from './ChallengeActions'
import { MAX_DICE } from '../../game'
import { bid } from '../../game/testing'

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
