#!/usr/bin/env node
// Score beats.mjs against XSXB-Band renders, whose score gives the true grid (beat 0 at 0 s).
//   node tools/oracle-xsxb.mjs <exports dir>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { measure } from '../skills/beat-cut/scripts/beats.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node tools/oracle-xsxb.mjs <XSXB-Band exports folder>'); process.exit(2); }
const TOL = 0.07;

/** Share of `got` within TOL of `want`, and of `want` found: F-measure. */
export function fmeasure(got, want) {
  const used = new Set();
  let hit = 0;
  for (const g of got) {
    let best = -1;
    want.forEach((w, k) => { if (!used.has(k) && Math.abs(w - g) <= TOL && (best < 0 || Math.abs(w - g) < Math.abs(want[best] - g))) best = k; });
    if (best >= 0) { used.add(best); hit++; }
  }
  const p = hit / (got.length || 1), r = hit / (want.length || 1);
  return p + r ? (2 * p * r) / (p + r) : 0;
}

const rows = [];
for (const name of readdirSync(root)) {
  const dir = join(root, name);
  if (!existsSync(join(dir, 'mix.wav'))) continue;
  const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const [meter] = p.timeSignature ?? [4, 4];
  const beat = 60 / p.bpm;
  const truth = Array.from({ length: p.bars * meter }, (_, k) => k * beat);
  const truthBars = truth.filter((_, k) => k % meter === 0);
  const m = await measure(join(dir, 'mix.wav'), { meter });
  const offs = m.beats.map((b) => { const k = Math.round(b / beat); return b - k * beat; }).filter((d) => Math.abs(d) < TOL);
  const median = offs.sort((a, b) => a - b)[Math.floor(offs.length / 2)] ?? NaN;
  rows.push({
    name: name.replace(/-\d{10,}.*$/, ''),
    bpm: p.bpm,
    got: m.bpm,
    f: Math.round(fmeasure(m.beats, truth) * 100) / 100,
    bars: Math.round(fmeasure(m.bars, truthBars) * 100) / 100,
    barSure: m.barSure,
    steady: m.steady,
    offMs: Math.round(median * 1000),
  });
}
console.table(rows);
const mean = (k) => Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 100) / 100;
console.log(`mean beat F ${mean('f')}, mean bar F ${mean('bars')}, tempo right (±2%) ${rows.filter((r) => Math.abs(r.got / r.bpm - 1) < 0.02).length}/${rows.length}`);
