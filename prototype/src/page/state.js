// The page's state: storage, preferences, the keeps' slots and the Hall, the keep in play, sound, and ui.

import { BUILD } from '../build.js';
import { MAP } from '../slice/data.js';
import { geo } from '../slice/geo.js';
import { openHall, shrinkHall, HALL_KEY } from '../slice/hall.js';
import { openIndex, loadSlot, saveSlot, mergeIndex, isIndexKey } from '../slice/saves.js';
import { newSeason, retune, keepDefaults } from '../slice/sim.js';
import { createSound, SOUNDS } from '../slice/sound.js';
import { KEY } from '../slice/keys.js';

const PREF_KEY = `${KEY}/prefs/v1`;
export const SYS_REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const { W, VEIL } = MAP;

export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Storage blocked or full: the season still runs, it just won't resume after a reload.
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do: blocked storage has nothing to remove either.
    }
  },
};

export const prefs = {
  speed: 1, mode: 'reflection', labels: true, tab: 'log', autoPause: true, introDone: false, guide: true, guideSeen: {}, sound: true, sfx: 0.8, amb: 0.5, haptics: true,
  ...(store.get(PREF_KEY) || {}),
};
export const savePrefs = () => store.set(PREF_KEY, prefs);
// The developer's tools (round seven, phase 2): the playtest question and export, the replay viewer and the
// rules' numbers in Settings are for a tester's keep, or for ?dev on the address, which this device then
// remembers (?dev=0 forgets it). Players see none of them.
{
  const q = new URLSearchParams(location.search);
  if (q.has('dev')) {
    prefs.dev = q.get('dev') !== '0';
    savePrefs();
  }
}
// Less motion: the device's setting, unless the player chose in Settings.
export const REDUCED_NOW = () => (prefs.motion === 'reduce' ? true : prefs.motion === 'full' ? false : SYS_REDUCED);
// The stylesheets' animations follow the same choice.
export const applyMotion = () => {
  document.documentElement.dataset.motion = REDUCED_NOW() ? 'reduce' : 'full';
};
applyMotion();

// Sound (src/slice/sound.js) and vibration. Browsers start sound only from a tap or a key; phones that can't
// vibrate for a web page (iPhones and iPads) simply don't.
export const sound = createSound();
sound.set({ on: prefs.sound, fx: prefs.sfx, amb: prefs.amb });
for (const type of ['pointerup', 'touchend', 'keydown']) document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => sound.hide(document.hidden));
export const CAN_BUZZ = typeof navigator.vibrate === 'function';
let buzzAt = 0;
export function buzz(pattern) {
  if (!pattern || !prefs.haptics || !CAN_BUZZ) return;
  const now = performance.now();
  // Small buzzes (a candle, a post) at most every 150 ms; big ones (a crack, a death) always.
  if (pattern.reduce((a, b) => a + b, 0) < 100 && now - buzzAt < 150) return;
  buzzAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw instead of ignoring a vibration they won't make.
  }
}
// A cue's sound, panned to where it happened, and its vibration.
export const heard = []; // the last sounds played, for the checks
export function sfx(name, x) {
  const pan = x === undefined ? 0 : Math.max(-0.7, Math.min(0.7, (x / W) * 1.4 - 0.7));
  if (sound.play(name, { pan }) && heard.push(name) > 60) heard.shift();
  buzz(SOUNDS[name]?.haptic);
}
// The sim reports cues only to a keep that listens.
export const listen = (g) => {
  g.cues = [];
  return g;
};

// The keeps: three save slots (src/slice/saves.js). The page opens the one played last.
export const saves = openIndex(store, Date.now());
// The Hall of Keepers (round seven, phase 16; hall.js): every keep played, kept when its slot is reused.
export const hall = openHall(store);
export let retuned = 0;
export const setRetuned = (v) => (retuned = v);
export function loadGame(n) {
  // Brought up to this build as it loads: what an older save predates, it gets (that's how the Maws reach
  // older saves), and a save from before seasons started from two rooms keeps the whole original keep.
  const g = loadSlot(store, n);
  if (!g) return null;
  g.alerts = [];
  // Numbers the player never set in Settings follow this build's defaults, except those the keep was made with.
  retuned = retune(g, keepDefaults(g));
  return g;
}
window.addEventListener('storage', (e) => {
  if (e.key === HALL_KEY) {
    Object.assign(hall, openHall(store)); // another tab wrote the Hall
    bump();
  }
  if (isIndexKey(e.key) && mergeIndex(store, saves)) bump();
});
export let saveWarned = false;
export const setSaveWarned = (v) => (saveWarned = v);
// Whether the player has done anything since the keep was last saved: the page saves on being hidden only
// then (or while the clock runs), so a page left alone never writes over a keep another tab has saved.
export let dirty = false;
export const setDirty = (v) => (dirty = v);
// Something went wrong (round seven): from then on nothing is saved, so the keep stays as it was last saved
// before it, and a panel offers the file, the morning's spare and a reload (crash(), under the frame loop).
export let crashed = null;
export const setCrashed = (v) => (crashed = v);
export function saveGame() {
  if (ui.watch || crashed) return; // the session being watched is never saved, nor a keep after something broke
  dirty = false;
  s.build = BUILD;
  // The Hall gives up its cards' images before a keep goes unsaved.
  if (saveSlot(store, saves, saves.current, s, Date.now()) || (shrinkHall(store, hall) && saveSlot(store, saves, saves.current, s, Date.now())) || saveWarned) return;
  saveWarned = true;
  toast("The keep couldn't be saved: this browser's storage is full or blocked. Export it from Menu, then Saves.", 'bad');
}

// A keep that throws as it loads is left in its slot as it is, and the page says so once it's up.
export let bootError = null;
export let s;
export const setS = (v) => (s = v);
try {
  s = listen(loadGame(saves.current) || newSeason());
} catch (e) {
  bootError = e;
  s = listen(newSeason());
}
// This keep's geometry (it grows as rooms are built), and the top row of its roof.
export const K = () => geo(s);
export const roofTop = () => K().top - 24;
export const ui = {
  paused: true, rev: 0, tool: 'move', selected: null, person: null, hover: null, toasts: [], toastRev: 0, confirmNew: false,
  copied: '', showExport: false, rush: false, skip: null, flash: 0, scale: 3, sheet: null, cross: null, open: {}, kb: null,
  reading: new Set(),
};
export const bump = () => {
  ui.rev++;
};
export const devMode = () => !!prefs.dev || !!ui.devLink;
export const playtesting = () => devMode() || !!s.test;
export const running = () => s.phase === 'day' || s.phase === 'night';
// The castle shows the living keep by day and at the season's end; the Tain from dusk to dawn.
// The crossing at dusk keeps the living keep in view (sunset, lights out, the dead on the slab) until the
// dead have crossed; only then does the camera go down into the Tain.
export const nightView = () => {
  if (s.phase === 'day' || s.phase === 'end') return false;
  if (s.phase === 'dusk' && (ui.cross || s.dusk.step === 'crypt')) return false;
  return true;
};
// The eclipse (round six): noon on midsummer, when the day goes on and the Tain wakes with it. The castle shows
// both halves at once, the keep above the Veil and the Tain below, and a tap on either acts there.
export const eclipseNow = () => s.phase === 'day' && !!s.eclipse;
// The castle's view: the keep by day, the Tain by night, or both in the eclipse.
export const viewMode = () => (eclipseNow() ? 'both' : nightView() ? 'night' : 'day');


let toastSeq = 0;
export function toast(text, tone = '', open = null) {
  ui.toasts.push({ id: ++toastSeq, text, tone, open, until: performance.now() + 5500 });
  const room = window.innerWidth < 600 ? 2 : 3;
  if (ui.toasts.length > room) ui.toasts.splice(0, ui.toasts.length - room);
  ui.toastRev++;
}
