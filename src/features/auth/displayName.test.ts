import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX, checkDisplayName } from './displayName'

describe('display names', () => {
  it('accepts an ordinary name and returns it trimmed', () => {
    expect(checkDisplayName('  Guy  ')).toEqual({ valid: true, value: 'Guy' })
  })

  it('rejects an empty name', () => {
    const result = checkDisplayName('')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('EMPTY')
  })

  it('rejects whitespace alone, matching the database constraint on btrim', () => {
    const result = checkDisplayName('     ')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('EMPTY')
  })

  it('accepts a name at exactly the limit', () => {
    expect(checkDisplayName('x'.repeat(DISPLAY_NAME_MAX)).valid).toBe(true)
  })

  it('rejects a name one character past the limit', () => {
    const result = checkDisplayName('x'.repeat(DISPLAY_NAME_MAX + 1))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('TOO_LONG')
  })

  it('measures the trimmed length, so surrounding space does not push it over', () => {
    expect(checkDisplayName(`  ${'x'.repeat(DISPLAY_NAME_MAX)}  `).valid).toBe(true)
  })

  it('counts a name of non-ASCII characters by its own length', () => {
    expect(checkDisplayName('גיא').valid).toBe(true)
  })
})

/**
 * What a name is not allowed to do to the sentence around it.
 *
 * Names are rendered by this game as prose — "Alice bid 4 fives", "Carl called
 * Lie" — and who said what is most of what a player is reasoning about. A
 * character that reaches out of the badge and reorders the line it is sitting
 * in is a way to cheat, not a way to be rude.
 */
describe('a name that tries to rewrite the table', () => {
  it('drops a right-to-left override', () => {
    // U+202E reverses everything after it until it is popped: in the move log
    // that runs past the end of the name and into the move.
    expect(checkDisplayName('Alice\u202E')).toEqual({ valid: true, value: 'Alice' })
  })

  it('drops isolates and zero-width characters', () => {
    for (const sneaky of ['\u2066', '\u2069', '\u200b', '\u200e', '\uFEFF']) {
      expect(checkDisplayName(`Da${sneaky}na`)).toEqual({ valid: true, value: 'Dana' })
    }
  })

  /*
   * Two players whose names read identically and compare differently is the
   * same trick without the punctuation.
   */
  it('leaves no way to hold a name that only looks like somebody else\u2019s', () => {
    expect(checkDisplayName('Dana')).toEqual(checkDisplayName('Dana\u200b'))
  })

  it('drops control characters, including ones smuggled mid-name', () => {
    expect(checkDisplayName('Bo\u0000b')).toEqual({ valid: true, value: 'Bob' })
    expect(checkDisplayName('line\nbreak')).toEqual({ valid: true, value: 'line break' })
  })

  it('refuses a name made of nothing else', () => {
    const check = checkDisplayName('\u202E\u200b\u2066')
    expect(check.valid).toBe(false)
    if (!check.valid) expect(check.reason).toBe('EMPTY')
  })

  // Hebrew and Arabic carry their own direction. An override is a separate
  // thing that exists to lie about it, and this game is played in Hebrew.
  it('leaves ordinary right-to-left text alone', () => {
    expect(checkDisplayName('\u05d2\u05d9\u05d0 \u05d2\u05d5\u05e8\u05d5\u05d6')).toEqual({
      valid: true,
      value: '\u05d2\u05d9\u05d0 \u05d2\u05d5\u05e8\u05d5\u05d6',
    })
  })

  it('reads a name as one name however it was spaced', () => {
    expect(checkDisplayName('Dana   Levy')).toEqual({ valid: true, value: 'Dana Levy' })
  })
})
