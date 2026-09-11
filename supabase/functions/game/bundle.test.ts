import { describe, expect, it } from 'vitest'
import { buildBundle, readBundle } from '../../../scripts/bundle-function.mjs'

/**
 * The committed bundle is what gets pasted into the dashboard, and it is the
 * only artefact in this repository that can silently disagree with its own
 * source. Editing an action and forgetting to rebuild would leave a live game
 * running last week's rules while the tests cover this week's.
 */
describe('the pasteable bundle', () => {
  it('matches its sources', async () => {
    expect(await readBundle()).toBe(await buildBundle())
  })
})
