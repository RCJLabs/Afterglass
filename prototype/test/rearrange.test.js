import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, act, step, replay, bareHalls, tainPlace, jobCap, nextSlot } from '../src/slice/sim.js';
import { geo, roomsOf } from '../src/slice/geo.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const layout = (s) => s.keep.floors.map((fl) => fl.map((r) => r.type));
const keep = () => {
  const s = newSeason(3);
  ok(s, { type: 'debug', what: 'give', res: 'stone', n: 52 });
  ok(s, { type: 'raise', room: 'barracks' });
  ok(s, { type: 'raise', room: 'chandlery' });
  return s;
};

test('building goes on top by default, or into any bare hall, or on a new floor when asked', () => {
  const s = keep();
  assert.deepEqual(layout(s), [['barracks', 'chandlery'], ['hearth', 'crypt']]);
  ok(s, { type: 'raise', room: 'chapel', at: 'top' });
  assert.deepEqual(layout(s), [['chapel', 'empty'], ['barracks', 'chandlery'], ['hearth', 'crypt']]);
  // A new floor even with a bare hall on top.
  ok(s, { type: 'raise', room: 'glazier', at: 'top' });
  assert.deepEqual(layout(s), [['glazier', 'empty'], ['chapel', 'empty'], ['barracks', 'chandlery'], ['hearth', 'crypt']]);
  // Into the bare hall a floor down.
  const hall = bareHalls(s).find((h) => h.f === 1);
  ok(s, { type: 'raise', room: 'infirmary', at: hall.id });
  assert.deepEqual(layout(s), [['glazier', 'empty'], ['chapel', 'infirmary'], ['barracks', 'chandlery'], ['hearth', 'crypt']]);
  assert.match(s.log.at(-1).text, /in the bare hall on floor 3\. By night its twin, the Threshold, is under the line\./);
  assert.match(act(s, { type: 'raise', room: 'granary', at: 'crypt' }).error, /no bare hall there/);
  // With no choice, the next room still takes the top floor's hall.
  assert.equal(nextSlot(s).id, bareHalls(s)[0].id);
});

test('tearing down leaves a bare hall, gives half the stone back and sends the overflow to the Yard; the Crypt and the last Hearth stay', () => {
  const s = keep();
  for (const p of s.living.slice(0, 3)) ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  ok(s, { type: 'raise', room: 'barracks', at: 'top' });
  const second = roomsOf(geo(s), 'barracks').find((r) => r.id !== 'barracks').id;
  for (const p of s.living.slice(3, 5)) ok(s, { type: 'assign', id: p.id, room: 'barracks' });
  assert.equal(s.living.filter((p) => p.job === 'barracks').length, 5);
  const stone = s.res.stone;
  ok(s, { type: 'teardown', id: second });
  assert.equal(s.res.stone, stone + Math.floor(s.tuning.roomStone * s.tuning.teardownBack));
  assert.equal(jobCap(s, 'barracks'), s.tuning.roomCap);
  assert.equal(s.living.filter((p) => p.job === 'barracks').length, s.tuning.roomCap, 'the overflow went to the Yard');
  assert.ok(bareHalls(s).length >= 1);
  assert.match(act(s, { type: 'teardown', id: 'crypt' }).error, /Crypt stays/);
  assert.match(act(s, { type: 'teardown', id: 'hearth' }).error, /needs a Hearth/);
  assert.match(act(s, { type: 'teardown', id: bareHalls(s)[0].id }).error, /no room there/);
});

test('moving a room swaps it with another room or a hall, for stone; jobs stay; its twin moves with it', () => {
  const s = keep();
  const cooks = s.living.filter((p) => p.job === 'hearth').map((p) => p.id);
  const stone = s.res.stone;
  ok(s, { type: 'moveRoom', id: 'chandlery', to: 'crypt' });
  assert.deepEqual(layout(s), [['barracks', 'crypt'], ['hearth', 'chandlery']]);
  assert.equal(s.res.stone, stone - s.tuning.moveStone);
  assert.deepEqual(s.living.filter((p) => p.job === 'hearth').map((p) => p.id), cooks);
  const G = geo(s);
  assert.equal(G.rooms.chandlery.f, G.veil, 'the Wick Room now hangs under the Veil');
  assert.match(tainPlace(G, G.veil), /under the Veil/);
  assert.match(act(s, { type: 'moveRoom', id: 'chandlery', to: 'chandlery' }).error, /two places/);
  s.res.stone = 1;
  assert.match(act(s, { type: 'moveRoom', id: 'hearth', to: 'barracks' }).error, /takes 2 stone/);
  // By day only.
  s.res.stone = 10;
  while (s.phase === 'day') step(s);
  assert.match(act(s, { type: 'moveRoom', id: 'hearth', to: 'barracks' }).error, /by day/);
});

test('a rearranged keep replays exactly', () => {
  const s = keep();
  ok(s, { type: 'raise', room: 'chapel', at: 'top' });
  ok(s, { type: 'teardown', id: 'chandlery' });
  ok(s, { type: 'moveRoom', id: 'chapel', to: bareHalls(s).find((h) => h.f === 1).id });
  for (let i = 0; i < 200; i++) step(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t) step(r);
  assert.deepEqual(r.keep, s.keep);
  assert.deepEqual(r.res, s.res);
});
