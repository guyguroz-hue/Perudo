import { describe, expect, it } from 'vitest'
import { CAMERA, VIEW, edgePath, project, ring, ringPath } from './camera'

describe('the camera sits at the table', () => {
  // The whole point of the change: a low camera rather than a plan view.
  it('puts the near edge below the far edge', () => {
    expect(project(0, 1).y).toBeGreaterThan(project(0, -1).y)
  })

  it('draws what is near larger than what is far', () => {
    expect(project(0, 1).scale).toBeGreaterThan(1)
    expect(project(0, -1).scale).toBeLessThan(1)
  })

  // Enough that near and far read as different distances, not so much that the
  // near cup swallows the board. The first camera was pushed right up against
  // the table and came out at nearly three to one, which looked like a fisheye
  // and left the player's own cup standing over the bid.
  it('foreshortens the far side, without exaggerating it', () => {
    const ratio = project(0, 1).scale / project(0, -1).scale
    expect(ratio).toBeGreaterThan(1.4)
    expect(ratio).toBeLessThan(2.2)
  })

  it('flattens the circle into a wide ellipse', () => {
    const rim = ring(1)
    const width = Math.max(...rim.map((p) => p.x)) - Math.min(...rim.map((p) => p.x))
    const height = Math.max(...rim.map((p) => p.y)) - Math.min(...rim.map((p) => p.y))
    // Flat enough to read as a table seen from a chair rather than from above.
    expect(height / width).toBeGreaterThan(0.3)
    expect(height / width).toBeLessThan(0.6)
  })

  // The far half of a circle under perspective is compressed more than the
  // near half, so the projected ellipse's centre sits below the table's.
  it('pushes the middle of the ellipse below the middle of the table', () => {
    const rim = ring(1)
    const mid = (Math.max(...rim.map((p) => p.y)) + Math.min(...rim.map((p) => p.y))) / 2
    expect(mid).toBeGreaterThan(project(0, 0).y)
  })

  it('is symmetric left to right', () => {
    for (const z of [-0.9, -0.4, 0, 0.4, 0.9]) {
      expect(project(-0.6, z).x).toBeCloseTo(-project(0.6, z).x)
      expect(project(-0.6, z).y).toBeCloseTo(project(0.6, z).y)
    }
  })

  it('leaves the middle of the table where the middle of the table is', () => {
    expect(project(0, 0)).toEqual({ x: 0, y: 0, scale: 1 })
  })
})

describe('what gets drawn', () => {
  it('closes the rim', () => {
    expect(ringPath(1)).toMatch(/^M.*Z$/)
    expect(ringPath(1)).not.toMatch(/e[+-]\d/)
  })

  // The band of timber you see because you are level with the table rather
  // than above it. It has to hang off the near arc, not the far one.
  it('hangs the table edge off the near side', () => {
    const path = edgePath(1, 0.04)
    const ys = [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]))
    const rimYs = ring(1).map((p) => p.y)
    expect(Math.max(...ys)).toBeGreaterThan(Math.max(...rimYs))
    // And it must not reach the far rim.
    expect(Math.min(...ys)).toBeGreaterThan(Math.min(...rimYs) - 0.001)
  })

  it('gives the scene room for the edge and for the far cups', () => {
    const rim = ring(1)
    expect(VIEW.minY).toBeLessThan(Math.min(...rim.map((p) => p.y)))
    expect(VIEW.minY + VIEW.height).toBeGreaterThan(Math.max(...rim.map((p) => p.y)))
    expect(VIEW.width).toBeGreaterThan(
      Math.max(...rim.map((p) => p.x)) - Math.min(...rim.map((p) => p.x)),
    )
  })

  it('describes a camera anybody can retune', () => {
    expect(CAMERA.height).toBeGreaterThan(0)
    expect(CAMERA.distance).toBeGreaterThan(CAMERA.height)
  })
})
