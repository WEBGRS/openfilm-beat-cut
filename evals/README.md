# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

Two requests, each run once with the skill and once without. The cuts landed on the beat in both arms, so the skill made no clear difference there; in request 1 the arm without it had no cut off the waveform grid and the arm with it had four. The skill's gain was the music's shape: both arms with it used the lift, put a chosen shot on it and held longer shots before it, and neither arm without it reached the lift. Neither request asked for a lift. Each arm with the skill also had a flaw a person would see, listed under its request.

- Skill version: 0.1.1
- Agent: Claude Code, headless, in a project outside the home folder, so no personal rules applied
- Model: `claude-sonnet-5-5`, as `run.jsonl`'s init event reports it. The usage totals also list `claude-haiku-5-5`
- OpenFilm: 0.2.7 installed locally. Every arm read the manual through `npx -y openfilm@latest`, because the OpenFilm skill in the test project says to. Request 2 without the skill also ran `look` and `render` through `openfilm@0.3.0` by its own choice; the other three rendered with 0.2.7
- Date and OS: 2026-11-06, Windows 11
- Transcript: none supplied, neither request needed one

Both requests were written to files before the first run and not changed. Each arm ran once. No request names the skill. Request 1 says 卡点, the usual Chinese word for cutting on the beat, which also appears in the skill's description. The films were read from contact sheets and frames. None was watched in Studio or listened to.

## Request 1

```
assets 文件夹里是我这次旅行拍的素材（clip01–clip12），还有一首音乐 screen-saver.mp3。用 OpenFilm 帮我剪一条 45 秒左右的旅行卡点混剪，配这首音乐，要发朋友圈的。剪好导出成 mp4。
```

| measure | with | without |
| --- | --- | --- |
| length (asked for about 45 s) | 47.77 s | 45.00 s |
| music used, in seconds of the file | 100.72 to 148.49 | 0.78 to 45.78 |
| cuts (of those, confirmed in the render's pixels) | 35 (34) | 48 (48) |
| within 1 frame of a beat or half beat, waveform grid | 31/35 | 48/48 |
| mean and worst frames off, waveform grid | 0.48, 3.21 | 0.87, 0.94 |
| within 1 frame of a beat or half beat, `beats.mjs` | 35/35 | 8/48 |
| within 2 frames of a beat or half beat, `beats.mjs` | 35/35 | 48/48 |
| the lift (116.49 s of the music) | in the film at 15.76 s, a cut 0 frames from it | not in the film |
| shots by section of the music | quiet: 6, mean 2.63 s; loud: 29, mean 1.10 s | mid: 2, mean 2.00 s; loud: 47, mean 0.87 s |
| longest run of shots of one length | 4 | 12 |
| sound level, whole film and last 0.3 s | -20.0 dB, -44.2 dB | -17.1 dB, -37.5 dB |
| turns, minutes, cost | 38, 8.8, $0.59 | 35, 7.3, $0.55 |

Seen, with: skyline, night motorbikes and market over the quiet bars, then the cut to a surfer under a large breaking wave on the lift. It ends on a sunset sea fading to black. One black frame at 11.90 s and a very dark shot after it: the agent started clip10 at 2 s, where that file is still fading up from black.

Seen, without: a 0.5 s fade up from black, then city, motorbikes and surfing, ending on a surfer at dusk with a fade. The agent noted clip10's black stretches and avoided them. The shot lengths step 2 s, 1 s, 0.5 s in blocks; clip08 and clip10 appear 11 times each, against 7 each with the skill. The stretch of music it uses is loud after its first seconds and holds no lift: the film stops long before the track's quiet part.

## Request 2

```
Using OpenFilm, make a 30 second skate highlight reel for our crew from the clips in assets (clip01 to clip10), cut to the music in assets/movement-proposition.mp3. Export an MP4 when it's done.
```

| measure | with | without |
| --- | --- | --- |
| length (asked for 30 s) | 30.00 s | 30.01 s |
| music used, in seconds of the file | 100.97 to 130.97 | 3.87 to 33.88 |
| cuts (of those, confirmed in the render's pixels) | 22 (22) | 23 (23) |
| within 1 frame of a beat or half beat, waveform grid | 22/22 | 23/23 |
| mean and worst frames off, waveform grid | 0.57, 0.75 | 0.79, 0.90 |
| within 1 frame of a beat or half beat, `beats.mjs` | 22/22 | 0/23 |
| within 2 frames of a beat or half beat, `beats.mjs` | 22/22 | 22/23 |
| the lift (116.21 s of the music) | in the film at 15.23 s, a cut 0 frames from it | not in the film |
| shots by section of the music | quiet: 6, mean 2.54 s; loud: 17, mean 0.87 s | loud: 24, mean 1.25 s |
| longest run of shots of one length | 8 | 10 |
| sound level, whole film and last 0.3 s | -15.2 dB, -30.4 dB | -13.0 dB, -24.1 dB |
| turns, minutes, cost | 33, 6.4, $0.45 | 33, 8.7, $0.41 |

Seen, with: a wide of the bowl, longer trick shots over the quiet bars, then the jump over two seated skaters (clip09) on the lift, a burst of one-beat shots, and arms-up shots at the end with the music faded. clip02, clip06 and clip10 keep the black side bars that are in those files, while the agent's report says they were cropped to fill the frame.

Seen, without: tricks from all ten clips, mostly in 1.43 s shots, with the side bars zoomed away and a slow push-in on every shot through CSS. Its look at the side-barred clips is better than the arm with the skill. It ends on the same jump, as a finisher, and the music stops there with no fade: -26 dB in the last 0.1 s, against -45 dB with the skill. Its report gives the tempo as about 83 BPM; Incompetech lists 126. Its shots still fall on the grid because 1.43 s is three beats at 126. `look` under 0.2.7 refuses this film's moving CSS, so its sheet is the one the agent made with 0.3.0, plus frames taken from its MP4.

## What the numbers do and do not show

A cut lands within 1 frame of a half-beat grid at these tempos by chance 27 to 28% of the time. Both arms beat that by far on both requests.

The without films were cut on an even grid that sits 0.8 to 0.9 frames from the waveform grid and 1.2 to 1.4 frames from the slightly earlier beats of `beats.mjs`, so the 1-frame line falls between the two: 8/48 and 0/23 on one, full marks on the other. Read those with the 2-frame row: these films are on the beat, and the low `beats.mjs` scores do not count against them. On a click track of known times `beats.mjs` reads 12 ms early and librosa 19 ms late.

The 4 off-grid cuts of request 1 with the skill are all in the music's quiet part (108.6 to 114.5 s), where `beats.mjs` places beats up to 3.2 frames from a steady 120 BPM pulse. `beats.mjs check` reports these as 0 frames off, since it compares with those same beats. The agent's report calls this drift in the music, and the track's listed tempo and waveform do not support that.

## The material

Same files in both arms, not in this repository. All clips were converted beforehand to 1080p H.264 at 30 fps with their own sound, under neutral names in shuffled order.

Both tracks were picked before any run from 12 Incompetech tracks measured with `beats.mjs`, because they have a quiet part and a lift. A track without one would give the skill less to do, so these results lean toward what it does best.

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
node evals/measure.mjs <film folder> --beats beats/screen-saver.json --period 0.499937 --t0 0.25

node skills/beat-cut/scripts/beats.mjs movement-proposition.mp3 --out beats
node evals/measure.mjs <film folder> --beats beats/movement-proposition.json --period 0.476188 --t0 0.04
```

The waveform grid (`--period`, `--t0`) was made apart from the skill. The period is a constant-tempo fit to librosa's beats: 120.015 and 126.001 BPM, where Incompetech lists 120 and 126. The phase is the strongest rise in the waveform folded on that period. The phase first came from librosa, corrected by its click-track offset. It was moved to the waveform after the first film (request 1 without) had been measured, and not changed after that. On the first phase request 1 scores 28/35 with the skill and 48/48 without, so the move favoured the arm with the skill by three cuts and did not change the reading.

The other measures: picture cuts from film.html, each confirmed in the render by a jump in ffmpeg's scene score within 2 frames; the lift from the `liftBeat` of `beats.mjs`. On request 2, 116.21 s matches the largest rise of RMS energy found with librosa (116.23 s). On request 1 that largest rise is the track's opening at 4.14 s, and the rise at 116.49 s is visible in the waveform on the film's sheet; shots by section from the sections of `beats.mjs`; sound levels from the render.

## On OpenFilm 0.3.0

After the trials, a copy of a finished trial project was run on the released OpenFilm 0.3.0 (Windows 11, 2026-11-06), without an agent and not in Studio.

`look` passed and a 4 s `render` came out.
