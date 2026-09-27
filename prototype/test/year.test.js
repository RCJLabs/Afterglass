import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, dayTicks, nightTicks, seasonName, yearOf, isLongNight, hard } from '../src/slice/sim.js';
import { TUNING } from '../src/slice/data.js';

// The original four-floor keep, nothing by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const T = TUNING;

test('the seasons turn spring, summer, autumn, winter and round again, and the days and nights with them', () => {
  const s = newSeason(3, quiet);
  const seen = [];
  for (let n = 1; n <= 5; n++) {
    s.season = n;
    seen.push([seasonName(s), yearOf(s), dayTicks(s), nightTicks(s)]);
  }
  const d = (k) => Math.round(T.daySecs * T.seasonDay[k] * 10);
  const nt = (k) => Math.round(T.nightSecs * T.seasonNight[k] * 10);
  assert.deepEqual(seen, [
    ['spring', 1, d(0), nt(0)],
    ['summer', 1, d(1), nt(1)],
    ['autumn', 1, d(2), nt(2)],
    ['winter', 1, d(3), nt(3)],
    ['spring', 2, d(0), nt(0)],
  ]);
  assert.ok(d(1) > d(0) && nt(1) < nt(0), 'summer: long days, short nights');
  assert.ok(d(3) < d(0) && nt(3) > nt(0), 'winter: short days, long nights');
});

// Candles made in one whole day, by the keep's chandlers, in a given season.
function candlesInADay(season) {
  const s = newSeason(4, quiet);
  s.season = season;
  const c0 = s.res.candles;
  while (s.phase === 'day') step(s);
  return s.res.candles - c0;
}

test("a day's work grows and shrinks with the day", () => {
  const spring = candlesInADay(1);
  assert.ok(spring > 0);
  assert.ok(Math.abs(candlesInADay(2) / spring - T.seasonDay[1]) < 1e-6, 'summer');
  assert.ok(Math.abs(candlesInADay(4) / spring - T.seasonDay[3]) < 1e-6, 'winter');
});

test("winter's seventh night is the Long Night: twice as long, the Hollow and a Maw, more Creepers and one tide more", () => {
  const s = newSeason(5, quiet);
  s.season = 4;
  s.day = T.seasonDays;
  assert.ok(isLongNight(s));
  while (s.phase === 'day') step(s);
  const n = s.night;
  assert.equal(nightTicks(s), Math.round(T.nightSecs * T.seasonNight[3] * T.longNight * 10));
  const count = (type) => n.spawns.filter((x) => x.type === type).length;
  assert.equal(count('hollow'), 1);
  assert.equal(count('maw'), Math.round(T.mawsPerNight));
  assert.equal(count('creeper'), Math.round((T.creepersBase + T.creepersPerNight * (T.seasonDays - 1)) * T.longNightCreepers * hard(s)));
  assert.equal(n.tides.length, 2 + Math.floor(T.seasonDays / T.tideEvery));
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  assert.ok(s.log.some((l) => /Night 7: the Long Night/.test(l.text)));
  // A new moon in any other season is the ordinary one.
  const moon = newSeason(5, quiet);
  moon.season = 3;
  moon.day = T.seasonDays;
  while (moon.phase === 'day') step(moon);
  assert.equal(moon.night.spawns.filter((x) => x.type === 'maw').length, 0);
  assert.equal(nightTicks(moon), Math.round(T.nightSecs * T.seasonNight[2] * 10));
});

test('the Long Night ends the year, and the next season is the spring of year two', () => {
  const s = newSeason(6, quiet);
  s.season = 4;
  s.day = T.seasonDays;
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  assert.equal(s.phase, 'end');
  ok(s, { type: 'nextSeason' });
  assert.equal(s.season, 5);
  assert.equal(seasonName(s), 'spring');
  assert.equal(yearOf(s), 2);
  assert.ok(s.log.some((l) => /A new year begins: year 2\./.test(l.text)));
});

test('with the year off every season is spring, and older saves have it off', () => {
  const s = newSeason(7, { ...quiet, year: 0 });
  s.season = 4;
  assert.equal(seasonName(s), 'spring');
  assert.equal(dayTicks(s), T.daySecs * 10);
  s.day = T.seasonDays;
  assert.ok(!isLongNight(s));
  const old = JSON.parse(JSON.stringify(newSeason(8, quiet)));
  delete old.tuning.year;
  delete old.tuning0.year;
  assert.equal(upgrade(old).tuning0.year, 0);
});
