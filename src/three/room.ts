import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { CAMERA, LOOK_AT, STAGE_ASPECT } from './layout'

/**
 * The room the table is in.
 *
 * Without it the table floats in black, and most of what makes a render look
 * expensive is not the object — it is what is behind and around it. This is a
 * lounge at night: a window on one side with the city out of focus behind it, a
 * lamp on the other, a long low couch across the back, and plants in the near
 * corners.
 *
 * Painted rather than photographed, on purpose. A captured panorama is a couple
 * of megabytes on the critical path of a game people open on a phone, and it
 * brings its own room with it — one that will never quite agree with the lights
 * in this scene. This one is written from the same description as the image
 * based light, so they cannot disagree.
 *
 * It is painted as a card standing square to the camera and exactly filling the
 * frame, which is the whole trick: the texture's coordinates and the screen's
 * are then the same coordinates. A backdrop art-directed in world space has to
 * be re-derived every time the camera moves an inch, and the lamp ends up
 * somewhere nobody can see. Here the lamp is at the top right because it is
 * painted at the top right.
 */

/** How far down the view axis the room stands. Past everything else in it. */
const DEPTH = 9

/** Where the wall stops and the floor starts, as a fraction down the frame. */
const HORIZON = 0.315

/** Softly drawn discs of light, the way an out-of-focus lamp reads. */
interface Bokeh {
  readonly u: number
  readonly v: number
  readonly r: number
  readonly colour: string
  readonly alpha: number
}

/*
 * Out of the window, and around the lamp.
 *
 * Placed in the band the camera actually shows: everything below the horizon is
 * behind the table, so a light painted there is a light nobody will ever see.
 */
const BOKEH: readonly Bokeh[] = [
  { u: 0.055, v: 0.1, r: 0.03, colour: '#8fb4ff', alpha: 0.5 },
  { u: 0.125, v: 0.165, r: 0.02, colour: '#b9d0ff', alpha: 0.42 },
  { u: 0.028, v: 0.215, r: 0.024, colour: '#6f93e8', alpha: 0.34 },
  { u: 0.165, v: 0.075, r: 0.015, colour: '#cfe0ff', alpha: 0.3 },
  { u: 0.095, v: 0.26, r: 0.017, colour: '#7fa8ff', alpha: 0.26 },
  { u: 0.2, v: 0.225, r: 0.012, colour: '#a9c4ff', alpha: 0.22 },
  { u: 0.905, v: 0.135, r: 0.035, colour: '#ffc98a', alpha: 0.44 },
  { u: 0.965, v: 0.2, r: 0.024, colour: '#ffb66a', alpha: 0.32 },
  { u: 0.84, v: 0.235, r: 0.016, colour: '#ffd9a8', alpha: 0.24 },
  { u: 0.62, v: 0.045, r: 0.014, colour: '#ffe0b8', alpha: 0.16 },
]

/**
 * The picture behind the table, painted in the frame it appears in.
 *
 * Everything is soft. A room this far behind the subject is out of focus in any
 * real photograph of it, and painting it sharp is the single thing that makes a
 * background read as wallpaper stuck behind a 3D object.
 */
function roomTexture(width = 1024): CanvasTexture {
  const height = Math.round(width / STAGE_ASPECT)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the room')

  const X = (u: number) => u * width
  const Y = (v: number) => v * height
  const S = (n: number) => n * width

  const wash = (u: number, v: number, r: number, colour: string, alpha: number) => {
    const x = X(u)
    const y = Y(v)
    const rad = S(r)
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, colour)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    ctx.globalAlpha = 1
  }

  /** A rounded slab, which is every piece of furniture in this room. */
  const slab = (u: number, v: number, w: number, h: number, r: number, fill: string) => {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(X(u), Y(v), S(w), S(h), S(r))
    ctx.fill()
  }

  // ---------------------------------------------------------------- the wall
  const wall = ctx.createLinearGradient(0, 0, 0, Y(HORIZON))
  wall.addColorStop(0, '#0b0913')
  wall.addColorStop(0.5, '#16111c')
  wall.addColorStop(1, '#221a24')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, width, Y(HORIZON) + 2)

  // --------------------------------------------------------------- the floor
  const floor = ctx.createLinearGradient(0, Y(HORIZON), 0, height)
  floor.addColorStop(0, '#1d141a')
  floor.addColorStop(0.35, '#120c14')
  floor.addColorStop(1, '#08060b')
  ctx.fillStyle = floor
  ctx.fillRect(0, Y(HORIZON), width, height - Y(HORIZON))

  // -------------------------------------------------------------- the window
  // Cold, and the only straight lines in the room. A city at night is the one
  // light source that explains a blue wash across half a dark lounge — and it
  // is the brightest thing in the frame, which is what gives the near corner of
  // the table an edge to be seen against.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(X(-0.08), Y(-0.04), S(0.38), S(0.35), S(0.014))
  ctx.clip()
  const sky = ctx.createLinearGradient(0, 0, 0, Y(0.31))
  sky.addColorStop(0, '#1b2a55')
  sky.addColorStop(0.55, '#2b3f78')
  sky.addColorStop(1, '#47598f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, Y(0.32))
  // The city, far enough away to be nothing but lights.
  for (let i = 0; i < 90; i += 1) {
    const u = -0.07 + (((i * 37) % 100) / 100) * 0.36
    const v = 0.02 + (((i * 61) % 100) / 100) * 0.27
    ctx.globalAlpha = 0.2 + ((i * 17) % 10) / 14
    ctx.fillStyle = i % 4 === 0 ? '#ffe0b0' : '#d3e2ff'
    ctx.fillRect(X(u), Y(v), S(0.005), S(0.0035))
  }
  ctx.globalAlpha = 1
  ctx.restore()
  // The frame: dark bars across the glass, which is what says "window" before
  // anything inside it is legible.
  ctx.fillStyle = '#08060e'
  ctx.fillRect(X(0.108), Y(-0.04), S(0.009), S(0.35))
  ctx.fillRect(X(-0.08), Y(0.135), S(0.38), S(0.009))
  ctx.fillRect(X(0.292), Y(-0.04), S(0.014), S(0.35))
  // What the window throws into the room.
  wash(0.09, 0.2, 0.4, '#4f7ad6', 0.95)

  // ---------------------------------------------------------------- the lamp
  // Warm, tighter, and high on the right — the light everything on the table is
  // actually lit by, so it had better be visible in the same picture.
  wash(0.93, 0.14, 0.46, '#e8952c', 1)
  ctx.fillStyle = 'rgba(20,14,12,0.95)'
  ctx.fillRect(X(0.927), Y(0.12), S(0.008), S(0.21))
  // The shade, lit from inside.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(X(0.858), Y(0.125))
  ctx.lineTo(X(0.998), Y(0.125))
  ctx.lineTo(X(0.972), Y(0.022))
  ctx.lineTo(X(0.884), Y(0.022))
  ctx.closePath()
  const shade = ctx.createLinearGradient(0, Y(0.022), 0, Y(0.125))
  shade.addColorStop(0, '#d59548')
  shade.addColorStop(1, '#ffe4b4')
  ctx.fillStyle = shade
  ctx.fill()
  ctx.restore()
  wash(0.928, 0.125, 0.14, '#ffd89a', 1)

  // ---------------------------------------------------------------- the couch
  // One long mass across the back, because a room with nothing to sit on is a
  // corridor. What makes it read is the top edge catching the lamp and the
  // cushions breaking the line, not the detail — at this distance there is no
  // detail to have.
  slab(0.15, 0.09, 0.72, 0.24, 0.03, '#2b2437')
  // The seat, a shade lighter and set back inside the frame of the arms.
  slab(0.175, 0.128, 0.67, 0.11, 0.024, '#3a3049')
  // Arms.
  slab(0.15, 0.115, 0.055, 0.14, 0.022, '#251f31')
  slab(0.765, 0.115, 0.055, 0.14, 0.022, '#2e2537')
  // Cushions, each catching the light from the side it faces.
  const cushions: ReadonlyArray<readonly [number, string]> = [
    [0.222, '#453a5c'],
    [0.37, '#3b3250'],
    [0.52, '#463a55'],
    [0.665, '#5b4551'],
  ]
  for (const [u, fill] of cushions) slab(u, 0.126, 0.13, 0.084, 0.02, fill)
  // A throw over the near arm, in the one colour this room owns.
  slab(0.192, 0.132, 0.08, 0.078, 0.018, '#55497e')
  // The lamp rakes across the top of the back, which is what gives it an edge.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const rake = ctx.createLinearGradient(X(1), 0, X(0.15), 0)
  rake.addColorStop(0, 'rgba(255,196,128,0.75)')
  rake.addColorStop(1, 'rgba(255,196,128,0)')
  ctx.fillStyle = rake
  ctx.fillRect(X(0.15), Y(0.09), S(0.72), S(0.014))
  ctx.fillRect(X(0.765), Y(0.09), S(0.055), S(0.165))
  ctx.restore()

  // --------------------------------------------------------------- the plants
  // Dark fronds in both near corners, which is what stops the frame reading as
  // a stage set with nothing in the wings. Almost black: they are between the
  // lights and the camera, so they are silhouettes.
  const frond = (u: number, v: number, len: number, angle: number, fill: string) => {
    ctx.save()
    ctx.translate(X(u), Y(v))
    ctx.rotate(angle)
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.ellipse(0, 0, S(len), S(len * 0.15), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  for (let i = 0; i < 9; i += 1) {
    frond(0.01, 0.33, 0.13 + ((i * 3) % 4) * 0.022, -1.35 + i * 0.29, '#0b1710')
  }
  for (let i = 0; i < 8; i += 1) {
    frond(0.995, 0.3, 0.12 + ((i * 5) % 4) * 0.024, 1.35 - i * 0.3, '#0d1711')
  }

  // ------------------------------------------------- what the room reflects
  // The floor is polished, so both lights come back up out of it, stretched.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = (u: number, colour: string, alpha: number, spread: number) => {
    const g = ctx.createRadialGradient(X(u), Y(HORIZON), 0, X(u), Y(HORIZON), S(spread))
    g.addColorStop(0, colour)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.fillRect(0, Y(HORIZON), width, height - Y(HORIZON))
    ctx.globalAlpha = 1
  }
  glow(0.08, '#3d5da8', 0.5, 0.42)
  glow(0.92, '#a8641b', 0.55, 0.4)
  ctx.restore()

  // ---------------------------------------------------------------- the lights
  // Two passes each: a soft halo and a brighter core, because that is what a
  // lens actually does to a point of light it is not focused on.
  for (const b of BOKEH) {
    wash(b.u, b.v, b.r * 2.2, b.colour, b.alpha * 0.35)
    ctx.globalAlpha = b.alpha
    ctx.fillStyle = b.colour
    ctx.filter = `blur(${Math.round(S(b.r) * 0.3)}px)`
    ctx.beginPath()
    ctx.arc(X(b.u), Y(b.v), S(b.r), 0, Math.PI * 2)
    ctx.fill()
    ctx.filter = 'none'
    ctx.globalAlpha = 1
  }

  // ------------------------------------------------------------ out of focus
  // Everything above is drawn sharp and then thrown out of focus in one pass,
  // the way the lens would. Drawing it soft in the first place gives mush;
  // blurring edges that were crisp gives the bloom around the bright parts.
  const sharp = ctx.getImageData(0, 0, width, height)
  const buffer = document.createElement('canvas')
  buffer.width = width
  buffer.height = height
  const bufferCtx = buffer.getContext('2d')
  if (bufferCtx !== null) {
    bufferCtx.putImageData(sharp, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.filter = `blur(${Math.round(S(0.0065))}px)`
    ctx.drawImage(buffer, 0, 0)
    ctx.filter = 'none'
  }

  // ---------------------------------------------------------------- vignette
  // The corners of a photograph are darker than the middle. It is also what
  // keeps the player's eye on the table rather than on the furniture.
  const corner = ctx.createRadialGradient(
    width / 2,
    Y(0.42),
    S(0.2),
    width / 2,
    Y(0.42),
    S(0.95),
  )
  corner.addColorStop(0, 'rgba(0,0,0,0)')
  corner.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = corner
  ctx.fillRect(0, 0, width, height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** The soft dark pool a table sits in, rather than a shadow of one. */
function poolTexture(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the pool')

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.8)')
  g.addColorStop(0.42, 'rgba(0,0,0,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  return new CanvasTexture(canvas)
}

/**
 * How the floor stops.
 *
 * Opaque to well past the table, then gone. A hard rim reads as the edge of a
 * platter; a dissolve reads as a floor running out into an unlit room.
 */
function floorFade(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the floor')

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#fff')
  g.addColorStop(0.26, '#fff')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  return new CanvasTexture(canvas)
}

export function makeRoom(): Group {
  const group = new Group()

  /*
   * The card, square to the camera and exactly filling the frame.
   *
   * Unlit, because it is a photograph of a room rather than a wall in this one,
   * and lighting it would flatten the bokeh into grey discs.
   *
   * Not tone-mapped either, and that is the right way round: this card is
   * painted, and a painted backdrop is graded by whoever painted it rather
   * than by the pipeline. Run through ACES with everything else it came out
   * eight percent off the look it was drawn to match, where left alone it is
   * two — the curve was undoing decisions already made by hand.
   *
   * What it did need was dimming. It was as bright as the timber in front of
   * it, which in the lobby — where this card fills a third of the screen —
   * made the couch a pale lilac smear competing with the table for the eye.
   * The table is the lit thing in this room; the room is what it is lit
   * against, and a backdrop that matches its subject for brightness is a
   * backdrop nobody looks past.
   */
  const height = 2 * Math.tan((CAMERA.fov * Math.PI) / 360) * DEPTH
  const shell = new Mesh(
    new PlaneGeometry(height * STAGE_ASPECT, height),
    new MeshBasicMaterial({
      map: roomTexture(),
      toneMapped: false,
      color: new Color('#c8c2cb'),
    }),
  )
  const eye = new Vector3(0, CAMERA.height, CAMERA.distance)
  const aim = new Vector3(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z)
  shell.position.copy(eye).addScaledVector(aim.clone().sub(eye).normalize(), DEPTH)
  shell.lookAt(eye)
  group.add(shell)

  /*
   * The floor the table stands on.
   *
   * Small enough to stay well in front of the card and faded at the rim, so
   * where it ends there is no line — the room's own painted floor carries on
   * behind it. Two flat planes meeting is the most reliable way to make a
   * render look like two images stacked on top of each other.
   */
  const floor = new Mesh(
    new CircleGeometry(3.4, 96),
    new MeshStandardMaterial({
      color: new Color('#1a1219'),
      roughness: 0.55,
      metalness: 0.12,
      alphaMap: floorFade(),
      transparent: true,
      depthWrite: false,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.78
  /*
   * The floor takes no shadows.
   *
   * The key light is above and a little behind, so a cup at the near rim casts
   * forward and clean off the table — which landed as two hard black blobs on
   * the floor in front, reading as stains rather than as light. What the floor
   * actually needs from the table is one soft pool underneath it, which is the
   * disc below, not six sharp silhouettes of objects it cannot see.
   */
  floor.receiveShadow = false
  group.add(floor)

  const pool = new Mesh(
    new CircleGeometry(1.9, 64),
    new MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = -0.775
  pool.renderOrder = 1
  group.add(pool)

  return group
}
