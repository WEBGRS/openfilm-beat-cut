// 卡点: accents, the plan, the punches and the feel that check reports
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STRONG, accentsOf, check, fxFor, keyframes, measure, plan, punch, roleAt } from '../skills/beat-cut/scripts/beats.mjs';
import { grid, wav } from './synth.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'skills', 'beat-cut', 'scripts', 'beats.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'beat-cut-kadian-'));

/** 120 BPM from 0.25 s, 2 s bars: mid until the lift at 16.25 s, loud after it, to 40.25 s. */
function song() {
  const beats = Array.from({ length: 80 }, (_, k) => 0.25 + k * 0.5);
  return {
    bpm: 120, meter: 4, beats, bars: beats.filter((_, k) => k % 4 === 0),
    accents: beats.flatMap((b, k) => [{ t: b, half: false, strength: k % 2 ? 1 : 0.8 }, { t: b + 0.25, half: true, strength: k % 4 === 1 ? 0.9 : 0.3 }]),
    sections: [{ start: 0.25, end: 16.25, level: 'mid' }, { start: 16.25, end: 40.25, level: 'loud' }],
    lift: 16.25, sound: { start: 0.25, end: 40.25 }, duration: 40.5,
  };
}

test('plan: 4 bars before the lift a shot a bar, the bar into it rushing, a cut or a punch on every beat of the drop, whole bars', () => {
  const m = song();
  const p = plan(m, { length: 20 });
  assert.equal(p.music.from, 8.25);
  assert.equal(p.music.to, 28.25);
  assert.equal(p.music.liftFilm, 8);
  /* shots edge to edge over the whole film */
  let at = 0;
  for (const s of p.slots) { assert.ok(Math.abs(s.at - at) < 1e-3, `${s.at} after ${at}`); at = s.at + s.length; }
  assert.ok(Math.abs(at - 20) < 1e-3);
  assert.deepEqual(p.slots.slice(0, 3).map((s) => [s.at, s.length, s.role]), [[0, 2, 'build'], [2, 2, 'build'], [4, 2, 'build']]);
  /* the bar into the lift: 2, 1, half, half beats */
  assert.deepEqual(p.slots.slice(3, 7).map((s) => s.length), [1, 0.5, 0.25, 0.25]);
  const lift = p.slots.find((s) => s.lift);
  assert.equal(lift.at, 8);
  assert.equal(lift.role, 'drop');
  assert.ok(lift.fx.some((f) => f.kind === 'flash'));
  /* every beat of the drop but the last bar's is a shot's start or a punch inside one */
  const marked = new Set(p.slots.flatMap((s) => [s.at, ...s.fx.filter((f) => f.kind !== 'push').map((f) => f.at)]).map((t) => t.toFixed(3)));
  for (let t = 8; t < 18 - 1e-6; t += 0.5) assert.ok(marked.has(t.toFixed(3)), `beat at film ${t} unmarked`);
  /* calmer before the lift than after it */
  const before = p.slots.filter((s) => s.at < 6).length, after = p.slots.filter((s) => s.at >= 8 && s.at < 14).length;
  assert.ok(after / 6 >= 2 * (before / 6), `${before} shots in 6 s before, ${after} after`);
  assert.equal(p.slots.at(-1).role, 'end');
  assert.equal(p.slots.at(-1).length, 2);
});

test('plan: 2 bars before the lift when 4 would be over half the film; from and to as given', () => {
  const m = song();
  assert.equal(plan(m, { length: 12 }).music.from, 12.25);
  const p = plan(m, { from: 4.25, to: 24.25 });
  assert.equal(p.music.from, 4.25);
  assert.equal(p.length, 20);
});

test('fx: a slow push before the lift, a flash at the lift and on each phrase, a punch on each beat inside a drop shot, a shake on strong half-beat hits', () => {
  const m = song();
  assert.deepEqual(fxFor(m, 8.25, 10.25), [{ kind: 'push', t: 8.25 }]);
  assert.equal(roleAt(m, 15.75, 16.25), 'rush');
  const lift = fxFor(m, 16.25, 17.25);
  assert.deepEqual(lift.map((f) => f.kind).sort(), ['flash', 'punch', 'punch', 'shake']);
  assert.ok(lift.some((f) => f.kind === 'shake' && Math.abs(f.t - 17) < 1e-6), JSON.stringify(lift));
  /* the next phrase's first beat flashes, a bar's first beat inside a phrase does not */
  assert.ok(fxFor(m, 24.25, 24.75).some((f) => f.kind === 'flash'));
  assert.ok(!fxFor(m, 18.25, 18.75).some((f) => f.kind === 'flash'));
});

test('keyframes: the punch snaps in and settles, the shake moves sideways and back, the brightness follows the clip\'s own filter', () => {
  const css = keyframes('bc-1', 1, [{ kind: 'punch', t: 0 }, { kind: 'flash', t: 0 }, { kind: 'shake', t: 0.5 }], 'saturate(1.2)');
  const stops = [...css.matchAll(/([\d.]+)% \{ scale: ([\d.]+); translate: (-?[\d.]+)vw 0; filter: saturate\(1\.2\) brightness\(([\d.]+)\); \}/g)].map((x) => x.slice(1).map(Number));
  assert.ok(stops.length > 8, css);
  const at = (pct) => stops.find((s) => Math.abs(s[0] - pct) < 1e-6);
  assert.equal(at(0)[1], 1.12);
  assert.ok(at(0)[3] > 1.9);
  assert.equal(at(100)[1], 1);
  assert.equal(at(50)[2], 2.2);
  assert.ok(stops.some((s) => s[2] < 0), 'the shake goes both ways');
  assert.ok(stops.filter((s) => s[0] > 70).every((s) => s[2] === 0 && s[1] === 1 && s[3] === 1));
  /* a push alone: scale only */
  assert.equal(keyframes('bc-2', 2, [{ kind: 'push', t: 0 }]), '@keyframes bc-2 {\n  0% { scale: 1.0000; }\n  100% { scale: 1.0600; }\n}');
});

test('accents: the strong attacks on the beats and on the half beats between them', async () => {
  const file = join(scratch, 'accents.wav');
  const beats = grid({ bpm: 120, seconds: 20, start: 0.25 });
  /* a burst halfway between beats in the second half only */
  wav(file, beats, { seconds: 20, offbeat: (t) => (t > 10 ? 0.9 : 0) });
  const m = await measure(file);
  const strongHalf = m.accents.filter((a) => a.half && a.strength >= STRONG).map((a) => a.t);
  const half = m.accents.filter((a) => a.half);
  assert.ok(half.length >= 12 && strongHalf.length >= 5, JSON.stringify(half));
  assert.ok(half.every((a) => a.t > 10), `half-beat accents before 10 s: ${JSON.stringify(half.filter((a) => a.t <= 10))}`);
  /* positive control: the kicks on the beats are accents */
  assert.ok(m.accents.filter((a) => !a.half && a.t < 10).length >= 4);
  /* from the envelopes directly */
  const onset = new Float64Array(200), low = new Float64Array(200);
  onset[86] = 5; low[86] = 5; onset[43] = 1;
  const a = accentsOf({ onset, low }, [0.5, 1, 1.5]);
  assert.ok(a.some((x) => Math.abs(x.t - 1) < 1e-3 && x.strength === 1));
});

test('the lift: where no step of 4 dB is found, the first edge where the sections step up', async () => {
  const file = join(scratch, 'small-step.wav');
  const beats = grid({ bpm: 120, seconds: 36.5, start: 0.25 });
  wav(file, beats, { seconds: 36.5, gain: (t) => 10 ** ((t < 18.25 ? -6.5 : -2) / 20) });
  const m = await measure(file);
  assert.deepEqual(m.sections.map((s) => s.level), ['mid', 'loud'], JSON.stringify(m.sections));
  assert.ok(m.lift != null && Math.abs(m.lift - 18.25) < 0.05, `lift ${m.lift} ${JSON.stringify(m.sections)}`);
});

/** 120 BPM in 2 s bars from 0.25 s: loud, quieter, then loud again from the lift at 32.25 s. */
function lifting(file) {
  const beats = grid({ bpm: 120, seconds: 44.5, start: 0.25 });
  const db = (t) => (t < 16.25 || t >= 32.25 ? 0 : Math.floor((t - 16.25) / 2) % 2 ? -8 : -14);
  wav(file, beats, { seconds: 44.5, gain: (t) => 10 ** (db(t) / 20) });
}

test('check reports the 卡点 feel; punch marks every drop beat, keeps the clip\'s own animation, and running it again changes nothing', async () => {
  const dir = join(scratch, 'feel');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  lifting(join(dir, 'assets', 'song.wav'));
  /* music 24.25–44.25 at 0: the lift at film 8; ten 2 s pictures, the last fading out by its own animation */
  const pics = Array.from({ length: 10 }, (_, k) => `<img src="assets/p${k}.png#t=0,2" at="${k * 2}"${k === 9 ? ' style="animation: out 2s linear both"' : ''}>`).join('\n');
  const film = join(dir, 'film.html');
  writeFileSync(film, `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<style>@keyframes out { to { opacity: 0 } }</style>\n</head>\n<body>\n<section>\n${pics}\n</section>\n<section><audio src="assets/song.wav#t=24.25,44.25" at="0"></audio></section>\n</body>\n</html>\n`);
  const before = await check(film);
  assert.ok(before.feel.drop, JSON.stringify(before.feel));
  assert.ok(Math.abs(before.feel.drop.start - 8) < 0.02, JSON.stringify(before.feel));
  assert.ok(before.feel.drop.share < 0.5, JSON.stringify(before.feel));
  assert.equal(before.feel.ok, false);
  assert.ok(before.todo.some((t) => /the drop \(film 8\.0–18\.0 s\) marks only/.test(t)), before.todo.join('\n'));
  const run = spawnSync(process.execPath, [SCRIPT, 'check', film, '--strict'], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /卡点 feel: the drop, film 8\.0–18\.0 s, marks \d+ of 20 beats/);

  const r = await punch(film);
  assert.equal(r.clips.length, 10);
  const html = readFileSync(film, 'utf8');
  assert.equal((html.match(/<style id="beat-cut-fx">/g) ?? []).length, 1);
  assert.match(html, /<img src="assets\/p9\.png#t=0,2" at="18" style="animation: out 2s linear both, bc-10 2s linear both" data-beat-fx="punch 0">/);
  assert.match(html, /<img src="assets\/p0\.png#t=0,2" at="0" style="animation: bc-1 2s linear both" data-beat-fx="push 0">/);
  const after = await check(film);
  assert.equal(after.feel.ok, true, JSON.stringify(after.feel));
  assert.ok(after.feel.drop.share >= 0.9, JSON.stringify(after.feel));
  assert.ok(after.feel.drop.punches > after.feel.drop.cuts);
  assert.ok(!after.todo.some((t) => /drop|punch/.test(t)), after.todo.join('\n'));
  /* again: the same film */
  await punch(film);
  assert.equal(readFileSync(film, 'utf8'), html);
  /* a picture moved off the music loses what punch wrote */
  writeFileSync(film, html.replace('<section><audio src="assets/song.wav#t=24.25,44.25" at="0">', '<section><audio src="assets/song.wav#t=24.25,40.25" at="0">'));
  await punch(film);
  const cut = readFileSync(film, 'utf8');
  assert.match(cut, /<img src="assets\/p9\.png#t=0,2" at="18" style="animation: out 2s linear both">/);
});

test('a film made from the plan and punched passes check: on the beat, the shape (the rush into the lift left out), the drop marked', async () => {
  const dir = join(scratch, 'flow');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  lifting(join(dir, 'assets', 'song.wav'));
  const m = await measure(join(dir, 'assets', 'song.wav'));
  const p = plan(m, { length: 12 });
  assert.ok(p.music.liftFilm > 0, JSON.stringify(p.music));
  const pics = p.slots.map((s, k) => `<img src="assets/p${k}.png#t=0,${s.length}" at="${s.at}">`).join('\n');
  const film = join(dir, 'film.html');
  writeFileSync(film, `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n<section>\n${pics}\n</section>\n<section><audio src="assets/song.wav#t=${p.music.from},${p.music.to}" at="0"></audio></section>\n</body>\n</html>\n`);
  await punch(film);
  const r = await check(film);
  assert.equal(r.cuts.filter((c) => c.kind === 'off').length, 0, JSON.stringify(r.cuts));
  assert.deepEqual(r.gaps, []);
  assert.equal(r.shape.ok, true, JSON.stringify(r.shape));
  assert.equal(r.feel.ok, true, JSON.stringify(r.feel));
  assert.equal(r.lift.cut.on, true);
});

test('without a drop, check says so and asks for no punches', async () => {
  const dir = join(scratch, 'nodrop');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  lifting(join(dir, 'assets', 'song.wav'));
  /* the quieter middle only: no lift in it */
  const film = join(dir, 'film.html');
  writeFileSync(film, `<!doctype html><html><body>\n<section>${Array.from({ length: 6 }, (_, k) => `<img src="assets/p${k}.png#t=0,2" at="${k * 2}">`).join('')}</section>\n<section><audio src="assets/song.wav#t=18.25,30.25" at="0"></audio></section>\n</body></html>`);
  const r = await check(film);
  assert.equal(r.feel.drop, null);
  assert.equal(r.feel.ok, true);
  assert.ok(!r.todo.some((t) => /punch/.test(t)), r.todo.join('\n'));
});

test('the command line: plan writes its file and ends with what to do next; punch says what it wrote', () => {
  const file = join(scratch, 'song.json');
  writeFileSync(file, JSON.stringify({ file: 'song.mp3', ...song() }));
  const run = spawnSync(process.execPath, [SCRIPT, 'plan', file, '--length', '20'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /the lift at film 8 s/);
  assert.match(run.stdout.trim().split('\n').at(-1), /^NEXT: .*punch film\.html/);
  assert.ok(JSON.parse(readFileSync(join(scratch, 'song.plan.json'), 'utf8')).slots.length > 20);
});
