// The measurement behind the design record's standing tables (round seven, phase 6). Runs the autopilot's plans
// and switches (tools/AUTOPILOT.md) over the same seeds, each configuration in a process of its own (the
// switches are read when the autopilot loads), and prints the tables; with --readme it writes them into
// prototype/README.md between their markers, so the tables there come from this file and nothing else.
//
//   node tools/measure.mjs [--seeds 200] [--only plans,verbs] [--jobs 4] [--readme]
//
// Every keep is played by the rules as they are, from the first spring: a plan's first year is its first four
// seasons. Paired comparisons play the same seeds, so a switch's column says on how many seeds it did better
// and worse than the balanced plan, not just how many it finished.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = fileURLToPath(import.meta.url);
const README = new URL('../README.md', import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};

/* ---------------------------------------------------------------- a worker: one configuration, some seeds */

if (process.argv[2] === '--worker') {
  const job = JSON.parse(process.argv[3]);
  const { autoStep, closeYear } = await import('../src/slice/autopilot.js');
  const { newSeason, act } = await import('../src/slice/sim.js');
  for (let seed = job.from; seed <= job.to; seed++) {
    const s = newSeason(seed, job.tuning || {});
    let heard = 0;
    let dawn = null;
    for (let guard = 0; guard < 2e7; guard++) {
      if (s.phase === 'over') break;
      if (s.phase === 'end') {
        if (s.season >= job.seasons) break;
        if (!closeYear(s) && !act(s, { type: 'nextSeason' }).ok) break;
        continue;
      }
      if (s.phase === 'dawn' && dawn !== `${s.season}/${s.day}`) {
        dawn = `${s.season}/${s.day}`;
        if (s.rite?.heard) heard++;
      }
      autoStep(s, job.plan);
    }
    const E = s.seasons;
    const count = (f) => s.actions.filter(({ a }) => f(a)).length;
    const rec = {
      seed,
      fin: E.filter((e) => !e.lost).length,
      lost: E.find((e) => e.lost) ? { season: E.find((e) => e.lost).season, day: E.find((e) => e.lost).day, why: E.find((e) => e.lost).lost } : null,
      deaths: E.map((e) => e.summary.deaths),
      raids: E.flatMap((e) => e.summary.raids.map((r) => (r.held ? 1 : 0))),
      verdicts: E.flatMap((e) => e.summary.inspections.map((i) => i.verdict)),
      shadesLost: E.map((e) => e.summary.lost.length),
      hollow: E.filter((e) => !e.lost).map((e) => e.summary.hollow),
      use: { hush: count((a) => a.type === 'hush' && a.on), bind: count((a) => a.type === 'rite' && a.choice === 'bind'), curfew: count((a) => a.type === 'decree' && a.id === 'curfew'), keeper: count((a) => a.type === 'takeGlass'), heard },
    };
    process.stdout.write(`${JSON.stringify(rec)}\n`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- the runs */

const SEEDS = Number(arg('seeds', 200));
const JOBS = Number(arg('jobs', cpus().length));
const ONLY = arg('only', 'plans,verbs').split(',');
const YEAR = 4;
// The configurations: each plan's first year, and each verb's switch on the balanced plan, against the balanced
// plan on the same seeds (The Keeper, which comes at a year's end, over two).
const PLAN_ROWS = ['balanced', 'human', 'keeper', 'mourner', 'double', 'idle'];
const VERBS = [
  { key: 'hush', env: { AP_HUSH: '1' }, name: 'Hush (`AP_HUSH`)', what: 'hushes while shades stand in the dark with the Unlit close and no candle to spare' },
  { key: 'bind', env: { AP_BIND: '1' }, name: 'Bind (`AP_BIND`)', what: 'binds a Restless shade into a free mirror when the essence can be spared' },
  { key: 'curfew', env: { AP_CURFEW: '1' }, name: 'The curfew (`AP_CURFEW`)', what: 'proclaims the curfew once sleepwalkers or Weepers can come' },
  { key: 'heard', env: { AP_COURT: '1' }, name: 'The Court (`AP_COURT`)', what: 'seats a shade in the Court of Shades before a rite where one will ask' },
  { key: null, env: { AP_TALL: 'line' }, name: 'Building by choice (`AP_TALL=line`)', what: 'builds tall, with the Chapel on the line’s floor' },
  { key: 'keeper', env: { AP_ENDING: 'watch' }, name: 'The Keeper (`AP_ENDING=watch`)', what: 'takes its own place in the glass at the first year’s end', seasons: 2 * YEAR },
];
const configs = [];
if (ONLY.includes('plans')) for (const plan of PLAN_ROWS) configs.push({ id: `plan:${plan}`, plan, seasons: YEAR, env: {} });
if (ONLY.includes('verbs')) {
  if (!ONLY.includes('plans')) configs.push({ id: 'plan:balanced', plan: 'balanced', seasons: YEAR, env: {} });
  configs.push({ id: 'plan:balanced:2y', plan: 'balanced', seasons: 2 * YEAR, env: {} });
  for (const v of VERBS) configs.push({ id: `verb:${v.name}`, plan: 'balanced', seasons: v.seasons || YEAR, env: v.env });
}

function run() {
  const chunk = Math.max(5, Math.ceil(SEEDS / 8));
  const queue = [];
  for (const c of configs) for (let from = 1; from <= SEEDS; from += chunk) queue.push({ c, from, to: Math.min(SEEDS, from + chunk - 1) });
  const out = Object.fromEntries(configs.map((c) => [c.id, []]));
  let done = 0;
  return new Promise((resolve, reject) => {
    let running = 0;
    const next = () => {
      if (!queue.length && !running) return resolve(out);
      while (running < JOBS && queue.length) {
        const { c, from, to } = queue.shift();
        running++;
        const p = spawn(process.execPath, [HERE, '--worker', JSON.stringify({ plan: c.plan, seasons: c.seasons, from, to })], { env: { ...process.env, ...c.env }, stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        p.stdout.on('data', (d) => (buf += d));
        p.on('exit', (code) => {
          if (code) return reject(new Error(`${c.id} ${from}-${to} exited ${code}`));
          for (const line of buf.trim().split('\n').filter(Boolean)) out[c.id].push(JSON.parse(line));
          running--;
          done++;
          process.stderr.write(`\r${done} of ${done + queue.length + running} runs`);
          next();
        });
      }
    };
    next();
  });
}

/* ---------------------------------------------------------------- the tables */

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–');
const median = (xs) => {
  if (!xs.length) return '–';
  const a = [...xs].sort((p, q) => p - q);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const bySeed = (rs) => new Map(rs.map((r) => [r.seed, r]));

function plansTable(R) {
  const cols = PLAN_ROWS.filter((p) => R[`plan:${p}`]?.length);
  const rs = (p) => R[`plan:${p}`].sort((a, b) => a.seed - b.seed);
  const row = (name, f) => `| ${name} | ${cols.map((p) => f(rs(p))).join(' | ')} |`;
  const names = { balanced: 'Balanced', human: 'Human', keeper: 'Keeper', mourner: 'Mourner', double: 'Double', idle: 'Idle' };
  const hollow = (r) => {
    const h = r.flatMap((x) => x.hollow);
    return h.length ? `${h.filter((x) => x === 'crossed').length} / ${h.filter((x) => x === 'driven back').length} / ${h.filter((x) => x === 'withdrew').length}` : '–';
  };
  const lost = (r) => {
    const by = {};
    for (const x of r.filter((y) => y.lost)) by[x.lost.season] = (by[x.lost.season] || 0) + 1;
    return [1, 2, 3, 4].map((k) => by[k] || 0).join(' / ');
  };
  return [
    `| | ${cols.map((p) => names[p]).join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    row('First season finished', (r) => pct(r.filter((x) => x.fin >= 1).length, r.length)),
    row('**First year finished**', (r) => `**${pct(r.filter((x) => x.fin >= YEAR).length, r.length)}**`),
    row('Lost in spring / summer / autumn / winter', lost),
    row('Your deaths per season', (r) => avg(r.flatMap((x) => x.deaths))),
    row('Raids held', (r) => pct(r.flatMap((x) => x.raids).filter(Boolean).length, r.flatMap((x) => x.raids).length)),
    row('Church: blessed / warned / censured', (r) => ['blessed', 'warned', 'censured'].map((v) => r.flatMap((x) => x.verdicts).filter((y) => y === v).length).join(' / ')),
    row('Shades lost at night per season', (r) => avg(r.flatMap((x) => x.shadesLost))),
    row('The Hollow, in finished seasons: reached the Veil / driven back / withdrew', hollow),
  ].join('\n');
}

function verbsTable(R) {
  const lines = ['| Verb | What the autopilot does with it | Used, per keep | Finished | The balanced plan | Better on / worse on |', '|---|---|---|---|---|---|'];
  for (const v of VERBS) {
    const mine = R[`verb:${v.name}`];
    if (!mine) continue;
    const seasons = v.seasons || YEAR;
    const base = bySeed(R[seasons > YEAR ? 'plan:balanced:2y' : 'plan:balanced']);
    const done = (x) => x.fin >= seasons;
    const better = mine.filter((x) => x.fin > base.get(x.seed).fin).length;
    const worse = mine.filter((x) => x.fin < base.get(x.seed).fin).length;
    const used = v.key ? avg(mine.map((x) => x.use[v.key])) : '–';
    const span = seasons > YEAR ? 'two years' : 'the first year';
    lines.push(`| ${v.name} | ${v.what} | ${used} | ${mine.filter(done).length} of ${mine.length} ${span} | ${[...base.values()].filter(done).length} | ${better} / ${worse} |`);
  }
  return lines.join('\n');
}

function humanLine(R) {
  const h = R['plan:human'];
  const b = bySeed(R['plan:balanced'] || []);
  if (!h || !b.size) return '';
  const done = (x) => x.fin >= YEAR;
  const worse = h.filter((x) => done(b.get(x.seed)) && !done(x)).length;
  const better = h.filter((x) => !done(b.get(x.seed)) && done(x)).length;
  return `The human plan finishes its first year on ${h.filter(done).length} of ${h.length} seeds, against the balanced plan's ${[...b.values()].filter(done).length}: it loses ${worse} the balanced plan keeps and keeps ${better} it loses. Median seasons finished of the first four: ${median(h.map((x) => x.fin))}, against ${median([...b.values()].map((x) => x.fin))}.`;
}

const R = await run();
process.stderr.write('\n');
let build = 'uncommitted';
try {
  build = execSync('git describe --always --dirty', { cwd: new URL('..', import.meta.url) }).toString().trim(); // -dirty: with changes not yet committed
} catch {}
const stamp = `Generated by \`npm run measure\` on seeds 1–${SEEDS}, at build ${build}${process.argv.includes('--readme') ? '' : ' (not written)'}, ${new Date().toISOString().slice(0, 10)}.`;
const blocks = {};
if (ONLY.includes('plans')) blocks.plans = `${plansTable(R)}\n\n${humanLine(R)}\n\n${stamp}`;
if (ONLY.includes('verbs')) blocks.verbs = `${verbsTable(R)}\n\n${stamp}`;
for (const [k, v] of Object.entries(blocks)) console.log(`\n== ${k}\n${v}`);
if (process.argv.includes('--readme')) {
  let text = readFileSync(README, 'utf8');
  for (const [k, v] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- measure:${k} -->\\n)[\\s\\S]*?(\\n<!-- /measure:${k} -->)`);
    if (!re.test(text)) throw new Error(`README has no <!-- measure:${k} --> markers`);
    text = text.replace(re, (_, a, b) => `${a}${v}${b}`);
  }
  writeFileSync(README, text);
  console.log('\nWritten into README.md.');
}
