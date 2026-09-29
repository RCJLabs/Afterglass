// Round seven, phase 8: the new moon and the Long Night as climaxes. A ward on a stair holds only the Hollow on
// its nights; held there, the Hollow can't feed; driving it back is worth more each year; the Long Night ends in
// a last great tide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, canWork, unlitWards, pinned, hollowRewardOf, nightMarks, nightTicks } from '../src/slice/sim.js';
import { geo } from '../src/slice/geo.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, cracksMax: 99, seasonDays: 1 };
function toPlace(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
}

test("on the Hollow's nights a stair's ward holds only the Hollow; on other nights, and switched off, it holds all", () => {
  const wards = (tuning) => {
    const s = newSeason(3, { ...quiet, ...tuning });
    toPlace(s);
    s.res.essence = 50;
    const st = geo(s).stairs[0].id;
    ok(s, { type: 'ward', target: st });
    ok(s, { type: 'ward', target: 'r1' });
    return { st, all: [...s.night.wards], unlit: unlitWards(s) };
  };
  const moon = wards({ hollowWardOnly: 1 });
  assert.deepEqual(moon.unlit, ['r1'], 'the new moon: the stair is warded against the Hollow alone, the rift against all');
  const off = wards({ hollowWardOnly: 0 });
  assert.deepEqual(off.unlit, off.all);
  const plain = wards({ hollowWardOnly: 1, seasonDays: 7 });
  assert.deepEqual(plain.unlit, plain.all, 'an ordinary night: a ward holds everything');
});

test('held at a ward, the Hollow eats no light and drains no one; switched off, it feeds', () => {
  const held = (hollowPinned) => {
    const s = newSeason(3, { ...quiet, hollowPinned });
    toPlace(s);
    s.res.essence = 50;
    const G = geo(s);
    const st = G.stairs.find((x) => x.f === 0);
    const d = s.shades.find(canWork);
    ok(s, { type: 'move', id: d.id, f: 0, x: st.x + 3 });
    ok(s, { type: 'candle', f: 0, x: st.x + 3 });
    for (const x of G.stairs.filter((y) => y.f === 0)) ok(s, { type: 'ward', target: x.id });
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    const h = addFoe(s, 'hollow', 0, st.x - 1);
    Object.assign(h, { hp: 1e9, max: 1e9 });
    for (let i = 0; i < 60 && !(h.batter && !h.path.length); i++) step(s);
    assert.ok(h.batter && !h.path.length, 'it stands battering the ward');
    const wax = s.night.candles[0].wax;
    const mem = d.memory;
    for (let i = 0; i < 20; i++) step(s);
    return { pinned: pinned(s, h), ate: wax - s.night.candles[0]?.wax, drained: mem - d.memory };
  };
  const on = held(1);
  assert.ok(on.pinned);
  assert.ok(on.ate < 3, `it ate no more than a candle burns (${on.ate})`);
  assert.ok(on.drained < 1, `and drained no one (${on.drained})`);
  const off = held(0);
  assert.ok(!off.pinned && off.ate > on.ate + 5 && off.drained > 1, `off, it feeds (${off.ate}, ${off.drained})`);
});

test('driving the Hollow back is worth more each year of the keep', () => {
  const s = newSeason(3, {});
  assert.equal(hollowRewardOf(s), s.tuning.hollowReward);
  s.season = 5; // the second year's spring
  assert.equal(hollowRewardOf(s), s.tuning.hollowReward + s.tuning.hollowRewardYear);
  s.season = 9;
  assert.equal(hollowRewardOf(s), s.tuning.hollowReward + 2 * s.tuning.hollowRewardYear);
});

test('the Long Night ends in a last great tide: held back from its Creepers, marked, and called out when it rises', () => {
  const long = (greatTide) => {
    const s = newSeason(3, { ...quiet, greatTide });
    s.season = 4; // winter: its one night is the Long Night
    toPlace(s);
    return s;
  };
  const s = long(0.4);
  const n = s.night;
  const great = n.spawns.filter((x) => x.great);
  const all = n.spawns.filter((x) => x.type === 'creeper');
  assert.ok(n.great > 0 && great.length === Math.round(all.length * 0.4), `${great.length} of ${all.length} in the great tide`);
  // The last: every other tide comes before it, and it on its own mark.
  const W = (s.tuning.tideSpread * nightTicks(s)) / 2 + 1;
  assert.ok(n.tides.every((at) => at === n.great || at + W < n.great - W), `${n.tides} before ${n.great}`);
  assert.ok(great.every((x) => Math.abs(x.at - n.great) <= W), 'on its mark');
  assert.ok(nightMarks(s).some((m) => m.kind === 'great'), 'on the tide clock');
  ok(s, { type: 'startNight' });
  while (s.phase === 'night' && !s.night.greatRose) step(s);
  assert.ok(s.log.some((l) => l.kind === 'great-tide' && /^The last great tide rises/.test(l.text)));
  const none = long(0);
  assert.equal(none.night.great, undefined);
  assert.ok(!none.night.spawns.some((x) => x.great));
});
