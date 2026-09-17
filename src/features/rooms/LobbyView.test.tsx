// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LobbyView } from './LobbyView'
import { MIN_PLAYERS, SEAT_COUNT } from './types'
import type { Seat } from './types'

afterEach(cleanup)

const sit = (seat: number, name: string, host = false, you = false): Seat => ({
  seat,
  display_name: name,
  is_host: host,
  is_you: you,
  user_id: `u${seat}`,
})

function lobby(overrides: Partial<Parameters<typeof LobbyView>[0]> = {}) {
  const props = {
    code: '4821',
    status: 'lobby' as const,
    seats: [sit(0, 'Dana', true, true)],
    connection: 'live' as const,
    youAreHost: true,
    busy: false,
    error: null,
    onStart: vi.fn(),
    onPlayAgain: vi.fn(),
    onManage: vi.fn(),
    onEnd: vi.fn(),
    onLeave: vi.fn(),
    ...overrides,
  }
  render(<LobbyView {...props} />)
  return props
}

/**
 * The lobby is the screen people sit on the longest, and every mistake it can
 * make is a mistake about somebody else's agency: starting a game short, or
 * offering the host's controls to a guest.
 */
describe('the lobby', () => {
  it('will not start a game that is short of players', async () => {
    const { onStart } = lobby({ seats: [sit(0, 'Dana', true, true)] })

    const start = screen.getByRole('button', { name: 'Start game' })
    expect(start.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(`${MIN_PLAYERS - 1} more player to start`)).toBeTruthy()

    await userEvent.click(start)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('starts once the table is big enough', async () => {
    const { onStart } = lobby({ seats: [sit(0, 'Dana', true, true), sit(1, 'Alice')] })

    expect(screen.queryByText(/more player/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('offers a guest no way to start or end the room', () => {
    lobby({ youAreHost: false, seats: [sit(0, 'Dana', true), sit(1, 'You', false, true)] })

    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End room' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeTruthy()
    expect(screen.getByText('Waiting for the host to start')).toBeTruthy()
  })

  it('lights one pip per player and leaves the rest of the table dark', () => {
    lobby({ seats: [sit(0, 'Dana', true, true), sit(1, 'Alice'), sit(2, 'Carl')] })

    const pips = document.querySelectorAll('.lobby__pip')
    expect(pips.length).toBe(SEAT_COUNT)
    expect(document.querySelectorAll('.lobby__pip--taken').length).toBe(3)
    expect(screen.getByText(/3 \/ 6 players/)).toBeTruthy()
  })

  it('puts the game where the table was, once one is running', () => {
    render(
      <LobbyView
        code="4821"
        status="in_game"
        seats={[sit(0, 'Dana', true, true), sit(1, 'Alice')]}
        connection="live"
        youAreHost
        busy={false}
        error={null}
        onStart={vi.fn()}
        onPlayAgain={vi.fn()}
        onManage={vi.fn()}
        onEnd={vi.fn()}
        onLeave={vi.fn()}
      >
        <p>the game</p>
      </LobbyView>,
    )

    expect(screen.getByText('the game')).toBeTruthy()
    // The invite and the seat count belong to a room nobody has left yet.
    expect(screen.queryByText('4821')).toBeNull()
  })

  /*
   * The lobby's chrome comes down with the lobby.
   *
   * It used to stay up through the game, and every part of it was either
   * useless or already on screen twice: the table carries its own sound switch
   * over the scene and the game its own connection dot, so a running game
   * showed two of each. Asserted by count rather than by absence, because one
   * of each is exactly right and the fault was the second.
   *
   * A test with a stub for a child cannot see the table's own controls, so
   * what it pins is that this component contributes none — which is the half
   * of the arrangement that lives here.
   *
   * The way out of the room went the same way, later and for a different
   * reason. It was the only thing left in the controls row during a game, and a
   * full-width button charges about seventy points for itself on every screen —
   * spent on the one control a player hopes never to press, and spent out of
   * the table, because the table is what gives way when the screen runs short.
   * It is a handle in the corner of the table now, beside the sound switch.
   */
  it('leaves the sound and the connection to the table once a game is running', () => {
    const { container } = render(
      <LobbyView
        code="4821"
        status="in_game"
        seats={[sit(0, 'Dana', true, true), sit(1, 'Alice')]}
        connection="live"
        youAreHost
        busy={false}
        error={null}
        onStart={vi.fn()}
        onPlayAgain={vi.fn()}
        onManage={vi.fn()}
        onEnd={vi.fn()}
        onLeave={vi.fn()}
      >
        <p>the game</p>
      </LobbyView>,
    )

    expect(container.querySelector('.lobby__head')).toBeNull()
    expect(screen.queryByRole('button', { name: /sound/i })).toBeNull()
    expect(container.querySelector('.lobby__controls')).toBeNull()
    /*
     * Not one button of its own. Everything this component would have offered
     * mid-game is on the table, and the height it used to take is the table's.
     */
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  /*
   * And it comes back the moment the game does not need the room.
   *
   * The row is gone while a game is being played, not whenever the lobby is
   * not showing: a finished room is also not the lobby, and Play again lives
   * in that row. Getting this wrong would strand a table with no way to start
   * another game.
   */
  it('keeps its controls once a game has finished', () => {
    lobby({ status: 'finished' })

    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /end room/i })).toBeTruthy()
  })

  it('offers the host another game when one has finished', async () => {
    const { onPlayAgain } = lobby({ status: 'finished' })

    await userEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it('reports a failure without taking the room away', () => {
    lobby({ error: 'That seat was taken.' })

    expect(screen.getByRole('alert').textContent).toBe('That seat was taken.')
    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy()
  })
})
