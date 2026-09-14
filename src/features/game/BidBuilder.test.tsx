// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BidRow, FaceRack } from './BidBuilder'
import { useBidDraft } from './bidDraft'
import { checkBid } from '../../game'
import type { Face, ProposedBid, RoundState } from '../../game'
import { bid, farewellRound, normalRound } from '../../game/testing'

afterEach(cleanup)

const HAND: readonly Face[] = [5, 5, 1, 3, 2]

/*
 * The rack and the row, with one draft between them.
 *
 * Assembled here the way the dock assembles them, rather than through a
 * component that owns both: where they sit relative to each other is the thing
 * still being decided, and a test that pinned one arrangement would have to be
 * rewritten to answer a question about layout it was never asking.
 */
function Console({
  round,
  onBid,
  burst = false,
}: {
  round: RoundState
  onBid: (bid: ProposedBid) => void
  burst?: boolean
}) {
  const draft = useBidDraft(round, 15, HAND)
  return (
    <>
      <FaceRack draft={draft} />
      <BidRow draft={draft} burst={burst} onBid={onBid} />
    </>
  )
}

function show(round: RoundState, onBid = vi.fn()) {
  render(<Console round={round} onBid={onBid} />)
  return onBid
}

const submit = () => screen.getByRole('button', { name: 'Bid' })
const disabled = (el: HTMLElement) => el.hasAttribute('disabled')
const face = (n: number) => screen.getByRole('button', { name: n === 1 ? 'Joker' : `${n}` })

describe('one tap is the common case', () => {
  // The whole reason the builder opens where it does: raising the bid in front
  // of you is the commonest move in the game, so it must cost a single touch.
  it('submits the smallest raise without touching anything else', async () => {
    const onBid = show(normalRound(bid(4, 5)))
    await userEvent.click(submit())
    expect(onBid).toHaveBeenCalledWith({ quantity: 4, face: 6 })
  })

  it('takes two taps to change the face', async () => {
    const onBid = show(normalRound(bid(4, 5)))
    await userEvent.click(face(1))
    await userEvent.click(submit())
    expect(onBid).toHaveBeenCalledWith({ quantity: 4, face: 1 })
  })

  it('takes two taps to raise the quantity', async () => {
    const onBid = show(normalRound(bid(4, 5)))
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    await userEvent.click(submit())
    expect(onBid).toHaveBeenCalledWith({ quantity: 5, face: 6 })
  })
})

describe('illegal bids cannot be expressed', () => {
  it('disables a face rather than removing it', () => {
    // The Joker cannot open a normal round, and the button says so by being
    // there and unavailable. A vanished button teaches nobody the rule.
    show(normalRound())
    expect(disabled(face(1))).toBe(true)
    expect(disabled(face(2))).toBe(false)
  })

  it('locks every other face for a Farewell Round', () => {
    show(farewellRound(bid(2, 4), 4))
    for (const n of [1, 2, 3, 5, 6]) expect(disabled(face(n))).toBe(true)
    expect(disabled(face(4))).toBe(false)
  })

  // The strongest form of the claim: walk the whole control surface and check
  // that nothing reachable through it is a bid the server would refuse.
  it('offers no reachable illegal bid, anywhere in the range', async () => {
    const round = normalRound(bid(4, 5))
    const onBid = vi.fn()
    show(round, onBid)

    const more = screen.getByRole('button', { name: 'One more' })
    const fewer = screen.getByRole('button', { name: 'One fewer' })

    for (const step of [fewer, fewer, more, more, more, more]) {
      if (disabled(step)) continue
      await userEvent.click(step)
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const button = face(n)
        if (disabled(button)) continue
        await userEvent.click(button)
        onBid.mockClear()
        await userEvent.click(submit())
        const proposed = onBid.mock.calls[0][0]
        expect(checkBid(round, proposed)).toEqual({ legal: true })
      }
    }
  })
})

describe('the builder follows the table', () => {
  it('resets to the new minimum when somebody else raises', async () => {
    const onBid = vi.fn()
    const { rerender } = render(<Console round={normalRound(bid(4, 5))} onBid={onBid} />)
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))

    rerender(<Console round={normalRound(bid(7, 3))} onBid={onBid} />)
    await userEvent.click(submit())
    expect(onBid).toHaveBeenCalledWith({ quantity: 7, face: 4 })
  })

  it('names the bid out loud for a screen reader', () => {
    show(normalRound(bid(4, 5)))
    // The preview reads visually as a numeral, a times sign and a picture.
    expect(screen.getByText('4 6')).toBeTruthy()
  })

  it('calls a bid made out of turn a Burst', () => {
    render(<Console round={normalRound(bid(4, 5))} burst onBid={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Burst bid' })).toBeTruthy()
    expect(within(document.body).queryByRole('button', { name: 'Bid' })).toBeNull()
  })
})
