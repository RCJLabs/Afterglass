import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, defense, roomPower, tributeOf, upgrade, replay } from '../src/slice/sim.js';

// The original four-floor keep, a raid on day 1, nothing else by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, fire: 0, raidDays: { 1: 6, 2: 0, 4: 0, 6: 0 }, raidSpread: 0, raidFightStrength: 1 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const until = (s, f) => {
  for (let i = 0; i < 5000 && s.phase === 'day' && !f(); i++) step(s);
};
// A day-1 raid of the given strength, run to its warning, with exactly `guards` in the Barracks.
function raidDay(seed, strength, guards, over = {}) {
  const s = newSeason(seed, { ...quiet, raidDays: { 1: strength, 2: 0, 4: 0, 6: 0 }, ...over });
  const ps = s.living.filter((p) => p.job === 'barracks');
  for (const p of ps.slice(guards)) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  for (const p of s.living.filter((x) => x.job !== 'barracks').slice(0, Math.max(0, guards - ps.length))) ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  s.watchBonus = 0;
  until(s, () => s.raid?.warned);
  return s;
}

test('the Host at the gate: with defense enough the gate never gives and they fall back; short of it, it gives until it breaks', () => {
  const s = raidDay(3, 4, 3);
  assert.ok(defense(s) >= s.raid.strength);
  until(s, () => s.raid.state !== 'coming');
  assert.equal(s.raid.state, 'assault');
  assert.equal(s.raid.gate, 1);
  until(s, () => s.raid.state !== 'assault');
  assert.equal(s.raid.state, 'held');
  assert.ok(s.log.some((l) => /^The Host fell back from the gate/.test(l.text)));
  // Short by 4 of 8: the gate gives 4/8 a second, so it breaks in about 2 seconds.
  const b = raidDay(3, 8, 2);
  assert.ok(Math.abs(defense(b) - 4) < 1e-9, `defense ${defense(b)}`);
  until(b, () => b.raid.state === 'assault');
  const t0 = b.t;
  until(b, () => b.raid.state !== 'assault');
  assert.equal(b.raid.state, 'breached');
  assert.ok(Math.abs(b.t - t0 - 20) <= 1, `broke after ${b.t - t0} ticks`);
  assert.ok(b.raid.loot, 'they carried things off');
});

test('pitch burns the Host down, stone shores the gate up, and the bell brings everyone to the walls', () => {
  const s = raidDay(4, 8, 2);
  s.res.candles = 20;
  s.res.stone = 10;
  until(s, () => s.raid.state === 'assault');
  const r = s.raid;
  const c0 = s.res.candles;
  ok(s, { type: 'pitch' });
  assert.equal(r.host, 8 - s.tuning.raidPitch);
  assert.equal(s.res.candles, c0 - s.tuning.raidPitchCost);
  for (let i = 0; i < 5; i++) step(s);
  const gate = r.gate;
  assert.ok(gate < 1);
  ok(s, { type: 'shore' });
  assert.ok(Math.abs(r.gate - Math.min(1, gate + s.tuning.raidShore)) < 1e-9);
  const before = defense(s);
  const work = roomPower(s).hearth;
  ok(s, { type: 'raidBell' });
  const hands = s.living.filter((p) => p.walls);
  assert.ok(hands.length > 0);
  assert.ok(Math.abs(defense(s) - before - hands.length * s.tuning.raidBellDefense) < 1e-9);
  assert.ok(work > 0 && roomPower(s).hearth === 0, 'the Hearth stops while its cooks are on the walls');
  assert.match(act(s, { type: 'raidBell' }).error, /already on the walls/);
  until(s, () => r.state !== 'assault');
  assert.ok(!s.living.some((p) => p.walls), 'everyone back to work');
  assert.match(act(s, { type: 'pitch' }).error, /for the Host at the gate/);
});

test('paid off, they turn back and the next raid comes harder; barred, the stores stop and a breach takes half', () => {
  const s = raidDay(5, 6, 3);
  s.res.food = 40;
  s.res.candles = 20;
  const t = tributeOf(s);
  assert.deepEqual(t, { food: Math.ceil(6 * s.tuning.raidTributeFood), candles: Math.ceil(6 * s.tuning.raidTributeCandles) });
  ok(s, { type: 'payOff' });
  assert.equal(s.raid.state, 'paid');
  assert.equal(s.res.food, 40 - t.food);
  assert.equal(s.embolden, s.tuning.raidEmbolden);
  until(s, () => false);
  assert.ok(!s.log.some((l) => /The Host is at the gate/.test(l.text)), 'no assault');
  // Barred stores: no work in the Hearth, the Chandlery or the Glazier until it's over, half the loot.
  const run = (bar) => {
    const g = raidDay(6, 10, 0);
    g.res.food = 30;
    g.res.candles = 20;
    g.res.glass = 20;
    if (bar) {
      ok(g, { type: 'barStores' });
      assert.ok(roomPower(g).hearth > 0, 'they work on until the Host is at the gate');
      until(g, () => g.raid.state === 'assault');
      assert.equal(roomPower(g).hearth, 0);
      assert.equal(roomPower(g).chandlery, 0);
    }
    until(g, () => g.raid.state === 'breached' || g.raid.state === 'held');
    return g.raid.loot;
  };
  const open = run(false);
  const barred = run(true);
  assert.ok(open.candles > 0);
  assert.ok(barred.candles <= Math.ceil(open.candles / 2) && barred.food <= Math.ceil(open.food / 2));
});

test('after a breach, guards can go after them for half of it back', () => {
  const s = raidDay(7, 12, 1, { raidPursueRisk: 0 });
  s.res.food = 30;
  s.res.candles = 20;
  until(s, () => s.raid.state === 'breached');
  const { loot } = s.raid;
  const c0 = s.res.candles;
  if (!s.living.some((p) => p.job === 'barracks')) ok(s, { type: 'assign', id: s.living[0].id, room: 'barracks' });
  ok(s, { type: 'pursue' });
  assert.equal(s.res.candles, c0 + Math.floor(loot.candles * s.tuning.raidRecover));
  assert.match(act(s, { type: 'pursue' }).error, /no one to go after/);
  // With certain death on the chase, every guard sent is brought home dead.
  const d = raidDay(7, 12, 1, { raidPursueRisk: 1 });
  until(d, () => d.raid.state === 'breached');
  if (!d.living.some((p) => p.job === 'barracks')) ok(d, { type: 'assign', id: d.living[0].id, room: 'barracks' });
  const guards = d.living.filter((p) => p.job === 'barracks').map((p) => p.id);
  ok(d, { type: 'pursue' });
  for (const id of guards) assert.equal(d.ledger.find((e) => e.id === id)?.how, 'died chasing the raiders');
});

test('older saves keep the old raid, one throw at noon, and a fought raid replays exactly', () => {
  const old = JSON.parse(JSON.stringify(newSeason(8, quiet)));
  delete old.tuning.raidFight;
  delete old.tuning0.raidFight;
  const g = upgrade(old);
  assert.equal(g.tuning0.raidFight, 0);
  const o = newSeason(8, { ...quiet, raidFight: 0 });
  until(o, () => o.raid?.state && o.raid.state !== 'coming');
  assert.ok(o.raid.state === 'held' || o.raid.state === 'breached', 'resolved at once');
  assert.ok(!o.log.some((l) => /The Host is at the gate/.test(l.text)));
  const s = raidDay(9, 8, 2);
  s.res.candles = 20;
  until(s, () => s.raid.state === 'assault');
  ok(s, { type: 'pitch' });
  ok(s, { type: 'raidBell' });
  until(s, () => s.raid.state !== 'assault');
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t) step(r);
  assert.deepEqual(r.raid, s.raid);
  assert.deepEqual(r.living.map((p) => p.id), s.living.map((p) => p.id));
});
