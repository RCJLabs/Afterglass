import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, hard, hollowWear, hollowHold, hollowNeed, wardHoldOf, wardCost } from '../src/slice/sim.js';
import { geo } from '../src/slice/geo.js';
import { TUNING, STUDIES } from '../src/slice/data.js';

// The Hollow wears through wards faster as it grows, so past the first spring holding it off takes more
// essence; a keep from before keeps its wards holding it wardHold seconds all year.

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0 };
function toNight(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
}
// How long the Hollow batters the first ward on its way before it breaks, on this season's new moon.
function secondsToBreak(s) {
  s.day = s.tuning.seasonDays;
  s.night = null;
  toNight(s);
  s.night.spawns = s.night.spawns.filter((x) => x.type === 'hollow').map((x) => ({ ...x, at: 1 }));
  s.res.essence = 50;
  step(s);
  step(s);
  const h = s.night.foes.find((f) => f.type === 'hollow');
  assert.ok(h, 'the Hollow rose');
  for (const st of geo(s).stairs.filter((x) => x.f === h.f)) ok(s, { type: 'ward', target: st.id });
  let batter = null;
  for (let i = 0; i < 2000 && s.phase === 'night'; i++) {
    step(s);
    if (batter === null && h.mode === 'batter' && !h.path.length) batter = i;
    if (s.log.some((l) => l.text.startsWith('The Hollow breaks the ward'))) return (i - batter) / 10;
  }
  return Infinity;
}

test('a ward holds the Hollow wardHold seconds in the first spring, and less as it grows', () => {
  const s = newSeason(3, { hollowWear: 1 });
  assert.equal(hollowWear(s), 1);
  assert.equal(hollowHold(s), TUNING.wardHold);
  s.season = 7; // year 2's autumn
  assert.ok(hard(s) > 1.8);
  assert.ok(Math.abs(hollowHold(s) - TUNING.wardHold / hard(s)) < 1e-9);
  // Hollow-lore lengthens every ward, as before.
  s.learned = ['hollow'];
  assert.equal(wardHoldOf(s), TUNING.wardHold * STUDIES.hollow.hold);
  assert.ok(Math.abs(hollowHold(s) - (TUNING.wardHold * STUDIES.hollow.hold) / hard(s)) < 1e-9);
  // Half the exponent, half the effect in the logarithm; none, none.
  const half = newSeason(3, { hollowWear: 0.5 });
  half.season = 7;
  assert.ok(Math.abs(hollowWear(half) - Math.sqrt(hard(half))) < 1e-9);
  const off = newSeason(3, { hollowWear: 0 });
  off.season = 7;
  assert.equal(hollowHold(off), TUNING.wardHold);
});

test('in the Tain it breaks through a ward that much sooner, and a keep from before keeps the old hold', () => {
  // (It batters on nine ticks in ten, replanning its way on the tenth, so a ward lasts about a ninth longer
  // than its hold either way; the two keeps are compared with each other.)
  const later = newSeason(11, { ...quiet, hollowWear: 1 });
  later.season = 7;
  const t = secondsToBreak(later);
  const before = newSeason(11, { ...quiet, hollowWear: 1 });
  delete before.tuning.hollowWear;
  delete before.tuning0.hollowWear;
  upgrade(before);
  assert.equal(before.tuning.hollowWear, 0);
  before.season = 7;
  const t0 = secondsToBreak(before);
  assert.ok(Math.abs(t0 / t - hard(later)) < 0.05, `the ward broke after ${t}s, an old keep's after ${t0}s`);
  assert.ok(Math.abs(t0 - (TUNING.wardHold * 10) / 9) <= 0.3, `an old keep's ward broke after ${t0}s`);
});

test("the campaign's Deep grows the Hollow's wear too, from year 4", () => {
  const s = newSeason(5, { campaign: 1, hollowWear: 1 });
  s.season = 13;
  assert.ok(Math.abs(hollowWear(s) - hard(s) * TUNING.hollowRises) < 1e-9);
  s.season = 12;
  assert.ok(Math.abs(hollowWear(s) - hard(s)) < 1e-9);
});

test('what holding it off until dawn takes: the Long Night most of all', () => {
  const s = newSeason(3, { hollowWear: 1 });
  const spring = hollowNeed(s);
  assert.ok(Math.abs(spring.secs - TUNING.nightSecs * TUNING.seasonNight[0] * (1 - TUNING.hollowAt)) < 1e-9);
  assert.equal(spring.wards, 1 + Math.ceil(spring.secs / TUNING.wardHold));
  assert.equal(spring.essence, spring.wards * wardCost(s));
  s.season = 4;
  const long = hollowNeed(s);
  assert.ok(Math.abs(long.secs - TUNING.nightSecs * TUNING.seasonNight[3] * TUNING.longNight * (1 - TUNING.hollowAt)) < 1e-9);
  assert.ok(long.wards > 2 * spring.wards);
});

test('new keeps take the setting as it ships', () => {
  assert.equal(newSeason(1).tuning.hollowWear, TUNING.hollowWear);
});
