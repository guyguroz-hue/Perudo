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
      <path d="M3.2 5.1c1.4 0 2.5 1.1 2.5 2.5 0 .8-.4 1.5-1 2l3 4.2 5-9.1c-.8-.4-1.3-1.2-1.3-2.1C11.4 1.2 12.5 0 14 0s2.6 1.2 2.6 2.6c0 .9-.5 1.7-1.3 2.1l5 9.1 3-4.2c-.6-.5-1-1.2-1-2 0-1.4 1.1-2.5 2.5-2.5S27.3 6.2 27.3 7.6 26.2 10.1 24.8 10.1h-.2L22 18.4H6L3.4 10.1h-.2C1.8 10.1.7 9 .7 7.6S1.8 5.1 3.2 5.1Z" transform="translate(2)" />
      <rect x="5.6" y="19" width="20.8" height="3" rx="1.5" />
    </svg>
  )
}
