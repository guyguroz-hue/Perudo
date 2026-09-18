// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * One action at a time, however fast the thumb.
 *
 * This exists for a fault reported from a real table: "lots of double presses
 * that did not count, and presses that did nothing". The cause was that `busy`
 * — the thing that disables every control — is React state, so it reaches the
 * DOM on the next render, and a double tap is two events in the same frame.
 * Both got through.
 *
 * And the second was worse than a wasted request. Both carried the same round
 * version, so the server applied the first and refused the second on the
 * optimistic-concurrency check, which the client words as "Somebody got there
 * first. Have another look." A player was told they had been beaten to a move
 * by their own second tap, at a table where nobody else had done anything.
 *
 * So the guard is a ref, read and written before anything is awaited, and
 * these hold it: two presses in one tick send one request, and the player is
 * told nothing about the press that was dropped, because their move is already
 * on its way and there is nothing honest to say about a duplicate.
 */

const placeBid = vi.fn()
const callBull = vi.fn()
const challenge = vi.fn()
const fetchOwnHand = vi.fn<(...args: unknown[]) => Promise<readonly number[] | null>>()

vi.mock('./api', () => ({
  placeBid: (...args: unknown[]) => placeBid(...args),
  callBull: (...args: unknown[]) => callBull(...args),
  challenge: (...args: unknown[]) => challenge(...args),
  openRound: vi.fn(),
  fetchOwnHand: (...args: unknown[]) => fetchOwnHand(...args),
}))

// The table is read back after every action; none of that is what is under
// test, so it answers empty and immediately.
vi.mock('./read', () => ({
  fetchRound: vi.fn(async () => null),
  fetchPlayers: vi.fn(async () => []),
  fetchRecentEvents: vi.fn(async () => []),
  movesFromEvents: vi.fn(() => []),
  fetchReveal: vi.fn(async () => null),
  fetchGameStanding: vi.fn(async () => null),
  toTableView: vi.fn(() => null),
}))

/*
 * The channel, with its handlers kept where a test can pull them.
 *
 * Realtime is a notification channel: what matters here is not that it
 * delivers, but what this hook does when it delivers several things at once.
 */
const listeners: (() => void)[] = []

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: () => ({
      on(_event: string, _filter: unknown, handler: () => void) {
        listeners.push(handler)
        return this
      },
      subscribe() {
        return this
      },
    }),
    removeChannel: vi.fn(),
  },
}))

const { useGame } = await import('./useGame')

/** A call that does not answer until the test says so. */
function held() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

beforeEach(() => {
  listeners.length = 0
  placeBid.mockReset()
  callBull.mockReset()
  challenge.mockReset()
  fetchOwnHand.mockReset()
  fetchOwnHand.mockResolvedValue(null)
})
afterEach(cleanup)

describe('sending one action', () => {
  it('sends one request for two presses in the same tick', async () => {
    const gate = held()
    placeBid.mockReturnValue(gate.promise)

    const { result } = renderHook(() => useGame('g1', 'u1'))

    // Both in one act(), which is what a double tap is: two handlers running
    // before React has re-rendered anything.
    act(() => {
      void result.current.bid({ quantity: 2, face: 3 })
      void result.current.bid({ quantity: 2, face: 3 })
    })

    expect(placeBid).toHaveBeenCalledTimes(1)
    await act(async () => {
      gate.release()
      await gate.promise
    })
  })

  it('says nothing about the press it dropped', async () => {
    const gate = held()
    callBull.mockReturnValue(gate.promise)

    const { result } = renderHook(() => useGame('g1', 'u1'))
    act(() => {
      void result.current.bull()
      void result.current.bull()
    })

    // Not "somebody got there first": nobody did, and the player's own move is
    // already in flight.
    expect(result.current.error).toBeNull()
    await act(async () => {
      gate.release()
      await gate.promise
    })
  })

  it('will not start a second action while one is in flight', async () => {
    const gate = held()
    placeBid.mockReturnValue(gate.promise)

    const { result } = renderHook(() => useGame('g1', 'u1'))
    act(() => {
      void result.current.bid({ quantity: 2, face: 3 })
    })
    // A different control, pressed while the first is still going.
    act(() => {
      void result.current.bull()
    })

    expect(callBull).not.toHaveBeenCalled()
    await act(async () => {
      gate.release()
      await gate.promise
    })
  })

  it('names the action in flight, so its own button can say so', async () => {
    const gate = held()
    callBull.mockReturnValue(gate.promise)

    const { result } = renderHook(() => useGame('g1', 'u1'))
    act(() => {
      void result.current.bull()
    })

    expect(result.current.pending).toBe('bull')
    await act(async () => {
      gate.release()
      await gate.promise
    })
    await waitFor(() => expect(result.current.pending).toBeNull())
  })

  it('lets the next action through once the first has answered', async () => {
    placeBid.mockResolvedValue(undefined)
    callBull.mockResolvedValue(undefined)

    const { result } = renderHook(() => useGame('g1', 'u1'))
    await act(async () => {
      await result.current.bid({ quantity: 2, face: 3 })
    })
    await act(async () => {
      await result.current.bull()
    })

    expect(placeBid).toHaveBeenCalledTimes(1)
    expect(callBull).toHaveBeenCalledTimes(1)
  })

  /*
   * The challenge has its own path, and the worst failure of the three: two in
   * one frame would open the reveal, claim the round, and have the second
   * refused with the cups already off the table.
   */
  it('opens one reveal for two doubts in the same tick', async () => {
    const gate = held()
    challenge.mockReturnValue(gate.promise)

    const { result } = renderHook(() => useGame('g1', 'u1'))
    act(() => {
      void result.current.doubt()
      void result.current.doubt()
    })

    expect(challenge).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    await act(async () => {
      gate.release()
      await gate.promise
    })
  })
})

/*
 * How often the table re-reads itself.
 *
 * One move writes to more than one table — a resolution touches `rounds`, a
 * `game_players` row per player who paid, and `games` when somebody is knocked
 * out — and each arrives as its own Realtime event. Each used to fire its own
 * re-read, five queries apiece, eight or nine inside a second, on a phone, at
 * the moment the table is trying to animate a reveal. Only the last was ever
 * drawn; the rest were heat.
 */
describe('re-reading the table', () => {
  it('turns a burst of row changes into one re-read', async () => {
    vi.useFakeTimers()
    const { fetchRound } = await import('./read')
    const reads = vi.mocked(fetchRound)
    reads.mockClear()

    renderHook(() => useGame('g1', 'u1'))
    // The first read happens on mount; this is about what the channel does.
    await act(async () => {
      await Promise.resolve()
    })
    reads.mockClear()

    // Everything one resolution writes, as separate events in one tick.
    act(() => {
      for (const fire of listeners) fire()
      for (const fire of listeners) fire()
    })
    expect(reads).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })
    expect(reads).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  /*
   * And the floor under Realtime.
   *
   * The failure that costs most is the quiet one: the socket stays up, the dot
   * reads live, and the events stop. Every other break announces itself.
   */
  it('re-reads on its own even when nothing tells it to', async () => {
    vi.useFakeTimers()
    const { fetchRound } = await import('./read')
    const reads = vi.mocked(fetchRound)

    renderHook(() => useGame('g1', 'u1'))
    await act(async () => {
      await Promise.resolve()
    })
    reads.mockClear()

    await act(async () => {
      vi.advanceTimersByTime(16_000)
      await Promise.resolve()
    })
    expect(reads).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

/*
 * A re-read that found nothing does not count as news.
 *
 * Every re-read builds the table from scratch, so it comes back as new objects
 * whether or not anything happened — and most re-reads are exactly that: the
 * heartbeat, the echo of your own move, the three events one resolution emits.
 * Handed downstream a new object *is* news: it rebuilds every cup in the 3D
 * scene, re-runs every memo on the table, and re-fires the payment that throws
 * dice off it. That last one is a die flying off the table twice, mid-reveal,
 * which is what a player sees as the game stuttering for no reason.
 */
describe('holding the table still', () => {
  it('hands back the same view when nothing has changed', async () => {
    const read = await import('./read')
    // A fresh object each time, exactly as a real re-read produces.
    vi.mocked(read.toTableView).mockImplementation(
      () => ({ roundNumber: 1, players: [{ id: 'a' }] }) as never,
    )

    const { result } = renderHook(() => useGame('g1', 'u1'))
    await waitFor(() => expect(result.current.view).not.toBeNull())
    const first = result.current.view

    act(() => {
      for (const fire of listeners) fire()
    })
    await act(async () => {
      await new Promise((settle) => setTimeout(settle, 250))
    })

    expect(result.current.view).toBe(first)
  })

  it('but does replace it the moment something is different', async () => {
    const read = await import('./read')
    let round = 1
    vi.mocked(read.toTableView).mockImplementation(
      () => ({ roundNumber: round, players: [{ id: 'a' }] }) as never,
    )

    const { result } = renderHook(() => useGame('g1', 'u1'))
    await waitFor(() => expect(result.current.view).not.toBeNull())
    const first = result.current.view

    round = 2
    act(() => {
      for (const fire of listeners) fire()
    })
    await waitFor(() => expect(result.current.view).not.toBe(first))
  })
})

/*
 * What a re-read actually costs.
 *
 * Every event on the table causes one, and every one of them used to fetch the
 * player's own dice again — a whole extra round trip, and one that cannot even
 * begin until the round has come back, because it is keyed on the round's id.
 * So the common case, somebody bid and the round is the one it already was,
 * spent two waves end to end where one would do. On a phone that is most of the
 * delay between a player pressing and everybody else seeing it.
 *
 * Dice are dealt once per round and nothing touches them inside it.
 */
describe('what a re-read asks for', () => {
  it('asks for the dice once per round, not once per event', async () => {
    const read = await import('./read')
    vi.mocked(read.fetchRound).mockResolvedValue({ id: 'r1' } as never)
    vi.mocked(read.toTableView).mockImplementation(() => ({ roundNumber: 1 }) as never)
    fetchOwnHand.mockResolvedValue([1, 2, 3])
    fetchOwnHand.mockClear()

    const { result } = renderHook(() => useGame('g1', 'u1'))
    await waitFor(() => expect(result.current.view).not.toBeNull())
    expect(fetchOwnHand).toHaveBeenCalledTimes(1)

    // Three more events in the same round: a bid, a Bull, the heartbeat.
    for (let event = 0; event < 3; event += 1) {
      act(() => {
        for (const fire of listeners) fire()
      })
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 220))
      })
    }
    expect(fetchOwnHand).toHaveBeenCalledTimes(1)
  })

  it('but asks again the moment a new round is dealt', async () => {
    const read = await import('./read')
    let round = 'r1'
    vi.mocked(read.fetchRound).mockImplementation(async () => ({ id: round }) as never)
    vi.mocked(read.toTableView).mockImplementation(() => ({ roundNumber: 1 }) as never)
    fetchOwnHand.mockResolvedValue([1, 2, 3])
    fetchOwnHand.mockClear()

    const { result } = renderHook(() => useGame('g1', 'u1'))
    await waitFor(() => expect(result.current.view).not.toBeNull())
    expect(fetchOwnHand).toHaveBeenCalledTimes(1)

    round = 'r2'
    act(() => {
      for (const fire of listeners) fire()
    })
    await waitFor(() => expect(fetchOwnHand).toHaveBeenCalledTimes(2))
  })
})

/*
 * How deep a re-read is, not just how wide.
 *
 * A re-read happens on every event, for every player at the table, so the
 * number of round trips it takes end to end is the delay between one person
 * pressing and everybody else seeing it. The log used to wait for the players,
 * because the function that fetched it also turned "bid" into "Alice bid 4
 * fives" and needed their names to do that — a formatting dependency that cost
 * a whole wave of network.
 */
describe('how many round trips a re-read takes', () => {
  it('asks for everything at once', async () => {
    const read = await import('./read')
    const order: string[] = []
    let releasePlayers: () => void = () => {}
    const playersHeld = new Promise<never[]>((resolve) => {
      releasePlayers = () => resolve([])
    })

    vi.mocked(read.fetchPlayers).mockReturnValue(playersHeld as never)
    vi.mocked(read.fetchRecentEvents).mockImplementation(async () => {
      order.push('events')
      return []
    })
    vi.mocked(read.toTableView).mockImplementation(() => ({ roundNumber: 1 }) as never)

    renderHook(() => useGame('g1', 'u1'))
    await act(async () => {
      await Promise.resolve()
    })

    // The players have not answered yet, and the log has already been asked
    // for. Before, it could not even have been sent.
    expect(order).toContain('events')
    releasePlayers()
  })
})
