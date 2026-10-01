import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, defense, roomPower, tributeOf, upgrade, replay, granaryShare, pursueShare } from '../src/slice/sim.js';
import { TUNING } from '../src/slice/data.js';

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
  // It was the season's only raid, so the Host remembers into the next (round seven's fix).
  assert.equal(s.embolden || 1, 1);
  assert.equal(s.grudge, s.tuning.raidEmbolden);
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

test('after a breach, guards can go after them, taking back as much as they are strong against the Host', () => {
  for (const guardsGoOut of [1, 0]) {
    const s = raidDay(7, 12, 1, { raidPursueRisk: 0, guardsGoOut });
    s.res.food = 30;
    s.res.candles = 20;
    until(s, () => s.raid.state === 'breached');
    const { loot } = s.raid;
    const c0 = s.res.candles;
    if (!s.living.some((p) => p.job === 'barracks')) ok(s, { type: 'assign', id: s.living[0].id, room: 'barracks' });
    const share = pursueShare(s);
    // One guard of 2 against a Host of 12, as it stood at the gate (a tenth at least); before, half however many.
    if (guardsGoOut) assert.ok(share >= 0.1 && share <= 2 / 12 + 1e-9, `share ${share}`);
    else assert.equal(share, s.tuning.raidRecover);
    ok(s, { type: 'pursue' });
    assert.equal(s.res.candles, c0 + Math.floor(loot.candles * share));
    assert.match(act(s, { type: 'pursue' }).error, /no one to go after/);
  }
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

// On to the next season from wherever the keep stands, as its season's end.
function toNextSeason(g) {
  g.day = g.tuning.seasonDays;
  g.phase = 'end';
  g.seasons.push({ season: g.season, day: g.day, lost: null, cracks: 0, answer: null, note: '', summary: {} });
  ok(g, { type: 'nextSeason' });
}

test("paid off with raids still to come, the season's later raids come harder; paid off at its last, the next season's do (round seven)", () => {
  const pay = (over) => {
    const g = raidDay(5, 6, 3, over);
    g.res.food = 40;
    g.res.candles = 20;
    ok(g, { type: 'payOff' });
    return g;
  };
  const later = pay({ raidDays: { 1: 6, 2: 0, 4: 7, 6: 0 } });
  assert.equal(later.embolden, TUNING.raidEmbolden, 'the day-4 raid comes harder');
  assert.ok(!later.grudge);
  assert.ok(later.log.some((l) => /the season's raids after this one come harder/.test(l.text)));
  const last = pay();
  assert.equal(last.embolden || 1, 1, 'nothing left this season to come harder');
  assert.ok(last.log.some((l) => /next season's raids come harder/.test(l.text)));
  toNextSeason(last);
  assert.equal(last.embolden, TUNING.raidEmbolden, 'the next season remembers');
  assert.ok(!last.grudge);
  toNextSeason(last);
  assert.equal(last.embolden, 1, 'for one season');
  // A keep from before forgot it at the season's end.
  const old = pay({ emboldenCarries: 0 });
  assert.equal(old.embolden, TUNING.raidEmbolden);
  toNextSeason(old);
  assert.equal(old.embolden, 1);
});

test('a breach carries off the raiders\' whole share of food, half with a Granary (round seven); a keep from before halved it either way', () => {
  const run = (granary, over = {}) => {
    const g = raidDay(6, 10, 0, over);
    if (!granary) g.keep = { floors: g.keep.floors.map((fl) => fl.map((r) => (r.type === 'granary' ? { ...r, type: 'empty' } : r))) };
    assert.equal(granaryShare(g), granary || over.granaryGuards === 0 ? 0.5 : 1);
    g.res.food = 100;
    until(g, () => g.raid.state === 'breached' || g.raid.state === 'held');
    assert.equal(g.raid.state, 'breached');
    return g.raid.loot.food;
  };
  const kept = run(true);
  const open = run(false);
  assert.ok(kept > 0);
  assert.ok(Math.abs(open - 2 * kept) <= 1, `${open} against ${kept}`);
  assert.equal(run(false, { granaryGuards: 0 }), kept, 'the old rule');
  const g = newSeason(1);
  delete g.tuning.granaryGuards;
  delete g.tuning.emboldenCarries;
  const u = upgrade(JSON.parse(JSON.stringify(g)));
  assert.equal(u.tuning.granaryGuards, 0);
  assert.equal(u.tuning.emboldenCarries, 0);
});
