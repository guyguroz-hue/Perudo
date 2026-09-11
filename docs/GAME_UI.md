# Game UI — specification and design decisions

> The owner's specification, recorded, plus the design decisions it forces and
> the two places where it cannot be built exactly as written.

The governing priority, from the spec and applied everywhere below:

> Clarity beats decoration. Responsiveness beats animation. Performance beats
> realism. A distinctive game-specific solution beats a generic UI pattern.

---

## 1. Waiting is a gameplay state, not an empty one

Most of a Perudo game is spent watching other people think. The screen a player
stares at for minutes at a time is the waiting screen, and it has to stay
legible for exactly that long.

Information hierarchy while waiting, in order:

1. Whose turn it is
2. The current bid
3. Your own dice
4. Everyone else and how many dice they hold
5. What just happened
6. Turn progression
7. Round information
8. Secondary controls

**No "WAITING FOR YOUR TURN" curtain.** Covering the table to announce that
nothing is happening removes the one thing worth looking at.

### Alive, not busy

The table comes to life through **state changes**, never through ambient
motion. No pulsing, bouncing, glowing, shaking or particles while nothing is
happening. A screen that moves constantly is exhausting within a minute, and a
player has to be able to watch it for ten.

When a bid lands, three things must be answerable at a glance: **who** acted,
**what** they said, and that the state **changed**.

### Your turn

The transition into your turn is the one moment that may be emphatic. Seat
emphasis, the action area waking up, a short scale — fast. A player must never
have to wonder whether it is their turn.

---

## 2. Building a bid on a phone

A bid is a quantity and a face. Both must be reachable at once.

**Target: 1–3 deliberate touches in the common case.** The commonest bid by far
is a small raise on the current one, so the builder opens already holding the
lowest legal bid — meaning the most frequent action is a single tap on Bid.

- **Quantity**: large targets, no typing, no dropdown. Clamped to the legal
  range so an illegal quantity cannot be expressed.
- **Face**: the actual die faces, never the words "one, two, three". The same
  `Die` component used everywhere else, so the bid builder, your hand, and the
  revealed dice all speak one visual language.
- **Preview**: the bid being built is the dominant element. A player knows
  exactly what they are about to say before they say it.

### Legal moves

The client understands bid legality and makes illegal options unreachable —
disabled, not hidden, so the shape of the rule stays visible. The rules the
client applies are the same `src/game` module the server runs, so the two
cannot disagree.

**The server remains the authority.** The client's job is to make legal choices
obvious, never to be trusted about them.

---

## 3. Dudo and Bull are not two buttons with different words

Both challenge the current bid. They mean opposite things about it:

| | Claim being challenged | Reading |
|---|---|---|
| **Dudo** | "there are at least this many" | I don't believe you |
| **Bull** | "there are exactly this many" | I think you are precisely right |

They must be distinguishable **at a glance**, through several channels at once:
different iconography, different composition, different treatment, different
micro-animation, and a short line of copy carrying the actual meaning —
`AT LEAST` against `EXACTLY`.

Neither may look like an ordinary bid. They are actions *against* a bid.

---

## 4. The reveal

The emotional climax, and the only place in the game that earns strong motion
design.

```
challenge → pause → cups lift → dice settle → count → result → consequence
```

- **The pause** gives the action weight and lets a player wonder whether they
  were right. Brief enough never to read as loading.
- **Cups lift.** They rise and move away, with their shadow changing as they
  go. They do not fade out; the physical act of lifting is the point.
- **The result is readable without arithmetic.** The bid, the actual count, and
  who was right — not a spreadsheet, and not a number a player has to work out
  from tiny dice.
- **Consequence is visible.** The die that is lost visibly leaves.

Clarity first, celebration second — including when the challenger was wrong.

---

## 5. Two things the specification asks for that cannot be built as written

### 5.1 The reveal cannot be prepared in advance (§96)

The spec asks for no network wait between the challenge and the reveal, with
the client preparing everything it can beforehand.

**The client cannot hold the dice before the reveal.** Not as hidden state, not
prefetched, not encrypted-and-decrypted-later. If the values are on the device,
the game is broken — DevTools is one tap away, and every protection in this
project exists to prevent exactly that. This is not a tuning decision; it is the
reason `player_dice` exists as its own table with its own policy.

So a round trip is unavoidable. The resolution of that:

**The anticipation pause and the network round trip are the same moment.**

The challenge request *is* the resolution, and it returns the whole reveal —
every hand, the count, the verdict, the die changes — in one response. The pause
the spec wants for drama is precisely the window that request needs. Nothing is
prepared that could be prepared; everything that *can* be pre-warmed (the
animation, the layout, the cup positions) is.

What the player must never see is a spinner. What they see is a beat of
stillness that was going to be there anyway.

If the request is slow enough to outlast the dramatic pause, the pause extends
rather than a spinner appearing — the table holds its breath. That degrades
honestly: a slow connection makes the moment longer, not broken.

### 5.2 Opening on the lowest legal bid would have been wrong

The one-tap promise asks the builder to open holding the smallest legal raise.
Derived from the rules rather than assumed, that turns out to be a jump to the
wildcard: against four fives the lowest legal bid is **two Perudos**, because
switching to Perudo lets the quantity fall (GAME_RULES §5).

So the builder opens on `minimalRaise` — nudge the face up if it can go up,
otherwise ask for one more of the same face — and `lowestLegalBid` is only the
floor of the quantity control. See D-008.

### 5.3 The Perudo face — resolved (§92.3)

The spec referred to a custom Joker symbol and canonical components as though
they existed; they did not. Now they do: the one is an Andean serpent-hook
glyph (D-006), drawn at two levels of detail so it survives both a player's own
hand and the size they scan the table at.

One component serves the bid builder, a hand and the reveal, so those three
cannot drift apart — which was the reason to settle it before building any of
them.

---

---

## 6. Where the screens are

| Screen | Component | Seen at |
|---|---|---|
| The table, waiting and acting | `features/game/GameTable` | `/preview` → Table |
| Building a bid | `features/game/BidBuilder` | inside the table |
| Dudo and Bull | `features/game/ChallengeActions` | inside the table |
| The reveal | `features/game/Reveal` | `/preview` → Reveal |
| The cup | `components/Cup` | inside the reveal |

`/preview` renders the real components against fixtures. It reaches no network
and no database, needs no identity, and is therefore the one screen that still
works when Supabase does not.

Two details the layout forced, both visible there:

- **The cups are on the table for the whole pause.** Dice *counts* are public,
  so the reveal can draw everyone's cup the instant a challenge is made and
  only needs the server for what is under them. The held beat is the table
  holding its breath, not an empty screen.
- **The lift is clipped, and the headroom collapses after it.** A cup that
  rises far enough to look lifted would otherwise travel up across the rest of
  the page. Each hand keeps room above it to be lifted through, and gives that
  room back once the dice are out.

## 7. The loop this all serves

```
wait → action → escalation → choice → anticipation → reveal
     → discovery → result → consequence → transition → wait
```

Every decision above is in service of that rhythm being effortless on a phone
held in one hand.
