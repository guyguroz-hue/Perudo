import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AuthContext } from './AuthContext'
import { checkDisplayName } from './displayName'
import { describeAuthError } from './errors'
import type { AuthApi, AuthState, ClaimNameResult, Profile } from './types'

/**
 * Establishes a Supabase session and the player's identity.
 *
 * Anonymous sign-in (DECISIONS D-003): a party game reached through an invite
 * link cannot afford a sign-up step. An anonymous user is a real `auth.users`
 * row, so `auth.uid()` and every RLS policy behave exactly as they would for a
 * registered account — the anonymity is in what we know about the player, not
 * in how the database treats them.
 *
 * Writing to `profiles` directly from the browser is safe and is the one place
 * the client writes at all: the RLS policy restricts the row to
 * `id = auth.uid()`, so a player can only ever name themselves.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'connecting' })
  const [attempt, setAttempt] = useState(0)

  // Guards against a resolved promise writing state after unmount, and against
  // StrictMode's deliberate double-invoke landing two results.
  const liveAttempt = useRef(0)

  useEffect(() => {
    liveAttempt.current += 1
    const thisAttempt = liveAttempt.current
    const isStale = () => liveAttempt.current !== thisAttempt

    async function connect() {
      setState({ status: 'connecting' })
      try {
        const userId = await establishSession()
        if (isStale()) return

        const profile = await loadProfile(userId)
        if (isStale()) return

        setState(
          profile === null
            ? { status: 'unnamed', userId }
            : { status: 'ready', userId, profile },
        )
      } catch (error) {
        if (isStale()) return
        const friendly = describeAuthError(error)
        setState({ status: 'error', message: friendly.message, detail: friendly.detail })
      }
    }

    void connect()

    return () => {
      liveAttempt.current += 1
    }
  }, [attempt])

  // A session can end underneath us — a token revoked, or storage cleared in
  // another tab. Reconnecting is the right response, not showing a dead screen.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAttempt((n) => n + 1)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const claimName = useCallback(
    async (raw: string): Promise<ClaimNameResult> => {
      const check = checkDisplayName(raw)
      if (!check.valid) {
        return { ok: false, message: check.message }
      }
      if (state.status !== 'unnamed' && state.status !== 'ready') {
        return { ok: false, message: 'Still connecting — try again in a moment.' }
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .upsert({ id: state.userId, display_name: check.value })
          .select('id, display_name')
          .single()
        if (error) throw error

        setState({ status: 'ready', userId: state.userId, profile: data as Profile })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: describeAuthError(error).message }
      }
    },
    [state],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const api = useMemo<AuthApi>(() => ({ state, claimName, retry }), [state, claimName, retry])

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

/** Reuse an existing session, or open an anonymous one. Returns the user id. */
async function establishSession(): Promise<string> {
  const { data: existing, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  const currentId = existing.session?.user.id
  if (currentId !== undefined) return currentId

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error

  const newId = data.user?.id
  if (newId === undefined) {
    throw new Error('Anonymous sign-in returned no user')
  }
  return newId
}

/** The player's profile row, or null if they have not named themselves yet. */
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}
