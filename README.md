# beat-cut

An [OpenFilm](https://github.com/openfilm/openfilm) skill: a film cut to its music. Every change of picture lands on
a beat, scene changes land on the first beat of a bar, the strongest shot sits where the music lifts, and shots run
longer in the quiet parts than in the loud ones.

| | | |
| --- | --- | --- |
| <img src="skills/beat-cut/cover.jpg" width="200" alt=""> | [Cut on the beat](skills/beat-cut) | A film cut to its music: every change on a beat, scene changes on the bars, the best shot where the music lifts. |

An agent can't hear. It can read numbers, so the skill's one script measures the music and the film's cuts:

```sh
node skills/beat-cut/scripts/beats.mjs <music>            # beats/<name>.json and beats/<name>.html
node skills/beat-cut/scripts/beats.mjs snap beats/<name>.json 12.4 30.1 --to bar
node skills/beat-cut/scripts/beats.mjs check               # in the film's folder: every cut, in frames from a beat
```

The measure (`openfilm-beats/1`) has the tempo, every beat, the first beat of each bar, the hits that stand out from
the onsets around them, each bar's level, quiet / mid / loud sections, and the bar where the music rises most. The
page draws all of it over the waveform with a player. `check` reads film.html, finds the music (the clip named with
`--music`, else the longest sound with no `.vtt` beside it, so a voice-over is never taken for the music), follows its
`at`, `#t=` and `speed`, and lists every picture cut with how many frames it is from the nearest beat; `--strict`
exits 1 while one is more than a frame off.

How it measures: the sound at 22.05 kHz, 40 pitch-spaced bands, onset strength from the rise in each band; the tempo
from the onset strength's autocorrelation, weighted toward 120 BPM; the beats by dynamic programming (Ellis 2007);
the bar's first beat from the kick and bass, the change of harmony bar to bar, and the beat's accent. Node and ffmpeg
only, no packages. A seven-minute track takes about 7 s on a laptop.

How well, measured with `tools/`:

- **Tempo against a library's listed BPM**: 9 of 10 Incompetech tracks within 1 BPM. The tenth (Realizer, 125) reads
  at half, 62.4; the run says "it may also be 124.8 BPM" and `--bpm 124.8` measures 125.3.
- **Beats and bars against a score**: 14 renders from XSXB-Band, whose MIDI gives the true grid. The 11 with a clear
  beat: tempo right in all 11, beats F-measure 0.86 to 1.00, bars 0.82 to 1.00 (70 ms tolerance). The 3 ambient beds
  (60 and 72 BPM) fail; all three report `steady` under 0.25, which the run and the brief treat as "little beat: cut
  on the hits and phrases".
- **Synthetic drift**: tempo ramps (100 to 112, 90 to 80 BPM) and 12 to 15 ms of played looseness: beats F 0.99 to 1.00.

When the bars are a guess (the run says so), `--bar <a second that starts a bar>` sets them; `--bpm` sets the tempo.

What the brief asks of the agent:

- measure the music before the first cut; every cut on a beat, half beat or hit within a frame, or in a pause of
  speech, and the cuts left off the beat named;
- the music's shape as the film's: longer shots when quiet, shorter when loud, scene changes on bars, the strongest
  shot on the lift, nothing new in the last bar;
- a pace a viewer can follow: one beat at the fastest for a picture, two or more for words or a face;
- music that suits the film, starting on a beat or bar and ending on a bar or its own end, low under speech;
- footage trimmed, never re-encoded or sped up to fit a beat.

## Use it

- **In OpenFilm**: open Skills, add one from a link, and paste `https://github.com/WEBGRS/openfilm-beat-cut`.
- **In your own agent** (Claude Code, Codex and others): `npx skills add WEBGRS/openfilm-beat-cut`.

It needs Node 22 or later and ffmpeg on the PATH (OpenFilm needs ffmpeg too). It pairs with
[footage-cut](https://github.com/WEBGRS/openfilm-footage-cut), which logs a folder of clips shot by shot.

## Develop

```sh
npm test            # synthetic music with a known grid, film.html parsing, check (a few seconds)
npm run check       # the skill folder against OpenFilm's skill rules
node tools/oracle-xsxb.mjs [XSXB-Band exports folder]
node tools/oracle-tempo.mjs <music folder> <incompetech pieces.json>
node tools/drift.mjs
```

## 中文说明

OpenFilm 技能：跟着音乐剪片。每次换画面都踩在拍子上，换场景落在小节第一拍，最好的镜头放在音乐起来的地方，安静的段落镜头长、热闹的段落镜头短。

智能体听不见，但能读数字，所以这个技能唯一的脚本把音乐和片子的剪辑点都变成数字：`beats.mjs <音乐>` 测出速度、每一拍、每小节第一拍、比周围更突出的重音、每小节的响度、安静/中等/热闹的段落和音乐上扬最多的那一小节，写成 `beats/<名字>.json` 和一张能播放的波形页；`snap` 把秒数吸附到最近的拍、半拍、小节或重音；`check` 读 film.html，找到音乐（`--music` 指定的那段，否则是旁边没有 `.vtt` 的最长一段声音，所以不会把配音当成音乐），按它的 `at`、`#t=`、`speed` 换算，逐个列出画面剪辑点离最近的拍子差几帧，`--strict` 在有超过一帧的点时返回 1。只用 Node 和 ffmpeg，七分钟的曲子约 7 秒。

准确度（`tools/` 里的脚本可复现）：Incompetech 10 首对照官网标注的 BPM，9 首误差在 1 BPM 内，第 10 首（Realizer，125）测成一半 62.4，脚本会提示「也可能是 124.8」，加 `--bpm 124.8` 后测得 125.3。XSXB-Band 渲染的 14 首（MIDI 给出真实节拍）里，节拍清楚的 11 首速度全对，节拍 F 值 0.86–1.00，小节 0.82–1.00；3 首氛围铺底失败，它们的 `steady` 都低于 0.25，脚本和需求书都会按「节拍不明显，按重音和乐句剪」处理。小节第一拍拿不准时脚本会说，可以用 `--bar <某个小节开头的秒数>` 指定。

**安装**：在 OpenFilm 的技能页点「添加 skill」，粘贴 `https://github.com/WEBGRS/openfilm-beat-cut`；用自己的智能体就运行 `npx skills add WEBGRS/openfilm-beat-cut`。需要 Node 22 以上和 PATH 里的 ffmpeg。和 [footage-cut](https://github.com/WEBGRS/openfilm-footage-cut)（把一堆素材按镜头列清楚）配合使用。
