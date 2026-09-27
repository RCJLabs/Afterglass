import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, addFoe, canWork, nightMarks, nextMark, SKIP_LEAD, nightTicks } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { geo, lightMap, roomSpan, roomAt, GNAW_GAP } from '../src/slice/geo.js';
import { howTo } from '../src/slice/howto.js';
import { TUNING, MAP } from '../src/slice/data.js';

// The original four-floor keep, nothing by day to get in the way, no traits, no inspector, no errands, and
// Veil cracks that never lose it: nights here are played with nobody on the line.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0, firstInspection: 99, traits: 0, errands: 0, cracksMax: 999 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Dusk of the given day, with nothing coming on the nights before (a state edit, so these keeps don't
// replay; omens are rolled at dusk from their own stream, so it changes none of them).
function toDusk(s, day) {
  for (;;) {
    while (s.phase === 'day') step(s);
    if (s.phase === 'dusk' && s.dusk.step === 'crypt') ok(s, { type: 'wake' });
    if (s.day === day) return s;
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    while (s.phase === 'night') step(s);
    ok(s, { type: 'beginDay' });
  }
}
// Dusk of day 3 with one omen for certain.
const withOmen = (id, seed = 3, more = {}) => toDusk(newSeason(seed, { ...quiet, omenChance: 1, omenOnly: id, ...more }), 3);
const creepers = (n) => n.spawns.filter((sp) => sp.type === 'creeper');
const steps = (s, k) => {
  for (let i = 0; i < k; i++) step(s);
};

test('omens come from their own stream: a keep with them meets the same Unlit, rifts and hours as one without', () => {
  const off = toDusk(newSeason(5, { ...quiet, omens: 0 }), 3);
  const on = withOmen('still', 5); // still air changes no spawn
  assert.equal(on.night.omen.id, 'still');
  assert.deepEqual(on.night.spawns, off.night.spawns);
  assert.deepEqual(on.night.tides, off.night.tides);
  assert.equal(on.rng, off.rng);
});

test('a sealed rift sends everything up the other; a thin Veil seeps the first tide and doubles the Choir', () => {
  const off = toDusk(newSeason(3, { ...quiet, omens: 0 }), 3);
  const sealed = withOmen('sealed');
  const o = sealed.night.omen;
  assert.ok(MAP.rifts.some((r) => r.id === o.rift));
  assert.ok(sealed.night.spawns.filter((sp) => sp.type === 'creeper' || sp.type === 'maw').every((sp) => sp.rift === o.rift));
  assert.equal(creepers(sealed.night).length, creepers(off.night).length);
  const thin = withOmen('thin');
  const w = (TUNING.tideSpread * nightTicks(thin)) / 2 + 1;
  const first = creepers(thin.night).filter((sp) => Math.abs(sp.at - thin.night.tides[0]) <= w);
  assert.ok(first.length > 0 && first.every((sp) => sp.seep));
  // The Choir: a shade singing under a candle, before any tide, sings twice as much.
  const sing = (s) => {
    const d = s.shades.find(canWork);
    const { f, x0, x1 } = roomSpan(geo(s), 'chapel');
    const x = Math.round((x0 + x1) / 2);
    ok(s, { type: 'candle', f, x });
    ok(s, { type: 'move', id: d.id, f, x });
    ok(s, { type: 'startNight' });
    steps(s, 60);
    return s.night.stats.essence;
  };
  const plain = sing(withOmen('still'));
  const loud = sing(withOmen('thin'));
  assert.ok(plain > 0);
  assert.ok(Math.abs(loud / plain - TUNING.thinChoir) < 1e-6, `${loud} against ${plain}`);
});

test('the Hunt brings one more Maw and pays for each cut down; a blood moon brings half again as many Creepers and pays for each', () => {
  const off = toDusk(newSeason(3, { ...quiet, omens: 0 }), 3);
  const hunt = withOmen('hunt');
  const maws = (n) => n.spawns.filter((sp) => sp.type === 'maw').length;
  assert.equal(maws(hunt.night), maws(off.night) + 1);
  ok(hunt, { type: 'startNight' });
  hunt.night.spawns = [];
  const m = addFoe(hunt, 'maw', 1, 30);
  const ess = hunt.res.essence;
  m.hp = 0;
  step(hunt);
  assert.equal(hunt.res.essence, ess + TUNING.huntEssence);
  assert.ok(hunt.log.some((l) => /the Hunt pays/.test(l.text)));
  const blood = withOmen('blood');
  assert.equal(creepers(blood.night).length, creepers(off.night).length + Math.round(TUNING.bloodMore * creepers(off.night).length));
  ok(blood, { type: 'startNight' });
  blood.night.spawns = [];
  const c = addFoe(blood, 'creeper', 1, 30);
  const e2 = blood.res.essence;
  c.hp = 0;
  step(blood);
  assert.equal(blood.res.essence, e2 + TUNING.bloodEssence);
  assert.equal(blood.night.stats.omenEssence, TUNING.bloodEssence);
});

test('still air burns candles at half the rate and the Unlit gnaw them twice as hard; a restless Deep splits the tides', () => {
  const burn = (s) => {
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    const d = s.shades.find(canWork);
    ok(s, { type: 'candle', f: d.f, x: d.x });
    const k = s.night.candles.at(-1);
    const wax = k.wax;
    steps(s, 100);
    return wax - k.wax;
  };
  const plain = burn(withOmen('thin'));
  const still = burn(withOmen('still'));
  assert.ok(Math.abs(still / plain - TUNING.stillBurn) < 1e-9, `${still} against ${plain}`);
  // A Creeper at the edge of a candle's light, gnawing: what it takes over three seconds, less the burning.
  const gnawed = (id) => {
    const s = withOmen(id);
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    const d = s.shades.find(canWork);
    ok(s, { type: 'candle', f: d.f, x: d.x });
    const k = s.night.candles.at(-1);
    const span = lightMap(geo(s), s.tuning, s.night.candles).spans[d.f].find(([, , kid]) => kid === k.id);
    const { x0 } = roomSpan(geo(s), roomAt(geo(s), d.f, d.x));
    const c = addFoe(s, 'creeper', d.f, Math.max(x0 + 1, span[0] - GNAW_GAP), { temper: 'snuff' });
    Object.assign(c, { hp: 999, max: 999 });
    steps(s, 40);
    const wax = k.wax;
    steps(s, 30);
    return wax - k.wax - 30 * 0.1 * (id === 'still' ? TUNING.stillBurn : 1);
  };
  const g0 = gnawed('thin');
  const g1 = gnawed('still');
  assert.ok(g0 > 1 && Math.abs(g1 / g0 - TUNING.stillGnaw) < 0.05, `${g1} against ${g0}`);
  const off = toDusk(newSeason(3, { ...quiet, omens: 0 }), 3);
  const restless = withOmen('restless');
  assert.equal(restless.night.tides.length, 2 * off.night.tides.length);
  assert.equal(creepers(restless.night).length, creepers(off.night).length);
  const moved = creepers(restless.night).filter((sp, i) => sp.at !== creepers(off.night)[i]?.at).length;
  assert.ok(moved > 0);
});

test('two omens to choose between: the choice can change until the night begins, and unchosen the first comes', () => {
  const s = toDusk(newSeason(3, { ...quiet, omenChance: 1, omenChoice: 1 }), 3);
  const [a, b] = s.night.omens;
  assert.ok(a && b && a.id !== b.id);
  assert.equal(s.night.omen, undefined);
  ok(s, { type: 'omen', i: 1 });
  assert.equal(s.night.omen.id, b.id);
  ok(s, { type: 'omen', i: 0 });
  assert.equal(s.night.omen.id, a.id);
  // Changing back undoes the other: the same night as choosing the first straight away.
  const t = toDusk(newSeason(3, { ...quiet, omenChance: 1, omenChoice: 1 }), 3);
  ok(t, { type: 'omen', i: 0 });
  assert.deepEqual(s.night.spawns, t.night.spawns);
  assert.deepEqual(s.night.tides, t.night.tides);
  // Unchosen.
  const u = toDusk(newSeason(3, { ...quiet, omenChance: 1, omenChoice: 1 }), 3);
  ok(u, { type: 'startNight' });
  assert.equal(u.night.omen.id, a.id);
  assert.deepEqual(u.night.spawns.map((sp) => sp.at), t.night.spawns.map((sp) => sp.at));
  assert.equal(u.night.base, undefined);
  assert.ok(u.log.some((l) => l.text.startsWith(`The omen: `)));
  assert.match(act(u, { type: 'omen', i: 1 }).error, /no omens to choose/);
});

test('the tide clock marks each tide, Maw and dawn; Skip runs to just before the next', () => {
  const s = toDusk(newSeason(3, { ...quiet, omens: 0 }), 3);
  ok(s, { type: 'startNight' });
  const N = nightTicks(s);
  const marks = s.night.marks;
  assert.deepEqual(marks, nightMarks({ ...s, night: { ...s.night } }));
  assert.equal(marks.at(-1).kind, 'dawn');
  assert.equal(marks.at(-1).at, N);
  assert.ok(marks.every((m, i) => i === 0 || marks[i - 1].at <= m.at));
  const tides = marks.filter((m) => m.kind === 'tide');
  assert.equal(tides.length, s.night.tides.length);
  const w = (TUNING.tideSpread * N) / 2 + 1;
  assert.equal(tides.reduce((a, m) => a + m.count, 0), creepers(s.night).filter((sp) => s.night.tides.some((at) => Math.abs(at - sp.at) <= w)).length);
  assert.equal(marks.filter((m) => m.kind === 'maw').length, s.night.spawns.filter((sp) => sp.type === 'maw').length);
  // The next mark is the first more than SKIP_LEAD ahead.
  const m = nextMark(s);
  assert.equal(m, marks.find((x) => x.at - SKIP_LEAD > s.t));
  while (s.t < m.at - SKIP_LEAD) step(s);
  assert.notEqual(nextMark(s), m, 'at the lead, the next one is the one after');
});

test('omens replay exactly, the autopilot takes the cheaper of two, old saves have none, and How to play covers them', () => {
  const s = newSeason(1, { omenChoice: 1 });
  while (!s.days.some((d) => d.night?.omen) && s.phase !== 'over' && s.phase !== 'end') autoStep(s, 'balanced');
  assert.ok(s.days.some((d) => d.night?.omen), 'an omen by the season\'s end');
  assert.ok(s.actions.some((a) => a.a.type === 'omen'));
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.day, r.log.length, r.res.essence], [s.day, s.log.length, s.res.essence]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { ...quiet, omens: 0 })));
  for (const t of [old.tuning, old.tuning0]) delete t.omens;
  const g = upgrade(old);
  assert.equal(g.tuning.omens, 0);
  toDusk(g, 3);
  assert.equal(g.night.omen, undefined);
  assert.equal(g.night.omens, undefined);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /have an omen, shown at dusk/);
  assert.match(all(TUNING), /The Hunt: one more Maw/);
  assert.ok(!/have an omen/.test(all({ ...TUNING, omens: 0 })));
});
