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
- **The music's shape is the film's shape.** Longer shots in the quiet parts, shorter in the loud; scene changes on
  the first beat of a bar; the strongest shot on the lift; nothing new in the last bar but the ending.
- **Pace a viewer can follow.** A shot lasts long enough to read what it shows: one beat at the fastest for a
  picture, two or more for a shot with words or a face. Cut on every beat only in a short burst.
- **Music that suits the film.** Its mood and speed match what the film is for. The film starts on the music's first
  beat or a bar, and ends on a bar or the music's own end, never cut off in a phrase. Under speech, the music sits
  low enough that every word is clear.
- **Their footage as it is.** Trimmed with `#t=`, never re-encoded or changed in speed to fit a beat: move the cut,
  or choose another moment of the clip.

## What you have

`node <this skill's folder>/scripts/beats.mjs <music>` measures a piece of music into `beats/<name>.json` and
`beats/<name>.html` (the waveform with every beat, bar and hit, playable): its tempo, every beat, the first beat of each
bar, the hits that stand out, how loud each bar is, quiet and loud sections, and the bar where it lifts. All times
are seconds of the music file; a music clip placed at `at` and trimmed with `#t=in` puts music second m at film second
`at + (m − in) / speed` (speed 1 unless set). When the run names another tempo, or the bars are a guess, look at
the page and run again with `--bpm` or `--bar <a second that starts a bar>`; under `steady 0.25` the music has
little beat, so cut on its hits and phrases.

`beats.mjs snap <beats/name.json> <seconds…> --to beat|half|bar|hit` gives the nearest mark to each second.
`beats.mjs check` (in the film's folder) lists every picture cut of film.html with how many frames it is from the
music's nearest beat; `--strict` exits 1 while any is more than a frame off. It measures against beats only, so a cut
on a half beat or a hit shows as off: name it. Run it after each round of cuts, and `look` the frames on either side
of the cuts that matter.

Music comes from the person, from `npx openfilm get music`, or from a library whose licence lets them use it. Footage
with speech has its words with `npx openfilm get asr --src <clip>`; logging a folder of clips shot by shot is the
`footage-cut` skill's `footage.mjs`, when it is installed.

## With the person

What they ask for comes first: the film's purpose, its length, the track or the kind of music, the shots that must
be in it. Ask without holding up the work. When done, say in a few lines what was made: the music's tempo, how
many cuts and how many on the beat, the shot on the lift, and any cut left off the beat on purpose.
