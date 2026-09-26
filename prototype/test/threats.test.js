import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, nightTicks } from '../src/slice/sim.js';
import { threats } from '../src/slice/threats.js';
import { MAP } from '../src/slice/data.js';
import { DEEP_FLOOR, geo } from '../src/slice/geo.js';

// The original four-floor keep, nothing by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Dusk, the dead woken, these candles set, and everyone posted out of the way: on the Veil floor, or where
// the shades option puts them.
function dusk(seed, candles, over = {}, shades = (i) => [3, 64 + i * 5]) {
  const s = newSeason(seed, { ...quiet, ...over });
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  s.res.candles = 20;
  s.shades.forEach((d, i) => ok(s, { type: 'move', id: d.id, f: shades(i)[0], x: shades(i)[1] }));
  for (const [f, x] of candles) ok(s, { type: 'candle', f, x });
  return s;
}
// Begin the night with no spawns of its own, then raise one foe at a rift and let it think.
function raise(s, type, rift, temper = 'climb') {
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const c = addFoe(s, type, DEEP_FLOOR, rift.x, { temper });
  step(s);
  return c;
}
const stepFor = (s, secs) => {
  for (let i = 0; i < secs * 10 && s.phase === 'night'; i++) step(s);
};
const [LEFT, RIGHT] = MAP.rifts;
const LINE = [[2, 16], [2, 96]];

test('the line lit: each rift\'s tide will gnaw the line on its own side, and does', () => {
  const s = dusk(3, LINE);
  const th = threats(s);
  const [l, r] = th.rises.map((e) => e.way);
  const at = (x) => s.night.candles.find((k) => k.x === x).id;
  assert.equal(l.end, 'gnaw');
  assert.equal(l.candle, at(16));
  assert.equal(r.candle, at(96));
  const c = raise(s, 'creeper', LEFT);
  assert.equal(c.mode, 'gnaw');
  assert.equal(c.gnaw, l.candle);
  for (let i = 0; i < 400 && !c.gnawing; i++) step(s);
  assert.ok(c.gnawing, 'it gets there and gnaws');
  // Where it starts to gnaw: the light has burned down a little on the way, so a step or so in.
  const end = l.pts[l.pts.length - 1];
  assert.equal(c.f, end.f);
  assert.ok(Math.abs(c.x - end.x) < 2, `it gnaws at ${c.x}, the mirror said ${end.x}`);
});

test('a room lit below the line with a dark way round it: the tide goes round, and the mirror says so', () => {
  const s = dusk(3, [...LINE, [1, 30]]);
  const l = threats(s).rises[0].way;
  assert.equal(l.end, 'gnaw');
  assert.equal(l.candle, s.night.candles.find((k) => k.x === 96).id, 'up the dark right side, to the line there');
  assert.ok(l.pts.some((p) => p.f === 0 && p.x > 80), 'across the deepest floor first');
  const c = raise(s, 'creeper', LEFT);
  assert.equal(c.gnaw, l.candle);
});

test('a way left open: the mirror rings the mirror they will reach, and they climb to it', () => {
  // Only the left stair lit, with the shades in its light, safe.
  const s = dusk(4, [[2, 16]], {}, (i) => [2, 10 + i * 4]);
  const r = threats(s).rises[1].way;
  assert.equal(r.end, 'veil');
  assert.ok(MAP.mirrors.some((m) => m.id === r.mirror));
  const c = raise(s, 'creeper', RIGHT);
  assert.equal(c.mode, 'climb');
  assert.deepEqual(c.path.map((p) => [p.f, p.x]), r.pts.slice(1).map((p) => [p.f, p.x]));
});

test('a shade left in the dark on the way is caught first', () => {
  const s = dusk(5, LINE);
  const d = s.shades[0];
  ok(s, { type: 'move', id: d.id, f: 1, x: 30 });
  const l = threats(s).rises[0].way;
  assert.equal(l.end, 'catch');
  assert.equal(l.prey, d.id);
  const c = raise(s, 'creeper', LEFT);
  for (let i = 0; i < 300 && c.mode !== 'hunt'; i++) step(s);
  assert.equal(c.mode, 'hunt');
  assert.equal(c.prey, d.id);
});

test('candle hunters make for the nearest candle by their way, as the mirror says', () => {
  const s = dusk(3, [...LINE, [1, 30]]);
  // Tonight: one candle hunter and one climber from the left rift.
  s.night.spawns = ['snuff', 'climb'].map((temper) => ({ at: 100, type: 'creeper', seep: false, snuff: temper === 'snuff', rift: LEFT.id }));
  const e = threats(s).rises[0];
  assert.equal(e.snuff, 1);
  assert.equal(e.hunt.end, 'gnaw');
  const c = raise(s, 'creeper', LEFT, 'snuff');
  assert.equal(c.mode, 'gnaw');
  assert.equal(c.gnaw, e.hunt.candle);
  assert.deepEqual(c.path.map((p) => [p.f, p.x]), e.hunt.pts.slice(1).map((p) => [p.f, p.x]));
});

test('the Maw: the mirror names what it would make for, as things stand', () => {
  const s = dusk(6, LINE, { mawFrom: 1 });
  const th = threats(s);
  assert.equal(th.maws.length, 1);
  const m = th.maws[0];
  assert.ok(m.target, 'it has something to go for');
  const maw = raise(s, 'maw', MAP.rifts.find((r) => r.id === m.rift));
  for (let i = 0; i < 90 && maw.rising > 0; i++) step(s);
  step(s);
  assert.equal(maw.target.kind, m.target.kind);
  assert.equal(maw.target.id, m.target.id);
});

test('the new moon: the Hollow\'s way to a mirror, and the warded stairs that will hold it', () => {
  const s = dusk(7, LINE, { seasonDays: 1 });
  let h = threats(s).hollow;
  assert.ok(h, 'the Hollow rises tonight');
  assert.equal(h.pts[0].f, DEEP_FLOOR);
  assert.equal(h.pts[h.pts.length - 1].f, geo(s).veil, 'to the Veil floor');
  assert.equal(h.pts.filter((p, i) => i && p.f !== h.pts[i - 1].f).length, geo(s).veil, 'a climb for every floor');
  assert.deepEqual(h.held, [], 'no wards yet');
  // Every stair warded: no way round, so the wards on its way are the ones that hold it.
  s.res.essence = 100;
  for (const st of geo(s).stairs) ok(s, { type: 'ward', target: st.id });
  h = threats(s).hollow;
  assert.equal(h.held.length, geo(s).veil);
});

test('tonight\'s Creepers all counted: by rift and temper, seeping, in tides or alone', () => {
  for (const seed of [1, 2, 3]) {
    const s = dusk(seed, LINE, { seepFrom: 1 });
    const th = threats(s);
    const n = s.night.spawns.filter((x) => x.type === 'creeper').length;
    assert.equal(th.rises.reduce((a, e) => a + e.climb + e.snuff, 0) + th.seep, n);
    assert.equal(th.tides.reduce((a, t) => a + t.count, 0) + th.alone, n);
    assert.ok(th.tides.every((t) => t.at > 0 && t.at < nightTicks(s)));
  }
});

test('tomorrow\'s raid: the mirror\'s range holds the strength rolled at dawn', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = dusk(seed, LINE, { raidDays: { 2: 4 } });
    const { raid } = threats(s);
    assert.equal(raid.day, 2);
    assert.ok(raid.lo < raid.hi);
    s.night.spawns = [];
    ok(s, { type: 'startNight' });
    while (s.phase === 'night') step(s);
    ok(s, { type: 'beginDay' });
    assert.ok(s.raid.strength >= raid.lo - 0.05 && s.raid.strength <= raid.hi + 0.05, `${s.raid.strength} outside ${raid.lo}–${raid.hi}`);
  }
});

test('reading the mirror changes nothing', () => {
  const s = dusk(8, [...LINE, [1, 30]], { mawFrom: 1 });
  const before = JSON.stringify(s);
  threats(s);
  assert.equal(JSON.stringify(s), before);
});
