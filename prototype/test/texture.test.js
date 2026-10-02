// Round seven, phase 11: what measured as texture, cut or merged. No Weepers, so the hedge-witch's curse is her
// charm turned round; the Dreamwell a second place to rest; no curfew in the Hall; and the dawn no longer
// calls out a haunted or ruined room, which the night called out and the Day panel says all day. Each rule has
// its old value for old keeps (test/dreamwell.test.js and test/visitors.test.js play the old ones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act } from '../src/slice/sim.js';
import { geo, roomsOf } from '../src/slice/geo.js';
import { TUNING, SHADE_TRAITS, DECREES, decreesOf, decreeDoes, shadeTraitShort, twinJob } from '../src/slice/data.js';
import { howTo } from '../src/slice/howto.js';

const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, weather: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const toDusk = (s) => {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
};
// Dusk of day 1 after a death that day.
function afterDeath(seed, over = {}) {
  const s = newSeason(seed, { ...quiet, ...over });
  for (let i = 0; i < 50; i++) step(s);
  ok(s, { type: 'debug', what: 'kill', id: s.living[0].id, cause: 'oldage' });
  toDusk(s);
  return s;
}

test('no Weepers the night after a death; as before, one for each of the dead', () => {
  assert.equal(afterDeath(4).night.spawns.filter((x) => x.type === 'weeper').length, 0);
  assert.equal(afterDeath(4, { weepersMax: 3 }).night.spawns.filter((x) => x.type === 'weeper').length, 1);
  // The Keening shade calms the Restless, and quiets Weepers only where they come.
  assert.equal(shadeTraitShort(TUNING, 'keening'), 'calms two Restless shades a night');
  assert.equal(shadeTraitShort({ ...TUNING, weepersMax: 3 }, 'keening'), SHADE_TRAITS.keening.short);
});

// A night with one shade posted, lit, in the middle of the Dreamwell: how much it faded, and the dreams it sent.
function dreamwellNight(seed, trait, over = {}) {
  const s = newSeason(seed, { ...quiet, ...over });
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'quarters' });
  const Q = roomsOf(geo(s), 'quarters')[0];
  for (const d of s.shades) d.trait = null;
  toDusk(s);
  s.res.candles = 20;
  const d = s.shades[0];
  d.trait = trait;
  ok(s, { type: 'candle', f: Q.f, x: (Q.x0 + Q.x1) / 2 });
  ok(s, { type: 'move', id: d.id, f: Q.f, x: (Q.x0 + Q.x1) / 2 });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const memory = d.memory;
  while (s.phase === 'night') step(s);
  return { fade: memory - d.memory, dreamt: s.dreamt, rested: d.rest };
}

test('the Dreamwell is a place to rest, as the Cold Hearth is: fading halved, and good dreams only from the Wistful', () => {
  assert.equal(twinJob(TUNING, 'quarters'), 'rest');
  assert.equal(twinJob(TUNING, 'hearth'), 'rest');
  assert.equal(twinJob({ ...TUNING, dreamRest: 0 }, 'quarters'), 'dreams');
  const plain = dreamwellNight(9, null);
  assert.ok(plain.rested > 0);
  assert.equal(plain.fade, TUNING.fadePerNight / 2, 'resting halves the fading');
  assert.equal(plain.dreamt, 0, 'and sends no dreams');
  assert.equal(dreamwellNight(9, 'wistful').dreamt, SHADE_TRAITS.wistful.dreams);
  // As before: it dreams, and the living work dreamWork better, but it fades in full.
  const old = dreamwellNight(9, null, { dreamRest: 0 });
  assert.equal(old.dreamt, TUNING.dreamWork);
  assert.equal(old.fade, TUNING.fadePerNight);
  assert.match(shadeTraitShort(TUNING, 'wistful'), /^resting the night through/);
});

test('the Hall offers no curfew; as before, it does', () => {
  assert.deepEqual(decreesOf(TUNING), ['rationing', 'levy']);
  assert.deepEqual(decreesOf({ ...TUNING, curfew: 1 }), Object.keys(DECREES));
  const s = newSeason(2, { ...quiet, lateRoomsFrom: 1 });
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'hall' });
  assert.match(act(s, { type: 'decree', id: 'curfew' }).error, /No such decree/);
  ok(s, { type: 'decree', id: 'levy' });
  const o = newSeason(2, { ...quiet, lateRoomsFrom: 1, curfew: 1 });
  o.res.stone = 99;
  ok(o, { type: 'raise', room: 'hall' });
  ok(o, { type: 'decree', id: 'curfew' });
  // What it says it does: the Weepers only where they come.
  assert.equal(decreeDoes({ ...TUNING, curfew: 1 }, DECREES.curfew), 'the living are barred in from dusk: nobody sleepwalks');
  assert.equal(decreeDoes({ ...TUNING, weepersMax: 3 }, DECREES.curfew), 'the living are barred in from dusk: nobody sleepwalks, and the Weepers give no nightmares');
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.ok(!/curfew/i.test(all(TUNING)));
  assert.match(all({ ...TUNING, curfew: 1 }), /A curfew/);
  assert.ok(!/Weeper/.test(all(TUNING)));
  assert.match(all({ ...TUNING, weepersMax: 3 }), /Weepers/);
});

test('a haunted room is in the log at dawn, not called out: the night called it out, and the Day panel says it', () => {
  const s = newSeason(3, quiet);
  toDusk(s);
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const hearth = roomsOf(geo(s), 'hearth')[0].id;
  s.night.broken.push(hearth);
  while (s.phase === 'night') step(s);
  s.alerts = [];
  ok(s, { type: 'beginDay' });
  assert.deepEqual(s.haunted, [hearth]);
  assert.ok(s.log.some((l) => /Hearth is haunted today/.test(l.text)), 'in the log');
  assert.ok(!s.alerts.some((a) => /haunted/.test(a.text)), 'not called out');
});
