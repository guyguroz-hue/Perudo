import { CROWN_PATH } from '../three/crown'

/**
 * The crown stamped on every cup, and on the table's centre.
 *
 * The game's own mark rather than the wildcard's: three points and a band,
 * pressed into the cup in brass. It is decoration with one job — to make six
 * cups in six colours read as one set rather than six unrelated objects.
 */
export function Crown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 22" fill="currentColor" aria-hidden="true">
      {CROWN_PATH.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
