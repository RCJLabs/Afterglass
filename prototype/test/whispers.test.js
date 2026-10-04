import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, replay, roomPower, defense, perf, handsAt, ledgerOf } from '../src/slice/sim.js';
import { SHADE_TRAITS, DAY_ROOMS } from '../src/slice/data.js';
import { epitaph } from '../src/slice/book.js';

// The original four-floor keep (every trade has its room), nothing by day to get in the way. These are the
// rules before round seven's phase 13, a whisper by trade and a step into any room (mirrorRooms off): the
// mirrors in rooms are test/mirrors.test.js's.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, mirrorRooms: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const named = (s, name) => s.shades.find((d) => d.name === name);
const cost = (s, d, base) => base * (d.named ? 0.5 : 1) * (SHADE_TRAITS[d.trait]?.fade ?? 1);
const toDusk = (s) => {
  while (s.phase === 'day') step(s);
};

test('a shade whispers its old trade: whoever works it works ×1.25, and at dusk the shade pays in memory', () => {
  const s = newSeason(3, quiet);
  const g = named(s, 'Garrick'); // a guard in life
  const before = roomPower(s).barracks;
  const d0 = defense(s);
  assert.ok(before > 0, 'someone guards');
  ok(s, { type: 'byDay', id: g.id, how: 'whisper' });
  assert.ok(Math.abs(roomPower(s).barracks - before * s.tuning.whisperMult) < 1e-9);
  assert.ok(defense(s) > d0);
  const m = g.memory;
  toDusk(s);
  assert.equal(g.memory, Math.round((m - cost(s, g, s.tuning.whisperFade)) * 100) / 100);
  assert.equal(ledgerOf(s, g.id).whispered, 1);
  assert.ok(s.log.some((l) => /The dead who helped by day are the more tired for it/.test(l.text)));
  assert.deepEqual(g.byDay, { how: 'whisper' }, 'it keeps to it');
});

test('a whisper to a trade nobody worked costs nothing', () => {
  const s = newSeason(4, quiet);
  const g = named(s, 'Garrick');
  ok(s, { type: 'byDay', id: g.id, how: 'whisper' });
  for (const p of s.living.filter((x) => x.job === 'barracks')) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  const m = g.memory;
  toDusk(s);
  assert.equal(g.memory, m);
  assert.equal(ledgerOf(s, g.id).whispered, undefined);
});

test('who can whisper, and when', () => {
  const s = newSeason(5, quiet);
  const g = named(s, 'Garrick');
  const h = named(s, 'Hesper'); // a priest in life
  ok(s, { type: 'byDay', id: g.id, how: 'whisper' });
  ok(s, { type: 'byDay', id: h.id, how: 'whisper' });
  // A second shade of the same trade can't, and a raider had no trade in the keep.
  const other = { ...g, id: 'x1', name: 'Tom', byDay: null };
  s.shades.push(other);
  s.ledger.push({ ...ledgerOf(s, g.id), id: 'x1', name: 'Tom' });
  assert.match(act(s, { type: 'byDay', id: 'x1', how: 'whisper' }).error, /Garrick already whispers to the Barracks/);
  other.job = null;
  ledgerOf(s, 'x1').job = null;
  assert.match(act(s, { type: 'byDay', id: 'x1', how: 'whisper' }).error, /had no trade/);
  // Only a great glass's shades step through.
  assert.match(act(s, { type: 'byDay', id: h.id, how: 'step', room: 'chapel' }).error, /Only the shades of a great glass/);
  // Not by night, and not in a keep without the trade's room.
  toDusk(s);
  assert.match(act(s, { type: 'byDay', id: g.id, how: 'whisper' }).error, /only by day/);
  const small = newSeason(5, { ...quiet, startFloors: 1 });
  assert.match(act(small, { type: 'byDay', id: named(small, 'Garrick').id, how: 'whisper' }).error, /There is no Barracks for Garrick/);
  const off = newSeason(5, { ...quiet, whispers: 0 });
  assert.match(act(off, { type: 'byDay', id: named(off, 'Garrick').id, how: 'whisper' }).error, /The dead rest by day/);
});

test('a shade in a great glass steps through and works a room in person, taking a place there', () => {
  const s = newSeason(6, quiet);
  s.res.glass = 30;
  ok(s, { type: 'build', mirror: 'great' });
  const great = s.mirrors.find((m) => m.type === 'great');
  const h = named(s, 'Hesper');
  h.mirror = great.id;
  const before = roomPower(s).chapel;
  const n = handsAt(s, 'chapel');
  ok(s, { type: 'byDay', id: h.id, how: 'step', room: 'chapel' });
  assert.ok(Math.abs(roomPower(s).chapel - before - perf(h) * s.tuning.stepWork) < 1e-9, 'one more worker, at its night strength');
  assert.equal(handsAt(s, 'chapel'), n + 1);
  // Fill the Chapel: the living can't take the shade's place.
  const cap = s.tuning.roomCap;
  const idle = s.living.filter((p) => p.job !== 'chapel');
  while (handsAt(s, 'chapel') < cap) ok(s, { type: 'assign', id: idle.pop().id, room: 'chapel' });
  assert.match(act(s, { type: 'assign', id: idle.pop().id, room: 'chapel' }).error, /The Chapel is full/);
  const m = h.memory;
  toDusk(s);
  assert.equal(h.memory, Math.round((m - cost(s, h, s.tuning.stepFade)) * 100) / 100);
  assert.equal(ledgerOf(s, h.id).stepped, 1);
});

test('a shade spent to nothing by day fades at dusk', () => {
  const s = newSeason(7, quiet);
  const g = named(s, 'Garrick');
  g.memory = 1;
  ok(s, { type: 'byDay', id: g.id, how: 'whisper' });
  toDusk(s);
  assert.ok(!s.shades.includes(g));
  assert.equal(ledgerOf(s, g.id).end, 'faded');
  assert.ok(s.log.some((l) => /Garrick spent the last of their memory helping the living by day/.test(l.text)));
  assert.deepEqual(s.night.stats.lost, [], 'not counted as lost in the night to come');
});

test('a keep whose dead help by day replays exactly; older saves have no whispers; the Book tells of it', () => {
  const s = newSeason(8, quiet);
  ok(s, { type: 'byDay', id: named(s, 'Garrick').id, how: 'whisper' });
  for (let i = 0; i < 300; i++) step(s);
  ok(s, { type: 'byDay', id: named(s, 'Garrick').id, how: null });
  toDusk(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.phase === 'day') step(r);
  assert.deepEqual(r.shades, s.shades);
  assert.deepEqual(r.res, s.res);
  const old = JSON.parse(JSON.stringify(newSeason(9, quiet)));
  delete old.tuning.whispers;
  delete old.tuning0.whispers;
  assert.equal(upgrade(old).tuning0.whispers, 0);
  const e = { from: 'living', how: 'died on duty', season: 1, day: 2, woke: 'loyal', job: 'forge', whispered: 3, stepped: 1, nights: 2, end: 'faded', endDay: 5, endSeason: 1 };
  assert.match(epitaph(e), new RegExp(`By day, whispered to the ${DAY_ROOMS.forge.name} 3 days, and stepped through the great glass to work 1 day\\.`));
});
