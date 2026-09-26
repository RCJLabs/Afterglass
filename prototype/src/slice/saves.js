// Save slots for the season: SLOTS keeps in the browser's storage, each under its own key, with a small
// index of summaries so the list of keeps never has to read a whole save. Pure apart from the store passed
// in ({ get(key), set(key, value) → true if written, remove(key) }), so it can be tested without a browser.

import { SAVE_VERSION, upgrade, replay, canWork } from './sim.js';

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
    shades: s.shades.filter(canWork).length,
    lost: s.phase === 'over',
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

// A keep from a slot, brought up to this build, or null.
export function loadSlot(store, n) {
  const g = store.get(slotKey(n));
  return isSave(g) ? upgrade(g) : null;
}

// Writes a keep to a slot and its line in the index. False if the browser wouldn't store it.
export function saveSlot(store, index, n, s, now) {
  if (!store.set(slotKey(n), { ...s, alerts: [], cues: undefined })) return false;
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

export function deleteSlot(store, index, n) {
  store.remove(slotKey(n));
  delete index.slots[n];
  store.set(INDEX_KEY, index);
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
  if (isSave(x)) return { s: upgrade(x) };
  if (isExport(x)) {
    const t0 = upgrade({ tuning: { ...x.tuning0 }, tuning0: { ...x.tuning0 }, res: {} }).tuning0;
    try {
      return { s: replay(x.seed >>> 0, t0, x.actions) };
    } catch (e) {
      return { error: `That export didn't replay: ${e.message}` };
    }
  }
  return { error: "That file isn't an Afterglass keep or a playtest export." };
}
