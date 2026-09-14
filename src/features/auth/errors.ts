/**
 * Turn a Supabase or network failure into something a player can act on.
 *
 * Raw messages leak implementation detail and rarely tell a player what to do
 * (PART 54), but they are worth keeping alongside for the console.
 */
export interface FriendlyError {
  readonly message: string
  readonly detail: string | null
}

export function describeAuthError(error: unknown): FriendlyError {
  const detail = error instanceof Error ? error.message : String(error)
  const lower = detail.toLowerCase()

  // The most likely first-run failure by some margin: the project has not had
  // anonymous sign-ins switched on.
  if (lower.includes('anonymous') && lower.includes('disabled')) {
    return {
      message:
        'This game signs you in anonymously, but that is switched off for the ' +
        'project. Enable anonymous sign-ins in the Supabase dashboard under ' +
        'Authentication → Sign In / Providers.',
      detail,
    }
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return { message: 'Could not reach the server. Check your connection.', detail }
  }

  // The deadline in AuthProvider, rather than anything the server said. It
  // looks identical to a dead connection from here and wants the same sentence,
  // because the thing to do about it is the same: press the button again.
  if (lower.includes('took too long')) {
    return { message: 'The server did not answer. Check your connection.', detail }
  }

  if (lower.includes('rate') && lower.includes('limit')) {
    return { message: 'Too many attempts just now. Wait a moment and try again.', detail }
  }

  // A missing table means the migrations have not been applied yet.
  if (lower.includes('relation') && lower.includes('does not exist')) {
    return {
      message: 'The game database is not set up yet.',
      detail: `${detail} — apply supabase/migrations/ to the project.`,
    }
  }

  return { message: 'Something went wrong signing you in.', detail }
}
