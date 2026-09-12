# Music

The game already has music. It is generated in the browser by
`src/lib/ambient.ts` — slow chords from one mode, an occasional stray note, and
a very quiet room tone underneath. There is no file to download and no licence
to hold, and because it is written a few seconds ahead of the clock rather than
looped, there is no seam to hear. It never repeats exactly.

Drop a track in here as **`table.mp3`** and it takes over. Nothing else has to
change: `src/lib/sound.ts` tries the file first and falls back to the generated
bed only when the file is not there. The sound switch on the table controls
whichever is playing.

## If you do add a track

- **Quiet and unhurried.** It sits under a room already carrying a rattle of
  dice and a knock of cups; anything with a strong beat will fight them.
- **A real loop.** The join has to be silent. A track that fades out at the end
  will breathe in and out every couple of minutes, which is exactly the thing
  the generated bed exists to avoid — so a bad loop is worse than no file.
- **Two to four minutes.** Long enough not to be noticed repeating, small enough
  to download on mobile data. Around 128 kbps mono is plenty at this volume.
- **Mastered to a normal level.** The bed is levelled to sit where a mastered
  track sits, so a quiet, unmastered file will arrive noticeably quieter than
  what it replaced.
- **Licensed for this.** Whatever the source, it needs a licence that covers
  putting it in a product on the open web. Pixabay's music library is the
  simplest: commercial use, no attribution required.

The mix level is `MUSIC_LEVEL` in `src/lib/sound.ts`, currently 0.18 against 0.5
for the dice — the music is a room, not a track.
