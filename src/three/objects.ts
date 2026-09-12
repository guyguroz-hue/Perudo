import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from 'three'
import { CROWN_PATH } from './crown'
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
 * A dice cup is about as tall as it is wide across the base, and tapers by
 * roughly a third. Shorter and rounder than that and it stops being a cup: the
 * first attempt domed the top and came out looking like a bottle cap.
 */
const CUP_BASE = 0.12
const CUP_TOP = 0.085
export const CUP_HEIGHT = 0.225

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
    // Lacquer, but thin. A heavy clearcoat turns the whole tabletop into one
    // soft highlight and the wood underneath stops being visible.
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
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
 * A cup.
 *
 * Lacquer over an opaque body, with a brass foot. The profile runs from the
 * wide base up to a rounded shoulder and a slightly domed top, which is the
 * silhouette that says "dice cup" before any colour does.
 */
export function makeCup(colour: string): Group {
  const group = new Group()

  const wall: Vector2[] = [
    new Vector2(CUP_BASE, 0.0),
    new Vector2(CUP_BASE - 0.001, 0.022),
    // A straight taper, which is what a moulded cup actually is.
    new Vector2(CUP_TOP + 0.006, CUP_HEIGHT - 0.03),
    new Vector2(CUP_TOP, CUP_HEIGHT - 0.016),
    // A tight bevel into a flat top, not a dome.
    new Vector2(CUP_TOP - 0.004, CUP_HEIGHT - 0.006),
    new Vector2(CUP_TOP - 0.014, CUP_HEIGHT - 0.001),
    new Vector2(CUP_TOP - 0.03, CUP_HEIGHT),
    new Vector2(0, CUP_HEIGHT + 0.0015),
  ]

  const body = new Mesh(
    new LatheGeometry(wall, 96),
    new MeshPhysicalMaterial({
      color: new Color(colour),
      roughness: 0.34,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      side: DoubleSide,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // The brass foot every cup shares, whatever colour its body is.
  const foot = new Mesh(
    new LatheGeometry(
      [
        new Vector2(CUP_BASE + 0.007, 0.0),
        new Vector2(CUP_BASE + 0.009, 0.007),
        new Vector2(CUP_BASE + 0.003, 0.021),
        new Vector2(CUP_BASE - 0.004, 0.026),
      ],
      96,
    ),
    new MeshStandardMaterial({
      color: new Color('#c69a45'),
      roughness: 0.24,
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
    new PlaneGeometry(0.092, 0.063),
    new MeshStandardMaterial({
      color: new Color('#e6b95f'),
      roughness: 0.3,
      metalness: 0.85,
      transparent: true,
      alphaMap: crownStamp(),
      alphaTest: 0.28,
    }),
  )
  mark.position.set(0, CUP_HEIGHT * 0.4, CUP_TOP + 0.024)
  // Leaned back to lie along the cup's taper rather than floating off it.
  mark.rotation.x = -0.17
  group.add(mark)

  // The dark ring it stands on, which is what stops a cup floating.
  const coaster = new Mesh(
    new CircleGeometry(CUP_BASE + 0.038, 64),
    new MeshStandardMaterial({ color: new Color('#0f0803'), roughness: 0.55 }),
  )
  coaster.rotation.x = -Math.PI / 2
  coaster.position.y = 0.0015
  group.add(coaster)

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
