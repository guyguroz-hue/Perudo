// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resumeFrom } from './ambient'
import { isWanted, play, setWanted, startMusic } from './sound'

afterEach(() => {
  setWanted(true)
  vi.restoreAllMocks()
})

/*
 * There is no audio in jsdom, and that is the case worth testing.
 *
 * A phone with the ringer off, a browser that has not seen a gesture yet, a
 * device with no audio at all — in every one of them the game has to open and
 * play. The sound layer is allowed to do nothing; it is not allowed to throw on
 * the way to doing nothing, because a game that will not start because it could
 * not make a noise is a worse game than a silent one.
 */
describe('a game with no audio', () => {
  it('plays every sound without an audio context to play it into', () => {
    expect(() => {
      play('shake', 1.1)
      play('lift')
      play('tap')
    }).not.toThrow()
  })

  it('starts music it cannot find, and says nothing about it', () => {
    expect(() => startMusic()).not.toThrow()
  })

  it('remembers being switched off, and stays off', () => {
    setWanted(false)
    expect(isWanted()).toBe(false)
    expect(() => play('shake')).not.toThrow()

    setWanted(true)
    expect(isWanted()).toBe(true)
  })
})

describe('the bed, coming back from a sleeping phone', () => {
  /*
   * A tab in the background stops firing timers. The scheduler hands notes to
   * the audio thread ahead of time, so when it wakes it is holding a moment
   * that has long since passed — and everything scheduled from there is dated
   * in the past, which a browser plays all at once.
   */
  it('starts again from now when it has fallen far behind', () => {
    expect(resumeFrom(10, 600)).toBeCloseTo(600.2)
  })

  // A few hundred milliseconds of lag is the normal case and has to be left
  // alone: that is the lookahead doing its job, not a tab waking up.
  it('leaves ordinary scheduling lag alone', () => {
    expect(resumeFrom(12.4, 12.9)).toBe(12.4)
    expect(resumeFrom(15, 12)).toBe(15)
  })
})
