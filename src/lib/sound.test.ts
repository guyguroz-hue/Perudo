// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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
