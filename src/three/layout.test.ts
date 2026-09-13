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

/**
 * The eye over the table.
 *
 * The reveal raises the camera to look straight down, and the overlay is
 * placed by projecting through the same one — so anything true of the picture
 * has to be true of this function, at every point on the way up as well as at
 * the top.
 */
describe('looking straight down', () => {
  it('sees the table square on, with no near edge and no far edge', () => {
    /*
     * The definition of overhead: two points the same distance either side of
     * the middle land the same distance either side of the middle on screen.
     * At a seat they do not, and that asymmetry is the whole reason the far
     * player's dice are specks while yours are legible.
     *
     * Not exactly symmetric, and deliberately so — the camera keeps two
     * centimetres of offset so its look-at is not degenerate, which leans the
     * view by well under a percent. The claim being made is that it is an
     * order of magnitude squarer than a seat, not that it is perfect.
     */
    const skew = (overhead: number) =>
      Math.abs(
        (Number.parseFloat(project(0, 0, 0.8, overhead).top) +
          Number.parseFloat(project(0, 0, -0.8, overhead).top)) /
          2 -
          50,
      )

    expect(skew(1)).toBeLessThan(1)
    expect(skew(0)).toBeGreaterThan(skew(1) * 8)
  })

  it('keeps the whole table inside the frame', () => {
    // The rim is at radius 1. Nothing on the table may be off the picture at
    // the one moment the player is being asked to read it.
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180
      const point = project(Math.cos(a), 0, Math.sin(a), 1)
      expect(Number.parseFloat(point.left)).toBeGreaterThan(0)
      expect(Number.parseFloat(point.left)).toBeLessThan(100)
      expect(Number.parseFloat(point.top)).toBeGreaterThan(0)
      expect(Number.parseFloat(point.top)).toBeLessThan(100)
    }
  })

  it('moves every badge off the hand it names', () => {
    // The reason the badges ride outward at all: at a seat they hang above or
    // below their cup, and from above there is no above or below.
    for (const count of SIZES) {
      for (let index = 0; index < count; index += 1) {
        const badge = badgeAnchor(index, count, true, 1)
        const hand = project(
          seatPoint(index, count).x,
          0,
          seatPoint(index, count).z,
          1,
        )
        const apart = Math.hypot(
          Number.parseFloat(badge.left) - Number.parseFloat(hand.left),
          Number.parseFloat(badge.top) - Number.parseFloat(hand.top),
        )
        expect(apart).toBeGreaterThan(3)
      }
    }
  })

  it('travels without jumping', () => {
    // Every step of the rise is a frame somebody sees. A discontinuity here is
    // a badge teleporting across the table mid-move.
    let previous = badgeAnchor(2, 6, true, 0)
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const next = badgeAnchor(2, 6, true, t)
      const step = Math.hypot(
        Number.parseFloat(next.left) - Number.parseFloat(previous.left),
        Number.parseFloat(next.top) - Number.parseFloat(previous.top),
      )
      expect(step).toBeLessThan(6)
      previous = next
    }
  })
})
