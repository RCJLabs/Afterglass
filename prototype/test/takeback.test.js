// Round seven, phase 3: a candle or a ward set at dusk can be taken back, whole, until the night begins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, wardCost } from '../src/slice/sim.js';
import { geo } from '../src/slice/geo.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const no = (s, a, re) => {
  const r = act(s, a);
  assert.ok(!r.ok, `${a.type} should be refused`);
  if (re) assert.match(r.error, re);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0 };
function toPlace(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  assert.equal(s.dusk.step, 'place');
}

test('a candle set at dusk comes back to the store whole, and the take-back is an action like any other', () => {
  const s = newSeason(3, quiet);
  toPlace(s);
  const had = s.res.candles;
  const f = geo(s).veil;
  ok(s, { type: 'candle', f, x: 30 });
  ok(s, { type: 'candle', f, x: 82 });
  assert.equal(s.res.candles, had - 2);
  const k = s.night.candles[0];
  ok(s, { type: 'uncandle', id: k.id });
  assert.equal(s.res.candles, had - 1, 'the candle is back, whole');
  assert.deepEqual(s.night.candles.map((c) => c.x), [82]);
  assert.equal(s.night.stats.candles, 1);
  assert.equal(s.actions.at(-1).a.type, 'uncandle');
  no(s, { type: 'uncandle', id: k.id }, /No such candle/);
  // The keep replays to the same place from its seed and actions.
  const r = replay(s.seed, s.tuning0, s.actions);
  assert.equal(r.res.candles, s.res.candles);
  assert.deepEqual(r.night.candles, s.night.candles);
});

test('a ward set at dusk gives back what it cost; once the night begins, neither comes back', () => {
  const s = newSeason(3, quiet);
  toPlace(s);
  s.res.essence = 30;
  const st = geo(s).stairs[0].id;
  const cost = wardCost(s);
  ok(s, { type: 'ward', target: st });
  assert.equal(s.res.essence, 30 - cost);
  ok(s, { type: 'unward', target: st });
  assert.equal(s.res.essence, 30);
  assert.deepEqual(s.night.wards, []);
  assert.equal(s.night.wardHold[st], undefined);
  no(s, { type: 'unward', target: st }, /Nothing is warded/);
  ok(s, { type: 'ward', target: st });
  ok(s, { type: 'candle', f: geo(s).veil, x: 30 });
  const k = s.night.candles[0];
  ok(s, { type: 'startNight' });
  no(s, { type: 'uncandle', id: k.id }, /only at dusk/);
  no(s, { type: 'unward', target: st }, /only at dusk/);
});

test('a lantern is set down before its candle can be taken back', () => {
  const s = newSeason(3, { ...quiet, lanterns: 1 });
  toPlace(s);
  const d = s.shades.find((x) => x.kind !== 'restless' && x.kind !== 'wraith');
  const had = s.res.candles;
  ok(s, { type: 'lantern', id: d.id });
  const k = s.night.candles.find((c) => c.carrier === d.id);
  no(s, { type: 'uncandle', id: k.id }, /lantern/);
  ok(s, { type: 'lantern', id: d.id });
  ok(s, { type: 'uncandle', id: k.id });
  assert.equal(s.res.candles, had);
});
