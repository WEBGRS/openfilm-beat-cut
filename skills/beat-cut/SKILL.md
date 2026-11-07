---
name: beat-cut
description: Cut a film on its music - footage, pictures or pages cut so every change lands on a beat, the scene changes on the bars, the big moments on the hits, and the pace follows the music's quiet and loud parts. Measures the music first (tempo, beats, bars, hits, where it lifts) and checks every cut in frames. Use for a montage, a music-driven edit, a travel or event highlight, a product or brand cut to a track, a slideshow to music, or when the person asks to cut on the beat (卡点, 踩点, 卡点剪辑, 音乐卡点, 混剪, 节奏剪辑, 高燃混剪, 照片卡点).
---

# Beat cut

Make the cut an editor makes to music: the picture changes when the music says so, the viewer feels the beat
without counting it, and the film's best moment arrives where the music lifts.

## What defines it

Every change of picture is on the music. Cuts placed by the clock, or shots laid end to end at one length, are not
this, however good the shots.

## What has to be true

- **Measured, not guessed.** Measure the music before the first cut. Every cut is on a beat, a half beat or a hit,
  within one frame, unless it sits in a pause of someone speaking; say which cuts are off and why.
- **The music's shape is the film's shape.** Shots in the quiet parts at least one and a half times as long as in the
  loud parts; scene changes on the first beat of a bar; the strongest shot on the lift.
- **Built in phrases.** The film starts a whole number of phrases (4 or 8 bars) before the lift, and ends at the end
  of a phrase or the music's own end, or fades over its last bar. Nothing new in the last bar but the ending.
- **The best moment.** Look at every clip before choosing what goes on the lift. Pick the moment inside a clip with
  `#t=`, not always from its start.
- **Pace a viewer can follow.** A shot lasts long enough to read: one beat at the fastest for a picture, two or more
  for words or a face; a cut on every beat only in a short burst.
- **Music that suits the film**, in mood and speed; under speech, low enough that every word is clear.
- **Their footage as it is.** Trimmed with `#t=`, never re-encoded or changed in speed to fit a beat: move the cut,
  or choose another moment of the clip.

## What you have

`node <this skill's folder>/scripts/beats.mjs <music>` measures a piece of music into `beats/<name>.json` and
`beats/<name>.html` (a playable waveform) and prints the tempo, whether the beats are one straight line, the quiet
and loud sections and the second the music lifts. Times are seconds of the music file: a music clip placed at `at`
and trimmed with `#t=in` puts music second m at film second `at + (m − in) / speed`. When it names another tempo or
says the bars are a guess, do what it says (`--bpm`, `--bar`). Under `steady 0.25` cut on its hits and phrases.

`beats.mjs snap <beats/name.json> <seconds…> --to beat|half|bar|hit` gives the nearest mark to each second.

`beats.mjs check` in the film's folder reads film.html and, when one lies beside it, the render. Run it when the cuts
are in and again after `npx openfilm render`. It finds holes between clips, which render as black frames. It ends
with TO DO: work through the list until it says nothing is left. `--strict` exits 1 while something is.

`npx openfilm look assets/<clip>` shows a clip's frames. After rendering, `npx openfilm look --full` lists white
flashes, black frames and stills; `check` says which black frames the render drew. A film's contact sheet does not
show cuts: `look <t>` the cut at the lift, one cut in each section, and either side of the cuts that matter.

Music comes from the person, from OpenFilm's free library (`npx openfilm get music-search --prompt "<what>"`), or
from a source whose licence allows it. Speech in footage: `npx openfilm get asr --src <clip>`. The `footage-cut`
skill, when installed, logs a folder of clips shot by shot.

## With the person

What they ask for comes first: purpose, length, music, the shots that must be in it. Ask without holding up the
work. When done, say in a few lines: the tempo, cuts and how many on the beat, shots per section, the shot on the
lift, any cut left off the beat on purpose, and anything `check` or `look --full` still flags.
