import { useEffect, useState } from 'react'
import './RoomCode.css'

/**
 * The room code, and the two ways people actually pass it on: reading it out,
 * or sending the link.
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
      <button type="button" className="code__value" onClick={() => void copy('code')}>
        <span className="code__label">ROOM</span>
        <span className="code__digits">{code}</span>
        <span className="code__hint">{copied === 'code' ? 'Copied' : 'Tap to copy'}</span>
      </button>
      <button type="button" className="code__share" onClick={() => void share()}>
        {copied === 'link' ? 'Link copied' : 'Share room'}
      </button>
    </div>
  )
}
