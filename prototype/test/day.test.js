// Round seven, phase 10: day decisions with teeth. Guards muster before the Host comes; a sally or a pursuit
// counts the guards who go out; the Forge makes arms by day, and a Forge nobody works can't catch fire; traders
// take glass and the almoner remembrance as well as food; and the Lantern Church judges the keep by its ledger,
// the Dread of every day since it last looked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, defense, isGuard, musterOf, livingMult, sallyOdds, guardStrength, armsCap, armedDefense, jobCap, jobCount, ledgerDread, judgedDread, dayTicks } from '../src/slice/sim.js';
import { DAY_ROOMS, TICKS_PER_SEC } from '../src/slice/data.js';
import { roomsOf, geo } from '../src/slice/geo.js';

const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, fire: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, visitors: 0, weather: 0, firstInspection: 99 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const until = (s, f) => {
  for (let i = 0; i < 5000 && s.phase === 'day' && !f(); i++) step(s);
};
const secs = (s, n) => {
  for (let i = 0; i < n * TICKS_PER_SEC && s.phase === 'day'; i++) step(s);
};
// Seconds at 1× a guard takes to muster in full today: musterHours of the day's twelve.
const musterSecs = (s) => ((s.tuning.musterHours / 12) * dayTicks(s)) / TICKS_PER_SEC;
// Someone who could be posted: grown, well, not on a post already.
const hand = (s) => s.living.find((p) => !isGuard(p) && p.age !== 'child' && !(p.sick > 0));
// Through dusk, a night with no Unlit, and the rite, to the next morning.
function nextDay(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  ok(s, { type: 'beginDay' });
}

test('a guard musters: nothing at first, in full after musterHours of the day at the post, and from nothing again off it', () => {
  const s = newSeason(3, quiet);
  for (const g of s.living.filter(isGuard)) assert.equal(musterOf(s, g), 1, "the keep's first guards have stood their posts");
  if (jobCount(s, 'barracks') >= jobCap(s, 'barracks')) ok(s, { type: 'assign', id: s.living.find(isGuard).id, room: 'yard' });
  const p = hand(s);
  const d0 = defense(s);
  ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  assert.equal(musterOf(s, p), 0);
  assert.ok(Math.abs(defense(s) - d0) < 1e-9, 'counts for nothing yet');
  secs(s, musterSecs(s) / 2);
  assert.ok(Math.abs(musterOf(s, p) - 0.5) < 0.02);
  secs(s, musterSecs(s));
  assert.equal(musterOf(s, p), 1);
  assert.ok(Math.abs(defense(s) - d0 - DAY_ROOMS.barracks.rate * livingMult(s, p)) < 1e-6, 'in full');
  ok(s, { type: 'assign', id: p.id, room: 'yard' });
  ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  assert.equal(musterOf(s, p), 0, 'off the post, from nothing again');
  // As before: a guard counts the moment they're posted.
  const o = newSeason(3, { ...quiet, muster: 0 });
  if (jobCount(o, 'barracks') >= jobCap(o, 'barracks')) ok(o, { type: 'assign', id: o.living.find(isGuard).id, room: 'yard' });
  const q = hand(o);
  const e0 = defense(o);
  ok(o, { type: 'assign', id: q.id, room: 'barracks' });
  assert.ok(Math.abs(defense(o) - e0 - DAY_ROOMS.barracks.rate * livingMult(o, q)) < 1e-6);
});

test('guards posted when the Host is at the gate count for little there; posted on the road, in full', () => {
  const at = (when) => {
    const s = newSeason(7, { ...quiet, raidDays: { 1: 8, 2: 0, 4: 0, 6: 0 }, raidSpread: 0, forgeArms: 0 });
    for (const g of s.living.filter(isGuard)) ok(s, { type: 'assign', id: g.id, room: 'yard' });
    s.watchBonus = 0;
    until(s, () => (when === 'road' ? s.raid?.warned : s.raid?.state === 'assault'));
    const ps = s.living.filter((p) => p.age !== 'child' && !(p.sick > 0)).slice(0, jobCap(s, 'barracks'));
    for (const p of ps) ok(s, { type: 'assign', id: p.id, room: 'barracks' });
    until(s, () => s.raid.state === 'assault');
    const hit = defense(s);
    until(s, () => s.raid.state !== 'assault');
    return { hit, gate: s.raid.gate, guards: ps.length };
  };
  const road = at('road');
  const gate = at('gate');
  assert.ok(road.hit >= road.guards * DAY_ROOMS.barracks.rate * 0.5, `mustered on the road: ${road.hit}`);
  assert.ok(gate.hit < 0.1, `fresh at the gate: ${gate.hit}`);
  assert.ok(gate.gate < road.gate, 'and the gate gives more');
});

test('a sally counts only the guards who go out, as mustered and armed, not the ward or the Watch', () => {
  const s = newSeason(3, { ...quiet, forgeArms: 0 });
  for (const g of s.living.filter(isGuard)) ok(s, { type: 'assign', id: g.id, room: 'yard' });
  s.siege = { from: s.day, until: s.day + 1, strength: 4, broken: false };
  s.watchBonus = 20;
  assert.equal(sallyOdds(s), 0.1, 'no guards: the Watch of the dead stays in');
  const p = hand(s);
  ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  p.muster = 1;
  const str = DAY_ROOMS.barracks.rate * livingMult(s, p);
  assert.ok(Math.abs(guardStrength(s) - str) < 1e-9);
  assert.ok(Math.abs(sallyOdds(s) - Math.min(0.9, Math.max(0.1, str / (s.tuning.sallyOdds * 4)))) < 1e-9);
  // As before: the whole keep's defense, the Watch in it.
  s.tuning.guardsGoOut = 0;
  assert.equal(sallyOdds(s), 0.9);
});

test('the Forge makes arms by day, up to one for each post; each arms a guard at the gate, and a raid breaks some', () => {
  const s = newSeason(5, { ...quiet, raidDays: { 2: 9, 4: 0, 6: 0 }, raidSpread: 0 });
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'forge' });
  const smith = hand(s);
  ok(s, { type: 'assign', id: smith.id, room: 'forge' });
  const d0 = defense(s);
  secs(s, 10);
  assert.ok(s.arms > 0 && s.arms < 1, `arms ${s.arms}`);
  assert.ok(Math.abs(defense(s) - d0) < 1e-9, 'a smith is no defense at the gate himself, and part of an arm is none');
  s.arms = armsCap(s) - 0.05;
  secs(s, 10);
  assert.equal(s.arms, armsCap(s), 'no more than one for each post');
  const guards = s.living.filter(isGuard).length;
  assert.ok(guards > 0);
  assert.ok(Math.abs(armedDefense(s) - guards * s.tuning.armDefense) < 1e-9, 'each guard armed');
  // A raid at the gate breaks a quarter of the arms in use, one at least.
  nextDay(s);
  const before = s.arms;
  until(s, () => s.raid?.state === 'held' || s.raid?.state === 'breached');
  const used = Math.min(Math.floor(before), s.living.filter(isGuard).length);
  assert.ok(s.arms <= before - Math.max(1, Math.round(used * s.tuning.armsBreak)) + 1e-9, `${before} -> ${s.arms}`);
  assert.ok(s.log.some((l) => /arms? broke at the gate/.test(l.text)));
  // As before: a smith is 1 defense at the gate, and makes nothing.
  const o = newSeason(5, { ...quiet, forgeArms: 0 });
  o.res.stone = 99;
  ok(o, { type: 'raise', room: 'forge' });
  const e0 = defense(o);
  const q = hand(o);
  ok(o, { type: 'assign', id: q.id, room: 'forge' });
  assert.ok(Math.abs(defense(o) - e0 - DAY_ROOMS.forge.rate * livingMult(o, q)) < 1e-6);
  secs(o, 10);
  assert.ok(!o.arms);
});

test('a Forge nobody works is cold, and a fire meant for it never catches', () => {
  const burn = (coldForge, smith) => {
    const s = newSeason(5, { ...quiet, fire: 1, coldForge });
    s.res.stone = 99;
    ok(s, { type: 'raise', room: 'forge' });
    if (smith) ok(s, { type: 'assign', id: hand(s).id, room: 'forge' });
    const room = roomsOf(geo(s), 'forge')[0].id;
    s.events.unshift({ at: s.t + 1, type: 'fire', room });
    secs(s, 1);
    return s.fires.some((f) => f.room === room);
  };
  assert.equal(burn(1, false), false);
  assert.equal(burn(1, true), true);
  assert.equal(burn(0, false), true, 'as before: an empty Forge burns');
});

test('a trader takes glass, and the almoner prayers, for what they would take food for', () => {
  let n = 0;
  const visit = (s, kind) => {
    const v = { id: `v${s.season}.${s.day}.${n++}`, kind, at: s.t, until: s.t + 500, here: true, done: null };
    s.visitors.push(v);
    return v;
  };
  const s = newSeason(3, { ...quiet, visitors: 1 });
  s.res.glass = 20;
  s.res.remembrance = 10;
  const food = s.res.food;
  const candles = s.res.candles;
  ok(s, { type: 'visitor', id: visit(s, 'chandler').id, answer: 'glass' });
  assert.deepEqual([s.res.glass, s.res.candles, s.res.food], [17, candles + 4, food]);
  ok(s, { type: 'visitor', id: visit(s, 'reeve').id, answer: 'glass' });
  assert.equal(s.riders, 3, "the lord's riders, as for food");
  const mirrors = s.mirrors.length;
  ok(s, { type: 'visitor', id: visit(s, 'mirrors').id, answer: 'glass' });
  assert.equal(s.mirrors.length, mirrors + 1);
  s.dread = 3;
  ok(s, { type: 'visitor', id: visit(s, 'almoner').id, answer: 'pray' });
  assert.deepEqual([s.dread, s.res.remembrance], [2, 8]);
  // As before: food only.
  const o = newSeason(3, { ...quiet, visitors: 1, payInKind: 0 });
  o.res.glass = 20;
  assert.match(act(o, { type: 'visitor', id: visit(o, 'chandler').id, answer: 'glass' }).error, /No such answer/);
});

test("the Church judges the keep's ledger: the Dread of each day since it last looked, at dusk, and today's at noon", () => {
  const judge = (churchLedger) => {
    const s = newSeason(9, { ...quiet, firstInspection: 3, churchLedger, dreadLivingPer: 100 });
    // Two days held at Dread 3, and covered down to 0 the morning of the inspection.
    for (let d = 1; d < 3; d++) {
      until(s, () => s.t >= 10);
      s.dread = 3;
      nextDay(s);
    }
    assert.equal(s.inspection?.day, 3);
    s.dread = 0;
    until(s, () => s.inspection.done);
    return s;
  };
  const s = judge(1);
  // (3 + 3 + 0) / 3 = 2: warned.
  assert.equal(s.inspections.at(-1).verdict, 'warned');
  assert.equal(s.inspections.at(-1).dread, 2);
  assert.ok(s.log.some((l) => /reads the keep's ledger: Dread 2 on average over 3 days/.test(l.text)));
  assert.deepEqual(s.churchLog, [], 'the ledger starts again');
  assert.equal(ledgerDread(s), s.dread);
  assert.equal(judgedDread(s), s.dread);
  // As before: the Dread at noon, 0, blesses it.
  assert.equal(judge(0).inspections.at(-1).verdict, 'blessed');
});
