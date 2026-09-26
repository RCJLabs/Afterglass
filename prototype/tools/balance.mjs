// Runs the autopilot across seeds and policies and prints how the rules behave.
// Usage: node tools/balance.mjs [days=20] [seeds=40]
// The autopilot plays by crude rules, so read these as properties of the rules, not of good play.

import { newGame } from '../src/sim.js';
import { runAuto, POLICIES } from '../src/autopilot.js';

const days = Number(process.argv[2] || 20);
const seeds = Number(process.argv[3] || 40);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (x) => x.toFixed(1);
const pct = (x) => `${Math.round(x * 100)}%`;

const rows = [];
for (const policy of Object.keys(POLICIES)) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const s = runAuto(newGame(seed), { days, policy });
    const ours = s.ledger.filter((e) => e.from === 'living');
    const woke = s.ledger.filter((e) => e.woke && e.woke !== 'funeral');
    const by = (k) => ours.filter((e) => e.cause === k).length;
    runs.push({
      fell: s.phase === 'fallen',
      living: s.living.length,
      deaths: ours.length,
      duty: by('duty'), oldage: by('oldage'), sickness: by('sickness'), neglect: by('neglect'),
      raiders: s.ledger.filter((e) => e.from === 'raider').length,
      funerals: s.ledger.filter((e) => e.woke === 'funeral').length,
      overflow: s.ledger.filter((e) => e.woke === 'overflow').length,
      wraiths: s.ledger.filter((e) => e.turned).length,
      inspectors: s.log.filter((l) => /sends an inspector/.test(l.text)).length,
      dread: avg(s.days.map((d) => d.dread)),
      held: avg(s.days.map((d) => d.shades)),
      nights: avg(woke.map((e) => e.nights)),
      essence: avg(s.days.map((d) => d.made.essence || 0)),
      mirrors: s.mirrors.length,
    });
  }
  const m = (k) => avg(runs.map((r) => r[k]));
  rows.push({
    policy,
    'fell by day': pct(m('fell')),
    'living at end': f1(m('living')),
    'our dead': f1(m('deaths')),
    'duty/age/sick/neglect': [m('duty'), m('oldage'), m('sickness'), m('neglect')].map(f1).join(' / '),
    'raider dead': f1(m('raiders')),
    funerals: f1(m('funerals')),
    'woke overflow': f1(m('overflow')),
    'turned Wraith': f1(m('wraiths')),
    inspectors: f1(m('inspectors')),
    'avg Dread': f1(m('dread')),
    'shades held': f1(m('held')),
    'nights served': f1(m('nights')),
    'essence/day': f1(m('essence')),
    mirrors: f1(m('mirrors')),
  });
}

console.log(`${seeds} seeds x ${days} days per policy. Averages per run unless marked.\n`);
const keys = Object.keys(rows[0]);
for (const k of keys.slice(1)) {
  console.log(k.padEnd(24) + rows.map((r) => String(r[k]).padStart(22)).join(''));
}
console.log(''.padEnd(24) + rows.map((r) => r.policy.padStart(22)).join(''));
console.log('\n' + Object.entries(POLICIES).map(([k, v]) => `${k}: ${v}`).join('\n'));
