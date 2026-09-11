/**
 * The one thing this function needs from outside itself.
 *
 * Written as an ordinary package import so the source typechecks against the
 * same client the browser uses. `npm run bundle:function` rewrites it to the
 * `npm:` specifier Deno wants, and that rewrite is the only difference between
 * what is in the repository and what runs.
 */
export { createClient } from '@supabase/supabase-js'
export type { SupabaseClient } from '@supabase/supabase-js'
