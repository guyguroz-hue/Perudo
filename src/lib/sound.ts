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
 * Music comes from one of two places. If a track has been dropped in at
 * `/audio/table.mp3` it plays that. If there is no file — the normal case — it
 * plays a bed generated here, which has no loop to hear the seam of and nothing
 * to download or license. The file always wins, so adding one is the whole of
 * what it takes to replace this.
 */

import { startAmbient } from './ambient'
import type { Ambient } from './ambient'

/** Where a real track lives, if the project has been given one. */
const MUSIC_URL = '/audio/table.mp3'

export type SoundName = 'shake' | 'lift' | 'tap' | 'win'

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
let ambient: Ambient | null = null
let wanted = true

/**
 * How loud each layer sits under the other. Music is a room, not a track.
 *
 * Set for a phone speaker held at arm's length in a room with people talking
 * over it, which is the only place this game is ever played. Measured at the
 * destination rather than guessed: at the old levels the loudest thing in the
 * game — a cup of dice being shaken — peaked around −24 dBFS, which on a phone
 * is not quiet, it is off.
 */
const EFFECT_LEVEL = 0.85
/*
 * The bed does not go through the master gain — it is its own layer — so this
 * is an absolute level, and it was set as though it went through one. At 0.3 it
 * peaked as loudly as a cup of dice being shaken, which is the wrong way round:
 * a room you can hear over the game is not a room, it is a track.
 */
const MUSIC_LEVEL = 0.16

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

  /*
   * Tell iOS this is media, not a notification.
   *
   * Web Audio on iOS is governed by the ring/silent switch: with the switch
   * flicked to silent — which is how a great many phones live all day — the
   * whole graph plays to nobody, at full volume, with no error and no clue.
   * The context is "running", the meters move, and the room is silent.
   *
   * Declaring the session as playback is what separates "this game has a
   * soundtrack" from "your phone just buzzed", and it is the difference
   * between a player hearing the dice and a player deciding the sound is
   * broken. Safari 16.4 and later; absent everywhere else, and harmless there.
   */
  const session = (navigator as { audioSession?: { type: string } }).audioSession
  if (session !== undefined) {
    try {
      session.type = 'playback'
    } catch {
      // A browser that has the property but refuses the value. Nothing to do.
    }
  }

  context = new Ctor()
  watchVisibility()
  master = context.createGain()
  master.gain.value = EFFECT_LEVEL
  master.connect(context.destination)
  return context
}

/**
 * Stop when nobody is looking.
 *
 * Declaring the session as playback is what stops the ring/silent switch
 * muting the game — and the same declaration tells iOS this is media, which is
 * allowed to keep going once the browser is in the background. So a player who
 * switches apps gets a phone humming a table they are not sitting at, from a
 * tab they forgot was open, with no way to stop it short of finding the tab.
 *
 * A game is not a podcast. It is over when you look away, and it is exactly
 * where you left it when you look back.
 */
let watching = false

function watchVisibility(): void {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('visibilitychange', () => {
    const ctx = context
    if (ctx === null) return
    if (document.hidden) {
      music?.pause()
      void ctx.suspend()
    } else if (wanted) {
      void ctx.resume().then(() => {
        if (music !== null) void music.play().catch(() => {})
      })
    }
  })
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
    const peak = 0.34 + Math.random() * 0.28
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

/** One struck note, ringing on. Used only where something has been won. */
function chime(at: number, hz: number) {
  const ctx = context
  if (ctx === null || master === null) return

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.36, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.5)

  for (const [partial, level] of [
    [1, 1],
    [2, 0.32],
    [3.01, 0.14],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz * partial
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix)
    mix.connect(gain)
    osc.start(at)
    osc.stop(at + 1.7)
  }

  gain.connect(master)
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
  gain.gain.exponentialRampToValueAtTime(0.42, at + 0.006)
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

  if (name === 'win') {
    /*
     * Three notes and done.
     *
     * A table of friends knows who won before the screen says so, so this is
     * an acknowledgement rather than a fanfare — the same chord the room has
     * been humming under the game, said out loud once.
     */
    for (const [i, step] of [0, 7, 12].entries()) {
      chime(now + i * 0.13, 220 * Math.pow(2, step / 12))
    }
    return
  }

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
 * Start the music.
 *
 * A track if the project has one, the generated bed if it has not. Which of the
 * two it is turns on whether the file loads, so there is nothing to configure
 * and no list to keep in step: drop a file in and it takes over.
 *
 * Fades up rather than starting at level, so it arrives as a room being entered
 * rather than as a track being switched on.
 */
export function startMusic() {
  if (musicTried || typeof window === 'undefined') return
  const ctx = ensure()
  if (ctx === null) return
  musicTried = true

  musicGain = ctx.createGain()
  musicGain.gain.setValueAtTime(0, ctx.currentTime)
  musicGain.gain.setTargetAtTime(wanted ? MUSIC_LEVEL : 0, ctx.currentTime, 1.6)
  musicGain.connect(ctx.destination)
  const out = musicGain

  /*
   * The bed starts now, and a real track takes over if there is one.
   *
   * It used to be the other way round: build the element, and start the bed
   * from its `error`. That made "is there a track?" the same question as "did a
   * media element fail to decode", and the answer arrives late or not at all.
   * On this project it is worse than late — there is no file, and a single-page
   * host answers `/audio/table.mp3` with the app's own HTML and a 200, so the
   * element is handed a page to play rather than a missing file. The music then
   * depends on a decode failure of the right shape.
   *
   * So: sound first, always, and the file is asked about separately.
   */
  ambient = startAmbient(ctx, out)
  void adoptTrack(ctx, out)
}

/**
 * Swap the generated bed for a real track, if the project has been given one.
 *
 * Asked with a request rather than by handing the file to a media element and
 * waiting to see what happens, because the answer has to be "is this audio",
 * not "did something go wrong". A single-page host returns the app's own HTML
 * for any path it does not recognise, with a 200 on it.
 */
async function adoptTrack(ctx: AudioContext, out: GainNode): Promise<void> {
  try {
    const head = await fetch(MUSIC_URL, { method: 'HEAD' })
    if (!head.ok) return
    if (!(head.headers.get('content-type') ?? '').startsWith('audio/')) return
  } catch {
    return // Offline, or blocked. The bed is already playing.
  }

  const element = new Audio(MUSIC_URL)
  element.loop = true
  element.preload = 'auto'

  element.addEventListener(
    'canplay',
    () => {
      // A real track outranks the bed, including one that arrives late.
      ambient?.stop()
      ambient = null
      music = element
      if (wanted) void element.play().catch(() => {})
    },
    { once: true },
  )

  try {
    ctx.createMediaElementSource(element).connect(out)
  } catch {
    // Some browsers refuse a source for a file they could not open at all.
  }
}
