# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

Nine songs from a Bilibili 卡点 mix, each cut to its climax with about a bar before the drop, each run once without
the skill and once with 0.3.0; the three where 0.3.0 measured the music wrong ran again with 0.4.0. With the skill (0.3.0
on six songs, 0.4.0 on the three it reran) the drop of the film has a picture event on 72 to 94% of the music's beats
(frame jumps in the render, against the skill's kick-led beat grid); without it, 2 to 29% on seven songs, and 81 and
87% on songs 1 and 7, where the arm without the skill matched it. Much of
the gap without the skill is phase: on songs 2, 5, 6 and 8 most of those cuts sit on half beats of the kick grid. 0.3.0 broke on three songs: it read the Umbrella remix
at half tempo, put the beats of "call me now" between the kicks (27 of 27 cuts on half beats), and found the drop of
"Repeat" 17 s late, so that film opened with 12 s of slow pushes over the full climax. 0.4.0 fixes the first two and
the late drop; on "Repeat" an independent kick measure still says its beats may be half a beat off. The owner watched
and listened to the films of all nine songs, both arms, in OpenFilm Studio and accepted the skill.

- Skill versions: 0.3.0 (the tag before this one) for the ten runs with the skill (song 4 twice), 0.4.0 (this tag) for three reruns
- Agent: Claude Code, headless, in a project outside the home folder, so no personal rules applied
- Model: `claude-sonnet-5-5`, as `run.jsonl`'s init event reports it in every run
- OpenFilm: 0.3.0
- Date and OS: 2026-11-07 and 2026-11-08, Windows 11
- Transcripts: none supplied; no request asks for speech
- The skill folder: each arm with the skill was given the committed folder; every run with the skill loaded it with
  the Skill tool and ran `beats.mjs`
- The films were read from contact sheets at 15 frames a second from 1.5 s before the drop, and from frames; the
  owner then played both arms of every song in Studio

The requests were written to files before the first run and not changed. They ask for a 卡点 or 踩点 video for 抖音,
朋友圈 or B站, 20 to 30 s, in natural Chinese, and do not name the skill. Each song ran once in each arm. One run with
0.3.0 (song 4) could not render because the disk was full; it was run again once disk space was freed, and both rows
are kept. The 0.4.0 reruns are the one extra run per request the rules allow after a defect a run exposed. Song file
names are replaced by `<song>.mp3` below: the songs are copyrighted and not named by file here.

## The songs and the requests

Private test material, not redistributed: the audio of the Bilibili mix 【节奏感の小曲】 (BV1sELRzXEUT, nine songs),
split at its chapters. Each excerpt is 32 s from about a bar before the drop, found from the level, the bass and the
onset density, with a short fade at the ends. Mashups and remixes are as they are in the mix.

| # | song (as the mix names it) | excerpt, seconds of the mix | footage |
| --- | --- | --- | --- |
| 1 | Gimme More x step on up | 135.4 to 167.4 | skate |
| 2 | Breathin | 391.4 to 423.4 | surf and travel |
| 3 | Do Better & Neon Rainbow | 517.1 to 549.1 | skate |
| 4 | Umbrella (remix) | 864.4 to 896.4 | surf and travel |
| 5 | call me now | 1029.8 to 1061.8 | skate |
| 6 | Edge Of My Life | 1254.6 to 1286.6 | surf and travel |
| 7 | Dead Inside | 1374.0 to 1406.0 | skate |
| 8 | Repeat | 1481.3 to 1513.3 | surf and travel |
| 9 | Move Your Body (Razihel remix) | 1708.4 to 1740.4 | skate |

The footage is the two sets of the earlier trials (Wikimedia Commons and Pexels, licences listed at tag v0.3.0).

```
1  assets 里是我们滑板队的素材 clip01–clip10，配乐用 <song>.mp3。用 OpenFilm 剪一条 25 秒左右的卡点视频发抖音，一开头就要踩上鼓点，越看越燃。导出 mp4。
2  用 assets 里的旅行素材（clip01–clip12）和 <song>.mp3 帮我剪个 25 秒的卡点小视频发朋友圈，画面跟着节奏切，要有踩点的感觉。用 OpenFilm 做，导出 mp4。
3  assets 有 10 段滑板视频和一首 <song>.mp3，帮我用 OpenFilm 剪一条 30 秒的踩点混剪，鼓点重的地方画面要跟着砸下去。剪完导出 mp4。
4  这次旅行拍的素材在 assets（clip01–clip12），音乐是 <song>.mp3。用 OpenFilm 给我剪一条抖音卡点视频，25 秒左右，节奏要卡准，看着带劲。导出 mp4。
5  用 OpenFilm 把 assets 里的滑板片段 clip01–clip10 剪成一条 20 秒的卡点短视频，配 <song>.mp3，发抖音用，每一下都要踩在点上。导出 mp4。
6  assets 文件夹：旅行素材 clip01–clip12 + <song>.mp3。帮我用 OpenFilm 剪一条 30 秒左右的卡点视频发朋友圈，高潮那段要燃，画面跟着鼓点走。导出 mp4。
7  滑板素材在 assets（clip01–clip10），歌是 <song>.mp3。用 OpenFilm 剪个 25 秒的卡点视频发抖音，要那种一拍一个画面、特别带感的。导出 mp4。
8  用 assets 里的 clip01–clip12（旅行拍的）配 <song>.mp3，帮我用 OpenFilm 剪条 25 秒左右的踩点视频发抖音，节奏感要强。剪好导出 mp4。
9  assets 里是滑板素材 clip01–clip10 和一首 <song>.mp3。用 OpenFilm 帮我剪一条 30 秒的卡点视频，发 B 站和抖音，鼓点和画面要对上。导出 mp4。
```

## Results

Drop beats: the music's beats from the drop on with a picture event within 2.5 frames (`feel.py`). Cuts: each cut
against the 0.4.0 beat grid, within a frame (beat, half beat, or neither). Music from: the excerpt second the film
starts at; the drop is at about 2 s of each excerpt.

| # | arm | drop beats with a picture event | cuts on a beat / half beat / neither | music from | minutes, cost |
| --- | --- | --- | --- | --- | --- |
| 1 | with 0.3.0 | 41/47 (87%) | 36 / 0 / 0 | 2.222 s | 11, $0.76 |
| 1 | without | 39/48 (81%) | 38 / 6 / 0 | 2.203 s | 14.4, $0.77 |
| 2 | with 0.3.0 | 43/48 (90%) | 39 / 1 / 0 | 0.221 s | 7.3, $0.37 |
| 2 | without | 1/50 (2%) | 0 / 25 / 8 | 6.87 s | 7.3, $0.38 |
| 3 | with 0.3.0 | 34/40 (85%) | 30 / 0 / 0 | 0.013 s | 7.4, $0.43 |
| 3 | without | 3/39 (8%) | 0 / 1 / 18 | 0.0 s | 10.9, $0.67 |
| 4 | with 0.3.0 | no render (disk full) | 0 / 0 / 26 | 5.923 s | 6.3, $0.47 |
| 4 | with 0.3.0, run again | 0/51 (0%) | 0 / 0 / 28 | 5.923 s | 37.5, $0.50 |
| 4 | without | 14/48 (29%) | 0 / 0 / 26 | 0.0 s | 14.4, $0.50 |
| 4 | with 0.4.0 | 49/53 (92%) | 40 / 0 / 0 | 0.636 s | 16.8, $0.49 |
| 5 | with 0.3.0 | 5/40 (12%) | 0 / 27 / 0 | 1.873 s | 10.9, $0.49 |
| 5 | without | 4/40 (10%) | 0 / 15 / 6 | 2.88 s | 8.2, $0.49 |
| 5 | with 0.4.0 | 26/36 (72%) | 29 / 1 / 0 | 0.152 s | 8.5, $0.38 |
| 6 | with 0.3.0 | 45/48 (94%) | 35 / 0 / 0 | 0.49 s | 11.2, $0.53 |
| 6 | without | 8/50 (16%) | 4 / 27 / 19 | 0.0 s | 50, $1.00 |
| 7 | with 0.3.0 | 42/51 (82%) | 39 / 0 / 0 | 2.116 s | 9.8, $0.41 |
| 7 | without | 45/52 (87%) | 52 / 0 / 0 | 2.141 s | 21.3, $0.51 |
| 8 | with 0.3.0 | 28/54 (52%) | 23 / 1 / 0 | 6.054 s | 20.3, $0.32 |
| 8 | without | 2/48 (4%) | 0 / 26 / 0 | 0.0 s | 19, $0.45 |
| 8 | with 0.4.0 | 40/47 (85%) | 37 / 2 / 0 | 0.429 s | 7.4, $0.36 |
| 9 | with 0.3.0 | 53/60 (88%) | 43 / 0 / 1 | 0.075 s | 13.6, $0.56 |
| 9 | without | 14/60 (23%) | 2 / 6 / 25 | 0.58 s | 23.8, $0.61 |

## What 0.3.0 got wrong, and 0.4.0

- **Umbrella (remix), half tempo.** 0.3.0 measured 62 BPM, the double scoring 0.49 against 0.59, and found no lift.
  The agent with 0.3.0 set 124 BPM itself, but the tracker's beats at that tempo sat between the kicks, it chose a
  "lift" 13.7 s in, and its film starts 5.9 s into the excerpt, past the drop: no beat of the drop has a picture event
  on the kick grid. 0.4.0 takes the double under 80 BPM when it scores 0.6 as much, tracks at the slow pulse (which
  follows the kick) and puts the beats between in; its film flashes on the drop at 1.5 s and cuts on 49 of 53 beats.
  These beats come from the tracker (57% of stretches on one line), so they wander by up to about 1.5 frames.
- **call me now, beats on the off beat.** 0.3.0's straight line followed the off beat: the kick-band attack was 23 on
  its beats against 109 on its half beats, the drop fell on its half beat, and all 27 cuts of the 0.3.0 film are half
  beats on the kick grid. 0.4.0 moves a line half a beat when its drop falls on a half beat and the kick there is at
  least 0.8 of the kick on the beats; its film has 29 of 30 cuts on the beat.
- **Repeat, the drop 17 s late.** The excerpt's drop is the bass coming in at 2 s while the whole barely gets louder;
  0.3.0 took a later step at 18.9 s, and the film started 4 bars before that, at 6.05 s, with 12 s of long shots over a
  climax already in full. 0.4.0 finds the drop from the level plus half the bass level, with three beats of history,
  and prefers a drop in the first two bars over a bigger one later when it rises half as much and holds two bars; its
  film starts at 0.43 s and has a picture event on 40 of 47 drop beats.
- Smaller: `plan` now starts a film a single bar before the lift when that is all the music has (0.3.0 began songs
  1 and 7 on the drop with no rush), and `check` no longer asks for whole phrases then.

Not fixed: on "Repeat" two kick measures disagree. The skill's (rise in the bands under 160 Hz) favours its beats, 78
against 58; a separate one (rise of the magnitude under 120 Hz, `phase.py` style) favours the half beats, 35 against 92.
The 0.4.0 film of song 8 follows the skill's beats; the film without the skill put all 26 of its cuts on the
half beats, which the separate measure calls the kick. Which is right needs ears. On "Do Better & Neon Rainbow" (steady 0.18, a trap beat), the
attacks fold at 0.18 and 0.68 of the skill's beat, so its beats may sit about 120 ms before the hits; the films of
both arms on that song were not judged on phase.

## The measures

`feel.py`, the same on every render. Picture events are frame jumps (the mean change of a 64x36 grey frame at least
10 levels and three times the local median): cuts, punches, flashes and shakes count, slow pushes do not. The song's
beats from `beats.mjs` 0.4.0 are moved to where the film plays the excerpt by cross-correlating onset strength, and
the drop is the film from the measured lift on. The beat grid is the skill's own; it was checked apart from the skill
by the kick-band rise on its beats against its half beats, which favours the beats in eight songs (84.7 against 21.4
for Breathin, 107.8 against 23.4 for call me now) and the half beats on Repeat (above).

The cuts column is the skill's `check` 0.4.0 run on each film, listed apart as the skill's own measure.

```sh
node skills/beat-cut/scripts/beats.mjs <song>.mp3 --out beats
python -I evals/feel.py <film>.mp4 --song <song>.mp3 --beats beats/<song>.json --json feel.json
node skills/beat-cut/scripts/beats.mjs check <film folder>/film.html --out beats-check
```

## Earlier trials

0.3.0 was tried on three whole 卡点 tracks (phonk, EDM, a Chinese disco song) against 0.2.2 and no skill, and 0.2.x on
two calm Kevin MacLeod tracks; those requests and numbers are in this file at tags v0.3.0 and v0.2.2.

## Not tried

- Watching or hearing any film; whether the flashes and punches feel right is not known
- Music with tempo changes inside an excerpt, swung hi-hats judged by ear, vocal-chop drops
- A second run of any request, other agents or models, a request in English
