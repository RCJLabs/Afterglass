// Round seven, phase 12: something to grow into. Repairs (what a Maw broke, a fire burned or a breach left of
// the gate stays until masons mend it), and a keep that holds as many as it has beds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSeason, step, act, ritePreview, upgrade, roomPower, beds, livingCap, rankOf, studied, nextRank, raiseCost, pitchOf, mirrorGlass, wardHoldOf, actsFor,
  standingCost, inHall, troubleOf, raidStrength, judgedDread, hollowRisen, yearsTrouble, cracksOf, veilWardCost, troubled,
} from '../src/slice/sim.js';
import { geo, roomsOf } from '../src/slice/geo.js';
import { TUNING, STUDIES, MAP, MIRRORS, DAY_ROOMS, TROUBLES } from '../src/slice/data.js';

const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, weather: 0 };
// Repairs from the first season, to test them there (by default they begin in the keep's second year).
const worn = { ...quiet, repairsFrom: 1 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const no = (s, a, re) => {
  const r = act(s, a);
  assert.ok(!r.ok, `${a.type} should fail`);
  if (re) assert.match(r.error, re);
};
const toDusk = (s) => {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
};
const throughNight = (s, broken = []) => {
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  s.night.broken.push(...broken);
  while (s.phase === 'night') step(s);
};
const until = (s, f) => {
  for (let i = 0; i < 5000 && s.phase === 'day' && !f(); i++) step(s);
};

test('a room a Maw broke stays haunted hauntDays dawns, a Dread at each, unless masons mend it for stone', () => {
  const s = newSeason(3, worn);
  const hearth = roomsOf(geo(s), 'hearth')[0].id;
  const chapel = roomsOf(geo(s), 'chapel')[0].id;
  toDusk(s);
  throughNight(s, [hearth, chapel]);
  assert.deepEqual(s.haunted.sort(), [hearth, chapel].sort());
  assert.equal(ritePreview(s).dread.broken, 2 * TUNING.dreadPerBroken);
  ok(s, { type: 'beginDay' });
  assert.ok(s.log.some((l) => /haunted: 1 Dread at each dawn while it lasts, unless masons mend it \(2 stone\)/.test(l.text)));
  s.res.stone = 1;
  no(s, { type: 'mend', id: hearth }, /takes 2 stone/);
  s.res.stone = 5;
  ok(s, { type: 'mend', id: hearth });
  assert.equal(s.res.stone, 3);
  assert.deepEqual(s.haunted, [chapel]);
  no(s, { type: 'mend', id: hearth }, /needs no mending/);
  // Left alone, the Chapel's costs its Dread at each of its dawns, and lifts at the one after.
  for (let n = 2; n <= TUNING.hauntDays; n++) {
    toDusk(s);
    throughNight(s);
    assert.deepEqual(s.haunted, [chapel], `dawn ${n}`);
    assert.equal(ritePreview(s).dread.broken, TUNING.dreadPerBroken);
    ok(s, { type: 'beginDay' });
  }
  toDusk(s);
  throughNight(s);
  assert.deepEqual(s.haunted, [], 'lifted');
  assert.equal(ritePreview(s).dread.broken, 0);
});

test('a room a fire burned out does no work for two days, unless it is mended', () => {
  const s = newSeason(8, { ...worn, fire: 1, fireChance: 0, fireSpread: 1e9 });
  const hearth = roomsOf(geo(s), 'hearth')[0].id;
  s.fires.push({ room: hearth, heat: 1, full: true });
  toDusk(s);
  assert.deepEqual(s.scorched, [hearth]);
  assert.ok(s.log.some((l) => /Nobody can work there for 2 days, unless masons mend it \(2 stone\)/.test(l.text)));
  throughNight(s);
  ok(s, { type: 'beginDay' });
  s.living[0].job = 'hearth';
  assert.equal(roomPower(s).hearth, 0, 'burned out');
  toDusk(s);
  assert.deepEqual(s.scorched, [hearth], 'still, the day after');
  throughNight(s);
  ok(s, { type: 'beginDay' });
  s.res.stone = 2;
  ok(s, { type: 'mend', id: hearth });
  assert.deepEqual(s.scorched, []);
  assert.ok(roomPower(s).hearth > 0, 'worked again');
  // Unmended, it's back on the third day.
  const t = newSeason(8, { ...worn, fire: 1, fireChance: 0, fireSpread: 1e9 });
  t.fires.push({ room: hearth, heat: 1, full: true });
  for (let d = 0; d < 2; d++) {
    toDusk(t);
    throughNight(t);
    ok(t, { type: 'beginDay' });
    assert.deepEqual(t.scorched, [hearth]);
  }
  toDusk(t);
  assert.deepEqual(t.scorched, []);
});

test('the gate keeps what an assault took off it, a breach leaves a quarter, and masons mend it by day', () => {
  const raid = { startFloors: 4, sickChance: 0, oldAgeChance: 0, fire: 0, raidSpread: 0, raidFightStrength: 1, repairsFrom: 1 };
  const s = newSeason(3, { ...raid, raidDays: { 1: 8, 2: 0, 3: 8, 4: 0, 6: 0 } });
  for (const p of s.living.filter((x) => x.job === 'barracks').slice(1)) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  s.watchBonus = 0;
  until(s, () => s.raid?.state === 'assault');
  assert.equal(s.raid.gate, 1);
  until(s, () => s.raid.state !== 'assault');
  assert.equal(s.raid.state, 'breached');
  assert.equal(s.gate, TUNING.gateBreached);
  s.res.stone = 3;
  ok(s, { type: 'mend', id: 'gate' });
  assert.equal(s.gate, TUNING.gateBreached + TUNING.raidShore);
  assert.equal(s.res.stone, 3 - TUNING.raidShoreCost);
  no(s, { type: 'mend', id: 'gate' }, /takes 2 stone/);
  // The next assault, two dawns on, meets the gate as it was left and as it mended itself.
  toDusk(s);
  throughNight(s);
  ok(s, { type: 'beginDay' });
  toDusk(s);
  throughNight(s);
  ok(s, { type: 'beginDay' });
  s.watchBonus = 0;
  until(s, () => s.raid?.state === 'assault');
  assert.equal(s.day, 3);
  assert.equal(s.raid.gate, Math.min(1, TUNING.gateBreached + TUNING.raidShore + 2 * TUNING.gateMend));
});

test('in the first year, and without repairs: the haunting lifts at dusk, the burned room works the day after, the gate is whole', () => {
  const first = newSeason(3, quiet);
  const room = roomsOf(geo(first), 'hearth')[0].id;
  toDusk(first);
  throughNight(first, [room]);
  ok(first, { type: 'beginDay' });
  no(first, { type: 'mend', id: room }, /In its first year/);
  toDusk(first);
  assert.deepEqual(first.haunted, [], 'lifted at dusk in the first year');
  const s = newSeason(3, { ...quiet, repairs: 0 });
  const hearth = roomsOf(geo(s), 'hearth')[0].id;
  toDusk(s);
  throughNight(s, [hearth]);
  ok(s, { type: 'beginDay' });
  assert.deepEqual(s.haunted, [hearth]);
  assert.ok(s.log.some((l) => /Hearth is haunted today/.test(l.text)));
  no(s, { type: 'mend', id: hearth }, /Nothing is mended/);
  toDusk(s);
  assert.deepEqual(s.haunted, []);
  // A keep from before repairs has them off.
  const old = JSON.parse(JSON.stringify(newSeason(4, quiet)));
  delete old.tuning.repairs;
  delete old.tuning0.repairs;
  assert.equal(upgrade(old).tuning.repairs, 0);
});

test('the keep holds as many living as it has beds, 12 at least; as before, 12 whatever the beds', () => {
  const s = newSeason(5, { ...quiet, startFloors: 4 });
  assert.equal(livingCap(s), TUNING.maxLiving, 'eight beds: twelve still');
  s.res.stone = 100;
  ok(s, { type: 'raise', room: 'quarters' });
  assert.equal(livingCap(s), TUNING.maxLiving, 'twelve beds');
  ok(s, { type: 'raise', room: 'quarters' });
  assert.equal(beds(s), TUNING.baseBeds + 2 * TUNING.quartersBeds);
  assert.equal(livingCap(s), 16);
  assert.equal(livingCap({ ...s, tuning: { ...s.tuning, bedsHold: 0 } }), TUNING.maxLiving);
  const old = JSON.parse(JSON.stringify(newSeason(4, quiet)));
  delete old.tuning.bedsHold;
  delete old.tuning0.bedsHold;
  assert.equal(upgrade(old).tuning.bedsHold, 0);
});

// Nothing by day or night to get in the way (as test/rooms.test.js's calm).
const calm = {
  fire: 0, sickChance: 0, oldAgeChance: 0, weather: 0, dreamwell: 0, errands: 0, omens: 0, visitors: 0, firstInspection: 99, lateRoomsFrom: 1,
  raidDays: { 2: 0, 4: 0, 6: 0 }, creepersBase: 0, creepersPerNight: 0, mawFrom: 99,
};
function nextDay(s) {
  const d = s.day;
  for (let i = 0; i < 1e6 && !(s.phase === 'day' && s.day > d); i++) {
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
    } else if (s.phase === 'dawn') ok(s, { type: 'beginDay' });
    else step(s);
  }
}

test('a study has a second rank, begun once the first is learned, at twice the price, and doing more', () => {
  const s = newSeason(3, calm);
  Object.assign(s.res, { stone: 30, remembrance: 40 });
  ok(s, { type: 'raise', room: 'library' });
  for (const p of s.living.filter((x) => x.age !== 'child').slice(0, 3)) ok(s, { type: 'assign', id: p.id, room: 'library' });
  ok(s, { type: 'study', id: 'masonry' });
  while (s.study) nextDay(s);
  assert.equal(rankOf(s, 'masonry'), 1);
  const cost = raiseCost(s, { newFloor: false });
  const rem = s.res.remembrance;
  ok(s, { type: 'study', id: 'masonry' });
  assert.equal(s.res.remembrance, rem - 2 * STUDIES.masonry.rem);
  assert.equal(s.study.rank, 2);
  assert.ok(s.log.some((l) => new RegExp(`begins Masonry II: ${2 * STUDIES.masonry.lore} lore to go`).test(l.text)));
  while (s.study) nextDay(s);
  assert.equal(rankOf(s, 'masonry'), 2);
  assert.equal(raiseCost(s, { newFloor: false }), cost + STUDIES.masonry.less - STUDIES.masonry.two.less);
  assert.ok(s.log.some((l) => /finished Masonry II: a room costs 3 stone less/.test(l.text)));
  no(s, { type: 'study', id: 'masonry' }, /learned Masonry already/);
  // Each second rank does what it says.
  const t = newSeason(3, calm);
  t.learned = ['wards', 'wards2', 'pitch', 'pitch2', 'silvering', 'silvering2', 'hollow', 'hollow2', 'rites', 'rites2'];
  assert.equal(studied(t, 'wards', 'less'), 3);
  assert.equal(pitchOf(t), TUNING.raidPitch * 3);
  assert.equal(mirrorGlass(t, 14), 7);
  assert.equal(wardHoldOf(t), TUNING.wardHold * 3);
  t.riteKind = 'loyal';
  assert.equal(actsFor(t, { kind: 'loyal' }), 3);
  // One rank, as before.
  const one = newSeason(3, { ...calm, studyTiers: 1 });
  one.learned = ['masonry'];
  assert.equal(nextRank(one, 'masonry'), 0);
});

test('a standing ward, set by day, holds every night left in the season, and goes with it', () => {
  const s = newSeason(3, calm);
  s.res.essence = 60;
  const rift = MAP.rifts[0].id;
  const cost = Math.round(TUNING.standingWard * TUNING.wardCost * (TUNING.seasonDays - s.day + 1));
  assert.equal(standingCost(s), cost);
  ok(s, { type: 'standWard', target: rift });
  assert.equal(s.res.essence, 60 - cost);
  no(s, { type: 'standWard', target: rift }, /stands warded/);
  no(s, { type: 'standWard', target: 'nowhere' }, /Wards seal/);
  nextDay(s);
  // Tonight and every night after: warded from dusk, and not to be taken back.
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  assert.ok(s.night.wards.includes(rift));
  no(s, { type: 'unward', target: rift }, /holds until the season ends/);
  no(s, { type: 'ward', target: rift }, /Already warded/);
  const t = newSeason(4, { ...calm, standingWard: 0 });
  no(t, { type: 'standWard', target: rift }, /no standing wards/);
});

test('a great-glass hall holds eight, the newly dead are bound into it first, and they fade half as fast there', () => {
  const s = newSeason(3, calm);
  s.res.glass = 100;
  ok(s, { type: 'build', mirror: 'hall' });
  const hall = s.mirrors.at(-1);
  assert.equal(hall.type, 'hall');
  assert.equal(s.res.glass, 100 - MIRRORS.hall.glass);
  ok(s, { type: 'debug', what: 'kill', id: s.living[0].id, cause: 'oldage' });
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const d = s.shades.at(-1);
  assert.equal(d.mirror, hall.id, 'bound into the hall');
  assert.ok(inHall(s, d));
  // A great glass grows into one with quicksilver.
  const t = newSeason(4, calm);
  Object.assign(t.res, { glass: 100, quicksilver: 20 });
  ok(t, { type: 'build', mirror: 'great' });
  ok(t, { type: 'upgradeMirror', id: t.mirrors.at(-1).id });
  assert.equal(t.mirrors.at(-1).type, 'hall');
  // Without the rule, no hall.
  const u = newSeason(4, { ...calm, glassHalls: 0 });
  u.res.glass = 100;
  no(u, { type: 'build', mirror: 'hall' }, /No such mirror/);
});

test('the Lampworks rises only from floor 8, its lampwrights turn glass into candles, and its twin is lit at dusk', () => {
  const s = newSeason(3, { ...calm, startFloors: 4 });
  s.res.stone = 200;
  no(s, { type: 'raise', room: 'lampworks' }, /only from floor 8 up/);
  while (geo(s).n < 7) ok(s, { type: 'raise', room: 'barracks', at: 'top' });
  ok(s, { type: 'raise', room: 'lampworks', at: 'top' });
  const room = roomsOf(geo(s), 'lampworks')[0];
  assert.equal(geo(s).n, 8);
  const hands = s.living.filter((x) => x.age !== 'child');
  for (const p of hands) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  for (const p of hands.slice(0, 2)) ok(s, { type: 'assign', id: p.id, room: 'lampworks' });
  Object.assign(s.res, { glass: 10, candles: 0 });
  while (s.phase === 'day') step(s);
  const used = 10 - s.res.glass;
  assert.ok(used > 1, `glass used: ${used}`);
  assert.ok(Math.abs(s.res.candles - used * DAY_ROOMS.lampworks.rate) < 1e-6, 'three candles for each glass');
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const lamp = s.night.candles.find((c) => c.lamp);
  assert.ok(lamp, 'the Lamp Gallery is lit');
  assert.equal(lamp.f, room.f);
  no(s, { type: 'uncandle', id: lamp.id }, /isn't the store's/);
  // No glass, no candles.
  const t = newSeason(3, { ...calm, startFloors: 4, lampworks: 0 });
  t.res.stone = 200;
  while (geo(t).n < 7) ok(t, { type: 'raise', room: 'barracks', at: 'top' });
  no(t, { type: 'raise', room: 'lampworks', at: 'top' }, /no Lampworks in this keep/);
});

test('from the second year each year brings a trouble, none twice until each has come, and it does what it says', () => {
  const s = newSeason(7, calm);
  assert.equal(troubleOf(s), null, 'none in the first year');
  const seen = [];
  for (let y = 2; y <= 1 + Object.keys(TROUBLES).length; y++) {
    s.season = 4 * (y - 1) + 1;
    s.trouble = null;
    s.day = 1;
    yearsTrouble(s); // as at the year's first dawn
    seen.push(troubleOf(s));
  }
  assert.equal(new Set(seen).size, Object.keys(TROUBLES).length, `each once: ${seen.join(', ')}`);
  // What each turns up.
  const t = newSeason(8, calm);
  t.season = 5;
  const was = { raid: raidStrength(t, 10), judged: judgedDread(t) };
  t.trouble = { id: 'host', year: 2 };
  assert.equal(raidStrength(t, 10), was.raid * TROUBLES.host.raid);
  t.trouble = { id: 'church', year: 2 };
  assert.equal(judgedDread(t), was.judged + 1);
  t.trouble = { id: 'deep', year: 2 };
  assert.ok(hollowRisen(t));
  t.trouble = { id: 'deep', year: 1 };
  assert.ok(!hollowRisen(t), "last year's trouble is gone");
  const off = newSeason(8, { ...calm, troubles: 0 });
  off.season = 5;
  off.trouble = { id: 'host', year: 2 };
  assert.equal(troubleOf(off), null);
});

test('keeps from before phase 12 have none of it', () => {
  const old = JSON.parse(JSON.stringify(newSeason(4, quiet)));
  for (const k of ['studyTiers', 'standingWard', 'glassHalls', 'lampworks', 'troubles']) {
    delete old.tuning[k];
    delete old.tuning0[k];
  }
  const g = upgrade(old);
  assert.deepEqual([g.tuning.studyTiers, g.tuning.standingWard, g.tuning.glassHalls, g.tuning.lampworks, g.tuning.troubles], [1, 0, 0, 0, 0]);
});

test('a ward on the Veil holds one crack more until the season ends, each more as much again', () => {
  const s = newSeason(3, calm);
  s.res.essence = 100;
  assert.equal(cracksOf(s), TUNING.cracksMax);
  ok(s, { type: 'wardVeil' });
  assert.equal(s.res.essence, 100 - TUNING.veilWard);
  assert.equal(cracksOf(s), TUNING.cracksMax + 1);
  assert.equal(veilWardCost(s), 2 * TUNING.veilWard);
  no(s, { type: 'wardVeil' }, new RegExp(`takes ${2 * TUNING.veilWard} essence`));
  const off = newSeason(3, { ...calm, veilWard: 0 });
  no(off, { type: 'wardVeil' }, /no ward on the Veil/);
});

test("a rite in the Chapel halves the year's trouble until the season ends, once a season", () => {
  const s = newSeason(3, { ...calm, startFloors: 4 });
  s.season = 5;
  s.trouble = { id: 'plague', year: 2 };
  s.res.remembrance = 40;
  assert.equal(troubled(s, 'sick', 1), TROUBLES.plague.sick);
  ok(s, { type: 'easeTrouble' });
  assert.equal(s.res.remembrance, 40 - TUNING.troubleRite);
  assert.equal(troubled(s, 'sick', 1), 1 + (TROUBLES.plague.sick - 1) / 2);
  no(s, { type: 'easeTrouble' }, /held this season/);
  s.trouble = { id: 'deep', year: 2 };
  assert.ok(!hollowRisen(s), 'the Deep eased');
  s.season = 6;
  assert.ok(hollowRisen(s), 'and risen again next season');
  const none = newSeason(3, calm);
  none.res.remembrance = 40;
  no(none, { type: 'easeTrouble' }, /No trouble/);
});
