import { describe, expect, it } from 'vitest'
import { describeEvent, faceWord } from './events'

describe('saying a face out loud', () => {
  it('names the wildcard rather than numbering it', () => {
    expect(faceWord(1, 1)).toBe('Perudo')
    expect(faceWord(1, 3)).toBe('Perudos')
  })

  it('gets the irregular plural right', () => {
    expect(faceWord(6, 1)).toBe('six')
    expect(faceWord(6, 4)).toBe('sixes')
  })

  it('does not say "1 fives"', () => {
    expect(faceWord(5, 1)).toBe('five')
    expect(faceWord(5, 2)).toBe('fives')
  })
})

describe('one line of what just happened', () => {
  const bid = { actorName: 'Alice', quantity: 4, face: 6 as const }

  it('reads like something said at the table', () => {
    expect(describeEvent({ ...bid, kind: 'bid' })).toBe('Alice bid 4 sixes')
  })

  // A Burst interrupts somebody else's turn, so it is a different sentence and
  // not the same one with a word bolted on.
  it('says a Burst differently', () => {
    expect(describeEvent({ ...bid, kind: 'burst_bid' })).toBe(
      'Alice burst in with 4 sixes',
    )
  })

  it('carries what a Bull means, not just that it happened', () => {
    expect(describeEvent({ ...bid, kind: 'bull', actorName: 'Carl' })).toBe(
      'Carl called Bull on 4 sixes — exactly',
    )
  })

  it('needs no bid to describe a challenge', () => {
    expect(describeEvent({ kind: 'lie', actorName: 'Bob' })).toBe('Bob called Lie')
    expect(describeEvent({ kind: 'burst_lie', actorName: 'Bob' })).toBe(
      'Bob burst in with Lie',
    )
  })

  it('says nothing about a kind it does not know', () => {
    expect(describeEvent({ kind: 'invented_later', actorName: 'Bob' })).toBeNull()
  })
})
