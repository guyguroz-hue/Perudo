// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomCode } from './RoomCode'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/**
 * Passing the code on is the only move in an empty room, so the ways it can
 * fail are worth holding down: a clipboard the browser refuses, a share sheet
 * the player dismisses, and a device with no share sheet at all. None of them
 * is the feature failing — the code is on screen throughout — and none of them
 * may leave the button claiming it did something it did not.
 */
describe('the invite rail', () => {
  function stubClipboard(writeText: () => Promise<void>) {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      clipboard: { writeText },
    })
  }

  beforeEach(() => {
    // jsdom has no origin-bearing default worth relying on; the link is built
    // from it, so it is pinned rather than assumed.
    vi.stubGlobal('location', { ...window.location, origin: 'https://perudo.test' })
  })

  it('shows the code, and copies it when tapped', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)

    render(<RoomCode code="4821" />)
    expect(screen.getByText('4821')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /Room 4 8 2 1/ }))

    expect(writeText).toHaveBeenCalledWith('4821')
    expect(screen.getByText('Copied')).toBeTruthy()
  })

  it('says nothing when the clipboard is refused', async () => {
    stubClipboard(async () => {
      throw new Error('NotAllowedError')
    })

    render(<RoomCode code="4821" />)
    await userEvent.click(screen.getByRole('button', { name: /Room 4 8 2 1/ }))

    // The claim is the thing being tested: a refusal must not produce one.
    expect(screen.queryByText('Copied')).toBeNull()
    expect(screen.getByText('4821')).toBeTruthy()
  })

  it('sends the joining link to the native share sheet', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...window.navigator, share })

    render(<RoomCode code="4821" />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    expect(share).toHaveBeenCalledTimes(1)
    const [payload] = share.mock.calls[0] as unknown as [{ url: string; text: string }]
    expect(payload.url).toBe('https://perudo.test/join/4821')
    expect(payload.text).toContain('4821')
  })

  it('falls back to copying the link where there is no share sheet', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)

    render(<RoomCode code="4821" />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    expect(writeText).toHaveBeenCalledWith('https://perudo.test/join/4821')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('treats a dismissed share sheet as nothing having happened', async () => {
    const share = vi.fn(async () => {
      throw new Error('AbortError')
    })
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...window.navigator, share, clipboard: { writeText } })

    render(<RoomCode code="4821" />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    // Dismissing is a decision, not a failure, so it must not silently fall
    // through to copying something the player did not ask to copy.
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText(/Copied/)).toBeNull()
  })
})
