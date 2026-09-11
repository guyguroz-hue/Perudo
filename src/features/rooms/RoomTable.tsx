import { Seat } from '../../components/Seat'
import { SEAT_COUNT } from './types'
import type { Seat as SeatModel } from './types'
import './RoomTable.css'

/**
 * The table, seen from above.
 *
 * The lobby is the same table the game is played on, so joining already looks
 * like sitting down rather than appending a row to a list.
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

  return (
    <div className="table" role="group" aria-label="Players at the table">
      <div className="table__felt" aria-hidden="true" />
      {Array.from({ length: SEAT_COUNT }, (_, position) => {
        const taken = byPosition.get(position)
        return (
          <div key={position} className={`table__seat table__seat--${position}`}>
            <Seat
              name={taken?.display_name}
              isHost={taken?.is_host}
              isYou={taken?.is_you}
              onMenu={
                canManage && taken !== undefined && !taken.is_you
                  ? () => onManage(taken)
                  : undefined
              }
            />
          </div>
        )
      })}
    </div>
  )
}
