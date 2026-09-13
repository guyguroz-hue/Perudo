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

/**
 * How far a cup rises when it is lifted.
 *
 * Shared with the renderer, which does the lifting, because the badge floating
 * over a cup has to get out of its way — and two copies of this number are two
 * numbers that will disagree the first time one of them is tuned.
 */
export const CUP_LIFT = 0.26

/** The air between a cup and the badge floating over it. */
export const BADGE_GAP = '10px'

/**
 * How close to the frame a badge may be pushed.
 *
 * A seat at the side of the table projects almost to the edge, and a name you
 * cannot read is not a name. Wide enough that a badge hung outward from the
 * anchor still has its own width of room before the frame.
 */
export const BADGE_MARGIN = 21

/**
 * How far out a badge rides when the eye is straight overhead.
 *
 * Just inside the table's rim, which is at 1. Beyond the cups, which have slid
 * out of their dice's way, and well beyond the dice themselves.
 */
export const BADGE_RIM = 0.95

/** The brass ring inlaid in the middle, which frames the bid. */
export const INLAY_RADIUS = 0.34

/**
 * Where the eye goes to read the table.
 *
 * Straight down, high enough that every cup's dice are inside the frame. A
 * seat's view is the right one for playing — it is a table in front of you —
 * and the wrong one for the one moment the game is about arithmetic: six hands
 * lying flat, seen at thirty-five degrees, are six huddles of foreshortened
 * specks, and the player is asked to take the count on trust.
 *
 * The height is not chosen by eye. The dice sit on a ring of SEAT_RADIUS plus
 * their own spread, and the stage is taller than it is wide, so it is the
 * horizontal field that has to contain them: at this fov and aspect the
 * half-angle across is atan(tan(fov/2) * STAGE_ASPECT), and the height below
 * puts the outermost die comfortably inside it.
 */
export const OVERHEAD = {
  /*
   * Measured against what has to be inside the frame, not chosen by eye.
   *
   * The stage is taller than it is wide, so the horizontal field is the tight
   * one: at this fov and aspect its half-angle has tan = tan(fov/2) * aspect
   * ≈ 0.327, so a height of 3.3 reaches about 1.08 either side of the middle.
   * The table's rim is at 1, and the badges ride just inside it, which is the
   * outermost thing that must not be cut.
   */
  height: 3.3,
  /*
   * Not zero.
   *
   * A camera directly above its target, looking down, has no way to decide
   * which way is up — the look-at is degenerate and three.js resolves it to an
   * arbitrary roll. Two centimetres of offset is invisible at this height and
   * costs nothing, and it keeps the near edge of the table at the bottom of
   * the frame where the player is sitting.
   */
  distance: 0.02,
} as const

const camera = new PerspectiveCamera(CAMERA.fov, STAGE_ASPECT, 0.1, 20)

/**
 * Put a camera somewhere between a seat and straight overhead.
 *
 * `overhead` runs 0 (a player's eye, leaning in) to 1 (looking down). Both the
 * renderer and this module's projection call it, because a badge placed by one
 * camera over a table drawn by another is a badge in the wrong place — and
 * during the rise they would be wrong by most of the screen.
 */
export function placeCamera(target: PerspectiveCamera, overhead: number): void {
  const t = Math.min(1, Math.max(0, overhead))
  target.position.set(
    0,
    CAMERA.height + (OVERHEAD.height - CAMERA.height) * t,
    CAMERA.distance + (OVERHEAD.distance - CAMERA.distance) * t,
  )
  // The aim comes down to the timber as the eye goes up: from overhead there is
  // no "above the table" left to look at, only the table.
  target.lookAt(new Vector3(LOOK_AT.x, LOOK_AT.y * (1 - t), LOOK_AT.z))
  target.updateMatrixWorld()
}

placeCamera(camera, 0)
camera.updateProjectionMatrix()

export interface Anchor {
  readonly left: string
  readonly top: string
}

/**
 * Project a point on or above the tabletop to percentages of the scene.
 *
 * `overhead` is where the eye is, and it has to be passed rather than read
 * from somewhere: the camera rises during a reveal, and anything placed on the
 * screen while it moves is placed for the camera of that frame.
 */
export function project(x: number, y: number, z: number, overhead = 0): Anchor {
  placeCamera(camera, overhead)
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
 * The near half of the table is the exception. Those chairs are in front of
 * everything else, so their badges hang below their cups instead, off the front
 * edge, where the only thing under them is floor.
 */
export interface BadgeAnchor extends Anchor {
  /** Which way the badge hangs off its anchor point. */
  readonly translate: string
}

export function badgeAnchor(
  index: number,
  count: number,
  lifted = false,
  overhead = 0,
): BadgeAnchor {
  /*
   * Out to the rim as the eye rises.
   *
   * Seen from a seat a badge hangs clear of its cup, above or below it. Seen
   * from directly above there is no above or below — the table is a disc and
   * everything on it competes for the same pixels, so a badge left on its
   * chair's own spot lands squarely on the hand it is naming, at the one
   * moment the hand is the thing worth looking at. It slides outward instead,
   * past the cup, onto the rim where nothing else is.
   */
  const reach = SEAT_RADIUS + (BADGE_RIM - SEAT_RADIUS) * overhead
  const { x, z } = seatPoint(index, count, reach)
  /*
   * Near is a half of the table, not one chair.
   *
   * It was one chair, and at five and six seats that was the collision it was
   * written to prevent, moved one seat round: the chairs flanking yours are in
   * front of the ones across from them, so a badge of theirs hung upward lands
   * on the cup behind — Alice's name on Carl's cup, every time the room filled
   * up. Anybody on the near side of the middle hangs their badge down off the
   * front of the table, where the only thing under them is floor.
   */
  const near = z > 0.001
  // A lifted cup climbs into the badge that was floating over it, so the badge
  // moves up with it and the gap between them stays the gap it was.
  const anchor = project(x, near ? 0 : CUP_LID + (lifted ? CUP_LIFT : 0), z, overhead)

  /*
   * Which way the badge runs.
   *
   * Centred on the seat is right for the two chairs on the table's axis and
   * wrong for every other one: a name is wider than a cup, so a badge centred
   * on a chair at the side of the table reaches across the wood and lands on
   * the cup belonging to the next chair along. Hung outward from the middle it
   * runs off the table instead, which is where there is nothing to cover.
   */
  const side = Math.abs(x) < 0.08 ? 'centre' : x < 0 ? 'left' : 'right'
  const across = side === 'centre' ? '-50%' : side === 'left' ? '-88%' : '-12%'

  /*
   * The frame margin relaxes as the eye rises.
   *
   * It exists because a seat at the side of the table projects almost to the
   * edge at a seated camera, and a name pushed off the frame is not a name.
   * From above the anchor is already well inside the picture, and holding it
   * twenty-one percent in would drag every badge back over the dice — undoing
   * the outward slide it was given in the line above.
   */
  const margin = BADGE_MARGIN * (1 - overhead) + 8 * overhead

  return {
    left: `${clamp(margin, Number.parseFloat(anchor.left), 100 - margin)}%`,
    top: anchor.top,
    // Overhead the badge sits on its anchor rather than hanging off it: the
    // anchor is already out at the rim, and hanging it further would take it
    // off the frame. The changeover is a single frame in the middle of a move
    // where everything else is travelling too.
    translate:
      overhead > 0.5
        ? '-50% -50%'
        : near
          ? `${across} ${BADGE_GAP}`
          : `${across} calc(-100% - ${BADGE_GAP})`,
  }
}

/**
 * Where an empty chair's invitation goes.
 *
 * Not a badge anchor with the cup left out. A badge hangs clear of the cup it
 * belongs to, and hanging clear of a cup that is not there leaves the label
 * floating in the room above the table — at two players, three of them hover
 * in the window like notices pinned to the glass. An empty chair has nothing
 * to hang off, so its invitation lies flat on the timber, in the ring of wood
 * where the cup would stand, which is the thing it is inviting somebody to.
 */
export function emptySeatAnchor(index: number, count: number): BadgeAnchor {
  const { x, z } = seatPoint(index, count)
  const anchor = project(x, 0, z)
  return {
    left: `${clamp(BADGE_MARGIN, Number.parseFloat(anchor.left), 100 - BADGE_MARGIN)}%`,
    top: anchor.top,
    translate: '-50% -50%',
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
export function centreAnchor(overhead = 0): Anchor {
  return project(0, 0.12, 0, overhead)
}

/** How far across the scene the inlay reaches, as a percentage. */
export function inlayWidth(overhead = 0): number {
  const right = project(INLAY_RADIUS, 0, 0, overhead)
  const left = project(-INLAY_RADIUS, 0, 0, overhead)
  return Number.parseFloat(right.left) - Number.parseFloat(left.left)
}
