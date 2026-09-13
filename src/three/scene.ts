import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { roomEnvironment } from './environment'
import { CUP_HEIGHT, makeCup, makeTable } from './objects'
import { CAMERA, CUP_LIFT, SEAT_RADIUS, placeCamera, seatAngle } from './layout'
import { FACE_UP, DIE_SIZE, fadeDie, makeDie } from './die'
import type { Die } from './die'
import { makeRoom } from './room'

/**
 * The scene.
 *
 * Deliberately imperative and free of React. The table and the cups are static
 * geometry that changes when a round changes, not sixty times a second, so
 * putting a reconciler between them and the GPU would buy nothing and cost a
 * dependency that pins the React version.
 *
 * What React gets back is a projection function: given a seat, where is it on
 * the screen. That is how the name tags and the bid stay ordinary DOM — crisp,
 * selectable, and the right size whatever the perspective does to the cup
 * underneath them.
 */

/*
 * The camera lives in `layout.ts`, not here.
 *
 * The interface projects seats through the same one to place names and the bid
 * as ordinary DOM, and two cameras that were meant to be identical are two
 * cameras that will disagree the first time one of them is retuned. That was
 * once a tidiness argument and is now load-bearing: the camera rises to look
 * straight down during a reveal, and for the second it spends moving, a badge
 * placed by the old camera is most of a screen away from the cup it names.
 */

/** How long the eye takes to get from a seat to straight above the table. */
const RISE_SECONDS = 0.9

/**
 * Smooth at both ends.
 *
 * The eye is a body, not a servo: linear travel between two viewpoints reads
 * as a machine panning, which is exactly the feeling a table of friends should
 * not have.
 */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** The axis a die spins about once it has come to rest on the table. */
const UP = new Vector3(0, 1, 0)

/**
 * How wide to spread the dice under one cup.
 *
 * Wide enough that neighbours on the ring do not intersect, which is what a
 * fixed radius could not promise: five dice on the ring that suited three came
 * out as a single pile with corners poking through each other. Solved from the
 * chord between neighbours rather than guessed, so it holds for one die and for
 * five.
 */
function ringRadius(count: number): number {
  if (count < 2) return 0
  return (DIE_SIZE * 1.16) / (2 * Math.sin(Math.PI / count))
}

export type CupState = 'covered' | 'shaking' | 'lifted'

export interface SceneSeat {
  readonly id: string
  readonly colour: string
  /** 0 is the seat nearest the viewer; the rest run clockwise from it. */
  readonly index: number
  readonly count: number
  /** What the cup is doing. */
  readonly state?: CupState
  /**
   * The faces under this cup.
   *
   * Only ever sent for a hand the viewer is entitled to see: their own, or
   * everybody's once a challenge has been resolved. A cup that is covered
   * still has dice under it in the scene, because they have to be there to be
   * uncovered — but the values only arrive when the server has released them.
   */
  readonly dice?: readonly number[]
  /**
   * Which of those dice count toward the claim being tested, die for die.
   *
   * Sent only during a reveal, and computed where the rules live rather than
   * here — whether a one counts depends on the round type, and the renderer is
   * not the place that knows about Farewell Rounds. Absent means "no claim is
   * on trial", and every die is shown plainly.
   */
  readonly counted?: readonly boolean[]
}

export interface TableScene {
  /** Call when the element resizes. */
  resize: (width: number, height: number) => void
  /**
   * Where to look from: 0 is a player's seat, 1 is straight down over the
   * table. The move is animated, and calling this again redirects it from
   * wherever the eye has got to.
   */
  setOverhead: (overhead: number, immediate?: boolean) => void
  /**
   * Play the dice changing hands, once a challenge has been resolved.
   *
   * Separate from `setSeats` on purpose: replacing the seat list rebuilds every
   * cup on the table, which would throw away the lift this is meant to land on
   * top of. `index` is the seat's place round the ring, as it was given.
   */
  pay: (changes: readonly { index: number; delta: number }[]) => void
  /** How far up the eye is right now, eased — what the overlay must project through. */
  readonly overhead: number
  /** Replace who is at the table, and what their cups are doing. */
  setSeats: (seats: readonly SceneSeat[]) => void
  /** Where a seat's cup meets the table, in percentages of the canvas. */
  project: (index: number, seats: number, height?: number) => { left: string; top: string }
  render: () => void
  dispose: () => void
}

export function createTableScene(canvas: HTMLCanvasElement): TableScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  // Filmic, because the lamp is much brighter than the room and clipping it to
  // white is what makes a render look cheap.
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95
  renderer.shadowMap.enabled = true

  const scene = new Scene()
  scene.environment = roomEnvironment(renderer)

  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 20)
  /*
   * Where the eye is, and where it is going: 0 is a player's seat, 1 is
   * straight down. Held as a pair so the rise can be interrupted — a reveal
   * dismissed early sends the camera back from wherever it had got to, rather
   * than finishing a trip nobody is watching.
   */
  let overhead = 0
  let wantOverhead = 0
  placeCamera(camera, 0)

  scene.add(makeRoom())
  scene.add(makeTable())

  // The lamp: warm, high, behind and to the right, which is where the
  // environment puts it. Lights and reflections have to agree or the eye knows.
  const key = new DirectionalLight(new Color('#ffd2a1'), 2.6)
  // Close to overhead. Lower and the cups throw long shadows clean off the
  // table onto the floor, which reads as six stains rather than as light.
  key.position.set(0.85, 3.3, -0.75)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -1.4
  key.shadow.camera.right = 1.4
  key.shadow.camera.top = 1.4
  key.shadow.camera.bottom = -1.4
  key.shadow.bias = -0.0012
  scene.add(key)

  // The window: cold, low, from the left.
  const fill = new DirectionalLight(new Color('#8fb6ff'), 0.34)
  fill.position.set(-2, 1.1, 0.8)
  scene.add(fill)

  // A soft pool over the middle of the table, so the bid sits in light.
  const pool = new PointLight(new Color('#ffc891'), 2.6, 3.6, 2)
  pool.position.set(0, 0.8, 0.1)
  scene.add(pool)

  scene.add(new AmbientLight(new Color('#3a2c2a'), 0.35))

  const cups = new Group()
  scene.add(cups)

  /**
   * What each seat's cup is doing, and how far through it is.
   *
   * A cup is a small state machine rather than a pile of animation flags: it is
   * covered, or it is being shaken, or it has been lifted. Everything the
   * renderer does to it follows from which of those it is and how long it has
   * been there.
   */
  interface DieMark {
    readonly die: Die
    /** Whether this die counts toward the claim being tested. */
    readonly counts: boolean
  }

  /**
   * A die changing hands, and how far through it is.
   *
   * Losing one is the only thing that ever happens to a player's standing, and
   * it is the thing a player must not miss — so it is shown happening to the
   * hand it happens to, rather than only counted somewhere else. A die that is
   * lost is taken off the table; one that is won back is set down on it.
   */
  interface Payment {
    readonly die: Group
    /** 1 for a die arriving, -1 for one leaving. */
    readonly way: number
    elapsed: number
  }

  interface Seated {
    readonly index: number
    readonly cup: Group
    readonly dice: Group
    readonly marks: readonly DieMark[]
    readonly paying: Payment[]
    /** Unit vector from the middle of the table toward this chair, in the XZ plane. */
    readonly out: Vector3
    state: CupState
    /** Seconds spent in the current state. */
    elapsed: number
  }

  const seated: Seated[] = []
  let frame = 0
  let last = 0

  function seatPosition(index: number, seats: number): Vector3 {
    const angle = seatAngle(index, seats)
    return new Vector3(Math.cos(angle) * SEAT_RADIUS, 0, Math.sin(angle) * SEAT_RADIUS)
  }

  /** How long the cup takes to come off the dice. */
  const LIFT_SECONDS = 0.55

  /**
   * A lifted cup, taken off the table.
   *
   * A cup lifted straight up clears its dice for somebody sitting at the table
   * and covers them completely for somebody looking down: at ninety degrees the
   * hand and the thing hovering over it occupy the same spot on screen, and the
   * reveal reveals a cup.
   *
   * So as the eye rises the cup is drawn away and set down out of the picture —
   * out toward its own player's edge, shrinking as it goes. Six cups, six hands,
   * six names and a bid do not fit on one disc at once, and of those the cup is
   * the only one carrying nothing: it is an empty vessel whose whole job, being
   * lifted, is already done. What it was saying — whose hand this is — the name
   * at the rim says better.
   */
  const SLIDE_OUT = 0.22

  function place(seat: Seated, dt: number) {
    seat.elapsed += dt
    const cup = seat.cup

    if (seat.state === 'shaking') {
      const t = seat.elapsed
      // Three frequencies that do not divide into each other, so the cup never
      // repeats a position — which is what makes it read as something loose
      // moving inside rather than as a wiper blade.
      cup.position.x = Math.sin(t * 27) * 0.012 + Math.sin(t * 17.3) * 0.006
      cup.position.z = Math.sin(t * 23.7) * 0.01
      cup.position.y = Math.abs(Math.sin(t * 31)) * 0.012
      cup.rotation.z = Math.sin(t * 21.4) * 0.09
      cup.rotation.x = Math.sin(t * 19.1) * 0.06
      seat.dice.visible = false
      return true
    }

    if (seat.state === 'lifted') {
      const k = Math.min(1, seat.elapsed / LIFT_SECONDS)
      // Ease out: a cup lifted by hand leaves quickly and arrives gently.
      const e = 1 - Math.pow(1 - k, 3)
      const up = ease(overhead)
      // A hand's height, not a crane's. Lifted further the cup leaves the
      // frame, and a cup you cannot see has not been lifted — it has vanished.
      // From overhead the height buys nothing and the slide is everything.
      cup.position.set(
        seat.out.x * e * up * SLIDE_OUT,
        e * CUP_LIFT * (1 - up * 0.55),
        e * 0.05 + seat.out.z * e * up * SLIDE_OUT,
      )
      cup.rotation.set(-e * 0.3 * (1 - up), 0, e * 0.1 * (1 - up))
      // Gone by the time the eye is all the way up, and back the moment it
      // starts down again — the same gesture in reverse, not a second one.
      cup.scale.setScalar(Math.max(0.001, 1 - up))
      cup.visible = up < 0.995
      // The dice appear the moment the rim clears them, not when the cup stops.
      seat.dice.visible = e > 0.12
      /*
       * Bigger, once there is room to be bigger.
       *
       * At a seat a hand has to fit under a cup. Overhead the cup has gone and
       * the space it was using is the hand's — and the whole reason for going
       * up there was that a die at this distance was a speck. Nowhere near
       * enough to reach the next chair along: five dice spread about a tenth of
       * the table's radius, and neighbouring chairs are most of a radius apart.
       */
      seat.dice.scale.setScalar(1 + up * 0.55)
      /*
       * And drawn in off the rim, which now belongs to the names.
       *
       * Seated, a hand sits where its chair is and the rim beyond it is empty
       * wood. Overhead the names have moved out there — it is the only place
       * left that is not a hand — so the hand gives up the ground and takes
       * some of the unused middle instead. Without this the two arrive at the
       * same band of table and a name lands on the dice it names, which is the
       * problem the whole move was made to solve.
       */
      seat.dice.position.set(-seat.out.x * up * 0.14, 0, -seat.out.z * up * 0.14)
      // Still moving while the eye is, because the slide is a function of both.
      return k < 1 || overhead !== wantOverhead
    }

    cup.position.set(0, 0, 0)
    cup.rotation.set(0, 0, 0)
    seat.dice.visible = false
    return false
  }

  /** Move the eye toward where it has been asked to be. Returns true while moving. */
  function rise(dt: number): boolean {
    if (overhead === wantOverhead) return false
    const step = dt / RISE_SECONDS
    overhead =
      wantOverhead > overhead
        ? Math.min(wantOverhead, overhead + step)
        : Math.max(wantOverhead, overhead - step)
    // Eased on the way in and out rather than linearly, so the table does not
    // start and stop like a lift. The stored value stays linear because it is
    // also what the interface projects through, and two easings would disagree.
    const up = ease(overhead)
    placeCamera(camera, up)

    /*
     * The count is marked as the eye arrives, not before.
     *
     * From a seat the dice are specks and dimming most of them would only make
     * the table look broken. Overhead they are objects, and taking the ones
     * that do not count back into the shadows turns "six hands of five" into
     * the one number the round is actually about.
     */
    for (const seat of seated) {
      for (const mark of seat.marks) {
        if (!mark.counts) fadeDie(mark.die, up)
      }
    }
    return true
  }

  /** How long a die takes to be taken off the table, or set down on it. */
  const PAY_SECONDS = 0.7

  /** Advance every die changing hands at this seat. True while any is moving. */
  function settle(seat: Seated, dt: number): boolean {
    if (seat.paying.length === 0) return false
    let moving = false

    for (const pay of seat.paying) {
      pay.elapsed += dt
      const k = Math.min(1, pay.elapsed / PAY_SECONDS)
      // A die leaving is lifted away and ends gently; one arriving falls and
      // lands, so it runs the same curve backwards.
      const e = pay.way < 0 ? 1 - Math.pow(1 - k, 2) : Math.pow(k, 2)
      const t = pay.way < 0 ? e : 1 - e

      pay.die.position.y = DIE_SIZE / 2 + t * 0.55
      pay.die.rotateOnWorldAxis(UP, dt * 5 * pay.way)
      pay.die.scale.setScalar(Math.max(0.001, 1 - t))
      pay.die.visible = k < 1 || pay.way > 0
      if (k < 1) moving = true
    }

    if (!moving) seat.paying.length = 0
    return moving
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    let busy = rise(dt)
    for (const seat of seated) busy = place(seat, dt) || busy
    for (const seat of seated) busy = settle(seat, dt) || busy
    renderer.render(scene, camera)
    frame = busy ? requestAnimationFrame(tick) : 0
  }

  function start() {
    if (frame !== 0) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  return {
    resize(width, height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },

    setSeats(seats) {
      cups.clear()
      seated.length = 0

      seats.forEach((seat) => {
        const group = new Group()
        /*
         * Its own seat, not its place in this list.
         *
         * A player who has been knocked out keeps their chair: their cup leaves
         * the table and everybody else stays where they were sitting. Placing
         * cups by their position in the array instead put the last player in
         * the empty chair every time somebody went out — and the cup under a
         * name was then somebody else's.
         */
        const spot = seatPosition(seat.index, seat.count)
        group.position.copy(spot)
        cups.add(group)

        const cup = makeCup(seat.colour)
        group.add(cup)

        // The dice live under the cup from the moment the round is dealt. They
        // are not created when they are revealed — a cup has to have something
        // to be lifted off.
        const dice = new Group()
        dice.visible = false
        const faces = seat.dice ?? []
        const marks: DieMark[] = []
        faces.forEach((face, i) => {
          const made = makeDie()
          const die = made.group
          // Laid out on a small ring, so five dice under one cup do not stack.
          const a = (i / Math.max(1, faces.length)) * Math.PI * 2 + seat.index
          die.position.set(
            Math.cos(a) * ringRadius(faces.length),
            DIE_SIZE / 2,
            Math.sin(a) * ringRadius(faces.length),
          )
          const [rx, ry, rz] = FACE_UP[face] ?? FACE_UP[1]
          /*
           * Turn the die so its value faces up, then spin it where it lies.
           *
           * The spin has to go on afterwards, about the world's up axis, not
           * into the Euler angles that orient the face. Added to the middle
           * angle it is applied *before* the tilt that puts the face up, which
           * turns it into a tumble about a horizontal axis — so every die
           * showing a two, a five or a six came to rest on a corner. Those are
           * exactly the faces whose orientation has a non-zero first angle,
           * which is why half the table looked right.
           */
          die.rotation.set(rx, ry, rz)
          die.rotateOnWorldAxis(UP, a * 0.7)
          dice.add(die)
          marks.push({ die: made, counts: seat.counted?.[i] ?? true })
        })
        group.add(dice)

        seated.push({
          index: seat.index,
          cup,
          dice,
          marks,
          paying: [],
          out: spot.clone().normalize(),
          state: seat.state ?? 'covered',
          elapsed: 0,
        })
      })

      for (const seat of seated) place(seat, 0)
      if (seated.some((seat) => seat.state !== 'covered')) start()
    },

    pay(changes) {
      for (const change of changes) {
        const seat = seated.find((s) => s.index === change.index)
        if (seat === undefined || change.delta === 0) continue

        for (let n = 0; n < Math.abs(change.delta); n += 1) {
          if (change.delta < 0) {
            // Whichever die is last on the ring. Which one leaves is not a
            // rule — the engine deals in counts and never in particular dice.
            const die = seat.dice.children[seat.dice.children.length - 1 - n]
            if (die instanceof Group) seat.paying.push({ die, way: -1, elapsed: 0 })
          } else {
            // A die won back is not in the hand that was revealed — the hand
            // is what was under the cup, and this one comes from the pool. So
            // it is made here, and set down beside the rest.
            const made = makeDie()
            const a = (seat.dice.children.length + n) * 1.7 + seat.index
            const spread = ringRadius(seat.dice.children.length + 1)
            made.group.position.set(Math.cos(a) * spread, DIE_SIZE / 2, Math.sin(a) * spread)
            seat.dice.add(made.group)
            seat.paying.push({ die: made.group, way: 1, elapsed: 0 })
          }
        }
      }
      if (seated.some((seat) => seat.paying.length > 0)) start()
    },

    setOverhead(next, immediate = false) {
      const clamped = Math.min(1, Math.max(0, next))
      if (clamped === wantOverhead) return
      wantOverhead = clamped
      // Somebody who has asked for less motion still needs to see the count.
      // They get the view without the trip to it.
      if (immediate) overhead = clamped
      start()
    },

    get overhead() {
      return ease(overhead)
    },

    project(index, seats, height = 0) {
      const point = seatPosition(index, seats)
      point.y += height
      const ndc = point.clone().project(camera)
      return {
        left: `${(ndc.x * 0.5 + 0.5) * 100}%`,
        top: `${(-ndc.y * 0.5 + 0.5) * 100}%`,
      }
    },

    render() {
      renderer.render(scene, camera)
    },

    dispose() {
      if (frame !== 0) cancelAnimationFrame(frame)
      renderer.dispose()
    },
  }
}

export { CUP_HEIGHT }
