import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Describes missing configuration, or null when everything is present.
 *
 * This deliberately does NOT throw. Throwing here would happen while the module
 * graph is still loading — before React mounts and before any error boundary
 * exists — so the page would render nothing at all: no message, no retry, just
 * a blank background. A misconfigured deployment has to be able to say so.
 */
export const configError: string | null = describeMissingConfig()

/**
 * Vite inlines `import.meta.env.*` at BUILD time. So these values come from
 * whatever the build environment had, not from the running server — which means
 * changing them on the host requires a rebuild, not a restart.
 */
export const supabaseUrl = url ?? null

// Placeholders keep createClient from throwing when configuration is absent.
// Nothing ever calls through them: every entry point checks `configError` first.
export const supabase = createClient(
  url || 'https://unconfigured.invalid',
  anonKey || 'unconfigured',
)

function describeMissingConfig(): string | null {
  const missing: string[] = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (missing.length === 0) return null

  return (
    `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set in this build. ` +
    `These are read when the site is built, not when it runs, so set them on the ` +
    `host and then trigger a fresh deployment — changing them alone will not ` +
    `affect a build that already happened.`
  )
}
