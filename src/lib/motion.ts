import { useEffect, useState } from 'react'

/**
 * Whether this person has asked for less movement.
 *
 * Honoured everywhere something moves on its own. A cup that shakes when the
 * round is dealt and a reveal that takes two seconds to lift four cups are
 * exactly the kinds of motion the setting exists for — and in both cases the
 * information is already on the screen, so switching the movement off costs the
 * player nothing but the theatre.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query()?.matches ?? false)

  useEffect(() => {
    const media = query()
    if (media === null) return
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}

function query(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia('(prefers-reduced-motion: reduce)')
}
