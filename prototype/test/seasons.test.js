import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, beds, besieged, sallyOdds, upgrade, replay, seasonIndex } from '../src/slice/sim.js';
import { runSeasonAuto, autoStep } from '../src/slice/autopilot.js';
import { TUNING } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// A keep played by the autopilot to the start of the given season and day: the first seed from `seed` whose
// keep gets that far (and, given `pred`, is as the test needs it there). Without omens, whose nights would
// change which keeps get that far.
function reach(seed, season, day, tuning = {}, pred = () => true) {
  for (let k = seed; k < seed + 40; k++) {
    const s = newSeason(k, { omens: 0, ...tuning });
    for (let i = 0; i < 2e6 && !(s.season === season && s.day === day && s.phase === 'day') && s.phase !== 'over'; i++) {
      if (s.phase === 'end') ok(s, { type: 'nextSeason' });
      else autoStep(s);
    }
    if (s.season === season && s.day === day && pred(s)) return s;
  }
  assert.fail(`no seed from ${seed} reached season ${season} day ${day} as needed`);
}

test("summer's plague: sickness in a crowded keep takes one more for every two beyond the beds", () => {
  const s = reach(2, 2, 1);
  assert.equal(seasonIndex(s), 1);
  // Crowd it: more living than beds.
  while (s.living.length < beds(s) + 4) s.living.push({ ...s.living[0], id: `px${s.living.length}`, name: `Extra ${s.living.length}`, sick: 0, grief: null, bond: null });
  for (const p of s.living) p.sick = 0;
  s.events = [{ at: s.t + 1, type: 'sick' }];
  step(s);
  step(s);
  const n = 1 + Math.floor((s.living.length - beds(s)) / s.tuning.plagueCrowd);
  assert.equal(s.living.filter((p) => p.sick > 0).length, n);
  assert.ok(n >= 3);
  assert.match(s.log.at(-1).text, /^Plague: .* have fallen sick/);
  // In spring, one at a time however crowded.
  const sp = newSeason(2);
  while (sp.living.length < beds(sp) + 4) sp.living.push({ ...sp.living[0], id: `py${sp.living.length}`, name: `Other ${sp.living.length}`, sick: 0, grief: null, bond: null });
  sp.events = [{ at: 1, type: 'sick' }];
  step(sp);
  step(sp);
  assert.equal(sp.living.filter((p) => p.sick > 0).length, 1);
});

test("autumn's siege: the morning after its day-2 raid the Host camps; the Yard stops, no one new comes, the camp comes at the gate", () => {
  const s = reach(1, 3, 3, {}, besieged);
  assert.ok(besieged(s), 'the camp stands');
  assert.equal(s.siege.until, 4);
  assert.ok(s.log.some((l) => l.season === 3 && l.day === 3 && /has made camp outside the walls/.test(l.text)));
  assert.ok(s.raid?.camp, "the camp's own assault today");
  const stone = s.res.stone;
  for (const p of s.living.slice(0, 3)) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  for (let i = 0; i < 50; i++) step(s);
  assert.equal(s.res.stone, stone, 'nobody quarries while the gate is shut');
  // Day 4 is a newcomer day, but none can come.
  while (!(s.day === 4 && s.phase === 'day')) autoStep(s);
  if (besieged(s)) assert.ok(s.log.some((l) => l.day === 4 && /No one new can reach the gate/.test(l.text)));
  // It ends by day 5.
  while (!(s.day === 5 && s.phase === 'day')) autoStep(s);
  assert.equal(besieged(s), false);
});

test('a sally that wins breaks the camp and calls off its assault; one that loses leaves it; each guard risks the chase', () => {
  const won = reach(3, 3, 3, { sallyOdds: 0.01, raidPursueRisk: 0 }, besieged);
  assert.ok(besieged(won));
  // A guard at the post, mustered: only those who go out count (guardsGoOut).
  const guard = won.living.find((p) => p.job === 'barracks' && !(p.sick > 0)) || won.living.find((p) => !(p.sick > 0));
  Object.assign(guard, { job: 'barracks', muster: 1 });
  assert.equal(sallyOdds(won), 0.9);
  // Force the win: odds 0.9 still leaves a roll, so try until it takes, from the same state each time.
  const snap = JSON.stringify(won);
  let g = null;
  for (let k = 0; k < 20 && !g; k++) {
    const t = JSON.parse(snap);
    t.rng = (t.rng + k * 7919) >>> 0;
    if (!t.living.some((p) => p.job === 'barracks' && !(p.sick > 0))) t.living.find((p) => !(p.sick > 0)).job = 'barracks'; // the sick stay in
    ok(t, { type: 'sally' });
    if (t.siege.broken) g = t;
  }
  assert.ok(g, 'a sally took');
  assert.ok(!besieged(g) && !g.raid?.camp, "the camp's assault is off");
  assert.match(g.log.at(-1).text, /break the camp/);
  assert.match(act(g, { type: 'sally' }).error, /no camp/);
  // Certain loss: the camp stays.
  const lost = reach(3, 3, 3, { sallyOdds: 1000, raidPursueRisk: 1 }, besieged);
  // The sick stay in: only the well go out.
  const well = (p) => p.job === 'barracks' && !(p.sick > 0);
  if (!lost.living.some(well)) ok(lost, { type: 'assign', id: lost.living.find((p) => !(p.sick > 0)).id, room: 'barracks' });
  const guards = lost.living.filter(well).map((p) => p.name);
  assert.equal(sallyOdds(lost), 0.1);
  let tries = 0;
  while (besieged(lost) && tries++ < 1) ok(lost, { type: 'sally' });
  for (const n of guards) assert.ok(lost.ledger.some((e) => e.name === n && /sallying out/.test(e.how)), `${n} fell`);
});

test('a paid-off day-2 raid brings no siege; older saves have neither trouble; a siege replays exactly', () => {
  const s = reach(4, 3, 2);
  while (!s.raid?.warned) step(s);
  ok(s, { type: 'debug', what: 'give', res: 'food', n: 99 });
  ok(s, { type: 'debug', what: 'give', res: 'candles', n: 20 });
  ok(s, { type: 'payOff' });
  while (!(s.day === 3 && s.phase === 'day')) autoStep(s);
  assert.equal(s.siege ?? null, null);
  const old = JSON.parse(JSON.stringify(newSeason(4)));
  for (const t of [old.tuning, old.tuning0]) {
    delete t.plague;
    delete t.siege;
  }
  const u = upgrade(old);
  assert.equal(u.tuning.plague, 0);
  assert.equal(u.tuning.siege, 0);
  const w = reach(1, 3, 4, {}, (x) => !!x.siege);
  const r = replay(w.seed, w.tuning0, w.actions);
  while (r.season < w.season || r.day < w.day || r.t < w.t) {
    if (r.phase === 'end') break;
    step(r);
  }
  assert.deepEqual(r.siege, w.siege);
  assert.deepEqual(r.res, w.res);
  assert.equal(TUNING.plague, 1);
});
