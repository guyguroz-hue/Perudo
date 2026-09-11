# Perudo — House Rules (Authoritative Specification)

> **This document is the source of truth for game rules.**
> Conversation history is NOT a source of truth. If code contradicts this
> document, this document wins. If a rule changes, update this file first,
> then the engine, then the tests, then the UI.

Status legend:
- ✅ **DEFINED** — fully specified, safe to implement.
- ❓ **UNDEFINED** — deliberately unresolved. **DO NOT IMPLEMENT.** Requires a
  product decision from the project owner. See `DECISIONS.md` once resolved.

---

## 1. Setup ✅

- Each player normally starts with **5 dice** and **1 cup**.
- Dice are hidden. A player sees **only their own dice**.
- Dice are six-sided, faces `1`–`6`.

## 2. Bids ✅

A normal bid is a pair: **quantity** + **face**.

Example: `6 fives` = "there are at least 6 dice showing five across all active
players", counted with the wildcard rule below.

## 3. Wildcard / Perudo (ones) ✅

In a **normal** round, `1` is **Perudo / Joker**.

When a normal face (2–6) is bid, **ones count toward that face**.

> Example: bid `6 fives`. Actual dice contain 4 fives and 2 ones →
> count = 6 → the bid is **TRUE**.

When the bid face **is** Perudo (`1`), only actual ones count.

**Exception:** during a Farewell Round, Perudo is **NOT** a wildcard (§9).

## 4. Normal bid progression ✅

A new bid must strictly exceed the current bid. Legal raises:

| Raise type      | Example            |
|-----------------|--------------------|
| Quantity up     | `4 fives` → `5 fives` |
| Face up         | `4 fives` → `4 sixes` |
| Both up         | `4 fives` → `5 sixes` |

A bid may **never** decrease in either dimension.
Server-side validation is authoritative; client-side validation is UX only.

## 5. Normal → Perudo ✅

Minimum Perudo quantity when switching from a normal face:

```
ceil(previous_quantity / 2)
```

| Previous | Min Perudos |
|----------|-------------|
| 4        | 2           |
| 5        | 3           |
| 6        | 3           |
| 7        | 4           |
| 8        | 4           |
| 9        | 5           |

A normal round **cannot open directly with Perudo**.

## 6. Perudo → normal ✅

Minimum quantity when switching from Perudo back to a normal face:

```
previous_perudo_quantity * 2 + 1
```

| Previous Perudos | Min normal quantity |
|------------------|---------------------|
| 4                | 9                   |
| 5                | 11                  |
| 6                | 13                  |

## 7. Dudo (normal) ✅

Dudo / "Liar" challenges the **current active bid**. Dice are revealed.

| Outcome            | Consequence            |
|--------------------|------------------------|
| Bid is **FALSE**   | **Bidder** loses 1 die |
| Bid is **TRUE**    | **Dudo caller** loses 1 die |

**Normal Dudo NEVER grants a die.** Die gain is only possible via Burst Dudo (§11).

## 8. Bull

### 8.1 What Bull is ✅

Bull is a **declaration in the bidding chain** — *not* an immediate challenge.
It does **not** reveal dice.

Bull changes the interpretation of the **current active bid**:

```
FROM:  at least X
TO:    exactly X
```

> Example: current bid `7 fives`. Bull → "exactly 7 relevant dice".

There is only ever **one** current active bid.

### 8.2 Bull is not permanent ✅

Any later valid bid **completely supersedes** the Bull.

> A: `7 fives` → B: Bull → C: `8 fives` → D: `9 sixes` → A: Dudo
> A is challenging **`9 sixes`**, not `7 fives`. The earlier Bull is irrelevant.

Historical Bulls remain in the event log, but authoritative game state holds
only the **current** active bid and its current semantics.

### 8.3 Correct Bull resolution ✅

If Bull is the current active bid and it is challenged:

Bull is **correct** when `actual_count === declared_quantity` (exact).

If correct: **every currently active participant EXCEPT the Bull caller loses
1 die.** The Bull caller loses nothing.

### 8.4 False Bull resolution ❓ UNDEFINED

**The consequence of a FALSE current Bull is NOT defined.**
**DO NOT INVENT IT.** Requires a product decision.

### 8.5 Bull eligibility ❓ UNDEFINED

Unspecified: *who* may declare Bull and *when* — only the player whose normal
turn it is, or any player (Burst-style interruption)? See §12.6.

## 9. Burst (התפרצות) ✅ / ❓

### 9.1 Burst bid ✅

A player may **Burst** — make a higher legal bid **out of normal turn order**.

- The Burst bid must satisfy all normal bid-legality rules (§4–§6).
- Burst redirects the round away from the player who held the normal turn.

The backend must track **separately**:
- normal turn
- current bidder
- last Burst player
- resumption player

When Burst activity stops, normal clockwise play resumes with the player
**AFTER the LAST BURST PLAYER**. This must be explicit in authoritative state.

### 9.2 Burst Dudo ✅

A player may Burst Dudo out of turn.

| Outcome            | Consequence                                      |
|--------------------|--------------------------------------------------|
| Challenged bid **FALSE** | Bidder **−1 die**; Burst-Dudo caller **+1 die** |
| Challenged bid **TRUE**  | Burst-Dudo caller **−1 die**                    |

**Only Burst Dudo can generate a die gain.** Server-authoritative.

### 9.3 Die-gain ceiling ❓ UNDEFINED

Unspecified: is there a maximum dice count (e.g. 5) when gaining via Burst
Dudo? Can a player exceed their starting count?

## 10. Farewell Round (סיבוב פרידה) ✅ / ❓

Triggered when a player is reduced to **exactly one die after losing a die**.

- That player **starts the next round**.
- The opening face may be **ANY** face — **including Perudo**.
- The chosen face is **LOCKED for the entire Farewell Round**.
- Only **quantity** may increase. The **face may NOT change**.
- **Perudo is NOT a wildcard** during a Farewell Round.
- After the Farewell Round ends, normal rules resume.

Authoritative state must explicitly represent: farewell-active, farewell
player, locked face, round progression, and the transition back to normal.

❓ **UNDEFINED:** whether Burst and/or Bull are permitted during a Farewell Round.
❓ **UNDEFINED:** whether a player who *remains* at 1 die (without losing one)
triggers a further Farewell Round.

## 11. Elimination ✅

- A player losing their final die reaches 0 dice and is **eliminated**.
- Eliminated players are no longer active participants and cannot act.
- The **last active player wins**; the game is marked complete.

## 12. ❓ UNDEFINED RULES — DO NOT INVENT

These are deliberately unresolved. On reaching any of them: **STOP, present
options, ask.** Never silently choose.

1. **False current Bull consequence** (§8.4).
2. **Simultaneous players reaching one die** — who starts the Farewell Round?
3. **Multiple eliminations from a single resolution** (reachable via correct
   Bull, §8.3) — ordering, winner determination.
4. **Ambiguous Farewell starter.**
5. **New-round starter** when not otherwise determined (i.e. after an ordinary
   round that does not trigger Farewell).
6. **Burst + Bull interaction** (§8.5) — may Bull be declared out of turn?
   May an already-Bulled bid be Bulled again?
7. **Burst/Bull legality during a Farewell Round** (§10).
8. **Die-gain ceiling** (§9.3).
9. Any other situation the rules do not uniquely determine.
