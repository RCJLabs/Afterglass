// Runs the night autopilot across seeds and prints what each night looked like on average.
// Usage: node tools/balance-night.mjs [nights=6] [seeds=30]
// The autopilot holds two stairs and patches candles; a person should do better. Read these as
// properties of the rules and the default numbers, not of good play.

import { newNightGame } from '../src/night.js';
import { runNightAuto } from '../src/night-autopilot.js';

const nights = Number(process.argv[2] || 6);
const seeds = Number(process.argv[3] || 30);
for (const policy of ['stairs', 'veil', 'chokes']) report(policy);

function report(policy) {
const rows = Array.from({ length: nights }, () => ({ n: 0, spawned: 0, killed: 0, crossed: 0, grabbed: 0, drained: 0, essence: 0, lost: 0, shades: 0, lostKeep: 0 }));
let over = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const s = runNightAuto(newNightGame(seed), { nights, policy });
  if (s.phase === 'over') over++;
  for (const n of s.nights) {
    const r = rows[n.night - 1];
    if (!r) continue;
    r.n++;
    for (const k of ['spawned', 'killed', 'crossed', 'grabbed', 'drained', 'essence']) r[k] += n[k];
    r.lost += n.lost.length;
    r.shades += n.fading.length;
    if (n.over) r.lostKeep++;
  }
}
const f1 = (x) => x.toFixed(1).padStart(8);
console.log(`\nPolicy '${policy}': ${seeds} seeds, up to ${nights} nights. Per-night averages over the runs that reached that night.\n`);
console.log('night' + ['reached', 'Creepers', 'killed', 'crossed', 'caught', 'drained', 'essence', 'faded', 'shades'].map((h) => h.padStart(9)).join(''));
rows.forEach((r, i) => {
  if (!r.n) return;
  const a = (k) => r[k] / r.n;
  console.log(String(i + 1).padEnd(5) + String(r.n).padStart(9) + [a('spawned'), a('killed'), a('crossed'), a('grabbed'), a('drained'), a('essence'), a('lost'), a('shades')].map(f1).map((x) => x.padStart(9)).join(''));
});
console.log(`\nKeeps lost before night ${nights} ended: ${over} of ${seeds}.`);
}
