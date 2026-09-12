/**
 * The room's own music.
 *
 * Not a loop. A loop is a fixed number of bars a player hears for the fifth
 * time twenty minutes in, and the seam where it joins is the thing people
 * actually notice about game music — so there is no seam here because there is
 * nothing to join. Chords are chosen a few seconds before they are needed and
 * are never quite the same two ways round.
 *
 * It is also nothing to download and nothing to license, which for a game
 * opened on a phone on mobile data is worth more than fidelity nobody asked
 * for. A real track dropped in at `/audio/table.mp3` takes over from this
 * entirely — this is the floor, not the ceiling.
 *
 * Deliberately plain harmony: one mode, four chords drawn from it, all of them
 * sharing most of their notes. Under a table carrying a rattle of dice and a
 * knock of cups, anything with an opinion is in the way.
 */

/** Concert A below middle C, which everything here is measured from. */
const ROOT = 110

/**
 * Four chords from one mode, in semitones from the root.
 *
 * A minor with a ninth on everything — they share so many notes that any order
 * works, which is what lets the next one be picked at random without ever
 * landing on a change that sounds like a mistake.
 */
const CHORDS: readonly (readonly number[])[] = [
  [0, 3, 7, 10, 14], // Am9
  [-4, 0, 3, 7, 10], // Fmaj9
  [-7, -4, 0, 3, 7], // Dm9
  [-9, -5, -2, 2, 5], // Cmaj9
]

/** The notes a stray phrase may use. A minor pentatonic, two octaves up. */
const SPRINKLE = [0, 3, 5, 7, 10, 12, 15, 17]

const semitone = (n: number) => ROOT * Math.pow(2, n / 12)

/** How long one chord is held, and how long the next takes to arrive. */
const HOLD = { min: 13, max: 21 }
const FADE = 5.5

export interface Ambient {
  stop: () => void
}

/**
 * Where to carry on scheduling from.
 *
 * Normally the next chord follows the last one. The exception is coming back
 * from a backgrounded tab: a phone that slept for ten minutes stops firing the
 * timer, and a scheduler that simply carried on would hand the audio thread
 * forty chords all dated in the past — which arrive at once, as a wall. Far
 * enough behind, it starts again from now.
 */
export function resumeFrom(next: number, now: number): number {
  return next < now - 4 ? now + 0.2 : next
}

/**
 * Start the bed, playing into `destination`.
 *
 * Scheduling runs ahead of the clock rather than on it: notes for the next few
 * seconds are handed to the audio thread in advance, so a browser throttling
 * timers in a background tab changes nothing anybody can hear.
 */
export function startAmbient(ctx: AudioContext, destination: AudioNode): Ambient {
  /*
   * Everything the bed makes goes through here, so it can be taken away in one
   * move without hunting down voices that are still ringing.
   *
   * The gain is make-up. Written at the levels each voice reads best at, the
   * bed leaves the bus peaking around a quarter, where a mastered track would
   * leave it near one — and the mix level downstream was chosen for a mastered
   * track. This puts the two in the same territory so that swapping a file in
   * does not change how loud the room is.
   */
  const bus = ctx.createGain()
  bus.gain.value = 3.2
  bus.connect(destination)

  // The air in the room: filtered noise, far too quiet to identify, loud enough
  // that the silence between chords is not digital silence.
  const air = roomTone(ctx)
  air.connect(bus)

  let next = ctx.currentTime + 0.4
  let last = -1

  function chord(at: number) {
    // Never the same chord twice running; beyond that it does not matter, which
    // is the point of choosing a mode where it does not matter.
    let pick = Math.floor(Math.random() * CHORDS.length)
    if (pick === last) pick = (pick + 1) % CHORDS.length
    last = pick

    const hold = HOLD.min + Math.random() * (HOLD.max - HOLD.min)
    for (const step of CHORDS[pick]) {
      pad(ctx, bus, semitone(step), at, hold)
    }

    // A stray note over the top, most of the time but not always — the point is
    // that you cannot tell when one is coming.
    if (Math.random() < 0.72) {
      const step = SPRINKLE[Math.floor(Math.random() * SPRINKLE.length)]
      bell(ctx, bus, semitone(step + 12), at + 2 + Math.random() * (hold - 5))
    }

    return hold
  }

  // Two seconds of lookahead against a half-second tick: enough slack that a
  // throttled timer still lands well before the audio thread needs the notes.
  const timer = window.setInterval(() => {
    next = resumeFrom(next, ctx.currentTime)
    while (next < ctx.currentTime + 2) next += chord(next)
  }, 500)

  next += chord(next)

  return {
    stop() {
      window.clearInterval(timer)
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.6)
      // Left to ring down rather than cut: voices already scheduled are still
      // out there, and a bus yanked out from under them clicks.
      window.setTimeout(() => bus.disconnect(), 4000)
    },
  }
}

/**
 * One note of the pad.
 *
 * Two oscillators a few cents apart, which is the whole of why it sounds like
 * an instrument and not like a test tone: the beating between them moves, and
 * movement is what the ear reads as a real thing making a sound.
 */
function pad(ctx: AudioContext, out: AudioNode, hz: number, at: number, hold: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.09, at + FADE)
  gain.gain.setValueAtTime(0.09, at + hold - FADE)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + hold)

  // Well below anything the dice occupy, so the two never fight for the same
  // part of the ear.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 760
  tone.Q.value = 0.4

  // Spread across the stereo field by pitch, so the chord has width without
  // anything appearing to move.
  const place = ctx.createStereoPanner()
  place.pan.value = Math.max(-0.55, Math.min(0.55, Math.log2(hz / ROOT) / 3 - 0.25))

  for (const [type, detune, level] of [
    ['triangle', -5, 0.6],
    ['sine', 5, 0.4],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = hz
    osc.detune.value = detune
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix)
    mix.connect(tone)
    osc.start(at)
    osc.stop(at + hold + 0.4)
  }

  tone.connect(gain)
  gain.connect(place)
  place.connect(out)
}

/** A single struck note, decaying. The only thing here with an attack. */
function bell(ctx: AudioContext, out: AudioNode, hz: number, at: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.055, at + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.4)

  const place = ctx.createStereoPanner()
  place.pan.value = Math.random() * 1.1 - 0.55

  for (const [partial, level] of [
    [1, 1],
    [2.01, 0.3],
    [3.02, 0.12],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz * partial
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix)
    mix.connect(gain)
    osc.start(at)
    osc.stop(at + 3.6)
  }

  gain.connect(place)
  place.connect(out)
}

/**
 * The sound of a room with nothing happening in it.
 *
 * Eight seconds of noise, heavily filtered and looped. It is under everything
 * else by a long way and its only job is that the gaps between chords are a
 * quiet room rather than a muted speaker.
 */
function roomTone(ctx: AudioContext): AudioNode {
  const length = ctx.sampleRate * 8
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // A running average rather than raw noise: white noise is a hiss, and this
  // leans it toward the low rumble a room actually has.
  let value = 0
  for (let i = 0; i < length; i += 1) {
    value = value * 0.985 + (Math.random() * 2 - 1) * 0.015
    data[i] = value
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const shape = ctx.createBiquadFilter()
  shape.type = 'lowpass'
  shape.frequency.value = 420

  const level = ctx.createGain()
  level.gain.value = 0.5

  source.connect(shape)
  shape.connect(level)
  source.start()
  return level
}
