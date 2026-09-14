// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Talking to the game server, and what happens when it does not talk back.
 *
 * The refusals are covered where they are worded. This is about the other
 * failure — the one where nothing comes back at all — because every call here
 * is awaited by something that has already taken the controls away. A bid
 * leaves the console disabled; a challenge leaves the cups in the air with no
 * dock underneath. Without a limit, a request made as a phone loses signal
 * hangs until the socket is reclaimed, and the game is simply over with
 * nothing on screen admitting it.
 */

const invoke = vi.fn()
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

afterEach(() => {
  vi.useRealTimers()
  invoke.mockReset()
})

async function api() {
  return import('./api')
}

describe('a server that never answers', () => {
  it('gives up rather than leaving the table frozen', async () => {
    vi.useFakeTimers()
    // A request that never settles, which is exactly what a dropped connection
    // looks like from here — not an error, just silence.
    invoke.mockImplementation(
      (_name: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason))
        }),
    )

    const { callBull } = await api()
    const pending = callBull('game-1').then(
      () => 'resolved',
      (error: Error & { code?: string; stale?: boolean }) => error,
    )

    await vi.advanceTimersByTimeAsync(12_000)
    const outcome = await pending

    expect(outcome).not.toBe('resolved')
    expect((outcome as { code?: string }).code).toBe('TIMED_OUT')
    // Not stale: stale means the table moved and looking again is the answer.
    // Here nothing is known to have happened at all.
    expect((outcome as { stale?: boolean }).stale).toBe(false)
    expect((outcome as Error).message).toMatch(/did not answer/i)
  })

  it('waits long enough that a slow but working answer still lands', async () => {
    vi.useFakeTimers()
    invoke.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 9_000)),
    )

    const { callBull } = await api()
    const pending = callBull('game-1').then(() => 'resolved')
    await vi.advanceTimersByTimeAsync(9_000)
    expect(await pending).toBe('resolved')
  })

  /*
   * A pending timer per move would keep a phone's timer queue awake for no
   * reason, and this is a game people leave open on a table for an hour.
   */
  it('drops its timer as soon as the answer lands', async () => {
    vi.useFakeTimers()
    invoke.mockResolvedValue({ data: { roundId: 'r1' }, error: null })

    const { openRound } = await api()
    expect(await openRound('game-1')).toBe('r1')
    expect(vi.getTimerCount()).toBe(0)
  })

  // A refusal is a different thing from silence and has to keep its own code,
  // or every rule the server enforces arrives as a network problem.
  it('leaves an actual refusal alone', async () => {
    invoke.mockResolvedValue({ data: null, error: { error: 'ILLEGAL_BID', message: 'nope' } })

    const { placeBid } = await api()
    const failed = await placeBid('game-1', 3, 5).catch((error: { code?: string }) => error)
    expect((failed as { code?: string }).code).toBe('ILLEGAL_BID')
  })
})
