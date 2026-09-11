// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameTable } from './GameTable'
import type { TableView } from './view'
import { bid, normalRound } from '../../game/testing'

afterEach(cleanup)

const BASE: TableView = {
  round: normalRound(bid(4, 5, 'alice')),
  roundNumber: 3,
  players: [
    { id: 'alice', name: 'Alice', diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
    { id: 'you', name: 'Dana', diceCount: 3, isYou: true, isEliminated: false, hasTurn: true },
    { id: 'carl', name: 'Carl', diceCount: 2, isYou: false, isEliminated: false, hasTurn: false },
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
  const el = document.querySelector('.table__bid')
  if (el === null) throw new Error('no bid on the table')
  return el as HTMLElement
}

function show(view: TableView) {
  const handlers = { onBid: vi.fn(), onDudo: vi.fn(), onBull: vi.fn() }
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

    expect(screen.getByText('Alice is thinking')).toBeTruthy()
    // Everything worth looking at is still there — and because a Burst is legal
    // out of turn, so are the actions. They just say what they would be.
    expect(theBid().textContent).toContain('at least')
    expect(screen.getByRole('button', { name: 'Burst bid' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Burst Dudo/ })).toBeTruthy()
  })

  it('says plainly when the turn is yours', () => {
    show(BASE)
    expect(screen.getByText('Your turn')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bid' })).toBeTruthy()
  })
})

describe('what the screen is allowed to know', () => {
  // The strongest claim this component makes. Other players' dice are not in
  // the markup face down — they are not in the component's props at all, so it
  // could not render them if it tried.
  it('shows your dice and no one else’s', () => {
    const { container } = show(BASE)
    const faces = [...container.querySelectorAll('.table__hand .die')]
    expect(faces).toHaveLength(3)
    // Everyone else is drawn as hidden dice only.
    const cups = [...container.querySelectorAll('.table__cups .die')]
    expect(cups.length).toBeGreaterThan(0)
    expect(cups.every((die) => die.classList.contains('die--hidden'))).toBe(true)
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
    expect(screen.queryByRole('button', { name: /Bid|Dudo|Bull/ })).toBeNull()
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
    expect(within(theBid()).getByText(/Bull by Carl/)).toBeTruthy()
  })

  it('warns that ones are not wild in a Farewell Round', () => {
    show({ ...BASE, round: { type: 'farewell', lockedFace: 5, bid: null } })
    expect(screen.getByText(/ones are not wild/)).toBeTruthy()
  })
})
