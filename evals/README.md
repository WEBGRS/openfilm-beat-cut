# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

Three requests on three 卡点 tracks, each run once without the skill, once with 0.2.2 and once with 0.3.0, on
OpenFilm 0.3.0. With 0.3.0 the drop of every film changes or hits the picture on 79 to 86% of the music's beats
(frame jumps in the render), against 59 to 77% with 0.2.2 and 7 to 65% without the skill, and each film has a flash
and a zoom on the second the music drops, a calmer build before it and a rush of short shots into it. The arm without
the skill also put a zoom on every cut in all three films and, on request 2, a white flare over the drop, so the
impact on a cut is not the skill's alone; what 0.3.0 adds is the punch on the beats between cuts, the flash on the
drop and the phrases, the build and the rush, and cuts on the kick. On request 2 the film without the skill reads as
a 卡点 edit too, and the difference there is smaller than the numbers suggest. Nobody has watched these films in
Studio or listened to them.

- Skill versions: 0.2.2 (the tag before this one) and 0.3.0 (this tag). The arm without the skill is shared by both
- Agent: Claude Code, headless, in a project outside the home folder, so no personal rules applied
- Model: `claude-sonnet-5-5`, as `run.jsonl`'s init event reports it in every run
- OpenFilm: 0.3.0
- Date and OS: 2026-11-07, Windows 11
- Transcripts: none supplied. The clips carry their own ambient sound and no request asks for speech
- The skill folder: each arm with the skill was given the committed folder. All six runs loaded it with the Skill
  tool and ran `beats.mjs`; the three 0.3.0 runs ran `plan`, and their films carry the `punch` style block
- The films were read from contact sheets at 15 frames a second around the drop and from frames. None was watched

The requests were written to files before the first run and not changed. Each ran once in each arm; no run was
repeated. They do not name the skill. They say 卡点, the usual Chinese word for a beat-synced edit, which is also in
the skill's description. Below, the song's file name is shown as `<song>.mp3`: the songs are copyrighted and not
named by file here.

## Why 0.3.0

The owner watched the 0.2.x trials (two calm Kevin MacLeod tracks) and could not tell they were cut to the music,
though every cut in both arms was within a frame of a beat. The 0.2.2 runs below show why: on the drop the picture
held a shot for 1.0 to 1.9 s with nothing happening on the hits, and the skill's brief said a cut on every beat only
"in a short burst". 0.3.0 adds `plan`, `punch` and the drop's share of marked beats in `check` (see the changelog).

## Request 1: phonk, skate clips

```
assets 里是我们滑板队拍的素材（clip01–clip10），还有一首 <song>.mp3。用 OpenFilm 给我剪一条 30 秒的卡点视频发抖音，要有那种踩点的感觉，鼓点一下一下都要卡上。剪好导出 mp4。
```

| measure | with 0.3.0 | with 0.2.2 | without |
| --- | --- | --- | --- |
| length, music used (seconds of the file) | 30.0 s, 8.0 to 38.0 | 30.0 s, 8.0 to 38.0 | 30.0 s, 17.0 to 47.0 |
| the drop (16.0 s of the music) in the film | at 8.0 s | at 8.0 s | 1 s before the film starts |
| drop: picture events a second | 1.86 | 1.95 | 1.07 |
| drop: beats with a picture event within 2.5 frames | 38/44 (0.86) | 34/44 (0.77) | 29/56 (0.52) |
| drop: strong onsets with a picture event | 21/48 | 18/47 | 13/60 |
| before the drop: picture events a second | 0.75 | 1.25 | no build |
| mean frames from a picture event to the nearest onset | 0.69 | 0.71 | 0.98 |
| minutes, turns, cost | 7.9, 33, $0.44 | 9.6, 50, $0.88 | 8.3, 26, $0.39 |
| the skill's 0.3.0 `check` | 40 cuts on the grid; drop beats marked 40/40 (33 cuts, 7 punches) | 38 on the grid; 31/40, cuts only | 35 of 36 on the grid; 34/56, its own zooms not counted |

Seen, with 0.3.0: long shots with a slow push over the first 7 s, cuts at 7.0, 7.5 and 7.8 s, then at 8.0 s a bright,
zoomed frame of the jump over two seated skaters settling within a few frames, and cuts on each beat after it. The
frame at 16.0 s is brightened again (the next phrase). One dark rail clip comes back several times in the drop.
With 0.2.2: a dark rail shot over 6 to 8 s, a cut at 8.0 s to a bright ramp, no change in scale or brightness at the
drop. Without: no build; 1 s and 0.5 s shots each starting with a zoom from its own CSS, a dark camera-flip shot at
7.5 s, and one rail shot held over 9 to 10 s.

## Request 2: EDM, surf and travel clips

```
assets 文件夹里是我这次旅行拍的素材（clip01–clip12），配乐用 <song>.mp3。用 OpenFilm 帮我剪一条 30 秒左右的旅行卡点视频发抖音，前面铺垫一下，高潮那里要炸，画面跟着鼓点走。导出 mp4。
```

| measure | with 0.3.0 | with 0.2.2 | without |
| --- | --- | --- | --- |
| length, music used, frame | 30.0 s, 8.5 to 38.5, 1080x1920 | 30.0 s, 1.0 to 31.0, 1920x1080 | 30.0 s, 4.76 to 34.76, 1920x1080 |
| the drop (16.0 s of the music) in the film | at 7.5 s | at 15.0 s | at 11.24 s |
| drop: picture events a second | 1.83 | 1.40 | 1.53 |
| drop: beats with a picture event | 39/48 (0.81) | 19/32 (0.59) | 26/40 (0.65) |
| drop: strong onsets with a picture event | 15/31 | 5/19 | 9/28 |
| before the drop: picture events a second | 1.00 | 0.60 | 0.64 |
| mean frames from a picture event to the nearest onset | 1.24 | 0.88 | 1.18 |
| minutes, turns, cost | 12.2, 32, $0.49 | 8.9, 30, $0.43 | 14.4, 45, $0.76 |
| the skill's 0.3.0 `check` | 43 cuts on the grid; 44/44 (36 cuts, 8 punches) | 26 on the grid; 18/28 | 32 of 34 on the grid; 25/33 |

Seen, with 0.3.0: the agent made the film vertical for Douyin and cropped each shot. Coast and city shots before the
drop, cuts at 6.6, 7.07 and 7.27 s, a brightened and zoomed surfer at 7.5 s, then a cut on nearly every beat. With
0.2.2: eight bars of build, the drop at 15.0 s on a surfer shot held 1.9 s with no change in it. Without: a white flare
that blooms from 11.0 s, is brightest about the drop and is gone by 11.5 s, then cuts about every beat with a zoom on
each. This is the request where the arm without the skill comes closest.

## Request 3: Chinese disco, skate clips

```
用 assets 里的滑板素材 clip01–clip10 和 <song>.mp3（野狼disco）剪一条 25 秒左右的卡点短视频，发 B 站和抖音，要节奏感强、看着很爽的那种。用 OpenFilm 做，导出 mp4。
```

| measure | with 0.3.0 | with 0.2.2 | without |
| --- | --- | --- | --- |
| length, music used | 24.5 s, 6.2 to 30.7 | 24.5 s, 6.2 to 30.7 | 26.9 s, 18.1 to 45.0 |
| the drop (16.0 s of the music) in the film | at 9.81 s | at 9.81 s | 2.2 s before the film starts |
| drop: picture events a second | 1.93 | 1.40 | 1.33 |
| drop: beats with a picture event | 19/24 (0.79) | 17/24 (0.71) | 3/44 (0.07) |
| drop: strong onsets with a picture event | 11/29 | 9/30 | 13/41 |
| before the drop: picture events a second | 0.60 | 1.00 | no build |
| mean frames from a picture event to the nearest onset | 0.74 | 0.65 | 1.33 |
| minutes, turns, cost | 13.1, 38, $0.53 | 14.3, 43, $0.70 | 8.9, 27, $0.35 |
| the skill's 0.3.0 `check` | 23 on a beat, 1 on a half beat; 20/20 (17 cuts, 3 punches) | 24 on the grid; 12/16 | 0 on a beat, 17 on a half beat, 11 off; 0/40 |

Seen, with 0.3.0: three long shots with a slow push, cuts at 9.27 and 9.53 s, then at 9.87 s a brightened, zoomed
frame of the jump over two seated skaters; the two-beat shot from 11.07 s is larger at 11.67 s (a punch on the beat
inside it). With 0.2.2: the same jump at 9.83 s held 1.2 s with no change. Without: shots of two beats and one beat,
each starting with a zoom (one variant with a slight rotation), music from after the drop. Its cuts follow librosa's
beats, which in this song and in request 1's sit half a beat from the kick (see below), so they fall between kicks.

## The measures

`feel.py` is one measure applied to every render, whichever arm made it. Picture events are frame jumps in the
render (the mean change of a 64x36 grey frame at least 10 levels and three times the local median): cuts, punches,
flashes and shakes all count, slow pushes do not. The song's beats from `beats.mjs` are moved to where the film plays
the song by cross-correlating onset strength (the offsets found match each film's `#t=` in point), and the drop is
the film from the song's lift on. A beat counts as marked with a picture event within 2.5 frames. Strong onsets are
librosa onsets above the 60th percentile of strength, at least 0.2 s apart.

The beat grid is the skill's own, so it could favour the arm with the skill. It was checked apart from the skill:
in all three songs the rise in energy under 120 Hz is larger on the grid's beats than on its half beats (10.7 against
6.7, 107 against 33, 73 against 47), so the beats are on the kick. librosa's beat tracker puts its beats 0.27 and
0.22 s off them in the disco and phonk songs (about half a beat), and 0.01 s in the EDM song.

The `check` row is the skill's own measure, listed apart. It counts as punches only what `punch` wrote
(`data-beat-fx`), so the zooms the arm without the skill wrote in its own CSS are not in it; `feel.py` sees them.

## Earlier trials, 0.2.x

On two calm Kevin MacLeod tracks (Screen Saver, Movement Proposition; CC BY 4.0) with surf and skate clips, 0.2.0 to
0.2.2 put every cut within 1.1 frames of a beat in both arms, used the quiet part and the lift where the arm without
the skill used a loud stretch, and found that the black frames of one request came from holes of 0.3 to 5 ms between
clips (fixed in 0.2.2). Those films are what the owner could not tell from a clock cut. The requests and numbers are
in this file's history at tag v0.2.2.

## The material

Same files in both arms, not in this repository.

Music, private test material, not redistributed: "Murder In My Mind" by Kordhell (request 1), "The Spectre" by Alan
Walker (request 2), "野狼Disco" by 宝石Gem (request 3). Each was cut to 48 to 54 s around its drop, with a short fade
at the ends.

Clips (all converted to 1080p H.264 at 30 fps with their own sound, neutral names, shuffled):

- Requests 1 and 3, Wikimedia Commons: Skateboarding-Street-World-Championship-Tokyo-Japan-2023-12-17 04183-04229,
  09322-09370 and 09889-09972 (RuinDig/Yuki Uchida, CC BY 4.0); Day of the Town (2017-09-09) - Skateboarding - 0022,
  0096 and 0099 (Zelio007, CC BY-SA 4.0); Personas patinando en PARCUR (CC BY-SA 4.0); Kenyan skateboarding
  (Drewperez1, CC BY-SA 4.0); Shove it (TheContreOfficial, CC BY 3.0); Hippy Flip on arms (BoarderleinTV, CC BY 3.0)
- Request 2, Wikimedia Commons, CC BY-SA 4.0: Surfing-1012624 and Surfing-1012628, Dingle Peninsula, and Wind
  Surfing-1025737 (Maoileann); Kite surfing at Viganj 163559 1 (Quahadi); Surfing in Tel Aviv MVI 3675 (Deror Avi);
  Hermanus Surf (Soaring Heights Imagery); Malibu-Surfrider Beach-First Point (Rybkovich); Surfing contest - oahu
  hawaii - north shore - oct 2015 (Nesnad). CC0: Body surfing a wave (JaredMcKenzie). Pexels License: people shopping
  at market, a person riding a motorbike in a city at night, aerial view of modern city skyline at dusk

## Measuring again

```sh
node skills/beat-cut/scripts/beats.mjs <song>.mp3 --out beats
python -I evals/feel.py <film>.mp4 --song <song>.mp3 --beats beats/<song>.json --json feel.json
node skills/beat-cut/scripts/beats.mjs check <film folder>/film.html --out beats-check
```

`feel.py` needs ffmpeg, numpy, scipy and librosa. `measure.mjs` and `lift.mjs` are the measures of the 0.2.x trials.

## Not tried

- Watching or hearing any film: whether the flash and the punches feel right, or too much, is not known
- Music with no clear drop, speech under the music, photos or pages as shots, a person's own footage
- Other agents or models, a request in English
- Whether `punch` suits a calm request (a slow travel film): the brief says to skip it when the person does not want
  effects, and no run asked for that
- A second run of any request, so nothing here says how much a run varies
