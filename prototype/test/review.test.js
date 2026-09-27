import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';

// A keep played by the autopilot to the given dusk, then left alone through the night.
function neglected(seed, day) {
  const s = newSeason(seed);
  while (!(s.day === day && s.phase === 'dusk')) autoStep(s);
  if (s.dusk.step === 'crypt') act(s, { type: 'wake' });
  act(s, { type: 'startNight' });
  while (s.phase === 'night') step(s);
  return s;
}

test('a night left alone: its three weightiest moments, the Veil breaking among them, in the order they came', () => {
  const s = neglected(5, 3);
  assert.equal(s.phase, 'over');
  const R = s.review;
  assert.equal(R.season, 1);
  assert.equal(R.day, 3);
  assert.ok(R.moments.length <= 3 && R.moments.length > 0);
  assert.deepEqual(R.moments.map((m) => m.t), [...R.moments.map((m) => m.t)].sort((a, b) => a - b), 'in time order');
  const broke = R.moments.find((m) => m.kind === 'broke');
  assert.ok(broke, 'the Veil breaking is kept');
  assert.match(broke.text, /broke the Veil at the mirror in the/);
  // Each keeps the Tain as it stood: the unit that crossed is still there, at the Veil's floor.
  assert.ok(broke.frame.foes.some((u) => u.f === broke.f));
  for (const m of R.moments) {
    assert.ok(Array.isArray(m.frame.candles) && Array.isArray(m.frame.shades) && Array.isArray(m.frame.foes));
    for (const u of [...m.frame.foes, ...m.frame.shades]) assert.ok(Number.isFinite(u.x) && u.ox === u.x && u.of === u.f);
  }
});

test('a kind is kept once, at its first; the biggest tide moves to each new height; a held night keeps what there was', () => {
  const s = newSeason(6);
  while (!(s.day === 1 && s.phase === 'night')) autoStep(s);
  const seen = [];
  while (s.phase === 'night') {
    autoStep(s);
    for (const m of s.night?.moments || []) if (!seen.some((x) => x.key === m.key && x.t === m.t)) seen.push({ key: m.key, t: m.t, n: m.kind === 'tide' ? Number(m.text.match(/(\d+) of/)[1]) : 0 });
  }
  const tides = seen.filter((x) => x.key === 'tide');
  assert.ok(tides.length >= 1);
  for (let i = 1; i < tides.length; i++) assert.ok(tides[i].n > tides[i - 1].n, 'each new tide moment is a new height');
  const keys = s.review.moments.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length, 'no kind twice');
  assert.equal(s.phase, 'dawn');
  assert.equal(s.review.day, 1);
});

test('the review replays exactly, and a fresh keep has none', () => {
  assert.equal(newSeason(3).review, undefined);
  const s = neglected(5, 2);
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.phase === 'night' || r.phase === 'day') step(r);
  assert.deepEqual(r.review, s.review);
});
