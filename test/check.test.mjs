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
  assert.match(strict.stdout, /7 cuts over it, 7 on a beat/);
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
