import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, hard, hollowGrowth, wardDrawOf, hollowNeed, wardCost } from '../src/slice/sim.js';
import { geo, roomSpan } from '../src/slice/geo.js';
import { TUNING, STUDIES } from '../src/slice/data.js';

// Essence after round six: the store holds essenceCap at most, and a ward on a stair draws on it to hold the
// Hollow while it batters the ward, more as the Hollow grows. Keeps from before have neither.

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0 };
function toDusk(s) {
  while (s.phase === 'day') step(s);
}
function toNight(s) {
  toDusk(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
}
// The Hollow on this season's new moon, both ways up from its floor warded, and how it goes from there.
function hollowAtWard(s, essence) {
  s.day = s.tuning.seasonDays;
  s.night = null;
  toNight(s);
  s.night.spawns = s.night.spawns.filter((x) => x.type === 'hollow').map((x) => ({ ...x, at: 1 }));
  s.res.essence = 30;
  step(s);
  step(s);
  const h = s.night.foes.find((f) => f.type === 'hollow');
  assert.ok(h, 'the Hollow rose');
  for (const st of geo(s).stairs.filter((x) => x.f === h.f)) ok(s, { type: 'ward', target: st.id });
  s.res.essence = essence;
  for (let i = 0; i < 400 && !(h.mode === 'batter' && !h.path.length); i++) step(s);
  assert.equal(h.mode, 'batter');
  return h;
}
const broke = (s) => s.log.some((l) => l.text.startsWith('The Hollow breaks the ward'));
function secondsUntilBroken(s) {
  for (let i = 0; i < 3000 && s.phase === 'night'; i++) {
    step(s);
    if (broke(s)) return i / 10;
  }
  return Infinity;
}

test('the store holds essenceCap at most: what the Choir sings beyond it is lost', () => {
  const sing = (cap) => {
    const t = newSeason(6, { ...quiet, essenceCap: cap });
    const choir = roomSpan(geo(t), 'chapel');
    toDusk(t);
    const [, b] = t.shades;
    ok(t, { type: 'move', id: b.id, f: choir.f, x: 40 });
    ok(t, { type: 'candle', f: choir.f, x: 40 });
    ok(t, { type: 'startNight' });
    t.night.spawns = [];
    while (t.phase === 'night') step(t);
    return t.res.essence;
  };
  assert.ok(sing(0) > 5, 'without a cap it sings past 5');
  assert.equal(sing(3), 3);
});

test('a ward draws on the essence to hold the Hollow, and with the store empty gives way in wardHold seconds', () => {
  const s = newSeason(11, { ...quiet, wardDraw: 0.3 });
  assert.equal(hollowGrowth(s), 1);
  assert.equal(wardDrawOf(s), 0.3);
  hollowAtWard(s, 20);
  const e0 = s.res.essence;
  for (let i = 0; i < 300; i++) step(s);
  assert.ok(!broke(s), 'it holds while the essence lasts');
  // (It batters on nine ticks in ten, replanning its way on the tenth: 27 seconds' drawing in 30.)
  assert.ok(Math.abs(e0 - s.res.essence - 0.3 * 27) < 0.3, `30 seconds drew ${e0 - s.res.essence}`);
  assert.ok(s.log.some((l) => /draws on the essence to hold the Hollow back/.test(l.text)));
  // The store runs dry: then the ward holds as a ward always did, and the page is told.
  s.res.essence = 0;
  const t = secondsUntilBroken(s);
  assert.ok(t <= (TUNING.wardHold * 10) / 9 + 0.5, `broke after ${t}s`);
  assert.ok(s.log.some((l) => /The essence is spent/.test(l.text)));
});

test('the draw grows with the Hollow, Hollow-lore halves it, and the Deep grows it in a campaign', () => {
  const s = newSeason(3, { wardDraw: 0.3 });
  s.season = 7; // year 2's autumn
  assert.ok(Math.abs(wardDrawOf(s) - 0.3 * hard(s)) < 1e-9);
  s.learned = ['hollow'];
  assert.ok(Math.abs(wardDrawOf(s) - (0.3 * hard(s)) / STUDIES.hollow.hold) < 1e-9);
  const c = newSeason(5, { campaign: 1, wardDraw: 0.3 });
  c.season = 13;
  assert.ok(Math.abs(hollowGrowth(c) - hard(c) * TUNING.hollowRises) < 1e-9);
  c.season = 12;
  assert.ok(Math.abs(hollowGrowth(c) - hard(c)) < 1e-9);
});

test('what holding it off until dawn takes, and the Long Night most of all', () => {
  const s = newSeason(3, { wardDraw: 0.3 });
  const spring = hollowNeed(s);
  assert.ok(Math.abs(spring.secs - TUNING.nightSecs * TUNING.seasonNight[0] * (1 - TUNING.hollowAt)) < 1e-9);
  assert.ok(Math.abs(spring.essence - (2 * wardCost(s) + spring.secs * 0.3)) < 1e-9);
  s.season = 4;
  const long = hollowNeed(s);
  assert.ok(Math.abs(long.secs - TUNING.nightSecs * TUNING.seasonNight[3] * TUNING.longNight * (1 - TUNING.hollowAt)) < 1e-9);
  assert.ok(long.essence > 2 * spring.essence);
});

test('a keep from before has neither: its wards hold wardHold seconds and draw nothing, and its store has no limit', () => {
  const s = newSeason(11, quiet);
  for (const t of [s.tuning, s.tuning0]) {
    delete t.wardDraw;
    delete t.essenceCap;
  }
  upgrade(s);
  assert.equal(s.tuning.wardDraw, 0);
  assert.equal(s.tuning.essenceCap, 0);
  hollowAtWard(s, 20);
  const e0 = s.res.essence;
  const t = secondsUntilBroken(s);
  assert.ok(Math.abs(t - (TUNING.wardHold * 10) / 9) <= 0.5, `broke after ${t}s`);
  assert.ok(s.res.essence >= e0 - 1e-9, 'nothing drawn');
});

test('new keeps draw and cap as they ship', () => {
  assert.ok(TUNING.wardDraw > 0 && TUNING.essenceCap > 0);
  const s = newSeason(1);
  assert.equal(s.tuning.wardDraw, TUNING.wardDraw);
  assert.equal(s.tuning.essenceCap, TUNING.essenceCap);
});
