// Test music with a known grid: a kick on each bar's first beat, a snare-like noise on the others, a soft pad.
import { writeFileSync } from 'node:fs';

const RATE = 22050;

/** Beat times for a tempo going from `bpm` to `end` over `seconds`, the first at `start`, each moved by up to `jitter` s. */
export function grid({ bpm, end = bpm, seconds, start = 0, jitter = 0, seed = 1 }) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const beats = [];
  for (let t = start; t < seconds - 0.2;) {
    beats.push(Math.max(0, t + jitter * rand()));
    const now = bpm + ((end - bpm) * t) / seconds;
    t += 60 / now;
  }
  return beats;
}

/**
 * A mono 16-bit WAV of those beats, a kick every `meter` beats from the first, written to `file`; `gain(t)` scales the
 * sound at second t (1 throughout unless given).
 */
export function wav(file, beats, { seconds, meter = 4, pad = true, gain = null } = {}) {
  const n = Math.round(seconds * RATE);
  const x = new Float32Array(n);
  let s = 7;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  beats.forEach((b, k) => {
    const at = Math.round(b * RATE);
    const kick = k % meter === 0;
    for (let i = 0; i < RATE * 0.25 && at + i < n; i++) {
      const t = i / RATE;
      x[at + i] += kick
        ? 0.8 * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t * 30)) * t) * Math.exp(-t * 12)
        : 0.3 * noise() * Math.exp(-t * 40);
    }
  });
  /* a chord held under it, changing every bar */
  if (pad) {
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [165, 208, 247]];
    for (let k = 0; k < beats.length; k += meter) {
      const a = Math.round(beats[k] * RATE), z = Math.round((beats[k + meter] ?? seconds) * RATE);
      const notes = chords[(k / meter) % chords.length];
      for (let i = a; i < z && i < n; i++) for (const f of notes) x[i] += 0.03 * Math.sin((2 * Math.PI * f * (i - a)) / RATE);
    }
  }
  if (gain) for (let i = 0; i < n; i++) x[i] *= gain(i / RATE);
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(file, data);
}

/** F-measure of `got` against `want`, each within `tol` seconds. */
export function fmeasure(got, want, tol = 0.07) {
  const used = new Set();
  let hit = 0;
  for (const g of got) {
    let best = -1;
    want.forEach((w, k) => { if (!used.has(k) && Math.abs(w - g) <= tol && (best < 0 || Math.abs(w - g) < Math.abs(want[best] - g))) best = k; });
    if (best >= 0) { used.add(best); hit++; }
  }
  const p = hit / (got.length || 1), r = hit / (want.length || 1);
  return p + r ? (2 * p * r) / (p + r) : 0;
}
