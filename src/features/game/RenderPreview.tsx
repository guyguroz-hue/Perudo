import { TableScene } from './TableScene'
import { SEAT_HEX, hexForSeat } from './colors'
import './RenderPreview.css'

/** Six cups on the table, so the render can be judged before it is wired in. */
const SEATS = SEAT_HEX.map((_, index) => ({
  id: `s${index}`,
  index,
  count: 6,
  colour: hexForSeat(index),
}))

export function RenderPreview() {
  return (
    <div className="render">
      <TableScene seats={SEATS} />
    </div>
  )
}
