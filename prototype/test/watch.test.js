import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExport, indexOf, seek, cursorOf, advance, WAIT } from '../src/slice/watch.js';
import { keepFromFile } from '../src/slice/saves.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { newSeason } from '../src/slice/sim.js';

// A playtest export as the page makes it, from a keep and a trail.
const exportOf = (s, trail = [], test = null) => ({
  game: 'afterglass-season', save: s.v, seed: s.seed, daily: s.daily || null,
  now: { season: s.season, day: s.day, phase: s.phase, t: s.t },
  seasons: s.seasons, days: s.days, ledger: s.ledger, tuning0: s.tuning0, tuning: s.tuning, actions: s.actions, test, trail,
});
const played = runSeasonAuto(7, { plan: 'balanced', seasons: 1 });
const X = exportOf(played);

test('a session plays back to where it stopped, day by day as it was played', () => {
  const idx = indexOf(X);
  assert.equal(idx.off, null);
  assert.equal(idx.differs, null);
  assert.deepEqual(idx.end, X.now);
  const c = cursorOf(X);
  while (!c.done) advance(c, X, 123);
  assert.equal(c.u, idx.total);
  assert.equal(c.s.rng, played.rng);
  assert.equal(c.s.log.length, played.log.length);
  // Day and night take their ticks; a phase that waits on the player takes WAIT, and more for its choices.
  const nights = idx.segs.filter((g) => g.phase === 'night');
  assert.equal(nights.length, 7);
  const dusk = idx.segs.find((g) => g.phase === 'dusk');
  assert.ok(dusk.u1 - dusk.u0 >= WAIT);
});

test('a seek lands on the same keep as playing straight to it', () => {
  const idx = indexOf(X);
  for (const u of [0, 7, Math.floor(idx.total / 3), idx.total - 1, idx.total]) {
    const a = seek(idx, X, u);
    const b = cursorOf(X);
    while (!b.done && b.u < u) advance(b, X, u - b.u);
    assert.deepEqual([a.u, a.i, a.s.phase, a.s.t, a.s.rng], [b.u, b.i, b.s.phase, b.s.t, b.s.rng], `at ${u}`);
  }
});

test("the moments are marked, and so is the tester's trail, where in the game each happened", () => {
  const lost = runSeasonAuto(4, { plan: 'idle', seasons: 1 });
  assert.equal(lost.phase, 'over');
  const idl = indexOf(exportOf(lost));
  assert.ok(idl.marks.some((m) => m.kind === 'fell'), 'the fall');
  const idx = indexOf(X);
  assert.ok(idx.marks.some((m) => m.kind === 'death' && m.lane === 'game'));
  // A trail: a pause by hand for 42 s, a panel, an idle stretch, a pause the game made (not marked).
  const at = { season: 1, day: 2, phase: 'day', t: 100 };
  const w = 1e12;
  const trail = [
    { k: 'pause', by: 'you', at, w },
    { k: 'panel', name: 'people', at, w: w + 1000 },
    { k: 'idle', at, w: w + 2000, ms: 31000 },
    { k: 'play', by: 'you', at, w: w + 42000 },
    { k: 'pause', by: 'alert', why: 'A Maw is tearing…', at: { ...at, t: 200 }, w: w + 50000 },
  ];
  const t2 = indexOf(exportOf(played, trail));
  const you = t2.marks.filter((m) => m.lane === 'you');
  assert.deepEqual(you.map((m) => m.kind), ['pause', 'panel', 'idle']);
  assert.equal(you[0].text, 'Paused for 42 s.');
  const day2 = t2.segs.find((g) => g.season === 1 && g.day === 2 && g.phase === 'day');
  assert.equal(you[0].u, day2.u0 + 100);
});

test("a session this build can't play as it was is said to stop matching, where", () => {
  // The same actions on another keep: the first that can't be done stops the replay, and says why.
  const other = { ...X, seed: X.seed + 1 };
  const idx = indexOf(other);
  assert.ok(idx.off || idx.differs, 'noticed');
  if (idx.off) assert.ok(idx.off.at && idx.off.why);
});

test('an export is told from a save and from anything else; a playtest loaded as a keep keeps its trail', () => {
  assert.match(readExport('not json').error, /isn't JSON/);
  assert.match(readExport(JSON.stringify({ ...newSeason(3), alerts: [] })).error, /saved keep, not a playtest export/);
  assert.match(readExport('{"a":1}').error, /isn't a playtest export/);
  assert.equal(readExport(JSON.stringify(X)).x.seed, X.seed);
  const trail = [{ k: 'load', at: { season: 1, day: 1, phase: 'day', t: 0 }, w: 1 }];
  const r = keepFromFile(JSON.stringify(exportOf(played, trail, { label: 'Sam', answers: { again: 'yes' } })));
  assert.deepEqual(r.s.trail, trail);
  assert.equal(r.s.test.label, 'Sam');
});
