# beat-cut

An [OpenFilm](https://github.com/openfilm/openfilm) skill: a film that hits with its music, the way a 卡点 edit does.
Calm shots before the drop, a rush into it, a flash on it, then a cut or a zoom punch on nearly every beat and a shake
on the big hits. Every cut lands on a beat.

On the climaxes of nine songs from a Bilibili 卡点 mix (OpenFilm 0.3.0), the films made with the skill had a picture
event on 72 to 94% of the drop's beats; without it, 2 to 29% on seven songs and about the same as the skill on two.
0.3.0 measured three of the nine wrong (half tempo, beats on the off beat, a drop found 17 s late); 0.4.0 fixes those,
and on one song two kick measures still disagree on where the beat is. Nobody has watched the films; the numbers and
frames are in [evals](evals/README.md).

| | | |
| --- | --- | --- |
| <img src="skills/beat-cut/cover.jpg" width="200" alt=""> | [Cut on the beat](skills/beat-cut) | A film that hits with its music: calm shots before the drop, a flash on it, then a cut or a zoom punch on nearly every beat. |

An agent can't hear. It can read numbers, so the skill's one script measures the music and the film's cuts:

```sh
node skills/beat-cut/scripts/beats.mjs <music>            # beats/<name>.json and beats/<name>.html
node skills/beat-cut/scripts/beats.mjs plan beats/<name>.json --length 30   # the stretch of music and the shots
node skills/beat-cut/scripts/beats.mjs punch film.html     # zoom punches, flashes, shakes as CSS on the clips
node skills/beat-cut/scripts/beats.mjs snap beats/<name>.json 12.4 30.1 --to bar
node skills/beat-cut/scripts/beats.mjs check               # in the film's folder: every cut, the shape, the drop, TO DO
```

`plan` starts the film 4 bars before the lift (2 when 4 would be over half the film) and ends it on a bar line. Before
the lift a shot lasts a bar, the bar into it rushes (2, 1, ½, ½ beats), after it a phrase's first bar has a shot a beat
and the other bars 1, 1, 2 beats, and the last bar is one shot. `punch` reads film.html and the music, and on each
clip of the main picture track writes a CSS animation on the clip's own time (OpenFilm 0.3.0 keyframes: `scale`,
`translate`, `filter`) and a `data-beat-fx` that `check` reads: a slow push before the lift, a flash on the lift and
each phrase after it, a zoom punch on every beat in the drop, a shake on strong half-beat accents, one hit on a last
shot of a bar or more. It keeps a clip's own animation and filter and replaces what it wrote before. `check` counts
the drop's beats that a cut or a punch marks (75% wanted) and the strong accents among them.

The measure (`openfilm-beats/1`) has the tempo, every beat, the first beat of each bar, the hits that stand out from
the onsets around them, each bar's level, quiet / mid / loud sections (the fewest stretches, two bars or more, that
fit the bars' levels, each named by its mean, so bars that swing between quiet and mid stay one stretch) and the
second the music lifts. The run prints the sections, whether the beats are one straight line, and where the bars
come from. The page draws the beats, bars, hits and the quiet and loud sections over the waveform, with a player.

`check` reads film.html, finds the music (the clip named with `--music`, else the longest sound with no `.vtt`
beside it, so a voice-over is never taken for the music), follows its `at`, `#t=` and `speed`, and lists every
picture cut over the music with how many frames it is from the nearest beat and whether it is on a beat, a half beat
or a hit (within a frame) or OFF (the measure goes to `beats/` beside film.html, or `--out`). Edges less than half a
frame apart are one cut. It also reports a GAP (no picture for a tenth of a millisecond or more between clips, since a frame on the hole's end is drawn black; at the film's end, half a frame), an OVERLAP of
clips on one track, a clip whose `#t=` runs PAST END of its file, the pace (shots and their mean length in each
section of the music), the shape (the shots of the quiet and mid parts against the loud parts, and cuts a bar against
each bar's level, as a ratio and a rank correlation), where the film enters and leaves the music and how many bars
it starts before the lift, a WARN for four or more shots of one length in a row lasting longer than two bars, and
which clip starts at the lift. When a render lies beside film.html and is newer than it, `check` also looks at the
middle of every shot for black bars inside the picture, and for black frames inside the film (not its fade in and
out), saying whether the clip's file is black there or the render drew the frame black. It ends with TO DO, a list of what is left to fix, and
`--strict` exits 1 on a cut off the grid, a GAP, a PAST END, a shape that does not follow the music (the quiet parts'
shots under 1.5 times the loud parts', or the correlation under 0.3) black bars or a black frame inside the film.

How it measures: the sound at 22.05 kHz, 40 pitch-spaced bands, onset strength from the rise in each band; the tempo
from the onset strength's autocorrelation, weighted toward 120 BPM; the beats by dynamic programming (Ellis 2007).
Where the music keeps one tempo, which is most music made to a click, its attacks sit on a straight line: the
tracker's beats are replaced by the line that the onset strength fits best (searched within 3% of the tracked
period), when at least 85% of the 16-beat stretches that have a pulse have their strongest attacks on that line or
on its half beats. The tracker alone drifted off it by up to 7 frames where the attacks change or fade, and the run
says how many beats it moved. Music played by hand or slowing down keeps the tracker's beats. The bar's first beat
comes from the kick and bass, the change of harmony bar to bar, and the beat's accent; when that is a guess, from
the beat the music lifts on. The lift is the second the level steps up (the rise of 80 ms over the 80 ms before it,
greatest, within a beat of where the beat-by-beat levels rise most). Node and ffmpeg only, no packages. A seven-minute
track takes under half a minute on a laptop.

How well, measured with `tools/`:

- **Tempo against a library's listed BPM**: 9 of 12 Incompetech tracks within 1 BPM. The misses are a track listed
  at 200 that reads at half (100), one listed at 130 that reads 107, and one listed at 60 that reads 80.1. For the
  half and double cases the run says "it may also be … BPM".
- **Beats and bars against a score**: 14 renders from XSXB-Band, whose MIDI gives the true grid. The 11 with a clear
  beat: tempo right in all 11, beats F-measure 0.95 to 1.00, bars 0.99 to 1.00 (70 ms tolerance), against 0.86 to 1.00
  and 0.82 to 1.00 before the straight line. In 10 of the 11 the beats now sit 14 to 22 ms after the score's note times (4 to 18 ms
  before); the 10 ms shift that puts the line on a synthetic kick's attack is in that, and the samples' own
  attack time is not separated from it. The 3 ambient beds (60 and 72 BPM) fail; all three report `steady` under 0.25,
  which the run and the brief treat as "little beat: cut on the hits and phrases".
- **Constant or not, on the 12 tracks of these trials**: 11 keep a straight line (funky-boxstep at 95% of its
  stretches, the rest at all of them); one (ether-vox) does not, and keeps the tracker's beats.
- **Synthetic drift**: tempo ramps (100 to 112, 90 to 80 BPM) and 12 to 15 ms of played looseness: beats F 0.99 to
  1.00.
- **A constant tempo whose strongest attack changes from the off beat to the kick** (the test in `test/`): the
  tracker's beats left the line by up to 3.7 frames in the quiet part; the beats are now within 0.03 frames of it.

When the bars are a guess (the run says so), `--bar <a second that starts a bar>` sets them; `--bpm` sets the tempo.
If the music lifts on a beat, the bars start from that beat, as a lift nearly always starts a bar; if it lifts on a
half beat or not at all, the run says to ask the person to listen. It names another tempo only at double or half the
one it chose.

What the brief asks of the agent:

- measure the music before the first cut; every cut on a beat, half beat or hit within a frame, or in a pause of
  speech, and the cuts left off the beat named;
- the music's shape as the film's: longer shots when quiet, shorter when loud, scene changes on bars, the strongest
  shot on the lift, nothing new in the last bar;
- built in phrases: a whole number of 4- or 8-bar phrases before the lift, the end on a phrase's end or a faded last
  bar;
- every clip looked at before the lift shot is chosen, and each shot's best moment picked with `#t=`;
- the drop marked: a cut or a punch on 75% of its beats or more (`plan`, then `punch`);
- music that suits the film, low under speech;
- footage trimmed, never re-encoded; effects are CSS on the clip;
- `check` ends with TO DO and the list is worked through; `look` shows the cut at the lift and one in each section, and
  `look --full` the rendered film.

## Use it

- **In OpenFilm**: open Skills, add one from a link, and paste `https://github.com/WEBGRS/openfilm-beat-cut`.
- **In your own agent** (Claude Code, Codex and others): `npx skills add WEBGRS/openfilm-beat-cut`.

It needs Node 22 or later and ffmpeg on the PATH (OpenFilm needs ffmpeg too). It pairs with
[footage-cut](https://github.com/WEBGRS/openfilm-footage-cut), which logs a folder of clips shot by shot.

## Develop

```sh
npm test            # synthetic music with a known grid and a lift, film.html parsing, check (about 40 s)
npm run check       # the skill folder against OpenFilm's skill rules
node tools/oracle-xsxb.mjs <XSXB-Band exports folder>                 # a local folder of renders, not in this repository
node tools/oracle-tempo.mjs <music folder> <incompetech pieces.json>   # local downloads too
node tools/drift.mjs
```

## 中文说明

OpenFilm 技能：做出卡点的感觉。高潮前镜头放稳，冲进高潮时越切越快，高潮那一下闪白加推镜，之后几乎每一拍都有切镜或推镜冲击，重鼓点上画面抖一下；每个剪辑点都踩在拍子上。

在一个 B 站卡点合集的九首歌高潮上试过（OpenFilm 0.3.0）：用技能的片子高潮段 72–94% 的拍子上有画面变化；不用技能的七首是 2–29%，另外两首和用技能差不多。0.3.0 有三首测错了（速度测成一半、拍点落在反拍、高潮晚了 17 秒找到），0.4.0 修好了这三处；还有一首歌两种底鼓测法对拍点位置意见不一。片子没有人看过或听过，数字和画面见 [evals](evals/README.md)。

0.3.0 新增：`beats.mjs plan beats/<名字>.json --length 30` 选音乐段落并排好每个镜头（高潮前一小节一个，冲进高潮 2、1、½、½ 拍，之后一两拍一个，最后一小节一个）；`beats.mjs punch film.html` 把慢推、闪白、推镜冲击和抖动写成片段上的 CSS 动画（不重新编码素材，再跑一次会替换之前写的）；`check` 统计高潮段有多少拍落了切镜或冲击（要求 75% 以上）。

智能体听不见，但能读数字，所以这个技能唯一的脚本把音乐和片子的剪辑点都变成数字：`beats.mjs <音乐>` 测出速度、每一拍、每小节第一拍、比周围更突出的重音、每小节的响度、安静/中等/热闹的段落和音乐上扬的那一秒，写成 `beats/<名字>.json` 和一张能播放的波形页，并在命令行打印各段落、拍点是不是一条直线、小节从哪来。速度不变的音乐（做音乐时按节拍器做的大多如此）里，重音落在一条直线上：脚本用它取代追踪出来的拍点，因为追踪在重音变弱或换位的地方会偏离这条线多达 7 帧；速度会变的音乐保留追踪的拍点。`snap` 把秒数吸附到最近的拍、半拍、小节或重音。`check` 读 film.html，找到音乐（`--music` 指定的那段，否则是旁边没有 `.vtt` 的最长一段声音），逐个列出音乐范围内的画面剪辑点离最近的拍子差几帧，并说它在拍、半拍还是重音上（一帧内），否则标 OFF；它还报告 GAP（片段之间 0.1 毫秒以上的空档，落在空档末尾的那一帧会被渲染成黑色）、OVERLAP、PAST END、节奏、片子的形状（安静段和热闹段镜头长度之比，以及每小节剪辑数与该小节响度的相关）、片子从音乐的哪里进来、哪里出去、上扬前几小节开始、连续等长镜头的 WARN、上扬那一刻是哪个镜头开始；如果 film.html 旁边有比它新的渲染，还会看每个镜头中间画面里有没有黑边、片子里有没有黑帧（并说明是空档、素材本身还是渲染造成的）。最后打印 TO DO，列出还要改的事；`--strict` 在有剪辑点不在网格上、GAP、PAST END、形状不跟音乐走（安静段镜头不到热闹段的 1.5 倍，或相关低于 0.3）、有黑边或黑帧时返回 1。只用 Node 和 ffmpeg，七分钟的曲子半分钟以内测完。

需求书要求智能体：剪第一刀前先测音乐；每个剪辑点在一帧内落在拍、半拍或重音上（说话停顿处除外），偏离的要说明；片子的形状跟音乐走：安静时镜头长、热闹时短，换场景落在小节上，最强的镜头放在上扬处，最后一小节只放结尾；按乐句搭：上扬前留整数个 4 或 8 小节的乐句，结尾落在乐句末尾或淡出最后一小节；选上扬镜头前看完每段素材，用 `#t=` 挑每段里最好的那一刻；高潮段 75% 以上的拍子要有切镜或冲击（先 `plan` 再 `punch`）；音乐配得上片子，有人说话时压低；素材只裁不重编码，特效是片段上的 CSS；`check` 的 TO DO 要一条条做完，用 `look` 看上扬处和每个段落各一个剪辑点，渲染后用 `look --full`。

准确度（`tools/` 里的脚本可复现）：这次试用的 12 首 Incompetech 里 9 首速度对照官网标注误差在 1 BPM 内，另 3 首是标注 200 测成 100、标注 130 测成 107、标注 60 测成 80.1。XSXB-Band 渲染的 14 首（MIDI 给出真实节拍）里，节拍清楚的 11 首速度全对，节拍 F 值 0.95–1.00，小节 0.99–1.00（加直线之前是 0.86–1.00 和 0.82–1.00）；3 首氛围铺底失败，它们的 `steady` 都低于 0.25，脚本和需求书都会按「节拍不明显，按重音和乐句剪」处理。小节第一拍拿不准时脚本会说，可以用 `--bar <某个小节开头的秒数>` 指定：音乐在某一拍上扬时，小节就从那一拍算起，在半拍上扬或没有上扬就请人去听波形页。

**安装**：在 OpenFilm 的技能页点「添加 skill」，粘贴 `https://github.com/WEBGRS/openfilm-beat-cut`；用自己的智能体就运行 `npx skills add WEBGRS/openfilm-beat-cut`。需要 Node 22 以上和 PATH 里的 ffmpeg。和 [footage-cut](https://github.com/WEBGRS/openfilm-footage-cut)（把一堆素材按镜头列清楚）配合使用。
