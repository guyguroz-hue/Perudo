/**
 * Bundles the game Edge Function into one pasteable file.
 *
 * The function is written as several modules that import the engine straight
 * out of `src/game`, which is what keeps one set of rules from becoming two.
 * Deno cannot follow those imports — no extensions, and a bare package
 * specifier for the Supabase client — and the Supabase dashboard editor takes
 * one file. So this flattens it.
 *
 * The output is committed. It is generated, but it is also the artefact that
 * actually runs, and a reviewer should be able to read what was deployed
 * without running a build to find out.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rolldown } from 'rolldown'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const BUNDLE_PATH = join(ROOT, 'supabase/functions/game/bundle.ts')

const CLIENT = '@supabase/supabase-js'
// Pinned. A function that silently followed a major version would be a
// different program from the one that was reviewed.
const DENO_CLIENT = 'npm:@supabase/supabase-js@2.116.0'

const HEADER = `// =============================================================================
// GENERATED — do not edit.
//
// Built from supabase/functions/game/ by \`npm run bundle:function\`. Edit the
// sources there and regenerate; edits made here are lost on the next build and,
// worse, would be a second copy of rules that are supposed to exist once.
//
// This is the file to paste into the Supabase dashboard:
//   Edge Functions -> Deploy a new function -> Via Editor -> name it \`game\`
// =============================================================================

`

export async function buildBundle() {
  const bundle = await rolldown({
    input: join(ROOT, 'supabase/functions/game/index.ts'),
    external: [CLIENT],
    platform: 'neutral',
    // The bundle is read by a person before it is pasted, so it is not minified
    // and the reasoning in the sources survives into it.
    logLevel: 'silent',
  })

  const { output } = await bundle.generate({ format: 'esm' })
  const chunk = output.find((part) => part.type === 'chunk')
  if (chunk === undefined) throw new Error('rolldown produced no chunk')

  const replaced = chunk.code.replaceAll(`"${CLIENT}"`, `"${DENO_CLIENT}"`)
  if (replaced === chunk.code) {
    throw new Error(
      `The bundle does not import ${CLIENT}, so the rewrite to a Deno specifier ` +
        `did nothing. Something about the import shape changed.`,
    )
  }

  return HEADER + replaced
}

export async function readBundle() {
  return readFile(BUNDLE_PATH, 'utf8')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await buildBundle()
  await writeFile(BUNDLE_PATH, code)
  console.log(`supabase/functions/game/bundle.ts  ${Math.round(code.length / 1024)} KB`)
}
