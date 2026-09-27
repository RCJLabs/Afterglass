import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, step, retune, replay } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { dayKey, dailySeed, dayText, newDaily } from '../src/slice/daily.js';
import { recapOf } from '../src/slice/recap.js';
import { summary, keepFromFile } from '../src/slice/saves.js';
import { TUNING } from '../src/slice/data.js';

test("the day is the player's own date, turning at their midnight, and each day has its own seed", () => {
  assert.equal(dayKey(new Date(2026, 8, 27, 23, 59, 59).getTime()), '2026-09-27');
  assert.equal(dayKey(new Date(2026, 8, 28, 0, 0, 0).getTime()), '2026-09-28');
  // One moment, two places: early evening on the 27th in California is already the 28th in Tokyo.
  const tz = process.env.TZ;
  try {
    const at = Date.UTC(2026, 8, 28, 1, 0, 0);
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(dayKey(at), '2026-09-27');
    process.env.TZ = 'Asia/Tokyo';
    assert.equal(dayKey(at), '2026-09-28');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
  assert.equal(dayText('2026-09-27'), '27 September 2026');
  assert.equal(dailySeed('2026-09-27'), dailySeed('2026-09-27'));
  const seeds = new Set();
  for (let d = 0; d < 366; d++) {
    const x = dailySeed(dayKey(new Date(2026, 0, 1 + d, 12).getTime())); // noon, clear of any clock change
    assert.ok(Number.isInteger(x) && x > 0 && x < 2 ** 32);
    seeds.add(x);
  }
  assert.equal(seeds.size, 366, 'a year of days, all different');
});

test("everyone's keep for a day is the same, on the rules as they ship", () => {
  const a = newDaily('2026-09-27');
  const b = newDaily('2026-09-27');
  assert.deepEqual(a, b);
  assert.equal(a.daily, '2026-09-27');
  assert.equal(a.seed, dailySeed('2026-09-27'));
  for (const [k, v] of Object.entries(TUNING)) assert.deepEqual(a.tuning[k], v, k);
  for (let i = 0; i < 400; i++) {
    step(a);
    step(b);
  }
  assert.deepEqual(a, b);
  assert.notEqual(newDaily('2026-09-28').seed, a.seed);
});

test("its numbers are locked, but a new version's own numbers still come in", () => {
  const s = newDaily('2026-09-27');
  assert.match(act(s, { type: 'tune', key: 'daySecs', value: 30 }).error, /numbers are locked/);
  assert.equal(s.tuning.daySecs, TUNING.daySecs);
  s.tuning.gnawRate += 1; // as if an older version had shipped another number
  assert.equal(retune(s, TUNING), 1);
  assert.equal(s.tuning.gnawRate, TUNING.gnawRate);
});

test('played, it replays exactly, a playtest export of it loads back as the same day, and its card and save say which day', () => {
  const s = newDaily('2026-09-27');
  for (let g = 0; g < 1e6 && s.day < 3 && s.phase !== 'over'; g++) autoStep(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t || r.phase !== s.phase) step(r);
  assert.deepEqual(r.living, s.living);
  const back = keepFromFile(JSON.stringify({ game: 'afterglass-season', seed: s.seed, daily: s.daily, tuning0: s.tuning0, actions: s.actions, seasons: [], days: [], ledger: [] }));
  assert.ok(back.s, back.error);
  assert.equal(back.s.daily, '2026-09-27');
  assert.equal(summary(s, 5).daily, '2026-09-27');
  // At the season's end the card names the day.
  for (let g = 0; g < 2e6 && s.phase !== 'end' && s.phase !== 'over'; g++) autoStep(s);
  const card = recapOf(s);
  assert.equal(card.daily, '27 September 2026');
  assert.match(card.text, /^Afterglass, the keep of 27 September 2026 · Spring, year 1: /);
});
