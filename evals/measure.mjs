#!/usr/bin/env node
// One measure for any film cut to a track: node evals/measure.mjs <film folder> --beats <beats.json> --period <s> --t0 <s>
// <beats.json> is beats.mjs run once on the music. --period and --t0 are a constant-tempo grid made apart from it.
// Node and ffmpeg only. Reads film.html and the newest MP4 outside assets/.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? undefined : process.argv[i + 1]; };
const folder = process.argv[2];
const bjs = JSON.parse(readFileSync(arg('beats'), 'utf8'));
const period = +arg('period'), t0 = +arg('t0');
const FPS = 30;

// Find the film and its render
const walk = (d, depth = 0) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('.') || ['node_modules', 'beats'].includes(e.name)) return [];
  const p = join(d, e.name);
  return e.isDirectory() ? (depth < 3 ? walk(p, depth + 1) : []) : [p];
});
const newest = (l) => l.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const files = walk(folder);
const filmFile = newest(files.filter((f) => basename(f) === 'film.html'));
const render = newest(files.filter((f) => /\.mp4$/i.test(f) && basename(dirname(f)) !== 'assets'));

// Clips of film.html
const clips = [];
let track = -1;
for (const m of readFileSync(filmFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<section\b[^>]*>|<(video|img|iframe|audio)\b([^>]*)>/g)) {
  if (!m[1]) { track++; continue; }
  const attrs = {};
  for (const a of m[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) attrs[a[1]] = a[2] ?? a[3] ?? true;
  const src = String(attrs.src ?? '');
  const h = src.indexOf('#t=');
  const file = h < 0 ? src : src.slice(0, h);
  const [a, b] = h < 0 ? [] : src.slice(h + 3).split(',');
  const from = a ? +a : 0, to = b ? +b : undefined, speed = attrs.speed ? +attrs.speed : 1;
  const path = join(dirname(filmFile), file);
  let length = NaN;
  if (to !== undefined) length = (to - from) / speed;
  else if (m[1] === 'iframe' && existsSync(path)) length = +(/duration\s*:\s*([\d.]+)/.exec(readFileSync(path, 'utf8'))?.[1] ?? NaN);
  else if (existsSync(path)) length = (+execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }) - from) / speed;
  clips.push({ tag: m[1], track, file, from, to, speed, at: +attrs.at || 0, length, muted: 'muted' in attrs, volume: attrs.volume !== undefined ? +attrs.volume : 1, overrides: attrs.overrides });
}
const pics = clips.filter((c) => c.tag !== 'audio');
const audio = clips.filter((c) => c.tag === 'audio');
const music = audio.filter((a) => basename(a.file, '.mp3') === basename(bjs.file ?? '', '.mp3')).sort((a, b) => a.at - b.at)[0]
  ?? [...audio].sort((a, b) => b.length - a.length)[0];
const pieces = audio.filter((a) => a.file === music.file);
const mEnd = Math.max(...pieces.map((a) => a.to ?? a.from + a.length * a.speed));
const toMusic = (t) => music.from + (t - music.at) * music.speed;

// Marks in music seconds
const beats = [];
for (let k = Math.ceil(-t0 / period); t0 + k * period < bjs.duration; k++) beats.push(t0 + k * period);
const halves = beats.flatMap((t) => [t, t + period / 2]);
const bjsHalves = bjs.beats.flatMap((t, i) => (i + 1 < bjs.beats.length ? [t, (t + bjs.beats[i + 1]) / 2] : [t]));
const nearest = (arr, t) => arr.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), arr[0]);
const frames = (arr, t) => Math.abs(nearest(arr, t) - t) * FPS;

// Cuts: picture clip edges, one per half frame, without the film's first and last moment
const edges = pics.flatMap((p) => [p.at, p.at + p.length]).filter(Number.isFinite).sort((a, b) => a - b);
const filmEnd = edges.at(-1);
const cuts = [];
for (const e of edges) if (e > 0.5 / FPS && e < filmEnd - 0.5 / FPS && (!cuts.length || e - cuts.at(-1) >= 0.5 / FPS)) cuts.push(e);
const onGrid = cuts.map((t) => frames(halves, toMusic(t)));
const onTool = cuts.map((t) => frames(bjsHalves, toMusic(t)));
const count = (a, n) => `${a.filter((x) => x <= n).length}/${a.length}`;
const mean = (a) => +(a.reduce((s, x) => s + x, 0) / (a.length || 1)).toFixed(2);

// Shots
const shots = pics.filter((p) => p.tag !== 'iframe' && Number.isFinite(p.length)).sort((a, b) => a.at - b.at);
const lens = shots.map((s) => s.length);
let run = 0, longestRun = 0;
for (let i = 0; i < lens.length; i++) { run = i && Math.abs(lens[i] - lens[i - 1]) < 1 / FPS ? run + 1 : 1; longestRun = Math.max(longestRun, run); }
const sections = {};
for (const s of shots) {
  const m = toMusic(s.at);
  const level = bjs.sections.find((x) => m >= x.start - 1e-3 && m < x.end - 1e-3)?.level ?? 'outside';
  (sections[level] ??= []).push(s.length);
}

// The lift
const lift = bjs.liftBeat ?? bjs.lift;
const liftIn = lift != null && lift > music.from && lift < mEnd;
const liftFilm = liftIn ? music.at + (lift - music.from) / music.speed : null;

// The render: cuts confirmed in the pixels, black frames, sound at the end
const scene = execFileSync('ffmpeg', ['-v', 'info', '-i', render, '-an', '-vf', "scale=320:180,select='gte(scene,0)',metadata=print:file=-", '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const score = [...scene.matchAll(/lavfi\.scene_score=([\d.]+)/g)].map((m) => +m[1]);
const peaks = score.flatMap((v, i) => (v > 0.1 && v >= (score[i - 1] ?? 0) && v >= (score[i + 1] ?? 0) ? [i / FPS] : []));
const confirmed = cuts.filter((c) => peaks.some((p) => Math.abs(p - c) <= 2 / FPS)).length;
const black = spawnSync('ffmpeg', ['-hide_banner', '-i', render, '-an', '-vf', 'blackdetect=d=0.03:pix_th=0.05', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', render, '-vn', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const db = (v) => +(20 * Math.log10(v + 1e-9)).toFixed(1);
const w = Math.round(0.3 * 22050);

console.log(JSON.stringify({
  film: filmFile, render,
  length: +filmEnd.toFixed(2),
  musicUsed: [+music.from.toFixed(2), +mEnd.toFixed(2)],
  cuts: cuts.length,
  cutsSeenInRender: confirmed,
  within1Frame_grid: count(onGrid, 1), within2Frames_grid: count(onGrid, 2), meanFrames_grid: mean(onGrid), worstFrames_grid: +Math.max(...onGrid).toFixed(2),
  within1Frame_beatsMjs: count(onTool, 1), within2Frames_beatsMjs: count(onTool, 2), meanFrames_beatsMjs: mean(onTool),
  chanceWithin1Frame: +((2 / FPS) / (period / 2)).toFixed(2),
  lift: { musicSecond: lift, inFilm: liftIn, filmSecond: liftFilm && +liftFilm.toFixed(2), framesToNearestCut: liftIn ? +(Math.abs(nearest(cuts, liftFilm) - liftFilm) * FPS).toFixed(1) : null,
    shot: liftIn ? pics.filter((p) => p.at <= liftFilm + 1 / FPS && p.at + p.length > liftFilm + 1 / FPS).map((p) => `${basename(p.file)}#${p.from}`) : null },
  shots: shots.length, shortest: +Math.min(...lens).toFixed(2),
  longestRunOfOneLength: longestRun,
  shotsBySection: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, { n: v.length, meanSeconds: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }])),
  speedChanged: pics.filter((c) => c.speed !== 1).length,
  clipsWithSoundOn: pics.filter((p) => p.tag === 'video' && !p.muted && p.volume > 0).length,
  blackStretches: [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]),
  sound: { whole_dB: db(rms(0, x.length)), last03s_dB: db(rms(x.length - w, x.length)) },
}, null, 1));
