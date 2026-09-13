import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Face, ProposedBid } from '../../game'
import type { RevealData } from '../game/reveal'
import type { TableView } from '../game/view'
import { botToAct, decide, seenBy } from './bots'
import { bid, bull, challenge, deal, fairRoll, seat, seatOf } from './table'
import type { Roll, TableState } from './table'

/**
 * A table of bots, driven.
 *
 * Shared by the tutorial and the practice game, which differ only in whether
 * anybody is being talked to: the rules, the bots and the screen are the same,
 * because they are the same table.
 */

/**
 * How long a bot takes to answer.
 *
 * Slower than it needs to be, on purpose and by a lot. A bot can decide in
 * under a millisecond, and a table where three opponents move between blinks is
 * not a fast game — it is a game that has already happened by the time you look
 * up. This is roughly how long somebody takes to look at their dice, work out
 * whether they believe you, and say a number.
 *
 * Varied rather than fixed, because three opponents answering on exactly the
 * same beat is the tell that they are one machine wearing three hats.
 */
export const THINKING = { min: 2100, max: 3600 }

function thinkingTime(): number {
  return THINKING.min + Math.random() * (THINKING.max - THINKING.min)
}

export interface BotTable {
  readonly state: TableState
  readonly view: TableView
  readonly reveal: RevealData | null
  /** Set when a move was refused, so a screen can say why. Clears itself. */
  readonly refused: string | null
  place: (proposed: ProposedBid) => void
  doubt: () => void
  callBull: () => void
  dismissReveal: () => void
  restart: () => void
  /** Force a move by a named seat, out of turn. Used to script a Burst. */
  cutIn: (actorId: string, quantity: number, face: Face) => void
  /** Paused while a tutorial card is up; bots do not move. */
  setPaused: (paused: boolean) => void
}

export interface BotTableOptions {
  readonly names: readonly string[]
  /** The first deal, so a lesson can be written against known dice. */
  readonly firstRoll?: Roll
  /**
   * Vetoes a move before it reaches the table, returning why.
   *
   * The lesson uses it to hold the player to the move a card is asking for —
   * which has to happen *before* the move lands, not after, or the table has
   * already moved on by the time anybody objects.
   */
  allow?: (kind: 'bid' | 'lie' | 'bull', proposed?: ProposedBid) => string | null
  /** Called whenever the player's own move lands, so a lesson can advance. */
  onPlayerMove?: (kind: 'bid' | 'lie' | 'bull') => void
  /** Called when the turn returns to the player after the bots have spoken. */
  onBackToPlayer?: () => void
}

function fresh(names: readonly string[]): TableState {
  return {
    seats: names.map((name, i) => seat(i === 0 ? 'you' : name.toLowerCase(), name, i, i === 0)),
    round: { type: 'normal', lockedFace: null, bid: null },
    roundNumber: 0,
    turnId: 'you',
    farewellQueue: [],
    lastEvent: null,
    winnerId: null,
    over: false,
  }
}

export function useBotTable(options: BotTableOptions): BotTable {
  const { names, firstRoll, allow, onPlayerMove, onBackToPlayer } = options
  const table = useRef<TableState>(fresh(names))
  /*
   * The table is mutated in place — it is a game, not a value — so renders are
   * driven by a counter. The counter has to be read, not just written:
   * depending on the setter is depending on nothing, because React keeps that
   * stable for the life of the component.
   */
  const [tick, bump] = useState(0)
  const redraw = useCallback(() => bump((n) => n + 1), [])
  const [reveal, setReveal] = useState<RevealData | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const dealt = useRef(false)

  useEffect(() => {
    if (dealt.current) return
    dealt.current = true
    deal(table.current, firstRoll ?? fairRoll)
    redraw()
  }, [firstRoll, redraw])

  useEffect(() => {
    if (refused === null) return
    const clear = setTimeout(() => setRefused(null), 3600)
    return () => clearTimeout(clear)
  }, [refused])

  /*
   * The bots take their turns, one at a time.
   *
   * `tick` is load-bearing: it is what makes this run again after each move.
   * Without it one bot acts, the table is redrawn, and nothing re-triggers —
   * the round stops dead with two players still to speak.
   */
  useEffect(() => {
    if (paused || reveal !== null) return
    const state = table.current
    if (state.over) return
    const bot = botToAct(state)
    if (bot === null) return

    const act = setTimeout(() => {
      const move = decide(seenBy(state, bot.id))
      if (move.kind === 'bid') bid(state, bot.id, move.quantity, move.face)
      else if (move.kind === 'bull') bull(state, bot.id)
      else {
        const done = challenge(state, bot.id)
        if (done.ok) setReveal(done.reveal)
      }
      redraw()
      if (state.turnId === 'you') onBackToPlayer?.()
    }, thinkingTime())
    return () => clearTimeout(act)
  }, [paused, reveal, redraw, tick, onBackToPlayer])

  const view: TableView = useMemo(() => {
    const state = table.current
    const yours = seatOf(state, 'you')
    return {
      round: state.round,
      roundNumber: Math.max(1, state.roundNumber),
      players: state.seats.map((s) => ({
        id: s.id,
        name: s.name,
        seatIndex: s.seatIndex,
        diceCount: s.diceCount,
        isYou: s.isYou,
        isEliminated: s.diceCount === 0,
        hasTurn: state.turnId === s.id,
      })),
      yourHand: yours.diceCount > 0 ? yours.dice : null,
      lastEvent: state.lastEvent,
    }
    // Rebuilt on every redraw, which is the point: the table is mutable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const act = useCallback(
    (kind: 'bid' | 'lie' | 'bull', proposed?: ProposedBid) => {
      const state = table.current
      const veto = allow?.(kind, proposed) ?? null
      if (veto !== null) return setRefused(veto)
      if (kind === 'lie') {
        const done = challenge(state, 'you')
        if (!done.ok) return setRefused(done.why)
        setReveal(done.reveal)
      } else {
        const done =
          kind === 'bid' && proposed !== undefined
            ? bid(state, 'you', proposed.quantity, proposed.face)
            : bull(state, 'you')
        if (!done.ok) return setRefused(done.why)
      }
      redraw()
      onPlayerMove?.(kind)
    },
    [redraw, allow, onPlayerMove],
  )

  return {
    state: table.current,
    view,
    reveal,
    refused,
    place: useCallback((proposed: ProposedBid) => act('bid', proposed), [act]),
    doubt: useCallback(() => act('lie'), [act]),
    callBull: useCallback(() => act('bull'), [act]),
    dismissReveal: useCallback(() => {
      setReveal(null)
      const state = table.current
      if (!state.over) deal(state, fairRoll)
      redraw()
    }, [redraw]),
    restart: useCallback(() => {
      table.current = fresh(names)
      deal(table.current, fairRoll)
      setReveal(null)
      redraw()
    }, [names, redraw]),
    cutIn: useCallback(
      (actorId: string, quantity: number, face: Face) => {
        const done = bid(table.current, actorId, quantity, face)
        if (!done.ok) setRefused(done.why)
        redraw()
      },
      [redraw],
    ),
    setPaused,
  }
}
