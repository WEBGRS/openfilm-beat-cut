# Changelog

## 0.2.1

- `check` finds black frames inside the render (not the film's fade in and out) and says whether the clip's own file is black there or the render drew the frame black where the file has picture. In the trials of request 2 both arms had three single black frames at cuts, `look --full` flagged them, and both agents took them for the footage.

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
