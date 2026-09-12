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
import { CUP_HEIGHT, SEAT_RADIUS, makeCup, makeTable } from './objects'
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

/** Where the eye is. A person sitting at a table, not standing over it. */
const EYE = new Vector3(0, 1.12, 3.15)
const LOOK_AT = new Vector3(0, 0.04, -0.04)
const FOV = 27

export interface SceneSeat {
  readonly id: string
  readonly colour: string
  /** 0 is the seat nearest the viewer; the rest run clockwise from it. */
  readonly index: number
  readonly count: number
}

export interface TableScene {
  /** Call when the element resizes. */
  resize: (width: number, height: number) => void
  /** Replace who is at the table. */
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

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 20)
  camera.position.copy(EYE)
  camera.lookAt(LOOK_AT)

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

  function seatPosition(index: number, seats: number): Vector3 {
    // A quarter turn puts index 0 nearest the viewer; from there the ring runs
    // the way seats are numbered.
    const angle = Math.PI * 0.5 + (index / seats) * Math.PI * 2
    return new Vector3(
      Math.cos(angle) * SEAT_RADIUS,
      0,
      Math.sin(angle) * SEAT_RADIUS,
    )
  }

  return {
    resize(width, height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },

    setSeats(seats) {
      cups.clear()
      seats.forEach((seat) => {
        const cup = makeCup(seat.colour)
        cup.position.copy(seatPosition(seat.index, seats.length))
        // Turned a little, each differently, so six identical objects do not
        // read as a printed pattern.
        cups.add(cup)
      })
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
      renderer.dispose()
    },
  }
}

export { CUP_HEIGHT }
