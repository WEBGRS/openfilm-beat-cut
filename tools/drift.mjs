// Tightness against drifting, humanised beats: node tools/drift.mjs
import { grid, wav, fmeasure } from '../test/synth.mjs';
import { measure } from '../skills/beat-cut/scripts/beats.mjs';
const cases = [
  { name: 'ramp 100-112', bpm: 100, end: 112, seconds: 60, jitter: 0 },
  { name: 'ramp 90-80', bpm: 90, end: 80, seconds: 60, jitter: 0 },
  { name: 'jitter 15ms 120', bpm: 120, seconds: 40, jitter: 0.015 },
  { name: 'ramp+jitter 128-136', bpm: 128, end: 136, seconds: 60, jitter: 0.012, start: 0.4 },
];
for (const c of cases) {
  const beats = grid(c); const f = `out/${c.name.replace(/\W+/g, '-')}.wav`; wav(f, beats, { seconds: c.seconds });
  const m = await measure(f);
  console.log(c.name.padEnd(22), 'F', fmeasure(m.beats, beats).toFixed(2), 'bars F', fmeasure(m.bars, beats.filter((_, k) => k % 4 === 0)).toFixed(2), 'bpm', m.bpm);
}
