import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { barAdvice, check, measure, otherTempo, sectionLine, sectionsOf } from '../skills/beat-cut/scripts/beats.mjs';
import { grid, wav } from './synth.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'skills', 'beat-cut', 'scripts', 'beats.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'beat-cut-check-'));

/** 120 BPM in 2 s bars from 0.25 s: 8 loud bars, 8 that swing between -14 and -8 dB, then 6 loud from the lift (32.25 s). */
function lifting(file) {
  const beats = grid({ bpm: 120, seconds: 44.5, start: 0.25 });
  const db = (t) => (t < 16.25 || t >= 32.25 ? 0 : Math.floor((t - 16.25) / 2) % 2 ? -8 : -14);
  wav(file, beats, { seconds: 44.5, gain: (t) => 10 ** (db(t) / 20) });
  return beats;
}

test('sections: loud, then bars swinging between quiet and mid are one stretch that is not loud, then the lift', async () => {
  const file = join(scratch, 'lifting.wav');
  lifting(file);
  const m = await measure(file);
  const at = (t) => m.sections.find((s) => t >= s.start - 1e-3 && t < s.end - 1e-3)?.level;
  /* positive control: the loud stretches are loud */
  assert.equal(at(8), 'loud', JSON.stringify(m.sections));
  assert.equal(at(38), 'loud', JSON.stringify(m.sections));
  for (const t of [17, 19, 21, 23, 25, 27, 29, 31]) assert.notEqual(at(t), 'loud', `${t} s in ${JSON.stringify(m.sections)}`);
  const quiet = m.sections.filter((s) => s.level !== 'loud');
  assert.equal(quiet.length, 1, JSON.stringify(m.sections));
  assert.ok(Math.abs(quiet[0].start - 16.25) < 0.05 && Math.abs(quiet[0].end - 32.25) < 0.05, JSON.stringify(quiet));
  assert.ok(Math.abs(m.lift - 32.25) < 0.05, `lift ${m.lift}`);
  assert.ok(Math.abs(m.liftBeat - 32.25) < 0.05, `liftBeat ${m.liftBeat}`);
  assert.match(sectionLine(m), /^0\.\d–16\.\d loud · 16\.\d–32\.\d (quiet|mid), then the lift · 32\.\d–4\d\.\d loud$/);
  const run = spawnSync(process.execPath, [SCRIPT, file, '--out', join(scratch, 'lifting-out')], { encoding: 'utf8' });
  assert.match(run.stdout, /sections: .* then the lift/);
});

test('sectionsOf: a bar that dips alone stays in its stretch; a level held for bars is a section', () => {
  const bars = (dbs) => dbs.map((db, k) => ({ start: k * 2, end: k * 2 + 2, db }));
  assert.deepEqual(sectionsOf(bars([-1, -2, -1, -5, -1, -2, -1, -1])).map((s) => s.level), ['loud']);
  assert.deepEqual(sectionsOf(bars([-1, -1, -1, -1, -15, -14, -16, -15, -1, -1])).map((s) => [s.start, s.end, s.level]), [[0, 8, 'loud'], [8, 16, 'quiet'], [16, 20, 'loud']]);
  assert.deepEqual(sectionsOf([]), []);
});

test('the other tempo: only half or double, scored close, or under 80 / over 160', () => {
  assert.equal(otherTempo({ bpm: 120, tempos: [{ bpm: 120.1, score: 0.69 }, { bpm: 79.9, score: 0.57 }, { bpm: 60, score: 0.37 }] }), undefined);
  assert.equal(otherTempo({ bpm: 120, tempos: [{ bpm: 120.1, score: 0.69 }, { bpm: 60.4, score: 0.6 }] }), 60.4);
  assert.equal(otherTempo({ bpm: 120, tempos: [{ bpm: 120.1, score: 0.69 }, { bpm: 240, score: 0.4 }] }), undefined);
  assert.equal(otherTempo({ bpm: 62.4, tempos: [{ bpm: 62.4, score: 1 }] }), 124.8);
  assert.equal(otherTempo({ bpm: 190, tempos: [{ bpm: 190, score: 1 }] }), 95);
});

test('bars that are a guess: --bar from the beat where the music lifts, else the person listens', () => {
  assert.equal(barAdvice({ barSure: 0.5, lift: 10, liftBeat: 10 }, 'beats/a.html'), null);
  assert.equal(barAdvice({ barSure: 0.05, barBy: 'told', lift: 10, liftBeat: 10 }, 'beats/a.html'), null);
  assert.match(barAdvice({ barSure: 0.05, barBy: 'lift', lift: 10, liftBeat: 10.5 }, 'beats/a.html'), /start from the beat where the music lifts, 10\.5 s/);
  assert.match(barAdvice({ barSure: 0.05, lift: 116.485, liftBeat: 116.485 }, 'beats/a.html'), /--bar 116\.485/);
  assert.match(barAdvice({ barSure: 0.05, lift: null, liftBeat: null }, 'beats/a.html'), /ask the person to listen at beats\/a\.html/);
  /* a rise beat by beat with no lift in the bars is not enough */
  assert.match(barAdvice({ barSure: 0.05, lift: null, liftBeat: 111.453 }, 'beats/a.html'), /ask the person to listen/);
});

/** A 2 s video. */
function video(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=2:r=30', '-pix_fmt', 'yuv420p', file]);
  assert.equal(r.status, 0, String(r.stderr));
}

/** A film over 120 BPM music placed so its beats fall on film seconds 0, 0.5, 1 …; the pictures as given. */
function cutFilm(dir, name, pictures, end) {
  writeFileSync(join(dir, `${name}.html`), `<!doctype html><html><body>
<section>${pictures}</section>
<section><audio src="assets/song.wav#t=0.25,${end + 0.25}" at="0"></audio></section>
</body></html>`);
}
const img = (n, at, len) => `<img src="assets/${n}.png#t=0,${len}" at="${at}">`;

test('check: edges under half a frame apart are one cut; GAP, OVERLAP and PAST END; a clean film has none', async () => {
  const dir = join(scratch, 'edges');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  wav(join(dir, 'assets', 'song.wav'), grid({ bpm: 120, seconds: 20, start: 0.25 }), { seconds: 20 });
  video(join(dir, 'assets', 'v.mp4'));
  /* a 0–2, b at 2.004 (a 4 ms hole holding frame 60), v trimmed 0.5–2.5 of a 2 s file, c 4 ms early (no overlap), a 2 s hole, e over d */
  cutFilm(dir, 'messy', img('a', 0, 2) + img('b', 2.004, 1.996) + '<video src="assets/v.mp4#t=0.5,2.5" at="4"></video>'
    + img('c', 5.996, 2.004) + img('d', 10, 2) + img('e', 11.5, 2.5), 14);
  /* positive control: the same kinds of clip, edge to edge */
  cutFilm(dir, 'clean', img('a', 0, 2) + img('b', 2, 1.5) + '<video src="assets/v.mp4#t=0,2" at="3.5"></video>' + img('c', 5.5, 2.5), 8);

  const clean = await check(join(dir, 'clean.html'));
  assert.deepEqual([clean.gaps, clean.overlaps, clean.pastEnd, clean.warnings], [[], [], [], []]);
  assert.equal(clean.cuts.length, 3);
  assert.equal(clean.onBeat, 3);

  const r = await check(join(dir, 'messy.html'));
  assert.equal(r.onBeat, r.cuts.length, JSON.stringify(r.cuts));
  assert.deepEqual(r.cuts.map((c) => c.t), [2.004, 4, 5.996, 8, 10, 11.5, 12]);
  assert.deepEqual(r.cuts[0].clips, ['a.png ends', 'b.png starts']);
  assert.deepEqual(r.gaps.map((g) => [g.after, g.length]), [['a.png', 0.004], ['c.png', 2]]);
  assert.deepEqual(r.overlaps.map((o) => [o.track, o.a, o.b, o.length]), [[1, 'd.png', 'e.png', 0.5]]);
  assert.deepEqual(r.pastEnd.map((p) => [p.clip, p.end, p.length]), [['v.mp4', 2.5, 2]]);

  const strict = spawnSync(process.execPath, [SCRIPT, 'check', 'messy.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stdout + strict.stderr);
  assert.match(strict.stdout, /7 cuts over it, within a frame at 30 fps: 7 on a beat, 0 on a half beat, 0 on a hit, 0 off/);
  assert.match(strict.stdout, /GAP 2\.000 s with no picture after c\.png/);
  assert.match(strict.stdout, /OVERLAP 0\.500 s on track 1: e\.png starts before d\.png ends/);
  assert.match(strict.stdout, /PAST END v\.mp4: #t= reaches 2\.5 s, the file is 2 s long/);
  const ok = spawnSync(process.execPath, [SCRIPT, 'check', 'clean.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.doesNotMatch(ok.stdout, /GAP|OVERLAP|PAST END|WARN/);
});

test('check: the pace by section, shots cut by the clock, and what starts at the lift', async () => {
  const dir = join(scratch, 'pace');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  lifting(join(dir, 'assets', 'song.wav'));
  /* the lift, 32.25 s of the music, is film 32: eight shots of 4 s, then the lift shot */
  const clock = Array.from({ length: 8 }, (_, k) => img(`s${k}`, k * 4, 4)).join('');
  cutFilm(dir, 'clock', `${clock}${img('lift', 32, 2)}`, 34);
  /* positive control: shots of their own lengths, longer in the quiet, none starting at the lift */
  const own = [[0, 2], [2, 1], [3, 3], [6, 2], [8, 4], [12, 4], [16, 8], [24, 10], [34, 1], [35, 1]];
  cutFilm(dir, 'own', own.map(([at, len], k) => img(`o${k}`, at, len)).join(''), 36);

  const r = await check(join(dir, 'clock.html'));
  assert.deepEqual(r.warnings.map((w) => [w.shots, w.length, w.from]), [[8, 4, 's0.png']]);
  assert.deepEqual(r.pace.map((p) => [p.level === 'loud', p.shots, p.mean]), [[true, 4, 4], [false, 4, 4], [true, 1, 2]]);
  assert.ok(Math.abs(r.lift.film - 32) < 1 / 30, `lift at film ${r.lift.film}`);
  assert.deepEqual(r.lift.cut.starts, ['lift.png']);
  const out = spawnSync(process.execPath, [SCRIPT, 'check', 'clock.html'], { cwd: dir, encoding: 'utf8' });
  assert.match(out.stdout, /WARN 8 shots in a row of 4\.00 s \(from s0\.png at 0\.000 s\): cut by the clock\?/);
  assert.match(out.stdout, /lift 32\.2\d* s → film 3[12][.\d]* s: lift\.png starts/);
  assert.match(out.stdout, /loud +music 0\.3–16\.\d s .*: 4 shots, mean 4\.00 s/);

  const own2 = await check(join(dir, 'own.html'));
  assert.deepEqual(own2.warnings, []);
  assert.ok(own2.pace[1].mean > own2.pace[0].mean, JSON.stringify(own2.pace));
  assert.equal(own2.lift.cut.on, false);
  const told = spawnSync(process.execPath, [SCRIPT, 'check', 'own.html'], { cwd: dir, encoding: 'utf8' });
  assert.match(told.stdout, /lift 32\.2\d* s → film 3[12][.\d]* s: no cut at the lift \(nearest cut 34 s, \+60(\.\d)? frames/);
});

test('check: the film follows the music\'s quiet and loud in numbers; shots all one length do not, and --strict fails them', async () => {
  const dir = join(scratch, 'shape');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  lifting(join(dir, 'assets', 'song.wav'));
  /* positive control: 1 to 3 s shots in the loud, 4 to 10 s in the quiet, a short burst after the lift */
  const own = [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2], [16, 8], [24, 8], [32, 1], [33, 1], [34, 1], [35, 1]];
  cutFilm(dir, 'follows', own.map(([at, len], k) => img(`o${k}`, at, len)).join(''), 36);
  /* the same music, every shot 2 s: the quiet part is as busy as the loud */
  const even = Array.from({ length: 18 }, (_, k) => [k * 2, 2]).map(([at, len], k) => img(`e${k}`, at, len)).join('');
  cutFilm(dir, 'even', even, 36);

  const good = await check(join(dir, 'follows.html'));
  assert.ok(good.shape.ratio >= 1.5, JSON.stringify(good.shape));
  assert.ok(good.shape.r >= 0.3, JSON.stringify(good.shape));
  assert.equal(good.shape.ok, true);
  assert.ok(!good.todo.some((t) => /quiet parts|per bar/.test(t)), good.todo.join(' | '));

  const bad = await check(join(dir, 'even.html'));
  assert.ok(bad.shape.ratio <= 1.1, JSON.stringify(bad.shape));
  assert.equal(bad.shape.ok, false);
  assert.ok(bad.todo.some((t) => /quiet parts' shots are 1x as long/.test(t) || /quiet parts' shots are 1\.\d+x/.test(t)), bad.todo.join(' | '));
  const out = spawnSync(process.execPath, [SCRIPT, 'check', 'even.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(out.status, 1, out.stdout);
  assert.match(out.stdout, /shape: shots in the quiet and mid parts average 2\.00 s, in the loud parts 2\.00 s \(1x; want 1\.5x or more\)/);
  assert.match(out.stdout.trim().split('\n').slice(-6).join('\n'), /TO DO \(\d+\):[\s\S]*quiet parts' shots are 1x as long/);
  const ok = spawnSync(process.execPath, [SCRIPT, 'check', 'follows.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
});

test('check: a cut on a half beat or a hit is not off; one between them is, and the TO DO names it with its frames', async () => {
  const dir = join(scratch, 'kinds');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  wav(join(dir, 'assets', 'song.wav'), grid({ bpm: 120, seconds: 20, start: 0.25 }), { seconds: 20 });
  /* beats at film 0, 0.5 …; cuts at 2 (beat), 3.25 (half beat), 5.1 (3 frames late) */
  cutFilm(dir, 'kinds', img('a', 0, 2) + img('b', 2, 1.25) + img('c', 3.25, 1.85) + img('d', 5.1, 3), 8.1);
  const r = await check(join(dir, 'kinds.html'));
  assert.deepEqual(r.cuts.map((c) => c.kind), ['bar', 'half', 'off']);
  assert.equal(r.onGrid, 2);
  assert.ok(r.todo[0].startsWith('1 cut is off the beat, the half beat and the hits (film 5.10 s '), r.todo[0]);
  const out = spawnSync(process.execPath, [SCRIPT, 'check', 'kinds.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /half film 3\.250 s/);
  assert.match(out.stdout, /OFF  film 5\.100 s/);
  assert.match(out.stdout, /1 on a beat, 1 on a half beat, 0 on a hit, 1 off/);
});

test('check: black bars inside the picture of the render show up with the shot and side; a full picture does not', async () => {
  const dir = join(scratch, 'barred');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  wav(join(dir, 'assets', 'song.wav'), grid({ bpm: 120, seconds: 20, start: 0.25 }), { seconds: 20 });
  cutFilm(dir, 'film', img('a', 0, 2) + img('b', 2, 2), 4);
  const render = (name, vf) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=96x54:d=4:r=30', '-vf', vf, '-pix_fmt', 'yuv420p', join(dir, name)]);
    assert.equal(r.status, 0, String(r.stderr));
  };
  /* a render older than film.html is not this film's */
  render('old.mp4', 'null');
  await new Promise((done) => setTimeout(done, 50));
  cutFilm(dir, 'film', img('a', 0, 2) + img('b', 2, 2), 4);
  const none = await check(join(dir, 'film.html'));
  assert.equal(none.render, null);
  assert.ok(none.todo.some((t) => /no render of this film yet/.test(t)));
  /* the picture scaled into a black frame: 16 px bars each side of 96 */
  render('film.mp4', 'scale=64:54,pad=96:54:16:0:black');
  const r = await check(join(dir, 'film.html'));
  assert.equal(r.render, 'film.mp4');
  assert.deepEqual(r.barred.map((b) => [b.clip, b.side]), [['a.png', 'left and right'], ['b.png', 'left and right']]);
  assert.ok(r.todo.some((t) => /black bars in the picture of 2 shots \(a\.png at film 1\.00 s, left and right; b\.png at film 3\.00 s/.test(t)), r.todo.join(' | '));
  const strict = spawnSync(process.execPath, [SCRIPT, 'check', 'film.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stdout);
  /* positive control: the whole frame is picture */
  render('film.mp4', 'null');
  const full = await check(join(dir, 'film.html'));
  assert.deepEqual(full.barred, []);
  assert.ok(!full.todo.some((t) => /no render/.test(t)));
});

test('bars the kick and the harmony leave a guess start from the lift beat; --bar still wins', async () => {
  /* a kick on every beat and a chord that changes every beat: nothing says which beat starts a bar; the level steps up at 21.25 s, beat 42 (42 % 4 = 2) */
  const file = join(scratch, 'flat-lift.wav');
  wav(file, grid({ bpm: 120, seconds: 40, start: 0.25 }), { seconds: 40, meter: 1, gain: (t) => (t < 21.25 ? 0.2 : 1) });
  const m = await measure(file);
  assert.ok(m.barSure < 0.2, `barSure ${m.barSure}`);
  assert.equal(m.barBy, 'lift');
  assert.ok(Math.abs(m.liftBeat - 21.25) < 0.03, `liftBeat ${m.liftBeat}`);
  assert.ok(m.bars.some((b) => Math.abs(b - m.liftBeat) < 1e-3), 'the lift beat starts a bar');
  assert.ok(Math.abs(m.lift - m.liftBeat) < 1e-3, `lift ${m.lift}`);
  assert.equal(m.bars.length, Math.ceil((m.beats.length - (m.beats.indexOf(m.liftBeat) % 4)) / 4));
  /* told: --bar wins over the lift */
  const told = await measure(file, { bar: m.beats[0] });
  assert.equal(told.barBy, 'told');
});

test('the lift is the second the level steps up: on a half beat it is not moved to a beat, and no bar is set from it', async () => {
  const file = join(scratch, 'half-lift.wav');
  /* 120 BPM from 0.25 s; the level steps up 16 dB at 32.5 s, between the beats at 32.25 and 32.75, with a loud hit there */
  wav(file, grid({ bpm: 120, seconds: 44.5, start: 0.25 }), { seconds: 44.5, gain: (t) => (t < 32.5 ? 0.16 : 1), offbeat: (t) => (t >= 32.49 && t < 32.51 ? 1.2 : 0) });
  const m = await measure(file);
  assert.ok(Math.abs(m.lift - 32.5) <= 0.02, `lift ${m.lift}`);
  assert.equal(m.liftBeat, null);
  assert.notEqual(m.barBy, 'lift');
  /* the bars start a half beat off the lift, but the quiet ends and the loud starts at the lift itself */
  const quiet = m.sections.find((x) => x.level !== 'loud');
  const loud = m.sections.find((x) => x.level === 'loud');
  assert.ok(Math.abs(quiet.end - m.lift) < 1e-3 && Math.abs(loud.start - m.lift) < 1e-3, JSON.stringify(m.sections));
  assert.match(sectionLine(m), /, then the lift/);
});

test('check: a black frame inside the render is the footage\'s where the file is black and the render\'s where the file has picture; a fade at the ends is not one', async () => {
  const dir = join(scratch, 'blackframe');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  wav(join(dir, 'assets', 'song.wav'), grid({ bpm: 120, seconds: 20, start: 0.25 }), { seconds: 20 });
  const ff = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); assert.equal(r.status, 0, String(r.stderr)); };
  /* g.mp4 is picture; b.mp4 is black */
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=96x54:d=2:r=30', '-pix_fmt', 'yuv420p', join(dir, 'assets', 'g.mp4')]);
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=96x54:d=2:r=30', '-pix_fmt', 'yuv420p', join(dir, 'assets', 'b.mp4')]);
  /* a: picture to 2 s, b: black 2 to 4 s, c: picture 4 to 6 s; cuts on the beats of the music */
  writeFileSync(join(dir, 'film.html'), `<!doctype html><html><body>
<section><video src="assets/g.mp4#t=0,2" at="0"></video><video src="assets/b.mp4#t=0,2" at="2"></video><video src="assets/g.mp4#t=0,2" at="4"></video></section>
<section><audio src="assets/song.wav#t=0.25,6.25" at="0"></audio></section>
</body></html>`);
  /* the render: a black frame at 3.0 s (inside b) and one at 5.0 s (inside c), and a black first and last frame as a fade has */
  const render = (name, vf) => ff(['-f', 'lavfi', '-i', 'testsrc2=s=96x54:d=6:r=30', '-vf', vf, '-pix_fmt', 'yuv420p', join(dir, name)]);
  await new Promise((done) => setTimeout(done, 50));
  render('film.mp4', "geq=lum='if(eq(N,90)+eq(N,150)+eq(N,0)+eq(N,179),0,lum(X,Y))':cb=128:cr=128");
  const r = await check(join(dir, 'film.html'));
  assert.deepEqual(r.black.map((b) => [b.at, b.clip, b.cause]), [[3, 'b.mp4', 'source'], [5, 'g.mp4', 'render']], JSON.stringify(r.black));
  assert.ok(r.todo.some((t) => /black in the file itself where a clip plays \(b\.mp4 at film 3\.00 s\)/.test(t)), r.todo.join(' | '));
  assert.ok(r.todo.some((t) => /1 black frame in the render where the file has picture \(g\.mp4 at film 5\.00 s\)/.test(t)), r.todo.join(' | '));
  const strict = spawnSync(process.execPath, [SCRIPT, 'check', 'film.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stdout);
  assert.match(strict.stdout, /2 black frame\(s\) inside the film \(3\.00 s, 5\.00 s\)/);
  /* positive control: only the ends are black */
  render('film.mp4', "geq=lum='if(eq(N,0)+eq(N,179),0,lum(X,Y))':cb=128:cr=128");
  const clean = await check(join(dir, 'film.html'));
  assert.deepEqual(clean.black, []);
  assert.ok(!clean.todo.some((t) => /black/.test(t)), clean.todo.join(' | '));
});
