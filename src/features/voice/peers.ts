/**
 * The two decisions a mesh has to get right, and nothing else.
 *
 * Everything else about WebRTC is I/O — microphones, sockets, a browser's own
 * negotiation state machine — and none of it can be reasoned about on paper.
 * These two can, and both of them are the kind of thing that works at a table
 * of two and falls apart at a table of six.
 */

/**
 * Who gives way when two peers offer at the same moment.
 *
 * Both sides of a connection can decide to renegotiate at once — somebody
 * unmutes while somebody else is joining — and if both then insist on their own
 * offer, the connection dies. The standard answer ("perfect negotiation") is
 * that one side is polite and rolls back; what matters is only that the two
 * sides never disagree about which one that is.
 *
 * So it is decided by comparing the two ids, which both sides can do without
 * asking each other, and which cannot come out differently on the two phones.
 */
export function politeToward(youId: string, peerId: string): boolean {
  return youId < peerId
}

/**
 * What changed in the room since last time.
 *
 * A mesh is one connection per other person, so every arrival opens one and
 * every departure closes one — and the list this is derived from arrives as a
 * whole snapshot, repeatedly, mostly unchanged. Working out the difference in
 * one place keeps "somebody joined" from meaning "tear down and rebuild the
 * table's audio", which is what a naive re-sync does every few seconds.
 */
export function meshChange(
  held: Iterable<string>,
  present: Iterable<string>,
  youId: string,
): { readonly opened: string[]; readonly closed: string[] } {
  const now = new Set(present)
  // You are never your own peer, however the room lists you.
  now.delete(youId)
  const before = new Set(held)

  return {
    opened: [...now].filter((id) => !before.has(id)),
    closed: [...before].filter((id) => !now.has(id)),
  }
}

/**
 * Whether a voice is loud enough to call speaking, given what it was doing.
 *
 * Two thresholds rather than one. A single line produces a badge that flickers
 * on and off through every pause between words, which is worse than no
 * indicator at all: an indicator that strobes is something to look away from,
 * and this one sits on a player's face.
 */
export function isSpeaking(level: number, was: boolean): boolean {
  return was ? level > 0.02 : level > 0.045
}
