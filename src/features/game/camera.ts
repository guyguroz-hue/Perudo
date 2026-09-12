/**
 * The camera.
 *
 * One pinhole camera, sitting where a player sits: a little above the tabletop
 * and back from its edge, looking down at the middle. Everything on the table —
 * the rim, the cups, the ring in the centre — is placed by projecting a point
 * through it, so the whole scene agrees about where things are instead of each
 * piece being nudged into place by eye.
 *
 * Table space is a unit circle. `x` runs left to right; `z` runs from -1 at the
 * far edge to +1 at the near one, which is the edge the viewer is sitting at.
 *
 * Why this and not CSS 3D transforms or a 3D renderer: the text has to stay
 * crisp and selectable, the name tags must not shrink with distance even though
 * the cups must, and six cups have to move at once on a phone. Projecting in
 * JavaScript and drawing in ordinary DOM gives all three. A renderer would give
 * real geometry nobody would see the benefit of, and cost a frame budget this
 * does not have.
 */

/**
 * Where the viewer's eye is, in table radii.
 *
 * Two numbers, and between them they are the whole look of the scene.
 *
 * Their *ratio* is the camera's elevation — here about 27 degrees, which is a
 * person sitting at the table rather than standing over it. That is what
 * flattens the circle into a wide ellipse, and flatness is what reads as "I am
 * sitting here". Lower still looks better in a still frame and stops working as
 * a game: below about 25 degrees the near cup and the middle of the table are
 * only a few pixels apart vertically, and your own cup covers the bid.
 *
 * Their *size* is how close the camera is, and it turned out to matter more
 * than expected. A camera at 1.75 radii is a wide lens pushed up against the
 * table: the near cup came out nearly twice the far one and swallowed the
 * board. Standing back to 3 radii keeps the same low angle and brings that down
 * to about four to three, which is what a real table looks like.
 */
export const CAMERA = { height: 1.5, distance: 3 } as const

const M = Math.hypot(CAMERA.height, CAMERA.distance)
const M2 = M * M

export interface Projected {
  /** Left to right, in view units. 0 is the middle of the table. */
  readonly x: number
  /** Down the screen, in view units. 0 is the middle of the table. */
  readonly y: number
  /**
   * How large something at this point is drawn, against the middle of the
   * table. Near the viewer this is greater than 1, at the far rim well under
   * it — the perspective divide, not a hand-tuned fudge.
   */
  readonly scale: number
}

/** Project a point on the tabletop to the screen. */
export function project(x: number, z: number): Projected {
  const denom = M2 - CAMERA.distance * z
  return {
    x: (x * M) / denom,
    y: (CAMERA.height * z) / denom,
    scale: M2 / denom,
  }
}

/** A ring on the tabletop, as projected points. `steps` is the sampling. */
export function ring(radius: number, steps = 96): Projected[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return project(Math.cos(a) * radius, Math.sin(a) * radius)
  })
}

/** An SVG path for a ring on the tabletop. */
export function ringPath(radius: number, steps = 96): string {
  const points = ring(radius, steps)
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fixed(p.x)} ${fixed(p.y)}`).join('')}Z`
}

/**
 * The table's edge — the band of timber you can see because you are sitting
 * level with it rather than floating above it.
 *
 * This is the single strongest cue that the camera is low. Without it a circle
 * drawn as an ellipse is a shape; with it, it is furniture.
 *
 * Built from the near arc of the rim and the same arc dropped by the table's
 * thickness. The arc runs between the two points where the rim's silhouette
 * turns — which are simply its leftmost and rightmost projected points.
 */
export function edgePath(radius: number, thickness: number, steps = 96): string {
  const points = ring(radius, steps)

  let left = 0
  let right = 0
  points.forEach((p, i) => {
    if (p.x < points[left].x) left = i
    if (p.x > points[right].x) right = i
  })

  // Walk from the left silhouette to the right one the way that goes through
  // the near side of the table.
  const arc: Projected[] = []
  for (let n = 0; n <= steps; n += 1) {
    const i = (left + n) % steps
    arc.push(points[i])
    if (i === right) break
  }
  if (arc.length < 2 || averageY(arc) < averageY(points)) {
    arc.length = 0
    for (let n = 0; n <= steps; n += 1) {
      const i = (right + n) % steps
      arc.push(points[i])
      if (i === left) break
    }
  }

  const top = arc.map((p, i) => `${i === 0 ? 'M' : 'L'}${fixed(p.x)} ${fixed(p.y)}`).join('')
  const bottom = [...arc]
    .reverse()
    .map((p) => `L${fixed(p.x)} ${fixed(p.y + thickness)}`)
    .join('')
  return `${top}${bottom}Z`
}

/**
 * The box the scene is drawn in, with room for the table's edge below and for
 * the cups standing at the far rim above.
 */
export const VIEW = (() => {
  const rim = ring(1)
  const maxX = Math.max(...rim.map((p) => Math.abs(p.x)))
  const minY = Math.min(...rim.map((p) => p.y))
  const maxY = Math.max(...rim.map((p) => p.y))
  // Proportional to the table rather than absolute, so retuning the camera
  // does not leave the scene swimming in margin or clipping its own cups.
  const depth = maxY - minY
  const padX = maxX * 0.1
  const padTop = depth * 0.45
  const padBottom = depth * 0.22
  return {
    minX: -(maxX + padX),
    minY: minY - padTop,
    width: (maxX + padX) * 2,
    height: maxY - minY + padTop + padBottom,
  }
})()

/** `x`/`y` from `project`, as percentages of the view box. */
export function toPercent(p: Projected): { left: string; top: string } {
  return {
    left: `${((p.x - VIEW.minX) / VIEW.width) * 100}%`,
    top: `${((p.y - VIEW.minY) / VIEW.height) * 100}%`,
  }
}

function averageY(points: readonly Projected[]): number {
  return points.reduce((total, p) => total + p.y, 0) / points.length
}

/* CSS and SVG have no exponent notation, and these numbers are small enough
   that JavaScript reaches for it. */
function fixed(n: number): string {
  return n.toFixed(5)
}

/** The scene's proportions, for the box it is drawn in. */
export const VIEW_RATIO = `${VIEW.width} / ${VIEW.height}`

/**
 * The bounding box of a ring on the tabletop, as CSS percentages of the scene.
 *
 * Used to hang screen-space content over a circle drawn on the table — the bid
 * over its inlay — so the two stay together whatever the camera is set to.
 */
export function ringBox(radius: number): {
  left: string
  top: string
  width: string
  height: string
} {
  const points = ring(radius)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    left: `${((minX - VIEW.minX) / VIEW.width) * 100}%`,
    top: `${((minY - VIEW.minY) / VIEW.height) * 100}%`,
    width: `${((Math.max(...xs) - minX) / VIEW.width) * 100}%`,
    height: `${((Math.max(...ys) - minY) / VIEW.height) * 100}%`,
  }
}
