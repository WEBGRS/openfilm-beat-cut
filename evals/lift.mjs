#!/usr/bin/env node
// The second a piece of music steps up the most: node evals/lift.mjs <music> [--after 20]
// The rise of the level over half a second against the half second before it, greatest, in 10 ms steps. It does not use beats.mjs.
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
const i = process.argv.indexOf('--after');
const after = i < 0 ? 20 : +process.argv[i + 1];
const RATE = 22050;
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length >> 2);
// Cumulative energy, so any stretch's level is two lookups
const sum = new Float64Array(x.length + 1);
for (let k = 0; k < x.length; k++) sum[k + 1] = sum[k] + x[k] * x[k];
const win = Math.round(0.5 * RATE);
const level = (a) => 10 * Math.log10((sum[Math.min(x.length, a + win)] - sum[Math.max(0, a)]) / win + 1e-12);
let best = -Infinity, at = 0;
for (let t = after; t * RATE + win < x.length; t += 0.01) {
  const a = Math.round(t * RATE);
  const up = level(a) - level(a - win);
  if (up > best) { best = up; at = t; }
}
console.log(`${at.toFixed(2)} s, a rise of ${best.toFixed(1)} dB`);
