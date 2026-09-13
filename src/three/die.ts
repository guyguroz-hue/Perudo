import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three'
import { JOKER_BOX, JOKER_PATHS } from './joker'

/**
 * A die.
 *
 * Rounded like a real one, which is most of why a rendered die reads as an
 * object rather than as a cube: the corners catch the light and the edges
 * carry a thin highlight all the way round.
 *
 * Built from a box rather than from a sphere. A sphere pushed into a cube is
 * the usual trick and it gives lovely geometry with useless texture
 * coordinates — the faces would be slices of a globe. A box already has six
 * flat faces, each with its own square coordinates and its own material slot,
 * so pushing *that* toward a rounded cube keeps the pips where they belong.
 */

export const DIE_SIZE = 0.078

/** How square the die is. Higher is sharper; 5 is a well-worn casino die. */
const ROUNDNESS = 5

let geometry: BufferGeometry | null = null

function dieGeometry(): BufferGeometry {
  if (geometry !== null) return geometry

  const box = new BoxGeometry(1, 1, 1, 12, 12, 12)
  const position = box.attributes.position

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) * 2
    const y = position.getY(i) * 2
    const z = position.getZ(i) * 2

    // The superquadric: the surface where |x|^n + |y|^n + |z|^n = 1. At n = 2
    // this is a sphere and at infinity it is a cube; in between is a die.
    const d = Math.pow(
      Math.pow(Math.abs(x), ROUNDNESS) +
        Math.pow(Math.abs(y), ROUNDNESS) +
        Math.pow(Math.abs(z), ROUNDNESS),
      -1 / ROUNDNESS,
    )
    position.setXYZ(i, x * d * 0.5, y * d * 0.5, z * d * 0.5)
  }

  box.computeVertexNormals()
  geometry = box
  return box
}

/** Pip positions on the 3x3 grid, as fractions of the face. */
const PIPS: Record<number, readonly [number, number][]> = {
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.5], [0.73, 0.5], [0.27, 0.73], [0.73, 0.73]],
}

const faces = new Map<number, CanvasTexture>()

/**
 * One face, drawn.
 *
 * The one is never a numeral and never a single pip: it is the Joker, drawn
 * from the same path the interface uses, so the wildcard is one mark
 * everywhere it appears.
 */
function faceTexture(face: number): CanvasTexture {
  const cached = faces.get(face)
  if (cached !== undefined) return cached

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for a die face')

  ctx.fillStyle = '#f7f2e6'
  ctx.fillRect(0, 0, size, size)
  /*
   * Nearly black, and blacker than the pip anywhere else in the product.
   *
   * A pip drawn flat on a screen keeps whatever colour it was given. This one
   * is a texture on an object: it is lit, it is under a clearcoat, and at the
   * size a die occupies on a phone it is a handful of pixels being averaged
   * with the bone around it by the mipmap. Every one of those steps lifts it
   * toward the face it is drawn on, so it starts further down than the flat
   * die's #1b1712 in order to arrive in the same place.
   */
  ctx.fillStyle = '#07060a'

  if (face === 1) {
    // The crown sits on the face rather than filling it, and it is wider than
    // it is tall, so it is centred on both axes from its own box rather than
    // from a square it does not fill.
    ctx.save()
    const mark = size * 0.66
    const scale = mark / JOKER_BOX.width
    ctx.translate((size - mark) / 2, (size - JOKER_BOX.height * scale) / 2)
    ctx.scale(scale, scale)
    for (const d of JOKER_PATHS) ctx.fill(new Path2D(d))
    ctx.restore()
  } else {
    for (const [u, v] of PIPS[face]) {
      ctx.beginPath()
      // A fifth of the face across, which is what the flat die uses. It was
      // 17%, and the difference is most of why the two did not look like the
      // same die — the count was readable on one and a smudge on the other.
      ctx.arc(u * size, v * size, size * 0.11, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  faces.set(face, texture)
  return texture
}

/**
 * Which face points which way.
 *
 * BoxGeometry's material slots run +x, -x, +y, -y, +z, -z. Opposite faces of a
 * die sum to seven, and that is not decoration — a die with two and five
 * adjacent is a die somebody made up.
 */
const FACE_ORDER = [3, 4, 1, 6, 5, 2]

/**
 * A die's six faces, so they can be dimmed.
 *
 * Handed back with the die rather than dug out of the mesh later: `material`
 * on a multi-material mesh is an array of `Material`, and narrowing it back to
 * the physical material it was created as is a cast that would silently stop
 * being true the day the die is built from something else.
 */
export interface Die {
  readonly group: Group
  readonly faces: readonly MeshPhysicalMaterial[]
}

export function makeDie(): Die {
  const group = new Group()

  const materials: MeshPhysicalMaterial[] = FACE_ORDER.map(
    (face) =>
      new MeshPhysicalMaterial({
        map: faceTexture(face),
        color: new Color('#ffffff'),
        /*
         * Less of a sheen than a die on a shelf would have.
         *
         * The lamp is nearly overhead and, during a reveal, so is the camera —
         * so the top face of every die reflects the light straight back at the
         * viewer, exactly across the pips they are being asked to count. A
         * glossier die is a prettier object and a worse number.
         */
        roughness: 0.46,
        metalness: 0,
        clearcoat: 0.28,
        clearcoatRoughness: 0.35,
      }),
  )

  const mesh = new Mesh(dieGeometry(), materials as Material[])
  mesh.scale.setScalar(DIE_SIZE)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  return { group, faces: materials }
}

/** Bone, and bone pushed back into the shadows. */
const LIT = new Color('#ffffff')
const DIMMED = new Color('#4f4a43')

/**
 * How far a die that does not count has faded, 0 to 1.
 *
 * Dimming the rest rather than lighting the ones that count. A bid is a claim
 * about a number, and the number is what the player is being asked to accept:
 * six hands of five dice is thirty objects, and counting the fives among thirty
 * identical objects on a phone is the arithmetic the reveal exists to spare
 * them. Take the others down and the count is not read, it is seen.
 */
export function fadeDie(die: Die, amount: number): void {
  const t = Math.min(1, Math.max(0, amount))
  for (const face of die.faces) face.color.copy(LIT).lerp(DIMMED, t)
}

/**
 * How to turn a die so a given face points up.
 *
 * Euler angles chosen per face rather than computed, because there are six of
 * them and a lookup that can be read is worth more than a rotation that has to
 * be trusted.
 */
export const FACE_UP: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [-Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
}
