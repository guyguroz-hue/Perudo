import { PerspectiveCamera, Vector3 } from 'three'

/**
 * Where things are, in screen terms.
 *
 * The same camera the renderer uses, exposed as a pure projection so the
 * interface can put ordinary DOM exactly where an object is without asking the
 * renderer anything. Two consequences worth having: the names and the bid stay
 * crisp text at a size the perspective never touches, and they land in the
 * right place even on a device where the canvas never renders at all.
 */

/**
 * Where the eye is.
 *
 * A person at the table, leaning in — about thirty-five degrees above the
 * surface. Lower than that and the cups stack up on each other and the far ones
 * cannot be told apart; higher and it stops being a seat and becomes a security
 * camera. The angle is chosen so the table fills the width of a phone held
 * upright and still leaves room above it for the room itself, which is what
 * stops the screen feeling like a table in a void.
 */
export const CAMERA = { height: 1.8, distance: 2.6, fov: 46 } as const

/**
 * What the camera is pointed at.
 *
 * A hand's height above the middle of the table rather than the middle itself.
 * Aimed at the timber, the table sat high in the frame with a band of empty
 * floor under it; lifted, it drops to where a table in front of you actually
 * is, and the room gets the space above instead.
 */
export const LOOK_AT = { x: 0, y: 0.2, z: 0.02 } as const

/**
 * The shape of the scene.
 *
 * Fixed, because the projection depends on it: a camera with one aspect ratio
 * and an overlay computed for another would drift apart at the edges, which is
 * exactly where the player badges are.
 */
export const STAGE_ASPECT = 1 / 1.3

/** Where the cups stand, as a fraction of the table's radius. */
export const SEAT_RADIUS = 0.72

/**
 * How high a cup's rim stands, in table units.
 *
 * A badge hangs above its own cup, and "above" has to mean above the thing you
 * can see — not above the spot on the timber it is standing on.
 */
export const CUP_LID = 0.3

/** The air between a cup and the badge floating over it. */
export const BADGE_GAP = '10px'

/**
 * How close to the frame a badge may be pushed.
 *
 * A seat at the side of the table projects almost to the edge, and a name you
 * cannot read is not a name.
 */
export const BADGE_MARGIN = 15

/** The brass ring inlaid in the middle, which frames the bid. */
export const INLAY_RADIUS = 0.34

const camera = new PerspectiveCamera(CAMERA.fov, STAGE_ASPECT, 0.1, 20)
camera.position.set(0, CAMERA.height, CAMERA.distance)
camera.lookAt(new Vector3(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z))
camera.updateMatrixWorld()
camera.updateProjectionMatrix()

export interface Anchor {
  readonly left: string
  readonly top: string
}

/** Project a point on or above the tabletop to percentages of the scene. */
export function project(x: number, y: number, z: number): Anchor {
  const ndc = new Vector3(x, y, z).project(camera)
  return {
    left: `${(ndc.x * 0.5 + 0.5) * 100}%`,
    top: `${(-ndc.y * 0.5 + 0.5) * 100}%`,
  }
}

/**
 * Where seat `index` of `count` sits on the ring.
 *
 * A quarter turn puts index 0 nearest the viewer — the seat you are sitting
 * in — and from there the ring runs the way seats are numbered, so the player
 * clockwise from you is clockwise from you on screen.
 */
export function seatAngle(index: number, count: number): number {
  return Math.PI * 0.5 + (index / count) * Math.PI * 2
}

export function seatPoint(index: number, count: number, radius = SEAT_RADIUS) {
  const a = seatAngle(index, count)
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius }
}

/**
 * Where a player's badge goes.
 *
 * Floating clear above their own cup, not out past the rim. Pushing a badge
 * outward in world space looks right on paper and fails at this camera: the
 * sides of the table run away toward the horizon, so a badge far enough out to
 * clear the cup is off the screen, and one held on screen lands back on top of
 * it. Above the cup there is always room, and the gap between the cup and the
 * disc floating over it is the same at every seat.
 *
 * Your own seat is the exception. You sit at the near edge with your cup in
 * front of you, so your tag hangs below it, off the front of the table, where
 * it covers nothing.
 */
export interface BadgeAnchor extends Anchor {
  /** Which way the badge hangs off its anchor point. */
  readonly translate: string
}

export function badgeAnchor(index: number, count: number): BadgeAnchor {
  const near = index === 0
  const { x, z } = seatPoint(index, count)
  const anchor = project(x, near ? 0 : CUP_LID, z)
  return {
    left: `${clamp(BADGE_MARGIN, Number.parseFloat(anchor.left), 100 - BADGE_MARGIN)}%`,
    top: anchor.top,
    translate: near ? `-50% ${BADGE_GAP}` : `-50% calc(-100% - ${BADGE_GAP})`,
  }
}

function clamp(low: number, value: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/**
 * Where the bid sits.
 *
 * In the band of open timber between the cup across the table and your own —
 * which at this camera is the only clear ground there is. Lifted a hand's
 * height off the surface, so it reads as belonging to the middle of the table
 * rather than being painted on it, and centred in that band rather than on the
 * table, because the table's middle is behind the far player's cup.
 */
export function centreAnchor(): Anchor {
  return project(0, 0.12, 0)
}

/** How far across the scene the inlay reaches, as a percentage. */
export function inlayWidth(): number {
  const right = project(INLAY_RADIUS, 0, 0)
  const left = project(-INLAY_RADIUS, 0, 0)
  return Number.parseFloat(right.left) - Number.parseFloat(left.left)
}
