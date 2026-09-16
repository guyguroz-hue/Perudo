import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { TableScene } from '../game/TableScene'
import { cupHexForSeat, toneForSeat } from '../game/colors'
import { STAGE_ASPECT, badgeAnchor, emptySeatAnchor } from '../../three/layout'
import { SEAT_COUNT } from './types'
import type { Seat as SeatModel } from './types'
import '../../components/TableBadge.css'
import './RoomTable.css'

/**
 * The table, before anybody has picked up a die.
 *
 * The same table the game is played on — the same timber, the same room behind
 * it, the same cups, placed by the same camera. That is the point: joining a
 * room should look like pulling out a chair, and it cannot if the lobby is a
 * diagram of a table and the game is a table.
 *
 * A taken seat has a cup on it in that seat's colour. An empty one has bare
 * wood and an invitation, which is the difference the specification asked for
 * between "there is room for another friend" and six blank cards.
 */
export function RoomTable({
  seats,
  canManage,
  onManage,
}: {
  seats: SeatModel[]
  /** True for the host, who may remove other players. */
  canManage: boolean
  onManage: (seat: SeatModel) => void
}) {
  const byPosition = new Map(seats.map((s) => [s.seat, s]))

  /*
   * You sit at the near edge.
   *
   * Seats keep their number — and so their colour — wherever they are drawn, so
   * this only rotates the ring. Everybody sees themselves nearest and everybody
   * else in the same order round the table, which is what a table looks like
   * from a chair.
   */
  const yours = seats.find((s) => s.is_you)?.seat ?? 0
  const ring = Array.from({ length: SEAT_COUNT }, (_, step) => {
    const position = (yours + step) % SEAT_COUNT
    return { position, step, taken: byPosition.get(position) }
  })

  const cups = useMemo(
    () =>
      ring
        .filter((place) => place.taken !== undefined)
        .map((place) => ({
          id: `seat-${place.position}`,
          index: place.step,
          count: SEAT_COUNT,
          colour: cupHexForSeat(place.position),
        })),
    // The cups only change when somebody sits down or leaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats.map((s) => s.seat).join(','), yours],
  )

  return (
    <div className="lobby-table" role="group" aria-label="Players at the table">
      <div className="lobby-table__stage" style={{ aspectRatio: STAGE_ASPECT }}>
        <TableScene seats={cups} />

        <ul className="lobby-table__seats">
          {ring.map(({ position, step, taken }) => {
            // An empty chair is marked on the table; a taken one is labelled
            // above or below the cup standing on it.
            const { top, near, ...anchor } =
              taken === undefined ? emptySeatAnchor(step, SEAT_COUNT) : badgeAnchor(step, SEAT_COUNT)
            /*
             * The projection places the badge; the stylesheet keeps it in the
             * picture. `top` goes over as a custom property because a badge has
             * to be held off the edge of the frame by its own height, which is
             * a number of pixels the camera knows nothing about.
             *
             * An empty chair gets neither bound. It lies flat on the timber in
             * the ring of wood where a cup would stand, straddling its anchor
             * rather than hanging off it, and that ring is well inside the
             * frame at every table size.
             */
            const style = {
              ...anchor,
              top,
              '--seat-top': top,
              '--seat-tone': toneForSeat(position),
            } as CSSProperties
            const edge = taken === undefined ? '' : near ? ' badge--near' : ' badge--far'

            if (taken === undefined) {
              return (
                <li key={position} className="badge badge--open" style={style}>
                  <span className="badge__avatar" aria-hidden="true">
                    +
                  </span>
                  <span className="badge__tag">
                    <span className="badge__name">Open</span>
                  </span>
                </li>
              )
            }

            return (
              <li
                key={position}
                className={`badge${edge}${taken.is_you ? ' badge--mine' : ''}`}
                style={style}
              >
                <span className="badge__avatar" aria-hidden="true">
                  {initial(taken.display_name)}
                </span>
                <span className="badge__tag">
                  <span className="badge__name">
                    {taken.display_name}
                    {taken.is_you && <span className="badge__mine">you</span>}
                  </span>
                  {taken.is_host && <span className="badge__host">Host</span>}
                </span>

                {canManage && !taken.is_you && (
                  <button
                    type="button"
                    className="badge__menu"
                    onClick={() => onManage(taken)}
                    aria-label={`Options for ${taken.display_name}`}
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function initial(name: string): string {
  // Intl.Segmenter so an emoji or a combining mark counts as one character
  // rather than rendering half a glyph.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const [first] = segmenter.segment(name.trim())
  return (first?.segment ?? '?').toUpperCase()
}
