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
import { CAMERA, LOOK_AT, SEAT_RADIUS, seatAngle } from './layout'
import { FACE_UP, DIE_SIZE, makeDie } from './die'
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
 * cameras that will disagree the first time one of them is retuned.
 */
const AIM = new Vector3(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z)

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
}

export interface TableScene {
  /** Call when the element resizes. */
  resize: (width: number, height: number) => void
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
  camera.position.set(0, CAMERA.height, CAMERA.distance)
  camera.lookAt(AIM)

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
  interface Seated {
    readonly cup: Group
    readonly dice: Group
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
      // A hand's height, not a crane's. Lifted further the cup leaves the
      // frame, and a cup you cannot see has not been lifted — it has vanished.
      cup.position.set(0, e * 0.26, e * 0.05)
      cup.rotation.set(-e * 0.3, 0, e * 0.1)
      cup.scale.setScalar(1)
      // The dice appear the moment the rim clears them, not when the cup stops.
      seat.dice.visible = e > 0.12
      return k < 1
    }

    cup.position.set(0, 0, 0)
    cup.rotation.set(0, 0, 0)
    seat.dice.visible = false
    return false
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    let busy = false
    for (const seat of seated) busy = place(seat, dt) || busy
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
        group.position.copy(seatPosition(seat.index, seat.count))
        cups.add(group)

        const cup = makeCup(seat.colour)
        group.add(cup)

        // The dice live under the cup from the moment the round is dealt. They
        // are not created when they are revealed — a cup has to have something
        // to be lifted off.
        const dice = new Group()
        dice.visible = false
        const faces = seat.dice ?? []
        faces.forEach((face, i) => {
          const die = makeDie()
          // Laid out on a small ring, so five dice under one cup do not stack.
          const a = (i / Math.max(1, faces.length)) * Math.PI * 2 + seat.index
          const spread = faces.length === 1 ? 0 : 0.062
          die.position.set(Math.cos(a) * spread, DIE_SIZE / 2, Math.sin(a) * spread)
          const [rx, ry, rz] = FACE_UP[face] ?? FACE_UP[1]
          // The upward face is the value; the spin about it is cosmetic.
          die.rotation.set(rx, ry + a * 0.7, rz)
          dice.add(die)
        })
        group.add(dice)

        seated.push({ cup, dice, state: seat.state ?? 'covered', elapsed: 0 })
      })

      for (const seat of seated) place(seat, 0)
      if (seated.some((seat) => seat.state !== 'covered')) start()
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
