# Changelog

## 0.3.0

The owner watched the 0.2.x trials and could not tell the films were cut to the music: every cut was within a frame of a beat in both arms, but nothing happened on the hits between cuts, and the drop got no more than a cut. Retried on three 卡点 tracks (phonk, EDM, a Chinese viral song), the films of 0.2.2 marked 59 to 77% of the drop's beats with any picture change and held the drop's first shot up to 1.9 s.

- `beats.mjs` measures `accents`: the attack on every beat and half beat (kick, snare, clap) against the strongest, so the shake can go on the hits between beats.
- `beats.mjs plan <beats.json> --length <s>` picks the stretch of music (whole bars, the lift 2 or 4 bars in) and the shots: a bar each before the lift, the bar into it rushing (2, 1, ½, ½ beats), after it a beat each on a phrase's first bar and 1, 1, 2 beats on the others, one shot to end on. It writes `<name>.plan.json` and prints what to do next.
- `beats.mjs punch film.html` writes the effects as CSS animation on each clip's own time (OpenFilm 0.3.0's `@keyframes` on clips): a slow push before the lift, a flash on the lift and on each phrase after it, a zoom punch on every drop beat, a shake on strong half-beat hits, one hit on a last shot of a bar or more. The footage is not re-encoded; running it again replaces what it wrote, and a clip's own animation and filter are kept.
- `check` reports the 卡点 feel: of the drop's beats (the lift to the last bar), how many a cut or a punch marks (want 75%), and how many strong accents; a TO DO and `--strict` when under. Its shape measures leave out the bar that rushes into the lift and count punches as a bar's changes, so a planned film is not told it is the wrong shape.
- Where no 4 dB step is found, the lift is the first edge where the sections step up (the Chinese song steps from mid to loud by less than that, beat by beat, and had no lift).
- The measure's run ends with the plan command; the brief says what a 卡点 drop is and walks measure, plan, film, punch, check, render.

## 0.2.2

- `check` calls two clips that do not meet a GAP from a tenth of a millisecond, where it had called a hole a GAP only from half a frame or with a frame inside it. In the trials of request 2 every black frame (3 in each film) sat at a hole of 0.3 to 5 ms between two clips in film.html, written by rounding `at`: a frame that falls on the hole's end is drawn black. A black frame at a GAP is named as the GAP's, and the TO DO says to start each clip where the one before it ends.
- The brief says `check` finds holes between clips.

## 0.2.1

- `check` finds black frames inside the render (not the film's fade in and out) and says whether the clip's own file is black there or the render drew the frame black where the file has picture. In the trials of request 2 both arms had three single black frames at cuts, `look --full` flagged them, and both agents took them for the footage. Their cause was found after this version, in 0.2.2.

## 0.2.0

- `beats.mjs` puts the beats of music that keeps one tempo on a straight line. The tracker had drifted off it by up to 7 frames where the attacks change or fade (a quiet part), and `check` could not see that, since it compared cuts with the same beats. The measure says how many beats it moved and by how much.
- The lift is the second the level steps up, found within a beat of the beat-by-beat finding, so a lift on a half beat is no longer moved to a beat. Bars the kick and the harmony leave a guess start from the lift's beat (`barBy` in the measure).
- `check` calls a cut on a beat, a half beat or a hit on the grid and the rest OFF, as the brief says. It reports the film's shape in numbers (shots in the quiet and mid parts against the loud parts, cuts per bar against each bar's level), where the film enters and leaves the music and how many bars it starts before the lift, and black bars in the picture of the render beside film.html. It ends with TO DO, and `--strict` exits 1 on a shape that does not follow the music or on black bars as well as on cuts off the beat, a GAP or a PAST END.
- The brief names `look --full`, OpenFilm's free music library and `check`'s TO DO.

## 0.1.1

- `openfilm.json` says what it needs: FFmpeg and Node on the PATH, a transcription service only for footage with speech.
- `evals/README.md` and `evals/measure.mjs`: two real requests, with and without the skill, and the measure applied to both.

## 0.1.0

- First version: `beats.mjs` measures the music and checks a film's cuts; the brief asks for a cut made on them.
