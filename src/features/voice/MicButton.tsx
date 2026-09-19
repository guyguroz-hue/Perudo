import type { VoiceHandle } from './useVoice'
import './MicButton.css'

/**
 * The one control a voice call needs on a phone.
 *
 * Three states in one button, because a fourth would be a menu and this sits in
 * a corner beside the sound toggle: off, joining, and in — where pressing it
 * mutes rather than leaves. Leaving is the long press of this product's
 * vocabulary, and it is not offered here: a player who wants out of the call
 * mutes, and a player who wants out of the room has a door already.
 *
 * Muted is drawn as a struck-through microphone rather than as a dimmed one.
 * Dimmed is what every disabled control on this screen looks like, and "my
 * microphone is off" is not the same fact as "this button is unavailable" — at
 * a table where the whole game is talking, that difference is the one people
 * discover by being asked why they are silent.
 */
export function MicButton({ voice }: { voice: VoiceHandle }) {
  const { state, muted, speaking, others } = voice
  const live = state === 'live'
  const yours = live && !muted

  const label = !live
    ? state === 'joining'
      ? 'Joining the call'
      : state === 'denied'
        ? 'No microphone — check your browser permission'
        : 'Join the voice call'
    : muted
      ? `Unmute — ${others} ${others === 1 ? 'other is' : 'others are'} in the call`
      : `Mute — ${others} ${others === 1 ? 'other is' : 'others are'} in the call`

  return (
    <button
      type="button"
      className={`mic${live ? ' mic--live' : ''}${muted ? ' mic--muted' : ''}${
        state === 'joining' ? ' mic--joining' : ''
      }`}
      onClick={live ? voice.toggleMute : voice.join}
      disabled={state === 'joining'}
      aria-label={label}
      aria-pressed={live ? !muted : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        {muted && (
          <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
      {/* How many are in it, which is the thing a player wants to know before
          they bother joining. Only once somebody is. */}
      {live && others > 0 && <b className="mic__count">{others}</b>}
      {/* Your own voice, on your own button. It is the only feedback that
          answers "can they hear me" without asking anybody. */}
      {yours && <span className={`mic__ring${speaking.size > 0 ? ' mic__ring--on' : ''}`} />}
    </button>
  )
}
