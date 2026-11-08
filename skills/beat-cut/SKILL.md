---
name: beat-cut
description: Cut a film on its music so it hits like a 卡点 edit - calm shots before the drop, a rush into it, a flash on the drop, then a cut or a zoom punch on nearly every beat and a shake on the big hits. Measures the music, plans the shots, writes the punches as CSS and checks every cut in frames. Use for a montage, a music-driven edit, a travel, sport or event highlight, a product or brand cut to a track, a slideshow to music, or when the person asks to cut on the beat (卡点, 踩点, 卡点剪辑, 音乐卡点, 混剪, 节奏剪辑, 高燃混剪, 照片卡点).
---

# Beat cut

Make the cut an editor makes to music: the viewer feels every hit of the drop in the picture, without counting.

## What defines it

At the drop the picture changes or hits on nearly every beat: a cut, or a zoom punch inside a shot, a flash on the
drop itself, a shake on the strongest hits. Before it the shots are calmer, then rush into it. Exact cuts with
nothing on the hits between them are not this.

## What has to be true

- **Measured, not guessed.** Every cut on a beat, a half beat or a hit, within one frame, unless it sits in a pause of
  someone speaking; say which cuts are off and why.
- **The drop is marked.** `check` counts the drop's beats with a cut or a punch: 75% or more.
- **The music's shape.** Shots before the lift at least one and a half times as long as after it; the strongest shot
  on the lift. The film starts whole phrases before the lift and ends on a bar line or the music's end.
- **The best moment.** Look at every clip before choosing. Pick moments with `#t=`, not always from a clip's start:
  motion and peaks (a jump, a wave breaking, a face turning) for the drop, the biggest one on the lift.
- **Music that suits the film**; under speech, low enough that every word is clear.
- **Their footage as it is.** Trimmed with `#t=`, never re-encoded; effects are CSS on the clip.

## How

1. `node <this skill's folder>/scripts/beats.mjs <music>` measures it into `beats/<name>.json` and a playable
   waveform page. When it names another tempo or says the bars are a guess, do what it says (`--bpm`, `--bar`).
2. `beats.mjs plan beats/<name>.json --length <film seconds>` picks the stretch of music (whole bars, the lift a phrase
   in) and the shots: a bar each before the lift, the bar into it rushing (2, 1, ½, ½ beats), one or two beats each
   after it, one to end on. `--from`/`--to` (music seconds) when the person chose the part.
3. Write film.html from the plan: the music at 0 trimmed `#t=from,to`, one picture clip per shot on one track, each
   starting where the last ends (the plan's times are film seconds).
4. `beats.mjs punch film.html` writes the effects for the music under each clip: a slow push before the lift, a flash
   on the lift and each phrase after it, a zoom punch on every drop beat, a shake on strong half-beat hits. Run it
   again after changing any cut; it replaces what it wrote.
5. `beats.mjs check` in the film's folder reads film.html and the render beside it: every cut in frames, holes between
   clips, pace, the drop's marked beats, black bars. Work through its TO DO until nothing is left.
6. `npx openfilm render`, `npx openfilm look --full` (white flashes at the lift and phrase starts are the punch's),
   `look <t>` the lift and two drop beats, then `check` again.

`beats.mjs snap <beats/name.json> <seconds…> --to beat|half|bar|hit` gives the nearest mark to a music second. Music
at `at` trimmed `#t=in` puts music second m at film second `at + (m − in) / speed`.

Music comes from the person, from OpenFilm's free library (`npx openfilm get music-search --prompt "<what>"`), or a
source whose licence allows it. Speech in footage: `npx openfilm get asr --src <clip>`. The `footage-cut` skill, when
installed, logs a folder of clips shot by shot.

## With the person

What they ask for comes first: purpose, length, music, the shots that must be in it, effects they do not want (then
skip `punch`, or remove its style). Ask without holding up the work. When done, say in a few lines: the tempo, the part
of the music, cuts and how many on the beat, the drop's marked beats from `check`, the shot on the lift, any cut left
off the beat on purpose, and anything `check` or `look --full` still flags.
