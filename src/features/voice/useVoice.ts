import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { voiceIce } from '../game/api'
import { isSpeaking, meshChange, politeToward } from './peers'

/**
 * Everybody at the table, talking.
 *
 * Perudo is played out loud. The bluffing is the game, and a table with no
 * voices is six people typing numbers at each other — so this runs a small
 * voice call between the players, in the browser, with no app to install and
 * nothing to organise.
 *
 * A mesh: every player holds one connection to every other. That is the wrong
 * shape above about eight people and exactly the right one at six, which is all
 * this game will ever seat — it needs no media server, so nothing sits between
 * two friends talking except the internet.
 *
 * Spectators are deliberately left out. A mesh costs each player one connection
 * per listener, and the room now admits any number of them; twenty watchers
 * would mean every player uploading twenty-five streams to let them listen in.
 *
 * What is NOT here: any audio touching React state. Levels are sampled into a
 * ref and only a *change* in who is speaking reaches the screen, because the
 * alternative is re-rendering the table seven times a second for the whole
 * length of a game.
 */

export type VoiceState = 'off' | 'joining' | 'live' | 'denied' | 'failed'

export interface VoiceHandle {
  readonly state: VoiceState
  readonly muted: boolean
  /** Whoever is audible right now, you included. Player ids. */
  readonly speaking: ReadonlySet<string>
  /** How many others are in the call. */
  readonly others: number
  /** In the call, and not audible: their connection could not be made. */
  readonly unreachable: readonly string[]
  readonly error: string | null
  join: () => void
  leave: () => void
  toggleMute: () => void
}

/**
 * The fallback when no relay is configured.
 *
 * STUN alone is enough for most pairs: it only tells a browser what its own
 * public address is, which is all two phones need when at least one of them is
 * reachable. The pairs it cannot help are the ones behind carrier-grade NAT on
 * both ends, and those are what the relay in `voice.ts` is for.
 */
const PUBLIC_STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }]

/** How often the levels are read. Slower than speech, faster than a sentence. */
const LEVEL_MS = 120

/** Without the entry, and the same array when it was not there. */
const without = (list: readonly string[], id: string): readonly string[] =>
  list.includes(id) ? list.filter((other) => other !== id) : list

/** One line of the conversation two browsers have before they can talk. */
interface Signal {
  readonly to?: string
  readonly from?: string
  readonly description?: RTCSessionDescriptionInit
  readonly candidate?: RTCIceCandidateInit
}

interface Peer {
  readonly pc: RTCPeerConnection
  readonly audio: HTMLAudioElement
  analyser: AnalyserNode | null
  /** Perfect negotiation: guards against both sides offering at once. */
  makingOffer: boolean
  ignoring: boolean
  /** One free retry before a failure counts as one. */
  retried: boolean
}

export function useVoice(gameId: string | null, youId: string | null): VoiceHandle {
  const [state, setState] = useState<VoiceState>('off')
  const [muted, setMuted] = useState(false)
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set())
  const [others, setOthers] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /*
   * The people in the call you cannot hear, which is not the same as silence.
   *
   * Without a relay configured some pairs simply cannot reach each other — both
   * ends behind carrier-grade NAT, which is ordinary on mobile data. That is a
   * real state and the worst possible way to present it is as quiet: a player
   * spends the evening thinking somebody is not talking. So it is named.
   */
  const [unreachable, setUnreachable] = useState<readonly string[]>([])

  const peers = useRef(new Map<string, Peer>())
  const mine = useRef<MediaStream | null>(null)
  const room = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const myAnalyser = useRef<AnalyserNode | null>(null)
  const ice = useRef<RTCIceServer[]>(PUBLIC_STUN)
  const loud = useRef(new Set<string>())

  /** Everything torn down, in the order that leaves nothing running. */
  const stop = useCallback(() => {
    for (const [, peer] of peers.current) {
      peer.pc.close()
      peer.audio.srcObject = null
      peer.audio.remove()
    }
    peers.current.clear()
    mine.current?.getTracks().forEach((track) => track.stop())
    mine.current = null
    if (room.current !== null) void supabase.removeChannel(room.current)
    room.current = null
    void audioCtx.current?.close()
    audioCtx.current = null
    myAnalyser.current = null
    loud.current.clear()
    setSpeaking(new Set())
    setOthers(0)
    setUnreachable([])
    setState('off')
  }, [])

  useEffect(() => stop, [stop])

  /*
   * A page being closed is not a departure anybody hears about in time.
   *
   * Realtime notices eventually, but "eventually" is a voice that keeps a
   * connection open against somebody who has gone. Leaving on the way out is
   * one line and saves every other phone at the table a dead peer.
   */
  useEffect(() => {
    const bye = () => stop()
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [stop])

  const signal = useCallback((to: string, body: Record<string, unknown>) => {
    void room.current?.send({
      type: 'broadcast',
      event: 'signal',
      payload: { to, from: youId, ...body },
    })
  }, [youId])

  /**
   * Attach a level meter to a stream, if this browser gave us a context.
   *
   * A declaration rather than a const, and placed before its callers, because
   * the connection built below reads it from inside a callback — which works,
   * and reads like a trap.
   */
  function listen(stream: MediaStream | null): AnalyserNode | null {
    if (stream === null || audioCtx.current === null) return null
    try {
      const source = audioCtx.current.createMediaStreamSource(stream)
      const analyser = audioCtx.current.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      return analyser
    } catch {
      // A browser that will not build the graph still plays the audio; it just
      // cannot say who is talking.
      return null
    }
  }

  /** One connection, and everything it has to answer for. */
  const connect = useCallback(
    (peerId: string) => {
      if (youId === null || peers.current.has(peerId)) return
      const pc = new RTCPeerConnection({ iceServers: ice.current })

      /*
       * Playback goes through an audio element, not through WebAudio.
       *
       * Safari will happily build a graph out of a remote stream and play
       * nothing at all from it; an element with `srcObject` works everywhere.
       * The graph is built too, but only to read levels off — which is why
       * this element is in the document and silent-looking rather than
       * decorative.
       */
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.setAttribute('playsinline', '')
      audio.style.display = 'none'
      document.body.append(audio)

      const peer: Peer = {
        pc,
        audio,
        analyser: null,
        makingOffer: false,
        ignoring: false,
        retried: false,
      }
      peers.current.set(peerId, peer)

      const polite = politeToward(youId, peerId)

      for (const track of mine.current?.getTracks() ?? []) {
        pc.addTrack(track, mine.current as MediaStream)
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams
        audio.srcObject = stream ?? null
        void audio.play().catch(() => {
          // Autoplay refused until a gesture. Joining the call IS a gesture,
          // so this is the rare path; nothing to do but let the next one try.
        })
        peer.analyser = listen(stream ?? null)
      }

      pc.onicecandidate = (event) => {
        if (event.candidate !== null) signal(peerId, { candidate: event.candidate.toJSON() })
      }

      pc.onnegotiationneeded = () => {
        void (async () => {
          try {
            peer.makingOffer = true
            await pc.setLocalDescription()
            signal(peerId, { description: pc.localDescription?.toJSON() })
          } catch {
            // A connection that closed underneath the negotiation. The peer is
            // gone and the map entry goes with it.
          } finally {
            peer.makingOffer = false
          }
        })()
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState !== 'failed') {
          if (pc.connectionState === 'connected') {
            peer.retried = false
            setUnreachable((was) => without(was, peerId))
          }
          return
        }

        /*
         * Once is a tunnel. Twice is a wall.
         *
         * A phone going through a tunnel fails and comes back, and restarting
         * ICE is what lets it — tearing the peer down instead would mean a
         * lost signal ends the conversation for good. A second failure after a
         * restart is the other thing: two ends that cannot reach each other at
         * all, which is what a relay exists to fix and what its absence looks
         * like.
         */
        if (!peer.retried) {
          peer.retried = true
          pc.restartIce()
          return
        }
        setUnreachable((was) => (was.includes(peerId) ? was : [...was, peerId]))
      }

      // Somebody has to speak first, and both sides doing it is what the
      // politeness rule exists to survive.
      if (!polite) pc.onnegotiationneeded?.(new Event('negotiationneeded'))
    },
    [signal, youId],
  )

  const drop = useCallback((peerId: string) => {
    const peer = peers.current.get(peerId)
    if (peer === undefined) return
    peer.pc.close()
    peer.audio.srcObject = null
    peer.audio.remove()
    peers.current.delete(peerId)
    loud.current.delete(peerId)
    setUnreachable((was) => without(was, peerId))
  }, [])

  const answer = useCallback(
    async (from: string, body: Signal) => {
      const peer = peers.current.get(from)
      if (peer === undefined || youId === null) return
      const { pc } = peer
      const polite = politeToward(youId, from)

      try {
        if (body.description !== undefined) {
          const offerCollision =
            body.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
          peer.ignoring = !polite && offerCollision
          if (peer.ignoring) return

          await pc.setRemoteDescription(body.description)
          if (body.description.type === 'offer') {
            await pc.setLocalDescription()
            signal(from, { description: pc.localDescription?.toJSON() })
          }
          return
        }

        if (body.candidate !== undefined) {
          try {
            await pc.addIceCandidate(body.candidate)
          } catch (caught) {
            // Candidates for an offer we decided to ignore arrive anyway, and
            // they are meaningless rather than wrong.
            if (!peer.ignoring) throw caught
          }
        }
      } catch {
        setError('A voice connection could not be made.')
      }
    },
    [signal, youId],
  )

  const join = useCallback(() => {
    if (gameId === null || youId === null || state !== 'off') return
    setState('joining')
    setError(null)

    void (async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // All three on purpose. Six phones in six rooms with the gain wide
          // open is a table nobody can hear anybody at.
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
      } catch {
        setState('denied')
        setError('No microphone. Check the permission in your browser settings.')
        return
      }
      mine.current = stream

      try {
        const AudioCtx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtx !== undefined) {
          audioCtx.current = new AudioCtx()
          // Joining is a gesture, which is the one moment iOS will start one.
          void audioCtx.current.resume()
          myAnalyser.current = listen(stream)
        }
      } catch {
        // No level meters. The call still works.
      }

      /*
       * Relay credentials, or the public fallback.
       *
       * Asked for once per call rather than once per peer: they are minted for
       * hours and they are the same for everybody at the table.
       */
      try {
        const servers = await voiceIce(gameId)
        if (servers.length > 0) ice.current = servers as RTCIceServer[]
      } catch {
        // No relay. Most pairs never need one; the ones that do will fail to
        // connect and say so, which beats refusing to start the call at all.
      }

      const channel = supabase
        .channel(`voice:${gameId}`, { config: { presence: { key: youId } } })
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          const body = payload as Signal
          // Addressed, because a broadcast channel is a room and not a wire.
          if (body.to !== youId || typeof body.from !== 'string') return
          void answer(body.from, body)
        })
        .on('presence', { event: 'sync' }, () => {
          const present = Object.keys(channel.presenceState())
          const { opened, closed } = meshChange(peers.current.keys(), present, youId)
          for (const id of closed) drop(id)
          for (const id of opened) connect(id)
          setOthers(present.filter((id) => id !== youId).length)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void channel.track({ at: Date.now() })
            setState('live')
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('failed')
        })

      room.current = channel
    })()
  }, [answer, connect, drop, gameId, state, youId])

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      const next = !was
      for (const track of mine.current?.getAudioTracks() ?? []) track.enabled = !next
      if (next) {
        loud.current.delete(youId ?? '')
        setSpeaking(new Set(loud.current))
      }
      return next
    })
  }, [youId])

  /*
   * Who is audible, sampled rather than rendered.
   *
   * The levels move continuously and the screen must not. Only a change in the
   * *set* reaches React, so a table talking for an hour costs the same number
   * of renders as a table taking turns.
   */
  useEffect(() => {
    if (state !== 'live') return
    const buffer = new Uint8Array(256)

    const read = (analyser: AnalyserNode | null): number => {
      if (analyser === null) return 0
      analyser.getByteTimeDomainData(buffer)
      let peak = 0
      for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128)
      return peak
    }

    const timer = setInterval(() => {
      const before = loud.current
      const now = new Set<string>()

      if (youId !== null && !muted && isSpeaking(read(myAnalyser.current), before.has(youId))) {
        now.add(youId)
      }
      for (const [id, peer] of peers.current) {
        if (isSpeaking(read(peer.analyser), before.has(id))) now.add(id)
      }

      const changed =
        now.size !== before.size || [...now].some((id) => !before.has(id))
      loud.current = now
      if (changed) setSpeaking(now)
    }, LEVEL_MS)

    return () => clearInterval(timer)
  }, [muted, state, youId])

  return { state, muted, speaking, others, unreachable, error, join, leave: stop, toggleMute }
}
