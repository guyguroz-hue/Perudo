import { faceWord } from './events'
import { claimFor, standingsFor } from './reveal'
import type { RevealData } from './reveal'
import type { PlayerId } from '../../game'
import type { TableMove, TableView } from './view'

/**
 * Table and reveal states, so every screen can be looked at without a game
 * running — including the ones that are hard to reach on purpose, like a
 * Farewell Round or a correct Bull emptying three cups at once.
 *
 * These are not test fixtures. They are what the preview screen renders, which
 * is how the UI gets reviewed on an actual phone before the action layer that
 * would produce them exists.
 */

const PLAYERS = [
  { id: 'alice', name: 'Alice', seatIndex: 0, diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'you', name: 'Dana', seatIndex: 1, diceCount: 4, isYou: true, isEliminated: false, hasTurn: true },
  { id: 'carl', name: 'Carl', seatIndex: 2, diceCount: 2, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'maya', name: 'Maya', seatIndex: 3, diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
] as const

/** A round's worth of moves, oldest first, as the log renders them. */
function log(...moves: readonly (readonly [PlayerId, string, boolean?])[]): TableMove[] {
  return moves.map(([actorId, text, burst = false], i) => ({
    id: `m${i}`,
    actorId,
    text,
    burst,
  }))
}

export interface Scenario {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly view: TableView
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'your-turn',
    label: 'Your turn',
    note: 'One tap on Bid raises 4 fives to 4 sixes.',
    view: {
      round: { type: 'normal', lockedFace: null, bid: { quantity: 4, face: 5, bidderId: 'alice', bull: null } },
      roundNumber: 3,
      players: [...PLAYERS],
      yourHand: [5, 1, 3, 6],
      moves: log(['maya', 'Maya bid 3 fives'], ['alice', 'Alice bid 4 fives']),
    },
  },
  {
    id: 'waiting',
    label: 'Waiting',
    note: 'Not your turn — and the actions stay live, because a Burst is legal.',
    view: {
      round: { type: 'normal', lockedFace: null, bid: { quantity: 6, face: 2, bidderId: 'carl', bull: null } },
      roundNumber: 3,
      players: PLAYERS.map((p) => ({ ...p, hasTurn: p.id === 'maya' })),
      yourHand: [5, 1, 3, 6],
      moves: log(
        ['alice', 'Alice bid 5 twos'],
        ['carl', 'Carl burst in with 6 twos', true],
      ),
    },
  },
  {
    id: 'opening',
    label: 'Opening the round',
    note: 'No bid yet, so the builder opens on the face you hold most of.',
    view: {
      round: { type: 'normal', lockedFace: null, bid: null },
      roundNumber: 4,
      players: [...PLAYERS],
      yourHand: [6, 6, 1, 2],
      moves: [],
    },
  },
  {
    id: 'bulled',
    label: 'A bid under Bull',
    note: 'The same numbers, read as "exactly" instead of "at least".',
    view: {
      round: {
        type: 'normal',
        lockedFace: null,
        bid: { quantity: 7, face: 5, bidderId: 'alice', bull: { callerId: 'carl' } },
      },
      roundNumber: 5,
      players: [...PLAYERS],
      yourHand: [5, 5, 1, 2],
      moves: log(
        ['alice', 'Alice bid 7 fives'],
        ['carl', 'Carl called Bull — exactly 7'],
      ),
    },
  },
  {
    id: 'farewell',
    label: 'Farewell Round',
    note: 'Ones are not wild, and the opening bid locks the face for the round.',
    view: {
      round: { type: 'farewell', lockedFace: 3, bid: { quantity: 2, face: 3, bidderId: 'carl', bull: null } },
      roundNumber: 6,
      players: PLAYERS.map((p) => (p.id === 'carl' ? { ...p, diceCount: 1 } : p)),
      yourHand: [3, 1, 1, 4],
      moves: log(['carl', 'Carl bid 2 threes']),
    },
  },
  {
    id: 'out',
    label: 'You are out',
    note: 'No actions, but the table stays fully visible.',
    view: {
      round: { type: 'normal', lockedFace: null, bid: { quantity: 5, face: 4, bidderId: 'maya', bull: null } },
      roundNumber: 8,
      players: PLAYERS.map((p) =>
        p.isYou ? { ...p, diceCount: 0, isEliminated: true, hasTurn: false } : p,
      ),
      yourHand: null,
      moves: log(['maya', 'Maya bid 5 fours']),
    },
  },
]

export interface RevealScenario {
  readonly id: string
  readonly label: string
  readonly data: RevealData
}

export { claimFor, standingsFor }

/**
 * The table a reveal is happening on.
 *
 * A reveal plays on the table now rather than replacing it, so the preview
 * needs a table to play it on. Built from the same fixture players, with each
 * hand's size read off the reveal itself, so the cups on the table match the
 * dice that come out from under them.
 *
 * The log is built from the reveal too, and has to be: the point of keeping it
 * up while the cups come off is that it is the only thing naming the player who
 * doubted, and a preview that left it empty would be previewing the wrong
 * screen.
 */
export function tableFor(data: RevealData): TableView {
  const held = (id: string) => data.hands.find((hand) => hand.id === id)?.dice ?? []

  return {
    round: {
      type: data.roundType,
      lockedFace: data.roundType === 'farewell' ? data.face : null,
      bid: {
        quantity: data.quantity,
        face: data.face,
        bidderId: 'alice',
        bull: data.bullCallerName === null ? null : { callerId: 'carl' },
      },
    },
    roundNumber: 6,
    players: PLAYERS.map((player) => ({
      ...player,
      diceCount: held(player.id).length,
      isEliminated: held(player.id).length === 0,
      hasTurn: false,
    })),
    yourHand: held('you'),
    moves: log(
      ['alice', `${data.bidderName} bid ${data.quantity} ${faceWord(data.face, data.quantity)}`],
      ...(data.bullCallerName === null
        ? []
        : ([['carl', `${data.bullCallerName} called Bull — exactly ${data.quantity}`]] as const)),
      [
        'you',
        `${data.challengerName} ${data.challengeKind === 'burst_lie' ? 'burst in with Lie' : 'called Lie'}`,
        data.challengeKind === 'burst_lie',
      ],
    ),
  }
}

export const REVEALS: readonly RevealScenario[] = [
  {
    id: 'lie-wins',
    label: 'Lie — the bid was short',
    data: {
      roundType: 'normal',
      quantity: 6,
      face: 5,
      bidderName: 'Alice',
      bullCallerName: null,
      challengerName: 'Dana',
      challengeKind: 'lie',
      hands: [
        { id: 'alice', name: 'Alice', dice: [5, 2, 3, 6, 4] },
        { id: 'you', name: 'Dana', dice: [1, 3, 6, 2] },
        { id: 'carl', name: 'Carl', dice: [5, 4] },
        { id: 'maya', name: 'Maya', dice: [1, 2, 2, 6, 3] },
      ],
      actualCount: 4,
      claimHolds: false,
      deltas: { alice: -1 },
      eliminated: [],
    },
  },
  {
    id: 'burst-gains',
    label: 'Burst Lie — a die comes back',
    data: {
      roundType: 'normal',
      quantity: 9,
      face: 3,
      bidderName: 'Maya',
      bullCallerName: null,
      challengerName: 'Dana',
      challengeKind: 'burst_lie',
      hands: [
        { id: 'alice', name: 'Alice', dice: [3, 2, 2, 6, 4] },
        { id: 'you', name: 'Dana', dice: [1, 3, 6, 2] },
        { id: 'carl', name: 'Carl', dice: [5, 4] },
        { id: 'maya', name: 'Maya', dice: [1, 2, 2, 6, 3] },
      ],
      actualCount: 6,
      claimHolds: false,
      deltas: { maya: -1, you: 1 },
      eliminated: [],
    },
  },
  {
    id: 'bull-exact',
    label: 'Bull — exactly right, and the table pays',
    data: {
      roundType: 'normal',
      quantity: 5,
      face: 2,
      bidderName: 'Alice',
      bullCallerName: 'Carl',
      challengerName: 'Dana',
      challengeKind: 'lie',
      hands: [
        { id: 'alice', name: 'Alice', dice: [2, 2, 3, 6, 4] },
        { id: 'you', name: 'Dana', dice: [1, 3, 6, 2] },
        { id: 'carl', name: 'Carl', dice: [5, 4] },
        { id: 'maya', name: 'Maya', dice: [1, 5, 6, 6, 3] },
      ],
      actualCount: 5,
      claimHolds: true,
      deltas: { alice: -1, you: -1, maya: -1 },
      eliminated: [],
    },
  },
  {
    id: 'farewell-reveal',
    label: 'Farewell Round — ones stop counting',
    data: {
      roundType: 'farewell',
      quantity: 4,
      face: 3,
      bidderName: 'Carl',
      bullCallerName: null,
      challengerName: 'Alice',
      challengeKind: 'lie',
      hands: [
        { id: 'carl', name: 'Carl', dice: [3] },
        { id: 'alice', name: 'Alice', dice: [3, 1, 1, 6, 4] },
        { id: 'you', name: 'Dana', dice: [3, 1, 6, 2] },
      ],
      actualCount: 3,
      claimHolds: false,
      deltas: { carl: -1 },
      eliminated: ['carl'],
    },
  },
]

/**
 * How a game ends.
 *
 * Including the case nobody expects to see: if the last players are eliminated
 * in the same resolution the game ends with **no winner** rather than one
 * awarded on a tiebreak (R-004). It is rare, it is reachable, and it is the
 * screen most likely to be wrong because nobody has looked at it.
 */
export const ENDINGS: readonly {
  readonly id: string
  readonly label: string
  readonly winnerName: string | null
  readonly view: TableView
}[] = [
  {
    id: 'you-won',
    label: 'You won',
    winnerName: 'Dana',
    view: {
      round: { type: 'normal', lockedFace: null, bid: null },
      roundNumber: 11,
      players: PLAYERS.map((p) =>
        p.isYou
          ? { ...p, diceCount: 2, hasTurn: false }
          : { ...p, diceCount: 0, isEliminated: true, hasTurn: false },
      ),
      yourHand: null,
      moves: log(['alice', 'Alice bid 9 fives'], ['you', 'Dana called Lie']),
    },
  },
  {
    id: 'they-won',
    label: 'Somebody else won',
    winnerName: 'Maya',
    view: {
      round: { type: 'normal', lockedFace: null, bid: null },
      roundNumber: 9,
      players: PLAYERS.map((p) =>
        p.name === 'Maya'
          ? { ...p, diceCount: 3, hasTurn: false }
          : { ...p, diceCount: 0, isEliminated: true, hasTurn: false },
      ),
      yourHand: null,
      moves: log(['carl', 'Carl bid 8 sixes'], ['maya', 'Maya burst in with Lie', true]),
    },
  },
  {
    id: 'nobody',
    label: 'Nobody won (R-004)',
    winnerName: null,
    view: {
      round: { type: 'normal', lockedFace: null, bid: null },
      roundNumber: 7,
      players: PLAYERS.map((p) => ({
        ...p,
        diceCount: 0,
        isEliminated: true,
        hasTurn: false,
      })),
      yourHand: null,
      moves: log(['alice', 'Alice bid 4 twos'], ['carl', 'Carl called Bull — exactly 4']),
    },
  },
]

/**
 * Rooms, for looking at the lobby without one.
 *
 * The lobby is the same table the game is played on, so it is reviewed the same
 * way: the real component, driven by fixtures, on a real phone.
 */
export interface LobbyScenario {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly seats: {
    seat: number
    display_name: string
    is_host: boolean
    is_you: boolean
    user_id: string
  }[]
}

const sitter = (seat: number, name: string, host = false, you = false) => ({
  seat,
  display_name: name,
  is_host: host,
  is_you: you,
  user_id: `u${seat}`,
})

export const LOBBIES: readonly LobbyScenario[] = [
  {
    id: 'alone',
    label: 'Just you',
    note: 'One player, five open chairs. Nothing to start yet.',
    seats: [sitter(0, 'Dana', true, true)],
  },
  {
    id: 'two',
    label: 'Enough to start',
    note: 'Two players — the minimum a game can begin with.',
    seats: [sitter(0, 'Dana', true, true), sitter(1, 'Alice')],
  },
  {
    id: 'four',
    label: 'Four, one chair apart',
    note: 'A gap in the ring: seat three left, and nobody has taken it.',
    seats: [
      sitter(0, 'Dana', true, true),
      sitter(1, 'Alice'),
      sitter(2, 'Carl'),
      sitter(4, 'Maya'),
    ],
  },
  {
    id: 'full',
    label: 'Full house',
    note: 'Six players. The seventh is told the room is full.',
    seats: [
      sitter(0, 'Dana', true, true),
      sitter(1, 'Alice'),
      sitter(2, 'Carl'),
      sitter(3, 'Maya'),
      sitter(4, 'Noam'),
      sitter(5, 'Yuval'),
    ],
  },
  {
    id: 'guest',
    label: 'You are not the host',
    note: 'The same table seen from another chair — you sit nearest whoever you are.',
    seats: [
      sitter(0, 'Dana', true),
      sitter(1, 'Alice'),
      sitter(2, 'Carl', false, true),
    ],
  },
]
