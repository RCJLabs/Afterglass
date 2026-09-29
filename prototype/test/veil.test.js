// Round seven, phase 9: the Veil as a gauge, and a way back from the spiral. A mirror cracks once for each tide
// that reaches it, the rest of that tide spilling into the next day's nightmares; the Veil strains when a stair
// of the line will be dark as a tide comes up it; from autumn, what winter will take in candles; and a wisp,
// essence burned as a pale light, once the store is out of candles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, winterNeed, nightTicks } from '../src/slice/sim.js';
import { geo, lineSpots } from '../src/slice/geo.js';
import { TUNING } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, cracksMax: 99, seasonDays: 1 };
function toNight(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  for (const d of s.shades) Object.assign(d, { f: 0, x: 104, ox: 104, of: 0, post: { f: 0, x: 104 }, path: [], climb: 0 }); // out of the way
}
// Creepers on the Veil floor walking into the mirror at x 30 in the dark, with the tides given.
function through(tuning, tides) {
  const s = newSeason(3, { ...quiet, ...tuning });
  toNight(s);
  s.night.candles = [];
  const G = geo(s);
  tides.forEach((tide, i) => (addFoe(s, 'creeper', G.veil, 24 - i).tide = tide));
  for (let i = 0; i < 200 && s.night.foes.length; i++) step(s);
  assert.equal(s.night.foes.length, 0, 'they all got through');
  return s;
}

test('a mirror cracks once a tide: the rest of that tide spill into nightmares at dawn, curfew or not', () => {
  const s = through({ crackPerTide: 1 }, [0, 0, 0]);
  assert.equal(s.cracks, 1);
  assert.equal(s.night.stats.crossed, 3);
  assert.equal(s.night.stats.spill, 2);
  assert.ok(s.log.some((l) => /More of the tide pours through the mirror/.test(l.text)));
  while (s.phase === 'night') step(s);
  assert.equal(s.living.filter((p) => p.nightmare).length, Math.min(2, s.living.length));
  assert.ok(s.log.some((l) => /^Nightmares: 2, .*from the Unlit that came through the Veil/.test(l.text)));
});

test('a tide and a straggler crack apart; switched off, every Creeper through is a crack, as before', () => {
  assert.equal(through({ crackPerTide: 1 }, [0, null]).cracks, 2, 'a straggler is a tide of its own');
  assert.equal(through({ crackPerTide: 1 }, [0, 1]).cracks, 2, 'two tides');
  const old = through({ crackPerTide: 0 }, [0, 0, 0]);
  assert.equal(old.cracks, 3);
  assert.equal(old.night.stats.spill, undefined);
});

test("the Veil mends crackHeal cracks a dawn: none in today's rules, one before", () => {
  const dawn = (crackHeal) => {
    const s = through({ crackPerTide: 1, crackHeal }, [0, 1]);
    while (s.phase === 'night') step(s);
    return s.cracks;
  };
  assert.equal(dawn(0), 2);
  assert.equal(dawn(1), 1);
  assert.equal(TUNING.crackHeal, 0);
});

test('a wisp: essence burned as light where a candle would go, only once the store is out of candles', () => {
  const s = newSeason(3, quiet);
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const at = { f: 0, x: 40 };
  s.res.candles = 0;
  s.res.essence = 20;
  assert.match(act(s, { type: 'wisp', ...at }).error, /in the night/);
  ok(s, { type: 'startNight' });
  s.res.candles = 3;
  assert.match(act(s, { type: 'wisp', ...at }).error, /out of candles/);
  s.res.candles = 0;
  ok(s, { type: 'wisp', ...at });
  const w = s.night.candles.at(-1);
  assert.ok(w.wisp && w.wax === s.tuning.wispSecs && w.f === 0 && w.x === 40);
  assert.equal(s.res.essence, 20 - s.tuning.wispCost);
  assert.equal(s.night.stats.wisps, 1);
  s.res.essence = s.tuning.wispCost - 1;
  assert.match(act(s, { type: 'wisp', ...at }).error, /essence/);
  const off = newSeason(3, { ...quiet, wisp: 0 });
  toNight(off);
  off.res.candles = 0;
  off.res.essence = 20;
  assert.match(act(off, { type: 'wisp', ...at }).error, /no wisps/);
});

test('the Veil strains once a stair and a tide, when the stair will be dark as the tide comes up it', () => {
  const s = newSeason(3, quiet);
  toNight(s);
  const n = s.night;
  const G = geo(s);
  const [a, b] = lineSpots(G);
  n.candles = [{ id: 'k1', f: a.f, x: a.x, wax: 5, max: 120 }, { id: 'k2', f: b.f, x: b.x, wax: 120, max: 120 }];
  n.tides = [s.t + 10 * 10];
  for (let i = 0; i < 30; i++) step(s);
  const strains = s.alerts.filter((x) => x.kind === 'strain');
  assert.equal(strains.length, 1, 'the stair whose candle burns out first, once');
  assert.match(strains[0].text, /^The Veil strains: the candle at the (left|right) stair will be out before the tide/);
  const off = newSeason(3, { ...quiet, veilStrains: 0 });
  toNight(off);
  off.night.candles = [];
  off.night.tides = [off.t + 100];
  for (let i = 0; i < 30; i++) step(off);
  assert.ok(!off.alerts.some((x) => x.kind === 'strain'));
});

test("from autumn, winter's candles: what its nights will burn beyond what the keep makes, by the last week", () => {
  const s = newSeason(3, { startFloors: 4 });
  assert.equal(winterNeed(s), null, 'not in spring');
  s.season = 3; // the first year's autumn
  s.days = [1, 2, 3].map((day) => ({ season: 3, day, made: { candles: 2 }, night: { candles: 4, wick: 0 } }));
  s.res.candles = 9;
  const T = s.tuning;
  const nights = T.seasonDays - 1 + T.longNight;
  const burn = 4 * (T.seasonNight[3] / T.seasonNight[2]) * nights;
  const make = 2 * (T.seasonDay[3] / T.seasonDay[2]) * T.seasonDays;
  assert.deepEqual(winterNeed(s), { need: Math.round(burn - make), burn: Math.round(burn), make: Math.round(make), have: 9 });
  // A summer day in the week counts by summer's lengths, not autumn's.
  s.days = [{ season: 2, day: 7, made: { candles: 2 }, night: { candles: 4, wick: 1 } }, ...s.days.slice(1)];
  const nF = (k) => T.seasonNight[3] / T.seasonNight[k];
  const dF = (k) => T.seasonDay[3] / T.seasonDay[k];
  const burn2 = ((4 * nF(1) + 8 * nF(2)) / 3) * nights;
  const make2 = ((2 * dF(1) + 4 * dF(2)) / 3) * T.seasonDays + (nF(1) / 3) * nights;
  assert.deepEqual(winterNeed(s), { need: Math.round(burn2 - make2), burn: Math.round(burn2), make: Math.round(make2), have: 9 });
  s.days = s.days.slice(0, 2);
  assert.equal(winterNeed(s), null, 'three days to go by first');
  assert.equal(winterNeed({ ...s, tuning: { ...T, year: 0 } }), null, 'nor with the year off');
});

test('with the gauge, a keep that loses tides night after night still breaks the Veil', () => {
  const s = newSeason(4, { ...quiet, cracksMax: 3, crackPerTide: 1, crackHeal: 0 });
  toNight(s);
  const G = geo(s);
  s.night.candles = [];
  for (const [i, tide] of [0, 1, 2].entries()) addFoe(s, 'creeper', G.veil, 24 - i).tide = tide;
  for (let i = 0; i < 200 && s.phase === 'night'; i++) step(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.over.reason, 'veil');
  assert.ok(nightTicks(s) > 0);
});
