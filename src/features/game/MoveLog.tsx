import { toneForSeat } from './colors'
import type { CSSProperties } from 'react'
import type { TableMove, TablePlayer } from './view'
import './MoveLog.css'

/**
 * Who said what, this round.
 *
 * In a game with no Burst, turn order does the work: the bid on the table
 * belongs to the player before the one whose turn it is, and everybody can
 * count round. Burst takes that away (GAME_RULES §9.1) — anybody may bid or
 * doubt at any moment — so the seat the turn happens to be sitting at says
 * nothing about whose claim is on the table.
 *
 * The line this replaces said one thing at a time, which meant the answer to
 * "who doubted?" was written over the instant it became the only question
 * anybody had: a challenge is followed immediately by six cups coming off, and
 * the player watching them has no way back to the name. So this is a short
 * list, not a line, and it stays up through the reveal.
 *
 * Three moves. Enough to hold a raise, a re-raise and the doubt that ended
 * them; not enough to become a panel the table has to share the screen with.
 * The colour is the seat's, the same colour that player wears everywhere else,
 * so a glance is usually enough and the name is there when it is not.
 */
const SHOWN = 3

export function MoveLog({
  moves,
  players,
}: {
  moves: readonly TableMove[]
  players: readonly TablePlayer[]
}) {
  const recent = moves.slice(-SHOWN)
  if (recent.length === 0) return null

  const seatOf = new Map(players.map((player) => [player.id, player.seatIndex]))

  return (
    <ol className="log" aria-label="What has been said this round">
      {recent.map((move, i) => {
        const seat = move.actorId === null ? null : (seatOf.get(move.actorId) ?? null)
        return (
          <li
            key={move.id}
            className={`log__move${move.burst ? ' log__move--burst' : ''}`}
            style={
              {
                // Older moves recede rather than disappear. What was said two
                // moves ago is still worth something; it is just worth less
                // than what was said last.
                '--age': recent.length - 1 - i,
                '--seat-tone': seat === null ? 'var(--ink-faint)' : toneForSeat(seat),
              } as CSSProperties
            }
            // Only the newest is announced. A screen reader re-reading the
            // whole list on every move would be unusable.
            aria-live={i === recent.length - 1 ? 'polite' : undefined}
          >
            <span className="log__who" aria-hidden="true" />
            {/*
              * Said in brass rather than in a word.
              *
              * Out of turn is not a detail — it is why the player sitting next
              * never got to speak — so it is marked, and it used to be marked
              * with a chip reading BURST ahead of the sentence. In a strip this
              * narrow that chip cost a third of the line, and what it bought was
              * a second copy of something the line already says: a Burst line
              * carries the table's own metal along its edge and an ordinary one
              * does not. So the edge does the marking, the word is kept for
              * anybody listening rather than looking, and the sentence gets the
              * room back.
              */}
            {move.burst && <span className="visually-hidden">Burst: </span>}
            <span className="log__text">{move.text}</span>
          </li>
        )
      })}
    </ol>
  )
}
