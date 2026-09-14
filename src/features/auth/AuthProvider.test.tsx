// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Getting in, and what happens when the door never opens.
 *
 * This is the worst place in the product to hang, because everything else is
 * behind it: a request that never settles leaves "Finding you a seat…" on
 * screen with a rolling die for reassurance and nothing to press. The app
 * simply never opens, and reloading is something a player has to think of on
 * their own.
 */

const getSession = vi.fn()
const signInAnonymously = vi.fn()
const maybeSingle = vi.fn()

vi.mock('../../lib/supabaseClient', () => ({
  configError: null,
  supabase: {
    auth: {
      getSession: () => getSession(),
      signInAnonymously: () => signInAnonymously(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
  },
}))

const { AuthProvider } = await import('./AuthProvider')
const { useAuth } = await import('./useAuth')

function Screen() {
  const { state, retry } = useAuth()
  return (
    <>
      <p>status: {state.status}</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </>
  )
}

beforeEach(() => {
  getSession.mockReset()
  signInAnonymously.mockReset()
  maybeSingle.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('opening the app', () => {
  it('gets a player in when the server answers', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    maybeSingle.mockResolvedValue({ data: { id: 'u1', display_name: 'Dana' }, error: null })

    render(
      <AuthProvider>
        <Screen />
      </AuthProvider>,
    )
    await act(async () => {})
    expect(screen.getByText('status: ready')).toBeTruthy()
  })

  it('gives up rather than waiting for ever', async () => {
    vi.useFakeTimers()
    // Never settles, which is what a dropped connection looks like from here.
    getSession.mockImplementation(() => new Promise(() => {}))

    render(
      <AuthProvider>
        <Screen />
      </AuthProvider>,
    )
    expect(screen.getByText('status: connecting')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // An error screen, which is the one that has a way out on it.
    expect(screen.getByText('status: error')).toBeTruthy()
  })

  it('waits long enough for a cold project to sign somebody up', async () => {
    vi.useFakeTimers()
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: { user: { id: 'u2' } }, error: null }), 9_000),
        ),
    )
    maybeSingle.mockResolvedValue({ data: null, error: null })

    render(
      <AuthProvider>
        <Screen />
      </AuthProvider>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    // No profile yet, so they are asked for a name rather than turned away.
    expect(screen.getByText('status: unnamed')).toBeTruthy()
  })
})
