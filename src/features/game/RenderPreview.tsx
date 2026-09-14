import { useState } from 'react'
import type { CupState } from '../../three/scene'
import { TableScene } from './TableScene'
import { SEAT_HEX, cupHexForSeat } from './colors'
import './RenderPreview.css'

/**
 * The scene on its own, so the render can be judged and its states driven
 * before any of it is wired to a game.
 */
const HANDS: readonly (readonly number[])[] = [
  [5, 1, 3, 6, 2],
  [2, 2, 4, 1],
  [6, 6, 3],
  [1, 4, 5, 5, 2],
  [3, 3],
  [4, 1, 6, 2, 5],
]

export function RenderPreview() {
  const [state, setState] = useState<CupState>('covered')

  const seats = SEAT_HEX.map((_, index) => ({
    id: `s${index}`,
    index,
    count: SEAT_HEX.length,
    colour: cupHexForSeat(index),
    dice: HANDS[index],
    state,
  }))

  return (
    <div className="render">
      <div className="render__stage">
        <TableScene seats={seats} />
      </div>
      <div className="render__states">
        {(['covered', 'shaking', 'lifted'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === state}
            onClick={() => setState(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
