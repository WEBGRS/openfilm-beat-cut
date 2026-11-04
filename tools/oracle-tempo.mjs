#!/usr/bin/env node
// Tempo against a library's listed BPM (incompetech.com pieces.json): node tools/oracle-tempo.mjs <music folder> <pieces.json>
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { measure } from '../skills/beat-cut/scripts/beats.mjs';
const [folder, list] = process.argv.slice(2);
const listed = new Map(JSON.parse(readFileSync(list, 'utf8')).map((p) => [String(p.title).toLowerCase(), Number(p.bpm)]));
let right = 0, n = 0;
for (const f of readdirSync(folder).filter((f) => /\.(mp3|m4a|wav)$/i.test(f))) {
  const want = listed.get(basename(f, extname(f)).replace(/-/g, ' '));
  if (!want) continue;
  const m = await measure(join(folder, f));
  const ok = Math.abs(m.bpm - want) <= 1;
  right += ok; n++;
  console.log(f.padEnd(28), 'listed', want, 'measured', m.bpm, ok ? 'ok' : `off (x${(m.bpm / want).toFixed(2)})`);
}
console.log(`${right}/${n} within 1 BPM`);
