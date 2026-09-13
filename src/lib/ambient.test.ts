import { describe, expect, it } from 'vitest'
import { resumeFrom } from './ambient'

/**
 * The bed, as a set of promises about what it may not be.
 *
 * It was a hiss. Not quietly wrong — the room tone under the chords was the
 * only layer a phone speaker could reproduce, because everything musical was
 * voiced below the range a speaker a few millimetres across can move air in.
 * The measurement that found it: 78% of the bed's energy sat below 400Hz, and
 * what came out of the phone was the filter skirt of the noise.
 *
 * Spectral content cannot be asserted here — that needs a real audio graph, and
 * it is checked by measuring the running game. What can be pinned is the
 * arithmetic those measurements depend on, and the scheduler, which is the one
 * part of this that can break in a way nobody hears until a phone has been
 * asleep in somebody's pocket.
 */
describe('the scheduler', () => {
  it('carries on from the last chord while the clock is keeping up', () => {
    expect(resumeFrom(100, 98)).toBe(100)
    expect(resumeFrom(100, 100)).toBe(100)
    // Slightly behind is normal — the lookahead is two seconds wide.
    expect(resumeFrom(100, 102)).toBe(100)
  })

  it('starts again rather than catching up after a tab has slept', () => {
    /*
     * A phone that slept for ten minutes stops firing the timer. A scheduler
     * that simply carried on would hand the audio thread forty chords all
     * dated in the past, and the audio thread plays anything dated in the past
     * immediately — so they arrive together, as a wall of sound, on a game the
     * player has just come back to.
     */
    expect(resumeFrom(100, 700)).toBe(700.2)
    expect(resumeFrom(100, 105)).toBe(105.2)
  })

  it('does not skip ahead on the boundary itself', () => {
    // Four seconds is the edge of "behind but recoverable". Exactly there, the
    // chord that was scheduled still stands.
    expect(resumeFrom(100, 104)).toBe(100)
    expect(resumeFrom(100, 104.1)).toBe(104.3)
  })
})
