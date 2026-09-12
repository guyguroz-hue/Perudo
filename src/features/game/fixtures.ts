import { claimFor, standingsFor } from './reveal'
import type { RevealData } from './reveal'
import type { TableView } from './view'

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
  { id: 'alice', name: 'Alice', diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'you', name: 'Dana', diceCount: 4, isYou: true, isEliminated: false, hasTurn: true },
  { id: 'carl', name: 'Carl', diceCount: 2, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'maya', name: 'Maya', diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
] as const

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
      lastEvent: 'Alice bid 4 fives',
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
      lastEvent: 'Carl burst in with 6 twos',
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
      lastEvent: null,
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
      lastEvent: 'Carl called Bull on 7 fives',
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
      lastEvent: 'Carl is down to one die',
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
      lastEvent: 'You lost your last die',
    },
  },
]

export interface RevealScenario {
  readonly id: string
  readonly label: string
  readonly data: RevealData
}

export { claimFor, standingsFor }

export const REVEALS: readonly RevealScenario[] = [
  {
    id: 'dudo-wins',
    label: 'Dudo — the bid was short',
    data: {
      roundType: 'normal',
      quantity: 6,
      face: 5,
      bidderName: 'Alice',
      bullCallerName: null,
      challengerName: 'Dana',
      challengeKind: 'dudo',
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
    label: 'Burst Dudo — a die comes back',
    data: {
      roundType: 'normal',
      quantity: 9,
      face: 3,
      bidderName: 'Maya',
      bullCallerName: null,
      challengerName: 'Dana',
      challengeKind: 'burst_dudo',
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
      challengeKind: 'dudo',
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
      challengeKind: 'dudo',
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
