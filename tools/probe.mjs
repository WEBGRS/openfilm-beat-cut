import { measure } from 'file:///C:/Users/ghs/Projects/Claude/openfilm-beat-cut/skills/beat-cut/scripts/beats.mjs';
const root='C:/Users/ghs/XSXB-Band/exports/';
for (const n of process.argv.slice(2)) { const m = await measure(root+n+'/mix.wav'); console.log(n.slice(0,22), m.bpm, JSON.stringify(m.tempos), 'barSure', m.barSure, 'first', m.beats.slice(0,6), 'bars', m.bars.slice(0,4)); }
