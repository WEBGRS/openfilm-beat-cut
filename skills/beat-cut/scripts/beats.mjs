#!/usr/bin/env node
// @ts-check
/**
 * A piece of music measured for cutting a film on it, and a film's cuts measured against it.
 *
 *   node beats.mjs <music> [--out <dir>] [--meter 4] [--bpm <n>] [--bar <seconds>]
 *       writes <out>/<name>.json and <name>.html (out: ./beats): the tempo, every beat, the bars' first beats, the
 *       hits that stand out, how loud each stretch is and where the music lifts. --bpm sets the tempo and --bar a
 *       second that is a bar's first beat, when they are known (from the music's source, or by listening)
 *   node beats.mjs snap <beats.json> <seconds…> [--to beat|half|bar|hit]
 *       the nearest beat (half beat, bar, hit) to each music second
 *   node beats.mjs check [film.html] [--music <clip id or file>] [--fps 30] [--json] [--strict]
 *       every picture cut of the film, in frames from the music's nearest beat; --strict exits 1 when one is off
 *
 * The measure, format "openfilm-beats/1", every time in the music file's own seconds:
 *   { format, file, duration, bpm, meter, steady, tempos: [{ bpm, score }], beats, bars, hits: [{ t, strength, onBeat }],
 *     sound: { start, end }, loudness: [{ start, end, db }], sections: [{ start, end, level }], lift }
 * `beats` and `bars` are seconds (bars: the first beat of each bar). `steady` (0–1) says how clearly the music keeps a
 * beat: under 0.25 there is little to cut on, and the hits are the better marks. `loudness` is each bar's level in dB
 * under the loudest bar; `sections` group bars of a like level (quiet, mid, loud); `lift` is the bar where the music
 * rises most, or null.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
async function decode(/** @type {string} */ file) {
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
function envelopes(/** @type {Float32Array} */ pcm) {
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
  const chosen = o.bpm ?? peaks[0]?.bpm ?? 120;
  const steady = Math.max(0, Math.min(1, peaks[0]?.raw ?? 0));
  const frames = trackBeats(env.onset, (FPS * 60) / chosen);
  const beats = frames.map((f) => round((onPeak(env.onset, f) * HOP) / RATE));
  /* the tempo the beats keep, from their spacing */
  const gaps = beats.slice(1).map((b, k) => b - beats[k]).sort((a, b) => a - b);
  const bpm = gaps.length ? Math.round((600 / gaps[Math.floor(gaps.length / 2)])) / 10 : chosen;
  const known = o.bar != null && beats.length ? beats.reduce((best, b, k) => (Math.abs(b - /** @type {number} */ (o.bar)) < Math.abs(beats[best] - /** @type {number} */ (o.bar)) ? k : best), 0) : -1;
  const { phase, sure } = known >= 0 ? { phase: known % meter, sure: 1 } : barStart(frames, env, meter);
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
  const top = Math.max(...raw.map((b) => b.db), -Infinity);
  const loudness = raw.map((b) => ({ start: b.start, end: b.end, db: Math.round((b.db - top) * 10) / 10 }));
  const level = (/** @type {number} */ db) => (db > -4 ? 'loud' : db > -10 ? 'mid' : 'quiet');
  /** @type {{ start: number, end: number, level: string }[]} */
  const sections = [];
  loudness.forEach((b, k) => {
    const here = level(b.db), next = loudness[k + 1] ? level(loudness[k + 1].db) : here;
    const last = sections.at(-1);
    /* a level holds for two bars before it is a section of its own */
    if (last && (last.level === here || (here !== next && k + 1 < loudness.length))) last.end = b.end;
    else sections.push({ start: b.start, end: b.end, level: here });
  });
  let lift = null, rise = 4;
  for (let k = 2; k < loudness.length; k++) {
    const up = loudness[k].db - (loudness[k - 1].db + loudness[k - 2].db) / 2;
    if (up > rise) { rise = up; lift = loudness[k].start; }
  }
  return {
    format: FORMAT,
    file: basename(file),
    duration: round(duration),
    bpm,
    meter,
    barSure: Math.round(sure * 100) / 100,
    steady: Math.round(steady * 100) / 100,
    tempos: peaks.slice(0, 3).map((p) => ({ bpm: Math.round(p.bpm * 10) / 10, score: Math.round(p.score * 100) / 100 })),
    beats,
    bars,
    hits,
    sound,
    loudness,
    sections,
    lift,
  };
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
  };
}

/** How long a media file lasts, by ffprobe. */
async function mediaLength(/** @type {string} */ file) {
  const out = /** @type {string} */ (await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));
  const s = Number(out.trim());
  return Number.isFinite(s) ? s : undefined;
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

/** The measure of a music file, read from <out>/<name>.json when it is newer than the file, else made and saved. */
async function measured(/** @type {string} */ file, /** @type {string} */ out) {
  const json = join(out, `${basename(file, extname(file))}.json`);
  if (existsSync(json) && statSync(json).mtimeMs >= statSync(file).mtimeMs) {
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

/**
 * Every picture cut of a film against its music: each clip's start and end on a shown picture track, in frames from
 * the music's nearest beat. The music is the clip named by `music` (id or file), else the longest sound with no words
 * beside it (a .vtt is a voice).
 * @param {string} filmFile @param {{ music?: string, fps?: number, out?: string }} [o]
 */
export async function check(filmFile, o = {}) {
  const dir = dirname(resolve(filmFile));
  const fps = o.fps ?? 30;
  const tracks = filmTracks(readFileSync(filmFile, 'utf8')).filter((t) => !('hidden' in t.attrs));
  const sounds = tracks.flatMap((t) => t.clips.filter((c) => c.tag === 'audio').map(clipOf));
  const named = o.music && sounds.find((s) => s.id === o.music || s.file === o.music || basename(s.file) === o.music);
  if (o.music && !named) throw new Error(`no sound clip "${o.music}" in ${filmFile}`);
  const candidates = named ? [named] : sounds.filter((s) => !existsSync(join(dir, s.file.replace(/\.[^./]+$/, '.vtt'))));
  /** @type {(ReturnType<typeof clipOf> & { length: number }) | undefined} */
  let music;
  for (const s of candidates) {
    const length = await lengthOf(s, dir);
    if (length != null && (!music || length > music.length)) music = { ...s, length };
  }
  if (!music) throw new Error(`no music in ${filmFile}: a sound clip with no .vtt beside it, or --music <clip id>`);
  const m = await measured(join(dir, music.file), o.out ?? join(dir, 'beats'));

  /** @type {{ t: number, clip: string, edge: 'start' | 'end' }[]} */
  const edges = [];
  let filmEnd = 0, unknown = 0;
  for (const t of tracks) {
    for (const raw of t.clips) {
      const c = clipOf(raw);
      const length = await lengthOf(c, dir);
      if (length != null) filmEnd = Math.max(filmEnd, c.at + length);
      if (c.tag === 'audio') continue;
      edges.push({ t: c.at, clip: c.id, edge: 'start' });
      if (length == null) unknown++;
      else edges.push({ t: c.at + length, clip: c.id, edge: 'end' });
    }
  }
  /** @type {Map<number, { t: number, clips: string[] }>} */
  const cuts = new Map();
  for (const e of edges) {
    if (e.t <= 1e-3 || e.t >= filmEnd - 1e-3) continue;
    const key = Math.round(e.t * 1000);
    const cut = cuts.get(key) ?? { t: key / 1000, clips: [] };
    cut.clips.push(`${e.clip} ${e.edge}s`);
    cuts.set(key, cut);
  }
  const rows = [...cuts.values()].sort((a, b) => a.t - b.t).flatMap((cut) => {
    if (cut.t < music.at - 1e-3 || cut.t > music.at + music.length + 1e-3) return [];
    const inMusic = music.from + (cut.t - music.at) * music.speed;
    const beat = snap(m, inMusic, 'beat'), bar = snap(m, inMusic, 'bar');
    const frames = Math.round(((beat.at - inMusic) / music.speed) * fps * 10) / 10;
    return [{ t: cut.t, music: round(inMusic), beat: beat.at, bar: Math.abs(bar.off) < 1e-3 + Math.abs(beat.off), frames, clips: cut.clips }];
  });
  return { music: { id: music.id, file: music.file, bpm: m.bpm, steady: m.steady }, fps, cuts: rows, unknown, onBeat: rows.filter((r) => Math.abs(r.frames) <= 1).length };
}

/* ---------- command line ---------- */

async function main(/** @type {string[]} */ argv) {
  const flags = new Map();
  const rest = [];
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--strict' || argv[k] === '--json') flags.set(argv[k], true);
    else if (argv[k].startsWith('--')) flags.set(argv[k], argv[++k]);
    else rest.push(argv[k]);
  }
  const usage = 'node beats.mjs <music> [--out beats] [--meter 4] [--bpm <n>] [--bar <seconds>]\n       node beats.mjs snap <beats.json> <seconds…> [--to beat|half|bar|hit]\n       node beats.mjs check [film.html] [--music <clip id or file>] [--fps 30] [--json] [--strict]';
  if (!rest.length || rest[0] === '--help' || flags.has('--help')) { console.log(usage); return 0; }
  if (rest[0] === 'snap') {
    const m = JSON.parse(readFileSync(rest[1], 'utf8'));
    const to = flags.get('--to') ?? 'beat';
    for (const t of rest.slice(2).map(Number)) console.log(JSON.stringify(snap(m, t, to)));
    return 0;
  }
  if (rest[0] === 'check') {
    const film = rest[1] ?? 'film.html';
    const r = await check(film, { music: flags.get('--music'), fps: flags.has('--fps') ? Number(flags.get('--fps')) : undefined });
    if (flags.has('--json')) console.log(JSON.stringify(r, null, 1));
    else {
      console.log(`music ${r.music.id} (${r.music.bpm} BPM, steady ${r.music.steady}); ${r.cuts.length} cuts over it, ${r.onBeat} on a beat (within a frame at ${r.fps} fps)`);
      for (const c of r.cuts) {
        const mark = Math.abs(c.frames) <= 1 ? (c.bar ? 'bar ' : 'beat') : 'OFF ';
        console.log(`  ${mark} film ${c.t.toFixed(3)} s  music ${c.music.toFixed(3)} s  nearest beat ${c.beat.toFixed(3)} s  ${c.frames > 0 ? '+' : ''}${c.frames} frames  ${c.clips.join(', ')}`);
      }
      if (r.unknown) console.log(`  ${r.unknown} clip end(s) not checked: a picture or a page with no #t= length`);
    }
    return flags.has('--strict') && r.onBeat < r.cuts.length ? 1 : 0;
  }
  const file = rest[0];
  if (!existsSync(file)) throw new Error(`no file ${file}`);
  const o = { meter: flags.has('--meter') ? Number(flags.get('--meter')) : undefined, bpm: flags.has('--bpm') ? Number(flags.get('--bpm')) : undefined, bar: flags.has('--bar') ? Number(flags.get('--bar')) : undefined };
  const out = flags.get('--out') ?? 'beats';
  const m = await write(file, out, o);
  const name = basename(file, extname(file));
  console.log(`${m.file}: ${m.bpm} BPM, ${m.meter} a bar, ${m.beats.length} beats from ${m.beats[0] ?? '-'} s, ${m.bars.length} bars, ${m.hits.length} hits, steady ${m.steady}${m.lift != null ? `, lifts at ${m.lift} s` : ''}`);
  if (m.steady < 0.25) console.log('  little steady beat: cut on the hits and the phrases instead');
  /* music felt at half or double its tempo is common: say the other reading */
  const near = m.tempos.find((t) => t.score >= 0.8 * m.tempos[0].score && Math.abs(t.bpm / m.bpm - 1) > 0.05)?.bpm;
  const other = o.bpm ? undefined : m.bpm < 80 ? Math.round(m.bpm * 20) / 10 : m.bpm > 160 ? Math.round(m.bpm * 5) / 10 : near;
  if (other) console.log(`  it may also be ${other} BPM: if the beats feel wrong, run again with --bpm ${other}`);
  if (m.barSure < 0.1) console.log(`  the first beat of each bar is a guess (sure ${m.barSure}): look at ${name}.html, or give --bar <a second that starts a bar>`);
  console.log(`  ${join(out, `${name}.json`)}, ${join(out, `${name}.html`)}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 2; });
}
