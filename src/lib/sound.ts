/**
 * Sound.
 *
 * One audio context for the whole product, created on the first thing a person
 * actually does. Browsers refuse to start audio before a gesture — quite
 * rightly — so a context built at import time is a context stuck in
 * "suspended", and every sound played through it is silence with no error to
 * find. It is built on the first tap instead, and every sound is a no-op until
 * then.
 *
 * The dice are synthesised rather than sampled. A shake is dozens of small
 * hard collisions, which is a thing additive noise does convincingly and a
 * loop of a recording does not: a sampled rattle repeats, and a rattle that
 * repeats stops being dice within about two rounds. It also costs nothing to
 * download, which matters more here than anywhere — this is a game people open
 * on a phone on mobile data.
 *
 * Music is a file, because music is not something to synthesise. It is loaded
 * if it is there and silently absent if it is not, so the product works today
 * and gets a soundtrack the moment one is dropped in.
 */

/** Where the loop lives, if the project has one. */
const MUSIC_URL = '/audio/table.mp3'

export type SoundName = 'shake' | 'lift' | 'tap'

let context: AudioContext | null = null
let master: GainNode | null = null
let musicGain: GainNode | null = null
let music: HTMLAudioElement | null = null
/*
 * Whether we have already gone looking for the music.
 *
 * Separate from holding it, because the normal case is that there is no file
 * and the element is dropped. Without this, every press of the sound switch
 * would build another element and another node for a track that is not there.
 */
let musicTried = false
let wanted = true

/** How loud each layer sits under the other. Music is a room, not a track. */
const EFFECT_LEVEL = 0.5
const MUSIC_LEVEL = 0.18

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !wanted) return null
  if (context !== null) {
    // Suspended again after a tab switch, or never resumed because the context
    // was built during a gesture the browser did not count.
    if (context.state === 'suspended') void context.resume()
    return context
  }

  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (Ctor === undefined) return null

  context = new Ctor()
  master = context.createGain()
  master.gain.value = EFFECT_LEVEL
  master.connect(context.destination)
  return context
}

/**
 * A handful of hard little collisions.
 *
 * Each die is a short burst of noise through a resonant band-pass — which is
 * what a small hard object struck by another small hard object sounds like —
 * with a click of attack on the front. They are scattered across the shake at
 * uneven intervals, because dice in a cup do not keep time.
 */
function rattle(at: number, seconds: number, count: number) {
  const ctx = context
  if (ctx === null || master === null) return

  for (let i = 0; i < count; i += 1) {
    // Uneven on purpose: evenly spaced clicks read as a machine.
    const when = at + (i / count) * seconds + Math.random() * (seconds / count) * 0.8
    const noise = ctx.createBufferSource()
    const length = Math.floor(ctx.sampleRate * 0.05)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let n = 0; n < length; n += 1) data[n] = Math.random() * 2 - 1
    noise.buffer = buffer

    // Plastic, not wood and not stone: the body of the sound sits high.
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1400 + Math.random() * 2600
    band.Q.value = 3 + Math.random() * 5

    const gain = ctx.createGain()
    const peak = 0.16 + Math.random() * 0.22
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045 + Math.random() * 0.04)

    noise.connect(band)
    band.connect(gain)
    gain.connect(master)
    noise.start(when)
    noise.stop(when + 0.12)
  }
}

/** The soft wooden knock of a cup set back down, or lifted off. */
function knock(at: number, pitch: number) {
  const ctx = context
  if (ctx === null || master === null) return

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(pitch, at)
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, at + 0.09)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)

  osc.connect(gain)
  gain.connect(master)
  osc.start(at)
  osc.stop(at + 0.25)
}

export function play(name: SoundName, seconds = 1.1) {
  const ctx = ensure()
  if (ctx === null) return
  const now = ctx.currentTime

  if (name === 'shake') {
    // Six cups going at once, so the count is generous — but they are quiet
    // and short, and what the ear gets is one wash of rattle rather than a
    // countable number of clicks.
    rattle(now, seconds, Math.round(seconds * 26))
    return
  }
  if (name === 'lift') {
    knock(now, 190)
    rattle(now + 0.03, 0.32, 9)
    return
  }
  knock(now, 320)
}

/**
 * Whether sound is wanted at all.
 *
 * There is no media query for this the way there is for motion, so it is an
 * explicit switch and a remembered one. Turning it off stops the music and
 * silences everything; it does not tear the context down, because building one
 * needs a gesture and the next one might not be to hand.
 */
export function setWanted(on: boolean) {
  wanted = on
  if (master !== null && context !== null) {
    master.gain.setTargetAtTime(on ? EFFECT_LEVEL : 0, context.currentTime, 0.02)
  }
  if (musicGain !== null && context !== null) {
    musicGain.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, context.currentTime, 0.3)
  }
  if (music !== null) {
    if (on) void music.play().catch(() => {})
    else music.pause()
  }
}

export function isWanted(): boolean {
  return wanted
}

/**
 * Start the music, if there is any.
 *
 * A missing file is the normal case until somebody adds one, so it fails
 * quietly: no error, no retry, no message about a soundtrack nobody promised.
 */
export function startMusic() {
  if (musicTried || typeof window === 'undefined') return
  const ctx = ensure()
  if (ctx === null) return
  musicTried = true

  const element = new Audio(MUSIC_URL)
  element.loop = true
  element.crossOrigin = 'anonymous'
  element.preload = 'auto'
  element.addEventListener('error', () => {
    music = null
  })

  const source = ctx.createMediaElementSource(element)
  musicGain = ctx.createGain()
  // Fades up rather than starting at level, so it arrives as a room being
  // entered rather than as a track being switched on.
  musicGain.gain.setValueAtTime(0, ctx.currentTime)
  musicGain.gain.setTargetAtTime(wanted ? MUSIC_LEVEL : 0, ctx.currentTime, 1.6)
  source.connect(musicGain)
  musicGain.connect(ctx.destination)

  music = element
  if (wanted) void element.play().catch(() => {})
}
