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
