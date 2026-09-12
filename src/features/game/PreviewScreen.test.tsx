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

  it('renders the reveal', async () => {
    render(<PreviewScreen />)
    await userEvent.click(screen.getByRole('tab', { name: 'Reveal' }))
    expect(document.querySelectorAll('.cup').length).toBeGreaterThan(0)
  })
})
