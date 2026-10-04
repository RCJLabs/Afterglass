// Round seven, phase 13: mirrors in rooms (mirrorRooms). Every mirror hangs in a room, one to a room: its
// shades whisper to whoever works there, a great glass's step through into it, and a mirror with a shade in it
// is a door a Maw can come through. Turned to the wall, it is no door, and its shades sit out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, capacity, canWork, roomPower, handsAt, hangsIn, mirrorIn, isDoor, doorAt, hangSpot, mawPick, crossingPreview, byId } from '../src/slice/sim.js';
import { geo, roomsOf, lightMap } from '../src/slice/geo.js';
import { MIRRORS } from '../src/slice/data.js';

// The original four-floor keep: by day the Chapel and Glazier on top, the Hearth and Crypt on the ground; by
// night the Chapel's twin is the Tain's deepest room, by the rifts.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, visitors: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const no = (s, a, re) => {
  const r = act(s, a);
  assert.ok(!r.ok, `${a.type} should be refused`);
  if (re) assert.match(r.error, re);
};
const toDusk = (s) => {
  while (s.phase === 'day') step(s);
};
const toNight = (s) => {
  toDusk(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
};
const stepFor = (s, secs) => {
  for (let i = 0; i < secs * 10 && s.phase === 'night'; i++) step(s);
};
const pier = (s) => s.mirrors.find((m) => m.type === 'pier');
const hand = (s) => s.mirrors.find((m) => m.type === 'hand');

test("a new keep's two mirrors hang in its first two rooms, the pier glass with the last keeper's dead where nobody works", () => {
  const s = newSeason(1);
  assert.deepEqual(s.mirrors.map((m) => [m.name, m.room]), [['Crypt pier glass', 'crypt'], ['Hearth hand mirror', 'hearth']]);
  assert.ok(s.shades.every((d) => d.mirror === pier(s).id));
  assert.ok(isDoor(s, pier(s)), 'a mirror with a shade in it is a door');
  assert.ok(!isDoor(s, hand(s)), 'an empty one is not');
  assert.equal(doorAt(s, 'crypt'), pier(s));
  assert.equal(mirrorIn(s, 'hearth'), hand(s));
});

test('a new mirror hangs where asked, or where nobody works, else nearest the Veil; one to a room', () => {
  const s = newSeason(2, quiet);
  s.res.glass = 100;
  // The Crypt and the Granary, where nobody works, are taken; of the worked rooms the Hearth is nearest the Veil.
  assert.deepEqual(s.mirrors.map((m) => hangsIn(s, m)), ['crypt', 'granary']);
  assert.equal(hangSpot(s), 'hearth');
  ok(s, { type: 'build', mirror: 'hand' });
  assert.equal(hangsIn(s, s.mirrors.at(-1)), 'hearth');
  assert.equal(s.mirrors.at(-1).name, 'Hearth hand mirror');
  ok(s, { type: 'build', mirror: 'hand', room: 'chapel' });
  assert.equal(hangsIn(s, s.mirrors.at(-1)), 'chapel');
  no(s, { type: 'build', mirror: 'hand', room: 'chapel' }, /hangs there already/);
  // Two rooms on one floor, both with a mirror: none to hang a third in.
  const t = newSeason(2, { ...quiet, startFloors: 1 });
  t.res.glass = 100;
  no(t, { type: 'build', mirror: 'hand' }, /Every room has its mirror/);
});

test('a mirror is hung in another room by day, shades and all, and changes places with the one hung there', () => {
  const s = newSeason(3, quiet);
  const p = pier(s);
  const h = hand(s);
  ok(s, { type: 'hang', id: p.id, room: 'chapel' });
  assert.equal(hangsIn(s, p), 'chapel');
  assert.equal(p.name, 'Chapel pier glass');
  assert.ok(s.shades.every((d) => d.mirror === p.id), 'its shades go with it');
  ok(s, { type: 'hang', id: h.id, room: 'chapel' });
  assert.equal(hangsIn(s, h), 'chapel');
  assert.equal(hangsIn(s, p), 'granary', 'the pier glass goes where the hand mirror hung');
  toDusk(s);
  no(s, { type: 'hang', id: p.id, room: 'hearth' }, /by day/);
});

test('a whisper coaches whoever works the room its mirror hangs in, not the trade the shade had', () => {
  const s = newSeason(4, quiet);
  const p = pier(s);
  const d = s.shades[0];
  ok(s, { type: 'hang', id: p.id, room: 'chandlery' });
  const before = roomPower(s);
  ok(s, { type: 'byDay', id: d.id, how: 'whisper' });
  const after = roomPower(s);
  assert.ok(Math.abs(after.chandlery - before.chandlery * s.tuning.whisperMult) < 1e-9, 'the Chandlery works the better for it');
  for (const k of Object.keys(before)) if (k !== 'chandlery') assert.ok(Math.abs(after[k] - before[k]) < 1e-9, `${k} is as it was`);
  // Hung in a room nobody works, the whisper stops.
  ok(s, { type: 'hang', id: p.id, room: 'granary' });
  assert.equal(d.byDay, null);
  no(s, { type: 'byDay', id: d.id, how: 'whisper' }, /Nobody works where/);
});

test("a great glass's shades step through into the room it hangs in, and take a place there", () => {
  const s = newSeason(5, quiet);
  s.res.glass = 100;
  ok(s, { type: 'build', mirror: 'great', room: 'glazier' });
  const g = s.mirrors.at(-1);
  const d = s.shades[0];
  d.mirror = g.id;
  const before = handsAt(s, 'glazier');
  ok(s, { type: 'byDay', id: d.id, how: 'step', room: 'hearth' }); // the room asked for is the glass's own
  assert.equal(handsAt(s, 'glazier'), before + 1);
  assert.equal(handsAt(s, 'hearth'), s.living.filter((p) => p.job === 'hearth').length);
});

test('a mirror turned to the wall is no door: its shades sit out, nobody new wakes in it, and it turns back', () => {
  const s = newSeason(6, quiet);
  const p = pier(s);
  ok(s, { type: 'turn', id: p.id, on: true });
  assert.ok(p.turned && !isDoor(s, p));
  assert.ok(s.shades.every((d) => !canWork(d)), 'its shades sit out');
  assert.equal(capacity(s).free, 1, 'only the hand mirror takes the dead');
  ok(s, { type: 'turn', id: hand(s).id, on: true });
  assert.equal(capacity(s).free, 0);
  ok(s, { type: 'debug', what: 'kill', id: s.living[0].id, cause: 'oldage' });
  assert.equal(crossingPreview(s)[0].to, 'overflow', 'nobody wakes in a turned mirror');
  ok(s, { type: 'turn', id: p.id, on: false });
  assert.ok(isDoor(s, p) && s.shades.every(canWork));
  toNight(s);
  no(s, { type: 'turn', id: p.id, on: true }, /by day or at dusk/);
});

// A Maw on the Tain's deepest floor, by the Chapel's twin, where the pier glass hangs with its shades, and the
// Chapel's priest the only one at work in the keep (everyone else sent to the Yard), so the Chapel is what it
// comes for.
function doorNight(seed, turned) {
  const s = newSeason(seed, quiet);
  ok(s, { type: 'hang', id: pier(s).id, room: 'chapel' });
  for (const p of s.living) if (p.job !== 'chapel' && p.job !== 'yard') ok(s, { type: 'assign', id: p.id, room: 'yard' });
  toDusk(s);
  if (turned) ok(s, { type: 'turn', id: pier(s).id, on: true });
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const maw = addFoe(s, 'maw', 0, 40);
  return { s, maw };
}

test('a Maw that breaks the twin of a worked room with a mirror open in it comes through: the Veil cracks, the Maw is gone', () => {
  const { s, maw } = doorNight(7, false);
  const G = geo(s);
  const to = mawPick(s, lightMap(G, s.tuning, s.night.candles), maw);
  assert.equal(to.id, 'chapel', 'it comes for the work');
  stepFor(s, 30);
  assert.ok(s.night.broken.includes('chapel'));
  assert.equal(s.cracks, s.tuning.doorCracks);
  assert.equal(s.night.stats.through, 1);
  assert.ok(!s.night.foes.includes(maw), 'it went through');
  assert.ok(s.log.some((l) => /^The Maw came through the Chapel pier glass/.test(l.text) && l.kind === 'crack'));
});

test('a Maw never makes for a room nobody works, a door in it or not', () => {
  const s = newSeason(7, quiet);
  toNight(s);
  const maw = addFoe(s, 'maw', 3, 80); // on the ground floor, by the Crypt, where the pier glass hangs open
  assert.ok(isDoor(s, pier(s)) && hangsIn(s, pier(s)) === 'crypt');
  const to = mawPick(s, lightMap(geo(s), s.tuning, s.night.candles), maw);
  assert.notEqual(to?.id, 'crypt');
  stepFor(s, 40);
  assert.ok(!s.night.broken.includes('crypt'));
  assert.ok(!s.night.stats.through);
});

test('turned to the wall, the same mirror lets nothing through', () => {
  const { s } = doorNight(7, true);
  stepFor(s, 40);
  assert.equal(s.cracks, 0);
  assert.ok(!s.night.stats.through);
});

test('a mirror in a bare hall hangs on in the room raised there, and in the bare hall a room torn down leaves', () => {
  const s = newSeason(8, { ...quiet, startFloors: 1 });
  Object.assign(s.res, { glass: 100, stone: 99 });
  ok(s, { type: 'raise', room: 'chandlery', at: 'top' });
  const bare = roomsOf(geo(s), 'empty')[0].id;
  ok(s, { type: 'build', mirror: 'hand', room: bare });
  const m = s.mirrors.at(-1);
  assert.equal(m.name, 'Bare hall hand mirror');
  ok(s, { type: 'raise', room: 'glazier', at: bare });
  const glazier = roomsOf(geo(s), 'glazier')[0].id;
  assert.equal(hangsIn(s, m), glazier);
  assert.equal(m.name, 'Glazier hand mirror');
  ok(s, { type: 'teardown', id: glazier });
  assert.equal(geo(s).rooms[hangsIn(s, m)].type, 'empty');
});

test('a keep from before mirrors in rooms keeps its mirrors unhung, and taking the rule up hangs them', () => {
  const s = newSeason(9, { ...quiet, mirrorRooms: 0 });
  assert.ok(s.mirrors.every((m) => !hangsIn(s, m)));
  assert.ok(!isDoor(s, pier(s)));
  no(s, { type: 'turn', id: pier(s).id, on: true }, /not turned/);
  no(s, { type: 'hang', id: pier(s).id, room: 'chapel' }, /hang where they hang/);
  ok(s, { type: 'tune', key: 'mirrorRooms', value: 1 });
  assert.deepEqual(s.mirrors.map((m) => hangsIn(s, m)), ['crypt', 'granary']);
  assert.equal(byId(s.mirrors, pier(s).id).name, 'Crypt pier glass');
  assert.equal(MIRRORS.pier.cap, 2);
});
