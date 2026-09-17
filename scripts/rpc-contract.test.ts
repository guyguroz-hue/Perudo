import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The names the server calls a function by, and the names the function has.
 *
 * PostgREST does not resolve an RPC by position. It takes the keys of the JSON
 * body, looks for a function of that name whose parameters are exactly those,
 * and reports "could not find the function in the schema cache" when they do
 * not line up — which reaches a player as "Something broke at our end" and
 * sends whoever reads it looking for a bug in the game.
 *
 * That has happened twice. Once when `apply_bid` was declared with smallint
 * parameters, which the body's numbers would not resolve to, and every bid in
 * the live game failed. Once when `apply_bull` was simply not in the database
 * at all, and every Bull failed for four days while the code that called it was
 * read and re-read and found correct each time.
 *
 * Neither is visible from either side alone: the TypeScript is right about the
 * names it sends, the SQL is right about the names it declares, and the fault
 * is only in the space between them. So this reads both files and compares.
 *
 * It cannot see the live database — a project whose migrations were applied by
 * hand can differ from these files, and that is what `supabase/DIAGNOSE.sql` is
 * for. What it can do is guarantee that the two halves of this repository agree,
 * so that running the migrations as written produces a database the server can
 * actually talk to.
 */

const ROOT = join(new URL('.', import.meta.url).pathname, '..')
const STORE = join(ROOT, 'supabase/functions/game/store.ts')
const MIGRATIONS = join(ROOT, 'supabase/migrations')

/** Every `rpc('name', { p_x: …, p_y: … })` in the store, as name → keys. */
function callsFromStore(): Map<string, string[]> {
  const source = readFileSync(STORE, 'utf8')
  const calls = new Map<string, string[]>()
  const pattern = /rpc\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g
  for (const [, name, body] of source.matchAll(pattern)) {
    calls.set(name, [...body.matchAll(/^\s*(p_[a-z_]+)\s*:/gm)].map((m) => m[1]).sort())
  }
  return calls
}

/**
 * Every `create function public.name(...)` across the migrations, as
 * name → parameter names, with later files winning.
 *
 * Later wins because that is what running them in order does: a migration that
 * redeclares a function replaces it, and the last declaration is the one the
 * database ends up holding.
 */
function declaredInSql(): Map<string, string[]> {
  const declared = new Map<string, string[]>()
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue
    // Line comments first: one sits between two parameters of apply_challenge,
    // and a comma followed by a sentence is not a parameter declaration.
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--[^\n]*/g, '')
    const pattern = /create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(([^)]*)\)/gi
    for (const [, name, params] of sql.matchAll(pattern)) {
      declared.set(
        name,
        [...params.matchAll(/(?:^|,)\s*(p_[a-z_]+)\s+/g)].map((m) => m[1]).sort(),
      )
    }
  }
  return declared
}

describe('what the server calls, and what the database declares', () => {
  const calls = callsFromStore()
  const declared = declaredInSql()

  it('finds the calls it is meant to be checking', () => {
    // A regex that silently matches nothing would make every case below pass.
    expect([...calls.keys()].sort()).toEqual(
      ['apply_bid', 'apply_bull', 'count_face', 'deal_round'].sort(),
    )
    expect(declared.get('apply_bull')).toBeDefined()
  })

  it.each([...calls.keys()])('%s exists in the migrations', (name) => {
    expect(declared.has(name)).toBe(true)
  })

  it.each([...calls.entries()])('%s is called by the names it declares', (name, keys) => {
    expect(declared.get(name)).toEqual(keys)
  })

  /*
   * `apply_challenge` is handed its arguments already shaped, so the object
   * literal above cannot see them. Its keys are the fields of `ChallengeWrite`,
   * which is the same contract written in the type system.
   */
  it('apply_challenge is called by the names it declares', () => {
    const source = readFileSync(STORE, 'utf8')
    const shape = /interface ChallengeWrite \{([\s\S]*?)\n\}/.exec(source)
    expect(shape).not.toBeNull()
    const keys = [...(shape as RegExpExecArray)[1].matchAll(/^\s*(?:readonly\s+)?(p_[a-z_]+)\s*:/gm)]
      .map((m) => m[1])
      .sort()
    expect(keys.length).toBeGreaterThan(0)
    expect(declared.get('apply_challenge')).toEqual(keys)
  })
})
