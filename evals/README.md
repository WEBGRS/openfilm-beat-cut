# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

Two requests, each run once with the skill and once without, on OpenFilm 0.3.0. Where the music has a quiet part and
a lift, the films made with the skill start in the quiet part, hold longer shots there and put a cut on the second
the music lifts. The films made without it used a loud stretch of the track and never reached the lift. Neither
request asked for the lift. On cutting to the beat the arms did not differ in a way a person would hear: every film
has all its cuts within 1.1 frames of the music's beat grid, and the arm without the skill was closer on request 2
(0.04 frames on average against 0.2 to 0.3). The first trial's four cuts off the beat did not come back. Both films of
request 2 had three single black frames at cuts, and both agents took what `look --full` flagged for the footage.
The second run of request 2, with the skill fixed for that, had none, so the new black frame report was never
tested on an agent.

- Skill version: 0.2.0 for the first run of each request, 0.2.1 for the second run of request 2
- Agent: Claude Code, headless, in a project outside the home folder, so no personal rules applied
- Model: `claude-sonnet-5-5`, as `run.jsonl`'s init event reports it in every run. The usage totals also list `claude-haiku-5-5`
- OpenFilm: 0.3.0, the only version the runs could use
- Date and OS: 2026-11-06 and 2026-11-07, Windows 11
- Transcripts: none supplied. The clips carry their own ambient sound and no request asks for speech to be kept or cut
- The skill folder: each arm with the skill was given the committed folder, which the harness copied when the arm got its run slot. The three runs read it (a Skill or Read of `SKILL.md`) and ran `beats.mjs` 5, 5 and 4 times: once to measure the music, the rest to check
- The films were read from contact sheets and frames. None was watched in Studio or listened to

Both requests were written to files before the first run and not changed. They are the requests of the first trial,
word for word, on the same material. Each ran once in each arm. The second run of request 2 is the one extra run the
rules allow after a defect a run exposed: the black frames. The earlier row is kept. No request names the skill.
Request 1 says 卡点, the usual Chinese word for cutting on the beat, which also appears in the skill's description.

## Request 1

```
assets 文件夹里是我这次旅行拍的素材（clip01–clip12），还有一首音乐 screen-saver.mp3。用 OpenFilm 帮我剪一条 45 秒左右的旅行卡点混剪，配这首音乐，要发朋友圈的。剪好导出成 mp4。
```

| measure | with 0.2.0 | without |
| --- | --- | --- |
| length (asked for about 45 s) | 44.00 s | 46.28 s |
| music used, in seconds of the file | 100.75 to 144.75 | 0 to 46.28 |
| cuts (of those, confirmed in the render's pixels) | 32 (32) | 45 (44) |
| within 1 frame of a beat or half beat, waveform grid | 32/32 | 22/45 |
| within 2 frames, waveform grid | 32/32 | 45/45 |
| mean and worst frames off, waveform grid | 0.35, 0.42 | 1.00, 1.07 |
| the lift (115.98 s of the music) | in the film at 15.23 s, a cut 0.5 frames from it | not in the film |
| shots by section of the music | quiet: 4, mean 3.50 s; loud: 29, mean 1.03 s | mid: 1, 2.00 s; loud: 44, mean 0.91 s |
| longest run of shots of one length | 8 | 8 |
| black stretches in the render | the last frame | the first and last frame, fades |
| sound level, whole film and last 0.3 s | -19.3 dB, -39.4 dB | -14.5 dB, -38.6 dB |
| minutes, turns, cost | 17.0, 39, $0.59 | 22.5, 38, $0.57 |
| the skill's own `check` (the measure the skill works against) | 32/32 on the grid, quiet shots 4.0 times as long as loud, cuts per bar against level r 0.59, nothing to do | 45/45 on the grid, no quiet part in the music used, r 0.03, 3 items to do |

Seen, with: skyline, market, night motorbikes and a sunset sea in the four long shots of the quiet part, then at 15.23 s
the cut to a drone shot of a surfer on a large green wave, on the second the music steps up. Surf, kite, coast and
motorbike shots follow, and the film ends fading out. `look --full` flagged one white flash at 39 s, which is spray in
the clip05 footage. The agent used `check` four times: its first run listed a run of equal shots and no cut at the lift,
and the film was changed to fix both. It left clip12 out and avoided the black stretches at the start of clip10.

Seen, without: a 0.8 s fade up from black on an aerial surf shot, then city, motorbikes, kite and surf, a sunset
sea, a market, and a fade to black. Cuts are on a grid of 0.28 s plus 0.5 s steps, which sits one frame after the
waveform grid, so the 1-frame row splits and the 2-frame row does not. The agent set the loudness to -14 LUFS,
ran `look --full` and found nothing flagged. The 46 s it used are the loud first part of the track, so the film has
no quiet part and no lift.

## Request 2

```
Using OpenFilm, make a 30 second skate highlight reel for our crew from the clips in assets (clip01 to clip10), cut to the music in assets/movement-proposition.mp3. Export an MP4 when it's done.
```

| measure | with 0.2.0 | with 0.2.1, second run | without |
| --- | --- | --- | --- |
| length (asked for 30 s) | 30.47 s | 30.48 s | 30.00 s |
| music used, in seconds of the file | 100.98 to 131.45 | 100.98 to 131.46 | 60.52 to 90.52 |
| cuts (of those, confirmed in the render's pixels) | 18 (18) | 21 (21) | 20 (20) |
| within 1 frame of a beat or half beat, waveform grid | 18/18 | 21/21 | 20/20 |
| mean and worst frames off, waveform grid | 0.34, 0.67 | 0.23, 0.25 | 0.04, 0.07 |
| the lift (116.21 s of the music) | in the film at 15.23 s, a cut 0.2 frames from it | in the film at 15.23 s, a cut 0.4 frames from it | not in the film |
| shots by section of the music | quiet: 7, mean 2.45 s; loud: 12, mean 1.11 s | quiet: 6, mean 2.54 s; loud: 16, mean 0.95 s | loud: 21, mean 1.43 s |
| longest run of shots of one length | 3 | 3 | 4 |
| single black frames inside the film | 3 (21.9, 23.8, 25.7 s) | 0 | 3 (6.67, 21.9, 26.67 s) |
| sound level, whole film and last 0.3 s | -14.6 dB, -13.0 dB | -14.6 dB, -12.7 dB | -10.5 dB, -9.7 dB |
| minutes, turns, cost | 24.8, 37, $0.51 | 25.9, 32, $0.43 | 12.6, 33, $0.38 |
| the skill's own `check` | 18/18 on the grid, quiet 2.2 times as long as loud, r 0.44, nothing to do at 0.2.0 and the 3 black frames at 0.2.1 | 21/21 on the grid, 2.7 times, r 0.51, nothing to do | CHECKWITHOUT |

Seen, with, first run: a wide of the bowl, longer trick shots over the quiet bars, then the jump over two seated
skaters (clip09) on the lift, and a burst of one-beat shots. The music stops on a bar line at 131.45 s with no fade.
Frames 657, 714 and 771 of the render are black on every pixel: a one-frame flash at three cuts. The source files
have picture at those seconds (clip08 at 15.9, clip04 at 22.8, clip02 at 13.0). `look --full` flagged all three as
near black, and the agent wrote that they sit on cuts in the dark arena footage and did not open them. The three
clips with black side bars in the files (clip02, clip06, clip10) are scaled to fill the frame and the render shows no
bars.

Seen, with, second run: two shots of the bowl (clip03) and arena trick shots over the quiet bars, then on the lift
a cut to a skater crouched on a Moscow ramp (clip04); the agent's report calls it an airborne trick, and the frame
at 15.4 s shows him crouching. Most of the loud part is the Tokyo arena clips. The music stops on a bar line at
131.46 s with no fade. The render has no black frame inside the film. `look --full` flagged four white flashes
(11.5, 12.6, 20 and 28.6 s); the agent opened two and read them as bright footage, and I did not open the others.

Seen, without: tricks from all ten clips in 1.43 s shots, three beats each, cut on the beat to 0.07 frames. Frames
200, 657 and 800 are black on every pixel, one frame at three cuts, each at the start of a clip02 shot (clip02 is
one of the three files with side bars; they are zoomed to fill the frame). The agent's report names `look --full`
flagging near black at 21.9 s and calls it footage, without confirming. The music is the loud stretch from 60.5 s and ends on
the beat with no fade.

## The four cuts that were off in 0.1.1

In the first trial of request 1 (skill 0.1.1), four cuts of the arm with the skill sat 3.2 frames or more off a
steady 120 BPM pulse, all in the music's quiet part, and the arm without the skill had none. The cause was in
`beats.mjs`. Its beat tracker follows the strongest attack. In that track the strongest attack is the off beat in the
loud parts and the kick in the quiet part, so at 100 to 116 s the tracked beats slid off the pulse, by up to 6.9
frames, and from the lift on they stayed half a beat from where they had been. The agent cut on the beats it was
given. `check` compared the cuts with those same beats, so it reported all 35 cuts as 0 frames off. Both should have
caught it: `beats.mjs` never tested its beats against the tempo it had found, and `check` had no second opinion.

0.2.0 puts the beats of music that keeps one tempo on a straight line and says how many beats it moved. The same
film from that trial, checked again:

| the film of request 1 with the skill at 0.1.1 | `check` 0.1.1 | `check` 0.2.0 |
| --- | --- | --- |
| cuts off the beat | 0 of 35 | 4 of 35, at 3, 4.9, 4.7 and 6.1 frames |
| the waveform grid, written apart from the skill | 4 of 35 off | 4 of 35 off |

The test `a constant tempo whose strongest attack moves from the off beat to the kick` makes the same fault in
synthetic music: with 0.1.1 the worst beat is 3.7 frames off the grid, with 0.2.0 0.03 frames. In the new runs the
cuts of the arms with the skill are on the grid: 0.42, 0.67 and 0.25 frames at worst.

That run's lift was wrong too. The measure put it at 116.49 s and the film put its strongest shot there, one beat
after the music steps up (115.98 s by `evals/lift.mjs`, which does not use `beats.mjs`). The 0.1.1 row that said the
cut was on the lift was measured against that wrong second. 0.2.0 finds the lift as the second the level steps up.

## What the numbers do and do not show

A cut lands within 1 frame of a half-beat grid at these tempos by chance 27 to 28% of the time. Every film beats that.

The waveform grid is a constant-tempo grid made apart from the skill. The arm without the skill on request 1 put its
cuts 1.0 frame after it, so the 1-frame row falls between the two and reads 22/45. Read it with the 2-frame row.
The beats of `beats.mjs` sit 0.2 to 0.3 frames from the waveform grid. The two disagree by less than half a frame,
and neither is the truth to better than that.

The arms differ on the music's shape because of where in the track they cut. The agents with the skill used the
quiet part and the lift because the brief says to; the agents without it chose a loud stretch. Neither request said
which part of the track to use. The skill's own `check` row is the measure the skill works
against, so it favours the arm with the skill by construction; the other rows do not use it.

Sound level differs between the arms: the films with the skill are 4.8 dB (request 1) and 4 dB (request 2) quieter
than those without it, and in request 1 the agent without the skill set -14 LUFS. The skill says nothing about loudness.

## The material

Same files in both arms, not in this repository. All clips were converted beforehand to 1080p H.264 at 30 fps with their own sound, under neutral names in shuffled order.

Both tracks were picked before any run from 12 Incompetech tracks measured with the first version of `beats.mjs`, because they have a quiet part and a lift. A track without one would give the skill less to do, so these results lean toward what it does best.

Request 1 music: "Screen Saver", Kevin MacLeod (incompetech.com), CC BY 4.0. Clips:

- Wikimedia Commons, CC BY-SA 4.0: Surfing-1012624 and Surfing-1012628, Dingle Peninsula, and Wind Surfing-1025737, Dingle Peninsula (Maoileann); Kite surfing at Viganj 163559 1 (Quahadi); Surfing in Tel Aviv MVI 3675 (Deror Avi); Hermanus Surf (Soaring Heights Imagery); Malibu-Surfrider Beach-First Point (Rybkovich); Surfing contest - oahu hawaii - north shore - oct 2015 (Nesnad)
- Wikimedia Commons, CC0: Body surfing a wave (JaredMcKenzie)
- Pexels License: [people shopping at market](https://www.pexels.com/video/people-shopping-at-market-14614813/), [a person riding a motorbike in a city at night](https://www.pexels.com/video/a-person-riding-a-motorbike-in-a-city-at-night-10597765/), [aerial view of modern city skyline at dusk](https://www.pexels.com/video/aerial-view-of-modern-city-skyline-at-dusk-32905112/)

Request 2 music: "Movement Proposition", Kevin MacLeod (incompetech.com), CC BY 4.0. Clips, all Wikimedia Commons:

- CC BY 4.0: Skateboarding-Street-World-Championship-Tokyo-Japan-2023-12-17 04183-04229, 09322-09370 and 09889-09972 (RuinDig/Yuki Uchida)
- CC BY-SA 4.0: Day of the Town (2017-09-09) - Skateboarding - 0022, 0096 and 0099 (Zelio007); Personas patinando en PARCUR; Kenyan skateboarding (Drewperez1)
- CC BY 3.0: Shove it (TheContreOfficial); Hippy Flip on arms (BoarderleinTV)

## Measuring again

`measure.mjs` applies one measure to any finished film. It needs Node and ffmpeg, and the music is a free download from Incompetech.

```sh
node skills/beat-cut/scripts/beats.mjs screen-saver.mp3 --out beats
node evals/lift.mjs screen-saver.mp3
node evals/measure.mjs <film folder> --beats beats/screen-saver.json --period 0.499937 --t0 0.25 --lift 115.98

node skills/beat-cut/scripts/beats.mjs movement-proposition.mp3 --out beats
node evals/lift.mjs movement-proposition.mp3
node evals/measure.mjs <film folder> --beats beats/movement-proposition.json --period 0.476188 --t0 0.04 --lift 116.21
```

The waveform grid (`--period`, `--t0`) was made apart from the skill. The period is a constant-tempo fit to librosa's
beats: 120.015 and 126.001 BPM, where Incompetech lists 120 and 126. The phase is the strongest rise in the waveform
folded on that period. It was made for the first trial and not changed since. `lift.mjs` finds the second of the
largest rise of the level over half a second against the half second before it, after the first 20 s of the file:
115.98 and 116.21 s, which `beats.mjs` 0.2.0 reports as 115.998 and 116.222.

The other measures: picture cuts from film.html, each confirmed in the render by a jump in ffmpeg's scene score within
2 frames; shots by section from the sections of `beats.mjs`; black stretches (ffmpeg's `blackdetect`, one frame or
more) and sound levels from the render. The last row of each table is the skill's `check` run on the film, listed
apart because the skill works against it.

## Not tried

- Speech under the music, music with no clear beat (`steady` under 0.25), music whose tempo changes, and photo or page shots
- A person's own footage, other tracks, other agents or models, a request in another language
- Playing a film in Studio or listening to it: the sound rows are measured, not heard
- The cause of the black frames. Range renders of 21.7 to 22.2 s of the first film drew the frame at 21.9 s with picture;
  a full render of the same project was stopped for lack of memory before it finished
- Whether an agent acts on `check`'s black frame item: the second run of request 2 had no black frames to report
