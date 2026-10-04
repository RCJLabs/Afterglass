// The measurement behind the design record's standing tables (round seven, phase 6). Runs the autopilot's plans
// and switches (tools/AUTOPILOT.md) over the same seeds, each configuration in a process of its own (the
// switches are read when the autopilot loads), and prints the tables; with --readme it writes them into
// prototype/README.md between their markers, so the tables there come from this file and nothing else.
//
//   node tools/measure.mjs [--seeds 200] [--only plans,verbs,night,moon] [--jobs 4] [--readme]
//   node tools/measure.mjs --only campaign [--seeds 200] [--readme]   (five years a keep, so not in the default)
//   node tools/measure.mjs --only day [--seeds 200] [--readme]        (two years a keep, so not in the default)
//   node tools/measure.mjs --only long [--seeds 100] [--readme]       (ten years a keep, so not in the default)
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
  const { VISITORS } = await import('../src/slice/data.js');
  for (let seed = job.from; seed <= job.to; seed++) {
    const s = newSeason(seed, job.tuning || {});
    let heard = 0;
    let dawn = null;
    const calls = {}; // call-outs (alerts) each night, by season/day
    const year = (season) => Math.ceil(season / 4);
    const hands = {}; // by year: hand-ticks and guard-ticks on raid days (round seven, phase 10)
    const long = {}; // by year (round seven, phase 12): days, days essence was at its cap, and the stores at its end
    let today = null;
    for (let guard = 0; guard < 2e7; guard++) {
      if (s.phase === 'over') break;
      if (s.phase === 'end') {
        if (job.long && s.season % 4 === 0) (long[year(s.season)] ||= { days: 0, capped: 0 }).end = Object.fromEntries(['glass', 'remembrance', 'candles', 'stone', 'essence'].map((k) => [k, s.res[k] || 0]));
        if (s.season >= job.seasons) break;
        if (!closeYear(s) && !act(s, { type: 'nextSeason' }).ok) break;
        continue;
      }
      if (s.phase === 'dawn' && dawn !== `${s.season}/${s.day}`) {
        dawn = `${s.season}/${s.day}`;
        if (s.rite?.heard) heard++;
      }
      if (job.long && s.phase === 'day' && today !== `${s.season}/${s.day}`) {
        today = `${s.season}/${s.day}`;
        const L = (long[year(s.season)] ||= { days: 0, capped: 0 });
        L.days++;
        if (s.tuning.essenceCap && s.res.essence >= s.tuning.essenceCap - 0.5) L.capped++;
      }
      const night = s.phase === 'night' ? `${s.season}/${s.day}` : null;
      if (job.day && s.phase === 'day' && s.raid) {
        const h = (hands[year(s.season)] ||= { all: 0, guards: 0 });
        for (const p of s.living) {
          if (p.age === 'child' || p.sick > 0) continue;
          h.all++;
          if (p.job === 'barracks' || p.job === 'gatehouse') h.guards++;
        }
      }
      const al = s.alerts.length;
      autoStep(s, job.plan);
      if (night) calls[night] = (calls[night] || 0) + Math.max(0, s.alerts.length - al);
      if (s.alerts.length > 500) s.alerts.length = 0;
    }
    const E = s.seasons;
    // Each night played through: which night of its season (the seventh is the new moon, and winter's the Long
    // Night), the actions taken in it, its call-outs, the Unlit it brought, and the Hollow's end.
    const acts = {};
    for (const { at } of s.actions) if (at.phase === 'night') acts[`${at.season}/${at.day}`] = (acts[`${at.season}/${at.day}`] || 0) + 1;
    const kindOf = (d) => (d.day < s.tuning.seasonDays ? `n${d.day}` : (d.season - 1) % 4 === 3 ? 'long' : 'moon');
    const count = (f) => s.actions.filter(({ a }) => f(a)).length;
    const rec = {
      seed,
      fin: E.filter((e) => !e.lost).length,
      lost: E.find((e) => e.lost) ? { season: E.find((e) => e.lost).season, day: E.find((e) => e.lost).day, why: E.find((e) => e.lost).lost } : null,
      deaths: E.map((e) => e.summary.deaths),
      raids: E.flatMap((e) => e.summary.raids.map((r) => (r.held ? 1 : 0))),
      verdicts: E.flatMap((e) => e.summary.inspections.map((i) => i.verdict)),
      shadesLost: E.map((e) => e.summary.lost.length),
      cracks: E.map((e) => e.summary.cracks),
      caught: s.days.map((d) => d.night?.grabbed ?? 0),
      broken: s.days.map((d) => d.night?.broken?.length ?? 0),
      ruined: s.days.map((d) => d.night?.ruined?.length ?? 0),
      hollow: E.filter((e) => !e.lost).map((e) => e.summary.hollow),
      goals: s.campaign?.goals ? { ...s.campaign.goals } : null,
      nights: [...s.days, ...(s.today?.night && !s.days.some((d) => d.season === s.season && d.day === s.day) ? [{ season: s.season, day: s.day, ...s.today }] : [])].filter((d) => d.night).map((d) => ({ k: kindOf(d), acts: acts[`${d.season}/${d.day}`] || 0, calls: calls[`${d.season}/${d.day}`] || 0, unlit: d.night.spawned || 0, hollow: d.night.hollow || null })),
      use: { hush: count((a) => a.type === 'hush' && a.on), bind: count((a) => a.type === 'rite' && a.choice === 'bind'), curfew: count((a) => a.type === 'decree' && a.id === 'curfew'), keeper: count((a) => a.type === 'takeGlass'), heard },
    };
    // The day, by year (round seven, phase 10): days played, day actions other than jobs, raids at the gate and
    // held, guards' share of the hands on raid days, sallies, visitors paid in glass or remembrance, the Forge's
    // smith-days and its fires, and the Church's verdicts.
    if (job.day) {
      rec.years = {};
      const Y = (y) => (rec.years[y] ||= { days: 0, acts: 0, raids: 0, held: 0, sallies: 0, won: 0, kind: 0, arms: 0, verdicts: [] });
      for (const d of s.days) {
        if (d.day < 1) continue; // a season after the first leaves a record of its opening dawn as day 0: no day was played
        const y = Y(year(d.season));
        y.days++;
        y.arms += d.made?.arms || 0;
        if (d.raid && !d.raid.paid) {
          y.raids++;
          if (d.raid.held) y.held++;
        }
        for (const v of d.visitors || []) if (VISITORS[v.kind]?.answers.find((a) => a.id === v.answer)?.rule) y.kind++;
      }
      for (const { a, at } of s.actions) if (at.phase === 'day' && a.type !== 'assign' && a.type !== 'byDay') Y(year(at.season)).acts++;
      for (const i of s.inspections || []) Y(year(i.season)).verdicts.push(i.verdict);
      for (const [y, h] of Object.entries(hands)) Object.assign(Y(Number(y)), { hands: h.all, guards: h.guards });
      for (const d of s.days) for (const w of d.sallies || []) {
        Y(year(d.season)).sallies++;
        Y(year(d.season)).won += w;
      }
    }
    // Ten years (round seven, phase 12): of each year's days, those with a day action other than jobs.
    if (job.long) {
      const had = new Set();
      for (const { a, at } of s.actions) if (at.phase === 'day' && a.type !== 'assign' && a.type !== 'byDay') had.add(`${at.season}/${at.day}`);
      for (const k of had) {
        const L = long[year(Number(k.split('/')[0]))];
        if (L) L.decided = (L.decided || 0) + 1;
      }
      rec.long = long;
    }
    process.stdout.write(`${JSON.stringify(rec)}\n`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- the runs */

const { CHAPTERS } = await import('../src/slice/data.js');

const SEEDS = Number(arg('seeds', 200));
const JOBS = Number(arg('jobs', cpus().length));
const ONLY = arg('only', 'plans,verbs,night,moon').split(',');
const YEAR = 4;
// The configurations: each plan's first year, and each verb's switch on the balanced plan, against the balanced
// plan on the same seeds (The Keeper, which comes at a year's end, over two).
const PLAN_ROWS = ['balanced', 'human', 'keeper', 'mourner', 'double', 'idle'];
const VERBS = [
  { key: 'hush', env: { AP_HUSH: '1' }, name: 'Hush (`AP_HUSH`)', what: 'hushes while shades stand in the dark with the Unlit close and no candle to spare' },
  { key: 'bind', env: { AP_BIND: '1' }, name: 'Bind (`AP_BIND`)', what: 'binds a Restless shade into a free mirror when the essence can be spared' },
  { key: 'curfew', env: { AP_CURFEW: '1' }, tuning: { curfew: 1 }, name: 'The curfew (`AP_CURFEW`, under its old rule)', what: 'proclaims the curfew once sleepwalkers can come; since phase 11 a Hall has no curfew' },
  { key: 'heard', env: { AP_COURT: '1' }, name: 'The Court (`AP_COURT`)', what: 'seats a shade in the Court of Shades before a rite where one will ask' },
  { key: null, env: { AP_TALL: 'line' }, name: 'Building by choice (`AP_TALL=line`)', what: 'builds tall, with the Chapel on the line’s floor' },
  { key: 'keeper', env: { AP_ENDING: 'watch' }, name: 'The Keeper (`AP_ENDING=watch`)', what: 'takes its own place in the glass at the first year’s end', seasons: 2 * YEAR },
];
// Reacting at night against the static line (round seven, phase 7's test): the balanced plan and Double, each at
// the autopilot's pace and at a person's (AP_LAPSES), and the balanced plan with its moves taken away.
// For trying rules and switches before they're settled: --tuning '{"thinStair":0}' starts every keep with those
// rules, and --env AP_NOTHIN=1,AP_LUREHOLLOW=1 sets those switches for every run. Neither is for --readme.
const TUNING = JSON.parse(arg('tuning', '{}'));
const ENV = Object.fromEntries(arg('env', '').split(',').filter(Boolean).map((kv) => kv.split('=')));
if ((Object.keys(TUNING).length || Object.keys(ENV).length) && process.argv.includes('--readme')) throw new Error('--tuning and --env are for trying things, not for the README');
const NIGHT_ROWS = [
  { id: 'night:balanced', plan: 'balanced', env: {}, name: 'Balanced: reacts', vs: 'night:double' },
  { id: 'night:nomove', plan: 'balanced', env: { AP_NOMOVE: '1' }, name: 'Balanced, never moving a shade at night (`AP_NOMOVE`)', vs: 'night:balanced', vsName: 'Balanced' },
  { id: 'night:double', plan: 'double', env: {}, name: 'Double: two to a stair, never moves', vs: null },
  { id: 'night:human', plan: 'human', env: {}, name: 'Human: reacts, at a person\u2019s pace', vs: 'night:double-lapses' },
  { id: 'night:double-lapses', plan: 'double', env: { AP_LAPSES: '1' }, name: 'Double at a person\u2019s pace (`AP_LAPSES`)', vs: null },
  { id: 'night:watch', plan: 'balanced', env: { AP_WATCH: '1' }, name: 'Balanced, set at dusk and then only watching (`AP_WATCH`)', vs: 'night:balanced', vsName: 'Balanced' },
  { id: 'night:human-relight', plan: 'human', env: {}, tuning: { autoRelight: 1 }, name: 'Human, with auto-relight (on in Gentle)', vs: 'night:human', vsName: 'Human' },
  { id: 'night:watch-relight', plan: 'balanced', env: { AP_WATCH: '1' }, tuning: { autoRelight: 1 }, name: 'Only watching, with auto-relight', vs: 'night:balanced', vsName: 'Balanced' },
  // Round seven, phase 8: what meeting the Hollow at the line is worth, against warding it at the foot all night.
  { id: 'night:nomeet', plan: 'balanced', env: { AP_MEETHOLLOW: 'off' }, name: 'Balanced, never meeting the Hollow (`AP_MEETHOLLOW=off`)', vs: 'night:balanced', vsName: 'Balanced' },
  { id: 'night:human-nomeet', plan: 'human', env: { AP_MEETHOLLOW: 'off' }, name: 'Human, never meeting the Hollow', vs: 'night:human', vsName: 'Human' },
];
// The new moon against the other nights (round seven, phase 8): each night of a season, what it asks of the
// balanced and the human plans, from their first year (the plans' own runs, when those run too).
const MOON_PLANS = [['balanced', 'Balanced'], ['human', 'Human']];
// The campaign's chapters (round seven, phase 8): how often each year's goal is met, of the keeps that reach its
// end, for the balanced and the human plans over the campaign's first four years.
const CAMPAIGN_YEARS = 4;
// The day's decisions (round seven, phase 10): the balanced and the human plans over two years, and each posting
// its guards only when the Host is at the gate (AP_JIT) over the first, against itself.
const DAY_PLANS = [['balanced', 'Balanced'], ['human', 'Human']];
// Ten years a keep (round seven, phase 12): whether there's still something to decide by day, and whether the
// stores pile up, for the balanced and the human plans.
const LONG_YEARS = 10;
const configs = [];
const ROWS = arg('rows', '').split(',').filter(Boolean); // --rows balanced,double: only those night rows
if (ONLY.includes('night')) for (const r of NIGHT_ROWS.filter((r) => !ROWS.length || ROWS.includes(r.id.slice(6)))) configs.push({ id: r.id, plan: r.plan, seasons: YEAR, env: r.env, tuning: r.tuning });
if (ONLY.includes('plans')) for (const plan of PLAN_ROWS) configs.push({ id: `plan:${plan}`, plan, seasons: YEAR, env: {} });
if (ONLY.includes('campaign')) for (const [plan] of MOON_PLANS) configs.push({ id: `campaign:${plan}`, plan, seasons: 4 * CAMPAIGN_YEARS, env: {}, tuning: { campaign: 1 } });
if (ONLY.includes('moon')) for (const [plan] of MOON_PLANS) if (!configs.some((c) => c.id === `plan:${plan}`)) configs.push({ id: `plan:${plan}`, plan, seasons: YEAR, env: {} });
if (ONLY.includes('day')) {
  for (const [plan] of DAY_PLANS) configs.push({ id: `day:${plan}`, plan, seasons: 2 * YEAR, env: {}, day: true });
  for (const [plan] of DAY_PLANS) configs.push({ id: `day:${plan}:jit`, plan, seasons: YEAR, env: { AP_JIT: '1' } });
}
if (ONLY.includes('long')) for (const [plan] of DAY_PLANS) configs.push({ id: `long:${plan}`, plan, seasons: 4 * LONG_YEARS, env: {}, long: true });
if (ONLY.includes('verbs')) {
  if (!ONLY.includes('plans')) configs.push({ id: 'plan:balanced', plan: 'balanced', seasons: YEAR, env: {} });
  configs.push({ id: 'plan:balanced:2y', plan: 'balanced', seasons: 2 * YEAR, env: {} });
  for (const v of VERBS) configs.push({ id: `verb:${v.name}`, plan: 'balanced', seasons: v.seasons || YEAR, env: v.env, tuning: v.tuning });
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
        const p = spawn(process.execPath, [HERE, '--worker', JSON.stringify({ plan: c.plan, seasons: c.seasons, from, to, tuning: { ...TUNING, ...c.tuning }, day: !!c.day, long: !!c.long })], { env: { ...process.env, ...ENV, ...c.env }, stdio: ['ignore', 'pipe', 'inherit'] });
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

function nightTable(R) {
  const lines = ['| Plan | First year finished | Paired with Double at the same pace, or as it says: better on / worse on (seeds) | Lost to the Veil / with everyone dead | Shades caught a night | Rooms broken / ruined in 10 nights | Cracks a season |', '|---|---|---|---|---|---|---|'];
  const per10 = (xs) => (xs.length ? ((10 * xs.reduce((a, b) => a + b, 0)) / xs.length).toFixed(1) : '–');
  for (const r of NIGHT_ROWS) {
    const mine = R[r.id];
    if (!mine) continue;
    const vs = r.vs && R[r.vs] ? bySeed(R[r.vs]) : null;
    const pair = vs ? `${mine.filter((x) => x.fin > vs.get(x.seed).fin).length} / ${mine.filter((x) => x.fin < vs.get(x.seed).fin).length}${r.vsName ? ` against ${r.vsName}` : ''}` : '–';
    const lost = (why) => mine.filter((x) => x.lost?.why === why).length;
    lines.push(`| ${r.name} | ${mine.filter((x) => x.fin >= YEAR).length} of ${mine.length} | ${pair} | ${lost('veil')} / ${lost('fallen')} | ${avg(mine.flatMap((x) => x.caught))} | ${per10(mine.flatMap((x) => x.broken))} / ${per10(mine.flatMap((x) => x.ruined))} | ${avg(mine.flatMap((x) => x.cracks))} |`);
  }
  return lines.join('\n');
}

function moonTable(R) {
  const NIGHTS = [...[1, 2, 3, 4, 5, 6].map((d) => [`n${d}`, `Night ${d}`]), ['moon', 'The new moon (spring to autumn)'], ['long', 'The Long Night']];
  const plans = MOON_PLANS.filter(([p]) => R[`plan:${p}`]);
  const of = (p, k) => R[`plan:${p}`].flatMap((x) => x.nights || []).filter((n) => n.k === k);
  const lines = [`| Night | Unlit | ${plans.map(([, name]) => `${name}: actions / call-outs`).join(' | ')} |`, `|---|---|${plans.map(() => '---|').join('')}`];
  for (const [k, label] of NIGHTS) {
    const all = plans.length ? of(plans[0][0], k) : [];
    lines.push(`| ${label} | ${avg(all.map((n) => n.unlit))} | ${plans.map(([p]) => `${avg(of(p, k).map((n) => n.acts))} / ${avg(of(p, k).map((n) => n.calls))}`).join(' | ')} |`);
  }
  const hollow = plans.map(([p, name]) => {
    const h = R[`plan:${p}`].flatMap((x) => x.nights || []).filter((n) => n.hollow);
    const c = (v) => h.filter((n) => n.hollow === v).length;
    return `${name} ${c('driven back')} / ${c('crossed')} / ${c('withdrew')} of ${h.length}`;
  });
  const fin = plans.map(([p, name]) => `${name} ${R[`plan:${p}`].filter((x) => x.fin >= YEAR).length} of ${R[`plan:${p}`].length}`);
  return `${lines.join('\n')}\n\nThe Hollow, on the nights it rose (driven back / crossed the Veil / withdrew at dawn): ${hollow.join('; ')}. First year finished: ${fin.join('; ')}.`;
}

function campaignTable(R) {
  const plans = MOON_PLANS.filter(([p]) => R[`campaign:${p}`]);
  const lines = [`| Year | Goal | ${plans.map(([, name]) => `${name}: met / judged`).join(' | ')} |`, `|---|---|${plans.map(() => '---|').join('')}`];
  for (let k = 1; k <= CAMPAIGN_YEARS; k++) {
    const C = CHAPTERS[k];
    const cell = (p) => {
      const rs = R[`campaign:${p}`].filter((x) => x.goals && k in x.goals);
      return `${rs.filter((x) => x.goals[k]).length} / ${rs.length}`;
    };
    lines.push(`| ${k}: ${C.name} | ${C.goal.text} | ${plans.map(([p]) => cell(p)).join(' | ')} |`);
  }
  return lines.join('\n');
}

function dayTable(R) {
  const plans = DAY_PLANS.filter(([p]) => R[`day:${p}`]);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const lines = ['| Plan | Year | Keeps | Day actions other than jobs, a day | Raids held | Guards, of the hands on a raid day | Sallies won / made | Visitors paid in kind | Arms forged, a keep | Church: blessed / warned / censured |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [p, name] of plans) {
    for (const y of [1, 2]) {
      const ys = R[`day:${p}`].map((x) => x.years?.[y]).filter((v) => v && v.days);
      const days = sum(ys.map((v) => v.days));
      const vs = ys.flatMap((v) => v.verdicts);
      lines.push(`| ${name} | ${y} | ${ys.length} | ${days ? (sum(ys.map((v) => v.acts)) / days).toFixed(1) : '–'} | ${pct(sum(ys.map((v) => v.held)), sum(ys.map((v) => v.raids)))} | ${pct(sum(ys.map((v) => v.guards || 0)), sum(ys.map((v) => v.hands || 0)))} | ${sum(ys.map((v) => v.won))} / ${sum(ys.map((v) => v.sallies))} | ${sum(ys.map((v) => v.kind))} | ${ys.length ? (sum(ys.map((v) => v.arms)) / ys.length).toFixed(1) : '–'} | ${['blessed', 'warned', 'censured'].map((k) => vs.filter((x) => x === k).length).join(' / ')} |`);
    }
  }
  // Guards posted only when the Host is at the gate, against the same plan's first year on the same seeds.
  const jit = plans.filter(([p]) => R[`day:${p}:jit`]).map(([p, name]) => {
    const mine = R[`day:${p}:jit`];
    const base = bySeed(R[`day:${p}`]);
    const done = (x) => x.fin >= YEAR;
    const raids = mine.flatMap((x) => x.raids.slice(0, 99));
    return `${name} ${mine.filter(done).length} of ${mine.length} (against ${[...base.values()].filter(done).length}; better on ${mine.filter((x) => done(x) && !done(base.get(x.seed))).length}, worse on ${mine.filter((x) => !done(x) && done(base.get(x.seed))).length}), raids held ${pct(raids.filter(Boolean).length, raids.length)}`;
  });
  return `${lines.join('\n')}${jit.length ? `\n\nPosting guards only when the Host is at the gate (\`AP_JIT\`), first year finished: ${jit.join('; ')}.` : ''}`;
}

function longTable(R) {
  const plans = DAY_PLANS.filter(([p]) => R[`long:${p}`]);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const med = (xs) => {
    const a = [...xs].sort((x, y) => x - y);
    return a.length ? Math.round(a[Math.floor(a.length / 2)]) : '–';
  };
  const lines = ['| Plan | Year | Keeps | Days with a decision other than jobs | At the year\u2019s end: glass, remembrance, candles, stone (medians) | Days essence was at its cap |', '|---|---|---|---|---|---|'];
  for (const [p, name] of plans) {
    for (const y of [1, 2, 3, 5, 10]) {
      const ys = R[`long:${p}`].map((x) => x.long?.[y]).filter((v) => v && v.days && v.end);
      if (!ys.length) continue;
      const days = sum(ys.map((v) => v.days));
      lines.push(`| ${name} | ${y} | ${ys.length} | ${pct(sum(ys.map((v) => v.decided || 0)), days)} | ${['glass', 'remembrance', 'candles', 'stone'].map((k) => med(ys.map((v) => v.end[k]))).join(', ')} | ${pct(sum(ys.map((v) => v.capped)), days)} |`);
    }
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
if (ONLY.includes('night')) blocks.night = `${nightTable(R)}\n\n${stamp}`;
if (ONLY.includes('moon')) blocks.moon = `${moonTable(R)}\n\n${stamp}`;
if (ONLY.includes('campaign')) blocks.campaign = `${campaignTable(R)}\n\n${stamp}`;
if (ONLY.includes('day')) blocks.day = `${dayTable(R)}\n\n${stamp}`;
if (ONLY.includes('long')) blocks.long = `${longTable(R)}\n\n${stamp}`;
for (const [k, v] of Object.entries(blocks)) console.log(`\n== ${k}\n${v}`);
if (process.argv.includes('--readme')) {
  let text = readFileSync(README, 'utf8');
  for (const [k, v] of Object.entries(blocks)) {
    // Markers on lines of their own, with the old table between them, or nothing (a new block).
    const re = new RegExp(`(<!-- measure:${k} -->\\n)(?:[\\s\\S]*?\\n)?(<!-- /measure:${k} -->)`);
    if (!re.test(text)) throw new Error(`README has no <!-- measure:${k} --> markers`);
    text = text.replace(re, (_, a, b) => `${a}${v}\n${b}`);
  }
  writeFileSync(README, text);
  console.log('\nWritten into README.md.');
}
