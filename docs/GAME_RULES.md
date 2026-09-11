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

### The governing rule ✅ (resolved by R-009)

**The quantity is the anchor and may never fall.**

| Situation | Legal? |
|---|---|
| Quantity rises | ✅ — the face may then go anywhere, up or down |
| Quantity holds | ✅ only if the face rises |
| Quantity falls | ❌ always |

So `4 fives → 5 fours` is a legitimate raise, while `5 fours → 4 anything` is
not. Server-side validation is authoritative; client-side validation is UX only.

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

### 8.4 False Bull resolution ✅

If the Bull is **false** — `actual_count !== declared_quantity`, whether the real
count is higher or lower — the **Bull caller alone loses 1 die**. Nobody else is
affected, the challenger included.

Declaring an exact count is a strong claim; being wrong costs only the player who
made it.

### 8.5 Bull eligibility ✅ (resolved by R-005)

A Bull is a bet like any other, so it may be declared **out of turn, as a
Burst**. Any active player may call it, not only the player whose turn it is.

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

**Only Burst Dudo can generate a die gain**, and never above five (§9.3).
Server-authoritative.

### 9.4 Burst Dudo against a Bull ✅ (resolved by R-006)

A Bull is an ordinary bet, so Burst Dudo works against it exactly as it works
against any other bid — the two rules compose without conflict:

| Bull | Consequence |
|---|---|
| **False** | Bull caller **−1**; Burst-Dudo caller **+1** |
| **Exact** | Everyone except the Bull caller **−1**, the Burst-Dudo caller among them |

Note the second row: **bursting does not shield the rest of the table** from a
correct Bull. The mistaken challenger's −1 is simply their share of "everyone
except the caller", so no separate penalty is needed.

### 9.3 Die-gain ceiling ✅ (resolved by R-007)

**No player may ever hold more than five dice, in any situation.** A Burst Dudo
won by a player already holding five wins them nothing; the die is simply not
granted. The loser still loses theirs.

This is enforced in the database as well as the engine, so a bug in the action
layer cannot quietly mint a sixth die.

## 10. Farewell Round (סיבוב פרידה) ✅ / ❓

Triggered when a player is reduced to **exactly one die after losing a die**.

The trigger is the **transition** down to one die, not the state of holding one:

- A player parked on a single die does **not** earn a new Farewell Round each
  time around. It happens once per descent.
- A player who drops to one die, wins a die back with Burst Dudo, and is later
  knocked down to one again **does** earn a fresh Farewell Round. They crossed
  the boundary a second time.

- That player **starts the next round**.
- The opening face may be **ANY** face — **including Perudo**.
- The chosen face is **LOCKED for the entire Farewell Round**.
- Only **quantity** may increase. The **face may NOT change**.
- **Perudo is NOT a wildcard** during a Farewell Round.
- After the Farewell Round ends, normal rules resume.

Authoritative state must explicitly represent: farewell-active, farewell
player, locked face, round progression, and the transition back to normal.

### Several players at once ✅ (resolved by R-003)

A correct Bull can drive several players down to one die simultaneously. Each is
owed their own Farewell Round: they are **queued**, one takes the next round, the
next follows after that. The order among them is explicitly arbitrary — the
engine uses seat order, which is deterministic and replayable.

❓ **UNDEFINED (R-008):** whether Burst and/or Bull are permitted during a
Farewell Round.

## 11. Elimination ✅

- A player losing their final die reaches 0 dice and is **eliminated**.
- Eliminated players are no longer active participants and cannot act.
- The **last active player wins**; the game is marked complete.

### Who opens the next round ✅ (resolved by R-002)

**Whoever was proved right opens the next round.**

| Outcome | Opens next |
|---|---|
| Bid challenged and stood | the **bidder** |
| Bid challenged and fell | the **challenger** |
| Bull exact | the **Bull caller** |
| Bull false | the **challenger** |

This holds for Burst Dudo as well. Being right never costs a die, so the player
it names is always still holding dice.

**A Farewell Round takes precedence:** a player knocked down to one die opens
instead, and the winner's turn follows.

Two alternatives are stored as a room setting but **not implemented**
(`round_start_rule`): `loser_starts`, and `free_for_all` where anyone may burst
in and the fastest bid opens.

### Several eliminations at once ✅ (resolved by R-004)

A single resolution may eliminate more than one player. Order carries no meaning
and no tiebreak is applied: an eliminated player is never awarded the win. If one
player is left holding dice they win; if none are, the game ends with **no
winner**.

> Worth noting: under the current rules the no-winner case appears
> **unreachable**. Normal Dudo and Burst Dudo each cost exactly one player a die,
> a correct Bull spares its caller, and a false Bull costs only its caller — so
> somebody always survives. The rule is implemented regardless.

## 12. ❓ UNDEFINED RULES — DO NOT INVENT

These are deliberately unresolved. On reaching any of them: **STOP, present
options, ask.** Never silently choose.

**Resolved:** R-001 (false Bull, §8.4) · R-002 (round starter, §11) ·
R-003 (simultaneous Farewell, §10) · R-004 (simultaneous elimination, §11) ·
R-005 (Bull eligibility, §8.5) · R-006 (Burst Dudo on a Bull, §9.4) ·
R-007 (dice ceiling, §9.3) · R-009 (bid progression, §4).

**Still open — do not implement:**

1. **R-008 — Burst and Bull during a Farewell Round.** The face is locked and
   Perudo is not wild; may a player still burst in, and may a Bull be declared?
2. Any other situation the rules do not uniquely determine.
