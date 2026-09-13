import { describe, expect, it } from 'vitest'
import { CUP_LID, badgeAnchor, emptySeatAnchor, project, seatPoint } from './layout'

/**
 * Where a label lands, at every table size.
 *
 * The collision this guards against has now been shipped twice, in two
 * different shapes, and both times it was invisible in the code and obvious on
 * a phone: a name sitting on somebody else's cup. What makes it easy to
 * reintroduce is that it only appears at five and six seats — the sizes nobody
 * assembles by hand while working on something else.
 *
 * Screen coordinates run downward, so "above" is a smaller `top`.
 */
const SIZES = [2, 3, 4, 5, 6] as const

/** A badge hangs downward when it is told to, and upward otherwise. */
function hangsDown(translate: string): boolean {
  return !translate.includes('-100%')
}

describe('badge anchors', () => {
  describe.each(SIZES)('at %i seats', (count) => {
    it('hangs every near-side badge below its cup and every far one above', () => {
      for (let index = 0; index < count; index += 1) {
        const { z } = seatPoint(index, count)
        // +z is toward the camera. A chair in front of the middle has the whole
        // far half of the table behind it, so its badge must hang the other way.
        expect(hangsDown(badgeAnchor(index, count).translate)).toBe(z > 0.001)
      }
    })

    it('never lets a badge cover the cup of the chair behind it', () => {
      for (let index = 0; index < count; index += 1) {
        const anchor = badgeAnchor(index, count)
        const mine = Number.parseFloat(anchor.top)

        for (let other = 0; other < count; other += 1) {
          if (other === index) continue
          const { x, z } = seatPoint(other, count)
          // The other cup, at the height of its lid — the part a badge would
          // land on if it reached that far.
          const lid = Number.parseFloat(project(x, CUP_LID, z).top)

          // A badge that hangs up sits above its anchor, one that hangs down
          // sits below it. Either way it must not travel toward a cup that is
          // on the wrong side of it.
          if (hangsDown(anchor.translate)) {
            // Hanging down, it can only reach cups lower on screen than itself.
            // Every other cup being at or above the anchor is what makes that
            // safe, and the near-side chairs are the lowest cups there are.
            if (lid > mine) expect(z).toBeGreaterThan(0.001)
          } else {
            if (lid < mine) expect(z).toBeLessThanOrEqual(0.001)
          }
        }
      }
    })

    it('keeps every badge inside the frame', () => {
      for (let index = 0; index < count; index += 1) {
        const left = Number.parseFloat(badgeAnchor(index, count).left)
        expect(left).toBeGreaterThanOrEqual(21)
        expect(left).toBeLessThanOrEqual(79)
      }
    })
  })

  it('lifts a badge with the cup it belongs to', () => {
    // Only a far seat has a badge riding on the cup's lid; a near one is
    // anchored to the timber and does not move when the cup comes up.
    const still = Number.parseFloat(badgeAnchor(3, 6, false).top)
    const lifted = Number.parseFloat(badgeAnchor(3, 6, true).top)
    expect(lifted).toBeLessThan(still)
  })
})

describe('empty chairs', () => {
  it.each(SIZES)('marks the spot on the table at %i seats', (count) => {
    for (let index = 0; index < count; index += 1) {
      const { x, z } = seatPoint(index, count)
      const empty = emptySeatAnchor(index, count)

      // Centred on the place a cup would stand, not floating clear of one.
      expect(empty.translate).toBe('-50% -50%')
      expect(Number.parseFloat(empty.top)).toBeCloseTo(
        Number.parseFloat(project(x, 0, z).top),
        6,
      )
    }
  })

  it('sits lower on screen than a cup would, because it is on the wood', () => {
    // The regression this pins: anchored at cup height with no cup under it,
    // a far chair's invitation floated in the room above the table.
    const far = 3
    const onWood = Number.parseFloat(emptySeatAnchor(far, 6).top)
    const { x, z } = seatPoint(far, 6)
    const atLid = Number.parseFloat(project(x, CUP_LID, z).top)
    expect(onWood).toBeGreaterThan(atLid)
  })
})
