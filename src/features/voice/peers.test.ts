import { describe, expect, it } from 'vitest'
import { isSpeaking, meshChange, politeToward } from './peers'

describe('who gives way', () => {
  it('always picks exactly one of the two, from either side', () => {
    // The only property that matters. If both sides thought they were polite
    // nobody would ever offer; if neither did, a simultaneous offer kills the
    // connection.
    expect(politeToward('alice', 'bob')).toBe(true)
    expect(politeToward('bob', 'alice')).toBe(false)
  })

  it('agrees for every pair at a full table', () => {
    const ids = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']
    for (const you of ids) {
      for (const them of ids) {
        if (you === them) continue
        expect(politeToward(you, them)).toBe(!politeToward(them, you))
      }
    }
  })
})

describe('what changed in the room', () => {
  it('opens one connection for an arrival and closes one for a departure', () => {
    const change = meshChange(['bob'], ['bob', 'carl'], 'me')
    expect(change.opened).toEqual(['carl'])
    expect(change.closed).toEqual([])

    const gone = meshChange(['bob', 'carl'], ['bob'], 'me')
    expect(gone.opened).toEqual([])
    expect(gone.closed).toEqual(['carl'])
  })

  /*
   * The list arrives as a whole snapshot, repeatedly, mostly unchanged. A
   * re-sync that rebuilt the mesh would drop every conversation at the table
   * every few seconds.
   */
  it('does nothing at all when the same room arrives again', () => {
    const change = meshChange(['bob', 'carl'], ['carl', 'bob'], 'me')
    expect(change.opened).toEqual([])
    expect(change.closed).toEqual([])
  })

  it('never makes a peer out of you', () => {
    const change = meshChange([], ['me', 'bob'], 'me')
    expect(change.opened).toEqual(['bob'])
  })
})

describe('calling somebody speaking', () => {
  it('needs more to start than to keep going', () => {
    // One threshold makes a badge that flickers through every pause between
    // words, on a player's own face.
    expect(isSpeaking(0.03, false)).toBe(false)
    expect(isSpeaking(0.03, true)).toBe(true)
  })

  it('still stops when they stop', () => {
    expect(isSpeaking(0.005, true)).toBe(false)
  })
})
