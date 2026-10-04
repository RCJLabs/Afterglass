import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, canWork, capacity, preyNear } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { howTo } from '../src/slice/howto.js';
import { epitaph } from '../src/slice/book.js';
import { geo, lightMap } from '../src/slice/geo.js';
import { MIRRORS, TUNING } from '../src/slice/data.js';

// The original four-floor keep, nothing by day to get in the way, and no weather.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// To the dusk of the day, the dead woken, candles still to set.
function toDusk(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
}
// Through a night with no Unlit, to the rite.
function quietNight(s) {
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
}

test('a shade sent down at dusk is out of the Tain all night, and back at dawn with quicksilver for its depth', () => {
  const s = newSeason(3, { ...quiet, deepCatch: [0, 0, 0] });
  toDusk(s);
  const d = s.shades[0];
  const mem = d.memory;
  ok(s, { type: 'descend', id: d.id, depth: 2 });
  assert.equal(d.deep, 2);
  assert.ok(!canWork(d));
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  for (let i = 0; i < 50; i++) step(s);
  // Nothing in the Tain can find it: it's no one's prey even standing in the dark.
  const c = { type: 'creeper', f: d.f, x: d.x };
  assert.equal(preyNear(s, lightMap(geo(s), s.tuning, []), c, d.x, d.x)?.id === d.id, false);
  while (s.phase === 'night') step(s);
  assert.equal(d.deep, 0);
  assert.equal(s.res.quicksilver, TUNING.deepSilver[1]);
  assert.ok(canWork(d));
  assert.ok(s.log.some((l) => l.text === `${d.name} comes back up from the Deep with ${TUNING.deepSilver[1]} quicksilver.`));
  assert.deepEqual(s.today.night.deep, [{ name: d.name, depth: 2, silver: TUNING.deepSilver[1] }]);
  assert.equal(d.memory, mem - TUNING.fadePerNight * (d.named ? 0.5 : 1) * (d.trait === 'anchored' ? 0.5 : d.trait === 'reckless' ? 2 : 1), 'it fades as any night');
});

test('caught in the Deep: back empty-handed and drained, or not at all', () => {
  const s = newSeason(3, { ...quiet, deepCatch: [1, 1, 1], traits: 0 });
  toDusk(s);
  const [a, b] = s.shades;
  a.memory = 90;
  b.memory = 30;
  ok(s, { type: 'descend', id: a.id, depth: 1 });
  ok(s, { type: 'descend', id: b.id, depth: 3 });
  quietNight(s);
  assert.equal(s.res.quicksilver || 0, 0);
  assert.equal(a.memory, 90 - TUNING.deepDrain - TUNING.fadePerNight * (a.named ? 0.5 : 1));
  assert.ok(s.log.some((l) => l.text.startsWith(`${a.name} comes back up from the Deep empty-handed.`)));
  assert.ok(!s.shades.includes(b));
  const e = s.ledger.find((x) => x.id === b.id);
  assert.equal(e.end, 'deep');
  assert.match(epitaph(e), /Went down into the Deep for quicksilver on day 1( of the first season)?, and never came back up\./);
  assert.ok(s.today.night.lost.includes(b.name));
});

test('only at dusk, never on the new moon, and a shade can be called back before the night', () => {
  const s = newSeason(3, quiet);
  const d = s.shades[0];
  assert.match(act(s, { type: 'descend', id: d.id, depth: 1 }).error, /at dusk/);
  toDusk(s);
  assert.match(act(s, { type: 'descend', id: d.id, depth: 4 }).error, /No such depth/);
  ok(s, { type: 'descend', id: d.id, depth: 3 });
  ok(s, { type: 'descend', id: d.id, depth: 0 });
  assert.equal(d.deep, 0);
  assert.ok(canWork(d));
  // The new moon's dusk.
  while (s.day < s.tuning.seasonDays) {
    quietNight(s);
    ok(s, { type: 'beginDay' });
    toDusk(s);
  }
  assert.match(act(s, { type: 'descend', id: d.id, depth: 1 }).error, /the Hollow is down there/);
});

test('quicksilver upgrades a mirror where it hangs, its shades and all', () => {
  const s = newSeason(3, quiet);
  const hand = s.mirrors.find((m) => m.type === 'hand');
  const cap = capacity(s).cap;
  assert.match(act(s, { type: 'upgradeMirror', id: hand.id }).error, /takes 3 quicksilver and 4 glass/);
  s.res.quicksilver = 10;
  s.res.glass = 20;
  const who = s.shades.filter((d) => d.mirror === hand.id).map((d) => d.id);
  ok(s, { type: 'upgradeMirror', id: hand.id });
  assert.equal(hand.type, 'pier');
  assert.equal(hand.name, `${hand.name.split(' ')[0]} ${MIRRORS.pier.name}`);
  assert.equal(capacity(s).cap, cap + MIRRORS.pier.cap - MIRRORS.hand.cap);
  assert.deepEqual(s.shades.filter((d) => d.mirror === hand.id).map((d) => d.id), who);
  assert.deepEqual([s.res.quicksilver, s.res.glass], [10 - TUNING.upgradeSilver.pier, 20 - TUNING.upgradeGlass.pier]);
  ok(s, { type: 'upgradeMirror', id: hand.id });
  assert.equal(hand.type, 'great');
  // Since phase 12 a great glass grows once more, into a great-glass hall (test/growth.test.js); without halls, it's as great as a glass gets.
  assert.match(act(s, { type: 'upgradeMirror', id: hand.id }).error, /takes 8 quicksilver and 20 glass/);
  s.tuning.glassHalls = 0;
  assert.match(act(s, { type: 'upgradeMirror', id: hand.id }).error, /as great as a glass can be/);
});

test('a keep that goes down replays exactly; an old save plays on without it; How to play covers it', () => {
  // Played by the autopilot, but for the shades sent down, so every step is an action.
  const s = newSeason(5, { ...quiet, weather: 1 });
  const toDuskAuto = () => {
    while (s.phase !== 'dusk' && s.phase !== 'over') autoStep(s, 'balanced');
    if (s.dusk?.step === 'crypt') ok(s, { type: 'wake' });
  };
  toDuskAuto();
  ok(s, { type: 'descend', id: s.shades[0].id, depth: 3 });
  autoStep(s, 'balanced');
  assert.equal(s.phase, 'night');
  while (s.phase === 'night') autoStep(s, 'balanced');
  toDuskAuto();
  ok(s, { type: 'descend', id: s.shades.find(canWork).id, depth: 1 });
  assert.ok(s.today.night === null && s.days.at(-1).night.deep.length === 1, 'the first night had one down');
  const r = replay(s.seed, s.tuning0, s.actions);
  assert.equal(r.phase, s.phase);
  assert.equal(r.log.length, s.log.length);
  assert.deepEqual([r.res.quicksilver, r.shades.map((d) => [d.id, d.memory, d.deep])], [s.res.quicksilver, s.shades.map((d) => [d.id, d.memory, d.deep])]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { deep: 0 })));
  delete old.tuning.deep;
  delete old.tuning0.deep;
  const g = upgrade(old);
  assert.equal(g.tuning.deep, 0);
  toDusk(g);
  assert.match(act(g, { type: 'descend', id: g.shades[0].id, depth: 1 }).error, /The way down is closed/);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /go down into the Deep/);
  assert.ok(!/go down into the Deep/.test(all({ ...TUNING, deep: 0 })));
});
