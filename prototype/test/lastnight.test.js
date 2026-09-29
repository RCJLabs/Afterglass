// Round seven, phase 7: As last night at dusk, and auto-relight, on in Gentle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, canWork } from '../src/slice/sim.js';
import { geo, lineSpots } from '../src/slice/geo.js';
import { PRESETS } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
  return r;
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, cracksMax: 99 };
function toPlace(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  assert.equal(s.dusk.step, 'place');
}
function toNextDusk(s) {
  while (s.phase === 'night') step(s);
  assert.equal(s.phase, 'dawn');
  ok(s, { type: 'beginDay' });
  toPlace(s);
}

test('As last night puts the shades back at the posts the last night began with, and lights its candles again', () => {
  const s = newSeason(3, quiet);
  toPlace(s);
  assert.match(act(s, { type: 'asLastNight' }).error, /no last night/);
  const f = geo(s).veil - 1;
  const ds = s.shades.filter(canWork);
  assert.ok(ds.length, 'the keep has shades to post');
  ok(s, { type: 'move', id: ds[0].id, f, x: 40 });
  ok(s, { type: 'candle', f, x: 40 });
  ok(s, { type: 'candle', f, x: 70 });
  ok(s, { type: 'startNight' });
  assert.deepEqual(s.lastDusk.candles, [[f, 40], [f, 70]]);
  toNextDusk(s);
  // Somewhere else tonight, then back.
  ok(s, { type: 'move', id: ds[0].id, f, x: 60 });
  const had = s.res.candles;
  ok(s, { type: 'asLastNight' });
  assert.deepEqual([ds[0].post.f, ds[0].post.x], [f, 40]);
  assert.deepEqual(s.night.candles.map((c) => [c.f, c.x]), [[f, 40], [f, 70]]);
  assert.equal(s.res.candles, had - 2);
  assert.match(s.log.at(-1).text, /^As last night: one shade back at their posts, 2 candles lit/);
  // Again: nothing left to do, and nothing spent.
  assert.match(act(s, { type: 'asLastNight' }).error, /already as they were/);
  assert.equal(s.res.candles, had - 2);
  // It replays, as any action.
  const r = replay(s.seed, s.tuning0, s.actions);
  assert.deepEqual(r.night.candles, s.night.candles);
  assert.deepEqual(r.shades.map((d) => d.post), s.shades.map((d) => d.post));
});

test('As last night lights what the store allows, and says what it could not', () => {
  const s = newSeason(3, quiet);
  toPlace(s);
  const f = geo(s).veil - 1;
  ok(s, { type: 'candle', f, x: 40 });
  ok(s, { type: 'candle', f, x: 70 });
  ok(s, { type: 'startNight' });
  toNextDusk(s);
  s.res.candles = 1;
  ok(s, { type: 'asLastNight' });
  assert.equal(s.res.candles, 0);
  assert.equal(s.night.candles.length, 1);
  assert.match(s.log.at(-1).text, /one more wanted, but the store is out/);
  // Not once the night has begun.
  ok(s, { type: 'startNight' });
  assert.match(act(s, { type: 'asLastNight' }).error, /for dusk/);
});

test('auto-relight lights a candle burnt down at the line again, from the store; not one in an empty room, nor with it off', () => {
  const burn = (autoRelight, where) => {
    const s = newSeason(3, { ...quiet, autoRelight, creepersPerNight: 0, candleWax: 20 });
    toPlace(s);
    const line = lineSpots(geo(s))[0];
    const at = where === 'line' ? { f: line.f, x: line.x } : { f: geo(s).veil, x: 40 };
    for (const d of s.shades.filter(canWork)) ok(s, { type: 'move', id: d.id, f: line.f, x: line.x + 1 });
    ok(s, { type: 'candle', ...at });
    const first = s.night.candles[0].id;
    ok(s, { type: 'startNight' });
    s.night.spawns = []; // nothing comes: this is about the wax
    const had = s.res.candles;
    while (s.phase === 'night' && s.night.candles.some((c) => c.id === first)) step(s);
    assert.equal(s.phase, 'night', 'the candle burnt down before dawn');
    return { at: s.night.candles.filter((c) => c.f === at.f && c.x === at.x).length, spent: had - s.res.candles };
  };
  assert.deepEqual(burn(1, 'line'), { at: 1, spent: 1 });
  assert.deepEqual(burn(1, 'empty'), { at: 0, spent: 0 }, 'a room nobody stands in is left dark');
  assert.deepEqual(burn(0, 'line'), { at: 0, spent: 0 });
  assert.equal(PRESETS.gentle.tuning.autoRelight, 1, 'on in Gentle');
  for (const p of ['standard', 'hard']) assert.equal(PRESETS[p].tuning.autoRelight, undefined, `off in ${p}`);
});
