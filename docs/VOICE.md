# Voice at the table

Perudo is played out loud. The bluffing *is* the game, and a table with no
voices is six people typing numbers at each other — so the room runs a small
voice call between its players, in the browser, with no app to install and
nothing for anybody to organise.

---

## 1. The shape

**A mesh.** Every player holds one direct connection to every other. That is the
wrong shape above about eight people and exactly the right one at six, which is
all this game will ever seat: it needs no media server, so nothing sits between
two friends talking except the internet.

**Players only.** A mesh costs each player one connection per listener, and the
room now admits any number of spectators; twenty watchers would mean every
player uploading twenty-five streams so they could listen in. Voice is for the
six at the table. This is a decision, not an oversight.

**Optional, and per player.** Nobody is in the call until they press the
microphone. A table where three people talk and three do not is a table that
works — and pressing it is also the gesture iOS requires before it will hand
over a microphone or start playing audio, so the button is load-bearing twice.

---

## 2. What it is made of

| Piece | What it does | Where |
|---|---|---|
| **Signalling** | the back-and-forth two browsers have before they can hear each other | Supabase Realtime broadcast + presence, `voice:{gameId}` |
| **STUN** | tells a browser its own public address | public, free |
| **TURN** | relays the audio for pairs that cannot reach each other | any provider, by environment — see §3 |
| **Mesh** | one `RTCPeerConnection` per other player | `src/features/voice/useVoice.ts` |
| **The decisions** | who gives way in a collision; what changed in the room; who counts as speaking | `src/features/voice/peers.ts` |

**Perfect negotiation.** Both sides of a connection can decide to renegotiate at
the same moment, and if both insist on their own offer the connection dies. One
side is polite and rolls back; which one is decided by comparing the two user
ids, so the two phones cannot disagree about it without talking first.

**Levels never touch React.** Audio levels are sampled into a ref eight times a
second and only a *change in who is speaking* reaches the screen. The
alternative is re-rendering the table seven times a second for the length of a
game.

---

## 3. Setting up the relay

Most pairs connect directly or over STUN. The ones that cannot are both behind
carrier-grade NAT — ordinary on mobile networks — and for those the audio has to
be relayed.

**The relay is configured by environment, not by provider.** The `voice_ice`
action reads whichever of these it finds, in this order:

```
TURN_URLS          turn:relay.example.com:80,turns:relay.example.com:443
TURN_USERNAME      whatever the provider gave you
TURN_CREDENTIAL    whatever the provider gave you
```

That is what every free TURN provider hands out, and it is also what a coturn on
a box of your own hands out. The password is long-lived and reaches the browser,
which is the honest trade: it is a relay account, not a key that mints relay
accounts.

```
CLOUDFLARE_TURN_KEY_ID
CLOUDFLARE_TURN_API_TOKEN
```

The better shape, if you ever want it: a key that mints credentials good for a
few hours, so nothing long-lived leaves the function. It wants a card on file,
which is precisely why it is not the only way in.

Either goes in Supabase → **Edge Functions** → **Secrets**, then redeploy the
`game` function.

### Without any of it

The call still runs, on public STUN. Some pairs will fail to connect; everyone
else is unaffected. That is deliberate — a table where two people cannot hear
each other is a better outcome than a table where nobody can press the button —
and it is **not presented as silence**: a connection that fails twice marks that
player's badge with a dashed amber edge, because the alternative is a player
spending the evening thinking somebody is being unusually quiet.

Expect it to matter most when two people are both on mobile data. Two players on
home wifi almost always reach each other without help.

## 4. What is tested, and what is not

`npm run test:live` proves the whole chain rather than a mock of it. Chromium's
fake capture device plays a tone; it goes into one browser's microphone, crosses
a real `RTCPeerConnection`, comes out of another browser's speaker, and is loud
enough there that the second screen says who is talking. Muting, the peer count,
and a player who never joined are checked in the same run.

What it cannot test is **Safari on a phone**, which is where this will actually
be used. The known traps, all handled and none verifiable here:

- audio plays through an `<audio srcObject>` element, not through WebAudio —
  Safari will build a graph from a remote stream and play nothing from it
- `playsinline`, and an `AudioContext` resumed inside the join gesture
- `pagehide` leaves the call, so a closed tab is not a peer that lingers
- `failed` connections restart ICE rather than being torn down, so a tunnel does
  not end the conversation

Battery is a real cost and there is no trick for it: an open call for an hour is
an hour of radio and encoder.
