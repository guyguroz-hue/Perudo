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
    await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
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
    await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
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

  /*
   * The tab that moves.
   *
   * Every other scenario is a still, and every fault a real table reported was
   * about the moment the screen changed: a control that meant something else by
   * the time a thumb landed, a die that moved on its own, a notice that would
   * not leave. None of those can be looked at in a still, so this tab is where
   * they are looked at — and it is worth a test of its own, because a preview
   * that silently stops working costs the only review loop these screens have.
   */
  describe('the live tab', () => {
    it('opens on a table nobody has bid at yet', () => {
      render(<PreviewScreen />)
      expect(screen.getByRole('button', { name: 'Somebody bids' })).toBeTruthy()
      expect(document.querySelector('.board__dock')).toBeTruthy()
      expect(document.querySelector('.challenge__lie')).toBeTruthy()
    })

    it('moves the table when somebody else bids', async () => {
      render(<PreviewScreen />)
      await userEvent.click(screen.getByRole('button', { name: 'Somebody bids' }))
      // The claim reaches the challenge tiles, which is what the whole tab is
      // for: they are live, spent or armed against whatever is on the table.
      expect(document.querySelector('.challenge__lie .challenge__count')?.textContent).not.toBe(
        '–',
      )
    })

    it('shows a notice that can be dismissed with a tap', async () => {
      render(<PreviewScreen />)
      await userEvent.click(screen.getByRole('button', { name: 'Refusal' }))
      const note = document.querySelector('.note--refused')
      expect(note?.textContent).toContain('BULL_ALREADY_CALLED')

      await userEvent.click(note as HTMLElement)
      expect(document.querySelector('.note')).toBeNull()
    })
  })
})
