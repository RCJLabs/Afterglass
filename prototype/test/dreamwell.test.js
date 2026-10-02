import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, beds, crowded, livingMult, addFoe, weeperSpots } from '../src/slice/sim.js';
import { geo, roomsOf, lightMap } from '../src/slice/geo.js';
import { SHADE_TRAITS, TUNING } from '../src/slice/data.js';

// The original four-floor keep (no Quarters, so the Cold Hearth is the sleepers' twin), nothing by day; with
// the Weepers and the Dreamwell's dreaming as round five made them (round seven, phase 11 cut both:
// test/texture.test.js).
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, weepersMax: 3, dreamRest: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const secs = (s, n) => {
  for (let i = 0; i < n * 10 && s.phase === 'night'; i++) step(s);
};
// Dusk of day 1 after a death that day, the dead woken, everyone posted on the Veil floor's left side.
function afterDeath(seed, over = {}) {
  const s = newSeason(seed, { ...quiet, ...over });
  for (let i = 0; i < 50; i++) step(s);
  ok(s, { type: 'debug', what: 'kill', id: s.living[0].id, cause: 'oldage' });
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  return s;
}
const hearth = (s) => roomsOf(geo(s), 'hearth')[0];

// Days 2 to 7 of a season: did each one's dice call for a sickness?
function sickDays(s) {
  const out = [];
  for (let day = 1; day < s.tuning.seasonDays; day++) {
    while (s.phase === 'day') step(s);
    if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    while (s.phase === 'night') step(s);
    ok(s, { type: 'beginDay' });
    out.push(s.events.some((e) => e.type === 'sick'));
  }
  return out;
}

test('beds: the keep sleeps eight and each Quarters four more; the crowded make sickness likelier', () => {
  const s = newSeason(3, quiet);
  assert.equal(beds(s), 8);
  while (s.living.length <= 8) s.living.push({ ...s.living[0], id: `x${s.living.length}` });
  assert.ok(crowded(s));
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'quarters' });
  assert.equal(beds(s), 12);
  assert.ok(!crowded(s));
  const off = newSeason(3, { ...quiet, dreamwell: 0 });
  while (off.living.length <= 8) off.living.push({ ...off.living[0], id: `x${off.living.length}` });
  assert.ok(!crowded(off), 'with the switch off, nobody is crowded');
  // At sickChance 0.7 a crowded keep (x1.5) is sick every day; one with room enough is not.
  const crowd = (q) => {
    while (q.living.length <= 12) q.living.push({ ...q.living[1], id: `x${q.living.length}`, bond: null, sick: 0 });
    return q;
  };
  assert.ok(sickDays(crowd(newSeason(11, { ...quiet, sickChance: 0.7, startFood: 999 }))).every(Boolean));
  const roomy = crowd(newSeason(11, { ...quiet, sickChance: 0.7, startFood: 999, baseBeds: 99 }));
  assert.ok(!sickDays(roomy).every(Boolean));
});

test('the night after a death, a Weeper for each of the dead; none after a day without one', () => {
  const s = afterDeath(4);
  assert.equal(s.night.spawns.filter((x) => x.type === 'weeper').length, 1);
  const calm = newSeason(4, quiet);
  while (calm.phase === 'day') step(calm);
  assert.equal(calm.night.spawns.filter((x) => x.type === 'weeper').length, 0);
});

test('a Weeper seeps into the dark of the Cold Hearth, weeps its fill, gives a nightmare and sinks away', () => {
  const s = afterDeath(5);
  s.shades.forEach((d) => ok(s, { type: 'move', id: d.id, f: 0, x: 40 }));
  ok(s, { type: 'startNight' });
  s.night.spawns = s.night.spawns.filter((x) => x.type === 'weeper').map((x) => ({ ...x, at: s.t + 1 }));
  step(s);
  const w = s.night.foes.find((f) => f.type === 'weeper');
  const H = hearth(s);
  assert.equal(w.f, H.f, 'it rose in the sleepers\' twin');
  assert.ok(w.x >= H.x0 && w.x <= H.x1);
  secs(s, s.tuning.nightmareSecs + 1);
  assert.equal(s.night.nightmares, 1);
  assert.ok(!s.night.foes.includes(w), 'it sank away');
  while (s.phase === 'night') step(s);
  const bad = s.living.filter((p) => p.nightmare);
  assert.equal(bad.length, 1);
  const p = bad[0];
  const m = livingMult(s, p);
  delete p.nightmare;
  assert.ok(Math.abs(m / livingMult(s, p) - s.tuning.nightmareMult) < 1e-9, 'they work at nightmareMult');
  p.nightmare = true;
  ok(s, { type: 'beginDay' });
  while (s.phase === 'day') step(s);
  assert.ok(!s.living.some((x) => x.nightmare), 'a nightmare lasts the day');
});

test('lit wall to wall, the room has no dark for them; a Keening shade on the floor sings them quiet', () => {
  const s = afterDeath(6);
  const H = hearth(s);
  s.res.candles = 20;
  ok(s, { type: 'candle', f: H.f, x: H.x0 + 10 });
  ok(s, { type: 'candle', f: H.f, x: H.x1 - 10 });
  assert.deepEqual(weeperSpots(s, lightMap(geo(s), s.tuning, s.night.candles)), []);
  // Unlit, with a Keening shade on the Veil floor: the Weeper rises there but never weeps.
  const q = afterDeath(7);
  const d = q.shades[0];
  d.trait = 'keening';
  assert.ok(SHADE_TRAITS.keening.hushes);
  ok(q, { type: 'move', id: d.id, f: hearth(q).f, x: hearth(q).x1 + 30 });
  q.shades.slice(1).forEach((x) => ok(q, { type: 'move', id: x.id, f: 0, x: 40 }));
  ok(q, { type: 'startNight' });
  q.night.spawns = q.night.spawns.filter((x) => x.type === 'weeper').map((x) => ({ ...x, at: q.t + 1 }));
  secs(q, s.tuning.nightmareSecs + 3);
  assert.ok(!q.night.nightmares, 'no nightmare while the Keening shade sings');
  assert.ok(q.night.foes.some((f) => f.type === 'weeper' && f.quiet));
});

test('a shade in the light cuts a Weeper down', () => {
  const s = afterDeath(8);
  const H = hearth(s);
  s.res.candles = 20;
  ok(s, { type: 'candle', f: H.f, x: H.x0 + 24 });
  ok(s, { type: 'move', id: s.shades[0].id, f: H.f, x: H.x0 + 24 });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const w = addFoe(s, 'weeper', H.f, H.x0 + 2);
  secs(s, 10);
  assert.ok(!s.night.foes.includes(w), 'cut down');
  assert.equal(w.lastHit, s.shades[0].id, 'by the shade, not the light');
  assert.ok(!s.night.nightmares);
});

// A night with one shade dreaming in a lit Dreamwell, the rest by the mirrors: what the living work at after.
function dreamNight(seed, trait) {
  const s = newSeason(seed, quiet);
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'quarters' });
  const Q = roomsOf(geo(s), 'quarters')[0];
  for (const d of s.shades) d.trait = null;
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  s.res.candles = 20;
  const d = s.shades[0];
  d.trait = trait;
  ok(s, { type: 'candle', f: Q.f, x: (Q.x0 + Q.x1) / 2 });
  ok(s, { type: 'move', id: d.id, f: Q.f, x: (Q.x0 + Q.x1) / 2 });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  return s.dreamt;
}

test('a shade who dreams in the Dreamwell through half the night rests the living; with the switch off, no Weepers', () => {
  assert.equal(dreamNight(9, null), TUNING.dreamWork);
  assert.equal(dreamNight(9, 'wistful'), SHADE_TRAITS.wistful.dreams);
  assert.ok(SHADE_TRAITS.wistful.dreams > TUNING.dreamWork);
  const off = afterDeath(4, { dreamwell: 0 });
  assert.equal(off.night.spawns.filter((x) => x.type === 'weeper').length, 0);
  const old = JSON.parse(JSON.stringify(newSeason(10, quiet)));
  delete old.tuning.dreamwell;
  delete old.tuning0.dreamwell;
  assert.equal(upgrade(old).tuning0.dreamwell, 0);
});
