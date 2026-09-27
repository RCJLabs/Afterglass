import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, yearOf, seasonIndex } from '../src/slice/sim.js';
import { epitaph } from '../src/slice/book.js';
import { geo, roomsOf } from '../src/slice/geo.js';

// The original four-floor keep with nothing to harm it: no raids, sickness, deaths of old age, fire or
// weather, and stores enough that nobody starves while no one runs it.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0, siege: 0, plague: 0, startFood: 99999, newcomerEvery: 99, errands: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Through dusk, a night with no Unlit, and the rite, to the next morning (across a season's end).
function nextDay(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  ok(s, { type: 'beginDay' });
}
const toSeason = (s, n) => {
  while (s.season < n) nextDay(s);
};
const ages = (s) => Object.fromEntries(s.living.map((p) => [p.name, p.age]));

test('nothing changes through the first year; the second spring, the living age and the unwed pair off', () => {
  const s = newSeason(3, { ...quiet, oldChance: 1, pairChance: 1, birthChance: 0 });
  const first = ages(s);
  toSeason(s, 4);
  assert.deepEqual(ages(s), first, 'no one aged in the first year');
  const unwed = s.living.filter((p) => !p.bond).map((p) => p.name);
  toSeason(s, 5);
  assert.equal(yearOf(s), 2);
  assert.equal(seasonIndex(s), 0);
  for (const [name, age] of Object.entries(first)) {
    const now = s.living.find((p) => p.name === name).age;
    assert.equal(now, { young: 'adult', adult: 'old', old: 'old' }[age], name);
  }
  // Grown this spring, the once-young pair off (the old don't), in the order they came.
  const pairs = s.living.filter((p) => p.bond?.rel === 'spouse' && unwed.includes(p.name));
  for (const p of pairs) assert.equal(s.living.find((q) => q.id === p.bond.with).bond.with, p.id);
  assert.ok(s.log.some((l) => l.season === 5 && /grows old/.test(l.text)));
});

test("generations roll from their own stream: the second spring's ageing draws nothing from the keep's", () => {
  // The end of the first year, then the dawn of the second, when the living age and pair off.
  const yearEnd = (tuning) => {
    const s = newSeason(3, { ...quiet, ...tuning });
    toSeason(s, 4);
    for (;;) {
      while (s.phase === 'day') step(s);
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
      s.night.spawns = [];
      while (s.phase === 'night') step(s);
      if (s.phase === 'end') break;
      ok(s, { type: 'beginDay' });
    }
    ok(s, { type: 'nextSeason' });
    return s;
  };
  const on = yearEnd({ oldChance: 0.5, pairChance: 0.5 });
  const off = yearEnd({ generations: 0 });
  assert.notDeepEqual(ages(on), ages(off));
  assert.equal(on.rng, off.rng);
});

test('a couple has a child; children do no work and answer no bell, and come of age the next spring', () => {
  const s = newSeason(3, { ...quiet, oldChance: 0, pairChance: 0, birthChance: 1 });
  toSeason(s, 5);
  const kids = s.living.filter((p) => p.age === 'child');
  assert.equal(kids.length, 1, 'Bran and Mira, the one couple, have a child');
  const c = kids[0];
  const parent = s.living.find((p) => p.id === c.bond.with);
  assert.ok(['Bran', 'Mira'].includes(parent.name));
  assert.equal(c.born, true);
  assert.equal(c.job, null);
  assert.ok(s.log.some((l) => new RegExp(`have a child, ${c.name}`).test(l.text)));
  assert.match(act(s, { type: 'assign', id: c.id, room: 'hearth' }).error, /too young to work/);
  // One child a season while there's room: the couple has another each season.
  toSeason(s, 6);
  assert.equal(s.living.filter((p) => p.age === 'child').length, 2);
  // The bell sends everyone well to a fire, but not a child.
  const room = roomsOf(geo(s), 'hearth')[0].id;
  s.events.unshift({ at: s.t + 1, type: 'fire', room });
  step(s);
  ok(s, { type: 'fightFire', room, bell: true });
  assert.ok(s.living.some((p) => p.age !== 'child' && p.fighting === room));
  assert.ok(s.living.filter((p) => p.age === 'child').every((p) => !p.fighting));
  // The next spring the first comes of age and can work.
  toSeason(s, 9);
  assert.equal(c.age, 'young');
  ok(s, { type: 'assign', id: c.id, room: 'hearth' });
});

test("the keep's own children are in the Book, and an old save plays on without generations", () => {
  const e = { name: 'Wren', from: 'living', age: 'child', job: null, born: true, joined: { season: 5, day: 1 }, bond: { name: 'Bran', rel: 'child' }, how: 'died of sickness', season: 6, day: 3, woke: 'pale', nights: 0 };
  assert.match(epitaph(e), /^Child of Bran, born in the keep in the fifth season\. Died of sickness on day 3 of the sixth season\./);
  const old = JSON.parse(JSON.stringify(newSeason(4, { generations: 0 })));
  delete old.tuning.generations;
  delete old.tuning0.generations;
  assert.equal(upgrade(old).tuning.generations, 0);
});
