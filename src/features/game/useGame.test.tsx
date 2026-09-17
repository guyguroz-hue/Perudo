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

vi.mock('./api', () => ({
  placeBid: (...args: unknown[]) => placeBid(...args),
  callBull: (...args: unknown[]) => callBull(...args),
  challenge: (...args: unknown[]) => challenge(...args),
  openRound: vi.fn(),
}))

// The table is read back after every action; none of that is what is under
// test, so it answers empty and immediately.
vi.mock('./read', () => ({
  fetchRound: vi.fn(async () => null),
  fetchPlayers: vi.fn(async () => []),
  fetchRecentMoves: vi.fn(async () => []),
  fetchReveal: vi.fn(async () => null),
  fetchGameStanding: vi.fn(async () => null),
  toTableView: vi.fn(() => null),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: () => ({
      on() {
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
  placeBid.mockReset()
  callBull.mockReset()
  challenge.mockReset()
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
