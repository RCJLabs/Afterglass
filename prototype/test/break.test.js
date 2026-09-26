import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, replay, upgrade, byId, ritePreview } from '../src/slice/sim.js';
import { epitaph, RESTING } from '../src/slice/book.js';

// The original four-floor keep, nothing by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
  return r;
};
const fullest = (s) => s.mirrors.map((m) => ({ m, ds: s.shades.filter((d) => d.mirror === m.id) })).sort((a, b) => b.ds.length - a.ds.length)[0];

test('breaking a mirror frees everyone in it at once: remembrance, peace for their kin, Dread down, the mirror gone, bad luck', () => {
  const s = newSeason(3, quiet);
  const { m, ds } = fullest(s);
  assert.ok(ds.length >= 1, 'the mirror holds someone');
  // A living one grieving for a shade in it.
  const kin = s.living.find((p) => p.bond && ds.some((d) => d.id === p.bond.with)) || s.living[0];
  kin.grief = { for: ds[0].id, mult: 0.8 };
  s.dread = 4;
  const rem = s.res.remembrance;
  s.cues = [];
  ok(s, { type: 'break', id: m.id });
  assert.ok(!s.mirrors.includes(m), 'the mirror is gone');
  for (const d of ds) {
    assert.ok(!s.shades.includes(d), `${d.name} is free`);
    assert.equal(s.ledger.find((e) => e.id === d.id).end, 'freed');
  }
  assert.equal(s.res.remembrance, rem + ds.length);
  assert.equal(s.dread, Math.max(0, 4 - s.tuning.breakDread * ds.length));
  assert.equal(kin.grief, null, 'grief turns to peace');
  assert.ok(kin.peace > 0);
  assert.equal(s.badLuck, s.tuning.badLuckDays);
  assert.ok(s.cues.some((c) => c.name === 'shatter'));
  assert.ok(s.log.some((l) => /is broken and everyone in it is free/.test(l.text)));
});

test('an empty mirror, or one that isn\'t there, can\'t be broken', () => {
  const s = newSeason(4, quiet);
  const { m, ds } = fullest(s);
  for (const d of ds) d.mirror = null;
  assert.match(act(s, { type: 'break', id: m.id }).error, /holds no one/);
  assert.match(act(s, { type: 'break', id: 'm999' }).error, /No such mirror/);
});

test('at night it frees a caught shade out of the Creeper\'s grip, and a Wraith leaves the Tain', () => {
  const s = newSeason(5, quiet);
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const { m, ds } = fullest(s);
  const d = ds[0];
  const c = addFoe(s, 'creeper', d.f, d.x);
  c.grab = d.id;
  d.grabbedBy = c.id;
  const w = addFoe(s, 'wraith', d.f, d.x + 20, { shade: d.id });
  ok(s, { type: 'break', id: m.id });
  assert.equal(c.grab, null, 'the Creeper lets go');
  assert.ok(!s.night.foes.includes(w), 'the Wraith is gone');
  assert.equal(s.ledger.find((e) => e.id === d.id).end, 'freed');
  for (let i = 0; i < 50; i++) step(s);
});

test('at the rite, the freed have no choice left to make, and the Dread shown starts from the new level', () => {
  const s = newSeason(6, quiet);
  while (s.phase !== 'dawn') {
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
      s.night.spawns = [];
    }
    step(s);
  }
  s.dread = 3;
  const { m, ds } = fullest(s);
  for (const d of ds) s.rite.choice[d.id] = 'keep';
  ok(s, { type: 'break', id: m.id });
  for (const d of ds) assert.equal(s.rite.choice[d.id], undefined);
  assert.equal(ritePreview(s).dread.from, Math.max(0, 3 - ds.length));
  ok(s, { type: 'beginDay' });
});

test('bad luck: sickness twice as likely on each of the next seven days, carried into the next season', () => {
  const s = newSeason(7, { ...quiet, sickChance: 0.5 });
  const { m } = fullest(s);
  ok(s, { type: 'break', id: m.id });
  const rolls = [];
  for (let day = 0; day < 9; day++) {
    while (s.phase === 'day') step(s);
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
      s.night.spawns = [];
    }
    while (s.phase === 'night') step(s);
    if (s.phase === 'dawn') ok(s, { type: 'beginDay' });
    if (s.phase !== 'day') break;
    rolls.push({ luck: s.badLuck, sick: s.events.some((e) => e.type === 'sick') || s.living.some((p) => p.sick > 0) });
  }
  // Broken on day 1, after its roll: days 2 to 7 are unlucky, and at twice 0.5 each has a sickness. The
  // seventh unlucky day is the next season's first.
  assert.equal(rolls.length, s.tuning.seasonDays - 1);
  assert.ok(rolls.every((r) => r.sick), JSON.stringify(rolls));
  assert.deepEqual(rolls.map((r) => r.luck), [6, 5, 4, 3, 2, 1]);
  assert.equal(s.badLuck, 1, 'one unlucky day carries into the next season');
});

test('a keep that broke a mirror replays exactly, and older saves have no bad luck', () => {
  const s = newSeason(8, quiet);
  for (let i = 0; i < 100; i++) step(s);
  ok(s, { type: 'break', id: fullest(s).m.id });
  for (let i = 0; i < 200; i++) step(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t) step(r);
  assert.deepEqual(r.mirrors, s.mirrors);
  assert.deepEqual(r.shades.map((d) => d.id), s.shades.map((d) => d.id));
  assert.equal(r.badLuck, s.badLuck);
  const old = JSON.parse(JSON.stringify(newSeason(9, quiet)));
  delete old.badLuck;
  assert.equal(upgrade(old).badLuck, 0);
});

test('the Book tells how the freed went, and counts them among those at rest', () => {
  const e = { from: 'living', how: 'died of sickness', season: 1, day: 2, woke: 'pale', end: 'freed', endDay: 4, endSeason: 1, job: 'chapel' };
  assert.match(epitaph(e), /Freed when their mirror was broken on day 4\./);
  assert.ok(RESTING.includes('freed'));
  assert.ok(byId([{ id: 'x' }], 'x'));
});
