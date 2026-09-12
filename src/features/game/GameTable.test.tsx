// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameTable } from './GameTable'
import type { TableView } from './view'
import { bid, normalRound } from '../../game/testing'

afterEach(cleanup)

const BASE: TableView = {
  round: normalRound(bid(4, 5, 'alice')),
  roundNumber: 3,
  players: [
    { id: 'alice', name: 'Alice', seatIndex: 0, diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
    { id: 'you', name: 'Dana', seatIndex: 1, diceCount: 3, isYou: true, isEliminated: false, hasTurn: true },
    { id: 'carl', name: 'Carl', seatIndex: 2, diceCount: 2, isYou: false, isEliminated: false, hasTurn: false },
  ],
  yourHand: [5, 1, 3],
  lastEvent: 'Alice bid 4 fives',
}

/**
 * The bid on the table, as opposed to the reading each challenge button
 * carries. Both say "at least" or "exactly" on purpose — the bid states the
 * claim, the buttons state what they would do to it.
 */
function theBid(): HTMLElement {
  const el = document.querySelector('.bid')
  if (el === null) throw new Error('no bid on the table')
  return el as HTMLElement
}

function show(view: TableView) {
  const handlers = { onBid: vi.fn(), onLie: vi.fn(), onBull: vi.fn() }
  const result = render(<GameTable view={view} {...handlers} />)
  return { ...result, ...handlers }
}

describe('waiting is a state, not a curtain', () => {
  it('keeps the table and the actions on screen when it is not your turn', () => {
    const waiting: TableView = {
      ...BASE,
      players: BASE.players.map((p) => ({ ...p, hasTurn: p.id === 'alice' })),
    }
    show(waiting)

    // Everything worth looking at is still there — and because a Burst is legal
    // out of turn, so are the actions. They just say what they would be.
    expect(theBid().textContent).toContain('at least')
    expect(screen.getByRole('button', { name: 'Burst bid' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Burst Lie/ })).toBeTruthy()
  })

  // Said once, at your seat. Whose turn it is needs no words under the table.
  it('says plainly when the turn is yours', () => {
    const { container } = show(BASE)
    expect(container.querySelector('.badge--you')?.textContent).toBe('Your turn')
    expect(screen.getByRole('button', { name: 'Bid' })).toBeTruthy()
  })

  /*
   * The move is announced to everyone, including whoever made it.
   *
   * This line used to give way to "so-and-so is thinking" whenever the turn was
   * not yours — and the turn moves the instant you act, so the one person
   * guaranteed never to see a move announced was the person who had just made
   * it. On a Bull that is not a slight but a bug: a Bull leaves every number
   * where it was, so with nothing saying otherwise, calling one is
   * indistinguishable from nothing happening.
   */
  it('says what just happened whoever is to play', () => {
    show(BASE)
    expect(screen.getByText('Alice bid 4 fives')).toBeTruthy()

    cleanup()
    show({
      ...BASE,
      players: BASE.players.map((p) => ({ ...p, hasTurn: p.id === 'alice' })),
      lastEvent: 'Dana called Bull on 4 fives — exactly',
    })
    expect(screen.getByText('Dana called Bull on 4 fives — exactly')).toBeTruthy()
  })
})

describe('a challenge is one press', () => {
  /*
   * Bull and Lie carry no numbers, so they take no building and no confirming.
   * A bid needs a quantity and a face chosen before it means anything, which is
   * why that one has a builder and a button at the end of it; these two are a
   * re-reading of the claim already on the table. One press sends the move.
   *
   * Pinned because "does pressing Bull also need Bid afterwards?" is a fair
   * question to have about a screen with a Bid button on it, and the answer has
   * to stay no.
   */
  it('sends a Bull on the press, and sends nothing else', async () => {
    const { onBull, onBid, onLie } = show(BASE)
    await userEvent.click(screen.getByRole('button', { name: /^Bull/ }))

    expect(onBull).toHaveBeenCalledTimes(1)
    expect(onBid).not.toHaveBeenCalled()
    expect(onLie).not.toHaveBeenCalled()
  })

  it('sends a Lie on the press, and sends nothing else', async () => {
    const { onLie, onBid, onBull } = show(BASE)
    await userEvent.click(screen.getByRole('button', { name: /^Lie/ }))

    expect(onLie).toHaveBeenCalledTimes(1)
    expect(onBid).not.toHaveBeenCalled()
    expect(onBull).not.toHaveBeenCalled()
  })

  // And the builder is not involved: whatever is sitting in it is not what a
  // Bull is about, so touching it changes nothing about the move.
  it('is unaffected by whatever the bid builder is holding', async () => {
    const { onBull, onBid } = show(BASE)
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    await userEvent.click(screen.getByRole('button', { name: /^Bull/ }))

    expect(onBull).toHaveBeenCalledTimes(1)
    expect(onBid).not.toHaveBeenCalled()
  })
})

describe('a Bull on the table', () => {
  // It changes no number at all, so everything that is not a number has to
  // change instead — or it reads as nothing having happened.
  it('signs the claim in the Bull caller’s name, with its own mark', () => {
    const { container } = show({ ...BASE, round: normalRound(bid(4, 5, 'alice', 'carl')) })

    const mark = container.querySelector('.bid__bull')
    expect(mark).toBeTruthy()
    expect(mark?.textContent).toContain('Carl')
    expect(container.querySelector('.bid--bulled')).toBeTruthy()
    expect(theBid().textContent).toContain('exactly')
  })

  it('says nothing of the kind on an ordinary bid', () => {
    const { container } = show(BASE)
    expect(container.querySelector('.bid__bull')).toBeNull()
    expect(container.querySelector('.bid--bulled')).toBeNull()
  })

  // A second Bull is refused by the server (R-010), so it is not offered. A
  // control that can only come back as an error is a bad way to learn a rule.
  it('spends the Bull button once the bid has been Bulled', () => {
    show({ ...BASE, round: normalRound(bid(4, 5, 'alice', 'carl')) })
    const spent = screen.getByRole('button', { name: /already been called/ })
    expect(spent.hasAttribute('disabled')).toBe(true)
    // Lie is still on the table: a Bulled claim can be doubted like any other.
    expect(screen.getByRole('button', { name: /Lie/ })).toBeTruthy()
  })
})

describe('what the screen is allowed to know', () => {
  // The strongest claim this component makes. Other players' dice are not in
  // the markup face down — they are not in the component's props at all, so it
  // could not render them if it tried.
  it('shows your dice and no one else’s', () => {
    const { container } = show(BASE)
    const faces = [...container.querySelectorAll('.board__hand .die')]
    expect(faces).toHaveLength(3)
    // Everyone else is a cup and a row of blanks in their colour.
    const counts = [...container.querySelectorAll('.badge__dice .die')]
    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every((die) => die.classList.contains('die--hidden'))).toBe(true)
  })

  it('offers no actions to a player who is out', () => {
    show({
      ...BASE,
      yourHand: null,
      players: BASE.players.map((p) =>
        p.isYou ? { ...p, diceCount: 0, isEliminated: true, hasTurn: false } : p,
      ),
    })
    expect(screen.getByText('You are out. Watching.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Bid|Lie|Bull/ })).toBeNull()
  })
})

describe('the bid on the table', () => {
  it('reads a plain bid as "at least"', () => {
    show(BASE)
    expect(theBid().textContent).toContain('at least')
  })

  // A Bull does not replace the bid. It changes how the same numbers are read.
  it('reads a Bulled bid as "exactly", on the same numbers', () => {
    show({ ...BASE, round: normalRound(bid(4, 5, 'alice', 'carl')) })
    expect(theBid().textContent).toContain('exactly')
    // The Bull caller replaces the bidder's name: once Bulled, the claim on the
    // table is theirs (GAME_RULES §8.3).
    expect(within(theBid()).getByText(/Bull · Carl/)).toBeTruthy()
  })

  it('marks a Farewell Round', () => {
    show({ ...BASE, round: { type: 'farewell', lockedFace: 5, bid: null } })
    expect(screen.getByText('Farewell')).toBeTruthy()
  })
})
