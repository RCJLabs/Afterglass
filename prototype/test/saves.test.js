import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, SAVE_VERSION, playerTuning, chapterOf } from '../src/slice/sim.js';
import { autoStep, closeYear } from '../src/slice/autopilot.js';
import { SLOTS, OLD_KEY, slotKey, openIndex, loadSlot, saveSlot, useSlot, deleteSlot, keepFromFile, summary, isSave, mergeIndex, trimSave, CANT_REPLAY, KEPT_TRAIL, BAD_FILE } from '../src/slice/saves.js';
import { readExport } from '../src/slice/watch.js';

// localStorage as the page uses it: values go through JSON, and a full store refuses to write.
function fakeStore(limit = Infinity) {
  const m = new Map();
  return {
    m,
    get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    set(k, v) {
      const raw = JSON.stringify(v);
      const used = [...m].reduce((n, [key, x]) => n + (key === k ? 0 : x.length), 0);
      if (used + raw.length > limit) return false;
      m.set(k, raw);
      return true;
    },
    remove: (k) => m.delete(k),
  };
}
// A keep with a few days behind it, played by the autopilot so it has actions to replay.
function played(seed, days = 3) {
  const s = newSeason(seed);
  for (let guard = 0; guard < 1e6 && s.day < days && s.phase !== 'over'; guard++) autoStep(s);
  return s;
}
const plain = (s) => JSON.parse(JSON.stringify({ ...s, alerts: [] }));

test('the save from before slots becomes keep 1, once', () => {
  const store = fakeStore();
  const s = played(11);
  store.set(OLD_KEY, { ...s, alerts: [] }); // as the page wrote it
  const index = openIndex(store, 1000);
  assert.equal(index.current, 1);
  assert.equal(store.get(OLD_KEY), null, 'the old key is cleared');
  assert.deepEqual(loadSlot(store, 1), plain(s));
  assert.equal(index.slots[1].season, 1);
  assert.equal(index.slots[1].day, s.day);
  assert.equal(index.slots[1].saved, 1000);
  // The next visit reads the index; nothing moves again.
  store.set(OLD_KEY, newSeason(12));
  assert.deepEqual(openIndex(store, 2000), index);
  assert.ok(store.get(OLD_KEY), 'an old save written after the move is left alone');
});

test('a first visit starts with empty slots, keep 1 current', () => {
  const store = fakeStore();
  const index = openIndex(store, 0);
  assert.deepEqual(index, { current: 1, slots: {} });
  for (let n = 1; n <= SLOTS; n++) assert.equal(loadSlot(store, n), null);
});

test('a keep saved to a slot loads back exactly, and plays on the same', () => {
  const store = fakeStore();
  const index = openIndex(store, 0);
  const s = played(21);
  assert.ok(saveSlot(store, index, 2, s, 5));
  const at = summary(s, 5);
  const g = loadSlot(store, 2);
  assert.deepEqual(g, plain(s));
  for (let i = 0; i < 400; i++) {
    step(s);
    step(g);
  }
  assert.deepEqual(plain(g), plain(s));
  // The index line is what the Saves tab shows, as the keep stood when it was saved.
  assert.deepEqual(index.slots[2], at);
  assert.deepEqual(store.get('afterglass-season/slots/v1'), index);
});

test('a full store refuses a save and leaves the index as it was', () => {
  const store = fakeStore(2000);
  const index = openIndex(store, 0);
  assert.equal(saveSlot(store, index, 1, played(31), 1), false);
  assert.deepEqual(index.slots, {});
  assert.equal(store.get(slotKey(1)), null);
});

test('switching and deleting slots', () => {
  const store = fakeStore();
  const index = openIndex(store, 0);
  saveSlot(store, index, 1, newSeason(1), 1);
  saveSlot(store, index, 3, newSeason(3), 2);
  useSlot(store, index, 3);
  assert.equal(openIndex(store, 9).current, 3, 'the page opens the keep played last');
  deleteSlot(store, index, 1);
  assert.equal(loadSlot(store, 1), null);
  assert.deepEqual(Object.keys(openIndex(store, 9).slots), ['3']);
});

test('a keep saved in another tab shows here as filled, and this tab keeps its own', () => {
  const store = fakeStore();
  const a = openIndex(store, 0);
  const b = openIndex(store, 0);
  saveSlot(store, a, 1, newSeason(1), 1);
  useSlot(store, b, 2);
  saveSlot(store, b, 2, newSeason(2), 2); // the other tab starts keep 2
  assert.equal(a.slots[2], undefined, 'this tab has not heard yet');
  assert.ok(mergeIndex(store, a));
  assert.equal(a.slots[2].saved, 2);
  assert.equal(a.slots[1].saved, 1);
  assert.equal(a.current, 1, 'this tab still plays keep 1');
});

test('what a slot shows: rooms, the living, shades that can work, and a fallen keep', () => {
  const s = newSeason(4);
  const m = summary(s, 7);
  assert.equal(m.rooms, s.keep.floors.flat().filter((r) => r.type !== 'empty').length);
  assert.equal(m.rooms, 2, 'a season starts as two rooms');
  assert.equal(m.living, s.living.length);
  assert.equal(m.shades, s.shades.length);
  assert.equal(m.lost, false);
  s.phase = 'over';
  assert.equal(summary(s, 7).lost, true);
});

test('a file holding a save comes back as that keep', () => {
  const s = played(41);
  const r = keepFromFile(JSON.stringify(s));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.s, JSON.parse(JSON.stringify(s)));
});

test('a playtest export is replayed into the keep it came from', () => {
  const s = played(51, 4);
  assert.ok(s.actions.length > 5, 'the autopilot acted');
  const exp = { game: 'afterglass-season', save: SAVE_VERSION, seed: s.seed, now: {}, tuning0: s.tuning0, tuning: s.tuning, actions: s.actions };
  const r = keepFromFile(JSON.stringify(exp));
  assert.equal(r.error, undefined);
  assert.ok(isSave(r.s));
  // Replay stops at the last action; step on to where the export was taken.
  while (r.s.day < s.day || r.s.phase !== s.phase || r.s.t < s.t) step(r.s);
  assert.deepEqual(plain(r.s), plain(s));
});

test('an export from before seasons started from two rooms replays on the whole keep', () => {
  const s = newSeason(61, { startFloors: 4 });
  assert.ok(act(s, { type: 'tune', key: 'daySecs', value: 30 }).ok);
  const t0 = { ...s.tuning0 };
  delete t0.startFloors;
  const r = keepFromFile(JSON.stringify({ game: 'afterglass-season', seed: s.seed, tuning0: t0, actions: s.actions }));
  assert.equal(r.error, undefined);
  assert.equal(r.s.keep.floors.length, 4);
  assert.equal(r.s.tuning.daySecs, 30);
});

test('files that are not keeps are refused with a reason', () => {
  assert.match(keepFromFile('not json').error, /isn't JSON/);
  assert.match(keepFromFile('{"hello":1}').error, /isn't an Afterglass keep/);
  assert.match(keepFromFile(JSON.stringify({ ...newSeason(1), v: SAVE_VERSION + 1 })).error, /isn't an Afterglass keep/);
  const bad = { game: 'afterglass-season', seed: 1, tuning0: newSeason(1).tuning0, actions: [{ a: { type: 'nope' }, at: { season: 1, day: 1, phase: 'day', t: 0 } }] };
  assert.match(keepFromFile(JSON.stringify(bad)).error, /didn't replay/);
});

// A keep played by the autopilot to the end of a later season, with a number set in Settings on its first day.
function years(seed, seasons, tuning = {}) {
  const s = newSeason(seed, tuning);
  assert.ok(act(s, { type: 'tune', key: 'daySecs', value: 60 }).ok);
  for (let guard = 0; guard < 2e6 && s.phase !== 'over'; guard++) {
    if (s.phase !== 'end') autoStep(s);
    else if (s.season >= seasons || (!act(s, { type: 'nextSeason' }).ok && !closeYear(s))) break;
  }
  return s;
}
const rest = ({ days, actions, actionsFrom, ...x }) => plain(x);
const json = (x) => JSON.parse(JSON.stringify(x));

test("a long keep's save keeps its last two years of days and actions, and plays on the same", () => {
  // The third year's spring: years 2 and 3 are kept. The first keep from seed 3 on that gets there (the rules'
  // balance decides which: phase 7's changed it).
  let s = null;
  for (let seed = 3; seed < 30 && !(s?.season === 9 && s.phase === 'end'); seed++) s = years(seed, 9);
  assert.equal(s.season, 9);
  assert.equal(s.phase, 'end');
  const store = fakeStore();
  const index = openIndex(store, 0);
  assert.ok(saveSlot(store, index, 1, s, 1));
  const g = loadSlot(store, 1);
  assert.equal(g.actionsFrom, 5);
  assert.deepEqual(g.days, json(s.days.filter((d) => d.season >= 5)));
  assert.ok(g.days.length > 30 && g.days.length < s.days.length);
  assert.deepEqual(g.actions, json(s.actions.filter((x) => x.at.season >= 5 || x.a.type === 'tune')));
  assert.ok(g.actions.some((x) => x.at.season === 1), 'the number set in Settings on the first day stays');
  assert.deepEqual(playerTuning(g), playerTuning(s));
  assert.ok(store.m.get(slotKey(1)).length < JSON.stringify(s).length * 0.8, 'the save is smaller');
  // Nothing the rules read went: both play the next season alike.
  assert.deepEqual(rest(g), rest(s));
  for (const k of [s, g]) {
    assert.ok(act(k, { type: 'nextSeason' }).ok);
    for (let i = 0; i < 3000; i++) autoStep(k);
  }
  assert.deepEqual(rest(g), rest(s));
  // Saved again, it cuts no further until the next year.
  assert.equal(trimSave(g), g);
});

test('a keep in its first two years, or in a campaign chapter, keeps everything', () => {
  const s = newSeason(5);
  s.season = 8;
  assert.equal(trimSave(s), s, 'the second year');
  const c = newSeason(5, { campaign: 1 });
  c.season = 16;
  assert.equal(chapterOf(c), 4);
  assert.equal(trimSave(c), c, 'a chapter can be begun again from the first day');
  c.campaign.ending = 'watch';
  c.season = 24;
  assert.equal(chapterOf(c), 0);
  assert.equal(trimSave(c).actionsFrom, 17, 'after the ending, as the open year');
});

test("an export of a trimmed keep says it can't be played back", () => {
  const s = played(51, 2);
  const exp = { game: 'afterglass-season', save: SAVE_VERSION, seed: s.seed, now: {}, tuning0: s.tuning0, tuning: s.tuning, actions: s.actions };
  assert.equal(keepFromFile(JSON.stringify({ ...exp, actionsFrom: 1 })).error, undefined);
  assert.equal(keepFromFile(JSON.stringify({ ...exp, actionsFrom: 5 })).error, CANT_REPLAY);
  assert.equal(readExport({ ...exp, actionsFrom: 5 }).error, CANT_REPLAY);
  assert.ok(readExport({ ...exp, actionsFrom: 1 }).x);
});

test("a keep that isn't a playtest saves only the last of its trail; a tester's keeps all of it (round seven)", () => {
  const s = newSeason(9);
  s.trail = Array.from({ length: 1500 }, (_, i) => ({ k: 'panel', at: { season: 1, day: 1, phase: 'day', t: i }, w: i }));
  const store = fakeStore();
  const index = openIndex(store, 0);
  assert.ok(saveSlot(store, index, 1, s, 1));
  const g = loadSlot(store, 1);
  assert.equal(g.trail.length, KEPT_TRAIL);
  assert.equal(g.trail[KEPT_TRAIL - 1].w, 1499, 'the latest kept');
  s.test = { name: 'Sam', sent: false };
  assert.ok(saveSlot(store, index, 1, s, 2));
  assert.equal(loadSlot(store, 1).trail.length, 1500);
});

test('a file whose numbers aren\'t numbers, or whose export replays measurement actions, is refused (round seven)', () => {
  const s = played(51, 2);
  const exp = { game: 'afterglass-season', save: SAVE_VERSION, seed: s.seed, now: {}, tuning0: s.tuning0, tuning: s.tuning, actions: s.actions, seasons: [{ season: 1, answer: null, note: '' }] };
  assert.equal(keepFromFile(JSON.stringify(exp)).error, undefined);
  const bad = [
    { ...exp, seasons: [{ season: '<i id="x">1</i>', answer: null }] },
    { ...exp, tuning0: { ...exp.tuning0, cracksMax: '5" onfocus="x' } },
    { ...exp, actions: [...exp.actions, { a: { type: 'debug', what: 'give', res: 'candles', n: 99 }, at: { season: 1, day: 1, phase: 'day', t: 0 } }] },
  ];
  for (const x of bad) {
    assert.equal(keepFromFile(JSON.stringify(x)).error, BAD_FILE);
    assert.equal(readExport(x).error, BAD_FILE);
  }
  const save = JSON.parse(JSON.stringify(s));
  assert.equal(keepFromFile(JSON.stringify(save)).error, undefined);
  assert.equal(keepFromFile(JSON.stringify({ ...save, tuning: { ...save.tuning, hardness: '1.2<b>' } })).error, BAD_FILE);
  assert.equal(keepFromFile(JSON.stringify({ ...save, res: { ...save.res, food: 'lots' } })).error, BAD_FILE);
});
