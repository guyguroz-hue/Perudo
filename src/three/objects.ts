import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { CROWN_PATH } from './crown'
import { CUP_FOOT, INLAY_RADIUS } from './layout'
import { woodTexture } from './textures'

/**
 * The objects on the table, as real geometry.
 *
 * A cup is a solid of revolution — which is exactly what a lathe does, and
 * exactly how a real one is made. Giving it a profile rather than drawing a
 * trapezoid is what fixes the thing that never looked right in CSS: its base
 * is a circle, so where it meets the table it reads as a circle seen at an
 * angle, and it is lit from the same direction as everything else.
 */

/** The table's radius is 1. Everything else is in those units. */
export const TABLE_RADIUS = 1

/** How far from the middle the cups stand. */
export const SEAT_RADIUS = 0.7

/*
 * A dice cup is about as tall as it is wide across the base, and it barely
 * tapers.
 *
 * The taper was a third, and a third is a flowerpot. A real dice cup is close
 * to a straight-sided tumbler with just enough draft to come out of the mould
 * and to stack — the silhouette says "cup" before any colour does, and this
 * one was saying "plant". Side by side with the reference it was the single
 * loudest difference left in the picture, well ahead of any colour.
 *
 * Shorter and rounder than this and it goes the other way: the first attempt
 * domed the top and came out looking like a bottle cap.
 */
const CUP_BASE = 0.12
const CUP_TOP = 0.1
export const CUP_HEIGHT = 0.232

/**
 * The table: a flat top with a bullnose edge you can see from a seated eye.
 *
 * Built as three pieces rather than one lathe, because the top needs flat
 * planar texture coordinates for the grain to run across it, and a lathe wraps
 * its texture round the axis — which would spin the grain into a whirlpool.
 */
export function makeTable(): Group {
  const group = new Group()
  const { map, rough } = woodTexture()

  const wood = new MeshPhysicalMaterial({
    map,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    // A bar table is lacquered, and the lacquer is a separate layer sitting on
    // the grain: it reflects the room evenly while the wood underneath does not.
    // Thin enough that the grain still shows through — a heavy clearcoat turns
    // the whole tabletop into one soft highlight and the wood stops existing —
    // but not so thin that the lamp leaves no band across it. That band is what
    // says "polished", and half of what says the table is a real object.
    //
    // Satin rather than gloss, which is the thing that finally produced one. At
    // a tenth the lacquer mirrors the lamp as a small hard spot near the middle
    // and the rest of the timber is left evenly lit and flat; opened up, the
    // same reflection spreads into a broad sweep across the top and falls away
    // at the front corners. It is also what a bar table actually is — nobody
    // polishes one to a mirror, and the ones that are look like plastic.
    clearcoat: 0.72,
    clearcoatRoughness: 0.36,
    envMapIntensity: 1.15,
  })

  const top = new Mesh(new CircleGeometry(TABLE_RADIUS * 0.985, 128), wood)
  top.rotation.x = -Math.PI / 2
  top.receiveShadow = true
  // The table casts as well as receives, so the floor gets one shadow of the
  // table rather than six loose cup shadows drifting across it.
  top.castShadow = true
  group.add(top)

  // The edge, and the reason the camera reads as seated rather than overhead.
  const profile = [
    new Vector2(0.985, 0),
    new Vector2(0.999, -0.014),
    new Vector2(1.004, -0.034),
    new Vector2(0.999, -0.058),
    new Vector2(0.982, -0.076),
    new Vector2(0.945, -0.09),
    new Vector2(0.9, -0.095),
  ]
  const edge = new Mesh(
    new LatheGeometry(profile, 128),
    new MeshPhysicalMaterial({
      color: new Color('#4a2f1c'),
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
      side: DoubleSide,
    }),
  )
  group.add(edge)

  const underside = new Mesh(
    new CircleGeometry(0.9, 96),
    new MeshStandardMaterial({ color: new Color('#1b0d05'), roughness: 0.9 }),
  )
  underside.rotation.x = Math.PI / 2
  underside.position.y = -0.095
  group.add(underside)

  return group
}

/**
 * The ring inlaid in the middle of the table.
 *
 * The centre of the table carries the bid, and it was carrying it on bare
 * timber: the brand etched into the grain is the right mark for a maker's
 * plate and the wrong one for the place every decision in the game is read
 * from. Nothing said "look here", so nothing did.
 *
 * A brass line with a cool bloom inside it. The line belongs to the table —
 * the same metal as every cup's foot and coaster — and the bloom does not: it
 * is the one light in the scene that is not the lamp, which is exactly why the
 * eye goes to it in a room lit entirely in amber. Two rings rather than a lit
 * disc, because a disc would be a glowing tabletop and this has to stay a
 * thing inlaid *into* a tabletop.
 *
 * Unlit on purpose. A real emissive would bounce through the environment map
 * and wash the timber around it pale; this is a mark on the surface that
 * happens to be bright, and it costs one draw call and no light.
 */
export function makeInlay(): Group {
  const group = new Group()

  /*
   * The inlaid surface: a shade darker and a shade cooler than the timber.
   *
   * This began as a glow added to the wood, which could not work, and it took
   * a while to see why. Adding light to cherry under an amber lamp cannot
   * produce a cool colour — the red channel is already near the top, so
   * whatever goes in comes back peach, and every attempt to correct for that
   * by writing the gradient bluer just made a paler peach.
   *
   * The reference's centre is not a glow on a tabletop at all. It is a piece
   * inlaid *into* one, with its own darker surface and a lit edge. Rendered as
   * what it is, the cool arrives for nothing — and the bid stops being read
   * off bright orange, which it had been all along.
   */
  const surface = new Mesh(
    new CircleGeometry(INLAY_RADIUS * 1.12, 96),
    new MeshBasicMaterial({
      map: inlaySurface(),
      transparent: true,
      // Outside the tone curve. ACES rolls a saturated colour at strength off
      // toward white, which is the right treatment of a highlight and the
      // wrong one for the only cool thing in a room lit entirely in amber.
      toneMapped: false,
      depthWrite: false,
    }),
  )
  surface.rotation.x = -Math.PI / 2
  surface.position.y = 0.0016
  surface.renderOrder = 1
  group.add(surface)

  /*
   * The brass line itself, lit from within.
   *
   * A metal ring lying flat reflects what is above it, and what is above this
   * table is an unlit ceiling — so an honest brass ring here came out as a
   * *dark* line scored into the wood, which is the opposite of the job. A
   * little emissive is not cheating: the inlay is meant to be catching the
   * bloom sitting on top of it, and this is what that would look like.
   */
  const line = new Mesh(
    new RingGeometry(INLAY_RADIUS - 0.009, INLAY_RADIUS, 128),
    new MeshStandardMaterial({
      color: new Color('#e8bd72'),
      roughness: 0.18,
      metalness: 1,
      emissive: new Color('#8a6a34'),
      emissiveIntensity: 1,
    }),
  )
  line.rotation.x = -Math.PI / 2
  line.position.y = 0.0018
  group.add(line)

  return group
}

/**
 * The inlay's surface, drawn once.
 *
 * Dark and cool in the middle, a violet rim just inside where the brass line
 * sits, and nothing at all at the outer edge — so there is no boundary between
 * the inlay and the timber, which is what a piece set into a tabletop and
 * levelled flush with it actually looks like. A hard edge here would read as a
 * decal; a flat disc would read as a stain.
 */
let inlayMap: CanvasTexture | null = null

function inlaySurface(): CanvasTexture {
  if (inlayMap !== null) return inlayMap

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the inlay')

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // Light enough that the mark cut into the timber still reads through it.
  // The inlay is a piece set into the table, not a lid over it, and the
  // maker's plate lives underneath.
  gradient.addColorStop(0, 'rgba(26, 20, 46, 0.34)')
  gradient.addColorStop(0.62, 'rgba(34, 28, 62, 0.34)')
  gradient.addColorStop(0.8, 'rgba(92, 88, 186, 0.48)')
  gradient.addColorStop(0.888, 'rgba(158, 158, 255, 0.54)')
  gradient.addColorStop(0.93, 'rgba(92, 88, 190, 0.16)')
  gradient.addColorStop(1, 'rgba(40, 34, 80, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  inlayMap = new CanvasTexture(canvas)
  /*
   * Declared sRGB, which none of the generated overlays were.
   *
   * A canvas holds sRGB values, and a texture that does not say so is read as
   * linear: every colour comes out pale and washed, which on anything
   * saturated is most of the way to grey. It is the kind of mistake that looks
   * like a design decision — the mark is *there*, it is simply the wrong
   * colour, and no amount of adjusting the gradient fixes it.
   */
  inlayMap.colorSpace = SRGBColorSpace
  return inlayMap
}

/**
 * The light a cup stands in when it is that player's turn.
 *
 * The product has had a rule about this colour since before the table was
 * drawn — electric blue is the turn and appears nowhere else, which is what
 * makes it impossible to miss — and the table was the one place not keeping
 * it. Whose turn it was lived entirely in the badges, around the edge of the
 * picture, while the thing a waiting player is looking at is the cups.
 *
 * A ring on the timber rather than a tint on the cup, for the same reason the
 * inlay is a ring: the cup is the player's colour and has to stay it. This is
 * light falling on the table in front of them.
 *
 * Built for every seat and shown on one, so the scene can move it without
 * rebuilding a cup — the turn moves on every single move, and a cup rebuilt
 * that often would throw away whatever animation was running on it.
 */
export function makeTurnRing(): Mesh {
  const ring = new Mesh(
    new CircleGeometry(CUP_FOOT * 2.1, 64),
    new MeshBasicMaterial({
      map: turnFalloff(),
      transparent: true,
      /*
       * Painted, not added — the opposite of what physics says, and the only
       * thing that works here.
       *
       * Added, this is blue light falling on cherry under a warm lamp, and
       * that is honestly what it looks like: a grey smudge. The colour is the
       * whole point of this mark, so it is laid over the wood instead, and the
       * soft edges on both sides are what keep it light rather than a sticker.
       */
      toneMapped: false,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.0022
  ring.renderOrder = 2
  ring.visible = false
  return ring
}

/**
 * A ring of blue with soft edges on both sides.
 *
 * Transparent in the middle, because the cup is standing there: lighting the
 * timber underneath would put the halo through the object rather than round it.
 */
let turnMap: CanvasTexture | null = null

function turnFalloff(): CanvasTexture {
  if (turnMap !== null) return turnMap

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the turn ring')

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(40, 96, 220, 0)')
  gradient.addColorStop(0.46, 'rgba(40, 104, 230, 0.1)')
  gradient.addColorStop(0.58, 'rgba(96, 170, 255, 0.92)')
  gradient.addColorStop(0.66, 'rgba(52, 128, 250, 0.5)')
  gradient.addColorStop(0.82, 'rgba(36, 96, 220, 0.12)')
  gradient.addColorStop(1, 'rgba(30, 80, 200, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  turnMap = new CanvasTexture(canvas)
  turnMap.colorSpace = SRGBColorSpace
  return turnMap
}

/**
 * A cup.
 *
 * Lacquer over an opaque body, with a brass foot. The profile runs from the
 * wide base up to a rounded shoulder and a slightly domed top, which is the
 * silhouette that says "dice cup" before any colour does.
 */
export function makeCup(colour: string): Group {
  const group = new Group()

  /*
   * The top has to be flat, and visibly flat.
   *
   * From a seat you barely see it and almost anything passes. The near cup is
   * a different question: the eye is forty degrees up and eighteen inches away
   * from it, so its top face is a large ellipse filling the middle of the
   * screen — and a top that eases into the axis over four points reads from
   * there as a dome. It stopped being the same object as the five cups around
   * it, which is the one thing six identical cups must not do.
   *
   * So the wall ends, a tight chamfer turns the corner, and the lid is a disc
   * at one height. The chamfer is what catches the lamp as a hard line round
   * the rim, and that line is what says "flat" before the shading does.
   */
  const wall: Vector2[] = [
    new Vector2(CUP_BASE, 0.0),
    new Vector2(CUP_BASE - 0.001, 0.022),
    // A straight taper, which is what a moulded cup actually is.
    new Vector2(CUP_TOP + 0.006, CUP_HEIGHT - 0.026),
    new Vector2(CUP_TOP, CUP_HEIGHT - 0.014),
    new Vector2(CUP_TOP - 0.005, CUP_HEIGHT - 0.0015),
    new Vector2(CUP_TOP - 0.013, CUP_HEIGHT),
    // The lid sinks, the way the closed end of a moulded cup does where the
    // wall meets it. Flat, it was a mirror the size of a thumbnail pointed
    // straight back at the lamp: the near cup came back with one hard blob of
    // light across its whole top and read as an egg. Dished by four
    // thousandths, the same reflection stretches into a ring round the rim —
    // which is both what the real object does and the thing that makes it
    // legible as a lid rather than a dome.
    new Vector2(CUP_TOP - 0.024, CUP_HEIGHT - 0.0045),
    new Vector2(CUP_TOP - 0.05, CUP_HEIGHT - 0.0065),
    new Vector2(0, CUP_HEIGHT - 0.007),
  ]

  /*
   * Deep body, hot lacquer.
   *
   * The range from the shaded side of a cup to its highlight is what makes it
   * an object rather than a coloured shape, and that range is bought with a
   * dark albedo and a tight clearcoat lobe — not with a brighter colour. A
   * mid-value body with the same clearcoat has the highlight sitting on top of
   * something already pale, so there is nowhere for it to travel.
   */
  const body = new Mesh(
    new LatheGeometry(wall, 96),
    new MeshPhysicalMaterial({
      color: new Color(colour),
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      /*
       * Blurred, not mirrored.
       *
       * At a near-zero clearcoat roughness the lacquer reflects the room
       * sharply, and on the one cup whose flat lid faces the camera that put a
       * hand-sized white blob dead centre — the near cup stopped reading as a
       * cup and started reading as an egg. Real moulded lacquer scatters a
       * little; giving it that turns the blob back into a sheen and leaves the
       * hard line round the rim, which is the highlight that was doing the work
       * anyway.
       */
      clearcoatRoughness: 0.14,
      // The lacquer picks the room up as well as the lamp, which is what stops
      // the unlit side of a cup going to flat black.
      envMapIntensity: 1.0,
      side: DoubleSide,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  /*
   * The brass foot every cup shares, whatever colour its body is.
   *
   * A band, not a plinth. It stood a ninth of the cup's height and flared past
   * the base, and at full polish that much metal caught the lamp as a gold
   * ellipse wider and brighter than the cup standing in it — the eye went to
   * the trim instead of the object. On the real thing it is a rim you notice
   * second.
   */
  const foot = new Mesh(
    new LatheGeometry(
      [
        new Vector2(CUP_BASE + 0.003, 0.0),
        new Vector2(CUP_BASE + 0.004, 0.004),
        new Vector2(CUP_BASE + 0.0005, 0.011),
        new Vector2(CUP_BASE - 0.004, 0.014),
      ],
      96,
    ),
    new MeshStandardMaterial({
      color: new Color('#a8802f'),
      roughness: 0.36,
      metalness: 1,
      side: DoubleSide,
    }),
  )
  foot.castShadow = true
  group.add(foot)

  // The crown, stamped into the lacquer. Placed facing the viewer rather than
  // wrapped round the cup: the body is a solid of revolution and turning it
  // changes nothing except where the mark ends up, so it may as well end up
  // where it can be seen.
  const mark = new Mesh(
    new PlaneGeometry(0.062, 0.043),
    new MeshStandardMaterial({
      color: new Color('#d8a94e'),
      /*
       * Barely metal, and smaller than it was.
       *
       * A mark this size at full metalness mirrors the environment rather than
       * reflecting it, so it came back white — a bright blob the size of a
       * thumbnail, competing with the cup it is stamped on. It is a pressed
       * foil transfer, not a casting: it wants to read as gold, which means
       * keeping its own colour and taking only a sheen from the room.
       */
      roughness: 0.42,
      metalness: 0.35,
      transparent: true,
      alphaMap: crownStamp(),
      alphaTest: 0.28,
    }),
  )
  mark.position.set(0, CUP_HEIGHT * 0.33, CUP_TOP + 0.03)
  // Leaned back to lie along the cup's taper rather than floating off it.
  mark.rotation.x = -0.1
  group.add(mark)

  /*
   * The dark ring it stands on, which is what stops a cup floating.
   *
   * Its radius comes from layout, not from here. The badges hung below the
   * near cups are placed to clear this exact circle, and a coaster widened in
   * this file while that number stayed where it was would put a name back on
   * top of a cup with nothing to connect the two.
   */
  const coaster = new Mesh(
    new CircleGeometry(CUP_FOOT, 64),
    new MeshStandardMaterial({ color: new Color('#0c0705'), roughness: 0.62 }),
  )
  coaster.rotation.x = -Math.PI / 2
  coaster.position.y = 0.0015
  group.add(coaster)

  /*
   * A brass line round the coaster's edge.
   *
   * The cup already wears brass at its foot, and the coaster was the one part
   * of the assembly with no metal on it at all — so from a seat it read as a
   * soft shadow the cup happened to be standing in rather than as a mat the cup
   * had been set down on. A single lit ring is enough to say the difference,
   * and it catches the lamp from every seat because it is a ring.
   */
  const trim = new Mesh(
    new RingGeometry(CUP_FOOT - 0.006, CUP_FOOT, 64),
    new MeshStandardMaterial({
      // Darker and rougher than the cup's own foot. It is a mat under an
      // object, not a second piece of trim on it: lit like the foot it read as
      // a bright gold ellipse wider than the cup, which is the one thing on
      // the table that should not be catching the eye.
      color: new Color('#5d4419'),
      roughness: 0.55,
      metalness: 1,
    }),
  )
  trim.rotation.x = -Math.PI / 2
  trim.position.y = 0.002
  group.add(trim)

  return group
}

/**
 * The crown, drawn once and reused by every cup.
 *
 * The same path the interface uses for its own crown, so the mark on a cup and
 * the mark in the lobby are one shape rather than two drawings of one.
 */
let stamp: CanvasTexture | null = null

function crownStamp(): CanvasTexture {
  if (stamp !== null) return stamp

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.round(size * 0.6875)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context for the crown')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  // The path is drawn in a 32x22 box; scale it to fill the canvas.
  ctx.scale(size / 32, size / 32)
  for (const d of CROWN_PATH) ctx.fill(new Path2D(d))

  stamp = new CanvasTexture(canvas)
  return stamp
}
