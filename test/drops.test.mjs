// Climaxes cut a bar before the drop: the tempo, the drop and its beat, and the plan from it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measure, pickTempo, plan, withDrop } from '../skills/beat-cut/scripts/beats.mjs';
import { grid, wav } from './synth.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'beat-cut-drops-'));
const RATE = 22050;

/** A mono 16-bit WAV from samples. */
function save(file, x) {
  const n = x.length, data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(file, data);
}

test('tempo: under 80 BPM the double wins when it scores 0.6 as much; otherwise the best', () => {
  assert.equal(pickTempo([{ bpm: 62.1, score: 0.59 }, { bpm: 123.9, score: 0.49 }, { bpm: 98.4, score: 0.4 }]), 123.9);
  assert.equal(pickTempo([{ bpm: 62.1, score: 0.59 }, { bpm: 123.9, score: 0.3 }]), 62.1);
  assert.equal(pickTempo([{ bpm: 127.9, score: 0.53 }, { bpm: 63.9, score: 0.46 }]), 127.9);
  assert.equal(pickTempo([{ bpm: 87.1, score: 0.26 }, { bpm: 173.7, score: 0.22 }]), 87.1);
  assert.equal(pickTempo([]), 120);
});

test('a drop three beats into the music is found on its beat', async () => {
  const file = join(scratch, 'early.wav');
  wav(file, grid({ bpm: 120, seconds: 30, start: 0.25 }), { seconds: 30, gain: (t) => (t < 1.75 ? 10 ** (-14 / 20) : 1) });
  const m = await measure(file);
  assert.ok(m.lift != null && Math.abs(m.lift - 1.75) < 0.03, `lift ${m.lift}`);
});

test('music cut a bar before its drop: that drop, though a bigger one comes later', async () => {
  const file = join(scratch, 'two.wav');
  wav(file, grid({ bpm: 120, seconds: 34, start: 0.25 }), { seconds: 34, gain: (t) => 10 ** ((t < 2.25 ? -10 : t >= 18.25 && t < 20.25 ? -18 : 0) / 20) });
  const m = await measure(file);
  assert.ok(m.lift != null && Math.abs(m.lift - 2.25) < 0.03, `lift ${m.lift}`);
});

test('a drop where the kick comes in though the whole barely gets louder', async () => {
  /* 120 BPM from 0.25 s: hats on every half beat throughout, loud; a kick on each beat from 4.25 s */
  const n = 24 * RATE, x = new Float32Array(n);
  let s = 3;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0.25; t < 24; t += 0.25) for (let i = 0; i < RATE * 0.06; i++) { const at = Math.round(t * RATE) + i; if (at < n) x[at] += 0.35 * noise() * Math.exp(-(i / RATE) * 50); }
  for (let t = 4.25; t < 24; t += 0.5) for (let i = 0; i < RATE * 0.25; i++) { const at = Math.round(t * RATE) + i, u = i / RATE; if (at < n) x[at] += 0.5 * Math.sin(2 * Math.PI * (45 + 60 * Math.exp(-u * 30)) * u) * Math.exp(-u * 10); }
  const file = join(scratch, 'kick-in.wav');
  save(file, x);
  const m = await measure(file);
  assert.ok(m.lift != null && Math.abs(m.lift - 4.25) < 0.03, `lift ${m.lift}`);
});

/** Kicks on every half beat (0.25 s apart), bright hits from `hits` every 0.5 s, quiet until a drop at 2.5 s. */
function offbeat(file, hits) {
  const n = 24 * RATE, x = new Float32Array(n);
  let s = 5;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const g = (t) => (t < 2.5 ? 10 ** (-14 / 20) : 1);
  for (let t = 0.25; t < 24; t += 0.25) for (let i = 0; i < RATE * 0.25; i++) { const at = Math.round(t * RATE) + i, u = i / RATE; if (at < n) x[at] += g(t) * 0.5 * Math.sin(2 * Math.PI * (45 + 60 * Math.exp(-u * 30)) * u) * Math.exp(-u * 12); }
  for (let t = hits; t < 24; t += 0.5) for (let i = 0; i < RATE * 0.08; i++) { const at = Math.round(t * RATE) + i; if (at < n) x[at] += g(t) * 0.5 * noise() * Math.exp(-(i / RATE) * 40); }
  save(file, x);
}

test('a line on the off beat, shown by a drop on its half beat with the kick as strong there, moves half a beat', async () => {
  const file = join(scratch, 'offbeat.wav');
  /* the bright hits on 0.25, 0.75 …: the line follows them, and the drop at 2.5 s is on its half beat */
  offbeat(file, 0.25);
  const m = await measure(file);
  assert.equal(m.grid.shifted, true, JSON.stringify(m.grid));
  assert.ok(Math.abs(m.beats[1] - 0.5) < 0.01, JSON.stringify(m.beats.slice(0, 3)));
  assert.ok(Math.abs(m.liftBeat - 2.5) < 0.01, `liftBeat ${m.liftBeat}`);
  /* positive control: hits on 0.5, 1 …, the drop already on a beat */
  offbeat(file, 0.5);
  const right = await measure(file);
  assert.ok(!right.grid.shifted && Math.abs(right.liftBeat - 2.5) < 0.01, JSON.stringify(right.grid));
});

test('the drop for planning: a lift between beats goes to the nearest beat, the later one when even; bars count from it', () => {
  const beats = Array.from({ length: 40 }, (_, k) => 0.2 + k * 0.5);
  const base = { bpm: 120, meter: 4, beats, bars: beats.filter((_, k) => k % 4 === 1), sections: [{ start: 0.2, end: 20, level: 'loud' }], duration: 20 };
  const even = withDrop({ ...base, lift: 2.45 });
  assert.equal(even.lift, 2.7);
  assert.ok(even.bars.includes(2.7) && even.bars.includes(4.7) && !even.bars.includes(2.2), JSON.stringify(even.bars.slice(0, 4)));
  assert.equal(withDrop({ ...base, lift: 2.3 }).lift, 2.2);
  /* on a beat and a bar already: unchanged */
  const on = { ...base, lift: 2.7 };
  assert.equal(withDrop(on), on);
});

test('plan: music that starts a bar before the drop rushes into it from the first beat', () => {
  const beats = Array.from({ length: 70 }, (_, k) => 0.25 + k * 0.5);
  const m = {
    bpm: 120, meter: 4, beats, bars: beats.filter((_, k) => k % 4 === 0), accents: [],
    sections: [{ start: 0.25, end: 35, level: 'loud' }], lift: 2.25, sound: { start: 0.2, end: 35 }, duration: 35.2,
  };
  const p = plan(m, { length: 20 });
  assert.equal(p.music.from, 0.25);
  assert.deepEqual(p.slots.slice(0, 5).map((s) => [s.at, s.length, s.role]), [[0, 1, 'build'], [1, 0.5, 'rush'], [1.5, 0.25, 'rush'], [1.75, 0.25, 'rush'], [2, 0.5, 'drop']]);
  assert.ok(p.slots[4].lift && p.slots[4].fx.some((f) => f.kind === 'flash'));
});
