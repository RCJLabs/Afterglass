// Round seven, phase 4: the first year staged. A keep's first season meets its visitors from day 3, and the
// Library and the Hall can be built from summer; keeps from before keep the old rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, act, upgrade, roomReady } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { TUNING } from '../src/slice/data.js';

// The balanced autopilot plays to the morning of a day.
const toDay = (s, day) => {
  for (let i = 0; i < 4e5 && s.day < day && s.phase !== 'over'; i++) autoStep(s, 'balanced');
};

test('no visitors on the first season\'s first two days; from day 3 as before', () => {
  assert.equal(TUNING.visitFrom, 3);
  let early = 0;
  let later = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = newSeason(seed, { visitorChance: 1 });
    early += s.visitors.length;
    toDay(s, 3);
    if (s.day === 3) later += s.visitors.length > 0;
  }
  assert.equal(early, 0, 'none on day 1');
  assert.ok(later >= 30, `day 3 brings them (${later} of 40)`);
});

test('the Library and the Hall can be built from summer; the rest from the first day', () => {
  const s = newSeason(3, { raidDays: { 2: 0, 4: 0, 6: 0 } });
  act(s, { type: 'debug', what: 'give', res: 'stone', n: 60 });
  assert.equal(roomReady(s, 'library'), false);
  assert.match(act(s, { type: 'raise', room: 'library' }).error, /from summer/);
  assert.match(act(s, { type: 'raise', room: 'hall' }).error, /from summer/);
  assert.ok(act(s, { type: 'raise', room: 'chapel' }).ok);
  s.season = 2;
  assert.ok(roomReady(s, 'hall'));
  assert.ok(act(s, { type: 'raise', room: 'hall' }).ok);
});

test('keeps from before keep visitors from day 1 and every room from the start', () => {
  const s = newSeason(3);
  for (const t of [s.tuning, s.tuning0]) {
    delete t.visitFrom;
    delete t.lateRoomsFrom;
  }
  const g = upgrade(JSON.parse(JSON.stringify(s)));
  assert.equal(g.tuning.visitFrom, 1);
  assert.equal(g.tuning.lateRoomsFrom, 1);
  assert.ok(roomReady(g, 'library'));
});
