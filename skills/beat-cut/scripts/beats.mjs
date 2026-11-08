#!/usr/bin/env node
// @ts-check
/**
 * A piece of music measured for cutting a film on it, and a film's cuts measured against it.
 *
 *   node beats.mjs <music> [--out <dir>] [--meter 4] [--bpm <n>] [--bar <seconds>]
 *       writes <out>/<name>.json and <name>.html (out: ./beats): the tempo, every beat, the bars' first beats, the
 *       hits that stand out, how loud each stretch is and where the music lifts. --bpm sets the tempo and --bar a
 *       second that is a bar's first beat, when they are known (from the music's source, or by listening)
 *   node beats.mjs plan <beats.json> [--length <film s>] [--from <music s>] [--to <music s>] [--json]
 *       a 卡点 plan, written to <beats>.plan.json: the stretch of music and the shots on it, each with what `punch` adds
 *   node beats.mjs punch [film.html] [--music <clip id or file>] [--dry]
 *       zoom punches, flashes, shakes and slow pushes by the music under each clip, as CSS animation in film.html
 *   node beats.mjs snap <beats.json> <seconds…> [--to beat|half|bar|hit]
 *       the nearest beat (half beat, bar, hit) to each music second
 *   node beats.mjs check [film.html] [--music <clip id or file>] [--fps 30] [--out <dir>] [--json] [--strict]
 *       every picture cut of the film, in frames from the music's nearest beat, and whether it is on a beat, a half
 *       beat or a hit; stretches with no picture (GAP), clips over each other on a track (OVERLAP), clips trimmed past
 *       their file's end (PAST END); the pace (shots and their mean length in each of the music's sections) and the
 *       shape (quiet parts' shots against loud parts', cuts a bar against each bar's level), where the film enters and
 *       leaves the music and how many bars it starts before the lift, runs of four or more shots of one length (WARN),
 *       what starts at the lift, and, of the render beside film.html if there is one, black bars in the picture and frames of
 *       black inside the film (from the clip's file, or drawn black where the file has picture). It ends
 *       with TO DO, what is left to fix. --strict exits 1 on a cut off the beat, a GAP, a PAST END, a shape that does
 *       not follow the music, black bars or a black frame inside the film
 *
 * The measure, format "openfilm-beats/1", every time in the music file's own seconds:
 *   { format, file, duration, bpm, meter, barSure, barBy, steady, tempos: [{ bpm, score }], grid, beats, bars, hits: [{ t, strength, onBeat }], accents: [{ t, half, strength }],
 *     sound: { start, end }, loudness: [{ start, end, db }], sections: [{ start, end, level }], lift, liftBeat }
 * `grid` says whether the music keeps one tempo ({ regular: true, bpm, share, moved, worst, between }): then `beats` is
 * the straight line its attacks sit on, and `moved` beats the tracker had put off it (by up to `worst` frames at 30 fps,
 * between those seconds) are on it; else { regular: false, share } and `beats` are the tracker's. `beats` and `bars` are
 * seconds (bars: the first beat of each bar). `barBy` says where the bars come from: the kick and the harmony ('kick', `barSure` how sure), the lift's beat when those are a guess ('lift'), or --bar ('told'). `steady` (0–1) says how clearly the music keeps a
 * beat: under 0.25 there is little to cut on, and the hits are the better marks. `loudness` is each bar's level in dB
 * under the loudest bar; `sections` group bars of a like level (quiet, mid, loud), a stretch that swings between quiet
 * and mid bars named by its mean; `lift` is the bar where the music rises most, or null. `liftBeat` is the beat where it
 * rises most a bar either side, found without the bars (so it can say where a bar starts when `barSure` is low; `lift`
 * cannot, being one of the bars).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORMAT = 'openfilm-beats/1';
const RATE = 22050;
const SIZE = 1024;
const HOP = 256;
const FPS = RATE / HOP;
/** Tempos looked for, in beats a minute. */
const SLOWEST = 50;
const FASTEST = 220;
const round = (/** @type {number} */ t) => Math.round(t * 1000) / 1000;

/** Run a program; resolves with its stdout. */
function run(/** @type {string} */ cmd, /** @type {string[]} */ args, binary = false) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const out = [];
    let err = '';
    p.stdout.on('data', (b) => out.push(b));
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(binary ? Buffer.concat(out) : Buffer.concat(out).toString('utf8')) : fail(new Error(`${cmd}: ${err.trim().split('\n').slice(-3).join(' ')}`))));
  });
}

/** The file's sound, one channel at RATE. @returns {Promise<Float32Array>} */
export async function decode(/** @type {string} */ file) {
  const out = /** @type {Buffer} */ (await run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], true));
  const bytes = new Uint8Array(out.length - (out.length % 4));
  bytes.set(out.subarray(0, bytes.length));
  return new Float32Array(bytes.buffer);
}

/** In-place FFT of a power-of-two length. */
function fft(/** @type {Float64Array} */ re, /** @type {Float64Array} */ im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(step * k), s = Math.sin(step * k);
        const a = i + k, b = a + len / 2;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** Bands spaced by pitch, 40 Hz to 10 kHz: each its first and last FFT bin. */
const BANDS = (() => {
  const count = 40, lo = Math.log(40), hi = Math.log(10000);
  /** @type {{ from: number, to: number, hz: number }[]} */
  const bands = [];
  for (let b = 0; b < count; b++) {
    const f0 = Math.exp(lo + ((hi - lo) * b) / count), f1 = Math.exp(lo + ((hi - lo) * (b + 1)) / count);
    const from = Math.max(1, Math.floor((f0 * SIZE) / RATE)), to = Math.max(from, Math.ceil((f1 * SIZE) / RATE) - 1);
    bands.push({ from, to, hz: Math.sqrt(f0 * f1) });
  }
  return bands;
})();
/** The kick drum's and the bass's bands. */
const LOW = BANDS.filter((b) => b.hz < 160).length;

/**
 * Frame by frame (FPS a second, each centred on its time): the rise in every band (the onset strength), the same in
 * the low bands, the level of each band (dB), and the frame's loudness (RMS dB).
 */
export function envelopes(/** @type {Float32Array} */ pcm) {
  const frames = Math.max(1, Math.ceil(pcm.length / HOP));
  const win = new Float64Array(SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE));
  const re = new Float64Array(SIZE), im = new Float64Array(SIZE);
  const level = Array.from({ length: frames }, () => new Float64Array(BANDS.length));
  const rms = new Float64Array(frames);
  let top = -Infinity;
  for (let f = 0; f < frames; f++) {
    const c = f * HOP - SIZE / 2;
    let sum = 0;
    for (let i = 0; i < SIZE; i++) {
      const x = c + i >= 0 && c + i < pcm.length ? pcm[c + i] : 0;
      re[i] = x * win[i]; im[i] = 0;
      sum += x * x;
    }
    rms[f] = 10 * Math.log10(sum / SIZE + 1e-12);
    fft(re, im);
    BANDS.forEach((band, b) => {
      let e = 0;
      for (let k = band.from; k <= band.to; k++) e += re[k] * re[k] + im[k] * im[k];
      const db = 10 * Math.log10(e / (band.to - band.from + 1) + 1e-12);
      level[f][b] = db;
      if (db > top) top = db;
    });
  }
  /* 80 dB under the loudest band is silence */
  for (const row of level) for (let b = 0; b < row.length; b++) row[b] = Math.max(row[b], top - 80);
  const onset = new Float64Array(frames), low = new Float64Array(frames);
  for (let f = 1; f < frames; f++) {
    for (let b = 0; b < BANDS.length; b++) {
      const rise = Math.max(0, level[f][b] - level[f - 1][b]);
      onset[f] += rise;
      if (b < LOW) low[f] += rise;
    }
  }
  return { onset: normal(onset), low: normal(low), level, rms };
}

/** Divided by its spread, so a song's loudness does not matter. */
function normal(/** @type {Float64Array} */ x) {
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length) || 1;
  return x.map((v) => v / sd);
}

/** How alike the onset strength is with itself a lag later, for every lag of a tempo looked for. */
function tempoScores(/** @type {Float64Array} */ onset) {
  const mean = onset.reduce((a, b) => a + b, 0) / onset.length;
  const x = onset.map((v) => v - mean);
  const zero = x.reduce((a, b) => a + b * b, 0) || 1;
  const longest = Math.ceil((FPS * 60) / SLOWEST) * 2 + 2;
  const ac = new Float64Array(longest + 1);
  for (let lag = 1; lag <= longest; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    ac[lag] = s / zero;
  }
  return ac;
}

/** The likeliest tempo (and the others worth naming), weighted toward 120 BPM, an octave either side. */
function findTempo(/** @type {Float64Array} */ ac) {
  /** @type {{ lag: number, bpm: number, raw: number, score: number }[]} */
  const peaks = [];
  const from = Math.floor((FPS * 60) / FASTEST), to = Math.ceil((FPS * 60) / SLOWEST);
  for (let lag = from; lag <= to; lag++) {
    if (!(ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1]) || ac[lag] <= 0) continue;
    /* between frames: the top of a parabola through the three */
    const d = ac[lag - 1] - 2 * ac[lag] + ac[lag + 1];
    const exact = d < 0 ? lag + (0.5 * (ac[lag - 1] - ac[lag + 1])) / d : lag;
    const bpm = (FPS * 60) / exact;
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    /* a beat comes back two beats later too */
    const twice = ac[Math.round(exact * 2)] ?? 0;
    peaks.push({ lag: exact, bpm, raw: ac[lag], score: (ac[lag] + 0.5 * Math.max(0, twice)) * prior });
  }
  peaks.sort((a, b) => b.score - a.score);
  return peaks;
}

/**
 * The tempo to cut on, of the scored tempos: the best, unless it is under 80 BPM and its double scores at least 0.6
 * as much; then the double, the pulse a cut follows (a half-time feel is still felt at the double).
 * @param {{ bpm: number, score: number }[]} peaks
 */
export function pickTempo(peaks) {
  if (!peaks.length) return 120;
  const top = peaks[0];
  const double = top.bpm < SLOW ? peaks.find((p) => Math.abs(p.bpm / (2 * top.bpm) - 1) < 0.03 && p.score >= DOUBLE * top.score) : undefined;
  return (double ?? top).bpm;
}
/** The beats, by dynamic programming (Ellis 2007): on strong onsets, a period apart, give or take. */
function trackBeats(/** @type {Float64Array} */ onset, /** @type {number} */ period, tightness = 800) {
  const n = onset.length;
  /* each onset spread a little, so a beat may sit a frame or two off it */
  const spread = Math.max(1, period / 32);
  const half = Math.ceil(spread * 4);
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) if (i + k >= 0 && i + k < n) s += onset[i + k] * Math.exp(-0.5 * (k / spread) ** 2);
    local[i] = s;
  }
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  const near = Math.round(period / 2), far = Math.round(period * 2);
  for (let i = 0; i < n; i++) {
    let best = -Infinity, arg = -1;
    for (let prev = i - far; prev <= i - near; prev++) {
      if (prev < 0) continue;
      const s = score[prev] - tightness * Math.log((i - prev) / period) ** 2;
      if (s > best) { best = s; arg = prev; }
    }
    /* a beat with nothing worth following before it starts the beats afresh */
    score[i] = local[i] + (arg >= 0 && best > 0 ? best : 0);
    back[i] = best > 0 ? arg : -1;
  }
  /* the last beat: the last top of the running score that is well up among the others */
  const tops = [];
  for (let i = 1; i < n - 1; i++) if (score[i] > score[i - 1] && score[i] >= score[i + 1]) tops.push(i);
  if (!tops.length) return [];
  const sorted = tops.map((i) => score[i]).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let last = tops[tops.length - 1];
  for (let k = tops.length - 1; k >= 0; k--) if (score[tops[k]] >= 0.5 * median) { last = tops[k]; break; }
  const beats = [];
  for (let i = last; i >= 0; i = back[i]) beats.unshift(i);
  /* no beats in the silence before the music or after it */
  const w = beats.map((b) => local[b]);
  const smooth = w.map((_, k) => {
    let s = 0, n = 0;
    [-2, -1, 0, 1, 2].forEach((d, j) => { if (w[k + d] != null) { s += w[k + d] * [0.25, 0.75, 1, 0.75, 0.25][j]; n += [0.25, 0.75, 1, 0.75, 0.25][j]; } });
    return s / n;
  });
  const bar = 0.5 * Math.sqrt(smooth.reduce((a, b) => a + b * b, 0) / (smooth.length || 1));
  let a = 0, z = beats.length;
  while (a < z && smooth[a] < bar) a++;
  while (z > a && smooth[z - 1] < bar) z--;
  return beats.slice(a, z);
}

/** A frame moved to the onset's top within two frames, between frames. */
function onPeak(/** @type {Float64Array} */ onset, /** @type {number} */ f) {
  let best = f;
  for (let k = Math.max(1, f - 2); k <= Math.min(onset.length - 2, f + 2); k++) if (onset[k] > onset[best]) best = k;
  const d = (onset[best - 1] ?? 0) - 2 * onset[best] + (onset[best + 1] ?? 0);
  return d < 0 ? best + (0.5 * ((onset[best - 1] ?? 0) - (onset[best + 1] ?? 0))) / d : best;
}

/** An envelope blurred by a Gaussian of `sigma` frames. */
function blur(/** @type {Float64Array} */ x, /** @type {number} */ sigma) {
  const half = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * half + 1 }, (_, i) => Math.exp(-0.5 * ((i - half) / sigma) ** 2));
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let k = Math.max(-half, -i); k <= half && i + k < x.length; k++) s += x[i + k] * w[k + half];
    out[i] = s;
  }
  return out;
}

/** An envelope's value between frames. */
const valueAt = (/** @type {Float64Array} */ x, /** @type {number} */ f) => {
  const i = Math.floor(f);
  return i < 0 || i + 1 >= x.length ? 0 : x[i] + (x[i + 1] - x[i]) * (f - i);
};

/** The envelope's onset reads this early on a kick of known time (seconds): added to every beat of the line. */
const EARLY = 0.01;
/** A stretch of music keeps the line when its attacks sit this near it (seconds), the beat or half a beat from it. */
const NEAR = 0.025;
/** Beats in a stretch tested against the line, and the share of the stretches that must keep it. */
const STRETCH = 16;
const KEEP = 0.85;
/** The quiet parts' shots must be this many times as long as the loud parts', and cuts a bar this correlated with the level. */
const SLOWER = 1.5;
/** Bars from the kick and the harmony are a guess under this sure. */
const GUESS = 0.2;
const FOLLOWS = 0.3;
/** Of a drop's beats, the share a cut or a punch should mark. */
const MARKED = 0.75;
/** A tempo under SLOW gives way to its double when the double scores DOUBLE as much or more. */
const SLOW = 80;
const DOUBLE = 0.6;
/** The lift: a beat's level plus BASS times its bass level steps up by RISE dB (medians of a bar either side). */
const BASS = 0.5;
const RISE = 4.5;
const EARLIER = 0.5;
/** A line whose drop is on its half beat moves half a beat when the kick on the half beats is this much of the kick on the beats. */
const OFFBEAT = 0.8;

/**
 * Whether the music keeps one tempo, as a straight line of beats (a period and a first beat) that its attacks sit on
 * best between `from` and `to`, searched within 3% of `period`. The music keeps it when nearly all of its stretches
 * (16 beats, each with a pulse worth the name) have their strongest attacks on the line or on its half beats. Music
 * played by hand or slowing down does not, and its beats are left as the tracker found them.
 */
function straightLine(/** @type {Float64Array} */ env, /** @type {Float64Array} */ low, /** @type {number} */ period, /** @type {number} */ from, /** @type {number} */ to) {
  const sum = (/** @type {number} */ p, /** @type {number} */ t0, last = to) => {
    let s = 0;
    for (let t = t0; t <= last + 1e-9; t += p) s += valueAt(env, t * FPS);
    return s;
  };
  let best = { s: -Infinity, p: period, t0: from };
  const search = (/** @type {number} */ p0, /** @type {number} */ pw, /** @type {number} */ dp, /** @type {number} */ c0, /** @type {number} */ cw, /** @type {number} */ d0) => {
    for (let p = p0 - pw; p <= p0 + pw + 1e-12; p += dp) {
      for (let t0 = c0 - cw; t0 <= c0 + cw + 1e-12; t0 += d0) {
        const s = sum(p, t0);
        if (s > best.s) best = { s, p, t0 };
      }
    }
  };
  search(period, period * 0.03, period * 0.0001, from, period / 2, 0.5 / FPS);
  search(best.p, period * 0.0003, period * 0.00002, best.t0, 1 / FPS, 0.1 / FPS);
  const { p, t0 } = best;
  /* the first beat of the line, none more than a frame before `from`; the beat is the kick's, not the off beat's, where the bass says so */
  let first = t0 + Math.ceil((from - 0.04 - t0) / p) * p;
  const kick = (/** @type {number} */ f) => { let s = 0; for (let t = f; t <= to + 1e-9; t += p) s += valueAt(low, t * FPS); return s; };
  if (kick(first + p / 2) > 1.2 * kick(first)) first += p / 2;
  const count = Math.floor((to + 0.04 - first) / p) + 1;
  /* each stretch: where its attacks sit best, and how much better than anywhere in the beat */
  let voters = 0, keep = 0;
  for (let a = 0; a + STRETCH <= count; a += STRETCH / 2) {
    let top = -Infinity, arg = 0, all = 0, n = 0;
    for (let d = -p / 2; d < p / 2; d += 0.004) {
      const s = sum(p, first + a * p + d, first + (a + STRETCH - 1) * p + d + 1e-9);
      all += s; n++;
      if (s > top) { top = s; arg = d; }
    }
    if (top < 1.5 * (all / n)) continue;
    voters++;
    /* the line or its half beats */
    const off = ((((arg + p / 4) % (p / 2)) + p / 2) % (p / 2)) - p / 4;
    if (Math.abs(off) <= NEAR) keep++;
  }
  return { period: p, first, count, voters, share: voters ? keep / voters : 0 };
}

/** Which beat of each bar is its first: the one with the most kick and bass, and where the harmony changes. */
function barStart(/** @type {number[]} */ beats, /** @type {ReturnType<typeof envelopes>} */ env, /** @type {number} */ meter) {
  if (beats.length < meter * 2) return { phase: 0, sure: 0 };
  const kick = beats.map((b) => Math.max(...[-2, -1, 0, 1, 2].map((d) => env.low[b + d] ?? 0)));
  /* each beat's mean spectrum above the bass, and how far it is from the beat before */
  const mean = beats.map((b, k) => {
    const end = beats[k + 1] ?? b + (b - (beats[k - 1] ?? b - 1));
    const v = new Float64Array(BANDS.length - LOW);
    for (let f = b; f < end && f < env.level.length; f++) for (let j = 0; j < v.length; j++) v[j] += env.level[f][LOW + j];
    return v;
  });
  /* the harmony changes by the bar: a bar's mean spectrum against the bar before */
  const sumOf = (/** @type {number} */ a, /** @type {number} */ z) => {
    const v = new Float64Array(BANDS.length - LOW);
    for (let k = Math.max(0, a); k < Math.min(mean.length, z); k++) for (let j = 0; j < v.length; j++) v[j] += mean[k][j];
    return v;
  };
  const change = mean.map((_, k) => {
    if (k < meter || k + meter > mean.length) return 0;
    const v = sumOf(k, k + meter), u = sumOf(k - meter, k);
    let dot = 0, a = 0, b = 0;
    const mv = avg(v), mu = avg(u);
    for (let j = 0; j < v.length; j++) { const x = v[j] - mv, y = u[j] - mu; dot += x * y; a += x * x; b += y * y; }
    return 1 - dot / (Math.sqrt(a * b) || 1);
  });
  const accent = beats.map((b) => Math.max(...[-2, -1, 0, 1, 2].map((d) => env.onset[b + d] ?? 0)));
  const scale = (/** @type {number[]} */ x) => { const m = x.reduce((s, v) => s + v, 0) / x.length || 1; return x.map((v) => v / m); };
  const k1 = scale(kick), c1 = scale(change), a1 = scale(accent);
  const totals = Array.from({ length: meter }, (_, p) => {
    let s = 0, n = 0;
    for (let k = p; k < beats.length; k += meter) { s += k1[k] + W.change * c1[k] + W.accent * a1[k]; n++; }
    /* most music starts on a bar's first beat */
    return s / (n || 1) + (p === 0 ? W.first : 0);
  });
  const order = totals.map((s, p) => [s, p]).sort((a, b) => b[0] - a[0]);
  return { phase: order[0][1], sure: (order[0][0] - order[1][0]) / (order[0][0] || 1) };
}
/**
 * The second the level steps up within `reach` of `at`: the rise of an 80 ms stretch over the 80 ms before it,
 * greatest; an attack is that step, which a held or slow change is not.
 */
function stepUp(/** @type {Float32Array} */ pcm, /** @type {number} */ at, /** @type {number} */ reach, keep = false) {
  const win = Math.round(0.08 * RATE);
  const level = (/** @type {number} */ a) => {
    let s = 0;
    for (let i = Math.max(0, a); i < Math.min(pcm.length, a + win); i++) s += pcm[i] * pcm[i];
    return 10 * Math.log10(s / win + 1e-12);
  };
  /* the rise is the same from the first window that holds the whole attack to the last that has not started to count it in the 80 ms before: the step is at the end of that stretch */
  const rises = [];
  for (let t = at - reach; t <= at + reach; t += 0.005) {
    const a = Math.round(t * RATE);
    rises.push({ t, up: level(a) - level(a - win) });
  }
  const best = Math.max(...rises.map((r) => r.up));
  /* the beat itself, when it steps up nearly as much (a drop on its beat) */
  if (keep) { const a = Math.round(at * RATE); for (const d of [0, 0.01, 0.02, 0.03]) if (level(a + Math.round(d * RATE)) - level(a + Math.round(d * RATE) - win) >= best - 1.5) return at; }
  return /** @type {number} */ (rises.findLast((r) => r.up >= best - 0.5)?.t);
}
const median = (/** @type {number[]} */ v) => { const s = [...v].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const avg = (/** @type {Float64Array} */ v) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
/** How much the harmony's change, the beat's accent and being the music's first beat count against the kick. */
const W = { change: 1, accent: 0.5, first: 0.2 };

/**
 * The music measured. @param {string} file
 * @param {{ meter?: number, bpm?: number, bar?: number }} [o] `bar`: a second known to be a bar's first beat
 */
export async function measure(file, o = {}) {
  const meter = o.meter ?? 4;
  const pcm = await decode(file);
  const duration = pcm.length / RATE;
  const env = envelopes(pcm);
  const ac = tempoScores(env.onset);
  const peaks = findTempo(ac);
  const chosen = o.bpm ?? pickTempo(peaks);
  const steady = Math.max(0, Math.min(1, peaks[0]?.raw ?? 0));
  const frames = trackBeats(env.onset, (FPS * 60) / chosen);
  let beats = frames.map((f) => round((onPeak(env.onset, f) * HOP) / RATE));
  /* the tempo the beats keep, from their spacing */
  const gaps = beats.slice(1).map((b, k) => b - beats[k]).sort((a, b) => a - b);
  let bpm = gaps.length ? Math.round((600 / gaps[Math.floor(gaps.length / 2)])) / 10 : chosen;
  /* music that keeps one tempo has its beats on a straight line: the tracker drifts off it where the attacks are weak */
  /** @type {{ regular: boolean, share: number, bpm?: number, moved?: number, worst?: number, between?: number[] } | null} */
  let grid = null;
  if (beats.length >= STRETCH) {
    const mix = blur(env.onset.map((v, i) => v + env.low[i]), 1.2);
    const line = straightLine(mix, blur(env.low, 1.2), 60 / bpm, beats[0], /** @type {number} */ (beats.at(-1)));
    if (line.voters >= 3 && line.share >= KEEP) {
      const lined = Array.from({ length: line.count }, (_, k) => round(line.first + k * line.period + EARLY));
      const inside = beats.filter((b) => b >= lined[0] - 0.04 && b <= /** @type {number} */ (lined.at(-1)) + 0.04);
      const off = inside.map((b) => lined.reduce((d, x) => Math.min(d, Math.abs(x - b)), Infinity));
      const moved = inside.filter((_, k) => off[k] > 1 / 30);
      grid = {
        regular: true, share: Math.round(line.share * 100) / 100, bpm: Math.round(6000 / line.period) / 100, moved: moved.length,
        worst: Math.round(Math.max(0, ...off) * 30 * 10) / 10, between: moved.length ? [moved[0], moved.at(-1)] : undefined,
      };
      beats = lined;
      bpm = Math.round(/** @type {number} */ (grid.bpm) * 10) / 10;
    } else grid = { regular: false, share: Math.round(line.share * 100) / 100 };
  }
  /* the same rise beat by beat, a bar's worth either side: found without the bars, so it can say where one starts.
     A beat's level and half its bass level: a drop where the kick and bass come back steps up there though the whole
     barely does */
  const beatLevel = beats.map((b, k) => {
    const a = Math.floor(b * RATE), z = Math.min(pcm.length, Math.floor((beats[k + 1] ?? b + 60 / bpm) * RATE));
    let s = 0;
    for (let i = a; i < z; i++) s += pcm[i] * pcm[i];
    return 10 * Math.log10(s / Math.max(1, z - a) + 1e-12);
  });
  const beatBass = beats.map((b, k) => {
    const a = Math.floor(b * FPS), z = Math.min(env.level.length, Math.max(a + 1, Math.floor((beats[k + 1] ?? b + 60 / bpm) * FPS)));
    let s = 0, n = 0;
    for (let f = a; f < z; f++) for (let j = 0; j < LOW; j++) { s += 10 ** (env.level[f][j] / 10); n++; }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-12);
  });
  const beatDb = beatLevel.map((l, k) => l + BASS * beatBass[k]);
  /* a beat's rise: the bar it starts over the bar before (medians, so a fill does not take it); three beats of history
     are enough, as a song cut a bar before its drop has no more. `held`: the two bars it starts over the bar before */
  const before = (/** @type {number} */ k) => median(beatDb.slice(k - Math.min(meter, k), k));
  const ups = beatDb.map((_, k) => (Math.min(meter, k) >= 3 && k + meter <= beatDb.length ? median(beatDb.slice(k, k + meter)) - before(k) : -Infinity));
  const held = (/** @type {number} */ k) => median(beatDb.slice(k, k + 2 * meter)) - before(k);
  /** @type {number | null} */
  let near = null;
  const most = ups.reduce((b, u, k) => (u > ups[b] ? k : b), 0);
  if (ups[most] > RISE) {
    /* of the beats that rise about as much, the one with the biggest jump from the beat before it */
    const jump = (/** @type {number} */ k) => beatDb[k] - (beatDb[k - 1] ?? beatDb[k]);
    const rising = ups.map((u, k) => k).filter((k) => ups[k] >= ups[most] - 2);
    const biggest = Math.max(...rising.map(jump));
    let at = /** @type {number} */ (rising.find((k) => jump(k) >= biggest - 0.5));
    /* music cut to start a bar or two before a drop: that drop, when it rises EARLIER as much, holds two bars and is not the way up to a bigger step, though a bigger one comes later */
    const first = ups.findIndex((u, k) => k <= 2 * meter && k < at - 2 * meter && u > RISE && u >= EARLIER * ups[most] && held(k) > RISE && !ups.slice(k + 1, k + 1 + 2 * meter).some((v) => v > u));
    /* and of the bar from it, the beat with the biggest jump */
    if (first >= 0) at = [0, 1, 2, 3].map((d) => first + d).filter((k) => ups[k] >= ups[first] - 2).reduce((b, k) => (jump(k) > jump(b) ? k : b), first);
    near = beats[at];
  }
  /* the second the level steps up, within a beat of that: on a beat or a half beat when it is within a frame of one */
  /** @type {number | null} */
  let liftAt = null;
  /** @type {number | null} */
  let liftBeat = null;
  if (near != null) {
    const found = stepUp(pcm, near, 0.55 * 60 / bpm, true);
    const marks = beats.flatMap((b, k) => [b, ...(beats[k + 1] != null ? [(b + beats[k + 1]) / 2] : [])]);
    const closest = marks.reduce((best, t) => (Math.abs(t - found) < Math.abs(best - found) ? t : best), marks[0]);
    liftAt = round(Math.abs(closest - found) <= 1 / 30 ? closest : found);
    liftBeat = beats.find((b) => Math.abs(b - /** @type {number} */ (liftAt)) <= 1 / 30) ?? null;
    /* a drop on a straight line's half beat, where the kick is as strong on the half beats as on the beats: the line
       followed the off beat, and moves half a beat. Where the kick says the beats are right, the lift stays on the half beat */
    if (grid?.regular && liftBeat == null && Math.abs(closest - liftAt) < 1e-3 && !o.bar) {
      const p = 60 / bpm, low = blur(env.low, 1.2);
      const kickOn = (/** @type {number[]} */ ts) => ts.reduce((s, t) => s + valueAt(low, t * FPS), 0) / (ts.length || 1);
      if (kickOn(beats.map((b) => b + p / 2)) >= OFFBEAT * kickOn(beats)) {
        beats = [...(beats[0] - p / 2 >= 0 ? [round(beats[0] - p / 2)] : []), ...beats.map((b) => round(b + p / 2))].filter((b) => b <= duration);
        grid.shifted = true;
        liftBeat = beats.find((b) => Math.abs(b - /** @type {number} */ (liftAt)) <= 1 / 30) ?? null;
      }
    }
  }
  const known = o.bar != null && beats.length ? beats.reduce((best, b, k) => (Math.abs(b - /** @type {number} */ (o.bar)) < Math.abs(beats[best] - /** @type {number} */ (o.bar)) ? k : best), 0) : -1;
  const barAt = grid?.regular ? beats.map((b) => Math.round((b * RATE) / HOP)) : frames;
  let { phase, sure } = known >= 0 ? { phase: known % meter, sure: 1 } : barStart(barAt, env, meter);
  /* bars from the person, from the kick and the harmony, or, when those are a guess, from the lift: it nearly always starts a bar */
  let barBy = known >= 0 ? 'told' : 'kick';
  if (known < 0 && sure < GUESS && liftBeat != null) { phase = beats.indexOf(liftBeat) % meter; barBy = 'lift'; }
  const bars = beats.filter((_, k) => k % meter === phase);

  /* hits: onsets that stand out from those around them (3 s either side), one every 4 s at most on average */
  const mean = avg(env.onset), sd = Math.sqrt(env.onset.reduce((a, v) => a + (v - mean) ** 2, 0) / env.onset.length);
  const reach = Math.round(FPS * 0.1), around = Math.round(FPS * 3);
  const loudest = Math.max(...env.onset);
  const tops = [];
  for (let f = 1; f < env.onset.length - 1; f++) {
    const v = env.onset[f];
    if (v < mean + sd) continue;
    let top = true;
    for (let k = Math.max(0, f - reach); k <= Math.min(env.onset.length - 1, f + reach) && top; k++) if (env.onset[k] > v || (env.onset[k] === v && k < f)) top = false;
    if (top) tops.push(f);
  }
  const standing = tops.filter((f) => {
    const near = tops.filter((g) => g !== f && Math.abs(g - f) <= around).map((g) => env.onset[g]).sort((a, b) => a - b);
    const median = near.length ? near[Math.floor(near.length / 2)] : 0;
    return env.onset[f] >= Math.max(mean + 2 * sd, 1.5 * median);
  }).sort((a, b) => env.onset[b] - env.onset[a]).slice(0, Math.max(1, Math.round(duration / 4))).sort((a, b) => a - b);
  const hits = standing.map((f) => {
    const t = round((onPeak(env.onset, f) * HOP) / RATE);
    return { t, strength: Math.round((env.onset[f] / loudest) * 100) / 100, onBeat: beats.some((b) => Math.abs(b - t) <= 0.05) };
  });

  /* accents: the attack on every beat and half beat (kick, snare, clap), against the strongest such attacks */
  const accents = accentsOf(env, beats);

  /* where there is sound at all: 40 dB under the loudest frame */
  const peak = Math.max(...env.rms);
  const heard = [...env.rms.keys()].filter((f) => env.rms[f] > peak - 40);
  const sound = { start: round(((heard[0] ?? 0) * HOP) / RATE), end: round(Math.min(duration, ((heard.at(-1) ?? 0) * HOP) / RATE)) };

  /* each bar's level, dB under the loudest bar */
  const edges = [...bars, ...(bars.length ? [round(Math.min(duration, bars.at(-1) + (meter * 60) / bpm))] : [])];
  const raw = edges.slice(0, -1).map((start, k) => {
    const a = Math.floor(start * RATE), z = Math.min(pcm.length, Math.floor(edges[k + 1] * RATE));
    let s = 0;
    for (let i = a; i < z; i++) s += pcm[i] * pcm[i];
    return { start, end: edges[k + 1], db: 10 * Math.log10(s / Math.max(1, z - a) + 1e-12) };
  });
  /* the loudest whole bar: a bar cut short by the music's end can be one hit and nothing after */
  const whole = raw.filter((b) => b.end - b.start >= (0.5 * meter * 60) / bpm);
  const top = Math.max(...(whole.length ? whole : raw).map((b) => b.db), -Infinity);
  const loudness = raw.map((b) => ({ start: b.start, end: b.end, db: Math.min(0, Math.round((b.db - top) * 10) / 10) }));
  const sections = sectionsOf(loudness);
  /* the lift: the second the level steps up, else the bar where it rises most, or none */
  let lift = liftAt, rise = 4;
  for (let k = 2; k < loudness.length && lift == null; k++) {
    const up = loudness[k].db - (loudness[k - 1].db + loudness[k - 2].db) / 2;
    if (up > rise) { rise = up; lift = loudness[k].start; }
  }
  const order = ['quiet', 'mid', 'loud'];
  /* no step of 4 dB: the first edge where the sections step up is the lift */
  for (let k = 0; lift == null && k + 1 < sections.length; k++) if (order.indexOf(sections[k + 1].level) > order.indexOf(sections[k].level)) lift = sections[k + 1].start;
  /* bars that start a beat off the lift put the edge of the quiet and the loud there: the edge is the lift */
  for (let k = 0; liftAt != null && k + 1 < sections.length; k++) {
    const edge = sections[k].end;
    if (Math.abs(edge - liftAt) <= (meter * 60) / bpm && Math.abs(edge - liftAt) > 1e-3 && order.indexOf(sections[k + 1].level) > order.indexOf(sections[k].level)) {
      sections[k].end = sections[k + 1].start = liftAt;
    }
  }
  return {
    format: FORMAT,
    file: basename(file),
    duration: round(duration),
    bpm,
    meter,
    barSure: Math.round(sure * 100) / 100,
    barBy,
    steady: Math.round(steady * 100) / 100,
    tempos: peaks.slice(0, 3).map((p) => ({ bpm: Math.round(p.bpm * 10) / 10, score: Math.round(p.score * 100) / 100 })),
    grid,
    beats,
    bars,
    hits,
    accents,
    sound,
    loudness,
    sections,
    lift,
    liftBeat,
  };
}

/** Accents kept: as strong as this against the strongest beats' and half beats' attacks. */
const ACCENT = 0.4;
/** A strong accent: a hit a 卡点 drop marks with a cut or a punch. */
export const STRONG = 0.7;

/**
 * The attack on each beat and half beat: the rise in all bands plus the rise in the low ones, the most within 25 ms of
 * the mark, against the 95th percentile of those attacks; the marks at ACCENT or more, `half` when between two beats.
 * @param {{ onset: Float64Array, low: Float64Array }} env @param {number[]} beats
 */
export function accentsOf(env, beats) {
  const reach = Math.round(FPS * 0.025);
  const marks = beats.flatMap((b, k) => [{ t: b, half: false }, ...(k + 1 < beats.length ? [{ t: round((b + beats[k + 1]) / 2), half: true }] : [])]);
  const attack = marks.map(({ t }) => {
    const f = Math.round((t * RATE) / HOP);
    let top = 0;
    for (let g = Math.max(0, f - reach); g <= Math.min(env.onset.length - 1, f + reach); g++) top = Math.max(top, env.onset[g] + env.low[g]);
    return top;
  });
  const sorted = [...attack].sort((a, b) => a - b);
  const ref = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 1;
  return marks.map((mk, k) => ({ t: mk.t, half: mk.half, strength: Math.min(1, Math.round((attack[k] / ref) * 100) / 100) })).filter((a) => a.strength >= ACCENT);
}

const levelOf = (/** @type {number} */ db) => (db > -4 ? 'loud' : db > -10 ? 'mid' : 'quiet');

/**
 * Bars grouped into sections: the stretches, two bars or more, whose levels fit a single level each best, a new
 * stretch costing `cost` dB² (two bars 4.5 dB apart); each named by its mean level, like neighbours joined. Bars that
 * swing between quiet and mid stay one stretch, named by their mean.
 * @param {{ start: number, end: number, db: number }[]} loudness
 */
export function sectionsOf(loudness, cost = 40, least = 2) {
  const n = loudness.length;
  if (!n) return [];
  const sum = [0], sq = [0];
  for (const b of loudness) { sum.push(sum.at(-1) + b.db); sq.push(sq.at(-1) + b.db * b.db); }
  const spread = (/** @type {number} */ a, /** @type {number} */ z) => sq[z] - sq[a] - (sum[z] - sum[a]) ** 2 / (z - a);
  const best = new Float64Array(n + 1).fill(Infinity), from = new Int32Array(n + 1).fill(-1);
  best[0] = 0;
  for (let z = 1; z <= n; z++) {
    for (let a = 0; a < z; a++) {
      if (!Number.isFinite(best[a]) || (z - a < least && n >= least)) continue;
      const s = best[a] + spread(a, z) + cost;
      if (s < best[z]) { best[z] = s; from[z] = a; }
    }
  }
  /** @type {[number, number][]} */
  const cuts = [];
  for (let z = n; z > 0; z = from[z]) {
    if (from[z] < 0) return [{ start: loudness[0].start, end: loudness[n - 1].end, level: levelOf((sum[n]) / n) }];
    cuts.unshift([from[z], z]);
  }
  /** @type {{ start: number, end: number, level: string }[]} */
  const sections = [];
  for (const [a, z] of cuts) {
    const level = levelOf((sum[z] - sum[a]) / (z - a));
    const last = sections.at(-1);
    if (last && last.level === level) last.end = loudness[z - 1].end;
    else sections.push({ start: loudness[a].start, end: loudness[z - 1].end, level });
  }
  return sections;
}

/** The sections in a line: `0.8–4.7 quiet · 4.7–100.7 loud, then the lift · …`. */
export function sectionLine(/** @type {{ sections: { start: number, end: number, level: string }[], lift: number | null }} */ m) {
  return m.sections.map((s) => {
    const then = m.lift != null && Math.abs(s.end - m.lift) < 1e-3 ? ', then the lift'
      : m.lift != null && m.lift > s.start + 1e-3 && m.lift < s.end - 1e-3 ? `, lifting at ${m.lift.toFixed(1)}` : '';
    return `${s.start.toFixed(1)}–${s.end.toFixed(1)} ${s.level}${then}`;
  }).join(' · ');
}

/** The measure as a page to look at and listen to: the waveform, beats, bars, hits and sections, with a playhead. */
export function page(/** @type {Awaited<ReturnType<typeof measure>>} */ m, /** @type {string} */ audioHref, /** @type {Float32Array} */ pcm) {
  const columns = 1600, per = Math.max(1, Math.floor(pcm.length / columns));
  const peaks = [];
  for (let c = 0; c < columns && c * per < pcm.length; c++) {
    let hi = 0;
    for (let i = c * per; i < Math.min(pcm.length, (c + 1) * per); i++) hi = Math.max(hi, Math.abs(pcm[i]));
    peaks.push(Math.round(hi * 1000) / 1000);
  }
  const data = JSON.stringify({ ...m, peaks }).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>${esc(m.file)}: beats</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;background:#fafafa;color:#222}canvas{width:100%;height:220px;background:#fff;border:1px solid #ddd;cursor:pointer}p{margin:8px 0}.k{display:inline-block;width:12px;height:12px;margin:0 4px 0 12px;vertical-align:-1px}</style>
<h1>${esc(m.file)}</h1>
<p>${m.bpm} BPM, ${m.meter} beats a bar, ${m.beats.length} beats, ${m.bars.length} bars, steady ${m.steady}${m.lift != null ? `, lifts at ${m.lift} s` : ''}</p>
<p><span class="k" style="background:#999"></span>beat<span class="k" style="background:#d33"></span>first beat of a bar<span class="k" style="background:#36c;border-radius:6px"></span>hit<span class="k" style="background:#fe9"></span>loud<span class="k" style="background:#eef"></span>quiet</p>
<audio controls src="${esc(audioHref)}" style="width:100%"></audio>
<canvas width="1600" height="220"></canvas>
<script>
const m=${data};const cv=document.querySelector('canvas'),g=cv.getContext('2d'),au=document.querySelector('audio');
const X=t=>t/m.duration*cv.width;
function draw(){g.clearRect(0,0,cv.width,cv.height);
for(const s of m.sections){g.fillStyle=s.level==='loud'?'#fff3c4':s.level==='quiet'?'#eef0ff':'#fff';g.fillRect(X(s.start),0,X(s.end)-X(s.start),cv.height);}
g.fillStyle='#bbb';m.peaks.forEach((p,i)=>{const h=p*100;g.fillRect(i*cv.width/m.peaks.length,110-h,Math.max(1,cv.width/m.peaks.length),h*2);});
for(const b of m.beats){g.fillStyle='#999';g.fillRect(X(b),0,1,30);}
for(const b of m.bars){g.fillStyle='#d33';g.fillRect(X(b)-1,0,2,cv.height);}
for(const h of m.hits){g.fillStyle='#36c';g.beginPath();g.arc(X(h.t),200,2+h.strength*6,0,7);g.fill();}
g.fillStyle='#000';g.fillRect(X(au.currentTime),0,2,cv.height);}
cv.onclick=e=>{au.currentTime=e.offsetX/cv.clientWidth*m.duration;draw();};
(function loop(){draw();requestAnimationFrame(loop);})();
</script>`;
}
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** The nearest mark to `t` in a measure: a beat, half beat, first beat of a bar, or hit. */
export function snap(/** @type {{ beats: number[], bars: number[], hits: { t: number }[] }} */ m, /** @type {number} */ t, to = 'beat') {
  const grid = to === 'bar' ? m.bars
    : to === 'hit' ? m.hits.map((h) => h.t)
    : to === 'half' ? m.beats.flatMap((b, k) => (k + 1 < m.beats.length ? [b, round((b + m.beats[k + 1]) / 2)] : [b]))
    : m.beats;
  let best = NaN;
  for (const g of grid) if (Number.isNaN(best) || Math.abs(g - t) < Math.abs(best - t)) best = g;
  return { t, to, at: best, off: round(best - t) };
}

/* ---------- film.html ---------- */

/** A tag's attributes. */
function attributes(/** @type {string} */ text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of text.matchAll(/([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const v = m[2] ?? '';
    out[m[1].toLowerCase()] = (/^["']/.test(v) ? v.slice(1, -1) : v).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return out;
}

/**
 * film.html's tracks, top first, each its attributes and clips (tag and attributes). Comments, styles and scripts are
 * left out; a '>' inside a quoted attribute (the person's overrides) does not end its tag.
 */
export function filmTracks(/** @type {string} */ html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '');
  /** @type {{ attrs: Record<string, string>, clips: { tag: string, attrs: Record<string, string> }[] }[]} */
  const tracks = [];
  /** @type {(typeof tracks)[number] | null} */
  let track = null;
  let i = 0;
  while ((i = text.indexOf('<', i)) !== -1) {
    let j = i + 1, quote = '';
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
    }
    const tag = text.slice(i + 1, j);
    i = j + 1;
    const m = /^(\/?)([a-zA-Z][\w-]*)/.exec(tag);
    if (!m) continue;
    const name = m[2].toLowerCase();
    if (!m[1] && (name === 'style' || name === 'script')) {
      const end = text.toLowerCase().indexOf(`</${name}`, i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (name === 'section') {
      if (m[1]) track = null;
      else tracks.push((track = { attrs: attributes(tag.slice(m[0].length)), clips: [] }));
    } else if (!m[1] && track && ['video', 'img', 'iframe', 'audio'].includes(name)) {
      track.clips.push({ tag: name, attrs: attributes(tag.slice(m[0].length)) });
    }
  }
  return tracks;
}

/** A clip's file, trim and place. */
function clipOf(/** @type {{ tag: string, attrs: Record<string, string> }} */ c) {
  const src = c.attrs.src ?? '';
  const hash = src.indexOf('#t=');
  const path = hash === -1 ? src : src.slice(0, hash);
  const [from, to] = hash === -1 ? [0, undefined] : src.slice(hash + 3).split(',').map((v) => (v === '' ? undefined : Number(v)));
  let file = path.split('?')[0];
  try { file = decodeURIComponent(file); } catch { /* as written */ }
  return {
    tag: c.tag,
    id: c.attrs.id || basename(file),
    file,
    from: from ?? 0,
    to,
    at: Number(c.attrs.at) || 0,
    speed: Number(c.attrs.speed) || 1,
    fx: fxRead(c.attrs['data-beat-fx'] ?? ''),
  };
}

/** The effects `punch` wrote on a clip: `punch 0 flash 0 shake 0.75`, clip seconds. */
function fxRead(/** @type {string} */ text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  /** @type {{ kind: string, t: number }[]} */
  const out = [];
  for (let k = 0; k + 1 < words.length; k += 2) if (Number.isFinite(Number(words[k + 1]))) out.push({ kind: words[k], t: Number(words[k + 1]) });
  return out;
}

/** @type {Map<string, Promise<number | undefined>>} */
const probed = new Map();
/** How long a media file lasts, by ffprobe, once per file as it is. */
function mediaLength(/** @type {string} */ file) {
  const st = statSync(file);
  const key = `${resolve(file)}|${st.mtimeMs}|${st.size}`;
  if (!probed.has(key)) {
    probed.set(key, run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).then((out) => {
      const s = Number(String(out).trim());
      return Number.isFinite(s) ? s : undefined;
    }, () => undefined));
  }
  return /** @type {Promise<number | undefined>} */ (probed.get(key));
}

/** A clip's length in the film, or undefined when it cannot be told without playing it. */
async function lengthOf(/** @type {ReturnType<typeof clipOf>} */ c, /** @type {string} */ dir) {
  if (c.to != null) return (c.to - c.from) / c.speed;
  const full = join(dir, c.file);
  if (!existsSync(full)) return undefined;
  if (c.tag === 'iframe') {
    const d = /\bduration\s*:\s*([\d.]+)/.exec(readFileSync(full, 'utf8'));
    return d ? (Number(d[1]) - c.from) / c.speed : undefined;
  }
  if (c.tag === 'img') return undefined;
  const len = await mediaLength(full);
  return len == null ? undefined : (len - c.from) / c.speed;
}

/**
 * The measure of a music file, read from <out>/<name>.json when it is newer than the file and than this script, else
 * made and saved.
 */
async function measured(/** @type {string} */ file, /** @type {string} */ out) {
  const json = join(out, `${basename(file, extname(file))}.json`);
  const since = Math.max(statSync(file).mtimeMs, statSync(fileURLToPath(import.meta.url)).mtimeMs);
  if (existsSync(json) && statSync(json).mtimeMs >= since) {
    const m = JSON.parse(readFileSync(json, 'utf8'));
    if (m.format === FORMAT && m.file === basename(file)) return m;
  }
  return write(file, out);
}

/** Measure a file and write its JSON and page. */
async function write(/** @type {string} */ file, /** @type {string} */ out, o = {}) {
  const m = await measure(file, o);
  mkdirSync(out, { recursive: true });
  const name = basename(file, extname(file));
  writeFileSync(join(out, `${name}.json`), JSON.stringify(m, null, 1));
  writeFileSync(join(out, `${name}.html`), page(m, relative(out, file).split('\\').join('/'), await decode(file)));
  return m;
}

/** The film's music: the sound clip named, else the longest with no words beside it (a .vtt is a voice). */
async function musicOf(/** @type {ReturnType<typeof filmTracks>} */ tracks, /** @type {string} */ dir, /** @type {string} */ filmFile, /** @type {string | undefined} */ name) {
  const sounds = tracks.flatMap((t) => t.clips.filter((c) => c.tag === 'audio').map(clipOf));
  const named = name && sounds.find((s) => s.id === name || s.file === name || basename(s.file) === name);
  if (name && !named) throw new Error(`no sound clip "${name}" in ${filmFile}`);
  const candidates = named ? [named] : sounds.filter((s) => !existsSync(join(dir, s.file.replace(/\.[^./]+$/, '.vtt'))));
  /** @type {(ReturnType<typeof clipOf> & { length: number }) | undefined} */
  let music;
  for (const s of candidates) {
    const length = await lengthOf(s, dir);
    if (length != null && (!music || length > music.length)) music = { ...s, length };
  }
  if (!music) throw new Error(`no music in ${filmFile}: a sound clip with no .vtt beside it, or --music <clip id>`);
  return music;
}

/* ---------- 卡点: the plan and the punches ---------- */

/** @typedef {{ bpm: number, meter: number, beats: number[], bars: number[], accents?: { t: number, half: boolean, strength: number }[], sections: { start: number, end: number, level: string }[], lift: number | null, sound?: { start: number, end: number }, duration: number }} Measure */

/** How hard each effect hits: the zoom of a punch, the brightness a flash adds, the shake's reach (vw of the stage). */
export const FX = { punch: 0.12, soft: 0.06, push: 0.06, flash: 1.0, shake: 2.2 };

/** The second beat k (fractional: k + 0.5 is a half beat) falls on, past the last beat by the tempo. */
function beatTime(/** @type {Measure} */ m, /** @type {number} */ k) {
  const p = 60 / m.bpm, n = m.beats.length;
  const at = (/** @type {number} */ i) => (i < 0 ? m.beats[0] + i * p : i >= n ? m.beats[n - 1] + (i - n + 1) * p : m.beats[i]);
  const i = Math.floor(k), f = k - i;
  return round(at(i) + (at(i + 1) - at(i)) * f);
}

/**
 * The measure with its lift on a beat, for planning and punching: a lift on a half beat or between beats (a pickup, or
 * a line the kick kept) goes to the nearest beat, the later one when they are a frame from even, and the bars count
 * from it.
 */
export function withDrop(/** @type {Measure} */ m) {
  if (m.lift == null || !m.beats.length) return m;
  const lift = m.lift;
  const near = m.beats.reduce((b, x) => (Math.abs(x - lift) < Math.abs(b - lift) - 1 / 30 || (Math.abs(Math.abs(x - lift) - Math.abs(b - lift)) <= 1 / 30 && x > b) ? x : b), m.beats[0]);
  const drop = Math.abs(near - lift) <= 1 / 60 ? lift : near;
  /* a drop starts a bar: bars that do not start on it are counted from it */
  if (m.bars.some((b) => Math.abs(b - drop) <= 1 / 60)) return drop === lift ? m : { ...m, lift: drop };
  const k = m.beats.indexOf(near);
  return { ...m, lift: drop, bars: m.beats.filter((_, i) => (((i - k) % m.meter) + m.meter) % m.meter === 0) };
}
/** The index of the beat nearest to second t. */
const beatIndex = (/** @type {Measure} */ m, /** @type {number} */ t) => m.beats.reduce((b, x, k) => (Math.abs(x - t) < Math.abs(m.beats[b] - t) ? k : b), 0);

/**
 * What a stretch of the music asks of the picture: `build` before the lift, `rush` (the bar into the lift, a beat or
 * less a shot), `drop` (the lift and loud parts after it), `mid`, `calm` (quiet parts after it).
 */
export function roleAt(/** @type {Measure} */ m, /** @type {number} */ start, /** @type {number} */ end) {
  const beat = 60 / m.bpm, eps = 1 / 60;
  if (m.lift != null && start < m.lift - eps) return end - start <= 1.25 * beat && m.lift - start <= 1.1 * m.meter * beat ? 'rush' : 'build';
  const sec = m.sections.find((s) => start >= s.start - eps && start < s.end - eps);
  const fromLift = m.lift != null && m.sections.find((s) => m.lift != null && m.lift >= s.start - eps && m.lift < s.end - eps);
  if (sec && fromLift && sec === fromLift) return 'drop';
  const level = sec?.level ?? 'loud';
  return level === 'loud' ? 'drop' : level === 'mid' ? 'mid' : m.lift == null ? 'build' : 'calm';
}

/**
 * The effects for a shot playing music seconds start to end: a punch (a zoom that snaps in and settles) on its first
 * beat and on each beat inside it in a drop, a flash at the lift and on the first beat of each phrase after it, a
 * shake on the strong half-beat hits inside it, a slow push in a build or a calm part. Music seconds.
 * @returns {{ kind: string, t: number }[]}
 */
export function fxFor(/** @type {Measure} */ m, /** @type {number} */ start, /** @type {number} */ end) {
  const role = roleAt(m, start, end), beat = 60 / m.bpm, eps = 1 / 60;
  if (role === 'build' || role === 'calm') return [{ kind: 'push', t: start }];
  if (role === 'rush') return [{ kind: 'soft', t: start }];
  /** @type {{ kind: string, t: number }[]} */
  const out = [{ kind: 'punch', t: start }];
  const phraseStart = m.lift != null && m.bars.some((b) => Math.abs(b - start) < eps && Math.round((b - /** @type {number} */ (m.lift)) / (m.meter * beat)) % 4 === 0 && b >= m.lift - eps);
  if (m.lift != null && (Math.abs(start - m.lift) < eps || phraseStart)) out.push({ kind: 'flash', t: start });
  const inside = (/** @type {number} */ t) => t > start + 0.15 && t < end - 0.1;
  const strong = (/** @type {number} */ t) => (m.accents ?? []).some((a) => Math.abs(a.t - t) < eps && a.strength >= STRONG);
  for (const b of m.beats) if (inside(b) && (role === 'drop' || strong(b))) out.push({ kind: 'punch', t: b });
  if (role === 'drop') {
    for (const a of m.accents ?? []) {
      if (a.half && a.strength >= STRONG && inside(a.t) && out.every((e) => Math.abs(e.t - a.t) >= 0.15)) out.push({ kind: 'shake', t: a.t });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
}

/**
 * A 卡点 plan: which stretch of the music, and the shots on it. Before the lift a shot a bar (two beats in long bars),
 * the bar into the lift rushing (2, 1, ½, ½ beats), the lift and the loud part a shot a beat on each phrase's first
 * bar and 1, 1, 2 beats on the others (a punch on the beat inside), mid parts two beats, calm parts a bar, the last
 * bar one shot to end on. Without `from`, the film starts 4 bars before the lift (2 when 4 would be over half the
 * film) and runs `length` seconds rounded to whole bars.
 * @param {Measure} m @param {{ length?: number, from?: number, to?: number }} [o]
 */
export function plan(m, o = {}) {
  m = withDrop(m);
  const beat = 60 / m.bpm, meter = m.meter, barLen = beat * meter, eps = 1 / 60;
  const bars = m.bars.length ? m.bars : m.beats.filter((_, k) => k % meter === 0);
  const length = o.length ?? 30;
  const nearestBar = (/** @type {number} */ t) => bars.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), bars[0]);
  const soundEnd = m.sound?.end ?? m.duration;
  let from = o.from;
  if (from == null) {
    const li = m.lift == null ? 0 : bars.indexOf(nearestBar(m.lift));
    /* 4 bars, else 2, else the one bar into it when the music starts a bar before the lift */
    const fits = (/** @type {number} */ l) => li - l >= 0 && bars[li - l] >= (m.sound?.start ?? 0) - 0.25;
    const lead = [4, 2, 1, 0].filter((l) => l <= (4 * barLen <= 0.5 * length ? 4 : 2)).find(fits) ?? 0;
    from = bars[Math.max(0, li - lead)];
  }
  let to = o.to;
  if (to == null) {
    const n = Math.max(1, Math.round(length / barLen));
    const fi = bars.findIndex((b) => b >= /** @type {number} */ (from) - eps);
    to = fi >= 0 && bars[fi + n] != null ? bars[fi + n] : Math.min(soundEnd, from + n * barLen);
  }
  to = round(Math.min(to, m.duration));
  from = round(from);
  /* shot edges in beats: bar by bar, by what the bar asks */
  /** @type {{ start: number, end: number }[]} */
  const shots = [];
  let k = beatIndex(m, from);
  if (beatTime(m, k) < from - eps) k++;
  if (beatTime(m, k) > from + eps) shots.push({ start: from, end: beatTime(m, k) });
  const barAt = (/** @type {number} */ i) => bars.some((b) => Math.abs(b - beatTime(m, i)) < eps);
  while (beatTime(m, k) < to - eps) {
    /* to the next bar line, or the end */
    let z = k + 1;
    while (!barAt(z) && z - k < meter) z++;
    const a = beatTime(m, k), zEnd = Math.min(to, beatTime(m, z));
    const last = zEnd >= to - eps;
    const beforeLift = m.lift != null && a < m.lift - eps;
    const intoLift = beforeLift && Math.abs(beatTime(m, z) - /** @type {number} */ (m.lift)) < eps;
    const role = roleAt(m, a, a + beat);
    const fromLift = m.lift != null && !beforeLift ? Math.round((a - m.lift) / barLen) : -1;
    const span = z - k;
    /** @type {number[]} */
    let pattern;
    if (last) pattern = [span];
    else if (intoLift && span >= 4) pattern = [span - 2, 1, 0.5, 0.5];
    else if (beforeLift || role === 'build' || role === 'calm') pattern = barLen > 2.6 && span >= 4 ? [span / 2, span / 2] : [span];
    else if (role === 'mid') pattern = span >= 4 ? [2, span - 2] : [span];
    else pattern = fromLift % 4 === 0 || span < 4 ? Array(span).fill(1) : [1, 1, span - 2];
    let at = k;
    for (const n of pattern) {
      const s = beatTime(m, at), e = Math.min(to, beatTime(m, at + n));
      if (e > s + eps) shots.push({ start: s, end: e });
      at += n;
    }
    k = z;
  }
  const slots = shots.map((s) => {
    const role = last(s) ? 'end' : roleAt(m, s.start, s.end);
    return {
      at: round(s.start - from), length: round(s.end - s.start), music: s.start, role,
      lift: m.lift != null && Math.abs(s.start - m.lift) < eps,
      fx: role === 'end' ? [] : fxFor(m, s.start, s.end).map((f) => ({ kind: f.kind, at: round(f.t - from) })),
    };
    function last(/** @type {{ end: number }} */ x) { return x.end >= /** @type {number} */ (to) - eps; }
  });
  return { music: { from, to, bpm: m.bpm, lift: m.lift, liftFilm: m.lift != null && m.lift >= from && m.lift < to ? round(m.lift - from) : null }, length: round(to - from), slots };
}

/**
 * CSS keyframes for a clip `length` seconds long with these effects (clip seconds): the zoom (`scale`), the shake
 * (`translate`) and, when a flash or a punch is in it, the brightness (`filter`, after the clip's own `filter`).
 */
export function keyframes(/** @type {string} */ name, /** @type {number} */ length, /** @type {{ kind: string, t: number }[]} */ fx, own = '') {
  const decay = (/** @type {number} */ x, /** @type {number} */ d) => (x < 0 || x >= d ? 0 : (1 - x / d) ** 2);
  const next = (/** @type {number} */ t) => Math.min(length, ...fx.filter((e) => e.t > t + 1e-3).map((e) => e.t));
  const span = (/** @type {{ t: number }} */ e, /** @type {number} */ d) => Math.max(0.04, Math.min(d, next(e.t) - e.t));
  const push = fx.some((e) => e.kind === 'push');
  const scale = (/** @type {number} */ t) => {
    let s = push ? 1 + (FX.push * t) / Math.max(0.01, length) : 1;
    for (const e of fx) {
      if (e.kind === 'punch' || e.kind === 'soft') s += (e.kind === 'punch' ? FX.punch : FX.soft) * decay(t - e.t, span(e, 0.25));
      if (e.kind === 'shake' && t >= e.t && t < e.t + 0.15) s += 0.06;
    }
    return s;
  };
  const wiggle = [1, -1, 0.5, 0];
  const shift = (/** @type {number} */ t) => {
    for (const e of fx) if (e.kind === 'shake' && t >= e.t - 1e-6 && t < e.t + 0.12) return FX.shake * wiggle[Math.min(3, Math.floor((t - e.t) / 0.033 + 1e-6))];
    return 0;
  };
  const bright = (/** @type {number} */ t) => 1 + fx.reduce((b, e) => b + (e.kind === 'flash' ? FX.flash * decay(t - e.t, span(e, 0.15)) : e.kind === 'punch' ? 0.12 * decay(t - e.t, span(e, 0.2)) : 0), 0);
  const lit = fx.some((e) => e.kind === 'flash' || e.kind === 'punch');
  const shakes = fx.some((e) => e.kind === 'shake');
  const times = new Set([0, length]);
  for (const e of fx) {
    if (e.t > 0.002) times.add(e.t - 0.001);
    if (e.kind === 'shake') for (const d of [0, 0.033, 0.066, 0.1, 0.12, 0.15]) times.add(e.t + d);
    else if (e.kind !== 'push') { const d = span(e, 0.25); for (const f of [0, 0.15, 0.35, 0.6, 1]) times.add(e.t + d * f); }
  }
  const stops = [...times].filter((t) => t >= 0 && t <= length + 1e-9).map((t) => Math.round(t * 1000) / 1000).sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] >= 0.001);
  const rows = stops.map((t) => {
    const pct = Math.round((t / length) * 100000) / 1000;
    const parts = [`scale: ${scale(t).toFixed(4)}`];
    if (shakes) parts.push(`translate: ${shift(t).toFixed(2)}vw 0`);
    if (lit) parts.push(`filter: ${own ? `${own} ` : ''}brightness(${bright(t).toFixed(3)})`);
    return `  ${pct}% { ${parts.join('; ')}; }`;
  });
  return `@keyframes ${name} {\n${rows.join('\n')}\n}`;
}

/** Where each clip's tag is in film.html, on which track, with its attributes. */
function clipTags(/** @type {string} */ html) {
  /** @type {{ start: number, end: number, track: number, tag: string, attrs: Record<string, string>, text: string }[]} */
  const out = [];
  let track = -1, inSection = false, i = 0;
  while ((i = html.indexOf('<', i)) !== -1) {
    if (html.startsWith('<!--', i)) { const z = html.indexOf('-->', i); i = z === -1 ? html.length : z + 3; continue; }
    let j = i + 1, quote = '';
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
    }
    const text = html.slice(i, j + 1), m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(text);
    const start = i;
    i = j + 1;
    if (!m) continue;
    const name = m[2].toLowerCase();
    if (!m[1] && (name === 'style' || name === 'script')) { const z = html.toLowerCase().indexOf(`</${name}`, i); i = z === -1 ? html.length : z; continue; }
    if (name === 'section') { if (m[1]) inSection = false; else { inSection = true; track++; } continue; }
    if (!m[1] && inSection && ['video', 'img', 'iframe', 'audio'].includes(name)) out.push({ start, end: j + 1, track, tag: name, attrs: attributes(text.slice(m[0].length, -1)), text });
  }
  return out;
}

/** A tag with an attribute set (or added), the value in double quotes. */
function setAttr(/** @type {string} */ tag, /** @type {string} */ name, /** @type {string | null} */ value) {
  const re = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  const v = value == null ? '' : ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
  if (re.test(tag)) return tag.replace(re, v);
  if (value == null) return tag;
  return tag.replace(/\s*(\/?)>$/, (_, slash) => `${v}${slash ? ' /' : ''}>`);
}

/** A style without what `punch` added: its animation and any older one of its own. */
function styleWithout(/** @type {string} */ style) {
  return style.split(';').map((d) => {
    const m = /^\s*animation\s*:(.*)$/i.exec(d);
    if (!m) return d;
    const kept = m[1].split(/,(?![^(]*\))/).filter((a) => !/\bbc-\d+\b/.test(a));
    return kept.length ? ` animation:${kept.join(',')}` : null;
  }).filter((d) => d != null && d.trim()).join(';').trim();
}

/**
 * The punches written into film.html, by the music: on each picture clip of the main track (the one with the most
 * pictures), the effects `fxFor` names for the music it plays over, as a CSS animation on the clip's own time and a
 * `data-beat-fx` that `check` reads. Run again after any change: what it wrote before is replaced.
 * @param {string} filmFile @param {{ music?: string, out?: string, dry?: boolean }} [o]
 */
export async function punch(filmFile, o = {}) {
  const dir = dirname(resolve(filmFile));
  let html = readFileSync(filmFile, 'utf8');
  const tracks = filmTracks(html).filter((t) => !('hidden' in t.attrs));
  const music = await musicOf(tracks, dir, filmFile, o.music);
  const m = withDrop(await measured(join(dir, music.file), o.out ?? join(dir, 'beats')));
  const toMusic = (/** @type {number} */ t) => music.from + (t - music.at) * music.speed;
  const tags = clipTags(html);
  const counts = new Map();
  for (const t of tags) if (t.tag === 'video' || t.tag === 'img') counts.set(t.track, (counts.get(t.track) ?? 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  /** @type {string[]} */
  const css = [];
  /** @type {{ id: string, at: number, fx: { kind: string, t: number }[] }[]} */
  const done = [];
  let n = 0;
  const edits = [];
  /* the last shot, a bar or longer, ends the film: one hit at its start and then it holds */
  let lastEnd = 0;
  for (const t of tags) if (t.track === main && (t.tag === 'video' || t.tag === 'img')) { const c = clipOf(t); const l = await lengthOf(c, dir); if (l != null) lastEnd = Math.max(lastEnd, c.at + l); }
  const barLen = (m.meter * 60) / m.bpm / music.speed;
  for (const t of tags) {
    if (t.tag !== 'video' && t.tag !== 'img') continue;
    const c = clipOf(t);
    let style = styleWithout(t.attrs.style ?? '');
    /** @type {{ kind: string, t: number }[]} */
    let fx = [];
    const length = await lengthOf(c, dir);
    if (t.track === main && length != null && length > 0.05 && c.at >= music.at - 1e-3 && c.at < music.at + music.length - 1e-3) {
      const a = toMusic(c.at), z = toMusic(Math.min(c.at + length, music.at + music.length));
      fx = fxFor(m, a, z).map((f) => ({ kind: f.kind, t: round(Math.max(0, (f.t - a) / music.speed)) }));
      if (c.at + length >= lastEnd - 1 / 60 && length >= 0.9 * barLen) fx = fx.filter((f) => f.t === 0 || f.kind === 'push');
    }
    let tag = t.text;
    if (fx.length && length != null) {
      const name = `bc-${++n}`;
      const own = /(?:^|;)\s*filter\s*:\s*([^;]+)/i.exec(style)?.[1].trim() ?? '';
      css.push(keyframes(name, round(length), fx, own));
      const anim = `${name} ${round(length)}s linear both`;
      style = /(?:^|;)\s*animation\s*:/i.test(style) ? style.replace(/((?:^|;)\s*animation\s*:[^;]*)/i, `$1, ${anim}`) : `${style}${style && !style.endsWith(';') ? '; ' : ''}animation: ${anim}`;
      tag = setAttr(setAttr(tag, 'style', style), 'data-beat-fx', fx.map((f) => `${f.kind} ${f.t}`).join(' '));
      done.push({ id: c.id, at: c.at, fx });
    } else {
      tag = setAttr(setAttr(tag, 'style', style || null), 'data-beat-fx', null);
    }
    if (tag !== t.text) edits.push({ start: t.start, end: t.end, tag });
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, e.start) + e.tag + html.slice(e.end);
  html = html.replace(/\s*<style id="beat-cut-fx">[\s\S]*?<\/style>/, '');
  if (css.length) {
    const block = `<style id="beat-cut-fx">\n/* written by beat-cut's punch: run it again after changing the cuts */\n${css.join('\n')}\n</style>`;
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${block}\n</head>`);
    else if (/<body/i.test(html)) html = html.replace(/<body/i, `<head>\n${block}\n</head>\n<body`);
    else html = `${block}\n${html}`;
  }
  if (!o.dry) writeFileSync(filmFile, html);
  return { music: music.id, clips: done, html };
}

/**
 * Every picture cut of a film against its music: each clip's start and end on a shown picture track, in frames from
 * the music's nearest beat; edges less than half a frame apart are one cut. The music is the clip named by `music` (id
 * or file), else the longest sound with no words beside it (a .vtt is a voice). With them: the stretches with no
 * picture (`gaps`), clips over each other on a track (`overlaps`), clips trimmed past their file's end (`pastEnd`), the
 * shots in each of the music's sections and their mean length (`pace`), runs of shots of one length (`warnings`), and
 * what starts at the lift (`lift`).
 * @param {string} filmFile @param {{ music?: string, fps?: number, out?: string }} [o]
 */
export async function check(filmFile, o = {}) {
  const dir = dirname(resolve(filmFile));
  const fps = o.fps ?? 30;
  const half = 0.5 / fps;
  const tracks = filmTracks(readFileSync(filmFile, 'utf8')).filter((t) => !('hidden' in t.attrs));
  const music = await musicOf(tracks, dir, filmFile, o.music);
  const m = await measured(join(dir, music.file), o.out ?? join(dir, 'beats'));

  /** @type {{ id: string, track: number, at: number, end: number | undefined, file: string, from: number, speed: number, tag: string, fx: { kind: string, t: number }[] }[]} */
  const pictures = [];
  /** @type {{ clip: string, end: number, length: number }[]} */
  const pastEnd = [];
  let filmEnd = 0, unknown = 0;
  for (const [i, t] of tracks.entries()) {
    for (const raw of t.clips) {
      const c = clipOf(raw);
      const length = await lengthOf(c, dir);
      if (length != null) filmEnd = Math.max(filmEnd, c.at + length);
      const full = join(dir, c.file);
      if ((c.tag === 'video' || c.tag === 'audio') && existsSync(full)) {
        const file = await mediaLength(full);
        const end = Math.max(c.from, c.to ?? 0);
        if (file != null && end > file + 5e-4) pastEnd.push({ clip: c.id, end, length: round(file) });
      }
      if (c.tag === 'audio') continue;
      if (length == null) unknown++;
      pictures.push({ id: c.id, track: i, at: c.at, end: length == null ? undefined : c.at + length, file: c.file, from: c.from, speed: c.speed, tag: c.tag, fx: c.fx });
    }
  }
  /* a picture of no known length shows until the next clip on its track */
  const shownTo = (/** @type {(typeof pictures)[number]} */ p) => p.end ?? pictures.filter((q) => q.track === p.track && q.at > p.at + half).reduce((z, q) => Math.min(z, q.at), filmEnd);

  /* edges less than half a frame apart are one cut, at the start of what comes in */
  const edges = pictures.flatMap((p) => [{ t: p.at, clip: p.id, edge: 'start' }, ...(p.end != null ? [{ t: p.end, clip: p.id, edge: 'end' }] : [])]).sort((a, b) => a.t - b.t);
  /** @type {{ last: number, edges: typeof edges }[]} */
  const groups = [];
  for (const e of edges) {
    const g = groups.at(-1);
    if (g && e.t - g.last < half) { g.edges.push(e); g.last = e.t; } else groups.push({ last: e.t, edges: [e] });
  }
  const marks = groups.map((g) => {
    const starts = g.edges.filter((e) => e.edge === 'start');
    return { t: round((starts[0] ?? g.edges[0]).t), clips: g.edges.map((e) => `${e.clip} ${e.edge}s`), starts: starts.map((e) => e.clip) };
  });
  const toMusic = (/** @type {number} */ t) => music.from + (t - music.at) * music.speed;
  const inMusic = (/** @type {number} */ t) => t >= music.at - 1e-3 && t <= music.at + music.length + 1e-3;
  const rows = marks.filter((c) => c.t > half && c.t < filmEnd - half && inMusic(c.t)).map((cut) => {
    const at = toMusic(cut.t);
    const beat = snap(m, at, 'beat'), bar = snap(m, at, 'bar'), mid = snap(m, at, 'half'), hit = m.hits.length ? snap(m, at, 'hit') : null;
    const inFrames = (/** @type {number} */ s) => Math.round((s / music.speed) * fps * 10) / 10;
    const frames = inFrames(beat.at - at);
    const isBar = Math.abs(bar.off) < 1e-3 + Math.abs(beat.off);
    /* a beat, else a half beat, else a hit, each within a frame; the rest are off */
    const kind = Math.abs(frames) <= 1 ? (isBar ? 'bar' : 'beat') : Math.abs(inFrames(mid.at - at)) <= 1 ? 'half' : hit && Math.abs(inFrames(hit.at - at)) <= 1 ? 'hit' : 'off';
    return { t: cut.t, music: round(at), beat: beat.at, bar: isBar, frames, kind, clips: cut.clips };
  });

  /* no picture: a stretch none covers, from a tenth of a millisecond: a frame on its end or inside it is drawn black */
  const spans = pictures.map((p) => ({ id: p.id, track: p.track, a: p.at, z: shownTo(p) })).sort((x, y) => x.a - y.a);
  const r4 = (/** @type {number} */ x) => Math.round(x * 10000) / 10000;
  /** @type {{ start: number, end: number, length: number, after: string | null, before: string | null }[]} */
  const gaps = [];
  let cursor = 0, lastId = /** @type {string | null} */ (null);
  const hole = (/** @type {number} */ z, /** @type {string | null} */ before) => {
    /* at the film's end, the sound running on by under half a frame is no hole */
    if (z - cursor >= (before == null ? half : 1e-4)) gaps.push({ start: r4(cursor), end: r4(z), length: r4(z - cursor), after: lastId, before });
  };
  for (const s of spans) {
    hole(s.a, s.id);
    if (s.z > cursor) { cursor = s.z; lastId = s.id; }
  }
  if (spans.length) hole(filmEnd, null);

  /** @type {{ track: number, a: string, b: string, length: number }[]} */
  const overlaps = [];
  for (const [i] of tracks.entries()) {
    const on = spans.filter((s) => s.track === i).sort((x, y) => x.a - y.a);
    let reach = -Infinity, by = '';
    for (const s of on) {
      if (reach - s.a >= half) overlaps.push({ track: i + 1, a: by, b: s.id, length: round(Math.min(reach, s.z) - s.a) });
      if (s.z > reach) { reach = s.z; by = s.id; }
    }
  }

  /* the shots as the viewer sees them: between one cut and the next, the top picture showing */
  const bounds = [...new Set(marks.map((c) => c.t).concat(round(filmEnd)))].sort((a, b) => a - b);
  const showing = (/** @type {number} */ t) => {
    for (let i = 0; i < tracks.length; i++) {
      const s = spans.find((x) => x.track === i && t >= x.a && t < x.z);
      if (s) return s.id;
    }
    return null;
  };
  const shots = bounds.slice(0, -1).flatMap((a, k) => {
    const z = bounds[k + 1], clip = showing((a + z) / 2);
    return clip && z - a >= half ? [{ at: a, length: round(z - a), clip }] : [];
  });
  /* a shot starting within a frame before a section starts belongs to it */
  const sectionAt = (/** @type {number} */ t) => m.sections.findIndex((s) => t >= s.start - 1 / fps && t < s.end - 1 / fps);
  /** @type {{ level: string, start: number, end: number, film: { start: number, end: number }, shots: number, mean: number }[]} */
  const pace = [];
  /** @type {Map<number, (typeof pace)[number]>} */
  const bySection = new Map();
  const rushFrom = m.lift == null ? Infinity : m.lift - (m.meter * 60) / m.bpm - half;
  for (const s of shots) {
    if (!inMusic(s.at) || s.at > music.at + music.length - half) continue;
    /* the bar that rushes into the lift is not the calm before it */
    if (m.lift != null && toMusic(s.at) >= rushFrom && toMusic(s.at) < m.lift - half) continue;
    const k = sectionAt(toMusic(s.at));
    if (k < 0) continue;
    const sec = m.sections[k];
    let row = bySection.get(k);
    if (!row) {
      const film = (/** @type {number} */ x) => round(Math.min(music.at + music.length, Math.max(music.at, music.at + (x - music.from) / music.speed)));
      const used = music.from + music.length * music.speed;
      pace.push((row = { level: sec.level, start: round(Math.max(sec.start, music.from)), end: round(Math.min(sec.end, used)), film: { start: film(sec.start), end: film(sec.end) }, shots: 0, mean: 0 }));
      bySection.set(k, row);
    }
    row.mean = (row.mean * row.shots + s.length) / (row.shots + 1);
    row.shots++;
  }
  for (const p of pace) p.mean = Math.round(p.mean * 100) / 100;

  /* the film's shape against the music's: quiet and mid parts against loud ones, and cuts a bar against each bar's level */
  const used = { from: music.from, to: music.from + music.length * music.speed };
  const total = (/** @type {typeof pace} */ list) => ({ shots: list.reduce((n, p) => n + p.shots, 0), mean: Math.round((list.reduce((n, p) => n + p.mean * p.shots, 0) / (list.reduce((n, p) => n + p.shots, 0) || 1)) * 100) / 100 });
  const slow = total(pace.filter((p) => p.level !== 'loud')), fast = total(pace.filter((p) => p.level === 'loud'));
  const ratio = slow.shots >= 2 && fast.shots >= 2 ? Math.round((slow.mean / fast.mean) * 100) / 100 : null;
  /* a bar's changes are its cuts and punches; the bar that rushes into the lift is left out */
  const punchesAt = pictures.flatMap((p) => p.fx.filter((f) => f.kind !== 'push' && f.t > half).map((f) => toMusic(p.at + f.t)));
  const perBar = m.loudness.filter((b) => b.start >= used.from - 0.05 && b.end <= used.to + 0.05 && !(m.lift != null && Math.abs(b.end - m.lift) < 0.05))
    .map((b) => ({ db: b.db, cuts: shots.filter((x) => { const t = toMusic(x.at); return t >= b.start - half && t < b.end - half; }).length + punchesAt.filter((t) => t >= b.start - half && t < b.end - half).length }));
  const range = perBar.length ? Math.max(...perBar.map((b) => b.db)) - Math.min(...perBar.map((b) => b.db)) : 0;
  const r = perBar.length >= 6 && range >= 6 ? spearman(perBar.map((b) => b.db), perBar.map((b) => b.cuts)) : null;
  const shape = { slow, fast, ratio, bars: perBar.length, r: r == null ? null : Math.round(r * 100) / 100, ok: (ratio == null || ratio >= SLOWER) && (r == null || r >= FOLLOWS) };

  /* four shots or more of one length, give or take a frame, and longer than a burst of two bars: cut by the clock? */
  const burst = (2 * m.meter * 60) / m.bpm;
  /** @type {{ shots: number, length: number, from: string, at: number }[]} */
  const warnings = [];
  for (let a = 0; a < shots.length;) {
    let z = a + 1;
    while (z < shots.length && Math.abs(shots[z].length - shots[a].length) <= 1 / fps + 1e-6) z++;
    if (z - a >= 4 && shots.slice(a, z).reduce((s, x) => s + x.length, 0) > burst + half) warnings.push({ shots: z - a, length: Math.round((shots.slice(a, z).reduce((s, x) => s + x.length, 0) / (z - a)) * 100) / 100, from: shots[a].clip, at: shots[a].at });
    a = z;
  }

  /* what starts at the lift */
  let lift = null;
  if (m.lift != null) {
    const film = round(music.at + (m.lift - music.from) / music.speed);
    if (!inMusic(film)) lift = { music: m.lift, film, inFilm: false, cut: null };
    else {
      const near = marks.reduce((/** @type {(typeof marks)[number] | null} */ b, c) => (!b || Math.abs(c.t - film) < Math.abs(b.t - film) ? c : b), null);
      const frames = near ? Math.round((near.t - film) * fps * 10) / 10 : null;
      lift = { music: m.lift, film, inFilm: true, cut: near ? { t: near.t, frames, starts: near.starts, on: Math.abs(/** @type {number} */ (frames)) <= 1 } : null };
    }
  }

  /* the 卡点 feel: of the drop's beats and strong hits, how many the picture marks with a cut or a punch */
  const filmOf = (/** @type {number} */ x) => music.at + (x - music.from) / music.speed;
  const tol = 1 / fps + 1e-6;
  const fxMarks = pictures.flatMap((p) => p.fx.filter((f) => f.kind !== 'push').map((f) => p.at + f.t));
  const cutMarks = rows.map((c) => c.t);
  const inUse = (/** @type {number} */ x) => x >= used.from - half && x < used.to - half;
  /* the last bar is the ending: a shot may hold there */
  const ending = used.to - (m.meter * 60) / m.bpm - half;
  const md = withDrop(m);
  const dropBeats = m.lift == null ? [] : m.beats.filter((b) => inUse(b) && b < ending && roleAt(md, b, b + 60 / m.bpm) === 'drop').map(filmOf);
  const byCut = dropBeats.filter((t) => cutMarks.some((c) => Math.abs(c - t) <= tol));
  const byFx = dropBeats.filter((t) => !byCut.includes(t) && fxMarks.some((c) => Math.abs(c - t) <= tol));
  const strongIn = (m.accents ?? []).filter((a) => a.strength >= STRONG && inUse(a.t) && roleAt(md, a.t, a.t + 60 / m.bpm) === 'drop').map((a) => filmOf(a.t));
  const met = strongIn.filter((t) => cutMarks.concat(fxMarks).some((c) => Math.abs(c - t) <= tol));
  const calmBeats = m.beats.filter((b) => inUse(b) && ['build', 'calm'].includes(roleAt(md, b, b + 60 / m.bpm))).map(filmOf);
  const calmCuts = calmBeats.length ? cutMarks.filter((c) => c >= calmBeats[0] - tol && c <= /** @type {number} */ (calmBeats.at(-1)) + tol).length : 0;
  const share = dropBeats.length ? Math.round(((byCut.length + byFx.length) / dropBeats.length) * 100) / 100 : null;
  const feel = {
    drop: dropBeats.length ? { start: round(dropBeats[0]), end: round(/** @type {number} */ (dropBeats.at(-1)) + 60 / m.bpm / music.speed), beats: dropBeats.length, cuts: byCut.length, punches: byFx.length, share } : null,
    strong: { count: strongIn.length, met: met.length },
    calm: { beats: calmBeats.length, cuts: calmCuts },
    punched: fxMarks.length > 0,
    ok: dropBeats.length < 4 || (share ?? 0) >= MARKED,
  };

  /* where the film enters and leaves the music: on a bar line, or at the music's own start and end */
  const fromBar = (/** @type {number} */ t) => (m.bars.length ? Math.round((snap(m, t, 'bar').off / music.speed) * fps * 10) / 10 : null);
  const start = { music: round(used.from), frames: fromBar(used.from), track: used.from <= m.sound.start + 0.1 };
  const end = { music: round(used.to), frames: fromBar(used.to), track: used.to >= m.sound.end - 0.1 };
  /* whole phrases (4 bars) between the film's start and the lift */
  const phraseBars = m.lift != null && m.lift > used.from && m.lift < used.to ? m.bars.filter((b) => b >= used.from - half && b < m.lift - 1e-3).length : null;
  /* bars the kick and the harmony left a guess, with no lift to set them by, prove nothing */
  const sure = m.barBy === 'told' || m.barBy === 'lift' || m.barSure >= GUESS;
  const phrases = {
    sure,
    start: { ...start, ok: !sure || start.track || start.frames == null || Math.abs(start.frames) <= 1 },
    end: { ...end, ok: !sure || end.track || end.frames == null || Math.abs(end.frames) <= 1 },
    bars: phraseBars,
    ok: !sure || phraseBars == null || phraseBars % 4 === 0,
  };

  /* the render of this film, if there is one: the picture's black bars, which look --full does not report */
  const render = renderOf(filmFile);
  const barred = render ? await bars(render, shots) : [];
  const black = render ? await blackFrames(render, filmEnd, pictures, dir, gaps) : [];

  const off = rows.filter((c) => c.kind === 'off');
  /** @type {string[]} */
  const todo = [];
  if (off.length) todo.push(`${off.length} cut${off.length === 1 ? ' is' : 's are'} off the beat, the half beat and the hits (film ${off.slice(0, 6).map((c) => `${c.t.toFixed(2)} s ${c.frames > 0 ? '+' : ''}${c.frames} frames`).join(', ')}${off.length > 6 ? ', …' : ''}): move each to the beat, or say why it is off`);
  if (gaps.length) todo.push(`${gaps.length} GAP${gaps.length === 1 ? '' : 's'}: fill ${gaps.length === 1 ? 'it' : 'each'} or close ${gaps.length === 1 ? 'it' : 'them'}; a clip starts where the one before it ends (its \`at\` is the other's \`at\` plus its length, not a rounded time), or the frame there is black`);
  if (overlaps.length) todo.push(`${overlaps.length} OVERLAP${overlaps.length === 1 ? '' : 's'} on one track: one clip hides the other`);
  if (pastEnd.length) todo.push(`${pastEnd.length} clip${pastEnd.length === 1 ? ' is' : 's are'} trimmed past the end of the file (PAST END): choose another moment`);
  if (warnings.length) todo.push(`${warnings.length} run${warnings.length === 1 ? '' : 's'} of shots of one length (WARN): cut by the clock? give the shots their own lengths on the music's marks`);
  if (ratio != null && ratio < SLOWER) todo.push(`the quiet parts' shots are ${ratio}x as long as the loud parts' (want ${SLOWER}x or more): lengthen the shots in the quiet part, shorten them in the loud`);
  if (r != null && r < FOLLOWS) todo.push(`cuts per bar do not follow the music's level (r ${r.toFixed(2)}, want ${FOLLOWS} or more): more cuts in the loud bars, fewer in the quiet`);
  if (!phrases.start.ok) todo.push(`the film enters the music ${start.frames} frames from a bar line: start the music on a bar's first beat`);
  if (!phrases.end.ok) todo.push(`the film leaves the music ${end.frames} frames from a bar line: end on a bar line or the music's end, or fade the sound over the last bar`);
  if (!phrases.ok) todo.push(`the film starts ${phraseBars} bars before the lift: a whole number of phrases is 4, 8, 12, 16 bars (move the music's in point by whole bars)`);
  if (lift && !lift.inFilm) todo.push(`the lift (music ${lift.music} s) is not in the film: use the music from a phrase before it, unless the person asked for another part`);
  else if (lift?.cut && !lift.cut.on) todo.push(`no cut at the lift (film ${lift.film} s): put the strongest shot there`);
  if (feel.drop && !feel.ok) todo.push(`the drop (film ${feel.drop.start.toFixed(1)}–${feel.drop.end.toFixed(1)} s) marks only ${feel.drop.cuts + feel.drop.punches} of its ${feel.drop.beats} beats with a cut or a punch (${Math.round((share ?? 0) * 100)}%, want ${Math.round(MARKED * 100)}% or more): a 卡点 drop changes or hits the picture on nearly every beat; cut it one or two beats a shot (\`beats.mjs plan\` gives the slots)${feel.punched ? ' and run `beats.mjs punch film.html` again' : ', then run `beats.mjs punch film.html`'}`);
  else if (feel.drop && !feel.punched) todo.push('no punches yet: run `beats.mjs punch film.html` for a zoom punch on the beats inside the drop\'s shots, a flash at the lift and on each phrase, and a shake on the strong hits');
  if (barred.length) todo.push(`black bars in the picture of ${barred.length} shot${barred.length === 1 ? '' : 's'} (${barred.slice(0, 6).map((b) => `${b.clip} at film ${b.at.toFixed(2)} s, ${b.side}`).join('; ')}${barred.length > 6 ? '; …' : ''}): they are in the clip's own picture; scale or crop each clip with CSS until the frame is picture`);
  const own = black.filter((b) => b.cause === 'source'), drawn = black.filter((b) => b.cause === 'render');
  const seam = black.filter((b) => b.cause === 'hole');
  if (seam.length) todo.push(`${seam.length} black frame${seam.length === 1 ? '' : 's'} where two clips do not meet (${seam.slice(0, 6).map((b) => `film ${b.at.toFixed(2)} s`).join('; ')}${seam.length > 6 ? '; …' : ''}): close the GAP${seam.length === 1 ? '' : 's'} above, then render again`);
  if (own.length) todo.push(`black in the file itself where ${own.length === 1 ? 'a clip plays' : `${own.length} clips play`} (${own.map((b) => `${b.clip} at film ${b.at.toFixed(2)} s`).join('; ')}): start ${own.length === 1 ? 'it' : 'each'} at a moment of picture`);
  if (drawn.length) todo.push(`${drawn.length} black frame${drawn.length === 1 ? '' : 's'} in the render where the file has picture (${drawn.slice(0, 6).map((b) => `${b.clip} at film ${b.at.toFixed(2)} s`).join('; ')}${drawn.length > 6 ? '; …' : ''}): not the footage's, though look --full may call it that; render again, and where it stays start that clip a few frames earlier or later`);
  if (!render) todo.push('no render of this film yet: render it, run `npx openfilm look --full`, look at the cuts that matter, then run check again for the picture');
  return {
    music: { id: music.id, file: music.file, bpm: m.bpm, steady: m.steady, grid: m.grid },
    fps,
    cuts: rows,
    unknown,
    onBeat: rows.filter((c) => Math.abs(c.frames) <= 1).length,
    onGrid: rows.filter((c) => c.kind !== 'off').length,
    gaps,
    overlaps,
    pastEnd,
    pace,
    shape,
    phrases,
    warnings,
    lift,
    feel,
    render: render ? basename(render) : null,
    barred,
    black,
    todo,
  };
}

/** Spearman's rank correlation of two lists, ties given their mean rank. */
function spearman(/** @type {number[]} */ a, /** @type {number[]} */ b) {
  const ranks = (/** @type {number[]} */ v) => {
    const order = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const out = new Array(v.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return out;
  };
  const x = ranks(a), y = ranks(b);
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  let dot = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { dot += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return sx && sy ? dot / Math.sqrt(sx * sy) : 0;
}

/** The newest MP4 beside film.html that is not older than it: the render of this film. */
function renderOf(/** @type {string} */ filmFile) {
  const dir = dirname(resolve(filmFile));
  const since = statSync(filmFile).mtimeMs;
  return readdirSync(dir).filter((f) => /\.mp4$/i.test(f)).map((f) => join(dir, f))
    .filter((f) => statSync(f).mtimeMs >= since).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/**
 * Frames of pure black in the render that are neither the film's fade in nor its fade out (within half a second of
 * either end): at a hole between clips ('hole', a GAP), else, when the clip showing there is a video, whether its own
 * file is black at that moment ('source') or has picture ('render': the frame was drawn black).
 * @returns {Promise<{ at: number, until: number, clip: string, cause: string }[]>}
 */
async function blackFrames(/** @type {string} */ render, /** @type {number} */ filmEnd, /** @type {{ id: string, track: number, at: number, end: number | undefined, file: string, from: number, speed: number, tag: string }[]} */ pictures, /** @type {string} */ dir, /** @type {{ start: number, end: number }[]} */ gaps) {
  const err = await new Promise((ok) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', render, '-an', '-vf', 'blackdetect=d=0.03:pix_th=0.05', '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let text = '';
    p.stderr.on('data', (b) => { text += b; });
    p.on('error', () => ok(''));
    p.on('close', () => ok(text));
  });
  const found = [];
  for (const m of String(err).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
    const at = Number(m[1]), until = Number(m[2]);
    if (at < 0.5 || until > filmEnd - 0.5) continue;
    /* the picture showing then, the top track first */
    const showing = pictures.filter((p) => p.at <= at + 0.04 && (p.end ?? filmEnd) > at + 0.04).sort((a, b) => a.track - b.track || b.at - a.at)[0];
    let cause = gaps.some((g) => g.start <= at + 0.05 && g.end >= at - 0.05) ? 'hole' : 'render';
    if (cause === 'render' && showing && showing.tag === 'video' && existsSync(join(dir, showing.file))) {
      const t = showing.from + Math.max(0, at - showing.at) * showing.speed;
      try {
        const raw = /** @type {Buffer} */ (await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', join(dir, showing.file), '-frames:v', '1', '-vf', 'scale=16:9,format=gray', '-f', 'rawvideo', '-'], true));
        /* black everywhere, not a dark picture with a light in it */
        if (raw.length && raw.reduce((top, v) => Math.max(top, v), 0) < 30) cause = 'source';
      } catch { /* the file's frame could not be read: the render's */ }
    }
    found.push({ at: round(at), until: round(until), clip: showing?.id ?? 'no clip', cause });
  }
  return found;
}

/**
 * Black bars inside the picture, in the middle of each shot of the render: lines at the left, right, top or bottom
 * edge, 4% of the frame or more, that are pure black with the picture bright right up to them.
 * @returns {Promise<{ clip: string, at: number, side: string }[]>}
 */
async function bars(/** @type {string} */ render, /** @type {{ at: number, length: number, clip: string }[]} */ shots) {
  const W = 96, H = 54;
  /** @type {{ clip: string, at: number, side: string }[]} */
  const found = [];
  for (const s of shots) {
    const t = s.at + s.length / 2;
    let raw;
    try {
      raw = /** @type {Buffer} */ (await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', render, '-frames:v', '1', '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], true));
    } catch { continue; }
    if (raw.length < W * H) continue;
    const column = (/** @type {number} */ x) => { let hi = 0, sum = 0; for (let y = 0; y < H; y++) { hi = Math.max(hi, raw[y * W + x]); sum += raw[y * W + x]; } return { hi, mean: sum / H }; };
    const row = (/** @type {number} */ y) => { let hi = 0, sum = 0; for (let x = 0; x < W; x++) { hi = Math.max(hi, raw[y * W + x]); sum += raw[y * W + x]; } return { hi, mean: sum / W }; };
    /* black (14 of 255 at most) lines from the edge, then a picture at once: the first line past them averages 24 */
    const depth = (/** @type {(i: number) => { hi: number, mean: number }} */ line, /** @type {number} */ size, /** @type {boolean} */ far) => {
      let n = 0;
      while (n < size / 2 && line(far ? size - 1 - n : n).hi <= 14) n++;
      const next = line(far ? size - 1 - n : n);
      return n / size >= 0.04 && next.mean >= 24 ? n : 0;
    };
    const sides = /** @type {[string, number][]} */ ([['left', depth(column, W, false)], ['right', depth(column, W, true)], ['top', depth(row, H, false)], ['bottom', depth(row, H, true)]]).filter((x) => x[1]);
    if (sides.length) found.push({ clip: s.clip, at: round(t), side: sides.map((x) => x[0]).join(' and ') });
  }
  return found;
}

/* ---------- command line ---------- */

/**
 * Music is often felt at half or double its tempo: that reading, when the measure scores it close (within 4% of ×2 or
 * ×½), or when the tempo is under 80 or over 160. Other ratios (a 2/3 peak) are not named.
 * @param {{ bpm: number, tempos: { bpm: number, score: number }[] }} m
 */
export function otherTempo(m) {
  if (m.bpm < 80) return Math.round(m.bpm * 20) / 10;
  if (m.bpm > 160) return Math.round(m.bpm * 5) / 10;
  const top = m.tempos[0]?.score ?? 0;
  return m.tempos.find((t) => t.score >= 0.8 * top && [2, 0.5].some((r) => Math.abs(t.bpm / (m.bpm * r) - 1) <= 0.04))?.bpm;
}

/**
 * What to do when the bars are a guess. When the music lifts, the bars start from the lift's beat (found beat by beat,
 * so it is evidence the guessed bars are not): this says so. With no lift, ask the person to listen.
 * @param {{ barSure: number, barBy?: string, lift: number | null, liftBeat?: number | null }} m @param {string} page
 */
export function barAdvice(m, page) {
  if (m.barBy === 'told') return null;
  if (m.barBy === 'lift') return `bars: the kick and the harmony left the first beat of a bar a guess (sure ${m.barSure}), so the bars start from the beat where the music lifts, ${m.liftBeat} s, as a lift nearly always starts a bar; if another beat sounds like a bar's first, run again with --bar <that second>`;
  if (m.barSure >= 0.1) return null;
  if (m.lift != null && m.liftBeat != null) return `the first beat of each bar is a guess (sure ${m.barSure}). The music lifts on the beat at ${m.liftBeat} s (found beat by beat, not from these bars), and a lift nearly always starts a bar: run again with --bar ${m.liftBeat}`;
  return `the first beat of each bar is a guess (sure ${m.barSure}): ask the person to listen at ${page} and say a second that starts a bar, then run again with --bar <that second>`;
}

/**
 * What the beats are, in a line: the straight line the music keeps and how far the tracker's own beats had left it, or
 * that the tempo varies.
 * @param {{ grid: { regular: boolean, share: number, bpm?: number, moved?: number, worst?: number, between?: number[] } | null }} m @param {string} page
 */
export function gridLine(m, page) {
  const g = m.grid;
  if (!g) return 'too few beats to say whether the tempo is constant';
  if (!g.regular) return `the tempo is not constant (${Math.round(g.share * 100)}% of the music sits on one line of beats): the beats follow it and can be off in quiet parts; listen at ${page} before a cut that matters`;
  const moved = g.moved ? `; the tracker had ${g.moved} beats off that line, up to ${g.worst} frames at 30 fps between ${g.between?.[0]} and ${g.between?.[1]} s, and they are put on it` : '';
  const shifted = g.shifted ? '; the line had followed the off beat (the drop fell on its half beat and the kick is as strong there), so it is moved half a beat' : '';
  return `beats: a straight line at ${g.bpm} BPM${moved}${shifted}`;
}

async function main(/** @type {string[]} */ argv) {
  const flags = new Map();
  const rest = [];
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--strict' || argv[k] === '--json') flags.set(argv[k], true);
    else if (argv[k].startsWith('--')) flags.set(argv[k], argv[++k]);
    else rest.push(argv[k]);
  }
  const usage = 'node beats.mjs <music> [--out beats] [--meter 4] [--bpm <n>] [--bar <seconds>]\n       node beats.mjs plan <beats.json> [--length <film s>] [--from <music s>] [--to <music s>] [--json]\n       node beats.mjs punch [film.html] [--music <clip id or file>] [--dry]\n       node beats.mjs snap <beats.json> <seconds…> [--to beat|half|bar|hit]\n       node beats.mjs check [film.html] [--music <clip id or file>] [--fps 30] [--out <dir>] [--json] [--strict]';
  if (!rest.length || rest[0] === '--help' || flags.has('--help')) { console.log(usage); return 0; }
  const self = ((p) => (/\s/.test(p) ? `"${p}"` : p))(fileURLToPath(import.meta.url).split('\\').join('/'));
  if (rest[0] === 'snap') {
    const m = JSON.parse(readFileSync(rest[1], 'utf8'));
    const to = flags.get('--to') ?? 'beat';
    for (const t of rest.slice(2).map(Number)) console.log(JSON.stringify(snap(m, t, to)));
    return 0;
  }
  if (rest[0] === 'plan') {
    if (!rest[1]) { console.log(usage); return 2; }
    const m = JSON.parse(readFileSync(rest[1], 'utf8'));
    const num = (/** @type {string} */ k) => (flags.has(k) ? Number(flags.get(k)) : undefined);
    const p = plan(m, { length: num('--length'), from: num('--from'), to: num('--to') });
    const out = rest[1].replace(/\.json$/, '') + '.plan.json';
    writeFileSync(out, JSON.stringify(p, null, 1));
    if (flags.has('--json')) { console.log(JSON.stringify(p, null, 1)); return 0; }
    const name = m.file;
    console.log(`plan: music ${name} ${p.music.from}–${p.music.to} s → film 0–${p.length} s, ${p.music.bpm} BPM${p.music.liftFilm != null ? `, the lift at film ${p.music.liftFilm} s` : ', no lift in it'}; ${p.slots.length} shots`);
    for (const s of p.slots) {
      const fx = s.fx.filter((f) => f.kind !== 'push').map((f) => `${f.kind}${Math.abs(f.at - s.at) > 1e-3 ? ` +${round(f.at - s.at)}` : ''}`).join(' ');
      console.log(`  at ${s.at.toFixed(3).padStart(7)}  ${s.length.toFixed(3)} s  ${s.role.padEnd(5)}${s.lift ? '  ← the lift: the strongest moment' : ''}${fx ? `  ${fx}` : ''}`);
    }
    const by = (/** @type {string} */ r) => p.slots.filter((s) => s.role === r).length;
    console.log(`  ${by('build')} build (calm, a slow push), ${by('rush')} rushing into the lift, ${by('drop')} in the drop (a cut or a punch on every beat), ${by('mid') + by('calm')} after it, 1 to end on`);
    console.log(`  ${out}`);
    console.log(`NEXT: in film.html put the music at 0 as <audio src="<music>#t=${p.music.from},${p.music.to}" at="0"> and one clip per shot, each <video> at its "at" for its length (#t=in,in+length, at = the previous at + its length, exactly). Use a different moment for each shot, the strongest at the lift, motion in the drop. Then run: node ${self} punch film.html (the zoom punches, flashes and shakes), then check.`);
    return 0;
  }
  if (rest[0] === 'punch') {
    const film = rest[1] ?? 'film.html';
    const r = await punch(film, { music: flags.get('--music'), out: flags.get('--out'), dry: flags.has('--dry') });
    const count = (/** @type {string} */ k) => r.clips.reduce((n, c) => n + c.fx.filter((f) => f.kind === k).length, 0);
    console.log(`punch: ${r.clips.length} clip${r.clips.length === 1 ? '' : 's'} over ${r.music}: ${count('punch')} zoom punches, ${count('flash')} flashes, ${count('shake')} shakes, ${count('soft')} small punches into the lift, ${count('push')} slow pushes in calm parts${flags.has('--dry') ? ' (dry run: film.html not changed)' : `, written into ${film} (<style id="beat-cut-fx"> and each clip's animation and data-beat-fx)`}`);
    if (!r.clips.length) console.log('  nothing to punch: no picture clip over the music on the main track');
    console.log('NEXT: run check, then render and look at the lift and two drop beats (npx openfilm look <t>). Run punch again after changing any cut.');
    return 0;
  }
  if (rest[0] === 'check') {
    const film = rest[1] ?? 'film.html';
    const r = await check(film, { music: flags.get('--music'), fps: flags.has('--fps') ? Number(flags.get('--fps')) : undefined, out: flags.get('--out') });
    if (flags.has('--json')) console.log(JSON.stringify(r, null, 1));
    else {
      const g = r.music.grid;
      const line = g?.regular ? 'a straight line of beats' : g ? 'the tempo varies, the beats follow it' : 'beats as tracked';
      const count = (/** @type {string} */ k) => r.cuts.filter((c) => c.kind === k || (k === 'beat' && c.kind === 'bar')).length;
      console.log(`music ${r.music.id} (${r.music.bpm} BPM, ${line}, steady ${r.music.steady}); ${r.cuts.length} cuts over it, within a frame at ${r.fps} fps: ${count('beat')} on a beat, ${count('half')} on a half beat, ${count('hit')} on a hit, ${count('off')} off`);
      for (const c of r.cuts) {
        const mark = { bar: 'bar ', beat: 'beat', half: 'half', hit: 'hit ', off: 'OFF ' }[c.kind];
        console.log(`  ${mark} film ${c.t.toFixed(3)} s  music ${c.music.toFixed(3)} s  nearest beat ${c.beat.toFixed(3)} s  ${c.frames > 0 ? '+' : ''}${c.frames} frames  ${c.clips.join(', ')}`);
      }
      if (r.unknown) console.log(`  ${r.unknown} clip end(s) not checked: a picture or a page with no #t= length`);
      const secs = (/** @type {number} */ x, /** @type {number} */ digits) => x.toFixed(digits);
      for (const g of r.gaps) {
        /* a hole under a millisecond is told in tenths of a millisecond */
        const d = g.length >= 0.001 ? 3 : 4;
        console.log(`  GAP ${secs(g.length, d)} s with no picture ${g.after ? `after ${g.after}` : `before ${g.before}`} (film ${secs(g.start, d)}–${secs(g.end, d)} s${g.before ? '' : ', to the end of the film'})`);
      }
      for (const v of r.overlaps) console.log(`  OVERLAP ${v.length.toFixed(3)} s on track ${v.track}: ${v.b} starts before ${v.a} ends`);
      for (const p of r.pastEnd) console.log(`  PAST END ${p.clip}: #t= reaches ${p.end} s, the file is ${p.length} s long`);
      if (r.pace.length) {
        console.log('pace, shots by the music\'s sections:');
        for (const p of r.pace) console.log(`  ${p.level.padEnd(5)} music ${p.start.toFixed(1)}–${p.end.toFixed(1)} s (film ${p.film.start.toFixed(1)}–${p.film.end.toFixed(1)}): ${p.shots} shot${p.shots === 1 ? '' : 's'}, mean ${p.mean.toFixed(2)} s`);
      }
      const sh = r.shape;
      const parts = [];
      if (sh.ratio != null) parts.push(`shots in the quiet and mid parts average ${sh.slow.mean.toFixed(2)} s, in the loud parts ${sh.fast.mean.toFixed(2)} s (${sh.ratio}x; want ${SLOWER}x or more)`);
      else if (sh.slow.shots && !sh.fast.shots) parts.push('every shot is in a quiet or mid part');
      else if (sh.fast.shots && !sh.slow.shots) parts.push('every shot is in a loud part: the music used has no quiet part to slow down for');
      if (sh.r != null) parts.push(`cuts per bar against each bar's level: r ${sh.r.toFixed(2)} over ${sh.bars} bars (want ${FOLLOWS} or more)`);
      if (parts.length) console.log(`shape: ${parts.join('; ')}`);
      const ph = r.phrases;
      const where = (/** @type {{ music: number, frames: number | null, track: boolean }} */ e) => `music ${e.music} s, ${e.track ? "the music's own edge" : e.frames == null ? 'no bars measured' : `${e.frames > 0 ? '+' : ''}${e.frames} frames from a bar line`}`;
      console.log(`phrases${ph.sure ? '' : ' (the bars are a guess: not judged)'}: enters at ${where(ph.start)}; leaves at ${where(ph.end)}${ph.bars != null ? `; starts ${ph.bars} bars before the lift` : ''}`);
      for (const w of r.warnings) console.log(`  WARN ${w.shots} shots in a row of ${w.length.toFixed(2)} s (from ${w.from} at ${w.at.toFixed(3)} s): cut by the clock?`);
      if (r.lift) {
        const head = `lift ${r.lift.music} s → film ${r.lift.film} s`;
        const c = r.lift.cut;
        if (!r.lift.inFilm) console.log(`${head}: outside the stretch of music the film uses`);
        else if (c?.on) console.log(`${head}: ${c.starts.length ? `${c.starts.join(', ')} start${c.starts.length === 1 ? 's' : ''}` : 'a cut, but nothing starts there'}`);
        else console.log(`${head}: no cut at the lift${c ? ` (nearest cut ${c.t} s, ${c.frames > 0 ? '+' : ''}${c.frames} frames${c.starts.length ? `: ${c.starts.join(', ')}` : ''})` : ''}`);
      }
      const f = r.feel;
      if (f.drop) console.log(`卡点 feel: the drop, film ${f.drop.start.toFixed(1)}–${f.drop.end.toFixed(1)} s, marks ${f.drop.cuts + f.drop.punches} of ${f.drop.beats} beats (${Math.round((f.drop.share ?? 0) * 100)}%; want ${Math.round(MARKED * 100)}%): ${f.drop.cuts} by a cut, ${f.drop.punches} by a punch; strong hits marked ${f.strong.met} of ${f.strong.count}${f.calm.beats ? `; before the lift and in calm parts a cut every ${f.calm.cuts ? (f.calm.beats / f.calm.cuts).toFixed(1) : f.calm.beats} beats` : ''}`);
      else console.log('卡点 feel: no drop in the music the film uses (no loud part after a lift)');
      if (r.render) console.log(`picture:${r.barred.length ? `${r.barred.length} shot(s) with black bars` : 'no black bars'}, ${r.black.length ? `${r.black.length} black frame(s) inside the film (${r.black.map((b) => `${b.at.toFixed(2)} s`).join(', ')})` : 'no black frames inside the film'}, in the render ${r.render}`);
      console.log(r.todo.length ? `TO DO (${r.todo.length}):\n${r.todo.map((t) => `  - ${t}`).join('\n')}` : 'TO DO: nothing in the cuts.');
    }
    return flags.has('--strict') && (r.onGrid < r.cuts.length || r.gaps.length || r.pastEnd.length || !r.shape.ok || !r.feel.ok || r.barred.length || r.black.length) ? 1 : 0;
  }
  const file = rest[0];
  if (!existsSync(file)) throw new Error(`no file ${file}`);
  const o = { meter: flags.has('--meter') ? Number(flags.get('--meter')) : undefined, bpm: flags.has('--bpm') ? Number(flags.get('--bpm')) : undefined, bar: flags.has('--bar') ? Number(flags.get('--bar')) : undefined };
  const out = flags.get('--out') ?? 'beats';
  const m = await write(file, out, o);
  const name = basename(file, extname(file));
  console.log(`${m.file}: ${m.bpm} BPM, ${m.meter} a bar, ${m.beats.length} beats from ${m.beats[0] ?? '-'} s, ${m.bars.length} bars, ${m.hits.length} hits, steady ${m.steady}${m.lift != null ? `, lifts at ${m.lift} s` : ''}`);
  if (m.steady < 0.25) console.log('  little steady beat: cut on the hits and the phrases instead');
  console.log(`  sections: ${sectionLine(m)}`);
  console.log(`  ${gridLine(m, join(out, `${name}.html`))}`);
  const other = o.bpm ? undefined : otherTempo(m);
  if (other) console.log(`  it may also be ${other} BPM: if the beats feel wrong, run again with --bpm ${other}`);
  const advice = barAdvice(m, join(out, `${name}.html`));
  if (advice) console.log(`  ${advice}`);
  const strong = (m.accents ?? []).filter((a) => a.strength >= STRONG).length;
  console.log(`  ${strong} strong accents (kick, snare, clap) on the beats and half beats, the hits a 卡点 drop marks`);
  console.log(`  ${join(out, `${name}.json`)}, ${join(out, `${name}.html`)}`);
  console.log(`NEXT: node ${self} plan ${join(out, `${name}.json`)} --length <the film's seconds> for the stretch of music and the shots`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 2; });
}
