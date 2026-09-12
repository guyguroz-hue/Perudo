# Music

Drop a looping track here as `table.mp3` and the game plays it under the round.

Nothing else has to change: `src/lib/sound.ts` loads `/audio/table.mp3` if it is
there, fades it in over about a second and a half, loops it, and stays silent if
the file is absent. The sound switch on the table turns it on and off with
everything else.

## What to look for

- **Quiet and unhurried.** It sits under a room already carrying a rattle of
  dice and a knock of cups; anything with a strong beat will fight them.
- **A real loop.** The join has to be silent — a track that fades out at the end
  will breathe in and out every couple of minutes and drive people mad.
- **Two to four minutes.** Long enough not to be noticed repeating, small enough
  to download on mobile data. Around 128 kbps mono is plenty at this volume.
- **Licensed for this.** Whatever the source, it needs a licence that covers
  putting it in a product on the open web.

The playback level is set in `src/lib/sound.ts` (`MUSIC_LEVEL`), currently 0.18
against 0.5 for the dice — the music is a room, not a track.
