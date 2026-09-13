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

/*
 * Where the bed sits, and why it sits there.
 *
 * A phone speaker is a few millimetres across and produces essentially nothing
 * below about 500Hz. This was voiced an octave lower, with a lowpass at 760, so
 * on the only device this game is ever played on the chords were inaudible and
 * the one thing that came through was the filter skirt of the room tone
 * underneath them — measured, 78% of the bed's energy was below 400Hz. The
 * result was not quiet music. It was a hiss.
 *
 * So the whole bed lives where a phone can actually reproduce it. On
 * headphones this is a smaller, closer room than it was, which is the right
 * trade: nobody plays this on headphones.
 */

/** D above middle C. Everything here is measured from it. */
const ROOT = 294

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
  bus.gain.value = 2.4
  bus.connect(destination)

  /*
   * There is no room tone.
   *
   * There was: filtered noise under everything, so the gaps between chords
   * were a quiet room rather than a muted speaker. On studio monitors that is
   * true and rather nice. On a phone, whose speaker throws away everything the
   * chords are made of and keeps the noise's top end, it was the only audible
   * layer in the mix — and a game whose soundtrack is hiss is worse than a
   * game with no soundtrack. The chords overlap by design, so the gaps it was
   * covering do not exist.
   */

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

  /*
   * Open enough to survive a phone.
   *
   * It was 760, which on a small speaker removes the note and leaves the
   * filter's own skirt. A pad needs some harmonics above its fundamental to be
   * a sound at all rather than a pressure change — and it still stops well
   * below the 1.4-4kHz band the dice live in, so the two never fight.
   */
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2200
  tone.Q.value = 0.4

  // Spread across the stereo field by pitch, so the chord has width without
  // anything appearing to move.
  const place = ctx.createStereoPanner()
  place.pan.value = Math.max(-0.55, Math.min(0.55, Math.log2(hz / ROOT) / 3 - 0.25))

  /*
   * Three voices, and one of them has harmonics on purpose.
   *
   * It was a triangle and a sine, which between them put almost nothing above
   * their own fundamental — and a fundamental is the part of a note a phone
   * speaker cannot produce. So the chord was inaudible on a phone even after
   * it was moved up: 84% of its energy still sat in a band the speaker rolls
   * off. A quiet sawtooth gives the note a body in the range the speaker
   * actually has, and the lowpass above keeps it from ever being a buzz.
   *
   * The detunes are the other half of why this sounds like an instrument
   * rather than a test tone: the beating between them moves, and movement is
   * what the ear reads as a real thing making a sound.
   */
  for (const [type, detune, level] of [
    ['triangle', -5, 0.55],
    ['sine', 5, 0.32],
    ['sawtooth', -11, 0.16],
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
