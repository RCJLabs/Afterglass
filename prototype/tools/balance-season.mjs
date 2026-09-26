// Runs the season autopilot across seeds and plans and prints how the season went on average.
// Usage: node tools/balance-season.mjs [seeds=100] [seasons=1]
// The autopilot is a crude player (it holds the stairs up to the Veil and relights candles). Read the
// numbers as properties of the rules and the default tuning, not of good play.

import { runSeasonAuto, PLANS } from '../src/slice/autopilot.js';

const seeds = Number(process.argv[2] || 100);
const seasons = Number(process.argv[3] || 1);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-').padStart(5);
const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-').padStart(5);

for (const plan of PLANS) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) runs.push(runSeasonAuto(seed, { plan, seasons }));
  console.log(`\nPlan '${plan}': ${seeds} seeds, ${seasons} season${seasons === 1 ? '' : 's'}.`);
  for (let k = 1; k <= seasons; k++) {
    const recs = runs.map((s) => s.seasons.find((e) => e.season === k)).filter(Boolean);
    const won = recs.filter((e) => !e.lost);
    const lostDay = {};
    for (const e of recs.filter((x) => x.lost)) lostDay[`${e.lost} d${e.day}`] = (lostDay[`${e.lost} d${e.day}`] || 0) + 1;
    const S = recs.map((e) => e.summary);
    const raids = S.flatMap((x) => x.raids);
    const insp = S.flatMap((x) => x.inspections);
    const hollow = {};
    for (const x of won.map((e) => e.summary.hollow)) hollow[x] = (hollow[x] || 0) + 1;
    const causes = {};
    for (const x of S) for (const [c, n] of Object.entries(x.byCause)) causes[c] = (causes[c] || 0) + n / S.length;
    console.log(`  season ${k}: reached ${recs.length}, finished ${pct(won.length, recs.length)}   lost: ${JSON.stringify(lostDay)}`);
    console.log(`    deaths/season ${avg(S.map((x) => x.deaths))}   by cause ${Object.entries(causes).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n.toFixed(2)}`).join(', ')}`);
    console.log(`    raids held ${pct(raids.filter((r) => r.held).length, raids.length)}   inspections ${['blessed', 'warned', 'censured'].map((v) => `${v} ${insp.filter((i) => i.verdict === v).length}`).join(', ')}   (${insp.length} in ${recs.length} seasons)`);
    console.log(`    shades lost at night ${avg(S.map((x) => x.lost.length))}   cracks ${avg(S.map((x) => x.cracks))}   Hollow (finished seasons) ${JSON.stringify(hollow)}`);
    console.log(`    at the end: living ${avg(won.map((e) => e.summary.living))}   shades ${avg(won.map((e) => e.summary.shades))}   Dread ${avg(won.map((e) => e.summary.dread))}`);
  }
}
