import { useCallback, useEffect, useState } from 'react'
import { isWanted, play, setWanted, startMusic } from './sound'
import type { SoundName } from './sound'

const KEY = 'perudo.sound'

/**
 * Whether this person wants sound, remembered.
 *
 * Kept out of React state as well as in it: the sound module is imperative and
 * is called from places that are not components, so it holds the answer and
 * this only mirrors it for rendering.
 *
 * Reading and writing are both wrapped, because storage throws rather than
 * returning null in a private window with site data blocked — and a game that
 * will not open because it could not remember a preference is a worse game
 * than one that forgets it.
 */
function remembered(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

function remember(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Nothing to do and nothing worth saying.
  }
}

export function useSound(): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(() => (typeof window === 'undefined' ? true : remembered()))

  useEffect(() => {
    setWanted(on)
  }, [on])

  /*
   * The first thing anybody does starts the music.
   *
   * A browser will not let audio begin without a gesture, so there is no point
   * asking before one arrives — and asking with a dialog would put a question
   * about sound in front of a player who came here to play. The first tap is
   * the gesture, whatever it was for.
   */
  useEffect(() => {
    if (!on) return
    const begin = () => startMusic()
    window.addEventListener('pointerdown', begin, { once: true })
    window.addEventListener('keydown', begin, { once: true })
    return () => {
      window.removeEventListener('pointerdown', begin)
      window.removeEventListener('keydown', begin)
    }
  }, [on])

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was
      remember(next)
      setWanted(next)
      if (next) startMusic()
      return next
    })
  }, [])

  return { on, toggle }
}

/** Play a sound, if sound is wanted. Safe to call from anywhere. */
export function useSoundEffect(): (name: SoundName, seconds?: number) => void {
  return useCallback((name: SoundName, seconds?: number) => {
    if (isWanted()) play(name, seconds)
  }, [])
}
