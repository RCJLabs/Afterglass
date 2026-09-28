// Save slots for the season: SLOTS keeps in the browser's storage, each under its own key, with a small
// index of summaries so the list of keeps never has to read a whole save. Pure apart from the store passed
// in ({ get(key), set(key, value) → true if written, remove(key) }), so it can be tested without a browser.

import { SAVE_VERSION, upgrade, replay, canWork, yearOf, chapterOf } from './sim.js';
import { SEASONS } from './data.js';

export const SLOTS = 3;
export const OLD_KEY = 'afterglass-season/save/v1'; // the single save from before there were slots
const INDEX_KEY = 'afterglass-season/slots/v1';
export const slotKey = (n) => `afterglass-season/slot/${n}/v1`;

// What the list shows for a keep.
export function summary(s, now) {
  return {
    season: s.season,
    day: s.day,
    phase: s.phase,
    rooms: s.keep.floors.flat().filter((r) => r.type !== 'empty').length,
    living: s.living.length,
    shades: s.shades.filter((d) => canWork(d) || d.deep || d.hidden).length, // one down in the Deep, or hidden away, is still one of them
    lost: s.phase === 'over',
    sealed: !!s.sealed,
    opened: !!s.opened,
    chapter: s.tuning?.campaign && s.tuning?.year && !s.campaign?.ending ? Math.min(5, Math.floor((s.season - 1) / 4) + 1) : 0,
    daily: s.daily || null,
    preset: s.preset || null,
    custom: !!s.custom,
    tutorial: !!s.tuning?.tutorial,
    tutorialOver: !!(s.tut?.over || s.tut?.off),
    saved: now,
  };
}

// The index, moving the old single save into slot 1 the first time.
export function openIndex(store, now) {
  let index = store.get(INDEX_KEY);
  if (index && typeof index.current === 'number' && index.slots) return index;
  index = { current: 1, slots: {} };
  const old = store.get(OLD_KEY);
  if (isSave(old) && store.set(slotKey(1), old)) {
    index.slots[1] = summary(upgrade(structuredClone(old)), now);
    store.remove(OLD_KEY);
  }
  store.set(INDEX_KEY, index);
  return index;
}

export const isSave = (g) => !!g && g.v === SAVE_VERSION && g.mode === 'season' && Array.isArray(g.shades) && !!g.res;
export const isExport = (x) => !!x && x.game === 'afterglass-season' && Array.isArray(x.actions) && Number.isFinite(x.seed) && !!x.tuning0;
// The numbers an export's keep began with, brought up to this build as a save's are, so it replays.
export const exportTuning0 = (x) => upgrade({ tuning: { ...x.tuning0 }, tuning0: { ...x.tuning0 }, res: {} }).tuning0;

// A keep from a slot, brought up to this build, or null.
export function loadSlot(store, n) {
  const g = store.get(slotKey(n));
  return isSave(g) ? upgrade(g) : null;
}

// A long keep's save (README, problem 43). The Days tab's rows and the actions a playtest export replays grow
// by about 100 KB a year, the page writes the save every few seconds, and the browser gives the whole site
// about 5 MB. So a save keeps KEPT_YEARS years of both, this one and the one before, and every number the
// player set in Settings; actionsFrom is the first season whose actions it still holds, and an export with
// actionsFrom past 1 no longer replays. Nothing the rules read is dropped: they read this year's days, and the
// actions only to begin a chapter again, which is why a campaign keep in its chapters keeps everything.
export const KEPT_YEARS = 2;
// The page's trail of what the player did (paused, opened a panel, sat idle) matters only to a playtest: a keep
// that isn't one saves its last KEPT_TRAIL events of it, where a tester's keeps all 4,000 (round seven's audit
// found the trail, about 430 KB, riding untrimmed in every save).
export const KEPT_TRAIL = 600;
export function trimSave(s) {
  let g = s;
  const from = (yearOf(s) - KEPT_YEARS) * SEASONS.length + 1;
  if (from > (s.actionsFrom || 1) && !chapterOf(s)) {
    g = {
      ...s,
      days: s.days.filter((d) => d.season >= from),
      actions: s.actions.filter((x) => x.at.season >= from || x.a.type === 'tune'),
      actionsFrom: from,
    };
  }
  if (!s.test && s.trail?.length > KEPT_TRAIL) g = { ...g, trail: s.trail.slice(-KEPT_TRAIL) };
  return g;
}
// Whether an export still holds every action since the first day, so it replays.
export const replays = (x) => !(x.actionsFrom > 1);
export const CANT_REPLAY = "That export can't be played back: its keep ran past two years, and a save keeps only its last two years of actions.";

// Writes a keep to a slot and its line in the index. False if the browser wouldn't store it.
export function saveSlot(store, index, n, s, now) {
  if (!store.set(slotKey(n), { ...trimSave(s), alerts: [], cues: undefined })) return false;
  index.slots[n] = summary(s, now);
  return store.set(INDEX_KEY, index);
}

// Another tab wrote the index (the page hears it as a storage event): take its list of keeps, so a slot
// filled there is never offered here as empty. This tab's own keep keeps its own line.
export function mergeIndex(store, index) {
  const fresh = store.get(INDEX_KEY);
  if (!fresh?.slots) return false;
  const mine = index.slots[index.current];
  index.slots = { ...fresh.slots };
  if (mine) index.slots[index.current] = mine;
  return true;
}
export const isIndexKey = (key) => key === INDEX_KEY;

export function useSlot(store, index, n) {
  index.current = n;
  store.set(INDEX_KEY, index);
}

// A spare of the keep in play, as it stood when its last day began: what's left when something goes wrong
// (round seven), however the keep was saved since. One for the keep in play, told apart by its slot and seed.
const SPARE_KEY = 'afterglass-season/spare/v1';
export function saveSpare(store, n, s) {
  return store.set(SPARE_KEY, { n, seed: s.seed, save: { ...trimSave(s), alerts: [], cues: undefined } });
}
export function loadSpare(store, n, seed) {
  const x = store.get(SPARE_KEY);
  return x && x.n === n && (seed === undefined || x.seed === seed) && isSave(x.save) ? x.save : null;
}

export function deleteSlot(store, index, n) {
  if (store.get(SPARE_KEY)?.n === n) store.remove(SPARE_KEY);
  store.remove(slotKey(n));
  delete index.slots[n];
  store.set(INDEX_KEY, index);
}

// A file from outside is checked before it's trusted (round seven's audit): its numbers are numbers (the
// rules' tuning holds numbers, and lists and tables of them), its seasons are counted in whole numbers, and a
// playtest export replays only actions a player can take, not the measurement's own.
const numberish = (v, depth = 0) => (typeof v === 'number' && Number.isFinite(v)) || (depth < 2 && !!v && typeof v === 'object' && Object.values(v).every((x) => numberish(x, depth + 1)));
const saneTuning = (t) => t == null || (typeof t === 'object' && !Array.isArray(t) && Object.values(t).every((v) => numberish(v)));
const saneSeasons = (list) => list == null || (Array.isArray(list) && list.every((e) => e && Number.isInteger(e.season)));
export const BAD_FILE = "That file isn't a keep this game can trust: some of what should be numbers in it aren't.";
export function saneSave(g) {
  return saneTuning(g.tuning) && saneTuning(g.tuning0) && numberish(g.res) && Number.isInteger(g.season) && Number.isInteger(g.day) && saneSeasons(g.seasons);
}
export function saneExport(x) {
  return (
    saneTuning(x.tuning0) &&
    saneTuning(x.tuning) &&
    saneSeasons(x.seasons) &&
    x.actions.every((e) => e && e.a && typeof e.a.type === 'string' && e.a.type !== 'debug' && e.at && Number.isInteger(e.at.season))
  );
}

// A keep from a file: a save as the page writes it, or a playtest export, which is rebuilt by replaying its
// seed and actions (an export from before seasons started from two rooms started with the full keep).
export function keepFromFile(text) {
  let x;
  try {
    x = JSON.parse(text);
  } catch {
    return { error: "That file isn't a keep: it isn't JSON." };
  }
  if (isSave(x)) return saneSave(x) ? { s: upgrade(x) } : { error: BAD_FILE };
  if (isExport(x)) {
    if (!saneExport(x)) return { error: BAD_FILE };
    if (!replays(x)) return { error: CANT_REPLAY };
    try {
      const g = replay(x.seed >>> 0, exportTuning0(x), x.actions);
      if (typeof x.daily === 'string') g.daily = x.daily; // a day's keep stays that day's
      // A playtest goes on as one: its trail and answers come with it.
      if (Array.isArray(x.trail)) g.trail = x.trail;
      if (x.test) g.test = x.test;
      return { s: g };
    } catch (e) {
      return { error: `That export didn't replay: ${e.message}` };
    }
  }
  return { error: "That file isn't an Afterglass keep or a playtest export." };
}
