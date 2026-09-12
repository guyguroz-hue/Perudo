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
} from 'three'

/**
 * The room the table is in.
 *
 * Without it the table floats in black, and most of what makes a render look
 * expensive is not the object — it is what is behind and around it. This is a
 * painted backdrop on the inside of a sphere plus a floor, both generated:
 * a dark lounge at night, a cold window on one side, a warm lamp on the other,
 * and the soft out-of-focus lights a camera gives you at a wide aperture.
 *
 * Painted rather than photographed on purpose. A captured panorama is a couple
 * of megabytes on the critical path of a game people open on a phone, and it
 * brings its own room with it — one that will never quite agree with the lights
 * in this scene. This one is written from the same description as the image
 * based light, so they cannot disagree.
 */

/** Softly drawn discs of light, the way an out-of-focus lamp reads. */
interface Bokeh {
  readonly u: number
  readonly v: number
  readonly r: number
  readonly colour: string
  readonly alpha: number
}

/*
 * Placed in the strip the camera actually shows.
 *
 * Between the top of the frame and the far edge of the floor there is about a
 * fifth of the picture of open room, and that is the whole of it: everything
 * higher is cropped, everything lower is behind the floor. Lights painted
 * outside that band are lights nobody in this game will ever see.
 */
const BOKEH: readonly Bokeh[] = [
  { u: 0.79, v: 0.605, r: 0.055, colour: '#ffbe6e', alpha: 0.62 },
  { u: 0.71, v: 0.655, r: 0.03, colour: '#ffcf93', alpha: 0.42 },
  { u: 0.87, v: 0.648, r: 0.022, colour: '#ffae55', alpha: 0.38 },
  { u: 0.93, v: 0.618, r: 0.036, colour: '#ff9c3f', alpha: 0.3 },
  { u: 0.11, v: 0.632, r: 0.045, colour: '#7fa8ff', alpha: 0.38 },
  { u: 0.2, v: 0.608, r: 0.026, colour: '#a9c4ff', alpha: 0.3 },
  { u: 0.04, v: 0.66, r: 0.03, colour: '#6f93e8', alpha: 0.26 },
  { u: 0.4, v: 0.628, r: 0.02, colour: '#ffd9a8', alpha: 0.2 },
  { u: 0.58, v: 0.648, r: 0.028, colour: '#ffc78a', alpha: 0.24 },
  { u: 0.3, v: 0.652, r: 0.018, colour: '#9fb8ff', alpha: 0.18 },
  { u: 0.5, v: 0.615, r: 0.014, colour: '#ffe0b8', alpha: 0.16 },
]

function backdropTexture(width = 2048): CanvasTexture {
  const height = Math.round(width * 0.58)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the backdrop')

  // The room: black above, a shade warmer toward the floor.
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#04040a')
  sky.addColorStop(0.34, '#0a0910')
  sky.addColorStop(0.66, '#161013')
  sky.addColorStop(1, '#0a070c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  const wash = (x: number, y: number, r: number, colour: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, colour)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.globalAlpha = 1
  }

  // The window, cold and wide, low on the left.
  wash(width * 0.1, height * 0.56, width * 0.34, '#4a72cc', 0.85)
  // The lamp, warm and tighter, on the right.
  wash(width * 0.86, height * 0.52, width * 0.3, '#d8891f', 1)
  // A little bounce off the ceiling.
  wash(width * 0.5, height * 0.2, width * 0.5, '#2b2740', 0.5)

  /*
   * Where the room goes down into the floor.
   *
   * The floor is a disc, and a disc has an edge. Painted the same colour the
   * floor is, and reaching it before the floor's far rim comes into frame, the
   * edge stops being a line across the picture and becomes the far end of a
   * dark room. Getting this wrong is what makes a render look like two images
   * stacked on top of each other.
   */
  const band = ctx.createLinearGradient(0, height * 0.66, 0, height * 0.76)
  band.addColorStop(0, 'rgba(9, 7, 14, 0)')
  band.addColorStop(0.55, 'rgba(9, 7, 14, 0.74)')
  band.addColorStop(1, 'rgb(12, 10, 16)')
  ctx.fillStyle = band
  ctx.fillRect(0, height * 0.66, width, height * 0.34)

  // The lights themselves, thrown out of focus. Two passes: a soft halo and a
  // brighter core, because that is what a lens actually does to a point.
  for (const b of BOKEH) {
    const x = b.u * width
    const y = b.v * height
    const r = b.r * width
    wash(x, y, r * 2.1, b.colour, b.alpha * 0.35)
    ctx.globalAlpha = b.alpha
    ctx.fillStyle = b.colour
    ctx.filter = `blur(${Math.round(r * 0.32)}px)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.filter = 'none'
    ctx.globalAlpha = 1
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
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
  g.addColorStop(0.52, '#fff')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  return new CanvasTexture(canvas)
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

export function makeRoom(): Group {
  const group = new Group()

  /*
   * A flat backdrop standing behind the table rather than a sphere around it.
   *
   * A panorama has to be art-directed in spherical coordinates and then read
   * back through whatever slice the camera happens to take — which meant the
   * lights kept landing where nobody could see them. A plane facing the camera
   * is painted in exactly the frame it will appear in.
   *
   * Unlit on purpose: it is a photograph of a room, not a wall in this one, and
   * lighting it would flatten the bokeh into grey discs.
   */
  const shell = new Mesh(
    new PlaneGeometry(30.8, 17.9),
    new MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }),
  )
  /*
   * Far enough back that the floor never reaches it.
   *
   * Standing closer, the backdrop cut straight through the floor — and the
   * intersection of an opaque wall and a flat plane is a hard horizontal line
   * across the middle of the picture, which is the single most reliable way to
   * make a render look like two images stacked on top of each other. Pushed
   * out past the floor's own edge, the floor dissolves into open room instead,
   * and the wall is only ever the thing behind it.
   *
   * The size grows with the distance, along the same ray from the camera, so
   * the frame it was painted for is still the frame it fills.
   */
  shell.position.set(0, 1.866, -12)
  group.add(shell)

  // The floor. Without something under the table it reads as a disc in space,
  // and the shadow it casts has nowhere to land.
  const floor = new Mesh(
    new CircleGeometry(9, 96),
    new MeshStandardMaterial({
      color: new Color('#0c0a10'),
      roughness: 0.62,
      metalness: 0.1,
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
