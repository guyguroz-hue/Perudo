/**
 * A player's public identity. Mirrors the `profiles` row the client is allowed
 * to read.
 *
 * Hand-written for now; replace with Supabase generated types once the schema
 * is applied to the live project (TODO T-18).
 */
export interface Profile {
  readonly id: string
  readonly display_name: string
}

export type AuthState =
  /** Establishing a session. Anonymous sign-in happens here (DECISIONS D-003). */
  | { readonly status: 'connecting' }
  /** Signed in, but no profile row yet — the player has not chosen a name. */
  | { readonly status: 'unnamed'; readonly userId: string }
  | { readonly status: 'ready'; readonly userId: string; readonly profile: Profile }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null }

export type ClaimNameResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export interface AuthApi {
  readonly state: AuthState
  /** Create or rename this player's profile. */
  claimName: (name: string) => Promise<ClaimNameResult>
  /** Retry after an error state. */
  retry: () => void
}
