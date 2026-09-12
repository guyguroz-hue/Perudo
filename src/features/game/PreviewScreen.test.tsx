// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PreviewScreen } from './PreviewScreen'

afterEach(cleanup)

/**
 * The preview is how these screens get looked at on a phone, so it breaking
 * silently would cost the only review loop they have.
 */
describe('the preview screen', () => {
  it('renders every table scenario', async () => {
    render(<PreviewScreen />)
    for (const label of [
      'Waiting',
      'Opening the round',
      'A bid under Bull',
      'Farewell Round',
      'You are out',
      'Your turn',
    ]) {
      await userEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByText(/Round \d/)).toBeTruthy()
    }
  })

  it('reports an action rather than interrupting with an alert', async () => {
    render(<PreviewScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Bid' }))
    expect(screen.getByRole('status').textContent).toContain('Bid 4')
  })

  it('renders every ending, including the one nobody wins', async () => {
    render(<PreviewScreen />)
    // Queried as a heading: the scenario picker carries the same words, and a
    // test that cannot tell the label from the outcome is not testing much.
    const outcome = () => screen.getByRole('heading', { level: 2 }).textContent

    await userEvent.click(screen.getByRole('tab', { name: 'Game over' }))
    expect(outcome()).toBe('You won')

    await userEvent.click(screen.getByRole('button', { name: 'Somebody else won' }))
    expect(outcome()).toBe('Maya won')

    // R-004: eliminated together, so the game ends with no winner rather than
    // one awarded on a tiebreak.
    await userEvent.click(screen.getByRole('button', { name: 'Nobody won (R-004)' }))
    expect(outcome()).toBe('Nobody won')
  })

  /*
   * The reveal plays on the table, so the cups are in the scene and jsdom has
   * no GPU to draw them with. What this can check is the half that is not the
   * scene — and that half is the one that has to survive a device with no
   * WebGL at all, so checking it here is checking the right thing.
   */
  it('renders the reveal on the table', async () => {
    render(<PreviewScreen />)
    await userEvent.click(screen.getByRole('tab', { name: 'Reveal' }))
    expect(document.querySelector('.board__stage')).toBeTruthy()
    expect(document.querySelector('.verdict')).toBeTruthy()
    // The claim under trial is public, so it is there from the first frame.
    expect(screen.getAllByText(/at least|exactly/).length).toBeGreaterThan(0)
  })
})
