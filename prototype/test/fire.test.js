import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, roomPower, peopleIn } from '../src/slice/sim.js';
import { geo, roomsOf } from '../src/slice/geo.js';

// The original four-floor keep, nothing else by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const hearth = (s) => roomsOf(geo(s), 'hearth')[0].id;
// Light a fire in a room on the next tick.
function light(s, room) {
  s.events.unshift({ at: s.t + 1, type: 'fire', room });
  step(s);
  return s.fires.find((f) => f.room === room);
}
const secs = (s, n) => {
  for (let i = 0; i < n * 10 && s.phase === 'day'; i++) step(s);
};

test('on a day the dice call for it, a Hearth or a Forge catches fire at some hour', () => {
  const s = newSeason(3, { ...quiet, fireChance: 1 });
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  while (s.phase === 'night') step(s);
  ok(s, { type: 'beginDay' });
  const e = s.events.find((x) => x.type === 'fire');
  assert.ok(e, 'a fire is coming today');
  assert.ok(['hearth', 'forge'].includes(geo(s).rooms[e.room].type));
  while (s.t < e.at) step(s);
  assert.ok(s.fires.some((f) => f.room === e.room));
  assert.ok(s.log.some((l) => /^Fire in the /.test(l.text)));
});

test('unfought it heats, at full heat it catches the room beside it, and at dusk it scorches', () => {
  const s = newSeason(4, quiet);
  for (const p of s.living) p.job = 'yard';
  const f = light(s, hearth(s));
  assert.deepEqual(peopleIn(s, f.room), [], 'nobody in the Hearth');
  secs(s, 8);
  assert.equal(f.heat, 1, 'full heat');
  secs(s, s.tuning.fireSpread + 1);
  assert.ok(s.fires.length >= 2, 'it spread');
  assert.ok(s.log.some((l) => /The fire spreads from the Hearth/.test(l.text)));
  // It keeps spreading; whatever burns at dusk is scorched.
  const D = s.tuning.daySecs * 10;
  while (s.t < D - 1) step(s);
  const burning = s.fires.map((x) => x.room);
  step(s);
  assert.equal(s.phase, 'dusk');
  assert.deepEqual(s.scorched, burning);
  assert.deepEqual(s.fires, []);
});

// Two of the living off to quarry in the Yard.
function withYard(s) {
  const ps = s.living.filter((p) => p.job !== 'hearth').slice(0, 2);
  for (const p of ps) p.job = 'yard';
  return ps;
}

test('everyone in the room fights it; the Yard sent in puts it out, and goes back', () => {
  const s = newSeason(5, quiet);
  withYard(s);
  const cooks = s.living.filter((p) => p.job === 'hearth');
  assert.ok(cooks.length >= 1);
  const f = light(s, hearth(s));
  assert.deepEqual(peopleIn(s, f.room).map((p) => p.id), cooks.map((p) => p.id));
  const masons = s.living.filter((p) => p.job === 'yard');
  assert.ok(masons.length, 'the Yard has hands');
  ok(s, { type: 'fightFire', room: f.room });
  assert.ok(masons.every((p) => p.fighting === f.room));
  secs(s, 20);
  assert.ok(!s.fires.includes(f), 'it is out');
  assert.ok(masons.every((p) => !p.fighting), 'back to the Yard');
  assert.ok(s.log.some((l) => /The fire in the Hearth is out/.test(l.text)));
});

test('the bell brings everyone well and not already fighting; a burning room and its fighters do no work', () => {
  const s = newSeason(6, quiet);
  withYard(s);
  s.living[s.living.length - 1].sick = 100;
  const before = roomPower(s);
  const f = light(s, hearth(s));
  assert.equal(roomPower(s).hearth, 0, 'nobody cooks in a burning Hearth');
  const cooks = peopleIn(s, f.room);
  ok(s, { type: 'fightFire', room: f.room, bell: true });
  const fighting = s.living.filter((p) => p.fighting === f.room);
  const expected = s.living.filter((p) => !cooks.includes(p) && !(p.sick > 0));
  assert.deepEqual(fighting.map((p) => p.id).sort(), expected.map((p) => p.id).sort(), 'everyone well, but the sick stay abed');
  assert.equal(roomPower(s).yard, 0, 'the masons left the Yard');
  assert.ok(before.yard > 0);
  assert.match(act(s, { type: 'fightFire', room: 'nowhere' }).error, /Nothing is burning/);
});

test('fighting it is dangerous: those who die in it die on duty, and wake Loyal', () => {
  const s = newSeason(7, { ...quiet, fireDeath: 1e6, fireGrow: 0 });
  const f = light(s, hearth(s));
  const inside = peopleIn(s, f.room);
  secs(s, 1);
  for (const p of inside) {
    const e = s.ledger.find((x) => x.id === p.id);
    assert.ok(e, `${p.name} died`);
    assert.equal(e.cause, 'duty');
    assert.match(e.how, /died fighting the fire in the Hearth/);
  }
  assert.ok(s.bodies.length >= inside.length);
});

test('a scorched room does no work the next day, and is back the day after', () => {
  const s = newSeason(8, { ...quiet, fireSpread: 1e9 });
  for (const p of s.living) p.job = 'yard';
  light(s, hearth(s));
  while (s.phase === 'day') step(s);
  assert.deepEqual(s.scorched, [hearth(s)]);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  ok(s, { type: 'beginDay' });
  s.living[0].job = 'hearth';
  assert.equal(roomPower(s).hearth, 0, 'scorched');
  while (s.phase === 'day') step(s);
  assert.deepEqual(s.scorched, []);
});

test('with fire off, and in keeps from before it, no fire ever starts', () => {
  const s = newSeason(9, { ...quiet, fire: 0, fireChance: 1 });
  for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
      s.night.spawns = [];
    } else if (s.phase === 'dawn') ok(s, { type: 'beginDay' });
    else step(s);
  }
  assert.ok(!s.log.some((l) => /^Fire in the /.test(l.text)));
  const old = JSON.parse(JSON.stringify(newSeason(10, quiet)));
  delete old.tuning.fire;
  delete old.tuning0.fire;
  delete old.fires;
  const g = upgrade(old);
  assert.equal(g.tuning0.fire, 0);
  assert.deepEqual(g.fires, []);
});
