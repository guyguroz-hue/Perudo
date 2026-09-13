import { useEffect, useState } from 'react'
import './RoomCode.css'

/**
 * The room code, and the two ways people actually pass it on: reading it out,
 * or sending the link.
 *
 * A rail rather than a card. In a lobby the table is the screen, and an invite
 * panel tall enough to push a six-seat table down the page is the invite
 * winning an argument it should not be in. Everything here is one line high:
 * the code big enough to read across a sofa, the share beside it.
 */
export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  const link = `${window.location.origin}/join/${code}`

  async function copy(what: 'code' | 'link') {
    const text = what === 'code' ? code : link
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      // Clipboard access can be refused outright — on an insecure origin, or
      // when the gesture is not trusted. The code is on screen either way, so
      // this is a convenience failing, not the feature failing.
      setCopied(null)
    }
  }

  async function share() {
    // The native sheet is where the invite actually wants to go: WhatsApp,
    // Messages, Telegram. Falling back to a copy keeps desktop usable.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Perudo', text: `Join my game 🎲\nRoom: ${code}`, url: link })
        return
      } catch {
        return // A dismissed share sheet is not an error.
      }
    }
    await copy('link')
  }

  return (
    <div className="code">
      <button
        type="button"
        className={`code__value${copied === 'code' ? ' code__value--said' : ''}`}
        onClick={() => void copy('code')}
        aria-label={`Room ${code.split('').join(' ')}. Tap to copy.`}
      >
        <span className="code__label" aria-hidden="true">
          {copied === 'code' ? 'Copied' : 'Room'}
        </span>
        <span className="code__digits" aria-hidden="true">
          {code}
        </span>
      </button>

      <button type="button" className="code__share" onClick={() => void share()}>
        <ShareIcon />
        <span>{copied === 'link' ? 'Copied' : 'Invite'}</span>
      </button>

      {/* One live region for both buttons: the confirmation belongs to the act,
          not to the control, and two regions would announce over each other. */}
      <p className="code__said" role="status">
        {copied === 'code' ? 'Code copied' : copied === 'link' ? 'Link copied' : ''}
      </p>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none">
      <path
        d="M12 3v12M12 3 8 7M12 3l4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
