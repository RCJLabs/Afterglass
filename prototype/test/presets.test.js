import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, retune, upgrade, hard, keepDefaults } from '../src/slice/sim.js';
import { PRESETS, TUNING } from '../src/slice/data.js';

test('each preset sets only numbers the keep has', () => {
  assert.deepEqual(Object.keys(PRESETS), ['gentle', 'standard', 'hard']);
  for (const [k, P] of Object.entries(PRESETS)) {
    assert.ok(P.name && P.text, k);
    for (const [key, v] of Object.entries(P.tuning)) assert.ok(typeof TUNING[key] === 'number' && typeof v === 'number', `${k}.${key}`);
  }
  assert.deepEqual(PRESETS.standard.tuning, {});
});

test('a keep keeps the numbers it was made with when a newer build loads it; the rest follow the build', () => {
  const k = newSeason(1, PRESETS.hard.tuning);
  k.defaults = PRESETS.hard.tuning;
  k.preset = 'hard';
  assert.equal(retune(k, keepDefaults(k)), 0);
  assert.equal(k.tuning.startCandles, 6);
  // A newer build with another number of its own: that one moves, the preset's stay.
  assert.equal(retune(k, { ...keepDefaults(k), daySecs: TUNING.daySecs + 10 }), 1);
  assert.deepEqual([k.tuning.daySecs, k.tuning.startCandles, k.tuning.creepersPerNight], [TUNING.daySecs + 10, 6, PRESETS.hard.tuning.creepersPerNight]);
  // The same for the player's own numbers carried into a new keep.
  const m = newSeason(2, { nightSecs: 180 });
  m.defaults = { nightSecs: 180 };
  assert.equal(retune(m, keepDefaults(m)), 0);
  assert.equal(m.tuning.nightSecs, 180);
  // A keep from before (no defaults of its own) follows the build as it did.
  const o = newSeason(3, { nightSecs: 180 });
  assert.equal(retune(o, keepDefaults(o)), 1);
  assert.equal(o.tuning.nightSecs, TUNING.nightSecs);
});

test('hardness compounds through a year, and each year starts yearHardness above the last', () => {
  const at = (s) => Array.from({ length: 8 }, (_, i) => {
    s.season = i + 1;
    return Math.round(hard(s) * 1000) / 1000;
  });
  assert.deepEqual(at(newSeason(1)), [1, 1.2, 1.44, 1.728, 1.06, 1.272, 1.526, 1.832]);
  assert.deepEqual(at(newSeason(1, { yearHardness: 0 })), [1, 1.2, 1.44, 1.728, 2.074, 2.488, 2.986, 3.583]);
  assert.deepEqual(at(newSeason(1, { year: 0 })), [1, 1.2, 1.44, 1.728, 2.074, 2.488, 2.986, 3.583]);
  const m = newSeason(1);
  m.season = 7;
  assert.equal(hard(m, 'mawHardness'), 1, 'Maws stay as they were');
  const old = JSON.parse(JSON.stringify(newSeason(4)));
  delete old.tuning.yearHardness;
  delete old.tuning0.yearHardness;
  assert.equal(upgrade(old).tuning.yearHardness, 0);
});

test('a Gentle or Hard keep from when years hardened faster grows as Standard does now', () => {
  for (const [p, old] of [['gentle', 1.15], ['hard', 1.2]]) {
    assert.equal(PRESETS[p].tuning.yearHardness, undefined, `${p} sets no yearly rate of its own`);
    const k = newSeason(7, { ...PRESETS[p].tuning, yearHardness: old });
    k.preset = p;
    k.defaults = { ...PRESETS[p].tuning, yearHardness: old };
    const g = upgrade(JSON.parse(JSON.stringify(k)));
    assert.equal('yearHardness' in g.defaults, false, p);
    assert.equal(retune(g, keepDefaults(g)), 1, 'the one number moves');
    assert.equal(g.tuning.yearHardness, TUNING.yearHardness);
    assert.equal(g.tuning.hardness, PRESETS[p].tuning.hardness, "the preset's other numbers stay");
  }
  // One set some other way keeps it.
  const k = newSeason(7, { yearHardness: 1.25 });
  k.preset = 'hard';
  k.defaults = { ...PRESETS.hard.tuning, yearHardness: 1.25 };
  assert.equal(upgrade(JSON.parse(JSON.stringify(k))).defaults.yearHardness, 1.25);
});
