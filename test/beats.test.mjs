import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, filmTracks, measure, snap } from '../skills/beat-cut/scripts/beats.mjs';
import { fmeasure, grid, wav } from './synth.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'skills', 'beat-cut', 'scripts', 'beats.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'beat-cut-'));

test('a steady 128 BPM: its tempo, every beat, and the bars from the kick', async () => {
  const beats = grid({ bpm: 128, seconds: 30, start: 0.4 });
  const file = join(scratch, 'steady.wav');
  wav(file, beats, { seconds: 30 });
  const m = await measure(file);
  assert.ok(Math.abs(m.bpm - 128) < 1, `bpm ${m.bpm}`);
  assert.ok(fmeasure(m.beats, beats) >= 0.95, `beats F ${fmeasure(m.beats, beats)}`);
  assert.ok(fmeasure(m.bars, beats.filter((_, k) => k % 4 === 0)) >= 0.9, 'bars');
  assert.ok(Math.abs(m.bars[0] - 0.4) < 0.03, `first bar ${m.bars[0]}`);
  assert.ok(m.steady > 0.25, `steady ${m.steady}`);
  assert.ok(m.sound.start < 0.45 && m.sound.end > 29);
  for (const b of m.beats) assert.equal(b, Math.round(b * 1000) / 1000);
});

test('a tempo that drifts (128 to 136) and beats played loosely (12 ms) are followed', async () => {
  const beats = grid({ bpm: 128, end: 136, seconds: 60, jitter: 0.012, start: 0.4 });
  const file = join(scratch, 'loose.wav');
  wav(file, beats, { seconds: 60 });
  const m = await measure(file);
  assert.ok(fmeasure(m.beats, beats) >= 0.95, `beats F ${fmeasure(m.beats, beats)}`);
});

test('--bar sets which beat starts a bar; --bpm sets the tempo', async () => {
  const beats = grid({ bpm: 100, seconds: 20 });
  const file = join(scratch, 'bars.wav');
  wav(file, beats, { seconds: 20 });
  const told = await measure(file, { bar: beats[2] });
  assert.ok(Math.abs(told.bars[0] - beats[2]) < 0.03, `first bar ${told.bars[0]}`);
  assert.equal(told.barSure, 1);
  const twice = await measure(file, { bpm: 200 });
  assert.ok(twice.beats.length > 1.8 * beats.length, `${twice.beats.length} beats at 200`);
  const three = await measure(file, { meter: 3 });
  assert.equal(three.meter, 3);
  assert.ok(Math.abs(three.bars.length - three.beats.length / 3) <= 1);
});

test('snap: the nearest beat, half beat, bar and hit', () => {
  const m = { beats: [1, 1.5, 2, 2.5, 3], bars: [1, 3], hits: [{ t: 2.05 }] };
  assert.deepEqual(snap(m, 1.6), { t: 1.6, to: 'beat', at: 1.5, off: -0.1 });
  assert.equal(snap(m, 1.3, 'half').at, 1.25);
  assert.equal(snap(m, 2.2, 'bar').at, 3);
  assert.equal(snap(m, 0, 'hit').at, 2.05);
});

test('film.html: tracks top first, comments, styles and quoted ">" left as they are', () => {
  const tracks = filmTracks(`<!doctype html><html><head><style>a > b { color: red } i < j</style></head><body>
<!-- <section><video src="old.mp4"></video></section> -->
<section><iframe src="title.html#t=0,2" at="1" overrides='{"x":"a > b"}'></iframe><img src="assets/a%20b.png#t=0,3" at="3"></section>
<section hidden><video src="assets/x.mp4"></video></section>
<section muted><audio src="assets/song.mp3#t=0.5" at="1" speed="1.5" volume="0.6"></audio></section>
</body></html>`);
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks[0].clips.map((c) => c.tag), ['iframe', 'img']);
  assert.equal(tracks[0].clips[0].attrs.overrides, '{"x":"a > b"}');
  assert.equal(tracks[0].clips[1].attrs.src, 'assets/a%20b.png#t=0,3');
  assert.ok('hidden' in tracks[1].attrs);
  assert.equal(tracks[2].clips[0].attrs.speed, '1.5');
});

/** A project: music at 1 s trimmed from 0.5 s, a voice with words, pictures cut on its beats but one 5 frames late. */
function project(name = 'film') {
  const dir = join(scratch, name);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const beats = grid({ bpm: 120, seconds: 20, start: 0.25 });
  wav(join(dir, 'assets', 'song.wav'), beats, { seconds: 20 });
  /* a voice: a sound with a .vtt beside it, longer than the music */
  wav(join(dir, 'assets', 'vo.wav'), grid({ bpm: 70, seconds: 25 }), { seconds: 25, pad: false });
  writeFileSync(join(dir, 'assets', 'vo.vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n');
  writeFileSync(join(dir, 'title.html'), '<script type="module">window.film = { frame() {}, duration: 2 };</script>');
  /* film time = 1 + (music time - 0.5): beat b is at film b + 0.5 */
  const at = (k) => Math.round((beats[k] + 0.5) * 1000) / 1000;
  const shots = [[at(2), at(6)], [at(6), at(10)], [at(10) + 5 / 30, at(14)], [at(14), at(18)]];
  const imgs = shots.map(([a, z], k) => `<img src="assets/p${k}.png#t=0,${Math.round((z - a) * 1000) / 1000}" at="${a}">`).join('');
  writeFileSync(join(dir, 'film.html'), `<!doctype html><html><body>
<section><iframe src="title.html" at="${at(2)}"></iframe></section>
<section>${imgs}</section>
<section><audio src="assets/vo.wav" at="0"></audio></section>
<section><audio src="assets/song.wav#t=0.5" at="1"></audio></section>
</body></html>`);
  return { dir, shots };
}

test('check: each picture cut in frames from the beat; the one 5 frames late is the one off', async () => {
  const { dir, shots } = project();
  const r = await check(join(dir, 'film.html'));
  assert.equal(r.music.file, 'assets/song.wav');
  assert.ok(Math.abs(r.music.bpm - 120) < 1);
  const off = r.cuts.filter((c) => Math.abs(c.frames) > 1);
  assert.equal(off.length, 1, JSON.stringify(r.cuts));
  assert.ok(Math.abs(off[0].t - shots[2][0]) < 1e-3);
  assert.ok(Math.abs(off[0].frames + 5) <= 1, `frames ${off[0].frames}`);
  assert.equal(r.onBeat, r.cuts.length - 1);
  /* the title's end (2 s from its page's duration) is a cut too */
  assert.ok(r.cuts.some((c) => c.clips.some((n) => n.startsWith('title.html end'))));
  assert.ok(existsSync(join(dir, 'beats', 'song.json')));
  await assert.rejects(check(join(dir, 'film.html'), { music: 'nope' }), /no sound clip "nope"/);
});

test('the command line: a measure written as JSON and a page; check --strict exits 1 on a cut off the beat', () => {
  const { dir } = project();
  const out = join(scratch, 'cli');
  const run = spawnSync(process.execPath, [SCRIPT, join(dir, 'assets', 'song.wav'), '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /120(\.\d)? BPM/);
  const m = JSON.parse(readFileSync(join(out, 'song.json'), 'utf8'));
  assert.equal(m.format, 'openfilm-beats/1');
  const html = readFileSync(join(out, 'song.html'), 'utf8');
  assert.match(html, /src="\.\.\/film\/assets\/song\.wav"/);
  const snapped = spawnSync(process.execPath, [SCRIPT, 'snap', join(out, 'song.json'), '3.1', '--to', 'bar'], { encoding: 'utf8' });
  assert.equal(JSON.parse(snapped.stdout).to, 'bar');
  const strict = spawnSync(process.execPath, [SCRIPT, 'check', 'film.html', '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stdout + strict.stderr);
  assert.match(strict.stdout, /OFF /);
  const missing = spawnSync(process.execPath, [SCRIPT, join(dir, 'none.wav')], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
});

test('check --out writes the measure there, not into the project\'s beats/; without it, beats/', () => {
  const { dir } = project('film-out');
  const out = join(scratch, 'check-out');
  const told = spawnSync(process.execPath, [SCRIPT, 'check', 'film.html', '--out', out], { cwd: dir, encoding: 'utf8' });
  assert.equal(told.status, 0, told.stdout + told.stderr);
  assert.ok(existsSync(join(out, 'song.json')), 'measure in --out');
  assert.ok(!existsSync(join(dir, 'beats')), 'nothing in the project\'s beats/');
  const plain = spawnSync(process.execPath, [SCRIPT, 'check', 'film.html'], { cwd: dir, encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stdout + plain.stderr);
  assert.ok(existsSync(join(dir, 'beats', 'song.json')), 'measure in beats/ without --out');
});
