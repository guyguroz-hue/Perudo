import { useState } from 'react'
import { Button } from '../../components/Button'
import { askForSeat, spectateRoom } from './api'
import { toRoomError } from './errors'
import './JoinChoice.css'

/**
 * The door that used to be shut.
 *
 * Tapping an invite link a minute after the host pressed Start produced "that
 * game is already under way" and a Back button, and a seventh friend arriving
 * at a table of six got the same treatment. Both of those are people who are in
 * the room in every sense that matters — they were invited, they are standing
 * there — being told to come back later by a screen.
 *
 * So the refusal becomes a choice. Watching costs the table nothing and needs
 * nobody's permission: a spectator holds no seat and can read no hand. Asking
 * for one is a question put to the host, and it is only offered when there is a
 * seat to ask for — a button that can only ever be refused is a worse way to
 * learn a rule than not being offered it.
 */
/**
 * Watching first either way: it is what puts you in the room, and it is what
 * you are doing while the host thinks about your question.
 */
async function enterRoom(code: string, andAsk: boolean): Promise<string> {
  const { roomId } = await spectateRoom(code)
  if (andAsk) {
    try {
      await askForSeat(roomId)
    } catch (caught) {
      // The last seat went while this screen was open. Not worth stopping for
      // — the room says so plainly, and you are already watching.
      if (toRoomError(caught).code !== 'ROOM_FULL') throw caught
    }
  }
  return roomId
}

export function JoinChoice({
  code,
  /** Why joining as a player did not work, which decides what is on offer. */
  reason,
  onEntered,
  onBack,
  /**
   * How to get in, for the preview, which has no database behind it.
   *
   * A seam rather than a copy of this screen: the thing worth looking at on a
   * phone is these two buttons in this layout, and a second version of them
   * built for the preview would be the version that stayed right while this one
   * drifted.
   */
  enter = enterRoom,
}: {
  code: string
  reason: 'started' | 'full'
  onEntered: (roomId: string) => void
  onBack: () => void
  enter?: (code: string, andAsk: boolean) => Promise<string>
}) {
  const [busy, setBusy] = useState<'watch' | 'ask' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function go(andAsk: boolean) {
    setBusy(andAsk ? 'ask' : 'watch')
    setError(null)
    try {
      onEntered(await enter(code, andAsk))
    } catch (caught) {
      setError(toRoomError(caught).message)
      setBusy(null)
    }
  }

  return (
    <div className="choice" role="alert">
      <h2 className="choice__title">
        {reason === 'full' ? 'That table is full' : 'That game has started'}
      </h2>
      <p className="choice__blurb">
        {reason === 'full'
          ? 'Six seats is the limit, so there is nowhere to sit — but you can still watch.'
          : 'You can watch it, or ask the host to deal you in. They decide, and you would join at the start of the next round.'}
      </p>

      <Button busy={busy === 'watch'} onClick={() => void go(false)}>
        Watch the game
      </Button>

      {reason === 'started' && (
        <Button variant="quiet" busy={busy === 'ask'} onClick={() => void go(true)}>
          Ask for a seat
        </Button>
      )}

      {error !== null && <p className="choice__error">{error}</p>}

      <button type="button" className="lobby__leave" onClick={onBack}>
        Back
      </button>
    </div>
  )
}
