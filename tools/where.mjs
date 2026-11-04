// Where beats.mjs misses an XSXB render's grid: node tools/where.mjs <export dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measure } from '../skills/beat-cut/scripts/beats.mjs';
const dir = process.argv[2];
const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
const beat = 60 / p.bpm;
const m = await measure(join(dir, 'mix.wav'));
console.log(m.beats.map((b) => { const k = b / beat; const off = (k - Math.round(k)) * beat; return Math.abs(off) <= 0.07 ? '.' : (off > 0 ? '+' : '-'); }).join(''));
console.log('beats', m.beats.length, 'truth', p.bars * 4);
