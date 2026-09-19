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
| **TURN** | relays the audio for pairs that cannot reach each other | Cloudflare, minted server-side |
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
carrier-grade NAT — common on mobile networks — and for those the audio has to
be relayed.

1. Cloudflare dashboard → **Realtime** → **TURN** → create a key. Keep the
   **Key ID** and the **API token**.
2. Supabase → **Edge Functions** → **Secrets**, add:
   - `CLOUDFLARE_TURN_KEY_ID`
   - `CLOUDFLARE_TURN_API_TOKEN`
3. Redeploy the `game` function.

**Why server-side.** The key is permanent and mints unlimited credentials, so a
browser holding it could hand strangers a relay to use at our expense forever.
The `voice_ice` action mints credentials good for a few hours, behind the same
membership check as every other action — relay bandwidth costs money, and the
people entitled to it are exactly the people playing this game.

**Cost.** Cloudflare's TURN service is 1,000 GB/month free, then $0.05/GB. Six
players talking with *every* pair relayed is roughly 430 MB an hour, so the free
allowance is over two thousand hours of play a month. In practice only a
fraction of pairs are relayed at all.

**Without it** the call still runs, on public STUN. Some pairs will fail to
connect; everyone else is unaffected. That is deliberate: a table where two
people cannot hear each other is a better outcome than a table where nobody can
press the button.

---

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
