// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TableScene } from './TableScene'
import { SEAT_HEX, hexForSeat } from './colors'

afterEach(cleanup)

const SEATS = SEAT_HEX.map((_, index) => ({
  id: `s${index}`,
  index,
  count: SEAT_HEX.length,
  colour: hexForSeat(index),
}))

/**
 * jsdom has no GPU, which makes it exactly the device this has to survive.
 * A phone too old for WebGL should get a flat table and a working game, not a
 * white screen.
 */
describe('a device that cannot render the table', () => {
  it('does not take the game down with it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => render(<TableScene seats={SEATS} />)).not.toThrow()
    warn.mockRestore()
  })

  it('says so once, somewhere a developer will see it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<TableScene seats={SEATS} />)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be rendered'),
      expect.anything(),
    )
    warn.mockRestore()
  })
})
