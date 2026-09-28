// Weeks 7–10 slice UI: one season in one keep. The castle fills the screen; a HUD sits on top, an action
// bar at the bottom, and everything else opens in a panel over the castle. Like the greyboxes it changes
// the game only through act(), so every session replays from its seed and action log.

import { TICKS_PER_SEC, DAY_ROOMS, WORK_ROOMS, TWINS, KINDS, MIRRORS, CAUSES, MAP, BOND_OTHER, TUNING, BUILDABLE, TRAITS, SHADE_TRAITS, SEASONS, TUTORIAL, REQUESTS, PRESETS, ACTS, OMENS, VISITORS, STUDIES, DECREES, decreeDoes, CHAPTERS, ENDINGS } from './slice/data.js';
import {
  newSeason, step, act, retune, playerTuning, jobCap, jobCount, nextSlot, ritePreview, crossingPreview, capacity, canWork, defense, roomPower, bear, priests, funeralCap, eatRate,
  dayTicks, nightTicks, isNewMoon, choicesFor, byId, isTwinnedLiving, isTwinnedShade, lastSeason, SAVE_VERSION, fmt, mirrorCap, bareHalls, tainPlace,
  postRoom, wardCost, wardDrawOf, wardHoldOf, hollowNeed, yearRate, raidsAhead, shadeTrait, peopleIn, beds, tradeOf, inGreatGlass, handsAt, whispers, stepsThrough, perf,
  seasonIndex, seasonName, yearOf, dayLength, isLongNight, tributeOf, besieged, sallyOdds, plagueSeason, atGate, gateGuard,
  weatherOf, forecastOf, raining, foggy, drownedDue, keepDefaults, embargoed, inquisition, churchDaysLeft, crusadeDay, crusadeDaysLeft,
  actOf, actCost, canAct, acting, actText, omenText, nextMark, SKIP_LEAD, visitorBlock,
  raiseCost, buildSpot, NEW_ROOMS, learned, decreeOf, gatehouseOf, undergateOpen, laddersDue, actsFor, mirrorGlass, pitchOf,
  eclipseDue, eclipseSpan, bondedShade, chapterOf, campaignOn, chapterAgain, boonNow, arrived,
} from './slice/sim.js';
import { geo, feet, floorAtY, roomAt, typeAt, typeOf, roomSpan, roomsOf, lightMap, isLit, unitAt, DEEP_FLOOR, lineSpots as lineOf, guardLit, MAX_FLOORS } from './slice/geo.js';
import { drawScene, drawMoment } from './slice/draw.js';
import { threats } from './slice/threats.js';
import { recapOf } from './slice/recap.js';
import { newDaily, dayKey, dayText } from './slice/daily.js';
import { newTutorial, isTutorial } from './slice/tutorial.js';
import { howTo } from './slice/howto.js';
import { drawCard, cardFonts } from './slice/card.js';
import { epitaph, ordinal, RESTING, LOST } from './slice/book.js';
import { SLOTS, slotKey, openIndex, loadSlot, saveSlot, useSlot, deleteSlot, keepFromFile, summary, mergeIndex, isIndexKey, saveSpare, loadSpare } from './slice/saves.js';
import { BUILD } from './build.js';
import { createSound, SOUNDS } from './slice/sound.js';
import { readExport, indexOf, advance, seek, cloneCursor } from './slice/watch.js';

const PREF_KEY = 'afterglass-season/prefs/v1';
const SYS_REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const { W, VEIL } = MAP;

const store = {
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

const prefs = {
  speed: 1, mode: 'reflection', labels: true, tab: 'log', autoPause: true, introDone: false, guide: false, guideSeen: {}, sound: true, sfx: 0.8, amb: 0.5, haptics: true,
  ...(store.get(PREF_KEY) || {}),
};
const savePrefs = () => store.set(PREF_KEY, prefs);
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
const REDUCED_NOW = () => (prefs.motion === 'reduce' ? true : prefs.motion === 'full' ? false : SYS_REDUCED);
// The stylesheets' animations follow the same choice.
const applyMotion = () => {
  document.documentElement.dataset.motion = REDUCED_NOW() ? 'reduce' : 'full';
};
applyMotion();

// Sound (src/slice/sound.js) and vibration. Browsers start sound only from a tap or a key; phones that can't
// vibrate for a web page (iPhones and iPads) simply don't.
const sound = createSound();
sound.set({ on: prefs.sound, fx: prefs.sfx, amb: prefs.amb });
for (const type of ['pointerup', 'touchend', 'keydown']) document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => sound.hide(document.hidden));
const CAN_BUZZ = typeof navigator.vibrate === 'function';
let buzzAt = 0;
function buzz(pattern) {
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
const heard = []; // the last sounds played, for the checks
function sfx(name, x) {
  const pan = x === undefined ? 0 : Math.max(-0.7, Math.min(0.7, (x / W) * 1.4 - 0.7));
  if (sound.play(name, { pan }) && heard.push(name) > 60) heard.shift();
  buzz(SOUNDS[name]?.haptic);
}
// The sim reports cues only to a keep that listens.
const listen = (g) => {
  g.cues = [];
  return g;
};

// The keeps: three save slots (src/slice/saves.js). The page opens the one played last.
const saves = openIndex(store, Date.now());
let retuned = 0;
function loadGame(n) {
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
  if (isIndexKey(e.key) && mergeIndex(store, saves)) bump();
});
let saveWarned = false;
// Whether the player has done anything since the keep was last saved: the page saves on being hidden only
// then (or while the clock runs), so a page left alone never writes over a keep another tab has saved.
let dirty = false;
// Something went wrong (round seven): from then on nothing is saved, so the keep stays as it was last saved
// before it, and a panel offers the file, the morning's spare and a reload (crash(), under the frame loop).
let crashed = null;
function saveGame() {
  if (ui.watch || crashed) return; // the session being watched is never saved, nor a keep after something broke
  dirty = false;
  s.build = BUILD;
  if (saveSlot(store, saves, saves.current, s, Date.now()) || saveWarned) return;
  saveWarned = true;
  toast("The keep couldn't be saved: this browser's storage is full or blocked. Export it from Menu, then Saves.", 'bad');
}

// A keep that throws as it loads is left in its slot as it is, and the page says so once it's up.
let bootError = null;
let s;
try {
  s = listen(loadGame(saves.current) || newSeason());
} catch (e) {
  bootError = e;
  s = listen(newSeason());
}
// This keep's geometry (it grows as rooms are built), and the top row of its roof.
const K = () => geo(s);
const roofTop = () => K().top - 24;
const ui = {
  paused: true, rev: 0, tool: 'candle', selected: null, person: null, hover: null, toasts: [], toastRev: 0, confirmNew: false,
  copied: '', showExport: false, rush: false, skip: null, flash: 0, scale: 3, sheet: null, cross: null, open: {}, kb: null,
};
const bump = () => {
  ui.rev++;
};
const devMode = () => !!prefs.dev || !!ui.devLink;
const playtesting = () => devMode() || !!s.test;
const running = () => s.phase === 'day' || s.phase === 'night';
// The castle shows the living keep by day and at the season's end; the Tain from dusk to dawn.
// The crossing at dusk keeps the living keep in view (sunset, lights out, the dead on the slab) until the
// dead have crossed; only then does the camera go down into the Tain.
const nightView = () => {
  if (s.phase === 'day' || s.phase === 'end') return false;
  if (s.phase === 'dusk' && (ui.cross || s.dusk.step === 'crypt')) return false;
  return true;
};
// The eclipse (round six): noon on midsummer, when the day goes on and the Tain wakes with it. The castle shows
// both halves at once, the keep above the Veil and the Tain below, and a tap on either acts there.
const eclipseNow = () => s.phase === 'day' && !!s.eclipse;
// The castle's view: the keep by day, the Tain by night, or both in the eclipse.
const viewMode = () => (eclipseNow() ? 'both' : nightView() ? 'night' : 'day');

/* ---------------------------------------------------------------- words */

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const upper = (x) => x.charAt(0).toUpperCase() + x.slice(1);
// Traits in words, shown only while they're on: a living one's, and a shade's with what it was in life.
const traitsOn = () => !!s.tuning.traits;
const livingTraitText = (p) => (traitsOn() && TRAITS[p.trait] ? `<div class="ptrait"><b>${TRAITS[p.trait].name}</b>: ${esc(TRAITS[p.trait].short)}</div>` : '');
const shadeTraitText = (d) => (traitsOn() && SHADE_TRAITS[d.trait] ? `<small class="strait"><b>${SHADE_TRAITS[d.trait].name}</b>${TRAITS[d.was] ? ` (${TRAITS[d.was].name} in life)` : ''}: ${esc(SHADE_TRAITS[d.trait].short)}</small>` : '');
const wakesAs = (b) => (traitsOn() && TRAITS[b.was] ? SHADE_TRAITS[TRAITS[b.was].dead].name : '');
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const floor1 = (x) => String(Math.floor(x + 1e-9));
const PH = { day: 'is-day', dusk: 'is-dusk', night: 'is-night', dawn: 'is-rite', end: 'is-rite', over: 'is-fallen' };
// A room's name by day or by night, given its id (or its type).
const roomName = (id, night) => {
  const type = typeOf(K(), id) || id;
  return night ? TWINS[type].name : DAY_ROOMS[type].name;
};
const nightNow = () => s.phase === 'dusk' || s.phase === 'night' || s.phase === 'dawn' || s.phase === 'over';

function hhmm(h) {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.floor(((x - hh) * 60) / 10) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function clockText() {
  if (s.phase === 'day') return hhmm(6 + (12 * s.t) / dayTicks(s));
  if (s.phase === 'night') return hhmm(18 + (12 * s.t) / nightTicks(s));
  return s.phase === 'dusk' ? '18:00' : '06:00';
}
// How much longer the Long Night is than a winter night, in words.
const longTimes = () => (s.tuning.longNight === 2 ? 'twice' : `${fmt(s.tuning.longNight)} times`);
// The season's name, capitalised, with the year on; else null.
const seasonWord = () => (s.tuning.year ? seasonName(s)[0].toUpperCase() + seasonName(s).slice(1) : null);
function phaseLabel() {
  const D = s.tuning.seasonDays;
  const S = seasonWord();
  return {
    day: S ? `${S}, day ${s.day} of ${D}` : `Day ${s.day} of ${D}`,
    dusk: `Dusk, day ${s.day}`,
    night: isLongNight(s) ? 'The Long Night' : isNewMoon(s) ? 'New moon' : `Night ${s.day}`,
    dawn: s.day === 0 ? (S ? `${S}, year ${yearOf(s)}` : `Season ${s.season}`) : `Dawn, day ${s.day + 1}`,
    end: s.opened ? 'The Veil is open' : s.sealed ? 'The Veil is sealed' : S ? (seasonIndex(s) === 3 ? 'The year is over' : `${S} is over`) : `Season ${s.season} over`,
    over: 'Keep lost',
  }[s.phase];
}
// What the season does to the day and the night, next to spring's.
function seasonNote() {
  const T = s.tuning;
  if (!T.year) return '';
  const i = seasonIndex(s);
  const d = T.seasonDay[i];
  const n = T.seasonNight[i];
  const text = [
    `Spring, year ${yearOf(s)}. Summer's days will be longer and its nights shorter; winter's the other way, and it ends with the Long Night.`,
    `Summer: the days are ×${d} as long, and so is a day's work; the nights ×${n}. What you put by now carries the keep through winter.`,
    'Autumn: days and nights as in spring. Winter comes next.',
    `Winter: the days are ×${d} as long, and so is a day's work; the nights ×${n}, longer than a candle burns. The seventh night is the Long Night, and it ends the year.`,
  ][i];
  return `<p class="note">${text}</p>`;
}
const pips = (n, max, hot) => `<span class="pips${hot ? ' hot' : ''}" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const kindTag = (k) => `<span class="kind k-${k}">${KINDS[k].name}</span>`;

function shadeStatus(d, L) {
  if (d.deep) return `down in the Deep, ${DEPTH_NAMES[d.deep].toLowerCase()}, until dawn`;
  if (d.hidden) return 'hidden away with its mirror until the crusade is over';
  if (!canWork(d)) return d.kind === 'wraith' ? 'hunts in the Tain at night' : `Restless, ${s.tuning.restlessNights - d.restless} ${s.tuning.restlessNights - d.restless === 1 ? 'night' : 'nights'} from Wraith`;
  const room = typeAt(K(), d.f, d.x) || postRoom(s, d);
  if (s.phase !== 'night' && !eclipseNow()) return `posted in the ${roomName(postRoom(s, d), true)}`;
  if (d.grabbedBy) return 'caught!';
  if (acting(s, d, 'stand')) return 'standing its ground';
  if (acting(s, d, 'pass')) return 'passing unseen';
  if (acting(s, d, 'lure')) return 'luring the Unlit to it';
  if (d.climb) return 'on the stairs';
  if (d.path.length) return `walking to the ${roomName(postRoom(s, d), true)}`;
  if (s.night?.hush) return 'hushed';
  if (!isLit(L, d.f, d.x)) return `in the dark, ${roomName(room, true)}`;
  if (s.night.foes.some((c) => c.f === d.f && Math.abs(c.x - d.x) <= s.tuning.reach + 0.5)) return 'fighting';
  const job = TWINS[room].job;
  const at = Math.abs(d.post.x - d.x) <= 1.5 && d.post.f === d.f;
  if (s.tuning.lineGuard && job !== 'watch' && guardLit(K(), L, d.f, d.x)) return 'guarding the line';
  if (!at || !job) return `holding the light, ${roomName(room, true)}`;
  if (s.night.broken.includes(roomAt(K(), d.f, d.x))) return `in the broken ${roomName(room, true)}`;
  return { essence: 'singing in the Choir', glass: 'silvering glass', wick: 'saving wax', guidance: 'at the Threshold', watch: 'keeping watch', rest: 'resting by the Cold Hearth' }[job];
}


/* ---------------------------------------------------------------- the HUD */

// The tide clock (round six): the night from dusk to dawn, a mark for each tide, Maw, the Hollow, each of the
// Drowned and a sleepwalker's hour, and the night so far filling it.
const markTime = (m) => (s.phase === 'day' ? hhmm(6 + (12 * m.at) / dayTicks(s)) : hhmm(18 + (12 * m.at) / nightTicks(s)));
function markText(m) {
  const at = markTime(m);
  return {
    sun: () => `the sun back at ${at}`,
    tide: () => `a tide of ${m.count} at ${at}`,
    maw: () => `a Maw at ${at}`,
    hollow: () => `the Hollow at ${at}`,
    drowned: () => `one of the Drowned at ${at}`,
    sleeper: () => `a sleepwalker at ${at}`,
    dawn: () => 'dawn',
  }[m.kind]();
}
function tideClock() {
  const e = eclipseNow() && s.eclipse;
  const marks = (s.phase === 'night' || e) && s.night?.marks;
  if (!marks) return '';
  const [a, N] = e ? [e.from, e.to - e.from] : [0, nightTicks(s)];
  const label = e ? `The eclipse: ${esc(listOf(marks.map(markText)))}` : `Tonight: ${esc(listOf(marks.filter((m) => m.kind !== 'dawn').map(markText)))}, then dawn`;
  return `<div class="tclock${e ? ' eclipse' : ''}" role="img" aria-label="${label}">
    <i class="tfill" data-bar="tclock"></i>${marks.map((m) => `<b class="mk mk-${m.kind}" style="left:${((100 * (m.at - a)) / N).toFixed(2)}%" title="${esc(upper(markText(m)))}"></b>`).join('')}
  </div>`;
}

function hudHTML() {
  const T = s.tuning;
  const cap = capacity(s);
  const go = running() && !ui.paused;
  const res = (id, long, short, v, cap = 0) => `<div><dt><span class="long">${long}</span><span class="short">${short}</span></dt><dd><b data-live="${id}">${v}</b>${cap ? `<span class="cap">/${cap}</span>` : ''}</dd></div>`;
  return `<div class="ghud-row">
    <div class="clock ${eclipseNow() ? 'is-night' : PH[s.phase]}"><span class="pill">${eclipseNow() ? 'The eclipse' : phaseLabel()}</span><span class="time" data-live="clock">${clockText()}</span><span class="bar" aria-hidden="true"><i data-bar="clock"></i></span></div>
    <div class="gctl">${ui.watch ? `<span class="pill watching">Watching</span><button class="btn sm" id="w-exit-hud" data-act="w-exit">Exit</button>` : `
      <button class="btn sm" id="btn-play" data-act="play"${running() ? '' : ' disabled'}>${go ? 'Pause' : 'Play'}</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map((v) => `<button class="btn sm" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`).join('')}</div>
      ${s.phase === 'night' ? `<button class="btn sm" id="btn-skip" data-act="skip" aria-pressed="${!!ui.skip}" title="Skip ahead to the next mark on the tide clock, unless something happens first (N)"${ui.skip || nextMark(s) ? '' : ' disabled'}>${ui.skip ? 'Skipping…' : 'Skip'}</button>` : ''}`}
    </div>
  </div>
  ${tideClock()}
  <dl class="gres">
    ${res('food', 'Food', 'Food', floor1(s.res.food))}
    ${res('candles', 'Candles', 'Cand', floor1(s.res.candles))}
    ${res('glass', 'Glass', 'Glass', floor1(s.res.glass))}
    ${res('stone', 'Stone', 'Stone', floor1(s.res.stone || 0))}
    ${res('essence', 'Essence', 'Ess', floor1(s.res.essence), T.essenceCap)}
    ${res('rem', 'Remembrance', 'Rem', floor1(s.res.remembrance))}
    ${s.res.quicksilver ? res('qs', 'Quicksilver', 'QS', floor1(s.res.quicksilver)) : ''}
    <div><dt>Dread</dt><dd>${pips(s.dread, T.dreadMax, s.dread >= 4)}</dd></div>
    <div><dt>Veil</dt><dd>${pips(s.cracks, T.cracksMax, true)}</dd></div>
    <div><dt><span class="long">Living</span><span class="short">Liv</span></dt><dd><b>${s.living.length}</b></dd></div>
    <div><dt><span class="long">Shades</span><span class="short">Sh</span></dt><dd><b>${cap.used}</b>/${cap.cap}</dd></div>
    ${skyHUD()}
  </dl>`;
}
// The weather (round five): today's, and tomorrow's forecast.
const WX = { clear: 'Clear', rain: 'Rain', fog: 'Fog' };
function skyHUD() {
  if (!s.tuning.weather) return '';
  const now = weatherOf(s);
  const next = forecastOf(s);
  return `<div class="wx wx-${now}${next === 'rain' ? ' wx-coming' : ''}" title="Today: ${WX[now]}. Tomorrow: ${next ? WX[next] : 'not known yet'}."><dt>Sky</dt><dd><b>${WX[now]}</b>${next ? `<span class="fc">, then ${WX[next].toLowerCase()}</span>` : ''}</dd></div>`;
}

/* ---------------------------------------------------------------- the action bar */

// What needs the player now, for a dot on the panel button.
function attention() {
  const r = s.raid;
  if (s.phase === 'day') return !!((r && r.warned && r.state === 'coming' && defense(s) < r.strength) || (s.inspection && !s.inspection.done && s.inspection.day === s.day) || s.hungry || s.visitors?.some((v) => v.here && !v.done));
  if (s.phase === 'dusk') return s.dusk.step === 'crypt';
  return s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over';
}
const SHEET_NAME = () =>
  ({ day: 'Day', dusk: s.dusk?.step === 'crypt' ? 'Crossing' : 'Dusk', night: 'Night', dawn: 'Rite', end: 'Season', over: 'Lost' })[s.phase];

function barHTML() {
  if (ui.watch) return watchBarHTML();
  const place = s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place') || eclipseNow();
  const tool = (id, label) => `<button class="btn sm" id="tool-${id}" data-act="tool" data-tool="${id}" aria-pressed="${ui.tool === id}">${label}</button>`;
  const flip = `<button class="btn sm" id="btn-flip" data-act="flip" aria-pressed="${prefs.mode === 'flipped'}" title="Turn the Tain upright (V)">Flip</button>`;
  let tools = '';
  if (eclipseNow()) {
    tools = `${tool('candle', `Candle ${floor1(s.res.candles)}`)}${tool('move', 'Move')}${tool('ward', `Ward ${fmt(wardCost(s))}`)}`;
    const d = s.tuning.acts ? byId(s.shades, ui.selected) : null;
    const a = d && canWork(d) && actOf(d);
    if (a) tools += `<button class="btn sm act" id="btn-act" data-act="shade-act" data-id="${d.id}"${canAct(s, d) ? '' : ' disabled'} title="${ACTS[a].name} (A)">${ACTS[a].name}${(d.acted || 0) >= actsFor(s, d) ? ': spent' : ` −${fmt(actCost(s, d))}`}</button>`;
    tools += `<button class="btn sm" id="btn-build" data-act="sheet" data-sheet="build" aria-pressed="${ui.sheet === 'build'}" title="Raise, tear down or move a room (B)">Build</button>`;
  } else if (s.phase === 'day') {
    tools = `<button class="btn sm" id="btn-rush" data-act="rush" aria-pressed="${ui.rush}">${ui.rush ? 'Hurrying…' : 'Hurry to dusk'}</button>`;
    tools += `<button class="btn sm" id="btn-build" data-act="sheet" data-sheet="build" aria-pressed="${ui.sheet === 'build'}" title="Raise, tear down or move a room (B)">Build</button>`;
  }
  else if (s.phase === 'dusk' && s.dusk.step === 'crypt') tools = `<button class="btn sm primary" id="bar-wake" data-act="wake">Let them wake</button>`;
  else if (place) {
    tools = `${tool('candle', `Candle ${floor1(s.res.candles)}`)}${tool('move', 'Move')}${tool('ward', `Ward ${fmt(wardCost(s))}`)}`;
    tools += s.phase === 'night' ? `<button class="btn sm" id="btn-hush" data-act="hush" aria-pressed="${!!s.night?.hush}">Hush</button>` : '';
    const d = s.phase === 'night' && s.tuning.acts ? byId(s.shades, ui.selected) : null;
    const a = d && canWork(d) && actOf(d);
    if (a) tools += `<button class="btn sm act" id="btn-act" data-act="shade-act" data-id="${d.id}"${canAct(s, d) ? '' : ' disabled'} title="${ACTS[a].name} (A)">${ACTS[a].name}${(d.acted || 0) >= actsFor(s, d) ? ': spent' : ` −${fmt(actCost(s, d))}`}</button>`;
    const lit = s.tuning.lanterns ? byId(s.shades, ui.selected) : null;
    if (lit && canWork(lit)) {
      const held = s.night?.candles.some((k) => k.carrier === lit.id);
      tools += `<button class="btn sm" id="btn-lantern" data-act="lantern" data-id="${lit.id}"${held || s.res.candles >= 1 ? '' : ' disabled'} title="A lantern for ${esc(lit.name)} (T)">${held ? 'Set lantern down' : 'Lantern −1 candle'}</button>`;
    }
    tools += flip;
    if (s.phase === 'dusk') tools += `<button class="btn sm primary" id="bar-start" data-act="start">Begin the night</button>`;
  } else if (s.phase === 'dawn') {
    const P = ritePreview(s);
    tools = `${flip}<button class="btn sm primary" id="bar-day" data-act="begin-day"${P.errors.length ? ' disabled' : ''}>Begin day ${s.day + 1}</button>`;
  } else if (s.phase === 'over') tools = flip;
  const menu = [['phase', SHEET_NAME(), attention()], ['people', 'People', false], ['records', 'Records', false], ['menu', 'Menu', false]]
    .map(([k, label, dot]) => `<button class="btn sm gm" id="open-${k}" data-act="sheet" data-sheet="${k}" aria-pressed="${ui.sheet === k}" aria-controls="sheet">${label}${dot ? '<span class="dot" aria-label="needs you"></span>' : ''}</button>`)
    .join('');
  return `<div class="gtools ${eclipseNow() ? 'is-night' : PH[s.phase]}">${tools}</div><div class="gmenu">${menu}</div>`;
}

function hintText() {
  const T = s.tuning;
  if (ui.watch) return ui.watch.caption;
  if (ui.guide) return '';
  if (ui.cross) return ui.cross.stage === 'sunset' ? 'Dusk falls on the keep. Tap to skip.' : '';
  if (ui.sheet && !wide()) return '';
  if (s.phase === 'day') {
    const p = byId(s.living, ui.person);
    if (p) return `${p.name}: tap a room to put ${p.name} to work there.`;
    if (!eclipseNow()) return ui.rush ? '' : 'Jobs are in People. Or pick a name there, then tap a room.';
    if (!kbAt() && !ui.selected && ui.tool === 'move') return 'The eclipse: below the Veil, tap a shade to pick it, then where it should stand. The day goes on above.';
  }
  if (s.phase === 'dusk' && s.dusk.step === 'crypt') return 'The dead wake first. Choose funerals in the Crossing panel, or let them wake.';
  if (s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over') return '';
  if (kbAt()) return kbText();
  const d = byId(s.shades, ui.selected);
  if (ui.tool === 'candle') {
    return s.res.candles >= 1
      ? `${eclipseNow() ? 'The eclipse: tap a floor below the Veil' : 'Tap a floor'} to set a candle. It lights its own room; the Unlit can't enter the light.`
      : 'No candles left. The Chandlery makes them by day; the Wick Room saves them at night.';
  }
  if (ui.tool === 'ward') return `Tap a stair or a rift${raining(s) ? ", or an end of the moat's twin under the Veil," : ''} to seal it until dawn (${fmt(wardCost(s))} essence${wardCost(s) < T.wardCost ? ', cheaper while a Bitter shade stays' : ''}). The Hollow breaks a ward in ${T.wardHold} s.`;
  if (!d) return 'Tap a shade to pick it, then tap where it should stand.';
  if (s.phase === 'dusk') return `${d.name}: tap a spot to post ${d.name} there.`;
  const a = T.acts && actOf(d);
  const act = !a ? '' : (d.acted || 0) >= actsFor(s, d) ? ` Its ${actsFor(s, d) > 1 ? 'acts are' : 'act is'} spent tonight.` : ` ${ACTS[a].name} (A, −${fmt(actCost(s, d))} memory): ${actText(T, a)}.`;
  return `${d.name}: tap a spot to send ${d.name} there. The dark between is dangerous.${act}`;
}

function showHint() {
  const hint = hintText();
  const el = document.getElementById('stage-hint');
  if (el.textContent !== hint) el.textContent = hint;
}

/* ---------------------------------------------------------------- the phase panels */

function raidCard() {
  const r = s.raid;
  if (!r) {
    const next = Object.keys(s.tuning.raidDays).map(Number).find((d) => d > s.day && s.tuning.raidDays[d]);
    return next ? `<p class="note">No raid today. The Ashen Host is expected on day ${next}.</p>` : '';
  }
  const T = s.tuning;
  const def = defense(s);
  if (r.state === 'paid') return `<div class="card"><h3>The raid</h3><p>You paid the Host ${r.paid.food} food and ${r.paid.candles} candles, and they turned back. ${s.grudge ? `Next season's raids come ×${mult(s.grudge)} harder.` : raidsAhead(s) ? `The season's raids after this one come ×${mult(s.embolden || 1)} harder.` : 'It was the season\'s last raid.'}</p></div>`;
  if (r.crusade && (r.state === 'held' || r.state === 'breached')) {
    const C = s.today.crusade;
    const after = r.state === 'held' ? 'It turned for home, and the Lantern Church gave up: the embargo and the Inquisition are over.' : `They smashed ${C?.smashed ? plural(C.smashed, 'mirror') : 'no mirror: every one was hidden'}${C?.freed ? `, and ${plural(C.freed, 'shade')} went free` : ''}, and left the keep purged.`;
    return `<div class="card ${r.state === 'held' ? 'ok' : 'warn'}"><h3>The crusade</h3><p>${r.state === 'held' ? 'The gate held' : 'The crusaders broke in'}: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}. ${after}</p></div>`;
  }
  if (r.state === 'held') return `<div class="card ok"><h3>The raid</h3><p>The gate held: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}.</p></div>`;
  if (r.state === 'breached') {
    const k = r.loot;
    const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length;
    const chase = !k || !T.raidFight ? '' : r.pursued ? '<p>The guards went after them.</p>'
      : `<p>They carried off ${k.food} food, ${k.glass} glass and ${k.candles} candles. Guards sent after them would take back ${Math.round(100 * T.raidRecover)}% of it, and each has a ${Math.round(100 * T.raidPursueRisk)}% chance of not coming back.</p>
        <div class="row"><button class="btn sm" id="btn-pursue" data-act="pursue"${guards ? '' : ' disabled'}>${guards ? `Go after them (${plural(guards, 'guard')})` : 'No guards to send'}</button></div>`;
    return `<div class="card warn"><h3>The raid</h3><p>The raiders broke through: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}.</p>${chase}</div>`;
  }
  if (r.state === 'assault') return assaultCard(r);
  if (!r.warned) return `<div class="card"><h3>A raid today</h3><p>Scouts expect the Ashen Host before noon. Guards give ${DAY_ROOMS.barracks.rate} defense each; the Watch of the Dead adds what it kept last night${s.watchBonus ? ` (+${fmt(s.watchBonus)} today)` : ''}.</p><p class="num">Defense now ${fmt(def)}</p></div>`;
  const short = def + 1e-9 < r.strength;
  const t = tributeOf(s);
  const canPay = s.res.food + 1e-9 >= t.food && s.res.candles + 1e-9 >= t.candles;
  const fight = r.crusade ? `<p class="note">The crusade takes no tribute and wants none of the stores: it's the mirrors it's after. At the gate you'll have pitch (${T.raidPitchCost} candles for −${fmt(T.raidPitch)}), stone to shore it up, and the bell.</p>`
    : !T.raidFight ? '' : `<div class="row"><button class="btn sm" id="btn-payoff" data-act="payoff"${canPay ? '' : ' disabled'}>Pay them off: ${t.food} food, ${t.candles} candles</button>
      <button class="btn sm" id="btn-bar" data-act="bar-stores"${r.barred ? ' disabled' : ''}>${r.barred ? 'Stores barred' : 'Bar the stores'}</button></div>
    <p class="note">Paid, they turn back${raidsAhead(s) ? `, but the season's raids after it come ×${mult(T.raidEmbolden)} harder` : T.emboldenCarries ? `, but next season's raids come ×${mult(T.raidEmbolden)} harder` : ''}. Barred, the Hearth, the Chandlery and the Glazier stop while the Host is at the gate, and a breach carries off half as much. At the gate you'll have pitch (${T.raidPitchCost} candles for −${fmt(T.raidPitch)}), stone to shore it up, and the bell.</p>`;
  return `<div class="card ${short ? 'warn' : 'ok'}"><h3>${r.crusade ? 'The crusade on the road' : r.camp ? 'The camp comes at the gate' : 'Raiders on the road'}</h3>
    <p>${r.count} ${r.crusade ? 'knights of the Lantern' : 'raiders'}, strength <b class="num">${fmt(r.strength)}</b>, at the gate about ${hhmm(6 + (12 * r.hitAt) / dayTicks(s))}. Your defense: <b class="num" data-live="defense">${fmt(def)}</b>. ${short ? 'Not enough. Move people to the Barracks or ward the gate.' : 'Enough, if nothing changes.'}</p>${laddersDue(s) ? ladderNote(r) : ''}
    <div class="row"><button class="btn sm" id="btn-wardgate" data-act="wardgate"${r.ward || s.res.essence + 1e-9 < s.tuning.wardGateCost ? ' disabled' : ''}>${r.ward ? `Gate warded, +${r.ward}` : `Ward the gate: +${s.tuning.wardGateDefense} for ${s.tuning.wardGateCost} essence`}</button></div>${fight}</div>`;
}
const share = (x) => (x === 0.5 ? 'half' : `${mult(x)} times`);
// From summer the Host brings ladders: how many go up over the assault, and whether a gate guard is on the
// Gatehouse's walls to throw them down.
function ladderNote(r) {
  const T = s.tuning;
  const n = Math.floor((T.raidAssaultSecs - 1e-9) / T.ladderEvery);
  const manned = gatehouseOf(s) && s.living.some((p) => p.job === 'gatehouse' && !(p.sick > 0));
  const who = r.crusade ? 'The crusaders' : 'They';
  return `<p class="note${manned ? '' : ' bad'}">${who} bring ladders: about ${n} go up over the assault, each left standing adding ${fmt(T.ladderHost)} to their strength. ${manned ? 'A gate guard on the Gatehouse\'s walls will throw every one down.' : gatehouseOf(s) ? `Put a gate guard in the Gatehouse and every one is thrown down; with none, all would stand, +${fmt(n * T.ladderHost)}.` : `Only a Gatehouse's guards throw them down: without one, all would stand, +${fmt(n * T.ladderHost)}.`}</p>`;
}
// The weather by day: today's, and a warning a day ahead of rain.
function weatherNotes() {
  const T = s.tuning;
  if (!T.weather) return '';
  const now = weatherOf(s);
  const next = forecastOf(s);
  const out = [];
  if (now === 'rain') out.push(`<p class="note bad">Rain today. The Yard quarries at ${Math.round(100 * T.rainYard)}%, and a fire is ${share(T.rainFire)} as likely and grows ${share(T.rainFire)} as fast. ${drownedDue(s) ? `Tonight the Drowned come up out of the moat's twin${K().n > 1 ? ', behind the line' : ''}.` : 'The Drowned stay under tonight: the new moon belongs to the Hollow.'}</p>`);
  else if (now === 'fog') out.push("<p class=\"note\">Fog today. At dusk the black mirror will show how many come and when, but not their ways.</p>");
  if (next === 'rain' && !drownedDue(s, true)) out.push('<p class="note">Rain tomorrow. The Drowned will stay under: the new moon belongs to the Hollow.</p>');
  else if (next === 'rain') out.push(`<p class="note bad">Rain tomorrow. Tomorrow night the Drowned come up out of the moat's twin, on the floor under the Veil, and make for the mirrors${K().n > 1 ? ' from behind the line' : ''}. Keep ${fmt(wardCost(s))} essence to ward the moat, or a candle and a fighter for the mirror on their side.</p>`);
  else if (next) out.push(`<p class="note">Tomorrow: ${next === 'fog' ? 'fog' : 'clear'}.</p>`);
  return out.join('');
}
// Autumn's siege: how long the camp stays, what the shut gate costs, and the sally.
function siegeCard() {
  const g = s.siege;
  if (!g || s.phase !== 'day' || s.day < g.from || s.day > g.until) return '';
  if (g.broken) return '<p class="note">The camp is broken, and the gate is open.</p>';
  const T = s.tuning;
  const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length;
  const left = g.until - s.day + 1;
  return `<div class="card warn siege"><h3>The siege</h3><p>The Ashen Host is camped outside the walls, strength ${fmt(g.strength)}, ${left === 1 ? 'until tomorrow' : `for ${left} more days`}. The gate is shut: nobody quarries in the Yard, and no one new can come.</p>
    <div class="row"><button class="btn sm" id="btn-sally" data-act="sally"${guards && s.raid?.state !== 'assault' ? '' : ' disabled'}>${guards ? `Sally out: ${plural(guards, 'guard')}, about ${Math.round(100 * sallyOdds(s))}% to break the camp` : 'No guards to sally out'}</button></div>
    <p class="note">Broken, the Host scatters and the gate opens${s.raid?.camp && s.raid.state === 'coming' ? ", and today's assault is off" : ''}. Held, they fall back behind it. Either way, each guard has a ${Math.round(100 * T.raidPursueRisk)}% chance of not coming back. More guards, and the watch of the dead, make better odds.</p></div>`;
}
// The Host at the gate: the gate's bar, the fight in numbers, and what can turn it.
function assaultText() {
  const r = s.raid;
  if (r?.state !== 'assault') return '';
  const def = defense(s);
  const giving = r.host > def + 1e-9;
  const L = r.ladders;
  const ladders = L && (L.up || L.down) ? ` Ladders: ${L.down} thrown down, ${L.up} standing.` : '';
  return `${r.crusade ? 'The crusade' : 'The Host'} ${fmt(r.host)} against your defense ${fmt(def)}. The gate is ${Math.round(100 * Math.max(0, r.gate))}% whole and ${giving ? 'giving' : 'holding'}; they give up in ${Math.ceil(r.left / TICKS_PER_SEC)} s.${ladders}`;
}
function assaultCard(r) {
  const T = s.tuning;
  const hands = s.living.filter((p) => p.job !== 'barracks' && p.job !== 'gatehouse' && !p.fighting && !p.walls && !(p.sick > 0)).length;
  return `<div class="card warn raid"><h3>${r.crusade ? 'The crusade is at the gate' : 'The Host is at the gate'}</h3>
    <div class="gatebar"><span data-bar="gate"></span></div>
    <p data-live="assault">${esc(assaultText())}</p>
    <div class="row"><button class="btn sm primary" id="btn-pitch" data-act="pitch"${s.res.candles + 1e-9 < T.raidPitchCost ? ' disabled' : ''}>Pour pitch: −${fmt(pitchOf(s))} for ${T.raidPitchCost} candles</button>
      <button class="btn sm" id="btn-shore" data-act="shore"${(s.res.stone || 0) + 1e-9 < T.raidShoreCost || r.gate >= 1 - 1e-9 ? ' disabled' : ''}>Shore up the gate: ${T.raidShoreCost} stone</button>
      <button class="btn sm" id="btn-raidbell" data-act="raid-bell"${r.bell || !hands ? ' disabled' : ''}>${r.bell ? 'The bell has rung' : `Ring the bell: everyone to the walls (${hands})`}</button>
      ${r.ward ? '' : `<button class="btn sm" id="btn-wardgate" data-act="wardgate"${s.res.essence + 1e-9 < T.wardGateCost ? ' disabled' : ''}>Ward the gate: +${T.wardGateDefense} for ${T.wardGateCost} essence</button>`}</div>
    <p class="note">Each second ${r.crusade ? 'the crusade' : 'the Host'} is stronger than your defense, the gate gives. If it still stands when their time is up, they fall back. Candles poured are candles you won't have tonight; the bell stops all work, and whoever is on the walls can fall.${r.ladders ? ` A ladder goes up every ${fmt(T.ladderEvery)} s: with a gate guard on the Gatehouse's walls every one is thrown down, and each left standing adds ${fmt(T.ladderHost)} to ${r.crusade ? 'the crusade' : 'the Host'}.` : ''}</p></div>`;
}

function inspectionCard() {
  const I = s.inspection;
  const T = s.tuning;
  const verdicts = 'Dread 0–1: blessed (candles and remembrance). 2–3: warned, with a tithe. 4–5: censured, and the fullest mirror is taken with its shades.';
  if (I && !I.done) {
    const when = I.day === s.day ? 'today at noon' : 'tomorrow at noon';
    return `<div class="card ${s.dread >= 4 ? 'warn' : ''}"><h3>The Lantern Church</h3><p>${I.reason === 'inquisition' ? 'The inquisitor inspects' : 'An inspector comes'} ${when} and judges the keep by its Dread, now <b>${s.dread}</b>. ${verdicts}</p>
      ${s.phase === 'day' ? `<div class="row"><button class="btn sm" id="btn-vigil" data-act="vigil"${s.dread <= 0 || s.res.remembrance + 1e-9 < T.vigilCost ? ' disabled' : ''}>Keep a vigil: Dread −1 for ${T.vigilCost} remembrance</button></div>` : ''}</div>`;
  }
  const done = s.inspections.filter((x) => x.season === s.season && x.day === s.day).pop();
  if (done) return `<div class="card ${done.verdict === 'blessed' ? 'ok' : 'warn'}"><h3>The Lantern Church</h3><p>The inspector's verdict: <b>${done.verdict}</b> (Dread ${done.dread}).</p></div>`;
  if (s.phase === 'day' && s.day < T.firstInspection && !crusadeDay(s)) return `<p class="note">The Lantern Church inspects on day ${T.firstInspection}. ${verdicts}</p>`;
  return '';
}

// Visitors at the gate (round six): whoever is waiting, what each answer costs and gives, and the hour they
// stop waiting and the last answer is taken for you. Then what came of the day's other visitors, and what
// their answers left behind: riders promised, a raid made harder or easier, barrels, a charm, a curse.
const amounts = (o) => listOf(Object.entries(o).map(([k, n]) => `${fmt(n)} ${k}`));
function answerTerms(A) {
  return [A.cost && `costs ${amounts(A.cost)}`, A.gain && `gives ${amounts(A.gain)}`, A.dread && `Dread ${A.dread > 0 ? '+' : '−'}${Math.abs(A.dread)}`, A.does].filter(Boolean).join('; ');
}
// Who a visitor has come about, by name.
function visitorAbout(v) {
  const glassOf = (d) => s.mirrors.find((m) => m.id === d.mirror)?.name;
  if (v.kind === 'wedding') return `${listOf(v.who.map((id) => byId(s.living, id)?.name || 'someone'))} ask to be wed.`;
  if (v.kind === 'knight') {
    const d = byId(s.shades, v.shade);
    return d ? `His brother is ${d.name}, in the ${glassOf(d) || 'glass'}.` : 'His brother is gone from the glass.';
  }
  if (v.kind === 'graverobber') {
    const b = byId(s.bodies, v.body);
    return b ? `The body in his sack is ${b.name}'s.` : '';
  }
  if (v.kind === 'necromancer') {
    const d = byId(s.shades, v.shade);
    return d ? `${d.name} waits Restless at the edge of the Deep.` : '';
  }
  if (v.kind === 'physician') {
    const sick = s.living.filter((p) => p.sick > 0);
    return sick.length ? `Sick now: ${listOf(sick.map((p) => p.name))}.` : 'Nobody is sick now.';
  }
  if (v.kind === 'priest') return `The crypt holds ${plural(s.bodies.length, 'body', 'bodies')}, and the Chapel can give ${plural(funeralCap(s), 'funeral')} tonight.`;
  return '';
}
const untilText = (v) => hhmm(6 + (12 * v.until) / dayTicks(s));
function visitorCards() {
  if (!s.tuning.visitors || !s.visitors) return '';
  const cards = s.visitors
    .filter((v) => v.here && !v.done)
    .map((v) => {
      const V = VISITORS[v.kind];
      const rows = V.answers
        .map((A) => {
          const why = visitorBlock(s, v, A.id);
          const terms = answerTerms(A);
          return `<li><button class="btn sm" id="visit-${v.id}-${A.id}" data-act="visitor" data-id="${v.id}" data-answer="${A.id}"${why ? ' disabled' : ''}>${esc(A.text)}</button>${terms || why ? `<small>${esc(terms)}${why ? `<span class="why">${esc(why)}</span>` : ''}</small>` : ''}</li>`;
        })
        .join('');
      return `<div class="card visit"><h3>At the gate</h3><p><b>${esc(V.name)}.</b> ${esc(V.text)} ${esc(visitorAbout(v))}</p>
        <ul class="answers">${rows}</ul>
        <p class="note">${esc(V.answers.at(-1).text)} unless you answer by ${untilText(v)}.</p><span class="waitbar" aria-hidden="true"><i data-bar="visit" data-arg="${v.id}"></i></span></div>`;
    })
    .join('');
  const past = s.visitors
    .filter((v) => v.done)
    .map((v) => {
      const V = VISITORS[v.kind];
      const A = V.answers.find((a) => a.id === v.done);
      return `${V.name.toLowerCase()} (${v.late ? 'left waiting: ' : ''}${A.text.toLowerCase()})`;
    });
  return `${cards}${past.length ? `<p class="note">Earlier at the gate today: ${esc(listOf(past))}.</p>` : ''}${gateNotes()}`;
}
function gateNotes() {
  const T = s.tuning;
  const out = [];
  const today = s.raid && s.raid.state === 'coming' && !s.raid.crusade;
  if (s.gateHelp) out.push(`The pilgrims stand the gate with you today: +${fmt(s.gateHelp)} defense.`);
  if (s.riders) out.push(today ? `The lord's riders stand with you against today's raid: +${fmt(s.riders)} defense.` : `The lord's riders will stand with you when the Host next comes: +${fmt(s.riders)} defense.`);
  if (s.raidEdge && Math.abs(s.raidEdge - 1) > 1e-9) out.push(`Word from the gate: the Host's next raid comes ×${mult(s.raidEdge)} ${s.raidEdge > 1 ? 'harder' : 'as hard'}.`);
  if (s.barrels) out.push('Water barrels stand ready: until the season ends, fire comes half as often.');
  if (s.charm) out.push(`The hedge-witch's charm: tonight the candles burn ×${mult(T.charmBurn)} as fast.`);
  if (s.curse) out.push("The hedge-witch's curse: a Weeper comes tonight.");
  return out.map((x) => `<p class="note">${esc(x)}</p>`).join('');
}

// The Library (round six): what it studies and how far along, and what else it could; what it has learned.
const studyWhat = (id, kind) => (id === 'rites' && kind ? `the ${KINDS[kind].name} can act twice a night` : STUDIES[id].text);
function libraryCard() {
  const T = s.tuning;
  if (!T.library || !roomsOf(K(), 'library').length) return '';
  const day = s.phase === 'day';
  const St = s.study;
  const scholars = jobCount(s, 'library');
  const now = St
    ? `<p>Studying <b>${esc(STUDIES[St.id].name)}</b>: ${esc(studyWhat(St.id, St.kind))}. <b class="num" data-live="lore">${fmt(St.lore)}</b> of ${STUDIES[St.id].lore} lore.</p>`
    : '<p>Nothing is being studied. Remembrance begins a study; the scholars and the Archive finish it.</p>';
  const kinds = Object.values(ACTS).map((a) => a.kind);
  const pick = ui.riteKind && kinds.includes(ui.riteKind) ? ui.riteKind : kinds[0];
  const rows = Object.entries(STUDIES)
    .filter(([id]) => !s.learned.includes(id))
    .map(([id, S]) => {
      const can = day && !St && s.res.remembrance + 1e-9 >= S.rem;
      const choose = id === 'rites' ? `<select id="rite-kind" data-act="rite-kind" aria-label="For which kind">${kinds.map((k) => `<option value="${k}"${k === pick ? ' selected' : ''}>${KINDS[k].name}</option>`).join('')}</select>` : '';
      return `<li><div><b>${esc(S.name)}:</b> <small>${esc(S.text)}; ${S.lore} lore</small></div><span class="row">${choose}<button class="btn sm" id="study-${id}" data-act="study" data-id="${id}"${can ? '' : ' disabled'}>Begin, ${S.rem} remembrance</button></span></li>`;
    })
    .join('');
  const done = s.learned.map((id) => `${STUDIES[id].name} (${studyWhat(id, id === 'rites' ? s.riteKind : null)})`);
  return `<div class="card lib"><h3>The Library</h3>${now}
    <p class="note">${scholars ? `${esc(plural(scholars, 'scholar'))} ${scholars === 1 ? 'makes' : 'make'} ${fmt(scholars * DAY_ROOMS.library.rate)} lore a day.` : 'Nobody works in the Library: give someone the job, in People.'} By night a lit shade posted in the Archive of the Dead adds to it.</p>
    ${rows && !St ? `<ul class="studies">${rows}</ul>` : ''}
    ${done.length ? `<p class="note">Learned: ${esc(listOf(done))}.</p>` : ''}</div>`;
}
// The Hall (round six): the season's decree, or the choice of one; and what the Court of Shades does by night.
function hallCard() {
  const T = s.tuning;
  if (!T.hall || !roomsOf(K(), 'hall').length) return '';
  const d = decreeOf(s);
  const day = s.phase === 'day';
  const court = 'By night, a shade seated in the Court of Shades, lit, through half the night has one of the dead\'s requests heard free at the next rite: granted, it costs nothing; refused, it isn\'t held against you.';
  if (d) {
    const D = DECREES[d];
    return `<div class="card hall"><h3>The Hall</h3><p><b>${esc(D.name)}</b> stands until the season ends: ${esc(decreeDoes(T, D))}. The price: ${esc(D.price)}.</p><p class="note">${court}</p></div>`;
  }
  const rows = Object.entries(DECREES)
    .map(([id, D]) => `<li><div><b>${esc(D.name)}:</b> <small>${esc(decreeDoes(T, D))}. The price: ${esc(D.price)}.</small></div><button class="btn sm" id="decree-${id}" data-act="decree" data-id="${id}"${day ? '' : ' disabled'}>Proclaim</button></li>`)
    .join('');
  return `<div class="card hall"><h3>The Hall</h3><p>One decree a season, proclaimed from here, stands until the season ends.</p><ul class="studies">${rows}</ul><p class="note">${court}</p></div>`;
}

// The Lantern Church's escalation: its silver embargo, and the Inquisition.
function churchCard() {
  const T = s.tuning;
  const more = (n) => (n === 0 ? 'through today' : `today and ${plural(n, 'more day')}`);
  if (crusadeDay(s)) {
    const C = s.church;
    const n = crusadeDaysLeft(s);
    const when = n === 0 ? 'today, a little after noon' : n === 1 ? 'tomorrow, a little after noon' : `a little after noon in ${n} days`;
    const day = s.phase === 'day';
    const rows = s.mirrors
      .map((m) => {
        const ds = s.shades.filter((d) => d.mirror === m.id);
        const btn = m.hidden
          ? `<button class="btn sm" id="hide-${m.id}-0" data-act="hide" data-id="${m.id}">Bring it out</button>`
          : `<button class="btn sm" id="hide-${m.id}-1" data-act="hide" data-id="${m.id}" data-on="1"${n > 0 ? '' : ' disabled'}>Hide it</button>`;
        return `<li><span>The ${esc(m.name)}: ${ds.length ? esc(listOf(ds.map((d) => d.name))) : 'empty'}${m.hidden ? ', hidden' : ''}</span>${day ? btn : ''}</li>`;
      })
      .join('');
    return `<div class="card warn church"><h3>The crusade</h3><p>The Lantern Church has proclaimed a crusade against the keep: ${Math.max(2, Math.round(C.strength / 2))} knights of the Lantern, strength <b class="num">${fmt(C.strength)}</b>, at the gate ${when}. It takes no tribute. Held at the gate, it turns for home and the Church gives up. Broken in, the crusaders smash every mirror they can find, and the shades in them go free.</p>
      ${n > 0 ? '<p>Until then the inquisitor inspects each noon, and the embargo stands. A blessing, at Dread 0 or 1, calls the crusade off.</p>' : ''}
      <p class="note">${n > 0 ? "A mirror hidden before the day it comes can't be found, by the crusaders or the inquisitor, but its shades sit out every day and night until the crusade is over." : 'Too late to hide anything now: the crusaders are on the road.'}</p>
      ${rows ? `<ul class="facts hides">${rows}</ul>` : ''}</div>`;
  }
  if (inquisition(s)) {
    return `<div class="card warn church"><h3>The Inquisition</h3><p>An inquisitor inspects the keep every day at noon, ${more(churchDaysLeft(s, 'inquisition'))}, and the silver embargo stands with it: the Glazier makes no glass, and no mirror can be built. A blessing, at Dread 0 or 1, sends the inquisitor away at once. A censure takes another mirror and starts its days over.</p></div>`;
  }
  if (!embargoed(s)) return '';
  const can = s.res.remembrance + 1e-9 >= T.donation;
  return `<div class="card warn church"><h3>The Church's embargo</h3><p>A silver embargo, ${more(churchDaysLeft(s))}: the Glazier makes no glass, and no mirror can be built or upgraded. A blessing lifts it, and so does a donation. Censured again while it stands, the keep is given to the Inquisition.</p>
    <div class="row"><button class="btn sm" id="btn-donate" data-act="donate"${can ? '' : ' disabled'}>Donate ${T.donation} remembrance to lift it</button></div></div>`;
}
// A fire by day: how hot, who fights it, whether they're winning, and the Yard to send.
function fireTrend(id) {
  const T = s.tuning;
  const f = s.fires?.find((x) => x.room === id);
  if (!f) return 'Out.';
  const n = peopleIn(s, id).length;
  const net = T.fireGrow - T.fireFight * n;
  if (f.heat >= 1) return `Full heat: it can kill whoever fights it, and in ${fmt(Math.max(0, T.fireSpread - f.full))} seconds it catches the room beside it.`;
  return net > 0 ? `${Math.round(f.heat * 100)}% and gaining: full heat in about ${fmt((1 - f.heat) / net)} seconds.` : `${Math.round(f.heat * 100)}% and falling: they're winning.`;
}
function fireCards() {
  const cards = (s.fires || []).map((f) => {
    const inside = peopleIn(s, f.room);
    const yard = s.living.filter((p) => p.job === 'yard' && !p.fighting).length;
    const burning = s.fires.flatMap((x) => peopleIn(s, x.room));
    const all = s.living.filter((p) => !p.fighting && !(p.sick > 0) && !burning.includes(p)).length;
    return `<div class="card warn fire"><h3>Fire in the ${esc(roomName(f.room))}</h3>
      <div class="heat"><span data-bar="heat" data-arg="${f.room}"></span></div>
      <p><span data-live="heat" data-arg="${f.room}">${esc(fireTrend(f.room))}</span> ${inside.length ? `${esc(listOf(inside.map((p) => p.name)))} ${inside.length === 1 ? 'fights' : 'fight'} it.` : 'Nobody is fighting it.'}</p>
      <div class="row"><button class="btn sm primary" id="fire-${f.room}" data-act="fight-fire" data-room="${f.room}"${yard ? '' : ' disabled'}>${yard ? `Send the Yard (${yard})` : 'Nobody left in the Yard'}</button>
        <button class="btn sm" id="bell-${f.room}" data-act="fight-fire" data-room="${f.room}" data-bell="1"${all ? '' : ' disabled'}>Ring the bell: everyone (${all})</button></div>
      <p class="note">The masons only lose a day's stone; the bell stops all work while it burns. Fighting it can kill, the more the hotter it is.</p></div>`;
  });
  const scorched = s.scorched?.length ? `<p class="note bad">Scorched in last night's fire: the ${esc(listOf(s.scorched.map((id) => roomName(id))))}. Nobody works there today.</p>` : '';
  return cards.join('') + scorched;
}

function buildRow() {
  const shut = embargoed(s);
  return `<div class="build"><span>Build a mirror${shut ? ": not under the Church's embargo" : ''}</span>${Object.entries(MIRRORS)
    .map(([k, M]) => `<button class="btn sm" id="build-${k}" data-act="build" data-mirror="${k}"${shut || s.res.glass + 1e-9 < M.glass ? ' disabled' : ''}>${M.name}, room for ${M.cap}: ${M.glass} glass</button>`)
    .join('')}</div>`;
}
function mirrorsHTML({ upgrades = true } = {}) {
  return `<div class="mirrors">${s.mirrors
    .map((m) => {
      const ds = s.shades.filter((d) => d.mirror === m.id);
      const slots = Array.from({ length: mirrorCap(m) }, (_, i) => (ds[i] ? `<span class="slot full">${esc(ds[i].name)}</span>` : '<span class="slot">empty</span>')).join('');
      return `<div class="mirror"><span class="mname">${esc(m.name)}${m.hidden ? ' <small class="muted">hidden</small>' : ''}</span><div class="slots">${slots}</div>${upgrades ? upgradeHTML(m) : ''}${ds.length ? breakHTML(m) : ''}</div>`;
    })
    .join('')}</div>${upgrades && s.tuning.deep ? `<p class="note">Quicksilver: ${floor1(s.res.quicksilver || 0)}. Shades bring it back from the Deep, sent down at dusk; it upgrades a mirror where it hangs, its shades and all.</p>` : ''}`;
}
// Quicksilver upgrades a hand mirror into a pier glass, and a pier glass into a great glass.
function upgradeHTML(m) {
  const T = s.tuning;
  const next = { hand: 'pier', pier: 'great' }[m.type];
  if (!T.deep || !next || s.phase === 'over') return '';
  const qs = T.upgradeSilver[next];
  const gl = T.upgradeGlass[next];
  const can = !embargoed(s) && (s.res.quicksilver || 0) + 1e-9 >= qs && s.res.glass + 1e-9 >= gl;
  return `<button class="btn sm" id="upgrade-${m.id}" data-act="upgrade-mirror" data-id="${m.id}"${can ? '' : ' disabled'}>To a ${MIRRORS[next].name}: ${qs} quicksilver, ${gl} glass</button>`;
}
// Breaking a mirror, asked twice: what it frees, what it costs.
function breakHTML(m) {
  const T = s.tuning;
  const ds = s.shades.filter((d) => d.mirror === m.id);
  if (ui.breakAsk !== m.id) return `<button class="btn sm" id="break-${m.id}" data-act="break-ask" data-id="${m.id}">Break</button>`;
  return `<div class="break-ask"><p class="note bad">Break the ${esc(m.name)}? ${esc(listOf(ds.map((d) => d.name)))} ${ds.length === 1 ? 'goes' : 'go'} free at once: +${ds.length} remembrance, Dread −${fmt(T.breakDread * ds.length)}. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness comes ${T.badLuck === 2 ? 'twice' : `${fmt(T.badLuck)} times`} as often.</p>
    <div class="row"><button class="btn sm primary" id="break-yes" data-act="break" data-id="${m.id}">Break it</button><button class="btn sm" id="break-no" data-act="break-no">Keep it</button></div></div>`;
}
// Where the living sleep: beds, the crowded, and last night's dreams and nightmares.
function sleepNotes() {
  const T = s.tuning;
  if (!T.dreamwell) return '';
  const b = beds(s);
  const n = s.living.length;
  const bad = s.living.filter((p) => p.nightmare);
  const plague = plagueSeason(s) ? 1 + Math.floor(Math.max(0, n - b) / T.plagueCrowd) : 0;
  return [
    n > b ? `<p class="note bad">Beds for ${b}, and ${n} living: ${n - b} sleep crowded, and sickness comes ${fmt(T.crowdSick)} times as often. Each Quarters adds ${T.quartersBeds} beds.</p>` : '',
    plague ? `<p class="note${plague > 1 ? ' bad' : ''}">Summer is plague season: in a crowded keep, sickness takes one more for every ${T.plagueCrowd} living beyond the beds. ${plague > 1 ? `As you sleep now, it would take ${plague} at once.` : 'As you sleep now, it would take one.'}</p>` : '',
    bad.length ? `<p class="note">After the Weepers, ${esc(listOf(bad.map((p) => p.name)))} woke from ${bad.length === 1 ? 'a nightmare and works' : 'nightmares and work'} at ${Math.round(100 * T.nightmareMult)}% today.</p>` : '',
  ].join('');
}
const badLuckNote = () => (s.badLuck > 0 ? `<p class="note bad">A broken mirror's bad luck: ${plural(s.badLuck, 'more day')} when sickness comes ${s.tuning.badLuck === 2 ? 'twice' : `${fmt(s.tuning.badLuck)} times`} as often.</p>` : '');

function dayPanel() {
  const T = s.tuning;
  const pw = roomPower(s);
  const sick = s.living.filter((p) => p.sick > 0);
  const moon = T.seasonDays - s.day;
  const rows = WORK_ROOMS.filter((id) => jobCap(s, id) > 0 || jobCount(s, id) > 0).map((id) => {
    const R = DAY_ROOMS[id];
    const n = jobCount(s, id);
    const cap = jobCap(s, id);
    const k = s.shades.filter((d) => stepsThrough(s, d) && d.byDay.room === id).length;
    const w = s.shades.find((d) => whispers(s, d) && tradeOf(s, d) === id);
    const len = dayLength(s);
    const out = id === 'infirmary' ? `heals ${fmt(pw[id] * R.rate * len)}/day` : R.out === 'defense' ? `defense ${fmt(pw[id] * R.rate)}` : `${fmt(pw[id] * R.rate * len)} ${R.out}/day`;
    return `<li><span>${R.name} <small class="muted">${plural(n, R.role)}${k ? ` and ${plural(k, 'shade')},` : ''}${Number.isFinite(cap) ? ` of ${cap}` : ''}${w ? `, ${esc(w.name)} whispering` : ''}</small></span><span class="num">${out}</span></li>`;
  }).join('');
  const lunar = isLongNight(s) ? `Tonight is the Long Night: ${longTimes()} as long as a winter night, with the Hollow, a Maw and more of the Unlit. At dawn the year ends.` : moon > 0 ? `The ${T.year && seasonIndex(s) === 3 ? 'Long Night' : 'new moon'} is ${plural(moon, 'night')} off.` : 'Tonight is the new moon. The Hollow will rise.';
  return `<header class="ph-head"><h2>${seasonWord() ? `${seasonWord()}, day ${s.day}` : `Day ${s.day}`}</h2><p>${lunar} The living work; anyone who dies inside the walls wakes at dusk.</p></header>
    ${s.day === 1 ? seasonNote() : ''}
    ${s.daily && s.season === 1 && s.day === 1 ? `<p class="note">This is the keep of ${esc(dayText(s.daily))}: everyone who plays it gets this same keep, on the same rules.</p>` : ''}
    ${chapterCard(false)}
    ${weatherNotes()}
    ${eclipseCard()}
    ${fireCards()}
    ${visitorCards()}
    ${siegeCard()}
    ${gateGuard(s) ? `<p class="note">${esc(listOf(s.shades.filter((d) => atGate(s, d)).map((d) => d.name)))} ${s.shades.filter((d) => atGate(s, d)).length === 1 ? 'stands' : 'stand'} at the gate today, as asked: +${fmt(gateGuard(s))} defense.</p>` : ''}
    ${raidCard()}
    ${inspectionCard()}
    ${churchCard()}
    ${libraryCard()}
    ${hallCard()}
    ${sick.length ? `<p class="note bad">Sick: ${esc(listOf(sick.map((p) => p.name)))}. A healer in the Infirmary cures one a day; untreated, the sickness kills.</p>` : ''}
    ${badLuckNote()}
    ${sleepNotes()}
    ${s.hungry ? '<p class="note bad">The larder is empty. Everyone works hungry, and the weakest will starve. Put more cooks in the Hearth.</p>' : ''}
    ${s.haunted.length ? `<p class="note">Haunted today: the ${esc(listOf(s.haunted.map((id) => roomName(id))))}. A Maw broke ${s.haunted.length === 1 ? 'its twin' : 'their twins'} last night${T.hauntWork < 1 ? `, and whoever works there manages ${Math.round(100 * T.hauntWork)}% of their work` : ''}.</p>` : ''}
    <div class="card"><h3>Work today</h3><ul class="facts">${rows}</ul></div>
    ${deadByDay()}
    <div class="card"><h3>The mirrors</h3><p class="note">Each shade needs a place in a mirror. With no room, the dead wake Restless. Breaking one, in an emergency, frees everyone in it at once and lowers Dread, at the price of the mirror and ${s.tuning.badLuckDays} days of bad luck.</p>${mirrorsHTML()}${buildRow()}</div>`;
}

// The campaign (round six): the chapter this year is, what it brings, its goal and how it's going. Told in full
// at the chapter's first dawn; by day a line.
function goalSoFar(k) {
  const g = CHAPTERS[k].goal;
  const y = (season) => Math.floor((season - 1) / SEASONS.length) + 1;
  const days = [...s.days.filter((d) => y(d.season) === k), s.today];
  if (s.campaign.goals[k] !== undefined) return s.campaign.goals[k] ? 'Met.' : 'Not met.';
  if (g.id === 'candles') return `${floor1(s.res.candles)} candles in the store now; it counts as winter begins.`;
  if (g.id === 'gate') {
    const raids = days.map((d) => d.raid).filter((r) => r && !r.crusade && !r.paid);
    const lost = raids.filter((r) => !r.held).length;
    return lost ? `The gate gave way ${plural(lost, 'time')} this year: not met.` : `${plural(raids.length, 'raid')} held so far.`;
  }
  if (g.id === 'church') return s.inspections.some((i) => y(i.season) === k && i.verdict === 'censured') ? 'Censured this year: not met.' : `No censure so far.`;
  if (g.id === 'hollow') return days.some((d) => d.night?.hollow === 'driven back') ? 'The Hollow was driven back: met at the year\'s end.' : 'Not yet: it withdraws at dawn if it isn\'t met on its way. Send fighters down to it.';
  return 'At the year\'s end.';
}
function chapterCard(full) {
  const k = chapterOf(s);
  if (!k) return '';
  const C = CHAPTERS[k];
  const reward = `worth ${s.tuning.goalReward} remembrance`;
  if (!full) return `<p class="note chapter">Year ${k} of the campaign, <b>${esc(C.name)}</b>. The goal: to ${esc(C.goal.text)} (${reward}). ${esc(goalSoFar(k))}</p>`;
  const help = Object.entries(s.campaign.boons || {}).filter(([id]) => boonNow(s, id)).map(([id]) => CHAPTERS[k - 1].close.find((c) => c.id === id)).filter(Boolean);
  return `<div class="card chapter"><span class="eyebrow">The campaign, year ${k} of 5</span><h3>${esc(C.name)}</h3><p>${esc(C.text)}</p><p class="note">The goal: to ${esc(C.goal.text)}, ${reward}.${help.length ? ` From last year's close: ${esc(help.map((c) => `${c.name.charAt(0).toLowerCase()}${c.name.slice(1)}, ${c.text}`).join('; '))}.` : ''}</p></div>`;
}
// A chapter's close (years 1 to 4): its goal, and the choice for the next; after the fifth, the three endings.
function chapterCloseHTML() {
  const k = chapterOf(s);
  const C = CHAPTERS[k];
  const met = s.campaign.goals[k];
  const goal = `<p class="note${met ? ' good' : ''}">The goal, to ${esc(C.goal.text)}, was ${met ? `met: +${s.tuning.goalReward} remembrance` : 'not met'}.</p>`;
  if (C.close) {
    const next = CHAPTERS[k + 1];
    return `<div class="card ending"><h3>${esc(C.name)} closes</h3>${goal}<p>Next comes year ${k + 1}, ${esc(next.name)}. How does this chapter close?</p>
      <div class="endings">${C.close.map((c) => `<div><button class="btn${c.gain ? '' : ' primary'}" id="close-${c.id}" data-act="close-chapter" data-id="${c.id}">${esc(c.name)}</button><p class="note">${esc(upper(c.text))}.</p></div>`).join('')}</div></div>`;
  }
  const n = s.shades.length;
  const ask = ui.endAsk;
  const confirm = ask ? `<p class="note bad">${esc(ENDINGS[ask].name)}? The keep's story ends here${ask === 'seal' && n ? `, and ${n === 1 ? 'the last shade goes' : `all ${n} shades go`} free` : ''}, and it can't be played on.</p><div class="row"><button class="btn sm primary" id="end-yes" data-act="end-yes">${esc(ENDINGS[ask].name)}</button><button class="btn sm" id="end-no" data-act="end-no">Cancel</button></div>` : '';
  return `<div class="card ending"><h3>The campaign's end</h3>${goal}<p>Five years, and the last Long Night, are behind the keep. How does its story end?</p>
    <div class="endings">
      <div><button class="btn" id="end-seal" data-act="end-ask" data-id="seal">${ENDINGS.seal.name}</button><p class="note">${esc(ENDINGS.seal.text)}</p></div>
      <div><button class="btn" id="end-open" data-act="end-ask" data-id="open">${ENDINGS.open.name}</button><p class="note">${esc(ENDINGS.open.text)}</p></div>
      <div><button class="btn primary" id="end-watch" data-act="take-glass">${ENDINGS.watch.name}</button><p class="note">${esc(ENDINGS.watch.text)}</p></div>
    </div>${confirm}</div>`;
}

// The eclipse (round six): midsummer's morning, the dark itself, and what it left.
function eclipseCard() {
  const T = s.tuning;
  if (!eclipseDue(s)) return '';
  const e = s.today.eclipse;
  if (e) {
    const woke = e.woke.map((id) => byId(s.shades, id)?.name || s.ledger.find((x) => x.id === id)?.name).filter(Boolean);
    return `<div class="card eclipse"><h3>The eclipse is over</h3><p>${plural(e.spawned, 'Creeper')} climbed in the dark: ${e.killed} cut down${e.burned ? `, ${e.burned} burned away when the sun came back` : ''}${e.cracks ? `, and the Veil cracked ${plural(e.cracks, 'time')}: ${e.cracks === 1 ? 'it counts' : 'they count'} at the next rite` : ''}.${e.back ? ` ${plural(e.back, 'candle')} came back to the store.` : ''}</p>${woke.length ? `<p class="note">Woke at once: ${esc(listOf(woke))}.</p>` : ''}${e.side.length ? `<p class="note good">Stood beside their dead, and at peace: ${esc(listOf(e.side))}.</p>` : ''}</div>`;
  }
  // Who stands beside their dead: a living one working a room, their shade posted in its twin.
  const pairs = s.living.map((p) => [p, bondedShade(s, p)]).filter(([p, d]) => d && canWork(d) && p.job);
  const side = pairs.filter(([p]) => isTwinnedLiving(s, p));
  const apart = pairs.filter(([p]) => !isTwinnedLiving(s, p));
  const pairText = `${side.length ? `Side by side now: ${esc(listOf(side.map(([p, d]) => `${p.name} and ${d.name}`)))}. ` : ''}${apart.length ? `Bonded but apart: ${esc(listOf(apart.map(([p, d]) => `${p.name} (${DAY_ROOMS[p.job].name}) and ${d.name} (${roomName(postRoom(s, d), true)})`)))}; post the shade in the twin of the living one's room.` : ''}`;
  const rule = `A living person and their dead, the shade posted in the twin of the living one's room, work and fight ×${mult(T.eclipseTwin)} while it lasts, and one who stands beside their dead through half of it is at peace after. Anyone who dies in the dark wakes at once, with no funeral.`;
  if (!s.eclipse) {
    const [from] = eclipseSpan(s);
    if (s.t >= from) return '';
    return `<div class="card eclipse"><h3>Midsummer</h3><p>At ${hhmm(6 + (12 * from) / dayTicks(s))} the sun goes dark for ${fmt(T.eclipseSecs)} seconds, and the Tain wakes while the day goes on: the dead stand at their posts, and about ${Math.round(T.eclipseCreepers * 100)}% of a night's Creepers climb from the rifts in one tide. Set candles and move the shades below the Veil, as at night. When the sun comes back, the Unlit left burn away.</p><p class="note">${rule}</p>${pairs.length ? `<p class="note">${pairText}</p>` : ''}</div>`;
  }
  const n = s.night;
  const left = Math.max(0, Math.ceil((s.eclipse.to - s.t) / TICKS_PER_SEC));
  const up = n.foes.filter((f) => f.type !== 'wraith').length;
  const coming = n.spawns.length;
  return `<div class="card eclipse warn"><h3>The eclipse</h3><p>The sun is dark for <b data-live="eclipse-left">${left}</b> more seconds. ${up ? `${plural(up, 'of the Unlit', 'of the Unlit')} in the Tain` : 'None of the Unlit in the Tain yet'}${coming ? `, ${coming} still to come` : ''}. Tap below the Veil to set candles and move the shades; the Host and the day's work go on above.</p><p class="note">${rule}</p>${pairs.length ? `<p class="note">${pairText}</p>` : ''}</div>`;
}

// Whispers and the great glass: which of the dead help today, and what it will cost them at dusk.
const mult = (x) => String(Math.round(x * 100) / 100);
const dayCost = (d, base) => base * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1);
function deadByDay() {
  const T = s.tuning;
  if (!T.whispers) return '';
  const can = s.shades.filter(canWork);
  const busy = can.filter((d) => whispers(s, d) || stepsThrough(s, d));
  const able = can.filter((d) => (DAY_ROOMS[tradeOf(s, d)]?.out && jobCap(s, tradeOf(s, d)) > 0) || inGreatGlass(s, d));
  if (!busy.length && !able.length) return '';
  const rows = busy
    .map((d) => {
      if (whispers(s, d)) {
        const R = DAY_ROOMS[tradeOf(s, d)];
        const n = jobCount(s, tradeOf(s, d));
        return `<li><span><b>${esc(d.name)}</b> whispers to the ${R.name}: ${n ? `${plural(n, R.role)} ${n === 1 ? 'works' : 'work'} ×${mult(T.whisperMult)}` : "nobody works there, so it costs nothing today"}</span><span class="num">−${fmt(n ? dayCost(d, T.whisperFade) : 0)} memory</span></li>`;
      }
      return `<li><span><b>${esc(d.name)}</b> works in the ${DAY_ROOMS[d.byDay.room].name} in person, at ${Math.round(100 * perf(d) * T.stepWork)}%</span><span class="num">−${fmt(dayCost(d, T.stepFade))} memory</span></li>`;
    })
    .join('');
  return `<div class="card"><h3>The dead by day</h3>${rows ? `<ul class="facts">${rows}</ul>` : ''}
    <p class="note">A shade can whisper its old trade to whoever works it now (×${mult(T.whisperMult)}), for ${fmt(T.whisperFade)} memory at dusk. One in a great glass can step through instead and work a room in person, for ${fmt(T.stepFade)}. The named pay half, and a trait that changes fading changes this too. Memory is what keeps a shade in the glass. ${busy.length ? 'Change it in People.' : 'Set it in People.'}</p></div>`;
}

function duskCrypt() {
  const plan = crossingPreview(s);
  const cap = funeralCap(s);
  const booked = s.bodies.filter((b) => b.funeral).length;
  const fate = (x) => {
    if (x.to === 'funeral') return ['Funeral: laid to rest, +1 remembrance', ''];
    if (x.to === 'mirror') return [`Wakes ${KINDS[x.b.kind].name}${wakesAs(x.b) ? ` and ${wakesAs(x.b)}` : ''} in the ${x.mirror.name}`, ''];
    if (x.to === 'overflow') return [`No room in the mirrors: wakes Restless (would be ${KINDS[x.b.kind].name})`, 'bad'];
    if (x.to === 'restless') return ['Wakes Restless at the edge of the Deep', 'bad'];
    return ['Wakes as a Wraith and hunts in the Tain', 'bad'];
  };
  const rows = plan
    .map((x) => {
      const [text, tone] = fate(x);
      return `<li><span><b>${esc(x.b.name)}</b> <small>${esc(x.b.how)}${x.b.guided ? ', guided' : ''}</small></span>
        <button class="btn sm" id="fun-${x.b.id}" data-act="funeral" data-id="${x.b.id}" aria-pressed="${x.b.funeral}"${!x.b.funeral && booked >= cap ? ' disabled' : ''}>Funeral</button>
        <span class="fate ${tone}">${text}</span></li>`;
    })
    .join('');
  return `<header class="ph-head"><h2>Dusk: the Crossing</h2><p>${plural(s.bodies.length, 'body lies', 'bodies lie')} in the crypt. Each priest can hold one funeral a day (${cap} today). Everyone else wakes tonight.</p></header>
    <ul class="bodies">${rows}</ul>
    <div class="row"><button class="btn primary" id="btn-wake" data-act="wake">Let them wake</button></div>`;
}

function wardName(id) {
  if (id === 'moat') return "the moat's twin";
  const st = K().stairs.find((x) => x.id === id);
  if (st) return `the ${TWINS[typeAt(K(), st.f, st.x)].name} stair`;
  const rf = MAP.rifts.find((x) => x.id === id);
  return rf ? `the rift in the ${TWINS[typeAt(K(), DEEP_FLOOR, rf.x)].name}` : id;
}

function tidesText() {
  const n = s.night;
  const N = nightTicks(s);
  return n.tides.map((t) => hhmm(18 + (12 * t) / N)).join(', ');
}

// Tonight's omen at dusk (round six): one, or two to choose between.
function omenCard() {
  const n = s.night;
  if (!n?.omen && !n?.omens) return '';
  const line = (o) => `<b>${esc(OMENS[o.id].name)}</b>: ${esc(omenText(s.tuning, o))}.`;
  if (!n.omens) return `<div class="card omen"><p><span class="k">Tonight's omen.</span> ${line(n.omen)}</p></div>`;
  return `<div class="card omen"><p><span class="k">The black mirror shows two omens.</span> Choose one before the night begins; until then you can change your mind, and if you don't choose, the first comes.</p>
    <div class="omen-pick">${n.omens.map((o, i) => `<button class="btn omen-btn" id="omen-${i}" data-act="omen" data-i="${i}" aria-pressed="${n.omen?.id === o.id}">${line(o)}</button>`).join('')}</div></div>`;
}

function duskPlace() {
  const T = s.tuning;
  const n = s.night;
  const L = lightMap(K(), T, n.candles);
  const ds = s.shades.filter(canWork);
  const dark = ds.filter((d) => !isLit(L, d.post.f, d.post.x));
  const creepers = n.spawns.filter((x) => x.type === 'creeper').length;
  const maws = n.spawns.filter((x) => x.type === 'maw').length;
  const wraiths = s.shades.filter((d) => d.kind === 'wraith');
  return `<header class="ph-head"><h2>Dusk: set the night</h2><p>${plural(creepers, 'Creeper')} will climb out of the Deep tonight, most of them in tides around ${tidesText()}.${maws ? ` ${maws === 1 ? 'A Maw comes' : `${maws} Maws come`} with the last tide.` : ''}${isLongNight(s) ? ` <b>Tonight is the Long Night: ${longTimes()} as long as a winter night, with the Hollow and a Maw. At dawn the year ends.</b>` : isNewMoon(s) ? ' <b>Tonight is the new moon: the Hollow rises.</b>' : ''} Set candles and post the shades, then begin.</p></header>
    ${nightTicks(s) > s.tuning.candleWax * TICKS_PER_SEC ? `<p class="note">Tonight lasts ${minsSecs(nightTicks(s) / TICKS_PER_SEC)} at 1×, and a candle burns ${minsSecs(s.tuning.candleWax)}. Keep candles back to relight before dawn.</p>` : ''}
    <ul class="facts">
      <li><span>Candles set tonight</span><b class="num">${n.candles.length}, ${floor1(s.res.candles)} left</b></li>
      <li><span>Shades posted in the dark</span><b class="num">${dark.length}</b></li>
      <li><span>Wards</span><b>${n.wards.length ? esc(listOf(n.wards.map(wardName))) : 'none'}</b></li>
    </ul>
    ${dark.length ? `<p class="note">${esc(listOf(dark.map((d) => d.name)))} ${dark.length === 1 ? 'stands' : 'stand'} in the dark, where Creepers catch and drain shades. A shade works only in light.</p>` : ''}
    ${wraiths.length ? `<p class="note bad">${esc(listOf(wraiths.map((d) => d.name)))} will rise as ${wraiths.length === 1 ? 'a Wraith' : 'Wraiths'} in the Waking Room. Cut ${wraiths.length === 1 ? 'it' : 'them'} down to banish for good.</p>` : ''}
    ${s.charm ? `<p class="note">The hedge-witch's charm: tonight the candles burn ×${mult(T.charmBurn)} as fast.</p>` : ''}
    ${n.spawns.some((sp) => sp.curse) ? '<p class="note bad">On the hedge-witch\'s curse, a Weeper comes tonight.</p>' : ''}
    ${omenCard()}
    ${undergateDusk()}
    ${drownedDusk()}
    ${moonNote()}
    ${deepCard()}
    ${blackMirror()}
    <details class="card"><summary><b>How the Tain works</b></summary>
      <ul class="facts">
        <li><span>Creepers rise from the two rifts on the deepest floor and make for the two mirrors on the floor under the Veil, climbing the stairs between. The more floors the keep has, the longer their way.</span></li>
        <li><span>They can't cross light or climb a stair lit at either end.${T.goAround ? " If any way up is dark they take it, however long, and pass lit rooms by. When every way is lit, they gnaw at the edge of the light that bars them." : ' They gnaw at the edge of the first light on their shortest way up.'} Some hunt candles first.</span></li>
        <li><span>A shade standing in light fights anything at its edge. In the dark, shades get caught and drained.</span></li>
        ${T.lineGuard ? '<li><span>A shade in the light at the foot of a stair up to the Veil is guarding the line: it fights, and keeps the Watch if it stands in the Watch of the Dead, but does no other work. To work another room on that floor, light it with a candle of its own, away from the stair.</span></li>' : ''}
        <li><span>Each twin room has a night job for a lit shade at its post: the Choir sings essence, the Silvering makes glass, the Wick Room saves candles, the Threshold readies gentler deaths, the Watch adds to tomorrow's defense and the Cold Hearth halves fading.</span></li>
        <li><span>From night ${T.seepFrom}, some Unlit seep up in rooms with no candle at all.</span></li>
        ${T.dreamwell ? `<li><span>The night after a death, Weepers come: one for each of the day's dead, for the dark of the sleepers' twin (the Dreamwell, or the Cold Hearth before there are Quarters). One that weeps there ${fmt(T.nightmareSecs)} seconds gives one of the living a nightmare. They can't enter light, a shade cuts them down, and a Keening shade on their floor sings them quiet.</span></li>` : ''}
        ${T.weather ? `<li><span>On a rainy night the Drowned come up out of the moat's twin, at one end of the floor under the Veil, behind the line. They never take a stair: they make for the mirrors on that floor, and one that reaches a mirror cracks the Veil. Light bars them, and they gnaw it ${share(T.drownedGnaw)} as fast as a Creeper. A shade they catch in the dark is drained and dragged to the moat, and pulled under there. A ward on the moat keeps them under.</span></li>` : ''}
        <li><span>From night ${T.mawFrom}, a Maw comes with the last tide. It walks through light to whatever is worth most for the least fight: the candle barring the way up, or a room where people work, counting every fighter on its way. It tears a candle down. A room it stands in for ${fmt(T.mawBreak)} seconds breaks: no work there that night, and ${T.dreadPerBroken} Dread at dawn. It hits the shades beside it.</span></li>
      </ul></details>
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Begin the night</button></div>`;
}

// A rainy dusk: where the Drowned come up, and how to meet them.
const moatEnd = (x) => `the ${x < MAP.W / 2 ? 'left' : 'right'} end, in the ${roomName(roomAt(K(), K().veil, x), true)}`;
function drownedDusk() {
  const n = s.night;
  const dr = n?.spawns.filter((x) => x.type === 'drowned') || [];
  if (!dr.length) return '';
  const end = MAP.moat.find((w) => w.id === dr[0].rift) || MAP.moat[0];
  const warded = n.wards.includes('moat');
  if (warded) return `<p class="note">Rain. The moat's twin is warded: the ${plural(dr.length, 'Drowned', 'Drowned')} stay under tonight.</p>`;
  const one = K().n === 1;
  return `<p class="note bad">Rain. ${dr.length === 1 ? 'One of the Drowned comes' : `${dr.length} of the Drowned come`} up tonight out of the moat's twin at ${esc(moatEnd(end.x))}${one ? '' : ', behind the line'}, and ${dr.length === 1 ? 'makes' : 'make'} for the mirrors on that floor. Ward the moat (${fmt(wardCost(s))} essence), or light the mirror on their side and post a fighter by it. A shade they catch in the dark is dragged to the moat and pulled under.</p>`;
}

// The Undergate (round six): the Gatehouse's twin, where from summer a Creeper of each tide comes up.
const undergateMouthOf = () => {
  const g = gatehouseOf(s);
  return g && { f: g.f, x: g.x0 < MAP.W / 2 ? g.x0 + 4 : g.x1 - 4 };
};
function undergateDusk() {
  const n = s.night;
  if (!n || !undergateOpen(s)) return '';
  const g = gatehouseOf(s);
  const k = n.spawns.filter((x) => x.rift === 'undergate').length;
  const where = tainPlace(K(), g.f);
  if (n.wards.includes('undergate')) return `<p class="note">The Undergate is warded tonight: whatever would have come up it comes up at the rifts.</p>`;
  if (!k) return `<p class="note">The Undergate, your Gatehouse's twin, is ${esc(where)}. It's still tonight: nothing is coming up it.</p>`;
  const can = s.res.essence + 1e-9 >= wardCost(s);
  const m = undergateMouthOf();
  if (m && isLit(lightMap(K(), s.tuning, n.candles), m.f, m.x)) return `<p class="note">A candle burns at the Undergate's mouth: while it's lit, whatever would come up it comes up at the rifts.</p>`;
  return `<div class="card warn"><h3>The Undergate stirs</h3><p>Your Gatehouse's twin is ${esc(where)}, and tonight ${k === 1 ? 'one Creeper comes' : `${k} Creepers come`} up it instead of at a rift, making for the mirrors. A candle at its mouth, at the room's outer end, keeps it shut while it burns; or ward it; or light the mirror nearest it and post a fighter there.</p>
    <div class="row"><button class="btn sm" id="btn-ward-undergate" data-act="ward-undergate"${can ? '' : ' disabled'}>Ward the Undergate: ${fmt(wardCost(s))} essence</button></div></div>`;
}

// Down into the Deep (round five): at dusk, send a shade down past the rifts for quicksilver instead of
// posting it, or call one back.
const DEPTH_NAMES = ['', 'Not far', 'Deep', 'Deepest'];
const deepOdds = (p) => (p < 0.3 ? `1 in ${Math.round(1 / p)}` : `${Math.round(100 * p)}%`);
function deepCard() {
  const T = s.tuning;
  if (!T.deep || s.dusk?.step !== 'place') return '';
  const down = s.shades.filter((d) => d.deep);
  const up = s.shades.filter(canWork);
  if (isNewMoon(s)) return ''; // the Hollow is down there
  const depths = [1, 2, 3].map((k) => `depth ${k} (${DEPTH_NAMES[k].toLowerCase()}), ${T.deepSilver[k - 1]} quicksilver, caught ${deepOdds(T.deepCatch[k - 1])}`).join('; ');
  const rows = up.map((d) => `<li><span>${esc(d.name)} <small class="muted">${KINDS[d.kind].name}, memory ${fmt(d.memory)}${shadeTrait(s, d)?.unseen ? ', a Lurker: caught half as often' : ''}</small></span><span class="seg">${[1, 2, 3].map((k) => `<button class="btn sm" id="deep-${d.id}-${k}" data-act="descend" data-id="${d.id}" data-depth="${k}" title="Depth ${k}: ${DEPTH_NAMES[k].toLowerCase()}" aria-label="Send ${esc(d.name)} down to depth ${k}">${k}</button>`).join('')}</span></li>`).join('');
  const gone = down.map((d) => `<li><span>${esc(d.name)} is down at depth ${d.deep}, ${DEPTH_NAMES[d.deep].toLowerCase()}</span><button class="btn sm" id="deep-${d.id}-0" data-act="descend" data-id="${d.id}" data-depth="0">Call back</button></li>`).join('');
  return `<details class="card deep" data-keep="deep"${ui.open.deep ? ' open' : ''}><summary><b>Down into the Deep</b>${down.length ? ` <small class="muted">${down.length} down tonight</small>` : ''}</summary>
      <p class="note">A shade can go down past the rifts tonight instead of taking a post. It's gone until dawn: no light, no fighting, no work. It comes back with quicksilver, which upgrades a mirror where it hangs, unless something down there catches it: then it comes back drained by ${fmt(T.deepDrain)} memory and empty-handed, or not at all. The deeper, the more, and the likelier it's caught: ${depths}.</p>
      ${gone ? `<ul class="facts deep-down">${gone}</ul>` : ''}
      ${rows ? `<ul class="facts deep-list">${rows}</ul>` : ''}
    </details>`;
}

// The black mirror (threats.js): tonight as the candles, posts and wards stand, and tomorrow's raid. Worked
// out again only when something it reads has changed.
let mirrorMemo = { key: '', th: null };
function threatsNow() {
  const n = s.night;
  if (!n || s.phase !== 'dusk') return null;
  const key = JSON.stringify([s.season, s.day, n.candles.map((k) => [k.id, k.f, k.x]), n.wards, s.shades.map((d) => [d.id, d.f, d.x, d.kind, d.mirror])]);
  if (mirrorMemo.key !== key) mirrorMemo = { key, th: threats(s) };
  return mirrorMemo.th;
}
const waysOn = () => prefs.ways !== false && s.phase === 'dusk' && s.dusk?.step === 'place';
function blackMirror() {
  const th = threatsNow();
  if (!th) return '';
  const T = s.tuning;
  const N = nightTicks(s);
  const at = (t) => hhmm(18 + (12 * t) / N);
  const side = (x) => (x < MAP.W / 2 ? 'left' : 'right');
  const riftName = (id) => {
    if (id === 'undergate') return 'the Undergate';
    const r = MAP.rifts.find((x) => x.id === id);
    return `the ${side(r.x)} rift`;
  };
  const candleName = (id) => {
    const k = s.night.candles.find((c) => c.id === id);
    if (!k) return 'a candle';
    const stair = lineSpots().some((p) => p.f === k.f && Math.abs(p.x - k.x) <= 6);
    return `the candle ${stair ? 'at the stair up to the Veil, in' : 'in'} the ${roomName(roomAt(K(), k.f, k.x), true)}`;
  };
  const shadeName = (id) => esc(s.shades.find((d) => d.id === id)?.name || 'a shade');
  const goes = (w) => {
    if (w.end === 'gnaw') return { text: `gnaw ${candleName(w.candle)}`, bad: false };
    if (w.end === 'veil') return { text: `reach the ${side(MAP.mirrors.find((m) => m.id === w.mirror).x)} mirror: nothing lit bars their way`, bad: true };
    if (w.end === 'catch') return { text: `catch ${shadeName(w.prey)}, standing in the dark on their way`, bad: true };
    return { text: 'find no way up', bad: false };
  };
  const lines = [];
  if (th.drowned) {
    const D = th.drowned;
    const when = listOf(D.at.map((t) => at(t)));
    lines.push(D.warded
      ? { bad: false, text: `The moat's twin is warded: the Drowned stay under.` }
      : { bad: D.way?.end === 'veil' || D.way?.end === 'catch', text: `${D.count === 1 ? 'One of the Drowned comes' : `${D.count} of the Drowned come`} up at ${esc(moatEnd(D.x))} around ${when}. As things stand, ${D.count === 1 ? 'it' : 'they'} would ${goes(D.way || { end: 'none' }).text.replace('find no way up', 'find nothing to go for')}.` });
  }
  // Fog: how many come and when, and not their ways.
  if (th.fog) {
    const all = s.night.spawns.filter((x) => x.type === 'creeper').length;
    return `<details class="card scry fogged" data-keep="scry"${ui.open.scry !== false ? ' open' : ''}><summary><b>The black mirror</b></summary>
      <p class="note">Fog clouds the black mirror tonight. It shows ${plural(all, 'Creeper')}${th.maws.length ? ` and ${plural(th.maws.length, 'Maw')}` : ''}${th.hollow ? ', and the Hollow' : ''}, but not their ways.</p>
      ${th.tides.length ? `<p class="note">Tides at ${listOf(th.tides.map((t) => `${at(t.at)} (${t.count})`))}${th.alone ? `; ${plural(th.alone, 'Creeper')} ${th.alone === 1 ? 'comes' : 'come'} alone` : ''}.</p>` : ''}
    </details>`;
  }
  // Each rift's tide, and its candle hunters where they go elsewhere; rifts whose tides end alike in one line.
  const tides = [];
  for (const e of th.rises) {
    if (!e.way) continue;
    const g = goes(e.way);
    // Candle hunters going the same way count with the tide.
    const n = e.climb + (e.hunt && goes(e.hunt).text === g.text ? e.snuff : 0);
    const same = tides.find((x) => x.text === g.text);
    if (same) {
      same.n += n;
      same.from.push(e.rift);
    } else tides.push({ ...g, n, from: [e.rift] });
  }
  for (const x of tides) lines.push({ bad: x.bad, text: `${x.from.length > 2 ? 'From both rifts and the Undergate' : x.from.length > 1 ? (x.from.includes('undergate') ? `From ${riftName(x.from.find((r) => r !== 'undergate'))} and the Undergate` : 'From both rifts') : `From ${riftName(x.from[0])}`}, ${plural(x.n, 'Creeper')} will ${x.text}.` });
  for (const e of th.rises) {
    if (!e.hunt || (e.way && goes(e.hunt).text === goes(e.way).text)) continue;
    const g = goes(e.hunt);
    lines.push({ bad: g.bad, text: `${plural(e.snuff, 'candle hunter')} from ${riftName(e.rift)} will ${g.text}.` });
  }
  if (th.seep) {
    const rooms = [...new Set(th.seepRooms.map((id) => roomName(id, true)))];
    lines.push({ bad: false, text: `${plural(th.seep, 'Creeper')} may seep up in a room with no candle${rooms.length && rooms.length <= 4 ? `: ${listOf(rooms.map((r) => `the ${r}`))}` : rooms.length ? ` (${rooms.length} such rooms)` : ''}.` });
  }
  for (const m of th.maws) {
    const tg = m.target;
    const what = !tg ? 'nothing it can reach' : tg.kind === 'room' ? `the ${roomName(tg.id, true)} (bracketed)` : `${candleName(tg.id)} (ringed)`;
    lines.push({ bad: false, text: `A Maw rises from ${riftName(m.rift)} around ${at(m.at)}. As things stand it would go for ${what}: what's worth most for the least fight on its way.` });
  }
  if (th.weepers) {
    const W = th.weepers;
    const why = !W.curse ? `${plural(W.count, 'Weeper')} will rise for the day's dead` : W.curse === W.count ? `${W.count === 1 ? 'A Weeper' : plural(W.count, 'Weeper')} will rise on the hedge-witch's curse` : `${plural(W.count, 'Weeper')} will rise, for the day's dead and on the hedge-witch's curse,`;
    lines.push({ bad: W.dark, text: `${why} and make for the dark of the ${roomName(W.rooms[0], true)}. ${W.dark ? `It has dark to weep in: each one that weeps there ${fmt(T.nightmareSecs)} seconds gives someone a nightmare. A shade in its light cuts them down, and a Keening shade on its floor sings them quiet.` : "It's lit wall to wall: they can't weep there while the candles last."}` });
  }
  if (th.hollow) {
    const held = th.hollow.held.length;
    lines.push({ bad: !held, text: `The Hollow rises from ${riftName(th.hollow.rift)} around ${at(th.hollow.at)} and walks to the Veil whatever the light. ${held ? `${plural(held, 'ward')} on its way will hold it${s.tuning.wardDraw ? ` while the essence lasts (${rate(wardDrawOf(s))} a second), then` : ''} ${fmt(wardHoldOf(s))} seconds each.` : `No ward stands on its way yet: each one there holds it${s.tuning.wardDraw ? ` while the essence lasts (${rate(wardDrawOf(s))} a second), then` : ''} ${fmt(wardHoldOf(s))} seconds.`}` });
  }
  const tideText = th.tides.map((t) => `${at(t.at)} (${t.count})`);
  const r = th.raid;
  const raidText = r
    ? `<p class="note${r.defense < r.hi ? ' bad' : ''}">Tomorrow, raiders: strength ${fmt(r.lo)} to ${fmt(r.hi)}. The gate holds ${fmt(r.defense)} with the guards you have now; tonight's Watch and tomorrow's guards add to it.</p>`
    : '';
  return `<details class="card scry" data-keep="scry"${ui.open.scry !== false ? ' open' : ''}><summary><b>The black mirror</b></summary>
      <p class="note">What tonight holds as the candles, posts and wards stand now. Candles burn down and shades move once it begins, so it can still turn out otherwise.</p>
      <ul class="ways">${lines.map((l) => `<li${l.bad ? ' class="bad"' : ''}>${l.text}</li>`).join('')}</ul>
      ${tideText.length ? `<p class="note">Tides at ${listOf(tideText)}${th.alone ? `; ${plural(th.alone, 'Creeper')} ${th.alone === 1 ? 'comes' : 'come'} alone` : ''}.</p>` : ''}
      ${errandsAtDusk()}
      ${raidText}
      <label class="row" for="ways-on"><input type="checkbox" id="ways-on" data-act="ways"${prefs.ways !== false ? ' checked' : ''}>Show their ways on the Tain: dots march each rift's way up, ✕ where they'll gnaw, a ring on a mirror they'll reach, ! over a shade they'll catch</label>
    </details>`;
}

// What came of the night's errands, at the rite.
function errandsAtDawn(r) {
  const es = (r.errands || []).filter((e) => e.done && e.done !== 'gone');
  const lost = (r.errands || []).filter((e) => !e.done && e.kind !== 'sleeper').length;
  if (!es.length && !lost) return '';
  const T = s.tuning;
  const bits = es.map((e) => (e.kind === 'echo' ? `${esc(e.by)} found an echo (+${fmt(T.echoMemory)} memory)` : e.kind === 'relic' ? `${esc(e.by)} brought back a relic (${fmt(T.relicGlass)} glass)` : e.done === 'saved' ? (e.by ? `${esc(e.by)} walked ${esc(e.name)} back to bed` : `${esc(e.name)} woke in the light`) : `${esc(e.name)} died sleepwalking in the Tain`));
  return `<p class="note${es.some((e) => e.done === 'lost') ? ' bad' : ''}">The errands: ${bits.length ? listOf(bits) : 'nothing fetched'}${lost ? `; ${plural(lost, 'thing')} left in the dark` : ''}.</p>`;
}
// Errands in words: what, and where.
const errandWhere = (e) => roomName(roomAt(K(), e.f, e.x) || 'crypt', true);
function errandsAtDusk() {
  const es = s.night?.errands || [];
  if (!es.length) return '';
  const T = s.tuning;
  const N = nightTicks(s);
  const bits = es.map((e) => (e.kind === 'echo' ? `an echo in the ${esc(errandWhere(e))} (+${fmt(T.echoMemory)} memory to the shade that reaches it)` : e.kind === 'relic' ? `a relic in the ${esc(errandWhere(e))} (${fmt(T.relicGlass)} glass)` : `around ${hhmm(18 + (12 * e.at) / N)}, ${esc(e.name)} will sleepwalk out of the ${esc(errandWhere(e))} and make for the Deep: light in their way wakes them, and a shade that reaches them walks them back`));
  return `<p class="note${es.some((e) => e.kind === 'sleeper') ? ' bad' : ''}">In the dark tonight: ${listOf(bits)}.${T.lanterns ? ' A lantern (T) carries its own light there.' : ''}</p>`;
}
// Out in the dark now, at night.
function errandNote() {
  const es = (s.night?.errands || []).filter((e) => !e.done && (e.kind !== 'sleeper' || e.out));
  if (!es.length) return '';
  const walker = es.find((e) => e.kind === 'sleeper');
  const rest = es.filter((e) => e.kind !== 'sleeper').map((e) => `${e.kind === 'echo' ? 'an echo' : 'a relic'} in the ${esc(errandWhere(e))}`);
  const held = walker?.held && `${esc(walker.name)} is held by the Unlit in the dark of the ${esc(errandWhere(walker))}: light the spot or reach them within ${fmt(Math.max(0, s.tuning.sleepHold - (walker.heldFor || 0)))} seconds.`;
  return `${walker ? `<p class="note bad">${held || `${esc(walker.name)} is sleepwalking in the ${esc(errandWhere(walker))}, making for the Deep. Send a shade, or set a candle in their way, before the Unlit find them.`}</p>` : ''}${rest.length ? `<p class="note">Still out in the dark: ${listOf(rest)}.</p>` : ''}`;
}

// Two nights before the new moon, and the night before: wards on the stairs are what hold the Hollow, so the
// essence spent on tonight's tides won't be there for it.
const minsSecs = (x) => {
  const m = Math.floor(x / 60);
  const sec = Math.round(x - m * 60);
  return m ? `${m} min${sec ? ` ${sec} s` : ''}` : `${sec} s`;
};
// A small rate, to two places where one would round it off (0.25, not 0.3).
const rate = (x) => (x < 1 ? x.toFixed(2).replace(/0$/, '') : fmt(x));
function moonNote() {
  const left = s.tuning.seasonDays - s.day;
  if (left < 1 || left > 2) return '';
  const stairs = K().stairs.length;
  const when = left === 1 ? 'Tomorrow night' : 'In two nights';
  // What holding it off until dawn takes: where wards draw on the essence while it batters them, its hours
  // there at tonight's rate; before that, a ward on every stair.
  const need = hollowNeed(s);
  const cap = s.tuning.essenceCap ? ` (the store holds ${s.tuning.essenceCap} at most)` : '';
  const cost = s.tuning.wardDraw
    ? `each draws on the essence while the Hollow batters it, about ${rate(need.rate)} a second now, and it has about ${Math.round(need.secs)} seconds before dawn: holding it off takes about ${Math.round(need.essence)} essence${cap}`
    : `warding all ${stairs} here would take ${fmt(stairs * wardCost(s))} essence`;
  if (s.tuning.year && seasonIndex(s) === 3) return `<p class="note">${when} comes the Long Night, ${longTimes()} as long as a winter night, with the Hollow, a Maw and more of the Unlit. Put candles by for it.${stairs ? ` Wards on the stairs hold the Hollow back: ${cost}, and you have ${floor1(s.res.essence)}.` : ''}</p>`;
  if (!stairs) return `<p class="note">${when} comes the new moon, and the Hollow. This keep has no stairs yet, so only shades fighting it can stop it.</p>`;
  return `<p class="note">${when} comes the new moon. Wards on the stairs are what hold the Hollow back: ${cost}, and you have ${floor1(s.res.essence)}. What you spend tonight won't be there then.</p>`;
}

// What a Maw is after, in words.
function mawNote(m) {
  const T = s.tuning;
  const tg = m.target;
  if (m.rising > 0) return `A Maw is hauling itself out of the ${m.x < W / 2 ? 'left' : 'right'} rift. In ${Math.ceil(m.rising / TICKS_PER_SEC)} seconds it goes for whatever is worth most for the least fight. It can be cut down while it climbs.`;
  if (!tg) return 'A Maw is prowling. Nothing it can reach is worth its while yet.';
  if (tg.kind === 'candle') {
    return `A Maw is ${m.gnawing ? 'tearing down' : 'making for'} the candle in the ${roomName(roomAt(K(), tg.f, tg.x), true)}. One strong fighter in the light can stop it; a second makes sure. Relight if it falls.`;
  }
  const left = m.gnawing ? ` It breaks in ${fmt(Math.max(0, T.mawBreak - (m.breaking || 0) / TICKS_PER_SEC))} seconds.` : ` It breaks a room it stands in for ${fmt(T.mawBreak)} seconds.`;
  return `A Maw is ${m.gnawing ? 'breaking' : 'making for'} the ${roomName(tg.id, true)}.${left} Send a fighter to meet it there, with a candle, or pay ${T.dreadPerBroken} Dread at dawn.`;
}

function nightPanel() {
  const n = s.night;
  const caught = s.shades.filter((d) => d.grabbedBy);
  const h = n.foes.find((f) => f.type === 'hollow');
  return `<header class="ph-head"><h2>${isNewMoon(s) ? 'The new moon' : `Night ${s.day}`}</h2><p>Hold the light until dawn. Drop a candle on a caught shade to free it, send fighters where the edge is gnawed, and ward what you can't hold.</p></header>
    <ul class="facts">
      <li><span>The Unlit out, still to come</span><b class="num"><span data-live="foes">${n.foes.length}</span>, <span data-live="tocome">${n.spawns.length}</span></b></li>
      <li><span>Cut down</span><b class="num" data-live="killed">${n.stats.killed}</b></li>
      <li><span>Through the Veil</span><b class="num">${n.stats.crossed}</b></li>
      <li><span>Essence sung, glass silvered</span><b class="num"><span data-live="t-ess">${fmt(n.stats.essence)}</span>, <span data-live="t-glass">${fmt(n.stats.glass)}</span></b></li>
    </ul>
    ${h ? `<p class="note bad">The Hollow is in the ${esc(roomName(roomAt(K(), h.f, h.x) || 'chapel', true))}${h.mode === 'batter' ? ', battering a ward' : ''}. It eats light and drains shades near it. Only shades fighting it drive it back.</p>` : ''}
    ${n.foes.filter((f) => f.type === 'maw').map((m) => `<p class="note bad">${esc(mawNote(m))}</p>`).join('')}
    ${n.broken.length ? `<p class="note">Broken tonight: the ${esc(listOf(n.broken.map((id) => roomName(id, true))))}. Nobody works there until dawn.</p>` : ''}
    ${caught.map((d) => {
      const m = byId(s.mirrors, d.mirror);
      const by = n.foes.find((f) => f.id === d.grabbedBy);
      return `<p class="note bad">${esc(d.name)} is ${by?.type === 'drowned' ? 'being dragged to the moat by the Drowned' : 'caught'} in the ${esc(roomName(roomAt(K(), d.f, d.x) || 'crypt', true))}. Drop a candle on the spot or send a fighter${m ? `, or break the ${esc(m.name)} to free ${esc(d.name)} at once` : ''}.</p>${m ? breakHTML(m) : ''}`;
    }).join('')}
    ${n.omen ? `<p class="note">Tonight's omen: ${esc(OMENS[n.omen.id].name)}: ${esc(omenText(s.tuning, n.omen))}.${n.stats.omenEssence ? ` It has paid ${fmt(n.stats.omenEssence)} essence so far.` : ''}</p>` : ''}
    ${nextNote()}
    ${weeperNote()}
    ${drownedNote()}
    ${errandNote()}
    ${s.shades.some((d) => d.deep) ? `<p class="note">In the Deep until dawn: ${esc(listOf(s.shades.filter((d) => d.deep).map((d) => `${d.name} (${DEPTH_NAMES[d.deep].toLowerCase()})`)))}.</p>` : ''}
    ${n.hush ? '<p class="note">Hushed: no work, no fighting, and the Unlit pass the shades by.</p>' : ''}`;
}
// The next mark on the tide clock, and how to skip to it.
function nextNote() {
  const m = nextMark(s);
  if (!m) return '';
  return `<p class="note">Next on the clock: ${esc(markText(m))}.${m.kind === 'dawn' ? '' : ' Skip (N) runs to just before it, and stops if anything happens first.'}</p>`;
}
function drownedNote() {
  const d = s.night.foes.filter((f) => f.type === 'drowned');
  const more = s.night.spawns.filter((x) => x.type === 'drowned').length;
  if (!d.length && !more) return '';
  const out = d.length ? `${d.length === 1 ? 'One of the Drowned is' : `${d.length} of the Drowned are`} out on the floor under the Veil` : '';
  const coming = more ? `${more === 1 ? 'one more comes' : `${more} more come`} up ${s.night.wards.includes('moat') ? 'against the ward on the moat' : 'out of the moat before dawn'}` : '';
  return `<p class="note bad">${upper([out, coming].filter(Boolean).join(', and '))}. They make for the mirrors${K().n > 1 ? ' from behind the line' : ''}. Light bars them, a fighter cuts them down, and a shade they catch is dragged to the moat.</p>`;
}

function weeperNote() {
  const T = s.tuning;
  const w = s.night.foes.filter((f) => f.type === 'weeper');
  if (!w.length) return '';
  const weeping = w.filter((f) => f.mode === 'weep' && !f.quiet).length;
  return `<p class="note bad">${plural(w.length, 'Weeper')} ${w.length === 1 ? 'is' : 'are'} out${weeping ? `, ${weeping} weeping in the dark of the ${esc(roomName(weeperRoomsNow()[0], true))}` : ''}. One that weeps there ${fmt(T.nightmareSecs)} seconds gives one of the living a nightmare. Light the room, cut them down, or bring a Keening shade to that floor.</p>`;
}
const weeperRoomsNow = () => (roomsOf(K(), 'quarters').length ? roomsOf(K(), 'quarters') : roomsOf(K(), 'hearth')).map((r) => r.id);

function nightReport() {
  const r = s.today.night;
  if (!r) return '';
  const rows = r.fading
    .map((f) => `<li><span>${esc(f.name)}${f.rested ? ', rested' : ''}</span><span class="num">−${fmt(f.fade)}${f.drained ? `, −${fmt(f.drained)} drained` : ''} → ${fmt(Math.max(0, f.memory))}</span></li>`)
    .join('');
  const made = [r.wick ? `${r.wick} candles saved` : '', r.guidance ? `${r.guidance} guidance readied` : '', r.watch ? `+${fmt(r.watch)} defense from the Watch` : '', r.essence >= 0.1 ? `${fmt(r.essence)} essence` : '', r.glass >= 0.1 ? `${fmt(r.glass)} glass` : '']
    .filter(Boolean)
    .join(', ');
  return `<div class="card"><h3>The night</h3>
    <p>${plural(r.spawned, 'Creeper')}, ${r.killed} cut down, ${r.crossed} through the Veil, ${plural(r.grabbed, 'shade')} caught.${made ? ` Made: ${made}.` : ''}</p>
    ${r.hollow ? `<p class="note ${r.hollow === 'driven back' ? '' : 'bad'}">The Hollow ${r.hollow === 'crossed' ? `reached the Veil${r.taken ? ` and took ${esc(r.taken)}` : ''}` : r.hollow}.</p>` : ''}
    ${r.broken?.length ? `<p class="note bad">The Maws broke the ${esc(listOf(r.broken.map((id) => roomName(id, true))))}. The living saw the dead walk there: Dread for each.</p>` : ''}
    <ul class="fadelist">${rows}</ul>
    ${r.nightmares ? `<p class="note bad">The Weepers gave ${plural(r.nightmares, 'nightmare')}.</p>` : ''}
    ${r.omen ? `<p class="note">The omen was ${esc(OMENS[r.omen].name.replace(/^A /, 'a ').replace(/^The /, 'the '))}${r.omenEssence ? `: it paid ${fmt(r.omenEssence)} essence` : ''}.</p>` : ''}
    ${errandsAtDawn(r)}
    ${(r.deep || []).map((x) => `<p class="note${x.caught ? ' bad' : ''}">${esc(x.name)} ${x.caught ? `was caught in the Deep: −${fmt(x.lost)} memory, and nothing to show for it.` : `came back up from the Deep with ${x.silver} quicksilver.`}</p>`).join('')}
    ${r.lost.length ? `<p class="note bad">Lost: ${esc(listOf(r.lost))}.</p>` : ''}</div>`;
}

// The night review (round five): the moments that most decided the night just ended, as stills of the Tain
// the sim kept (sim.js, keepMoment), in the order they came. Drawn once each, as the player views the Tain.
function reviewHTML(title) {
  const R = s.review;
  const day = s.phase === 'over' ? s.over?.day : s.day;
  if (!R?.moments?.length || R.season !== s.season || R.day !== day) return '';
  const flip = prefs.mode === 'flipped';
  const key = `${R.season}/${R.day}/${flip}/${R.moments.length}`;
  if (ui.stills?.key !== key) {
    ui.stills = {
      key,
      imgs: R.moments.map((m) => {
        const cv = document.createElement('canvas');
        drawMoment(cv, s, m, { flip });
        return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
      }),
    };
  }
  const figs = R.moments
    .map((m, i) => {
      const im = ui.stills.imgs[i];
      return `<figure class="moment is-${m.kind}"><img src="${im.url}" width="${im.w}" height="${im.h}" alt="The Tain at ${hhmm(18 + (12 * m.t) / R.ticks)}: ${esc(m.text)}"><figcaption><b>${hhmm(18 + (12 * m.t) / R.ticks)}</b> ${esc(m.text)}</figcaption></figure>`;
    })
    .join('');
  return `<details class="card review" data-keep="review"${ui.open.review !== false ? ' open' : ''}><summary><b>${title}</b></summary><div class="moments">${figs}</div><p class="hint">A ring marks where it happened.</p></details>`;
}

// The dead ask for things: a shade's request at the rite, what granting costs, and how near a refusal
// leaves it to turning Restless.
function askHTML(d) {
  const k = s.rite.asks?.[d.id];
  if (!k) return '';
  const T = s.tuning;
  const R = REQUESTS[d.kind];
  const granted = k === 'release' ? s.rite.choice[d.id] === 'cover' : !!s.rite.grant?.[d.id];
  const fade = T.gateFade * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1);
  const cost = {
    release: 'its mirror is covered and it rests, for +1 remembrance',
    gate: `tomorrow it stands the gate by day, +${fmt(KINDS[d.kind].fight * perf(d) * DAY_ROOMS.barracks.rate)} defense, for ${fmt(fade)} memory at dusk, and it asks no more`,
    name: `${T.nameCost} remembrance: it fades half as fast, and asks no more`,
    remember: `${T.rememberCost} remembrance: +${T.rememberGain} memory, and it asks no more`,
  }[k];
  const left = T.refusals - (d.refused || 0);
  const heard = s.rite.heard === d.id;
  const warn = heard ? 'Heard in the Court of Shades: granted, it costs nothing; refused, it isn\'t held against you.' : left <= 1 ? 'Refused again, it turns Restless and leaves its mirror.' : `Refused ${T.refusals === 2 ? 'twice' : `${T.refusals} times`}, a shade turns Restless.`;
  return `<div class="ask"><p><q>${esc(R.ask)}</q></p>
    <div class="row"><button class="btn sm" id="ask-yes-${d.id}" data-act="request" data-id="${d.id}" data-grant="1" aria-pressed="${granted}">Grant</button><button class="btn sm" id="ask-no-${d.id}" data-act="request" data-id="${d.id}" data-grant="" aria-pressed="${!granted}">Refuse</button></div>
    <small>Granted, ${esc(heard && (k === 'name' || k === 'remember') ? cost.replace(/^\d+ remembrance/, 'free') : cost)}. <span class="${left <= 1 && !heard ? 'bad' : ''}">${esc(warn)}</span></small></div>`;
}

function riteRow(d) {
  const T = s.tuning;
  const c = s.rite.choice[d.id];
  const label = { keep: 'Keep', cover: 'Cover the mirror', release: 'Release', leave: 'Leave', bind: `Bind, ${T.bindCost} essence`, banish: `Banish, ${T.banishCost} essence` };
  const opts = choicesFor(d)
    .map((k) => `<button class="btn sm" id="rite-${d.id}-${k}" data-act="rite" data-id="${d.id}" data-choice="${k}" aria-pressed="${c === k}">${label[k]}</button>`)
    .join('');
  const keepD = T.dreadPerKeep * (shadeTrait(s, d)?.dread ?? 1);
  const note = canWork(d)
    ? `${Math.ceil(d.memory)} memory${d.named ? ', named' : ''}. ${c === 'cover' ? 'Released at dawn: +1 remembrance, and the living it was bound to find peace.' : `Kept: +${keepD} Dread${keepD > T.dreadPerKeep ? ', for it is Bitter' : ''}.`}`
    : d.kind === 'wraith'
      ? `Left: +${T.dreadPerWraith} Dread, and it rises again tonight.`
      : `${c === 'release' ? 'Released: +1 remembrance.' : c === 'bind' ? `Bound into a mirror as ${KINDS[d.trueKind].name}: +${keepD} Dread.` : `Left at the edge: +${T.dreadPerRestless} Dread, and a night closer to Wraith.`}`;
  const acts = canWork(d) && c !== 'cover'
    ? `<div class="feel"><button class="btn sm" id="name-${d.id}" data-act="name" data-id="${d.id}"${d.named || s.res.remembrance + 1e-9 < T.nameCost ? ' disabled' : ''}>Name, ${T.nameCost}</button>
       <button class="btn sm" id="rem-${d.id}" data-act="remember" data-id="${d.id}"${d.memory >= 100 || s.res.remembrance + 1e-9 < T.rememberCost ? ' disabled' : ''}>Remember +${T.rememberGain}, ${T.rememberCost}</button>
       <span>Naming halves fading for good.</span></div>`
    : '';
  const bonded = d.bond && byId(s.living, d.bond.with);
  return `<div class="rite-row${c === 'cover' || c === 'release' || c === 'banish' ? ' is-cover' : ''}${s.rite.asks?.[d.id] ? ' is-asking' : ''}">
    <div class="who"><div><b>${esc(d.name)}</b>${kindTag(d.kind)}${bonded ? `<small>${esc(bonded.name)}'s ${esc(BOND_OTHER[d.bond.rel] || d.bond.rel)}</small>` : ''}</div>${shadeTraitText(d)}<small>${note}</small></div>
    <div class="opts">${opts}</div>${acts}${askHTML(d)}</div>`;
}

function dawnPanel() {
  const T = s.tuning;
  const P = ritePreview(s);
  const D = P.dread;
  const I = s.inspection;
  const warn = (I && !I.done && I.day === s.day + 1) || (s.day + 1 === T.firstInspection - 1);
  const bitter = [...P.keep, ...P.bind].filter((d) => (shadeTrait(s, d)?.dread ?? 1) > 1).length;
  const parts = [
    D.keep ? `+${D.keep} kept${bitter ? ` (${bitter} Bitter, ${T.dreadPerKeep * SHADE_TRAITS.bitter.dread} each)` : ''}` : '',
    D.restless ? `+${D.restless} Restless left` : '',
    D.wraith ? `+${D.wraith} Wraiths left` : '',
    D.cracks ? `+${D.cracks} from the cracked Veil` : '',
    D.broken ? `+${D.broken} from the rooms the Maws broke` : '',
    `−${D.bear} borne by the living`,
    D.vigils ? `−${D.vigils} vigils` : '',
  ].filter(Boolean).join(', ');
  return `<header class="ph-head"><h2>${s.day === 0 ? `Season ${s.season}: the first dawn` : 'Dawn: the Rite'}</h2><p>The Unlit withdraw and the shades go back into the glass. Choose who stays. Each shade kept adds Dread; ${bear(s)} ${bear(s) === 1 ? 'is' : 'are'} borne by the living (one per ${T.dreadLivingPer} living, one per priest).</p></header>
    ${s.day === 0 && seasonIndex(s) === 0 ? chapterCard(true) : ''}
    ${nightReport()}
    ${reviewHTML('The night in moments')}
    ${s.dreamt ? `<p class="note">Good dreams from the night: the living work ×${fmt(s.dreamt)} today.</p>` : ''}
    ${sleepNotes()}
    <div class="rite-list">${s.shades.map(riteRow).join('') || '<p class="empty">The glass is empty.</p>'}</div>
    <div class="preview">
      <p>Dread <b class="big">${D.from} → ${D.to}</b> <small class="muted">(${parts})</small></p>
      ${P.crusade ? '<p class="note bad">The crusade comes to the gate a little after noon, fought as a raid. Broken in, it smashes every mirror it can find.</p>' : ''}
      ${P.inquisition ? '<p class="note bad">The inquisitor inspects again at noon. A Dread of 4 or 5 is censured, and another mirror taken; 0 or 1 sends the inquisitor away.</p>' : P.inspector ? '<p class="note bad">At 5 the Lantern Church sends an inspector today. At noon a Dread of 4 or 5 is censured.</p>' : warn ? '<p class="note">The Lantern Church inspects soon. A Dread of 0 or 1 at noon is blessed.</p>' : ''}
      <div class="vigil"><span>Vigils at dawn, ${T.vigilCost} remembrance each:</span><button class="btn sm" id="vig-dn" data-act="vigils" data-n="${s.rite.vigils - 1}"${s.rite.vigils <= 0 ? ' disabled' : ''} aria-label="One fewer vigil">−</button><b>${s.rite.vigils}</b><button class="btn sm" id="vig-up" data-act="vigils" data-n="${s.rite.vigils + 1}" aria-label="One more vigil">+</button><small class="muted">remembrance ${floor1(s.res.remembrance)}</small></div>
      ${badLuckNote()}
      ${s.mirrors.some((m) => s.shades.some((d) => d.mirror === m.id)) ? `<details class="card" data-keep="breaking"${ui.open.breaking ?? P.inspector ? ' open' : ''}><summary><b>Break a mirror</b></summary><p class="note">In an emergency: everyone in it goes free at once and Dread falls ${fmt(T.breakDread)} for each, which covering can't do. The mirror is lost, and ${T.badLuckDays} days of bad luck follow.</p>${mirrorsHTML({ upgrades: false })}</details>` : ''}
      ${P.errors.map((e) => `<p class="note bad">${esc(e)}</p>`).join('')}
      <div class="row"><button class="btn primary" id="btn-day" data-act="begin-day"${P.errors.length ? ' disabled' : ''}>Begin day ${s.day + 1}</button></div>
    </div>`;
}

function summaryHTML(e) {
  const S = e.summary;
  const causes = Object.entries(S.byCause).filter(([, n]) => n).map(([k, n]) => `${n} ${k === 'hollow' ? 'taken by the Hollow' : CAUSES[k].name.toLowerCase()}`).join(', ');
  const raids = S.raids.map((r) => (r.paid ? 'paid off' : r.held ? 'held' : 'breached')).join(', ');
  const insp = S.inspections.map((i) => `${i.verdict} on day ${i.day}`).join(', ');
  return `<ul class="facts">
    <li><span>Living at the end</span><b class="num">${S.living}</b></li>
    <li><span>Shades in the glass</span><b class="num">${S.shades}</b></li>
    <li><span>Deaths</span><b class="num">${S.deaths}${causes ? ` (${esc(causes)})` : ''}</b></li>
    <li><span>Raids</span><b>${raids || 'none'}</b></li>
    <li><span>The Lantern Church</span><b>${esc(insp) || 'no visit'}</b></li>
    <li><span>Veil cracks this season</span><b class="num">${S.cracks}</b></li>
    <li><span>Shades lost at night</span><b>${S.lost.length ? esc(listOf(S.lost)) : 'none'}</b></li>
    <li><span>The Hollow</span><b>${S.hollow ? esc(S.hollow) : '—'}${S.taken.length ? `, took ${esc(listOf(S.taken))}` : ''}</b></li>
  </ul>`;
}

function questionHTML(e) {
  return `<div class="card question"><h3>The playtest question</h3>
    <p><b>Would you play a second season?</b> Answer before you look at anything else.</p>
    <div class="row" role="group" aria-label="Would you play a second season?">
      <button class="btn" id="ans-again" data-act="answer" data-v="again" aria-pressed="${e.answer === 'again'}">Yes, another season</button>
      <button class="btn" id="ans-stop" data-act="answer" data-v="stop" aria-pressed="${e.answer === 'stop'}">No, I'd stop here</button>
    </div>
    <label for="season-note">Why? What would make you (or stop you)?</label>
    <textarea id="season-note" rows="3" data-note="1" placeholder="The moment you decided…">${esc(e.note)}</textarea>
    <p class="hint">Saved with the playtest export, in Records under Playtest.</p></div>`;
}

function endPanel() {
  const e = lastSeason(s);
  const T = s.tuning;
  const yearEnd = T.year && seasonIndex(s) === 3;
  const next = T.year ? `Begin ${SEASONS[e.season % SEASONS.length]}${yearEnd ? `, year ${yearOf(s) + 1}` : ''}` : `Begin season ${e.season + 1}`;
  const head = s.opened
    ? `<header class="ph-head"><h2>The Veil is open</h2><p>After five years, ${s.opened.shades ? `${plural(s.opened.shades, 'shade')} walked out of the glass into the keep` : 'with the glass empty'}, the living went down into the Tain, and the keep became a crossing between the two. This keep's story is over.</p></header>`
    : s.sealed
    ? `<header class="ph-head"><h2>The Veil is sealed</h2><p>After ${s.campaign?.ending === 'seal' ? 'five years' : 'a whole year'}, ${s.sealed.freed ? `${plural(s.sealed.freed, 'shade')} went free` : 'the glass stood empty'}, and the Book of the Dead is closed. This keep's story is over.</p></header>`
    : `<header class="ph-head"><h2>${yearEnd ? `Year ${yearOf(s)} is over` : T.year ? `${seasonWord()} is over` : `Season ${e.season} is over`}</h2><p>${yearEnd ? 'The Long Night has passed. The keep has stood a whole year.' : 'The new moon has passed. The keep stands.'}</p></header>`;
  const go = s.sealed || s.opened
    ? newKeepControls()
    : yearEnd && chapterOf(s) ? chapterCloseHTML()
    : yearEnd ? endingsHTML(next)
      : `<div class="row"><button class="btn primary" id="btn-next-season" data-act="next-season">${next}</button><span class="hint">${harderNote()}</span></div>`;
  return `${head}
    ${playtesting() ? questionHTML(e) : ''}
    ${s.sealed || s.opened ? '' : reviewHTML(isLongNight(s) ? 'The Long Night in moments' : 'The new moon in moments')}
    <div class="card"><h3>The season</h3>${summaryHTML(e)}<div class="row"><button class="btn sm" id="end-book" data-act="book">Read the Book of the Dead</button></div></div>
    ${recapHTML(e)}
    ${go}`;
}
// How much harder the next season comes. Within a year, each season than the last; at the year's end, the
// spring after the Long Night is easier than the winter was, and harder than the last spring by the year's rate.
function harderNote() {
  const T = s.tuning;
  if (T.year && yearRate(s) && seasonIndex(s) === 3) return `Raids and the Unlit come easier in the spring than they were this winter, and ×${mult(yearRate(s))} harder than last spring.`;
  return `Raids and the Unlit come ×${mult(T.hardness)} harder.`;
}
// An ending to the year (round five): keep the watch, take your own place in the glass, or seal the Veil,
// which ends the keep's story and is asked twice.
function endingsHTML(next) {
  const T = s.tuning;
  const n = s.shades.length;
  const seal = ui.sealAsk
    ? `<p class="note bad">Seal the Veil? ${n ? `${n === 1 ? 'The last shade goes' : n === 2 ? 'Both shades go' : `All ${n} shades go`} free, ` : ''}the Book closes, and this keep can't be played on.</p><div class="row"><button class="btn sm primary" id="seal-yes" data-act="seal-yes">Seal it</button><button class="btn sm" id="seal-no" data-act="seal-no">Cancel</button></div>`
    : '<button class="btn" id="end-seal" data-act="seal-ask">Seal the Veil</button>';
  return `<div class="card ending"><h3>The year's end</h3><p>The Long Night is over. How does this keep's year end?</p>
    <div class="endings">
      <div><button class="btn primary" id="btn-next-season" data-act="next-season">Keep the watch</button><p class="note">${esc(next)}. ${harderNote()}</p></div>
      <div><button class="btn" id="end-glass" data-act="take-glass">Take your place in the glass</button><p class="note">You wake as a shade, Loyal, named and Anchored: a strong fighter who fades slowly, but weighs ${T.keeperDread} shades' Dread at every rite. A new keeper takes up the keep, and the year goes on.</p></div>
      <div>${seal}<p class="note">${ui.sealAsk ? '' : `Every shade goes free, and the Book closes. The keep's story ends here, with ${plural(n, 'shade')} set free.`}</p></div>
    </div></div>`;
}

function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New season from day 1</button></div>';
  return `<div class="confirm"><p>Start keep ${saves.current} over from season 1, day 1? This one is gone unless you export it first, from Menu, then Saves; a new keep can go in another slot there instead.</p>
    <div class="row"><button class="btn primary" id="btn-new-yes" data-act="new-yes">Start over</button><button class="btn" id="btn-new-no" data-act="new-no">Cancel</button></div></div>`;
}

// The recap card (recap.js says what, card.js draws it): made on request, shown, then shared or saved.
function recapHTML(e) {
  const k = ui.card?.season === e.season && ui.card.keep === s.seed ? ui.card : null;
  if (!k) {
    return `<div class="card"><h3>Recap card</h3><p class="note">One image of the season to share: the keep as it stands, how it went, and who is remembered.</p>
      <div class="row"><button class="btn" id="card-make" data-act="card-make"${ui.card?.making ? ' disabled' : ''}>${ui.card?.making ? 'Drawing…' : 'Make the card'}</button></div></div>`;
  }
  return `<div class="card"><h3>Recap card</h3><img class="recap" id="recap-img" src="${k.url}" alt="${esc(k.alt)}" width="1080" height="1350">
    <div class="row">${navigator.share ? '<button class="btn primary" id="card-share" data-act="card-share">Share</button>' : ''}<button class="btn" id="card-save" data-act="card-save">Save image</button></div></div>`;
}
async function makeCard() {
  const r = recapOf(s);
  if (!r || ui.card?.making) return;
  if (ui.card?.url) URL.revokeObjectURL(ui.card.url);
  ui.card = { making: true };
  bump();
  await cardFonts();
  const cv = document.createElement('canvas');
  drawCard(cv, s, r);
  const blob = await new Promise((done) => cv.toBlob(done, 'image/png'));
  const name = `afterglass-${(s.daily ? `daily-${s.daily}-` : '') + r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const alt = `The recap card for ${r.title}: ${r.head}. ${r.sub} ${r.stats.map(([l, v]) => `${l}: ${v}`).join('; ')}.${r.remembered.length ? ` Remembered: ${r.remembered.map((m) => `${m.name}, ${m.line}`).join('; ')}.` : ''}`;
  ui.card = { season: r.season, keep: s.seed, url: URL.createObjectURL(blob), blob, name, text: r.text, alt };
  bump();
}
function saveCard() {
  const a = document.createElement('a');
  a.href = ui.card.url;
  a.download = ui.card.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function shareCard() {
  const file = new File([ui.card.blob], ui.card.name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: ui.card.text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  saveCard(); // this browser can't share an image: save it instead
}

function overPanel() {
  const e = lastSeason(s);
  const why = s.over?.reason === 'veil' ? 'The Veil broke and the Unlit came through into the keep.' : 'No one living was left.';
  return `<header class="ph-head"><h2>The keep is lost</h2><p>${why} Season ${s.season}, ${s.phase === 'over' && s.over.day ? `day ${s.over.day}` : ''}.</p></header>
    ${e && playtesting() ? questionHTML(e) : ''}
    ${reviewHTML('How the last night went')}
    ${e ? `<div class="card"><h3>The season</h3>${summaryHTML(e)}</div>` : ''}
    ${e ? recapHTML(e) : ''}
    ${campaignOn(s) && s.campaign && !s.campaign.ending ? `<div class="card chapter"><h3>Begin the chapter again</h3><p class="note">The keep as it stood at the first dawn of year ${chapterOf(s)}, ${esc(CHAPTERS[chapterOf(s)].name)}${chapterOf(s) === 1 ? ' (its first morning)' : ''}, with everything since undone. It plays the same until you choose otherwise.</p><div class="row"><button class="btn primary" id="btn-chapter-again" data-act="chapter-again">Begin ${esc(CHAPTERS[chapterOf(s)].name)} again</button></div></div>` : ''}
    ${newKeepControls()}`;
}

function phaseHTML() {
  let panel;
  if (s.phase === 'day') panel = dayPanel();
  else if (s.phase === 'dusk') panel = s.dusk.step === 'crypt' ? duskCrypt() : duskPlace();
  else if (s.phase === 'night') panel = nightPanel();
  else if (s.phase === 'dawn') panel = dawnPanel();
  else if (s.phase === 'end') panel = endPanel();
  else panel = overPanel();
  return panel;
}

/* ---------------------------------------------------------------- the rosters */

function livingRows() {
  const opts = (p) =>
    `<option value=""${p.job ? '' : ' selected'}>No job</option>${WORK_ROOMS.filter((id) => jobCap(s, id) > 0 || p.job === id)
      .map((id) => {
        const cap = jobCap(s, id);
        const full = p.job !== id && jobCount(s, id) >= cap;
        return `<option value="${id}"${p.job === id ? ' selected' : ''}${full ? ' disabled' : ''}>${DAY_ROOMS[id].name}${Number.isFinite(cap) ? ` ${jobCount(s, id)}/${cap}` : ''}</option>`;
      })
      .join('')}`;
  return s.living
    .map((p) => {
      const tags = [
        p.sick > 0 ? `<span class="tag sick">Sick, ${fmt(p.sick / dayTicks(s))} days</span>` : '',
        p.grief ? '<span class="tag grief">Grieving</span>' : '',
        p.peace > 0 ? '<span class="tag peace">At peace</span>' : '',
        p.nightmare ? `<span class="tag grief">Nightmare: ×${s.tuning.nightmareMult} today</span>` : '',
        isTwinnedLiving(s, p) ? '<span class="tag twin">Twinned</span>' : '',
      ].join('');
      const b = p.bond ? byId(s.living, p.bond.with) || byId(s.shades, p.bond.with) : null;
      const bond = b ? `${b.name}'s ${BOND_OTHER[p.bond.rel] || p.bond.rel}${byId(s.shades, b.id) ? ' (a shade)' : ''}` : '';
      return `<div class="prow${ui.person === p.id ? ' is-selected' : ''}" id="prow-${p.id}">
        <div class="pname"><button class="linkish" id="pick-${p.id}" data-act="person" data-id="${p.id}" aria-pressed="${ui.person === p.id}"><b>${esc(p.name)}</b></button><small>${p.age}</small></div>
        <div class="pwork">${p.age === 'child' ? '<small class="muted">Too young to work, until spring</small>' : `<select id="job-${p.id}" data-act="assign" data-id="${p.id}" aria-label="Job for ${esc(p.name)}"${s.phase === 'day' || s.phase === 'dusk' || s.phase === 'dawn' ? '' : ' disabled'}>${opts(p)}</select>`}</div>
        <div class="pstat">${tags}</div>
        ${bond ? `<div class="pbond">${esc(bond)}</div>` : ''}
        ${livingTraitText(p)}
      </div>`;
    })
    .join('');
}

function shadeRows() {
  const L = lightMap(K(), s.tuning, s.night?.candles || []);
  return s.shades
    .map((d) => {
      const pick = canWork(d) && (s.phase === 'dusk' || s.phase === 'night');
      return `<div class="srow${ui.selected === d.id ? ' is-selected' : ''}" id="srow-${d.id}">
        <div class="who">
          <div><b>${esc(d.name)}</b>${kindTag(d.kind)}${d.named ? '<span class="tag peace">Named</span>' : ''}${isTwinnedShade(s, d) ? '<span class="tag twin">Twinned</span>' : ''}${whispers(s, d) ? `<span class="tag twin">Whispers to the ${DAY_ROOMS[tradeOf(s, d)].name}</span>` : stepsThrough(s, d) ? `<span class="tag twin">Works in the ${DAY_ROOMS[d.byDay.room].name} by day</span>` : atGate(s, d) ? '<span class="tag twin">Stands at the gate today</span>' : ''}</div>
          ${shadeTraitText(d)}
          ${canWork(d) || d.deep ? `<div><span class="memory${d.memory < 40 ? ' low' : ''}" aria-hidden="true"><i data-bar="mem" data-arg="${d.id}"></i></span><small><span data-live="mem" data-arg="${d.id}">${Math.ceil(d.memory)}</span> memory, <span data-live="status" data-arg="${d.id}">${esc(shadeStatus(d, L))}</span></small></div>` : `<small>${esc(shadeStatus(d, L))}</small>`}
        </div>
        <div class="acts">${pick ? `<button class="btn sm" id="sel-${d.id}" data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}">Select</button>` : ''}${byDaySelect(d)}</div>
      </div>`;
    })
    .join('');
}

// What a shade does by day: rest, whisper its old trade, or (from a great glass) work a room in person.
function byDaySelect(d) {
  if (!s.tuning.whispers || !canWork(d) || !(s.phase === 'day' || s.phase === 'dawn')) return '';
  const trade = tradeOf(s, d);
  const R = DAY_ROOMS[trade];
  const cur = d.byDay ? (d.byDay.how === 'whisper' ? 'whisper' : `step:${d.byDay.room}`) : '';
  const opts = [`<option value=""${cur ? '' : ' selected'}>Rests by day</option>`];
  if (R?.out && jobCap(s, trade) > 0) {
    const taken = s.shades.find((x) => x !== d && whispers(s, x) && tradeOf(s, x) === trade);
    opts.push(`<option value="whisper"${cur === 'whisper' ? ' selected' : ''}${taken ? ' disabled' : ''}>Whispers to the ${R.name}${taken ? ` (${esc(taken.name)} does)` : ''}</option>`);
  }
  if (inGreatGlass(s, d)) {
    for (const id of WORK_ROOMS.filter((k) => jobCap(s, k) > 0)) {
      const cap = jobCap(s, id);
      const full = cur !== `step:${id}` && handsAt(s, id) >= cap;
      opts.push(`<option value="step:${id}"${cur === `step:${id}` ? ' selected' : ''}${full ? ' disabled' : ''}>Works in the ${DAY_ROOMS[id].name}${Number.isFinite(cap) ? ` ${handsAt(s, id)}/${cap}` : ''}</option>`);
    }
  }
  if (opts.length === 1) return '';
  return `<select id="byday-${d.id}" data-act="by-day" data-id="${d.id}" aria-label="What ${esc(d.name)} does by day">${opts.join('')}</select>`;
}

function rosterHTML() {
  const cap = capacity(s);
  const dead = `<div class="roster dead"><div class="roster-head"><h2>The dead</h2><span class="count">${s.shades.length}</span><button class="btn sm" id="people-book" data-act="book">Book of the Dead</button><p>${cap.used} of ${cap.cap} mirror places taken. Loyal shades fight hardest; Serene ones work best. Memory weakens both.${traitsOn() ? ' Death turns each one\'s trait over.' : ''}</p></div>
    <div class="rows">${shadeRows() || '<p class="empty" style="padding:12px">The glass is empty.</p>'}</div></div>`;
  const living = `<div class="roster"><div class="roster-head"><h2>The living</h2><span class="count">${s.living.length}</span><p>${priests(s)} ${priests(s) === 1 ? 'priest' : 'priests'}, defense ${fmt(defense(s))}. Bonded pairs split across the Veil work ×${s.tuning.twinMult} when the shade is posted in the twin of the living one's room.</p></div>
    <div class="rows">${livingRows()}</div></div>`;
  return `<div class="rosters">${s.phase === 'day' ? living + dead : dead + living}</div>`;
}

/* ---------------------------------------------------------------- records */

function logTab() {
  const when = (l) => `S${l.season} d${l.day} ${l.phase === 'day' ? hhmm(6 + (12 * l.t) / dayTicks(s)) : l.phase === 'night' ? hhmm(18 + (12 * l.t) / nightTicks(s)) : l.phase}`;
  return `<ul class="log" id="log">${s.log.slice(-250).reverse().map((l) => `<li><span class="when">${when(l)}</span><span class="${l.tone}">${esc(l.text)}</span></li>`).join('')}</ul>`;
}
function daysTab() {
  const days = [...s.days.filter((d) => d.day > 0)];
  if (!days.length) return '<p class="hint">Each day gets a row here once its dawn is done: deaths, the raid, the Church, the night and Dread.</p>';
  const rows = days
    .reverse()
    .map((d) => {
      const n = d.night || {};
      return `<tr><td class="num">${d.season}.${d.day}</td><td class="num">${d.deaths.length}</td><td>${d.raid ? `${d.raid.crusade ? 'crusade ' : ''}${d.raid.held ? 'held' : 'breached'}` : '—'}</td><td>${d.inspection ? d.inspection.verdict : '—'}</td>
        <td class="num">${n.spawned ?? '—'}</td><td class="num">${n.crossed ?? '—'}</td><td class="num">${n.grabbed ?? '—'}</td><td>${n.lost?.length ? esc(n.lost.join(', ')) : '—'}</td><td>${n.hollow || '—'}</td><td class="num">${d.dread ?? '—'}</td></tr>`;
    })
    .join('');
  return `${s.actionsFrom > 1 ? `<p class="hint">A long keep's save keeps its last two years of days: these are from season ${s.actionsFrom}.</p>` : ''}<div class="table-wrap" id="days-wrap"><table class="ledger days"><thead><tr><th>Day</th><th>Deaths</th><th>Raid</th><th>Church</th><th>Creepers</th><th>Through</th><th>Caught</th><th>Lost</th><th>Hollow</th><th>Dread</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bookTab() {
  const book = s.ledger;
  if (!book.length) return '<p class="hint">No one has died yet. When they do, their story is written here.</p>';
  const still = book.filter((e) => !e.end && e.woke && e.woke !== 'funeral').length;
  const rest = book.filter((e) => RESTING.includes(e.end)).length;
  const lost = book.filter((e) => LOST.includes(e.end)).length;
  const seasons = [...new Set(book.map((e) => e.season))].sort((a, b) => b - a);
  const title = (k) => (k === 0 ? 'Before you came' : `The ${ordinal(k)} season`);
  return `<p class="note">${plural(book.length, 'name')}: ${still} still bound, ${rest} at rest, ${lost} lost.</p>
    ${seasons
      .map((k) => `<section class="book"><h3 class="eyebrow">${title(k)}</h3>${book
        .filter((e) => e.season === k)
        .sort((a, b) => a.day - b.day)
        .map((e) => `<article class="bookpage${e.end && e.end !== 'funeral' ? ' is-ended' : ''}${e.from === 'raider' ? ' is-raider' : ''}">
          <header><b>${esc(e.name)}</b>${e.woke && KINDS[e.woke] ? kindTag(e.woke) : ''}${e.named ? '<span class="tag peace">Named</span>' : ''}</header>
          <p>${esc(epitaph(e, { traits: traitsOn() }))}</p></article>`)
        .join('')}</section>`)
      .join('')}`;
}
function exportJSON() {
  return JSON.stringify(
    {
      game: 'afterglass-season',
      save: SAVE_VERSION,
      build: BUILD,
      exported: new Date().toISOString(),
      seed: s.seed,
      daily: s.daily || null,
      now: { season: s.season, day: s.day, phase: s.phase, t: s.t },
      seasons: s.seasons,
      days: s.days,
      ledger: s.ledger,
      tuning0: s.tuning0,
      tuning: s.tuning,
      actions: s.actions,
      actionsFrom: s.actionsFrom || 1,
      test: s.test || null,
      trail: s.trail || [],
    },
    null,
    1,
  );
}
function playtestTab() {
  const answered = s.seasons.filter((e) => e.answer);
  return `${testCard()}<p>The question for weeks 7–10: <b>would you play a second season?</b> It's asked when a season ends or the keep falls. ${answered.length ? `Answers so far: ${answered.map((e) => `season ${e.season}, ${e.answer === 'again' ? 'yes' : 'no'}`).join('; ')}.` : 'No answer yet.'}</p>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy playtest export</button><button class="btn" id="btn-show-export" data-act="show-export" aria-expanded="${ui.showExport}">${ui.showExport ? 'Hide export' : 'Show export'}</button><span class="hint">${esc(ui.copied)}</span></div>
    ${ui.showExport ? `<label for="export">Export (JSON)</label><textarea id="export" rows="8" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">The export holds your answers and notes, every day's numbers, the ledger of the dead, the seed and every action, so a session replays exactly, and the trail: when you paused, opened a panel or sat idle. Menu, Saves, Watch a playtest plays one back.${s.actionsFrom > 1 ? ` This keep has run so long that its save keeps only the last two years (from season ${s.actionsFrom}) of days and actions, so its export no longer plays back.` : ''}</p>`;
}
const TUNE = [
  ['daySecs', 'Day length, seconds at 1×'],
  ['nightSecs', 'Night length, seconds at 1×'],
  ['creepersBase', 'Creepers on night 0'],
  ['creepersPerNight', 'Creepers added per night'],
  ['mawFrom', 'First night with a Maw'],
  ['mawsPerNight', 'Maws a night (none on the new moon)'],
  ['mawHp', 'A Maw’s strength'],
  ['mawSmash', 'Wax a second a Maw tears from a candle'],
  ['mawBreak', 'Seconds a Maw needs in a room to break it'],
  ['mawLine', 'What the candle barring the way up is worth to a Maw, in workers'],
  ['dreadPerBroken', 'Dread at dawn for each room a Maw broke'],
  ['hauntWork', 'Share of the work done the next day in a room a Maw broke'],
  ['hollowHp', 'The Hollow’s strength'],
  ['hollowAt', 'When the Hollow rises, as a share of the night'],
  ['hollowReach', 'How far the Hollow eats light, pixels'],
  ['hollowEat', 'Wax the Hollow eats per second'],
  ['wardHold', 'Seconds a ward holds the Hollow with no essence to draw on'],
  ['wardDraw', 'Essence a second a ward draws to hold the Hollow, at first (0: none)'],
  ['essenceCap', 'Most essence the store holds (0: no limit)'],
  ['newMoonCreepers', 'Creepers on the new moon, as a share of the night before'],
  ['dreadLivingPer', 'Living per point of Dread borne'],
  ['traits', 'Traits: everyone has one, and death turns it over (1 on, 0 off)'],
  ['fadePerNight', 'Memory every shade loses per night'],
  ['cracksMax', 'Veil cracks that lose the keep'],
  ['hardness', 'How much harder each season is (raids, Creepers, the Hollow)'],
  ['yearHardness', 'With the year on, how much harder each year starts than the last (0: each season harder, straight on)'],
  ['mawHardness', 'How much stronger a Maw is each season'],
  ['roomStone', 'Stone a room costs'],
  ['roomCap', 'Workers a room holds'],
  ['startStone', 'Stone a new keep starts with'],
  ['startFloors', 'Floors a new keep starts with, from the ground (1 to 4)'],
  ['steelFight', 'How much harder shades fight with grave-steel'],
  ['lineGuard', 'Shades in the light at the stairs up to the Veil only guard and keep the Watch (1 on, 0 off)'],
  ['goAround', 'The Unlit take any dark way up and gnaw only a light that bars every way (1 on, 0 off)'],
  ['fire', 'Fire by day in Hearths and Forges (1 on, 0 off)'],
  ['dreamwell', 'Beds and crowding, the Dreamwell and the Weepers (1 on, 0 off)'],
  ['whispers', 'Whispers and the great glass: the dead help by day (1 on, 0 off)'],
  ['raidFight', 'Raids fought at the gate, with pitch, stone and the bell (1 on, 0 off: decided at a throw)'],
  ['raidFightStrength', 'A Host you can fight back comes this many times stronger'],
  ['granaryGuards', 'A Granary halves the food raiders carry off (1 on; 0: every keep\'s food halved, as before)'],
  ['emboldenCarries', 'Paying off the season\'s last raid makes the next season\'s raids harder (1 on, 0 off)'],
  ['year', 'A year of four seasons, days and nights shifting, ending with the Long Night (1 on, 0 off)'],
  ['longNight', 'The Long Night lasts this many winter nights'],
  ['longNightCreepers', 'The Long Night brings this many times a night\'s Creepers'],
  ['requests', 'The dead ask for things at the rite (1 on, 0 off)'],
  ['refusals', 'Refused this many times, a shade turns Restless'],
  ['plague', "Summer's plague: sickness in a crowded keep takes one more for every few beyond the beds (1 on, 0 off)"],
  ['plagueCrowd', 'The plague takes one more for every this many living beyond the beds'],
  ['siege', "Autumn's siege: the Host camps outside after its day-2 raid (1 on, 0 off)"],
  ['siegeDays', 'Days the siege lasts'],
  ['weather', 'Weather: rain slows the Yard and damps fire, and brings the Drowned; fog clouds the black mirror (1 on, 0 off)'],
  ['rainYard', 'Share of the Yard’s stone quarried in the rain'],
  ['drownedBase', 'The Drowned on a rainy night, before one more every few nights'],
  ['deep', 'Down into the Deep: shades sent down at dusk bring back quicksilver to upgrade mirrors (1 on, 0 off)'],
  ['deepDrain', 'Memory a shade caught in the Deep loses'],
  ['generations', 'Generations: from the second year the living age each spring, pair off and have children (1 on, 0 off)'],
  ['oldChance', 'Chance each spring that an adult grows old'],
  ['birthChance', 'Chance each season that a couple has a child'],
  ['church', "The Lantern Church's escalation: an embargo after a censure, the Inquisition after a second (1 on, 0 off)"],
  ['embargoDays', "Days the Church's silver embargo lasts"],
  ['inquisitionDays', 'Days the Inquisition inspects the keep every noon, unless a blessing sends it away sooner'],
  ['donation', 'Remembrance a donation to lift the embargo takes'],
  ['crusade', 'The crusade: censured under the Inquisition, the keep faces a crusade at the gate (1 on, 0 off)'],
  ['crusadeDays', 'Days from the crusade being proclaimed to its coming'],
  ['crusadeBase', "The crusade's strength, as a raid's base (harder each season)"],
  ['acts', "Shade acts: each shade's one act a night, paid in its memory (1 on, 0 off)"],
  ['standFight', 'How much harder a Loyal shade strikes while it Stands'],
  ['lureReach', "How far a Stranger's Lure reaches, in pixels"],
  ['lanterns', 'Lanterns: a shade carries a light of its own, for a candle (1 on, 0 off)'],
  ['lanternWax', 'Seconds a lantern burns'],
  ['errands', 'Errands: echoes, relics and sleepwalkers in the dark below the line (1 on, 0 off)'],
  ['echoMemory', 'Memory an echo gives the shade that finds it'],
  ['relicGlass', 'Glass a relic brings'],
  ['sleepChance', 'Chance a night brings a sleepwalker, from night 3 (not the new moon)'],
  ['sleepHold', 'Seconds the Unlit hold a sleepwalker before they die'],
  ['omens', 'Omens: a night of a different shape, shown at dusk (1 on, 0 off)'],
  ['omenChance', 'Chance a night has an omen, from night 2 (not the new moon)'],
  ['omenChoice', 'Chance an omen night offers two to choose between'],
  ['huntEssence', 'Essence for each Maw cut down under the Hunt'],
  ['bloodEssence', 'Essence for each Creeper cut down under a blood moon'],
  ['visitors', 'Visitors at the gate, each with answers to choose between (1 on, 0 off)'],
  ['visitorChance', 'Chance a visitor comes on a day'],
  ['visitorSecond', 'Chance, on a day one comes, that a second does too'],
  ['visitorWait', 'Share of the day a visitor waits for an answer'],
  ['charmBurn', "How fast candles burn the night of the hedge-witch's charm"],
  ['library', 'The Library, its studies and the Archive of the Dead (1 on, 0 off)'],
  ['lorePerSec', "Lore a shade reading in the Archive adds each second"],
  ['hall', "The Hall's decrees and the Court of Shades (1 on, 0 off)"],
  ['gatehouse', 'The Gatehouse, the Host’s ladders and the Undergate (1 on, 0 off)'],
  ['laddersFrom', 'The season (of the keep) from which the Host brings ladders'],
  ['ladderEvery', 'Seconds between ladders at the gate'],
  ['ladderHost', 'What each ladder left standing adds to the Host'],
  ['undergateFrom', 'The season (of the keep) from which the Undergate opens'],
  ['undergateChance', 'Chance the Undergate stirs on a night, from the season it opens'],
  ['undergatePerTide', 'Creepers of each tide that come up the Undergate when it stirs'],
  ['eclipse', "Midsummer's eclipse, with the year on (1 on, 0 off)"],
  ['eclipseDay', 'The day of summer the eclipse comes'],
  ['eclipseAt', 'When the sun goes dark, as a share of the day'],
  ['eclipseSecs', 'Seconds the sun stays dark'],
  ['eclipseCreepers', "The eclipse's Creepers, as a share of that night's"],
  ['eclipseTide', 'When its tide comes, as a share of the eclipse'],
  ['eclipseTwin', 'How much harder a living person and their dead work and fight side by side in it'],
];
const KEYS = [
  ['Space', 'play or pause'], ['1, 2, 4', 'speed'], ['C, M, W, H', 'candle, move, ward, hush (at night)'], ['V', 'turn the Tain upright'],
  ['+ and −, 0', 'zoom, and fit the castle again'], ['Arrows', 'pan by day; from dusk, move the cursor on the Tain (Shift and the arrows pan)'],
  ['Enter', 'at the cursor: set a candle, pick or send a shade, or ward, by the tool'], ['[ and ]', 'pick the previous or next shade'],
  ['A', "the picked shade's act, at night or in the eclipse"], ['T', "the picked shade's lantern: light it, or set it down"], ['N', 'at night, skip to the next mark on the tide clock'],
  ['K, P, R, B', 'this phase, People, Records, Build'], ['L', 'room names'],
  ['S', 'sound on or off'], ['Esc', 'the Menu, or close a panel'],
];
function settingsTab() {
  const radio = (name, v, label, cur) => `<label class="row" for="${name}-${v}"><input type="radio" name="${name}" id="${name}-${v}" data-act="${name}" value="${v}"${cur === v ? ' checked' : ''}>${label}</label>`;
  const motion = prefs.motion || 'system';
  return `<section class="settings">
    <h3>Play</h3>
    <p class="note">This keep is ${PRESETS[s.preset]?.name.toLowerCase() || 'standard'}${s.custom ? ', with custom rules' : ''}${s.daily ? ", as today's keep is for everyone" : ''}. A new keep's difficulty and rules are chosen under New game on the main screen, or in Saves.</p>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause for raids, fires, catches, the Hollow and the eclipse</label>
    <label class="row" for="guide-on"><input type="checkbox" id="guide-on" data-act="guide-toggle"${prefs.guide ? ' checked' : ''}>Guide me through the first season (turning it on starts it over)</label>
    <h3>The castle</h3>
    <fieldset><legend>The Tain at night</legend>${radio('camera', 'reflection', 'Reflected, upside down, as the lake shows it', prefs.mode)}${radio('camera', 'flipped', 'Turned upright', prefs.mode)}</fieldset>
    <label class="row" for="labels-on"><input type="checkbox" id="labels-on" data-act="labels"${prefs.labels ? ' checked' : ''}>Show room names on the castle</label>
    <label class="row" for="ways-set"><input type="checkbox" id="ways-set" data-act="ways"${prefs.ways !== false ? ' checked' : ''}>At dusk, show on the Tain where the Unlit will go</label>
    <fieldset><legend>Motion</legend>${radio('motion', 'system', `As this device is set (now: ${SYS_REDUCED ? 'less motion' : 'full motion'})`, motion)}${radio('motion', 'reduce', 'Less motion: the camera cuts, nothing flickers or sways, the crossing is skipped', motion)}${radio('motion', 'full', 'Full motion', motion)}</fieldset>
    <h3>Sound</h3>
    <label class="row" for="sound-on"><input type="checkbox" id="sound-on" data-act="sound"${prefs.sound ? ' checked' : ''}>Sound</label>
    <label class="slider" for="vol-sfx"><span>Effects</span><input type="range" id="vol-sfx" data-act="volume" data-key="sfx" min="0" max="100" step="5" value="${Math.round(prefs.sfx * 100)}"${prefs.sound ? '' : ' disabled'}></label>
    <label class="slider" for="vol-amb"><span>Ambience: wind by day, the drone of the Tain at night</span><input type="range" id="vol-amb" data-act="volume" data-key="amb" min="0" max="100" step="5" value="${Math.round(prefs.amb * 100)}"${prefs.sound ? '' : ' disabled'}></label>
    ${CAN_BUZZ ? `<label class="row" for="haptics-on"><input type="checkbox" id="haptics-on" data-act="haptics"${prefs.haptics ? ' checked' : ''}>Vibrate: a tick for each candle, more for raids, deaths, cracks in the Veil and the Hollow (Android phones)</label>` : '<p class="hint">This browser can\'t vibrate. iPhones and iPads don\'t allow it for web pages.</p>'}
    <details class="hear" id="hear" data-keep="hear"${ui.open.hear ? ' open' : ''}><summary>What each sound means</summary>
      ${prefs.sound ? '' : '<p class="hint">Sound is off.</p>'}
      <div class="hear-list">${Object.entries(SOUNDS).map(([k, S]) => `<button class="btn sm" id="hear-${k}" data-act="hear" data-cue="${k}"${prefs.sound ? '' : ' disabled'}>${esc(S.label)}</button>`).join('')}</div>
    </details>
    <h3 class="keys-h">Keys</h3>
    <dl class="keys">${KEYS.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${installHTML('settings')}
    ${devMode() ? `<details class="advanced" id="advanced" data-keep="advanced"${ui.open.advanced ? ' open' : ''}><summary>Advanced: the playtest numbers</summary>
      <div class="fields">${TUNE.map(([k, label]) => `<label for="tune-${k}">${esc(label)}<input type="number" id="tune-${k}" data-act="tune" data-key="${k}" value="${esc(String(s.tuning[k]))}" min="0" step="any"${s.daily ? ' disabled' : ''}></label>`).join('')}</div>
      ${s.daily ? `<p class="note">This is the keep of ${esc(dayText(s.daily))}, the same for everyone, so its numbers are locked.</p>` : ''}
      <p class="hint">These are this keep's numbers. Changes apply from the next tick or the next dusk, and are recorded, so exports still replay. A new keep keeps only the ones you set. Seed ${s.seed}.</p>
    </details>` : ''}
    <p class="hint build">Build ${esc(BUILD)}${s.build && s.build !== BUILD ? `; this keep was last saved by ${esc(s.build)}` : ''}.</p>
  </section>`;
}
// The keeps in their slots: the one being played, and the rest.
const agoText = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
// A keep in a line, from its save's summary: what kind it is, and where it stands.
const keepLine = (m) => `${m.daily ? `The keep of ${dayText(m.daily)}. ` : m.tutorial ? 'The tutorial keep. ' : m.preset && PRESETS[m.preset] ? `${PRESETS[m.preset].name}. ` : ''}${m.custom ? 'Custom rules. ' : ''}${m.chapter ? `Campaign, ${CHAPTERS[m.chapter].name}. ` : ''}Season ${m.season}, ${whereText(m)}`;
function whereText(m) {
  if (m.lost) return `fallen on day ${m.day}`;
  if (m.sealed) return 'the Veil is sealed';
  if (m.opened) return 'the Veil is open';
  if (m.phase === 'end') return 'the season is over';
  if (m.phase === 'night') return `night ${m.day}`;
  if (m.phase === 'dusk') return `dusk, day ${m.day}`;
  if (m.phase === 'dawn') return m.day === 0 ? 'the first dawn' : `dawn after night ${m.day}`;
  return `day ${m.day}`;
}
// Today's keep: continue it where a slot holds it, else start it in an empty slot, else offer to put it in
// place of the keep being played.
const SLOT_NUMS = () => Array.from({ length: SLOTS }, (_, i) => i + 1);
const dailyHeld = () => SLOT_NUMS().find((n) => (n === saves.current ? s.daily : saves.slots[n]?.daily) === dayKey()) || null;
const tutorialHeld = () =>
  SLOT_NUMS().find((n) => (n === saves.current ? isTutorial(s) && s.season === 1 && !s.tut?.over : saves.slots[n]?.tutorial && saves.slots[n].season === 1 && !saves.slots[n].tutorialOver)) || null;
function dailyHTML() {
  const key = dayKey();
  const nums = SLOT_NUMS();
  const holds = dailyHeld();
  const empty = nums.find((n) => n !== saves.current && !saves.slots[n]);
  let acts;
  if (holds === saves.current) acts = "<p class=\"hint\">It's the keep you're playing.</p>";
  else if (holds) acts = `<div class="row"><button class="btn sm primary" id="daily-go" data-act="slot-play" data-n="${holds}">Continue it, in keep ${holds}</button></div>`;
  else if (ui.confirmSlot?.kind === 'daily') {
    acts = `<p class="note bad">Put today's keep in keep ${saves.current}, in place of the one you're playing? That one is lost unless you exported it.</p><div class="row"><button class="btn sm primary" id="daily-yes" data-act="slot-yes" data-n="${saves.current}">Play today's keep</button><button class="btn sm" id="daily-no" data-act="slot-no">Cancel</button></div>`;
  } else if (empty) acts = `<div class="row"><button class="btn sm primary" id="daily-go" data-act="daily" data-n="${empty}">Play it, in keep ${empty}</button></div>`;
  else acts = `<div class="row"><button class="btn sm" id="daily-go" data-act="daily-ask">Play it in keep ${saves.current}</button></div>`;
  return `<div class="card daily"><h3>Today's keep: ${esc(dayText(key))}</h3>
    <p class="note">Everyone who plays on this date, wherever they are, gets this same keep, on the rules as they ship: your own numbers from Settings are set aside, and can't be changed in it. Its recap card names the day, so you can compare how it went. A new one comes at your midnight.</p>${acts}</div>`;
}
// The tutorial keep: continue it where a slot holds one still in its first season, else start it in an empty
// slot, else offer to put it in place of the keep being played.
function tutorialHTML() {
  const nums = SLOT_NUMS();
  const holds = tutorialHeld();
  const empty = nums.find((n) => n !== saves.current && !saves.slots[n]);
  let acts;
  if (holds === saves.current) acts = "<p class=\"hint\">It's the keep you're playing.</p>";
  else if (holds) acts = `<div class="row"><button class="btn sm primary" id="tutorial-go" data-act="slot-play" data-n="${holds}">Continue it, in keep ${holds}</button></div>`;
  else if (ui.confirmSlot?.kind === 'tutorial') {
    acts = `<p class="note bad">Put the tutorial in keep ${saves.current}, in place of the one you're playing? That one is lost unless you exported it.</p><div class="row"><button class="btn sm primary" id="tutorial-yes" data-act="slot-yes" data-n="${saves.current}">Play the tutorial</button><button class="btn sm" id="tutorial-no" data-act="slot-no">Cancel</button></div>`;
  } else if (empty) acts = `<div class="row"><button class="btn sm primary" id="tutorial-go" data-act="tutorial" data-n="${empty}">Play it, in keep ${empty}</button></div>`;
  else acts = `<div class="row"><button class="btn sm" id="tutorial-go" data-act="tutorial-ask">Play it in keep ${saves.current}</button></div>`;
  return `<div class="card daily"><h3>The tutorial</h3>
    <p class="note">A keep whose first three days are set out to teach, one thing at a time: jobs and building, the dead and the night, a raid and a fire, the rite, mirrors and the Church. The Veil can't break before night ${TUTORIAL.safeUntil}, and from day ${TUTORIAL.safeUntil} it's an ordinary season.</p>${acts}</div>`;
}
function startTutorial(n) {
  retuned = 0;
  prefs.guide = true;
  savePrefs();
  return playKeep(n, newTutorial(playerTuning(s)), `The tutorial, in slot ${n}.`);
}
// How to play: the tutorial, and every lesson as a short manual, in this keep's numbers.
function howtoTab() {
  return `<section class="howto">${ui.watch ? '' : tutorialHTML()}${howTo(s.tuning)
    .map((sec) => `<div class="card" id="howto-${sec.id}"><h3>${esc(sec.title)}</h3>${sec.items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`)
    .join('')}</section>`;
}
function startDaily(n) {
  retuned = 0;
  const key = dayKey();
  return playKeep(n, newDaily(key), `Today's keep, ${dayText(key)}, in slot ${n}.`);
}
function savesTab() {
  if (ui.watch) {
    return `<section class="saves"><div class="card"><p><b>You're watching a session.</b> Your keeps are here again when you stop.</p><div class="row"><button class="btn sm primary" id="w-exit-saves" data-act="w-exit">Stop watching</button></div></div>${watchCard()}</section>`;
  }
  const slots = Array.from({ length: SLOTS }, (_, i) => i + 1).map((n) => {
    const here = n === saves.current;
    const m = here ? summary(s, Date.now()) : saves.slots[n];
    const ask = ui.confirmSlot?.n === n && ui.confirmSlot.kind !== 'daily' && ui.confirmSlot.kind !== 'tutorial' ? ui.confirmSlot : null;
    const file = `<input type="file" id="import-${n}" class="visually-hidden" data-act="import" data-n="${n}" accept=".json,application/json"><label class="btn sm" for="import-${n}">Load a file</label>`;
    let acts;
    if (ask) {
      const q = ask.kind === 'delete' ? `Delete keep ${n}? It can't be brought back unless you exported it.` : ask.kind === 'import' ? `Replace keep ${n} with the one in the file?` : `Start keep ${n} over from season 1, day 1? This keep is lost unless you exported it.`;
      acts = `<p class="note bad">${esc(q)}</p><div class="row"><button class="btn sm primary" id="slot-yes-${n}" data-act="slot-yes" data-n="${n}">${ask.kind === 'delete' ? 'Delete' : ask.kind === 'import' ? 'Replace' : 'Start over'}</button><button class="btn sm" id="slot-no-${n}" data-act="slot-no">Cancel</button></div>`;
    } else if (here) acts = `<div class="row"><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-over-${n}" data-act="slot-over" data-n="${n}">Start over</button></div>`;
    else if (m) acts = `<div class="row"><button class="btn sm primary" id="slot-play-${n}" data-act="slot-play" data-n="${n}">Continue</button><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-delete-${n}" data-act="slot-delete" data-n="${n}">Delete</button></div>`;
    else acts = `<div class="row"><button class="btn sm primary" id="slot-new-${n}" data-act="slot-new" data-n="${n}">New keep</button>${file}</div>`;
    const what = m
      ? `<p><b>${esc(keepLine(m))}</b></p><p class="hint">${plural(m.rooms, 'room')} · ${m.living} living · ${plural(m.shades, 'shade')}${here ? '' : ` · played ${esc(agoText(m.saved))}`}</p>`
      : '<p class="hint">Empty.</p>';
    return `<div class="kslot${here ? ' is-here' : ''}" id="slot-${n}"><div class="kslot-head"><span class="eyebrow">Keep ${n}</span>${here ? '<span class="tag">Playing</span>' : ''}</div>${what}${acts}</div>`;
  }).join('');
  return `<section class="saves">
    ${dailyHTML()}
    ${tutorialHTML()}
    <p class="note">Each keep saves itself as you play. Export writes a keep to a file you can keep or send; Load a file takes that file back${devMode() ? ", or a tester's playtest export, which is replayed into the keep it came from" : ''}.</p>
    ${presetPicker('saves')}
    ${campaignPicker('saves')}
    ${customPicker('saves')}
    <div class="kslots">${slots}</div>
    ${ui.slotMsg ? `<p class="note bad" role="alert">${esc(ui.slotMsg)}</p>` : ''}
    ${devMode() ? watchCard() : ''}
  </section>`;
}
const MENU_TABS = [['settings', 'Settings'], ['saves', 'Saves'], ['howto', 'How to play']];
function menuHTML() {
  const tab = MENU_TABS.some(([k]) => k === ui.menuTab) ? ui.menuTab : 'settings';
  const body = { settings: settingsTab, saves: savesTab, howto: howtoTab }[tab]();
  const back = ui.watch || ui.title ? '' : '<div class="row"><button class="btn" id="btn-title" data-act="title-open">Main menu</button><span class="hint">Continue, a new keep, the tutorial, today\'s keep.</span></div>';
  return `${testCard()}${back}<div class="tabs" role="tablist" aria-label="Menu">${MENU_TABS.map(([k, l]) => `<button class="tab" role="tab" id="menu-tab-${k}" data-act="menu-tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="menupanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="menupanel" aria-labelledby="menu-tab-${tab}">${body}</div>`;
}
const ALL_TABS = [['book', 'Book of the Dead'], ['log', 'Log'], ['days', 'Days'], ['playtest', 'Playtest']];
const TABS_NOW = () => ALL_TABS.filter(([k]) => k !== 'playtest' || playtesting());
function recordsHTML() {
  const TABS = TABS_NOW();
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'log';
  const body = { book: bookTab, log: logTab, days: daysTab, playtest: playtestTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tabpanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}


/* ---------------------------------------------------------------- the playtest kit: the trail */

// The trail (round six's playtest kit): what the player did on the page besides act, kept in the keep and
// sent with its playtest export, so the replay viewer can mark it: pauses (whose, and why), speeds and
// skips, panels and tabs opened, tools picked, lessons shown, actions the game refused, and stretches with
// no input while the clock stood still, or away from the page. Each has where in the game it happened (as
// an action's at) and when on the clock (w, ms). Nothing leaves the device but in an export the player makes.
const TRAIL_MAX = 4000;
const IDLE_MS = 20000;
const gameAt = () => ({ season: s.season, day: s.day, phase: s.phase, t: s.t });
const sameAt = (a, b) => a.season === b.season && a.day === b.day && a.phase === b.phase && a.t === b.t;
function trail(k, more = {}) {
  if (ui.watch) return;
  if (k !== 'load' && more.by !== 'game') dirty = true;
  s.trail ||= [];
  s.trail.push({ k, at: gameAt(), w: Date.now(), ...more });
  if (s.trail.length > TRAIL_MAX) s.trail.splice(0, s.trail.length - TRAIL_MAX);
}
// Idle: a stretch of IDLE_MS or more with no input and the game where it was at the start (paused, or a
// panel waiting on a choice), kept when the next input comes. Watching the night go by isn't idle.
let lastInput = { w: Date.now(), at: null };
function onInput() {
  const now = Date.now();
  if (lastInput.at && now - lastInput.w >= IDLE_MS && sameAt(lastInput.at, gameAt())) trail('idle', { at: lastInput.at, w: lastInput.w, ms: now - lastInput.w });
  lastInput = { w: now, at: gameAt() };
}
for (const type of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(type, onInput, { capture: true, passive: true });
const hideSave = () => {
  if (dirty || (running() && !ui.paused)) saveGame();
};
window.addEventListener('pagehide', hideSave);
let awayFrom = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    awayFrom = { at: gameAt(), w: Date.now() };
    hideSave(); // a tab closed, or an app switched away from, keeps everything to here
  } else if (awayFrom) {
    const ms = Date.now() - awayFrom.w;
    if (ms >= 2000) trail('away', { at: awayFrom.at, w: awayFrom.w, ms });
    awayFrom = null;
    lastInput = { w: Date.now(), at: gameAt() };
  }
});
// Which tab a panel opened on, for the trail.
const tabOf = (name) => (name === 'records' ? { tab: prefs.tab } : name === 'menu' ? { tab: ui.menuTab || 'settings' } : {});
// The screen the game is played on, for the trail: its size and whether it's touched or pointed at.
const deviceNow = () => ({ vw: window.innerWidth, vh: window.innerHeight, touch: !!window.matchMedia?.('(pointer: coarse)').matches });

/* ---------------------------------------------------------------- the playtest kit: the tester link */

// The tester link (season.html?test, or ?test=name to put a name on the file): the tutorial in a keep of
// its own, with a note on what the test is. When the tutorial ends, or whenever the tester says they're
// done, three questions, and one button to send the session back: shared as a file where the device can,
// saved as one where it can't, or copied as text. There's no server: sessions come back by hand.
const QUESTIONS = [
  ['night', 'In a sentence or two: what are you trying to do at night?'],
  ['stuck', 'Where were you confused, or stuck?'],
];
// A keep for the test: this one if nothing has been done in it yet, else the first empty slot.
const freeSlot = () => (untouched() ? saves.current : Array.from({ length: SLOTS }, (_, i) => i + 1).find((n) => n !== saves.current && !saves.slots[n]));
function startTest(label) {
  prefs.introDone = true;
  savePrefs();
  if (s.test) {
    ui.testNote = true;
    return openSheet('test', 'game');
  }
  const n = freeSlot();
  if (!n) {
    ui.testAsk = { label };
    return openSheet('test', 'game');
  }
  return beginTest(n, label);
}
function beginTest(n, label) {
  retuned = 0;
  ui.testAsk = null;
  prefs.guide = true;
  prefs.guideSeen = {};
  savePrefs();
  const g = newTutorial({});
  g.test = { label: label || null, started: Date.now(), answers: {}, sent: null };
  playKeep(n, g, '');
  ui.toasts = []; // the note says it all
  ui.toastRev++;
  trail('start', { label: label || null, ...deviceNow() });
  saveGame();
  ui.testNote = true;
  return openSheet('test', 'game');
}
function testHTML() {
  const T = s.test;
  if (ui.testAsk || !T) {
    return `<div class="card test"><h2>Thank you for testing</h2>
      <p>The test needs a keep of its own, and all ${SLOTS} here are in use. It can go in keep ${saves.current}, in place of the one being played, which is lost unless you export it first (Menu, then Saves).</p>
      <div class="row"><button class="btn primary" id="test-here" data-act="test-here">Use keep ${saves.current}</button><button class="btn" id="test-cancel" data-act="sheet-close">Not now</button></div></div>`;
  }
  if (ui.testNote) {
    return `<div class="card test"><h2>Thank you for testing</h2>
      <p>This is Afterglass's tutorial: the first three days and nights of a keep, one thing at a time, about 20 minutes. Play it the way you'd play any game. There's nothing to get right, and you can stop whenever you like.</p>
      <p>When the tutorial ends, or when you stop (Menu, then Done testing), there are three short questions and a button to send your session back.</p>
      <p class="hint">What you send: your answers, what you did in the game, when you paused, opened a panel or sat idle, and your screen's size. Nothing leaves this device unless you send it.</p>
      <div class="row"><button class="btn primary" id="test-begin" data-act="test-begin">${s.actions.length || s.day > 1 || s.phase !== 'day' || s.t > 0 ? 'Carry on' : 'Begin'}</button></div></div>`;
  }
  const A = T.answers || {};
  const q = ([k, text]) => `<label for="test-${k}">${esc(text)}</label><textarea id="test-${k}" rows="3" data-test="${k}">${esc(A[k] || '')}</textarea>`;
  return `<div class="card test"><h2>Your playtest</h2>
    <p>${T.sent ? 'Sent: thank you. Play on if you like, and send it again at the end; the new one has everything.' : 'Thank you for playing. Three questions, then one button.'}</p>
    ${QUESTIONS.map(q).join('')}
    <p id="test-again-q"><b>Would you keep playing?</b></p>
    <div class="row" role="group" aria-labelledby="test-again-q">
      <button class="btn" id="test-yes" data-act="test-again" data-v="yes" aria-pressed="${A.again === 'yes'}">Yes</button>
      <button class="btn" id="test-no" data-act="test-again" data-v="no" aria-pressed="${A.again === 'no'}">No</button>
    </div>
    <label for="test-why">What would make you, or stop you?</label><textarea id="test-why" rows="2" data-test="why">${esc(A.why || '')}</textarea>
    <div class="row"><button class="btn primary" id="test-send" data-act="test-send">Send it back</button><button class="btn" id="test-copy" data-act="test-copy">Copy as text</button></div>
    ${ui.testMsg ? `<p class="note" role="status">${esc(ui.testMsg)}</p>` : ''}
    ${ui.testShow ? `<label for="test-text">Your session, as text</label><textarea id="test-text" rows="6" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">Send it back shares your session as a file where this device can, and saves the file where it can't: then send that file to whoever asked you to test. Copy as text puts the same thing on the clipboard, to paste into a message.</p>
    <div class="row"><button class="btn" id="test-on" data-act="sheet-close">Keep playing</button></div></div>`;
}
// Where a test keep's Menu and Playtest tab point: the questions.
function testCard() {
  const T = s.test;
  if (!T) return '';
  return `<div class="card test-menu"><p><b>You're testing.</b> ${T.sent ? 'Sent: thank you. It can be sent again after playing on.' : 'Done? Three questions, and your session goes back.'}</p>
    <div class="row"><button class="btn sm primary" id="test-done" data-act="test-open">${T.sent ? 'Send it again' : 'Done testing'}</button></div></div>`;
}
const testFile = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const who = (s.test?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return `afterglass-playtest-${who ? `${who}-` : ''}${stamp}.json`;
};
function testSent(msg, show = false) {
  ui.testMsg = msg;
  ui.testShow = show;
  if (!show) {
    s.test.sent = Date.now();
    saveGame();
  }
  bump();
}
// One button: the device's share sheet with the file where it takes files, else the file saved. The share
// has to start inside the tap, so nothing is awaited before it.
async function sendTest() {
  const name = testFile();
  const file = new File([exportJSON()], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Afterglass playtest', text: 'My Afterglass playtest session.' });
      return testSent('Sent: thank you!');
    }
  } catch (e) {
    if (e?.name === 'AbortError') return undefined; // the share sheet was closed: nothing went
  }
  saveFile(file, name);
  return testSent(`Saved as ${name}. Send that file to whoever asked you to test: thank you!`);
}
function copyTest() {
  const blocked = () => testSent('Copying was blocked here. The session is below: select it all, copy it, and paste it into a message.', true);
  try {
    navigator.clipboard.writeText(exportJSON()).then(() => testSent('Copied. Paste it into a message to whoever asked you to test: thank you!'), blocked);
  } catch {
    blocked();
  }
}

/* ---------------------------------------------------------------- the playtest kit: the replay viewer */

// The replay viewer (round six's playtest kit): a playtest export played back in this page at 1× to 16×,
// with the moments that mattered (deaths, cracks, catches, a fall) and the tester's own pauses, panels, idle
// stretches and lessons marked on a timeline in the bar (src/slice/watch.js). The keep being played is saved
// first and comes back after; while watching nothing is saved, and nothing in the session can be changed.
const WATCH_SPEEDS = [1, 2, 4, 8, 16];
const ACT_HOLD = 0.35; // seconds at 1× on each of the tester's actions while the clock runs
const MARK_HOLD = 1.2; // and on a pause of theirs, an idle stretch or a time away
const HOLDS = { pause: 1, idle: 1, away: 1 };
// The marks Next and Back stop at, and the session's list shows: all but the lesser alerts.
const STOPS_AT = { death: 1, crack: 1, caught: 1, fell: 1, visit: 1, pause: 1, idle: 1, away: 1, refused: 1, lesson: 1, panel: 1, skip: 1 };
const LEAD = 20; // Next and Back land this many units (2 s at 1×) before a mark, to see it come
// Where in the game a moment was, in words: "Night 2, 21:40", "Season 2, dawn, day 3".
function whenText(at) {
  if (!at) return '';
  const g = { ...s, season: at.season, day: at.day, phase: at.phase };
  const clock = at.phase === 'day' ? hhmm(6 + (12 * at.t) / dayTicks(g)) : at.phase === 'night' ? hhmm(18 + (12 * at.t) / nightTicks(g)) : '';
  const where = at.phase === 'day' ? `Day ${at.day}` : at.phase === 'night' ? `Night ${at.day}` : at.phase === 'over' ? `Day ${at.day}, the fall` : `${upper(at.phase)}, day ${at.day}`;
  return `${at.season > 1 ? `Season ${at.season}, ` : ''}${where}${clock ? `, ${clock}` : ''}`;
}
function watchText(text, name) {
  const r = readExport(text);
  if (r.error) {
    ui.watchMsg = r.error;
    return bump();
  }
  ui.watchMsg = 'Getting the session ready…';
  bump();
  // A frame for the message first: a whole year takes a second or two to play through once.
  setTimeout(() => startWatch(r.x, name), 40);
  return undefined;
}
function startWatch(x, name) {
  let idx;
  try {
    idx = indexOf(x);
  } catch (e) {
    ui.watchMsg = `That session didn't replay: ${e.message}`;
    return bump();
  }
  saveGame();
  const c = cloneCursor(idx.snaps[0].c);
  ui.watchMsg = '';
  ui.watch = { x, idx, c, name, playing: false, speed: 1, acc: 0, hold: 0, mi: 0, caption: '', line: timelineHTML(idx) };
  freshKeep(c.s);
  ui.toasts = []; // what the keep in play was saying isn't the session's
  ui.toastRev++;
  showCoach(null);
  openSheet('watch', 'game');
  return bump();
}
function stopWatching() {
  ui.watch = null;
  freshKeep(loadGame(saves.current) || newSeason());
  ui.toasts = [];
  ui.toastRev++;
  closeSheet();
  toast(`Back to keep ${saves.current}. Season ${s.season}: ${phaseLabel()}.`, 'rite');
  if (waiting()) openSheet('phase', 'game');
  return bump();
}
function watchPlay() {
  const w = ui.watch;
  if (w.c.done && !w.playing) watchSeek(0);
  w.playing = !w.playing;
  if (w.playing && ui.sheet && !wide()) closeSheet();
  return bump();
}
function watchSpeed(v) {
  ui.watch.speed = v;
  return bump();
}
// A mark's words, for the caption over the castle and the list.
const markLine = (m) => `${whenText(m.at)}. ${m.lane === 'you' ? 'The tester: ' : ''}${m.text}`;
function watchFrame(dt) {
  const w = ui.watch;
  if (!w.playing) return;
  if (w.hold > 0) {
    w.hold -= dt;
    return;
  }
  w.acc += dt * w.speed * TICKS_PER_SEC;
  const n = Math.floor(w.acc);
  if (n < 1) return;
  w.acc -= n;
  const r = advance(w.c, w.x, n, true);
  // What was passed on the way: the latest mark's words over the castle, and a moment on the tester's
  // own waits and on each thing they did while the clock ran.
  const M = w.idx.marks;
  let said = null;
  while (w.mi < M.length && M[w.mi].u <= w.c.u) {
    const m = M[w.mi++];
    if (STOPS_AT[m.kind]) said = m;
    if (HOLDS[m.kind]) w.hold = Math.max(w.hold, MARK_HOLD / w.speed);
  }
  if (said) w.caption = markLine(said);
  if (r.acts.length && running()) w.hold = Math.max(w.hold, ACT_HOLD / w.speed);
  if (w.c.done) {
    w.playing = false;
    w.caption = w.idx.off ? offText(w.idx.off) : 'The end of the session.';
  }
  if (said || r.acts.length || w.c.done) bump();
}
function watchSeek(u) {
  const w = ui.watch;
  w.c = seek(w.idx, w.x, u);
  freshKeep(w.c.s);
  w.acc = 0;
  w.hold = 0;
  w.mi = w.idx.marks.findIndex((m) => m.u >= w.c.u);
  if (w.mi < 0) w.mi = w.idx.marks.length;
  return bump();
}
const stopsOf = (w) => w.idx.marks.filter((m) => STOPS_AT[m.kind]);
function watchNext() {
  const w = ui.watch;
  const m = stopsOf(w).find((x) => x.u > w.c.u + LEAD);
  if (!m) return toast('No more marks after this.');
  watchSeek(m.u - LEAD);
  w.caption = markLine(m);
  return bump();
}
function watchPrev() {
  const w = ui.watch;
  const m = stopsOf(w).filter((x) => x.u < w.c.u - LEAD - 1).at(-1);
  watchSeek(m ? m.u - LEAD : 0);
  w.caption = m ? markLine(m) : 'The start of the session.';
  return bump();
}
const offText = (off) => `${whenText(off.at)}: this build stops replaying the session here (${off.why}). Its rules have changed since the tester played.`;
// The timeline: each phase as a band (day, night, and the waits between), the game's moments above and the
// tester's below, and how far the replay has got.
function timelineHTML(idx) {
  const pc = (u) => ((100 * u) / Math.max(1, idx.total)).toFixed(3);
  const segs = idx.segs.filter((g) => g.u1 > g.u0).map((g) => `<i class="wseg ws-${g.phase}" style="left:${pc(g.u0)}%;width:${pc(g.u1 - g.u0)}%"></i>`).join('');
  const marks = idx.marks.map((m) => `<b class="wm wm-${m.kind} wl-${m.lane}" style="left:${pc(m.u)}%"></b>`).join('');
  return `<span class="wsegs" aria-hidden="true">${segs}</span><span class="wmarks" aria-hidden="true">${marks}</span>`;
}
function watchBarHTML() {
  const w = ui.watch;
  const menu = [['watch', 'Session'], ['phase', SHEET_NAME()], ['people', 'People'], ['records', 'Records'], ['menu', 'Menu']]
    .map(([k, label]) => `<button class="btn sm gm" id="open-${k}" data-act="sheet" data-sheet="${k}" aria-pressed="${ui.sheet === k}" aria-controls="sheet">${label}</button>`)
    .join('');
  return `<div class="wbar">
    <div class="wline" id="wline" role="slider" tabindex="0" aria-label="The session: tap or drag to go there" aria-valuemin="0" aria-valuemax="${w.idx.total}" aria-valuenow="${w.c.u}" aria-valuetext="${esc(whenText(gameAt()))}">${w.line}<i class="wfill" data-bar="wfill"></i></div>
    <div class="wrow">
      <div class="wctl">
        <button class="btn sm" id="w-prev" data-act="w-prev" aria-label="Back to the last mark" title="Back to the last mark ([)">◀</button>
        <button class="btn sm primary" id="w-play" data-act="w-play">${w.playing ? 'Pause' : w.c.done ? 'Again' : 'Play'}</button>
        <button class="btn sm" id="w-next" data-act="w-next" aria-label="On to the next mark" title="On to the next mark (])">▶</button>
        <div class="seg" role="group" aria-label="Speed">${WATCH_SPEEDS.map((v) => `<button class="btn sm" id="w-speed-${v}" data-act="w-speed" data-v="${v}" aria-pressed="${w.speed === v}">${v}×</button>`).join('')}</div>
      </div>
      <div class="gmenu">${menu}</div>
    </div>
  </div>`;
}
// The session: who, where and when; their answers; whether this build still replays it; and every mark,
// to go to.
function watchHTML() {
  const w = ui.watch;
  if (!w) return '<p>No session is being watched.</p>';
  const x = w.x;
  const T = x.test;
  const tr = x.trail || [];
  const first = tr.find((e) => e.k === 'start') || tr.find((e) => e.k === 'load');
  const span = tr.length ? Math.round((tr.at(-1).w - tr[0].w) / 60000) : null;
  const who = T?.label || w.name || 'A playtest';
  const when = first ? new Date(first.w).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const screen = first?.vw ? `, on a ${first.vw}×${first.vh} ${first.touch ? 'touch screen' : 'screen with a pointer'}` : '';
  const facts = `${esc(who)}${when ? `, ${esc(when)}` : ''}${span != null ? `, over ${plural(span, 'minute')}` : ''}${esc(screen)}. ${x.tuning0?.tutorial ? 'The tutorial keep.' : ''}`;
  const off = w.idx.off
    ? `<p class="note bad">${esc(offText(w.idx.off))} What shows after that isn't what the tester saw.</p>`
    : w.idx.differs
      ? `<p class="note bad">From day ${esc(String(w.idx.differs.day))} this replay differs from the session (${esc(w.idx.differs.what)}: ${esc(String(w.idx.differs.was))} then, ${esc(String(w.idx.differs.now))} here): this build's rules have changed since the tester played.</p>`
      : '';
  const A = T?.answers || {};
  const answers = T
    ? `<div class="card"><h3>Their answers</h3><dl class="wans">${QUESTIONS.map(([k, q]) => `<dt>${esc(q)}</dt><dd>${esc(A[k] || '—')}</dd>`).join('')}<dt>Would you keep playing?</dt><dd>${A.again === 'yes' ? 'Yes' : A.again === 'no' ? 'No' : '—'}${A.why ? `. ${esc(A.why)}` : ''}</dd></dl>${T.sent ? '' : '<p class="hint">They never pressed Send: this came some other way.</p>'}</div>`
    : '';
  const asked = (x.seasons || []).filter((e) => e.answer || e.note);
  const seasonQ = asked.length ? `<div class="card"><h3>The season's question</h3><ul>${asked.map((e) => `<li>Season ${esc(String(e.season))}: ${e.answer === 'again' ? 'would play another' : e.answer === 'stop' ? "would stop" : 'no answer'}${e.note ? `. ${esc(e.note)}` : ''}</li>`).join('')}</ul></div>` : '';
  const stops = stopsOf(w);
  // The list is the same all session long: made once.
  w.list ??= stops.slice(0, 400).map((m) => `<li class="wl-${m.lane}"><button class="linkish" data-act="w-go" data-u="${m.u}">${esc(whenText(m.at))}</button> <span class="wk wk-${m.kind}"></span>${m.lane === 'you' ? 'The tester: ' : ''}${esc(m.text)}</li>`).join('');
  const list = w.list;
  return `<section class="watch">
    <div class="card"><h2>Watching a session</h2><p>${facts}</p>${off}
      <div class="row"><button class="btn sm primary" id="w-play-2" data-act="w-play">${w.playing ? 'Pause' : 'Play'}</button><button class="btn sm" id="w-exit" data-act="w-exit">Stop watching</button></div></div>
    ${answers}${seasonQ}
    <div class="card"><h3>What happened</h3><p class="hint">On the timeline, the game's moments are above (deaths, cracks and catches in red) and the tester's below (pauses in blue, idle stretches and time away in violet). Tap one here to go to it; ◀ and ▶ (or [ and ]) step between them.</p>
      ${list ? `<ol class="wlist">${list}</ol>${stops.length > 400 ? `<p class="hint">And ${stops.length - 400} more.</p>` : ''}` : '<p>Nothing marked.</p>'}</div>
  </section>`;
}
// In Saves: a tester's session to watch, from their file or as pasted text.
function watchCard() {
  return `<div class="card watch-load" id="watch-load"><h3>Watch a playtest</h3>
    <p class="note">A tester's session, from the file they sent or the text they pasted, played back here at up to 16×, with what happened and when they paused, opened a panel or sat idle marked on a timeline. ${ui.watch ? '' : 'Your keep is saved first, and comes back when you stop watching.'}</p>
    <div class="row"><input type="file" id="watch-file" class="visually-hidden" data-act="w-file" accept=".json,application/json,text/plain"><label class="btn sm primary" for="watch-file">Load a session</label></div>
    <details class="wpaste" data-keep="wpaste"${ui.open.wpaste ? ' open' : ''}><summary>Or paste it</summary><label for="watch-text">The session, as text</label><textarea id="watch-text" rows="4"></textarea><div class="row"><button class="btn sm" id="watch-paste" data-act="w-paste">Watch it</button></div></details>
    ${ui.watchMsg ? `<p class="note${ui.watchMsg.startsWith('Getting') ? '' : ' bad'}" role="status">${esc(ui.watchMsg)}</p>` : ''}
  </div>`;
}

/* ---------------------------------------------------------------- the stage and its camera */

const gameEl = document.getElementById('game');
const canvas = document.getElementById('stage');
const labelsEl = document.getElementById('labels');
const hudEl = document.getElementById('hud');
const barEl = document.getElementById('bar');
const sheetEl = document.getElementById('sheet');
const WIDE = window.matchMedia('(min-width: 900px)');
const wide = () => WIDE.matches;
// World pixels on the canvas; the camera's top-left corner in world pixels (x, y), where it's heading
// (tx, ty), and how far the player has dragged it from where it would sit on its own (panX, panY).
const view = { cw: 0, ch: 0, x: 0, y: 0, tx: 0, ty: 0, panX: 0, panY: 0, snap: true };
const MAX_ZOOM = 10;

// The scale that fits the castle is ui.fit; the player's zoom is kept as whole steps from it, so turning
// a phone sideways keeps the zoom sensible.
function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hudH = hudEl.offsetHeight;
  const barH = barEl.offsetHeight;
  gameEl.style.setProperty('--hud-h', `${hudH}px`);
  gameEl.style.setProperty('--bar-h', `${barH}px`);
  const freeH = Math.max(160, vh - hudH - barH);
  // The largest whole scale the width allows, and the height too, but never below 3× for height alone:
  // a keep built taller than the screen pans rather than shrinking everyone in it.
  const byWidth = Math.floor((vw - 8) / (W + 4));
  // In the eclipse both halves, the keep and the Tain: never below 2× for height alone.
  const both = eclipseNow();
  const byHeight = Math.floor(freeH / (both ? 2 * (VEIL - roofTop()) + 8 : VEIL - roofTop() + 4));
  ui.fit = Math.max(1, Math.min(6, byWidth, Math.max(byHeight, Math.min(both ? 2 : 3, byWidth))));
  ui.scale = Math.max(1, Math.min(MAX_ZOOM, ui.fit + (prefs.zoomStep || 0)));
  view.cw = Math.ceil(vw / ui.scale) + 1;
  view.ch = Math.ceil(vh / ui.scale) + 1;
  if (canvas.width !== view.cw || canvas.height !== view.ch) {
    canvas.width = view.cw;
    canvas.height = view.ch;
  }
  canvas.style.width = `${view.cw * ui.scale}px`;
  canvas.style.height = `${view.ch * ui.scale}px`;
  view.snap = true;
}

// The part of the screen the castle isn't hidden behind, in CSS pixels.
function freeRect() {
  const r = { left: 0, top: hudEl.offsetHeight, right: window.innerWidth, bottom: window.innerHeight - barEl.offsetHeight };
  if (ui.sheet && !sheetEl.hidden) {
    const b = sheetEl.getBoundingClientRect();
    if (wide()) r.right = Math.max(r.left + 200, b.left);
    else r.bottom = Math.max(r.top + 120, b.top);
  }
  const right = `${Math.round(window.innerWidth - r.right)}px`;
  if (gameEl.style.getPropertyValue('--free-right') !== right) gameEl.style.setProperty('--free-right', right);
  const below = `${Math.round(window.innerHeight - barEl.offsetHeight - r.bottom)}px`;
  if (gameEl.style.getPropertyValue('--sheet-h') !== below) gameEl.style.setProperty('--sheet-h', below);
  return r;
}

// Where the camera sits on its own: the keep by day, or the Tain by night, centred in the free part of
// the screen.
function autoTarget() {
  const fr = freeRect();
  const fx = W / 2;
  // A little above the Tain's middle at night, so more of the keep shows than of the empty Deep.
  const h = VEIL - roofTop();
  const fy = eclipseNow() ? VEIL : nightView() ? VEIL + h / 2 - 6 : VEIL - h / 2 - 4;
  const sx = (fr.left + fr.right) / 2 / ui.scale;
  const sy = (fr.top + fr.bottom) / 2 / ui.scale;
  return { x: fx - sx, y: flipped() ? fy - view.ch + sy : fy - sy };
}
// Keeps a dragged camera's centre over the castle (and the Tain at night), so it can't get lost.
function clampPan(a) {
  const [y0, y1] = eclipseNow() ? [roofTop() - 40, 2 * VEIL - roofTop() + 30] : nightView() ? [VEIL / 2, 2 * VEIL - roofTop() + 30] : [roofTop() - 40, VEIL + 20];
  const cx = a.x + view.panX + view.cw / 2;
  const cy = a.y + view.panY + view.ch / 2;
  if (cx < -30) view.panX += -30 - cx;
  else if (cx > W + 30) view.panX -= cx - (W + 30);
  if (cy < y0) view.panY += y0 - cy;
  else if (cy > y1) view.panY -= cy - y1;
}
function aimCamera() {
  const a = autoTarget();
  clampPan(a);
  view.tx = a.x + view.panX;
  view.ty = a.y + view.panY;
}
// Puts the camera where it's heading at once, so several zoom or drag steps in one frame add up right.
function snapCamera() {
  aimCamera();
  view.x = view.tx;
  view.y = view.ty;
  view.snap = false;
}
const flipped = () => nightView() && prefs.mode === 'flipped';
const zoomed = () => (prefs.zoomStep || 0) !== 0 || Math.abs(view.panX) > 0.5 || Math.abs(view.panY) > 0.5;

// The world point under a screen point, exactly (screen = viewport CSS pixels; the stage fills it).
function screenToWorld(sx, sy) {
  const y = sy / ui.scale;
  return { x: view.x + sx / ui.scale, y: flipped() ? view.y + view.ch - y : view.y + y };
}
// Zooms to scale s1, keeping the world point under (sx, sy) where it is on screen.
function zoomTo(s1, sx, sy) {
  s1 = Math.max(1, Math.min(MAX_ZOOM, s1));
  if (s1 === ui.scale) return;
  const w = screenToWorld(sx, sy);
  prefs.zoomStep = s1 - ui.fit;
  savePrefs();
  layout();
  const a = autoTarget();
  view.panX = w.x - sx / ui.scale - a.x;
  view.panY = (flipped() ? w.y - view.ch + sy / ui.scale : w.y - sy / ui.scale) - a.y;
  snapCamera();
  drawnLabels = '';
  bump();
}
function zoomBy(d) {
  const fr = freeRect();
  zoomTo(ui.scale + d, (fr.left + fr.right) / 2, (fr.top + fr.bottom) / 2);
}
// Drags the castle by a distance in CSS pixels.
function panBy(dx, dy) {
  view.panX -= dx / ui.scale;
  view.panY -= (flipped() ? -dy : dy) / ui.scale;
  snapCamera();
}
function fitView() {
  prefs.zoomStep = 0;
  savePrefs();
  view.panX = 0;
  view.panY = 0;
  layout();
  snapCamera();
  drawnLabels = '';
  bump();
}

function moveCamera(dt) {
  aimCamera();
  if (view.snap || REDUCED_NOW()) {
    view.x = view.tx;
    view.y = view.ty;
    view.snap = false;
    return;
  }
  const k = 1 - Math.exp(-dt * 7);
  view.x += (view.tx - view.x) * k;
  view.y += (view.ty - view.y) * k;
  if (Math.abs(view.tx - view.x) < 0.2) view.x = view.tx;
  if (Math.abs(view.ty - view.y) < 0.2) view.y = view.ty;
}
// The picture is drawn at whole world pixels; the canvas slides by the fraction left over, so the camera
// glides instead of stepping a whole (scaled) pixel at a time. Flipped, it rounds the other way so the
// slide never uncovers an edge.
const camX = () => Math.floor(view.x);
const camY = () => (flipped() ? Math.ceil(view.y) : Math.floor(view.y));
function slideCanvas() {
  const fx = (view.x - camX()) * ui.scale;
  const fy = (view.y - camY()) * ui.scale;
  const tr = `translate(${(-fx).toFixed(2)}px, ${(flipped() ? fy : -fy).toFixed(2)}px)`;
  if (canvas.style.transform !== tr) canvas.style.transform = tr;
}

// World to screen (CSS pixels, relative to the canvas) and back.
function worldToScreen(wx, wy) {
  const cy = wy - camY();
  return { x: (wx - camX()) * ui.scale, y: (flipped() ? view.ch - cy : cy) * ui.scale };
}
const keepToWorldY = (ky, tain = nightView() || eclipseNow()) => (tain ? 2 * VEIL - ky : ky);

// A tap on the screen as a spot in the keep (by day) or the Tain (by night): { f, x, y, room } or null.
function stageAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const x = (clientX - box.left) / ui.scale;
  let y = (clientY - box.top) / ui.scale;
  if (flipped()) y = view.ch - y;
  const wx = camX() + x;
  const wy = camY() + y;
  let ky;
  const tain = nightView() || (eclipseNow() && wy >= VEIL);
  if (tain) {
    if (wy < VEIL) return null;
    ky = 2 * VEIL - wy;
  } else {
    if (wy >= VEIL) return null;
    ky = wy;
  }
  const f = floorAtY(K(), ky);
  if (f < 0) return null;
  return { f, x: Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, wx)), y: ky, room: typeAt(K(), f, wx), id: roomAt(K(), f, wx), tain };
}

let drawnLabels = '';
function placeLabels() {
  const night = nightView();
  const both = eclipseNow();
  // What a Maw broke in the Tain tonight; what it broke last night haunts the keep today.
  const markedOf = (tain) => (tain ? s.night?.broken || [] : s.haunted || []);
  const key = `${prefs.labels}|${night}|${both}|${prefs.mode}|${ui.scale}|${view.x.toFixed(2)}|${view.y.toFixed(2)}|${view.ch}|${K().key}|${markedOf(true).join()}|${markedOf(false).join()}`;
  if (key === drawnLabels) return;
  drawnLabels = key;
  labelsEl.hidden = !prefs.labels;
  if (!prefs.labels) return;
  const box = canvas.getBoundingClientRect();
  const out = [];
  const G = K();
  for (const tain of both ? [false, true] : [night]) {
    for (let f = 0; f < G.n; f++) {
      for (const [id, a, b, type] of G.floors[f].rooms) {
        // Each tag sits on the ceiling side of its room, so it never covers anyone's feet.
        const ceiling = tain ? keepToWorldY(G.floors[f].y, true) : G.floors[f].y;
        const p = worldToScreen((a + b) / 2, ceiling);
        const up = tain && !flipped();
        const mark = markedOf(tain).includes(id) ? (tain ? ', broken' : ', haunted') : '';
        out.push(`<span class="${up ? 'up' : ''}${mark ? ' marked' : ''}" style="left:${box.left + p.x}px;top:${box.top + p.y}px;max-width:${(b - a) * ui.scale - 6}px">${esc((tain ? TWINS[type].name : DAY_ROOMS[type].name) + mark)}</span>`);
      }
    }
  }
  labelsEl.innerHTML = out.join('');
}

function shadeNear(at) {
  let best = null;
  for (const d of s.shades.filter(canWork)) {
    if (d.f !== at.f && !d.climb) continue;
    const dist = Math.abs(unitAt(K(), d, 1).x - at.x);
    if (dist <= 3.5 && (!best || dist < best.dist)) best = { d, dist };
  }
  return best?.d || null;
}
function wardNear(at) {
  let best = null;
  for (const st of K().stairs) {
    if (at.f !== st.f && at.f !== st.f + 1) continue;
    const dist = Math.abs(st.x - at.x);
    if (dist <= 6 && (!best || dist < best.dist)) best = { id: st.id, f: at.f, x: st.x, dist };
  }
  if (at.f === DEEP_FLOOR) {
    for (const rf of MAP.rifts) {
      const dist = Math.abs(rf.x - at.x);
      if (dist <= 6 && (!best || dist < best.dist)) best = { id: rf.id, f: at.f, x: rf.x, dist };
    }
  }
  // On a rainy night, either end of the moat's twin: one ward keeps the Drowned under.
  if (at.f === K().veil && raining(s)) {
    for (const w of MAP.moat) {
      const dist = Math.abs(w.x - at.x);
      if (dist <= 6 && (!best || dist < best.dist)) best = { id: 'moat', f: at.f, x: w.x, dist };
    }
  }
  return best;
}

function onStage(e) {
  if (ui.watch) return;
  if (skipCrossing()) return;
  const at = stageAt(e.clientX, e.clientY);
  if (!at) return;
  if (s.phase === 'day' && !at.tain) {
    const p = byId(s.living, ui.person);
    if (at.room === 'empty') return openSheet('build');
    if (p && at.room && DAY_ROOMS[at.room].out) {
      if (game({ type: 'assign', id: p.id, room: at.room })) {
        toast(`${p.name} now works in the ${DAY_ROOMS[at.room].name}.`, 'day');
        ui.person = null;
      }
    } else if (at.room) toast(DAY_ROOMS[at.room].job(DAY_ROOMS[at.room]), 'day');
    return;
  }
  ui.kb = null; // a tap puts the keyboard's cursor away
  return actAt(at);
}
// Whatever the tool does at a spot on the Tain, from a tap or from the keyboard's cursor.
function actAt(at) {
  if (!placing()) return undefined;
  if (ui.tool === 'candle') {
    if (!at.room) return toast('That is inside a wall.', 'bad');
    return game({ type: 'candle', f: at.f, x: Math.round(at.x * 2) / 2 });
  }
  if (ui.tool === 'ward') {
    const w = wardNear(at);
    return w ? game({ type: 'ward', target: w.id }) : toast(`Tap closer to a stair or a rift${raining(s) ? ", or an end of the moat's twin" : ''}.`, 'bad');
  }
  const hit = shadeNear(at);
  if (hit && hit.id !== ui.selected) {
    ui.selected = hit.id;
    return bump();
  }
  if (ui.selected && at.room) game({ type: 'move', id: ui.selected, f: at.f, x: Math.round(at.x * 2) / 2 });
  return undefined;
}

function ghost() {
  const h = kbAt() || ui.hover;
  if (!h || !h.room || !placing()) return null;
  if (ui.tool === 'candle' && s.res.candles >= 1) return { tool: 'candle', f: h.f, x: Math.round(h.x) };
  if (ui.tool === 'ward') {
    const w = wardNear(h);
    return w ? { tool: 'ward', target: w } : null;
  }
  return null;
}

/* ---------------------------------------------------------------- the keyboard at night */

// Whether the focus came from the keyboard (Tab) rather than a click. Browsers without :focus-visible
// (Safari before 15.4) are taken as the keyboard, so a focused button keeps its keys there as before.
function keyFocused(el) {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

// Round five: the night and the dusk's posts from the keyboard. The arrows move a cursor over the Tain, a
// floor at a time up and down as the screen shows them; Enter does what a tap would there; [ and ] pick the
// shades in turn. Shift and the arrows pan, as the arrows alone still do by day. A tap, or Esc, puts the
// cursor away.
const placing = () => s.phase === 'night' || (s.phase === 'dusk' && s.dusk?.step === 'place') || eclipseNow();
const KB_STEP = 3;
function kbAt() {
  if (!ui.kb || !placing()) return null;
  const { f, x } = ui.kb;
  return { f, x, room: typeAt(K(), f, x), id: roomAt(K(), f, x) };
}
// Starts the cursor on the chosen shade, else on the line, else mid-floor under the Veil.
function kbStart() {
  const d = byId(s.shades, ui.selected);
  if (d && canWork(d)) return (ui.kb = { f: d.f, x: unitAt(K(), d, 1).x });
  const at = lineSpots()[0];
  ui.kb = at ? { f: at.f, x: at.x } : { f: Math.max(0, K().veil - 1), x: Math.round((MAP.LEFT + MAP.RIGHT) / 2) };
  return ui.kb;
}
function kbMove(key) {
  if (!ui.kb) kbStart();
  else if (key === 'arrowleft' || key === 'arrowright') {
    ui.kb.x = Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, ui.kb.x + (key === 'arrowleft' ? -KB_STEP : KB_STEP)));
  } else {
    // Up and down as they are on the screen, whichever way up the Tain is shown.
    const G = K();
    const yOf = (f) => worldToScreen(0, keepToWorldY(feet(G, f))).y;
    const dir = key === 'arrowup' ? -1 : 1;
    let best = null;
    for (let f = 0; f < G.n; f++) {
      const d = (yOf(f) - yOf(ui.kb.f)) * dir;
      if (d > 0 && (!best || d < best.d)) best = { f, d };
    }
    if (best) ui.kb.f = best.f;
  }
  kbShown();
}
// The previous or next shade that can take a post: chosen, and the cursor on it.
function kbPick(dir) {
  const ds = s.shades.filter(canWork);
  if (!ds.length) return toast('No shade can take a post.', 'bad');
  const i = ds.findIndex((d) => d.id === ui.selected);
  const d = ds[i < 0 ? (dir > 0 ? 0 : ds.length - 1) : (i + dir + ds.length) % ds.length];
  ui.selected = d.id;
  ui.tool = 'move';
  ui.kb = { f: d.f, x: unitAt(K(), d, 1).x };
  return kbShown();
}
// After the cursor moves: in view, the hint said, and Enter free for it (a button clicked a moment ago
// would otherwise keep it).
function kbShown() {
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest('#sheet')) a.blur();
  const fr = freeRect();
  const box = canvas.getBoundingClientRect();
  const p = worldToScreen(ui.kb.x, keepToWorldY(feet(K(), ui.kb.f) - 6));
  const [x, y] = [box.left + p.x, box.top + p.y];
  const m = 24;
  const dx = x < fr.left + m ? fr.left + m - x : x > fr.right - m ? fr.right - m - x : 0;
  const dy = y < fr.top + m ? fr.top + m - y : y > fr.bottom - m ? fr.bottom - m - y : 0;
  if (dx || dy) panBy(dx, dy);
  showHint();
  bump();
}
// What's under the cursor and what Enter would do there.
function kbText() {
  const at = kbAt();
  const where = at.room ? `the ${TWINS[at.room].name}` : 'inside a wall';
  const here = shadeNear(at);
  const d = byId(s.shades, ui.selected);
  let enter;
  if (ui.tool === 'candle') enter = !at.room ? 'nothing here' : s.res.candles >= 1 ? 'set a candle' : 'nothing (no candles left)';
  else if (ui.tool === 'ward') {
    const w = wardNear(at);
    enter = w ? `ward ${wardName(w.id)} (${fmt(wardCost(s))} essence)` : 'nothing (no stair or rift near)';
  } else if (here && here.id !== ui.selected) enter = `pick ${here.name}`;
  else if (d && at.room) enter = `${s.phase === 'dusk' ? 'post' : 'send'} ${d.name} here`;
  else enter = d ? 'nothing here' : 'nothing ([ and ] pick a shade)';
  return `Cursor: ${where}${here ? `, ${here.name}` : ''}. Enter: ${enter}. Esc puts it away.`;
}

// Between day and night the old picture fades out over the new one while the camera travels.
const fade = { cv: document.createElement('canvas'), until: 0, mode: viewMode() };
function draw(alpha, now) {
  const night = nightView();
  const both = eclipseNow();
  if (viewMode() !== fade.mode) {
    fade.mode = viewMode();
    view.panX = 0;
    view.panY = 0;
    if (!REDUCED_NOW()) {
      fade.cv.width = canvas.width;
      fade.cv.height = canvas.height;
      fade.cv.getContext('2d').drawImage(canvas, 0, 0);
      fade.until = now + 900;
    }
  }
  const t = REDUCED_NOW() ? 0 : now / 1000;
  drawScene(canvas, s, {
    night,
    eclipse: both,
    flip: flipped(),
    cam: { x: camX(), y: camY() },
    t,
    sunset: s.phase === 'day' ? Math.max(0, (s.t / dayTicks(s) - 0.82) / 0.18) : s.phase === 'end' ? 0.35 : 0,
    dusk: duskAmount(now),
    souls: soulSpots(now),
    marks: night && ui.guide?.marks ? ui.guide.marks() : null,
    threats: (night || both) && waysOn() && !foggy(s) ? threatsNow() : null,
    alpha: (s.phase === 'night' || both) && !ui.paused ? alpha : 1,
    selected: ui.selected,
    ghost: ghost(),
    cursor: kbAt(),
    ambient: s.phase === 'dawn' || s.phase === 'over' ? 0.45 : 0.22,
    veilFlash: ui.flash > now ? (ui.flash - now) / 600 : 0,
  });
  if (fade.until > now) {
    const c = canvas.getContext('2d');
    c.globalAlpha = (fade.until - now) / 900;
    c.drawImage(fade.cv, 0, 0);
    c.globalAlpha = 1;
  }
  slideCanvas();
  placeLabels();
  const z = document.getElementById('zoom-fit');
  if (z && z.disabled === zoomed()) z.disabled = !zoomed();
}

// For scripted tests: where a spot in the keep or the Tain is on screen, in client pixels.
window.__season = {
  spot(f, x, half) {
    const box = canvas.getBoundingClientRect();
    const tain = half ? half === 'tain' : nightView() || eclipseNow();
    const p = worldToScreen(x + 0.5, keepToWorldY(feet(K(), f) - 5, tain) + (tain ? -0.5 : 0.5));
    return { x: box.left + p.x, y: box.top + p.y };
  },
  get crossing() { return !!ui.cross; },
  get cursor() { return kbAt() && { ...ui.kb }; },
  get sound() { return { state: sound.state, bed: sound.bed, heard: [...heard] }; },
  // For scripted checks: the keep as it stands (read only), the line's spots, and the middle of a room.
  get keep() { return s; },
  get watch() {
    const w = ui.watch;
    return w && { u: w.c.u, total: w.idx.total, playing: w.playing, speed: w.speed, done: w.c.done, marks: w.idx.marks.length, caption: w.caption, off: w.idx.off, differs: w.idx.differs };
  },
  get line() { return lineSpots(); },
  room(type) {
    const r = roomSpan(K(), type);
    return r ? { f: r.f, x: Math.round((r.x0 + r.x1) / 2) } : null;
  },
};

/* ---------------------------------------------------------------- the installed app */

// The season installs as an app where the browser allows it (season.webmanifest, sw.js). Chrome, Edge and
// Samsung Internet offer an install prompt the page can hold and show from its own button; Safari on an
// iPhone or iPad installs only from Share, Add to Home Screen, so there the page says so. The bundled
// single-file build has no manifest, so it neither registers the worker nor offers to install.
const INSTALLABLE = !!document.querySelector('link[rel="manifest"]') && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;
if (INSTALLABLE) {
  const register = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    bump();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    toast('Installed. The season opens from your home screen or app list now, and plays offline.', 'day');
    bump();
  });
}
// Where the browser offers no prompt, what to do instead. Another app's built-in browser can't install
// anything, and on Android it can't always be told apart from Chrome, so the Android line says so too.
const ANDROID = /android/i.test(navigator.userAgent);
const IN_APP = /; wv\)|FBA[NV]|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly/i.test(navigator.userAgent);
function installHelp() {
  if (IN_APP) return "This is another app's built-in browser, which can't install anything. Open the page in your phone's own browser (the app's menu has Open in browser), then install it there.";
  if (IOS) return 'On an iPhone or iPad, in Safari: tap Share, then Add to Home Screen.';
  if (ANDROID) return 'In Chrome: the ⋮ menu, then Install app (or Add to home screen). Other browsers have Install or Add to home screen in their menu. If the menu has neither, the page is open inside another app: choose Open in Chrome first.';
  return 'In Chrome or Edge: the install icon at the right of the address bar, or the menu, then Install. In Safari on a Mac: File, then Add to Dock.';
}
function installHTML(where) {
  if (!INSTALLABLE) return '';
  if (installed()) return where === 'settings' ? '<p class="hint">Running as an installed app. It plays offline.</p>' : '';
  if (installPrompt) return `<div class="row"><button class="btn" id="btn-install-${where}" data-act="install">Install the app</button><span class="hint">Full screen, from your home screen, and it plays offline.</span></div>`;
  if (where === 'title' && !ui.installHelp) return '<button class="btn sm title-link" id="btn-install-help" data-act="install-help">Install on this device</button>';
  return `<p class="hint${where === 'title' ? ' title-install' : ''}" id="install-help-${where}">${esc(installHelp())}${where === 'settings' ? " Installed, it opens full screen from your home screen and plays offline. If it's installed already, open it from there." : ''}</p>`;
}

/* ---------------------------------------------------------------- the page */

// Building: what stone buys, and where (round five): choose among the bare halls and a new floor on top,
// then what; below, the keep floor by floor, where any room can be torn down or moved.
function buildHTML() {
  const T = s.tuning;
  const G = K();
  const stone = s.res.stone || 0;
  const day = s.phase === 'day';
  const halls = bareHalls(s);
  const canTop = G.n < MAX_FLOORS;
  const places = [...halls.map((h) => h.id), ...(canTop ? ['top'] : [])];
  const def = nextSlot(s);
  if (!places.includes(ui.buildAt)) ui.buildAt = def ? (def.newFloor ? 'top' : def.id) : null;
  const floorNo = (f) => `floor ${G.n - f}${f === 0 ? ', the top' : f === G.veil ? ', the ground' : ''}`;
  const beside = (h) => G.floors[h.f].rooms.find(([id]) => id !== h.id);
  // What a place means by night: the line's floor is worked by the shades holding the line, as they hold it;
  // below the line the tides climb through, so a shade working there needs a candle of its own and risks
  // being caught; and each floor raised on top makes the Unlit's climb longer.
  const means = (G2, f) => (G2.n > 1 && f === G2.veil - 1 ? ' The shades holding the line work its rooms as they hold it: the place for a Chapel, whose Choir they sing in.' : G2.n > 1 && f < G2.veil - 1 ? ' The tides climb through it: a shade working it by night needs a candle of its own, and can be caught.' : '');
  const place = (id) => {
    if (id === 'top') {
      const G2 = { ...G, n: G.n + 1, veil: G.n };
      return ['On top, a new floor', `By night, ${tainPlace(G2, 0)}.${means(G2, 0)} Each floor raised makes the Unlit climb farther.`];
    }
    const h = halls.find((x) => x.id === id);
    const b = beside(h);
    return [`The bare hall on ${floorNo(h.f)}${b && b[3] !== 'empty' ? `, beside the ${DAY_ROOMS[b[3]].name}` : ''}`, `By night, ${tainPlace(G, h.f)}.${means(G, h.f)}`];
  };
  const radios = places
    .map((id) => {
      const [label, night] = place(id);
      return `<label class="place"><input type="radio" name="build-at" id="at-${id}" data-act="build-at" data-at="${id}"${ui.buildAt === id ? ' checked' : ''}><span><b>${esc(label)}</b><small>${esc(night)}</small></span></label>`;
    })
    .join('');
  const masons = jobCount(s, 'yard');
  const spot = ui.buildAt ? buildSpot(s, ui.buildAt) : null;
  const cost = raiseCost(s, spot);
  const can = day && !!spot && stone + 1e-9 >= cost;
  // The Gatehouse stands at the gate, on the ground floor.
  const atGateHere = spot && !spot.newFloor && spot.f === G.veil;
  const rows = BUILDABLE.filter((type) => !NEW_ROOMS.includes(type) || T[type]).map((type) => {
    const R = DAY_ROOMS[type];
    const tw = TWINS[type];
    const have = roomsOf(G, type).length;
    const gate = type === 'gatehouse';
    const why = gate && !arrived(s, 2) ? 'It comes with the Ashen Host, in the campaign\'s second year.' : gate && have ? 'The keep has its Gatehouse.' : gate && !atGateHere ? 'Only on the ground floor, where the gate is: move a room up to make a bare hall there (Rearrange, below), then choose it.' : '';
    return `<li class="build-row"><div><b>${esc(R.name)}</b>${have ? ` <small class="muted">you have ${have}</small>` : ''}<p class="note">${esc(R.job(R))} By night, the ${esc(tw.name)}: ${esc(tw.note)}</p>${why ? `<p class="note bad">${esc(why)}</p>` : ''}</div>
      <button class="btn sm" id="raise-${type}" data-act="raise" data-room="${type}"${can && !why ? '' : ' disabled'}>Build, ${fmt(cost)} stone</button></li>`;
  }).join('');
  return `<section class="build">
    <p>Stone <b data-live="stone">${floor1(stone)}</b>. ${masons ? `${esc(plural(masons, 'mason'))} in the Yard quarry ${fmt(masons * DAY_ROOMS.yard.rate)} a day.` : 'Nobody is quarrying: put someone in the Yard, in People, for 2 stone a day.'}</p>
    ${day ? '' : '<p class="note">Masons build by day.</p>'}
    <div class="card"><h3>Where</h3>${places.length ? `<div class="places">${radios}</div>` : '<p class="note">The keep can rise no higher, and there is no bare hall. Tear a room down to make one.</p>'}
      <p class="note">Each room holds ${T.roomCap} workers, so another Barracks lets more guards stand. By night each room is its twin in the Tain, upside down: the top floor is the deepest, where the rifts open, and the ground floor stands under the Veil. A room below the line is in the Unlit's way.</p></div>
    <ul class="build-list">${rows}</ul>
    ${rearrangeHTML()}
  </section>`;
}
// The keep floor by floor: tear a room down for part of its stone back, or move it (a swap with any other room
// or bare hall), both asked first.
function rearrangeHTML() {
  const T = s.tuning;
  const G = K();
  const day = s.phase === 'day';
  const stone = s.res.stone || 0;
  const back = Math.floor(T.roomStone * T.teardownBack);
  const name = (type) => (type === 'empty' ? 'Bare hall' : DAY_ROOMS[type].name);
  const burning = (id) => s.fires.some((f) => f.room === id);
  const moving = ui.moving && G.rooms[ui.moving] ? G.rooms[ui.moving] : null;
  const floors = G.floors
    .map((fl, f) => {
      const items = fl.rooms
        .map(([id, , , type]) => {
          let acts = '';
          if (ui.tearAsk === id) {
            acts = `<p class="note bad">Tear down the ${esc(name(type))}? ${back} stone comes back${DAY_ROOMS[type].out ? ', and whoever works there beyond what the rest can hold goes to the Yard' : ''}.</p><div class="row"><button class="btn sm primary" id="tear-yes-${id}" data-act="tear-yes" data-id="${id}">Tear it down</button><button class="btn sm" id="tear-no" data-act="tear-no">Cancel</button></div>`;
          } else if (moving) {
            if (moving.id !== id && !(moving.type === 'empty' && type === 'empty')) acts = `<button class="btn sm" id="move-to-${id}" data-act="move-to" data-id="${id}"${day && stone + 1e-9 >= T.moveStone && !burning(id) ? '' : ' disabled'}>${type === 'empty' ? 'Move it here' : 'Swap with this'}, ${T.moveStone} stone</button>`;
            else if (moving.id === id) acts = '<button class="btn sm" id="move-cancel" data-act="move-cancel">Cancel the move</button>';
          } else if (type !== 'empty') {
            const lastHearth = type === 'hearth' && roomsOf(G, 'hearth').length === 1;
            acts = `<button class="btn sm" id="move-${id}" data-act="move" data-id="${id}"${day && !burning(id) ? '' : ' disabled'}>Move</button>${type === 'crypt' || lastHearth ? '' : `<button class="btn sm" id="tear-${id}" data-act="tear" data-id="${id}"${day && !burning(id) ? '' : ' disabled'}>Tear down, +${back}</button>`}`;
          }
          return `<li class="kroom${moving?.id === id ? ' is-moving' : ''}"><span><b>${esc(name(type))}</b><small>${type === 'empty' ? 'Nothing yet' : `By night, the ${esc(TWINS[type].name)}`}</small></span><span class="row">${acts}</span></li>`;
        })
        .join('');
      return `<li class="kfloor"><span class="eyebrow">Floor ${G.n - f}${f === 0 ? ', the top' : f === G.veil ? ', the ground' : ''} · by night ${esc(tainPlace(G, f).replace(/, where.*$|, one below.*$|, under the line$|, above the line$/, ''))}</span><ul>${items}</ul></li>`;
    })
    .join('');
  return `<details class="card rearrange" data-keep="rearrange"${ui.open.rearrange || moving || ui.tearAsk ? ' open' : ''}><summary><b>Rearrange the keep</b></summary>
    <p class="note">${moving ? `Moving the ${esc(name(moving.type))}: choose where it goes. It swaps places with what's there.` : `Tear a room down for ${back} of its ${T.roomStone} stone back, leaving a bare hall; the Crypt and your last Hearth stay. Or move it: it swaps places with any other room or bare hall, for ${T.moveStone} stone. Whoever works there keeps their job, and its twin moves with it.`}</p>
    <ul class="kfloors">${floors}</ul></details>`;
}

const SHEETS = {
  build: ['Build', buildHTML],
  phase: [null, () => `<section class="phase ${PH[s.phase]}">${phaseHTML()}</section>`],
  people: ['People', rosterHTML],
  records: ['Records', () => `<section class="records">${recordsHTML()}</section>`],
  menu: ['Menu', () => `<section class="menu">${menuHTML()}</section>`],
  test: ['Playtest', testHTML],
  watch: ['Session', watchHTML],
};
function sheetHTML() {
  if (!ui.sheet) return '';
  const [title, body] = SHEETS[ui.sheet];
  return `<div class="gsheet-head"><span class="eyebrow" id="sheet-title">${esc(title || SHEET_NAME())}</span><button class="btn sm" id="sheet-close" data-act="sheet-close">Close</button></div>
    <div class="gsheet-body" id="sheet-body">${body()}</div>`;
}
/* ---------------------------------------------------------------- the main screen */

// The game opens on it, over the keep as it stands (but for a tester's link, a test not yet sent, or the
// replay viewer), and the Menu leads back to it: the keep being played, a new one (the open year or a
// campaign, its difficulty, the guide), the tutorial, today's keep, the Menu's tabs, and installing. The
// clock stands still under it.
const WHAT_STARTS = { new: 'the new keep', tutorial: 'the tutorial', daily: "today's keep" };
const continuable = () => prefs.introDone || !untouched();
function titleMainHTML() {
  const go = continuable();
  const tut = tutorialHeld();
  const daily = dailyHeld();
  const item = (id, act, label, sub, primary = false, extra = '') => `<button class="btn${primary ? ' primary' : ''} title-go" id="${id}" data-act="${act}"${extra}><span>${label}</span><small>${esc(sub)}</small></button>`;
  return `${go ? item('title-continue', 'title-continue', 'Continue', `Keep ${saves.current}: ${keepLine(summary(s, Date.now()))}`, true) : ''}
    ${item('title-tutorial', 'title-start', tut ? 'Continue the tutorial' : 'Learn to play', tut ? `In keep ${tut}` : 'The tutorial: three days that teach, one thing at a time', !go, ' data-what="tutorial"')}
    ${item('title-new', 'title-view', 'New game', 'The open year or a five-year campaign, Gentle to Hard', false, ' data-view="new"')}
    ${item('title-daily', 'title-start', daily ? "Continue today's keep" : "Today's keep", `${dayText(dayKey())}: the same keep for everyone who plays today`, false, ' data-what="daily"')}
    <div class="title-row">
      <button class="btn" id="title-saves" data-act="title-tab" data-tab="saves">Saves</button>
      <button class="btn" id="title-howto" data-act="title-tab" data-tab="howto">How to play</button>
      <button class="btn" id="title-settings" data-act="title-tab" data-tab="settings">Settings</button>
    </div>
    ${installHTML('title')}`;
}
function titleNewHTML() {
  const n = freeSlot();
  return `<div class="title-card"><h2 class="title-h">A new keep</h2>
    ${campaignPicker('title')}
    ${presetPicker('title')}
    ${customPicker('title')}
    <label class="title-check" for="title-guide"><input type="checkbox" id="title-guide" data-act="guide-toggle"${prefs.guide ? ' checked' : ''}><span>The guide: a short card the first time each thing happens</span></label>
    <p class="hint">${n ? `It goes in keep ${n}.` : 'All three keeps are in use: next you choose which one it replaces.'}</p>
    <div class="row"><button class="btn primary" id="title-begin" data-act="title-start" data-what="new">Begin</button><button class="btn" id="title-back" data-act="title-back">Back</button></div></div>`;
}
function titleReplaceHTML() {
  const what = WHAT_STARTS[ui.titleFor] || WHAT_STARTS.new;
  const rows = SLOT_NUMS().map((n) => {
    const m = n === saves.current ? summary(s, Date.now()) : saves.slots[n];
    const acts = ui.titleAsk === n
      ? `<p class="note bad">Keep ${n} is gone for good unless you exported it (Saves, then Export). Put ${what} in its place?</p><div class="row"><button class="btn sm primary" id="title-replace-yes" data-act="title-replace-yes" data-n="${n}">Replace keep ${n}</button><button class="btn sm" id="title-replace-no" data-act="title-replace-no">Cancel</button></div>`
      : `<div class="row"><button class="btn sm" id="title-replace-${n}" data-act="title-replace" data-n="${n}">Replace keep ${n}</button></div>`;
    return `<div class="kslot"><div class="kslot-head"><span class="eyebrow">Keep ${n}</span></div><p>${m ? esc(keepLine(m)) : 'Empty.'}</p>${acts}</div>`;
  }).join('');
  return `<div class="title-card"><h2 class="title-h">Which keep does ${esc(what)} replace?</h2><p class="hint">All three keeps are in use.</p><div class="kslots">${rows}</div>
    <div class="row"><button class="btn" id="title-back" data-act="title-back">Back</button></div></div>`;
}
function titleHTML() {
  if (!ui.title) return '';
  const body = ui.titleView === 'new' ? titleNewHTML() : ui.titleView === 'replace' ? titleReplaceHTML() : titleMainHTML();
  return `<div class="title-wrap">
    <div class="title-top"><h1 class="title-name" id="title-name">Afterglass</h1><p class="title-tag">A keep on the Veil. The living hold it by day; the dead hold its reflection by night.</p></div>
    <div class="title-menu" id="title-menu">${body}</div>
  </div>`;
}
function openTitle(by = 'you') {
  if (ui.skip) endSkip();
  if (running() && !ui.paused) trail('pause', { by: 'title' });
  Object.assign(ui, { paused: true, rush: false, resume: false, title: true, titleView: null, titleFor: null, titleAsk: null, installHelp: false });
  closeSheet();
  showCoach(null);
  trail('panel', { name: 'title', ...(by === 'you' ? {} : { by }) });
  bump();
  requestAnimationFrame(() => document.querySelector('#title-menu .title-go')?.focus({ preventScroll: true }));
}
function closeTitle() {
  if (!ui.title) return;
  Object.assign(ui, { title: false, titleView: null, titleFor: null, titleAsk: null });
  trail('close', { name: 'title' });
}
function titleContinue() {
  closeTitle();
  if (waiting()) openSheet('phase', 'game');
  return bump();
}
function titleView(view) {
  ui.titleView = view;
  ui.titleAsk = null;
  bump();
  requestAnimationFrame(() => document.querySelector('#title-menu button, #title-menu input')?.focus({ preventScroll: true }));
}
// A new keep, the tutorial or today's keep: where one is already under way, back to it; else into a free
// slot, or, with all three in use, the player chooses which one it replaces.
function titleStart(what) {
  const held = what === 'tutorial' ? tutorialHeld() : what === 'daily' ? dailyHeld() : null;
  if (held) return held === saves.current ? titleContinue() : playSlot(held);
  const n = freeSlot();
  if (n) return startIn(what, n);
  ui.titleFor = what;
  return titleView('replace');
}
function startIn(what, n) {
  prefs.introDone = true;
  savePrefs();
  if (what === 'tutorial') {
    prefs.guideSeen = {};
    return startTutorial(n);
  }
  return what === 'daily' ? startDaily(n) : newKeep(n);
}

const SECTIONS = { hud: hudHTML, bar: barHTML, title: titleHTML, sheet: sheetHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let drawnToasts = -1;

const LIVE = {
  heat: (id) => fireTrend(id),
  assault: () => assaultText(),
  clock: () => clockText(),
  'eclipse-left': () => (eclipseNow() ? String(Math.max(0, Math.ceil((s.eclipse.to - s.t) / TICKS_PER_SEC))) : '0'),
  food: () => floor1(s.res.food),
  candles: () => floor1(s.res.candles),
  glass: () => floor1(s.res.glass),
  stone: () => floor1(s.res.stone || 0),
  essence: () => floor1(s.res.essence),
  rem: () => floor1(s.res.remembrance),
  defense: () => fmt(defense(s)),
  foes: () => String(s.night?.foes.length ?? 0),
  tocome: () => String(s.night?.spawns.length ?? 0),
  killed: () => String(s.night?.stats.killed ?? 0),
  't-ess': () => fmt(s.night?.stats.essence ?? 0),
  't-glass': () => fmt(s.night?.stats.glass ?? 0),
  mem: (id) => String(Math.max(0, Math.ceil(byId(s.shades, id)?.memory ?? 0))),
  lore: () => fmt(s.study?.lore ?? 0),
  status: (id) => {
    const d = byId(s.shades, id);
    return d ? shadeStatus(d, lightMap(K(), s.tuning, s.night?.candles || [])) : '';
  },
};
const BARS = {
  wfill: () => (ui.watch ? ui.watch.c.u / Math.max(1, ui.watch.idx.total) : 0),
  heat: (id) => s.fires?.find((f) => f.room === id)?.heat ?? 0,
  gate: () => Math.max(0, s.raid?.gate ?? 0),
  clock: () => (s.phase === 'day' ? s.t / dayTicks(s) : s.phase === 'night' ? s.t / nightTicks(s) : s.phase === 'dusk' ? 0 : 1),
  tclock: () => (eclipseNow() ? (s.t - s.eclipse.from) / (s.eclipse.to - s.eclipse.from) : s.phase === 'night' ? s.t / nightTicks(s) : 0),
  mem: (id) => (byId(s.shades, id)?.memory ?? 0) / 100,
  visit: (id) => {
    const v = s.visitors?.find((x) => x.id === id);
    return v && !v.done ? (v.until - s.t) / Math.max(1, v.until - v.at) : 0;
  },
};

function render(alpha, now) {
  // A new room changes the keep's height, so the scale that fits it.
  if (layout.keep !== K().key) {
    layout.keep = K().key;
    layout();
    drawnLabels = '';
  }
  const key = `${s.rev}|${ui.rev}`;
  let changed = false;
  for (const [id, html] of Object.entries(SECTIONS)) {
    if (drawn[id] === key) continue;
    const host = document.getElementById(id);
    const a = document.activeElement;
    if (a && host.contains(a) && a.matches('select, textarea, input:not([type="checkbox"]):not([type="radio"])')) continue;
    const focusId = a && host.contains(a) ? a.id : null;
    const scrolls = [...host.querySelectorAll('#sheet-body, #log, #days-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
    host.innerHTML = html();
    if (id === 'sheet') {
      host.hidden = !ui.sheet;
      host.className = `gsheet${ui.sheet ? ` is-${ui.sheet}` : ''}`;
    }
    if (id === 'title') {
      host.hidden = !ui.title;
      host.parentElement.classList.toggle('is-title', !!ui.title);
    }
    for (const [sid, st, sl] of scrolls) {
      const el = document.getElementById(sid);
      if (el) {
        el.scrollTop = st;
        el.scrollLeft = sl;
      }
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    drawn[id] = key;
    changed = true;
  }
  if (changed) {
    liveEls = [...document.querySelectorAll('[data-live]')];
    barEls = [...document.querySelectorAll('[data-bar]')];
    showHint();
    const hh = `${hudEl.offsetHeight}|${barEl.offsetHeight}`;
    if (hh !== layout.last) {
      layout.last = hh;
      layout();
    }
  }
  for (const el of liveEls) {
    const v = LIVE[el.dataset.live]?.(el.dataset.arg);
    if (v !== undefined && el.textContent !== v) el.textContent = v;
  }
  for (const el of barEls) {
    const f = BARS[el.dataset.bar];
    if (!f) continue;
    const w = `${(Math.max(0, Math.min(1, f(el.dataset.arg))) * 100).toFixed(1)}%`;
    if (el.style.width !== w) el.style.width = w;
  }
  if (drawnToasts !== ui.toastRev) {
    drawnToasts = ui.toastRev;
    document.getElementById('toasts').innerHTML = ui.toasts
      .map((t) => `<div class="toast ${t.tone}"><span>${esc(t.text)}</span><span class="row">${t.open ? `<button type="button" data-act="toast-open" data-id="${t.id}">Open</button>` : ''}<button type="button" data-act="toast-close" data-id="${t.id}">Close</button></span></div>`)
      .join('');
  }
  draw(alpha, now);
}

function openSheet(name, by = 'you') {
  if (name === 'menu' && running() && !ui.paused) {
    ui.paused = true;
    ui.resume = true;
    trail('pause', { by: 'menu' });
  }
  if (ui.sheet !== name) trail('panel', { name, ...tabOf(name), ...(by === 'you' ? {} : { by }) });
  ui.sheet = name;
  bump();
  requestAnimationFrame(() => document.getElementById('sheet-close')?.focus({ preventScroll: true }));
}
function closeSheet() {
  const was = ui.sheet;
  ui.sheet = null;
  ui.confirmSlot = null;
  ui.slotMsg = '';
  ui.moving = null;
  ui.tearAsk = null;
  if (ui.resume) {
    ui.resume = false;
    if (running()) {
      ui.paused = false;
      trail('play', { by: 'menu' });
    }
  }
  if (was) trail('close', { name: was });
  bump();
  if (was) requestAnimationFrame(() => document.getElementById(`open-${was}`)?.focus({ preventScroll: true }));
}

/* ---------------------------------------------------------------- the guide */

// One card at a time, the first time each thing happens in the first season. A card can point at a
// button (a pulsing outline) or at spots on the Tain (pulsing rings), and some pause the clock to be read.
const seen = (id) => !!prefs.guideSeen?.[id];
const first = () => s.season === 1;
const lineSpots = () => lineOf(K());
const litAt = (f, x) => !!s.night && isLit(lightMap(K(), s.tuning, s.night.candles), f, x);
const GUIDE = [
  {
    id: 'welcome', target: '#btn-play',
    when: () => first() && s.phase === 'day' && s.day === 1,
    done: () => running() && !ui.paused,
    text: () => `This is your keep on the Veil${K().n === 1 ? ', what there is of it: a Hearth and a Crypt. You will build the rest' : ''}. Press Play to start the day, and pause whenever you like.`,
  },
  {
    id: 'jobs', target: '#open-people',
    when: () => first() && s.phase === 'day' && s.day === 1 && s.t > dayTicks(s) * 0.15,
    done: () => ui.sheet === 'people',
    text: "People holds everyone's jobs. A job needs its room: cooks in the Hearth, chandlers in a Chandlery, guards in a Barracks. Anyone without a room quarries stone in the Yard to build one.",
  },
  {
    id: 'raid', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.raid?.warned && s.raid.state === 'coming',
    done: () => ui.sheet === 'phase',
    text: () => (s.tuning.raidFight ? "Raiders on the road. Your defense (two for each guard) should match their strength. The Day panel has the numbers: move people to the Barracks, ward the gate with essence, bar the stores, or pay them off. When they reach the gate you'll fight for it, with pitch, stone and the bell." : 'Raiders on the road. Your defense (two for each guard) has to match their strength. The Day panel has the numbers: move people to the Barracks, or ward the gate with essence.'),
  },
  {
    id: 'fire', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.fires?.length > 0,
    done: () => ui.sheet === 'phase',
    text: "Fire! Everyone in the room fights it, but a Hearth or Forge fire outgrows a room's own hands. Send the Yard's masons from the Day panel, or at full heat it kills and spreads.",
  },
  {
    id: 'visitor', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && s.visitors?.some((v) => v.here && !v.done),
    done: () => ui.sheet === 'phase',
    text: 'Someone is at the gate. The Day panel shows what they want, what each answer costs and gives, and how long they will wait. Left waiting, they take the last answer.',
  },
  {
    id: 'library', target: '#open-phase',
    when: () => s.phase === 'day' && !!s.tuning.library && roomsOf(K(), 'library').length > 0 && !s.study && !s.learned.length,
    done: () => ui.sheet === 'phase',
    text: 'The Library studies one thing at a time. Begin a study in the Day panel with remembrance; its scholars by day, and a shade in the Archive of the Dead by night, finish it.',
  },
  {
    id: 'hall', target: '#open-phase',
    when: () => s.phase === 'day' && !!s.tuning.hall && roomsOf(K(), 'hall').length > 0 && !decreeOf(s),
    done: () => ui.sheet === 'phase',
    text: 'The Hall proclaims one decree a season: rationing, a curfew or a levy, each with its price, in the Day panel. By night a shade seated in the Court of Shades hears one of the dead’s requests for free.',
  },
  {
    id: 'ladders', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && laddersDue(s) && s.raid?.warned && s.raid.state === 'coming',
    done: () => ui.sheet === 'phase',
    text: () => (gatehouseOf(s) ? 'From this season the Host brings ladders. With a gate guard on the Gatehouse’s walls every one is thrown down; each left standing adds to the Host. The Day panel has the numbers.' : 'From this season the Host brings ladders, and only a Gatehouse’s guards throw them down: each left standing adds to the Host. The Day panel has the numbers.'),
  },
  {
    id: 'midsummer', target: '#open-phase',
    when: () => s.phase === 'day' && eclipseDue(s) && !s.eclipse && !s.today.eclipse,
    done: () => ui.sheet === 'phase',
    text: () => `Midsummer: at ${hhmm(6 + (12 * eclipseSpan(s)[0]) / dayTicks(s))} the sun goes dark for ${fmt(s.tuning.eclipseSecs)} seconds and the Tain wakes while the day goes on. The Day panel says who stands beside their dead, and what the eclipse brings.`,
  },
  {
    id: 'eclipse', target: '#tool-candle', pause: true,
    when: () => eclipseNow(),
    done: () => !eclipseNow() || !!s.night?.candles.length,
    text: 'The eclipse: the day goes on above the Veil, and below it the Tain is awake. Set candles and move the shades there, as at night, while the Host is at the gate. Anyone who dies in the dark wakes at once.',
  },
  {
    id: 'undergate', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && undergateOpen(s) && s.night?.spawns.some((sp) => sp.rift === 'undergate'),
    done: () => ui.sheet === 'phase',
    text: 'Your Gatehouse’s twin, the Undergate, faces the Deep: from this season some of the Creepers come up there instead of at the rifts. Light it and post a fighter, or ward it from the Dusk panel.',
  },
  {
    id: 'weepers', target: '#open-phase',
    when: () => first() && s.phase === 'dusk' && s.dusk?.step === 'place' && s.night?.spawns.some((sp) => sp.type === 'weeper'),
    done: () => ui.sheet === 'phase',
    text: () => `${s.night.spawns.some((sp) => sp.type === 'weeper' && !sp.curse) ? 'Someone died today, so tonight the Weepers come' : "On the hedge-witch's curse, a Weeper comes tonight"} for the sleepers: they make for the dark of the ${roomsOf(K(), 'quarters').length ? 'Dreamwell' : 'Cold Hearth'}. One that weeps there long enough gives someone a nightmare, and they work poorly tomorrow. Light it, post a shade there, or a Keening shade on its floor.`,
  },
  {
    id: 'rain-coming', target: '#open-phase',
    when: () => !!s.tuning.weather && s.phase === 'day' && forecastOf(s) === 'rain' && drownedDue(s, true),
    done: () => ui.sheet === 'phase',
    text: "Rain tomorrow: the Sky in the HUD shows the weather a day ahead. Rain slows the Yard and damps fire, and tomorrow night the Drowned come up out of the moat's twin, behind your line, and make for the mirrors. Keep essence to ward the moat, or a fighter and a candle for the mirror on their side.",
  },
  {
    id: 'drowned', target: '#tool-ward',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && nightView() && !!s.night?.spawns.some((sp) => sp.type === 'drowned') && !s.night.wards.includes('moat'),
    marks: () => {
      const end = MAP.moat.find((w) => w.id === s.night?.spawns.find((sp) => sp.type === 'drowned')?.rift) || MAP.moat[0];
      const m = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - end.x) < Math.abs(a.x - end.x) ? b : a));
      return [{ f: K().veil, x: end.x }, { f: K().veil, x: m.x }];
    },
    done: () => !!s.night?.wards.includes('moat') || s.phase === 'night',
    text: () => `Rain: tonight the Drowned come up out of the moat's twin at the marked end, behind the line, and make for the mirror beside it. Ward the moat (${fmt(wardCost(s))} essence: pick Ward, then tap that end), or light that mirror and post a fighter by it.`,
  },
  {
    id: 'deep', target: '#open-phase',
    when: () => first() && !!s.tuning.deep && s.phase === 'dusk' && s.dusk?.step === 'place' && s.day >= 3 && s.day < s.tuning.seasonDays && s.shades.filter(canWork).length >= 4,
    done: () => ui.sheet === 'phase',
    text: 'A shade you can spare tonight can go down past the rifts into the Deep instead of taking a post (the Dusk panel). At dawn it brings back quicksilver, which upgrades a mirror where it hangs, unless something down there catches it. The deeper, the more, and the likelier.',
  },
  {
    id: 'crypt', target: '#bar-wake',
    when: () => first() && s.phase === 'dusk' && s.dusk.step === 'crypt' && !ui.cross,
    text: 'Dusk. Whoever died today wakes tonight as a shade, and how they died decides what kind. A priest can give one a funeral instead: they rest, and you gain remembrance.',
  },
  {
    id: 'tain',
    when: () => first() && s.phase === 'dusk' && s.dusk.step === 'place' && nightView(),
    marks: () => [...MAP.rifts.map((r) => ({ f: DEEP_FLOOR, x: r.x })), ...MAP.mirrors.map((m) => ({ f: K().veil, x: m.x }))],
    text: () => `This is the Tain, the keep's reflection. The Unlit climb from the red rifts in the Deep up to the two mirrors under the Veil. They can't cross candlelight.${prefs.ways !== false ? " The red chevrons are the way they'll take tonight; set a candle and watch them change." : ''}`,
  },
  {
    id: 'line', target: '#tool-candle',
    when: () => first() && seen('tain') && s.phase === 'dusk' && s.dusk.step === 'place' && nightView(),
    marks: () => lineSpots().filter((p) => !litAt(p.f, p.x)),
    done: () => lineSpots().every((p) => litAt(p.f, p.x)),
    text: () => `${K().n === 1 ? 'Light the two marked spots between each rift and its mirror' : 'Light the feet of the two stairs up to the Veil (marked)'}, with a shade at each. Creepers stopped there gnaw at the edge of the light, and a shade standing in it cuts them down.${K().n > 1 && s.tuning.lineGuard ? ' A shade in that light guards the line: it can keep the Watch, but does no other work.' : ''}`,
  },
  {
    id: 'begin', target: '#bar-start',
    when: () => first() && seen('line') && s.phase === 'dusk' && s.dusk.step === 'place',
    done: () => s.phase === 'night',
    text: 'Candles you post in a room let the shade there work its night job. Candles you keep carry over to tomorrow. Begin the night when you are ready.',
  },
  {
    id: 'night', target: '#btn-hush', pause: true,
    when: () => first() && s.phase === 'night' && s.t > 30,
    text: 'Watch the edges of the light. If a shade is caught in the dark, drop a candle on it. Hush makes the Unlit pass the shades by, but stops all work.',
  },
  {
    id: 'rite', target: '#bar-day',
    when: () => first() && s.phase === 'dawn',
    text: "Dawn: the Rite. Keep a shade and it works again tonight, but the keep's Dread rises. Cover its mirror to let it rest. Every shade fades a little each night; naming one halves that.",
  },
  {
    id: 'request', target: '.rite-list .is-asking',
    when: () => first() && s.phase === 'dawn' && Object.keys(s.rite?.asks || {}).length > 0,
    text: () => requestText(),
  },
  {
    id: 'traits', target: '.rite-list',
    when: () => first() && seen('rite') && s.phase === 'dawn' && traitsOn() && s.shades.some((d) => SHADE_TRAITS[d.trait]),
    text: () => `Everyone has a trait, and death turns it over: the Brave wake Reckless, the Devout Bitter, the Greedy Hoarding. Each shade's line says what it does now. A Bitter one costs ${s.tuning.dreadPerKeep * SHADE_TRAITS.bitter.dread} Dread to keep, but makes wards cheap; read them before you choose.`,
  },
  {
    id: 'build', target: '#btn-build',
    when: () => first() && s.phase === 'day' && seen('jobs') && s.t > dayTicks(s) * 0.2,
    done: () => ui.sheet === 'build',
    text: () => `Build raises a room for ${s.tuning.roomStone} stone, on top of the keep or in a bare hall; masons in the Yard quarry ${DAY_ROOMS.yard.rate} a day each. Raiders come on day 2, so a Barracks first, and a Chandlery before the candles run out. A room holds ${s.tuning.roomCap} workers. What you build on top by day is the Tain's deepest room by night, next to the rifts.`,
  },
  {
    id: 'whispers', target: '#open-people',
    when: () => first() && s.phase === 'day' && !!s.tuning.whispers && s.shades.some((d) => canWork(d) && jobCount(s, tradeOf(s, d)) > 0),
    done: () => s.shades.some((d) => d.byDay),
    text: () => `The dead can help by day. In People, a shade can whisper its old trade to whoever works it now: they work ×${mult(s.tuning.whisperMult)}, and the shade loses ${fmt(s.tuning.whisperFade)} memory at dusk. A shade in a great glass can step through and work a room in person instead.`,
  },
  {
    id: 'church', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.inspection && !s.inspection.done,
    text: 'The Lantern Church inspects at noon. Dread 0 or 1 is blessed; 4 or 5 costs your fullest mirror and the shades in it. A vigil in the Day panel lowers Dread for 3 remembrance.',
  },
  {
    id: 'embargo', target: '#open-phase',
    when: () => first() && s.phase === 'day' && embargoed(s) && !inquisition(s),
    text: () => `The censure brought the Church's silver embargo: for ${s.tuning.embargoDays} days the Glazier makes no glass and no mirror can be built. A blessing lifts it, or a donation of ${s.tuning.donation} remembrance in the Day panel. Censured again while it stands, the keep is given to the Inquisition, which inspects every day.`,
  },
  {
    id: 'errands', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && !!s.night?.errands?.length,
    text: () => `Something has turned up in the dark tonight: the black mirror in the Dusk panel says what and where. A shade that reaches it takes it${s.tuning.lanterns ? ', and a lantern (pick the shade, then T) lets it carry its own light there' : ''}. The Unlit hunt the dark, so choose who goes, and when. A sleepwalker is saved by a shade that reaches them, or by light.`,
  },
  {
    id: 'omens', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && !!(s.night?.omen || s.night?.omens),
    text: () => `Tonight has an omen: the Dusk panel says what it changes.${s.night?.omens ? ' The black mirror shows two tonight, so choose the one you would rather face before you begin.' : ''} At night the tide clock under the top bar marks what's coming, and Skip (N) runs to just before the next mark.`,
  },
  {
    id: 'acts', target: '#tool-move', pause: true,
    when: () => first() && s.phase === 'night' && s.day >= 2 && !!s.tuning.acts && s.shades.some((d) => canAct(s, d)),
    text: 'Each shade has one act a night, paid in its memory. A Loyal one Stands: its light can\'t be gnawed for a while, and it strikes twice as hard. A Serene one Kindles its candle, free. A Pale one Passes unseen, out of any grip. A Stranger Lures the Unlit to it. Pick a shade, and its act is on the bar (A).',
  },
  {
    id: 'crusade', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && crusadeDaysLeft(s) > 0,
    text: () => `The Lantern Church has proclaimed a crusade: it comes to the gate ${crusadeDaysLeft(s) === 1 ? 'tomorrow' : `in ${crusadeDaysLeft(s)} days`}, and if it breaks in it smashes every mirror it can find. A blessing before then calls it off, so bring Dread down. The Day panel can hide mirrors from it, at the cost of their shades until it's over.`,
  },
  {
    id: 'maw', target: '#tool-move', pause: true,
    when: () => first() && s.phase === 'night' && s.night.foes.some((f) => f.type === 'maw'),
    text: 'A Maw. It goes for whatever is worth most for the least fight: the candle holding the stairs, or a room where people work. It counts every fighter on its way, so a thick line only sends it elsewhere. Watch where it heads, and send a fighter there with a candle. A room it stands in for 12 seconds breaks, and costs Dread at dawn.',
  },
  {
    id: 'moon', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && isNewMoon(s),
    get text() {
      return `Tonight is the new moon. The Hollow walks to the mirrors whatever the light. A ward on a stair holds it ${s.tuning.wardDraw ? 'while it draws on the essence, and a little while once the store is empty' : 'a while'}; shades fighting it drive it back. If it reaches the Veil, it takes one of the living.`;
    },
  },
];

/* ---------------------------------------------------------------- the tutorial keep */

// The tutorial keep's lessons. Its first three days go by a script in the sim (TUTORIAL in data.js); these
// teach them, one at a time. A lesson with done() waits until you've done it, or skipped it; one without
// waits for Got it. The list's order is its priority: what's happening now (a death, a fire, the Host at the
// gate) comes before the day's next task. Progress is kept in the keep (s.tut), so a new tutorial keep
// teaches again. The guide holds its own cards back until the tutorial is over, and a lesson counts the
// guide's cards it covers as read.
const tutOn = () => isTutorial(s) && s.season === 1 && !s.tut?.off && !s.tut?.over;
const tutHas = (id) => !!s.tut?.done?.[id];
const onDay = (d, phase = 'day') => s.day === d && s.phase === phase;
const built = (type) => roomsOf(K(), type).length > 0;
const maud = () => s.shades.find((d) => d.name === TUTORIAL.servant.name && canWork(d)) || null;
const newcomer = () => s.today.arrivals.map((id) => byId(s.living, id)).find(Boolean) || null;
// A spot on the line is held when a shade stands in its light.
const guarded = (p) => litAt(p.f, p.x) && s.shades.some((d) => canWork(d) && d.post?.f === p.f && Math.abs(d.post.x - p.x) <= 8 && litAt(d.post.f, d.post.x));
const churchWord = () => s.log.some((l) => l.season === 1 && l.day === 3 && /^Word comes from the Lantern Church: its inspector/.test(l.text));
// The guide's words for the dead's requests, which the tutorial uses too.
const requestText = () => `The dead ask for things. A shade that has served ${s.tuning.askAfter} nights asks one thing at the rite: a Loyal one to stand the gate by day, a Stranger a name, a Pale one to be remembered, and a Serene one, as its memory fails, to be let go. Granted, it asks no more; refused ${s.tuning.refusals === 2 ? 'twice' : `${s.tuning.refusals} times`}, it turns Restless and leaves its mirror.`;
const TUT = [
  // What's happening now.
  {
    id: 't-maud', pause: true,
    when: () => onDay(1) && s.today.deaths.some((id) => s.ledger.find((e) => e.id === id)?.name === TUTORIAL.servant.name),
    text: () => `${TUTORIAL.servant.name}, the old servant, has died. Anyone who dies inside the walls lies in the crypt until dusk, then wakes as a shade, and how they died decides what kind. Old age makes the Serene, who work best of all the dead.`,
  },
  {
    id: 't-fire', covers: ['fire'], target: '#open-phase', pause: true,
    when: () => onDay(2) && s.fires.length > 0,
    done: () => !s.fires.length,
    text: "Fire in the Hearth! Its cooks fight it, but a Hearth fire outgrows two pairs of hands. Open the Day panel and send the Yard's masons. Left alone it spreads, and fighting it at full heat kills; still burning at dusk, the room is lost for tomorrow.",
  },
  {
    id: 't-assault', target: '#open-phase', pause: true,
    when: () => onDay(2) && s.raid?.state === 'assault',
    done: () => s.raid?.state !== 'assault',
    text: () => `The Host is at the gate. Each second they're stronger than your defense, the gate gives; if it still stands when their time is up, they fall back. In the Day panel: pour pitch (${s.tuning.raidPitchCost} candles) to weaken them, shore the gate with stone, or ring the bell to bring everyone to the walls. Candles poured are candles you won't have tonight.`,
  },
  {
    id: 't-raid', covers: ['raid'], target: '#open-phase', pause: true,
    when: () => onDay(2) && s.raid?.warned && s.raid.state === 'coming',
    text: () => `Raiders on the road: strength ${fmt(s.raid.strength)}, against your defense of ${fmt(defense(s))} (2 for each guard; a Brave one counts 3, a Coward 1). They reach the gate a little after noon. Before then: more guards, a ward on the gate if you have the essence, or, in the Day panel, bar the stores or pay them off.`,
  },
  {
    id: 't-church', target: '#open-phase', pause: true,
    when: () => onDay(3) && churchWord(),
    text: () => `The Lantern Church judges how a keep keeps its dead, by its Dread: on day ${s.tuning.firstInspection}, and whenever Dread reaches ${s.tuning.dreadMax}. At 0–1 it blesses the keep; at 4–5 it takes your fullest mirror and the shades in it. Dread is now ${s.dread}. Priests bear Dread, 1 each, and a vigil in the Day panel lowers it for ${s.tuning.vigilCost} remembrance.`,
  },
  {
    id: 't-crack', pause: true,
    when: () => s.phase === 'night' && s.day < TUTORIAL.safeUntil && s.night.stats.cracks > 0,
    text: () => `A Creeper reached a mirror and the Veil cracked. Each crack costs 1 Dread at dawn, and one heals each dawn; ${s.tuning.cracksMax} at once break the Veil and the keep is lost. Here it can't break before night ${TUTORIAL.safeUntil}. Light the way it came.`,
  },
  {
    id: 't-maw', covers: ['maw'], target: '#tool-move', pause: true,
    when: () => s.phase === 'night' && s.day < TUTORIAL.safeUntil && s.night.foes.some((f) => f.type === 'maw'),
    text: () => `A Maw, weakened for the tutorial. It walks through light to whatever is worth most for the least fight: the candle holding the way up, or a room where the dead work, and it counts every fighter on its way. A room it stands in for ${s.tuning.mawBreak} seconds breaks. Watch where it heads, and move a fighter there with a candle.`,
  },
  // Day 1: jobs, the Yard, building.
  {
    id: 't-play', covers: ['welcome'], target: '#btn-play',
    when: () => onDay(1),
    done: () => running() && !ui.paused,
    text: 'This is the tutorial keep: three days and nights, one thing at a time. The keep is what there is of it, a Hearth and a Crypt. Press Play to start the day, and pause whenever you like.',
  },
  {
    id: 't-people', covers: ['jobs'], target: '#open-people',
    when: () => onDay(1) && tutHas('t-play'),
    done: () => ui.sheet === 'people',
    text: 'Open People. Everyone has a job, and a job needs its room: cooks in the Hearth, guards in a Barracks, chandlers in a Chandlery. Anyone without one quarries stone in the Yard.',
  },
  {
    id: 't-build', covers: ['build'], target: '#btn-build',
    when: () => onDay(1) && tutHas('t-people'),
    done: () => built('barracks'),
    text: () => `Raiders come tomorrow. Build a Barracks: tap Build. A room costs ${s.tuning.roomStone} stone (you have ${fmt(s.res.stone)}), and unless you choose a bare hall it goes on top of the keep.`,
  },
  {
    id: 't-guards', target: '#open-people',
    when: () => (onDay(1) || onDay(2)) && built('barracks') && tutHas('t-build'),
    done: () => jobCount(s, 'barracks') >= 2,
    text: 'Put two people in the Barracks: in People, set their job, or pick a name and tap the room. Each guard is 2 defense. Everyone has a trait, under their name: Ada is Brave, ×1.5 at the gate but likelier to fall; her brother Wil is a Coward, ×0.5.',
  },
  {
    id: 't-chandlery', target: '#btn-build',
    when: () => (onDay(1) || onDay(2)) && tutHas('t-guards'),
    done: () => built('chandlery') && jobCount(s, 'chandlery') >= 1,
    text: () => `The masons quarry ${DAY_ROOMS.yard.rate} stone a day each. Next a Chandlery, with someone in it: candles are what the night runs on, and you have ${fmt(s.res.candles)}. Osk is Greedy, ×1.25 there. After that, every room is in Build, with what it does by day and by night.`,
  },
  // Dusk 1: the Crossing, the Tain, candles, posts, the black mirror.
  {
    id: 't-crypt', covers: ['crypt'], target: '#bar-wake',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'crypt' && !ui.cross,
    done: () => s.dusk?.step !== 'crypt',
    text: () => `Dusk: the Crossing. ${TUTORIAL.servant.name}'s body lies in the crypt. ${priests(s) ? 'Your priest could give her a funeral: she would rest, and you would gain remembrance.' : 'A priest in a Chapel could give her a funeral, and you have none yet.'} Otherwise she wakes tonight as a shade in a mirror. Let her wake.`,
  },
  {
    id: 't-tain', covers: ['tain'],
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && nightView(),
    marks: () => [...MAP.rifts.map((r) => ({ f: DEEP_FLOOR, x: r.x })), ...MAP.mirrors.map((m) => ({ f: K().veil, x: m.x }))],
    text: 'This is the Tain, the keep reflected under the Veil, where the night happens. The Unlit climb from the red rifts in the Deep to the two mirrors under the Veil. They can’t cross candlelight.',
  },
  {
    id: 't-line', covers: ['line'], target: '#tool-candle',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-tain'),
    marks: () => lineSpots().filter((p) => !litAt(p.f, p.x)),
    done: () => lineSpots().every((p) => litAt(p.f, p.x)),
    text: () => `${K().n === 1 ? 'Light the two marked spots between each rift and its mirror' : 'Light the feet of the two stairs up to the Veil (marked)'}: choose Candle, then tap each. That's the line: to reach the mirrors, the Unlit have to get past it.`,
  },
  {
    id: 't-guard', target: '#tool-move',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-line'),
    marks: () => lineSpots().filter((p) => !guarded(p)),
    done: () => lineSpots().every(guarded),
    text: 'Now a shade in each light. Choose Move, tap one of the dark figures with glowing eyes, then a spot inside one of the lights; then the other, into the other light. They are Garrick and Hesper, the last keeper’s dead. Creepers stopped at the light gnaw its edge, and a shade standing in it cuts them down.',
  },
  {
    id: 't-post', target: '#tool-move',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-guard') && !!maud(),
    done: () => {
      const d = maud();
      return !!d && !!TWINS[postRoom(s, d)]?.job && litAt(d.post.f, d.post.x);
    },
    text: () => `Now ${TUTORIAL.servant.name}. Each room's twin has a night job, which a shade works only in the light: ${built('chandlery') ? 'the Wick Room saves candles, ' : ''}${built('barracks') ? 'the Watch adds to tomorrow’s defense, ' : ''}the Cold Hearth rests a shade. Choose Move, tap her in the Waking Room, then a spot in a room, and set a candle there.`,
  },
  {
    id: 't-mirror', target: '#open-phase',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && (tutHas('t-post') || !maud()) && tutHas('t-guard'),
    done: () => ui.sheet === 'phase',
    text: 'Open the Dusk panel. Its black mirror reads tonight’s threats: how many come and when, from which rift, and where each tide will get past your candles. The red chevrons on the Tain are their ways.',
  },
  {
    id: 't-begin', covers: ['begin'], target: '#bar-start',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-mirror'),
    text: 'Candles you keep carry over to tomorrow. Begin the night when you are ready.',
  },
  {
    id: 't-night', covers: ['night'], target: '#btn-hush', pause: true,
    when: () => onDay(1, 'night') && s.t > 30,
    text: 'One small tide tonight. Watch the edges of the light: a shade standing in it cuts down what comes. If a shade is caught in the dark, drop a candle on it. Hush makes the Unlit pass the shades by, but stops all work.',
  },
  // Dawn 1: the rite.
  {
    id: 't-rite', covers: ['rite'],
    when: () => onDay(1, 'dawn'),
    text: () => {
      const P = ritePreview(s);
      return `Dawn: the rite. Each shade you keep works again tonight but adds ${s.tuning.dreadPerKeep} Dread; the living bear 1 for every ${s.tuning.dreadLivingPer} of them, and priests 1 each. Cover a shade’s mirror and it rests, for 1 remembrance. As you have it, Dread goes ${P.dread.from} → ${P.dread.to}.`;
    },
  },
  {
    id: 't-traits', covers: ['traits'], target: '.rite-list',
    when: () => onDay(1, 'dawn') && tutHas('t-rite') && traitsOn() && s.shades.some((d) => SHADE_TRAITS[d.trait]),
    text: () => `Death turns a trait over: Garrick, Brave in life, is Reckless, and ${maud() ? TUTORIAL.servant.name : 'Hesper'}, Stubborn, is Anchored: she fades half as fast. Every shade fades a little each night, and naming one (${s.tuning.nameCost} remembrance) halves that. Read each line before you choose.`,
  },
  {
    id: 't-day2', target: '#bar-day',
    when: () => onDay(1, 'dawn') && (tutHas('t-traits') || !traitsOn()) && tutHas('t-rite'),
    text: 'Begin day 2 when you are ready. Raiders are expected.',
  },
  // Day 2: a newcomer, a fire, the raid.
  {
    id: 't-newcomer', target: '#open-people',
    when: () => onDay(2) && !!newcomer(),
    done: () => !!newcomer()?.job,
    text: () => `${newcomer().name} has come to the gate and asks to stay. Someone new arrives every second day while there's room. Give ${newcomer().name} a job in People.`,
  },
  {
    id: 't-after',
    when: () => onDay(2) && ['held', 'breached', 'paid'].includes(s.raid?.state),
    text: () => (s.raid.state === 'paid'
      ? "They took the tribute and turned back. The season's next raid will come harder for it."
      : `${s.raid.state === 'held' ? 'The gate held.' : 'The gate gave way. After a breach, the Day panel lets your guards go after what was taken, at a risk.'} One raider fell inside, and lies in the crypt: a raider who dies inside the walls wakes as a Stranger, a fighter with no bonds.`),
  },
  // Dusk and dawn 2: full mirrors and the Restless.
  {
    id: 't-full', target: '#bar-wake',
    when: () => onDay(2, 'dusk') && s.dusk.step === 'crypt' && !ui.cross && s.bodies.length > 0,
    done: () => s.dusk?.step !== 'crypt',
    text: () => {
      const over = crossingPreview(s).some((x) => x.to === 'overflow');
      return `${over ? 'Every mirror is full, and a shade needs a place in one. With no room, the raider wakes Restless at the edge of the Deep: it does no work, costs Dread, and turns Wraith after three nights unless you release it.' : 'There is room in the mirrors, so the raider wakes as a Stranger.'}${priests(s) ? ' Or give it a funeral: raiders are burned with the Host’s dead.' : ''} Let them wake.`;
    },
  },
  ...[2, 3].map((d) => ({
    id: `t-relight${d}`, target: '#tool-candle',
    when: () => onDay(d, 'dusk') && s.dusk.step === 'place',
    marks: () => lineSpots().filter((p) => !guarded(p)),
    done: () => lineSpots().every(guarded),
    text: 'Last night’s candles are gone: every dusk, the line is set again. Light the marked spots and put a shade in each light. The shades stay where you last posted them.',
  })),
  {
    id: 't-hunters',
    when: () => onDay(2, 'dusk') && s.dusk.step === 'place' && tutHas('t-relight2'),
    text: () => `Tonight some of the Creepers hunt candles instead of the mirrors. A candle burns ${fmt(s.tuning.candleWax / 60)} minutes; relight what goes out. Essence, sung in the Choir under a Chapel, buys wards: one seals a rift or holds a stair for the night.`,
  },
  {
    id: 't-ask', covers: ['request'], target: '.rite-list .is-asking',
    when: () => (onDay(2, 'dawn') || onDay(3, 'dawn')) && Object.keys(s.rite?.asks || {}).length > 0,
    text: () => requestText(),
  },
  {
    id: 't-release', target: '.rite-list',
    when: () => onDay(2, 'dawn') && s.shades.some((d) => d.kind === 'restless'),
    text: () => `Release the Restless shade: it goes to rest, for 1 remembrance. Or bind it into a free mirror for ${s.tuning.bindCost} essence, and it settles as what it would have been. Left alone it costs Dread every dawn.`,
  },
  // Day 3: glass and mirrors, the Chapel.
  {
    id: 't-glazier', target: '#btn-build',
    when: () => onDay(3),
    done: () => built('glazier') && jobCount(s, 'glazier') >= 1,
    text: () => `Mirrors hold the dead, and glass makes mirrors: a hand mirror is ${MIRRORS.hand.glass} glass for one shade, a pier glass ${MIRRORS.pier.glass} for two, built from the Day panel. Build a Glazier and put someone in it, ${DAY_ROOMS.glazier.rate} glass a day each. Sabe is Diligent, ×1.15 at anything.`,
  },
  {
    id: 't-chapel', target: '#btn-build',
    when: () => onDay(3) && tutHas('t-church'),
    done: () => built('chapel') && priests(s) >= 1,
    text: 'Build a Chapel and put Tam in it: he’s Devout, ×1.5 there. A priest bears Dread, holds a funeral each dusk, and makes remembrance, which pays for vigils and for naming the dead.',
  },
  // The end.
  {
    id: 't-done',
    when: () => onDay(3, 'dawn') || s.day >= TUTORIAL.safeUntil,
    text: () => `That's the tutorial. From here it's an ordinary season: raids on days 4 and 6, the Church on day ${s.tuning.firstInspection}, and on the seventh night the new moon, when the Hollow rises. From night ${TUTORIAL.safeUntil} the Unlit also seep up through dark rooms, and the Veil can break. The guide shows a card the first time anything new happens, and Menu, How to play, has every lesson.`,
  },
];
function tutStep() {
  return TUT.find((g) => !tutHas(g.id) && g.when()) || null;
}
function tutMark(id) {
  s.tut = { ...(s.tut || {}), done: { ...(s.tut?.done || {}), [id]: true } };
  const g = TUT.find((x) => x.id === id);
  if (g?.covers) prefs.guideSeen = { ...(prefs.guideSeen || {}), ...Object.fromEntries(g.covers.map((c) => [c, true])) };
  if (id === 't-done') s.tut.over = true;
  savePrefs();
  saveGame();
}
let coachId = null;
const coachEl = document.getElementById('coach');
function guideStep() {
  if (ui.title || ui.sheet === 'test') return null; // one thing at a time: the main screen or the note, then the lesson
  if (tutOn()) return tutStep();
  if (!prefs.guide) return null;
  return GUIDE.find((g) => !seen(g.id) && g.when()) || null;
}
const isTut = (id) => id?.startsWith('t-');
function markSeen(id) {
  if (isTut(id)) tutMark(id);
  else {
    prefs.guideSeen = { ...(prefs.guideSeen || {}), [id]: true };
    savePrefs();
  }
  bump();
}
function showCoach(step) {
  if (ui.watch) {
    // A session's lessons are the tester's, marked on the timeline; the watcher's own are left as they were.
    coachId = null;
    coachEl.hidden = true;
    coachEl.innerHTML = '';
    coachRoom();
    return;
  }
  const id = step?.id || null;
  if (id === coachId) return;
  // A card the player has moved past (the moment it was about is over) counts as read.
  const was = [...TUT, ...GUIDE].find((g) => g.id === coachId);
  if (was && !was.when()) {
    if (isTut(was.id)) {
      if (isTutorial(s) && !tutHas(was.id)) tutMark(was.id);
    } else if (!seen(was.id)) prefs.guideSeen = { ...(prefs.guideSeen || {}), [was.id]: true };
  }
  coachId = id;
  if (step) trail('lesson', { id, text: String(typeof step.text === 'function' ? step.text() : step.text).slice(0, 100) });
  if (id === 't-done' && s.test && !s.test.asked) {
    s.test.asked = true;
    saveGame();
    ui.testNote = false;
    openSheet('test', 'game');
  }
  bump();
  coachEl.hidden = !step;
  const tut = isTut(id);
  coachEl.classList.toggle('is-tutorial', tut);
  if (!step) {
    coachEl.innerHTML = '';
    coachRoom();
    return;
  }
  const buttons = tut
    ? `<button class="btn sm${step.done ? '' : ' primary'}" id="coach-ok" data-act="guide-ok" data-id="${step.id}">${step.done ? 'Skip this' : 'Got it'}</button>${step.id === 't-done' ? '' : '<button class="btn sm" id="coach-off" data-act="tut-end">End the tutorial</button>'}`
    : `<button class="btn sm primary" id="coach-ok" data-act="guide-ok" data-id="${step.id}">Got it</button><button class="btn sm" id="coach-off" data-act="guide-off">Skip the guide</button>`;
  const label = step.id === 't-done' ? 'The tutorial is over' : `Tutorial, day ${s.phase === 'dawn' ? s.day + 1 : s.day}`; // as the HUD counts
  coachEl.innerHTML = `${tut ? `<span class="eyebrow">${label}</span>` : ''}<p>${esc(typeof step.text === 'function' ? step.text() : step.text)}</p><div class="row">${buttons}</div>`;
  coachRoom();
  if (step?.pause && running() && !ui.paused) {
    ui.paused = true;
    trail('pause', { by: 'lesson', id });
    bump();
  }
}
// How much room the card needs above a phone's panel (season.css keeps the panel below it).
function coachRoom() {
  const h = coachEl.hidden ? '0px' : `${coachEl.offsetHeight + 10}px`;
  if (gameEl.style.getPropertyValue('--coach-h') !== h) gameEl.style.setProperty('--coach-h', h);
}
window.addEventListener('resize', coachRoom);
function tickGuide() {
  if (ui.watch) return null;
  let step = guideStep();
  if (step?.done?.()) {
    markSeen(step.id);
    step = guideStep();
  }
  showCoach(step);
  for (const el of document.querySelectorAll('.is-coached')) if (!step?.target || !el.matches(step.target)) el.classList.remove('is-coached');
  if (step?.target) document.querySelector(step.target)?.classList.add('is-coached');
  return step;
}

/* ---------------------------------------------------------------- the clock */

let toastSeq = 0;
function toast(text, tone = '', open = null) {
  ui.toasts.push({ id: ++toastSeq, text, tone, open, until: performance.now() + 5500 });
  const room = window.innerWidth < 600 ? 2 : 3;
  if (ui.toasts.length > room) ui.toasts.splice(0, ui.toasts.length - room);
  ui.toastRev++;
}
const STOPS = /^The eclipse\.|has caught|The Hollow rises|Raiders on the road|^At the gate:|The camp outside stirs|has made camp|The Host is at the gate|inspector|has turned Wraith|A Maw is tearing|A Maw is breaking|^Fire in the|The fire spreads|^Plague/;
const OPENS = /^The eclipse\.|^Midsummer\.|Raiders on the road|The camp outside stirs|has made camp|The Host is at the gate|The gate gave way|inspector|fallen sick|larder is empty|arrives at the gate|^At the gate:|^Fire in the/;
function takeAlerts(fromClock) {
  let stop = false;
  if (ui.skip && s.alerts.length) endSkip(); // something happened: back to the clock's own pace
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone, OPENS.test(a.text) ? 'phase' : null);
    if (/slipped through the Veil|tore through the Veil/.test(a.text)) ui.flash = performance.now() + 600;
    if (fromClock && prefs.autoPause && STOPS.test(a.text)) stop = a.text;
  }
  if (stop) {
    ui.paused = true;
    ui.rush = false;
    trail('pause', { by: 'alert', why: stop });
    bump();
  }
  return !!stop;
}

// Which panel a new phase opens: the ones with decisions in them.
/* The Crossing, the round-three signature moment: sunset and lights out over the keep, then the day's
   dead rise off the slab and sink through the Veil (or, given a funeral, rise away to rest), and the camera
   follows them down into the Tain. Any tap on the castle skips ahead. */
const CROSS = { sunset: 2600, rise: 500, sink: 1000, gap: 280 };
function afterSunset() {
  if (s.phase === 'dusk' && s.dusk.step === 'crypt') {
    ui.cross = null;
    openSheet('phase');
  } else ui.cross = null;
  bump();
}
function startSouls(plan) {
  if (REDUCED_NOW() || !plan.length) return;
  ui.cross = { stage: 'souls', t0: performance.now(), souls: plan.map((x) => ({ up: x.to === 'funeral', flashed: false })) };
}
function crossingDone(now) {
  const c = ui.cross;
  if (!c) return false;
  if (c.stage === 'sunset') return now - c.t0 >= CROSS.sunset;
  return now - c.t0 >= CROSS.rise + CROSS.sink + CROSS.gap * c.souls.length + 200;
}
function skipCrossing() {
  if (!ui.cross) return false;
  if (ui.cross.stage === 'sunset') afterSunset();
  else {
    ui.cross = null;
    bump();
  }
  return true;
}
function duskAmount(now) {
  if (s.phase !== 'dusk') return 0;
  if (ui.cross?.stage === 'sunset') return Math.min(1, (now - ui.cross.t0) / CROSS.sunset);
  return 1;
}
// Where each crossing soul is now, in world pixels, and how bright.
function soulSpots(now) {
  const c = ui.cross;
  if (c?.stage !== 'souls') return [];
  const cr = roomSpan(K(), 'crypt');
  const slab = K().floors[cr.f].y + 11;
  const out = [];
  c.souls.forEach((sl, i) => {
    const t = now - c.t0 - i * CROSS.gap;
    if (t < 0) return;
    const x = cr.x0 + 7 + (i % 4) * 3;
    if (t < CROSS.rise) {
      out.push({ x, y: slab - (6 * t) / CROSS.rise, a: t / CROSS.rise, up: sl.up });
      return;
    }
    const k = Math.min(1, (t - CROSS.rise) / CROSS.sink);
    if (sl.up) {
      out.push({ x, y: slab - 6 - k * (slab + 40), a: 1 - k, up: true });
      return;
    }
    const y = slab - 6 + k * (MAP.VEIL - slab + 8);
    if (y >= MAP.VEIL && !sl.flashed) {
      sl.flashed = true;
      ui.flash = now + 600;
    }
    out.push({ x, y, a: y < MAP.VEIL ? 1 : Math.max(0, 1 - (y - MAP.VEIL) / 8), up: false });
  });
  return out;
}

function onPhase() {
  if (ui.watch) {
    // A session's phases come and go by themselves: no panel opens, no crossing plays.
    ui.selected = null;
    ui.kb = null;
    return;
  }
  if (!running()) ui.paused = true;
  if (s.phase === 'dusk') {
    ui.tool = 'candle';
    if (!REDUCED_NOW() && seenPhaseWas === 'day') ui.cross = { stage: 'sunset', t0: performance.now() };
    else if (s.dusk.step === 'crypt') openSheet('phase', 'game');
    if (s.dusk.step !== 'crypt' && ui.sheet === 'phase') closeSheet();
  } else if (s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over') openSheet('phase', 'game');
  else if (ui.sheet === 'phase') closeSheet();
  if (s.phase !== 'night' && s.phase !== 'dusk') ui.selected = null;
  if (!placing()) ui.kb = null;
}

// The bed of sound for the moment, how near the Hollow is to the mirrors (its heart beats only while the night
// runs), and the danger: how many of the Unlit are about, and how cracked the Veil is.
function moodNow() {
  const bed = eclipseNow() ? 'night' : { day: 'day', dusk: 'dusk', night: 'night', dawn: 'rite', end: 'rite' }[s.phase] || 'none';
  if (s.phase !== 'night' && !eclipseNow()) return { bed };
  const n = s.night;
  const h = !ui.paused && n.foes.find((f) => f.type === 'hollow' && f.hp > 0 && !f.rising);
  return { bed, hollow: h ? h.f / Math.max(1, K().veil) : null, danger: Math.min(1, n.foes.length / 12 + (0.5 * s.cracks) / s.tuning.cracksMax) };
}

// Skip (round six): at SKIP_SPEED times the 1× clock to SKIP_LEAD before the next mark on the tide clock,
// ending at once if anything calls out on the way.
const SKIP_SPEED = 20;
function skipAhead() {
  if (ui.skip) return endSkip();
  const m = nextMark(s);
  if (!m) return toast('Nothing more on the clock before dawn.', 'bad');
  ui.skip = { to: m.at - SKIP_LEAD, kind: m.kind };
  trail('skip', { to: m.kind });
  ui.paused = false;
  ui.rush = false;
  bump();
}
function endSkip() {
  ui.skip = null;
  bump();
}

let lastNow = 0;
let acc = 0;
let seenPhase = s.phase;
let seenPhaseWas = s.phase;
let seenEclipse = eclipseNow();
// The sun going dark and coming back: the Tain's tools, both halves on the screen, then the day again.
function onEclipse() {
  ui.rush = false;
  ui.skip = null;
  if (eclipseNow()) {
    ui.tool = 'candle';
    ui.person = null;
  } else {
    ui.selected = null;
    ui.kb = null;
  }
  view.panX = 0;
  view.panY = 0;
  layout();
  saveGame();
}
// The frame loop, guarded: an error anywhere in a frame stops the game where it is (crash()), rather than
// freezing it while the autosave writes whatever the error left behind.
function frame(now) {
  if (crashed) return;
  try {
    tick(now);
  } catch (e) {
    crash(e, 'frame');
    return;
  }
  requestAnimationFrame(frame);
}
function tick(now) {
  const dt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (ui.watch) watchFrame(dt);
  else if (!ui.paused && running()) {
    acc += dt * (ui.skip ? SKIP_SPEED : prefs.speed * (ui.rush ? 10 : 1)) * TICKS_PER_SEC;
    let n = Math.floor(acc);
    acc -= n;
    while (n-- > 0 && running()) {
      const ph = s.phase;
      const ecl = !!s.eclipse;
      step(s);
      if (!!s.eclipse !== ecl) {
        takeAlerts(true);
        acc = 0;
        break;
      }
      if (ui.skip && s.t >= ui.skip.to) {
        endSkip();
        acc = 0;
        break;
      }
      if (takeAlerts(true) || s.phase !== ph) {
        acc = 0;
        break;
      }
    }
  }
  takeAlerts(false);
  for (const c of s.cues.splice(0)) if (!ui.watch || ui.watch.speed <= 4) sfx(c.name, c.x); // past 4× it's noise
  if (sound.mood(moodNow()) === 'beat') buzz(SOUNDS.heartbeat.haptic);
  if (ui.cross && crossingDone(now)) {
    if (ui.cross.stage === 'sunset') afterSunset();
    else {
      ui.cross = null;
      bump();
    }
  }
  if (s.phase !== seenPhase) {
    seenPhaseWas = seenPhase;
    seenPhase = s.phase;
    acc = 0;
    ui.rush = false;
    ui.skip = null;
    trail('phase');
    onPhase();
    saveGame();
    if (s.phase === 'day' && !ui.watch) {
      saveSpare(store, saves.current, s);
      if (s.day >= 2) askToKeep();
    }
    bump();
  }
  if (eclipseNow() !== seenEclipse) {
    seenEclipse = eclipseNow();
    if (!ui.watch) onEclipse();
    else layout();
    bump();
  }
  const before = ui.toasts.length;
  ui.toasts = ui.toasts.filter((t) => t.until > now);
  if (ui.toasts.length !== before) ui.toastRev++;
  moveCamera(dt);
  ui.guide = tickGuide();
  render(ui.paused || !running() ? 1 : Math.min(1, acc), now);
}
setInterval(() => {
  if (running() && !ui.paused) saveGame();
}, 5000);

// Once a keep has come through a night, ask the browser to keep this site's storage rather than clear it when
// space runs short (Chrome decides by itself; Firefox asks the player). Asked once on a device, not each keep.
function askToKeep() {
  if (prefs.keepAsked || !navigator.storage?.persist) return;
  prefs.keepAsked = true;
  savePrefs();
  navigator.storage.persisted().then((yes) => yes || navigator.storage.persist()).catch(() => {});
}
// An error the page didn't catch, in a frame, a tap or a key: the clock stops, nothing more is saved, and a
// panel says what happened and what can still be done. The keep in the slot is the last one saved before it
// (at most a few seconds before, or when the phase last changed), and the spare is this morning's.
function crash(err, where) {
  if (crashed) return;
  crashed = { where, message: String(err?.message || err || 'unknown error'), stack: String(err?.stack || '').slice(0, 3000), build: BUILD, at: s && { season: s.season, day: s.day, phase: s.phase, t: s.t }, w: Date.now() };
  try {
    ui.paused = true;
    sound.hide(true);
  } catch {
    // The panel matters more than the sound.
  }
  console.error('Afterglass stopped:', err);
  showCrash();
}
window.addEventListener('error', (e) => {
  // Only the game's own errors: a browser's ResizeObserver notice and extensions' scripts carry no error of ours.
  if (e.error && (!e.filename || e.filename.startsWith(location.origin))) crash(e.error, 'page');
});
function showCrash() {
  const spare = loadSpare(store, saves.current, s?.seed);
  const saved = store.get(slotKey(saves.current));
  const el = document.createElement('div');
  el.className = 'crash';
  el.id = 'crash';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'crash-h');
  el.innerHTML = `<div class="crash-card">
    <h2 id="crash-h">Something went wrong, and the game stopped</h2>
    <p>Nothing from here on is saved. ${saved ? `Keep ${saves.current} is as it was last saved, ${saved.phase === 'night' ? `on night ${saved.day}` : `on day ${saved.day}`} of season ${saved.season}.` : 'This keep had no save yet.'}</p>
    <p>If it happens again, export the keep and send the file: it says what went wrong, and a fix can load it.</p>
    <div class="row">
      ${saved ? '<button type="button" class="btn primary" id="crash-export" data-crash="export">Export the keep</button>' : ''}
      ${spare ? '<button type="button" class="btn" id="crash-spare" data-crash="spare">Go back to this morning</button>' : ''}
      <button type="button" class="btn" id="crash-reload" data-crash="reload">Reload</button>
    </div>
    <details><summary>What went wrong</summary><pre>${esc(`${crashed.message}\n${crashed.where}, build ${crashed.build}\n${crashed.stack}`)}</pre></details>
  </div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-crash]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.crash === 'export') {
      const g = { ...store.get(slotKey(saves.current)), build: BUILD, crash: crashed };
      saveFile(new Blob([JSON.stringify(g)], { type: 'application/json' }), `afterglass-keep-${saves.current}-season-${g.season}-day-${g.day}-crash.json`);
    } else if (b.dataset.crash === 'spare') {
      if (store.set(slotKey(saves.current), spare)) location.reload();
    } else location.reload();
  });
  document.body.append(el);
  el.querySelector('button')?.focus();
}

/* ---------------------------------------------------------------- input */

function game(a) {
  if (ui.watch) {
    toast('Watching a session: nothing in it can be changed.', 'bad');
    return false;
  }
  const r = act(s, a);
  dirty = true;
  if (!r.ok) {
    trail('refused', { type: a.type, error: r.error });
    toast(r.error, 'bad');
    sfx('nope');
  }
  takeAlerts(false);
  bump();
  return r.ok;
}
function togglePlay() {
  if (ui.watch) return watchPlay();
  if (!running()) return;
  ui.paused = !ui.paused;
  trail(ui.paused ? 'pause' : 'play', { by: 'you' });
  ui.resume = false; // played or paused by hand: closing the Menu leaves it so
  if (ui.paused) {
    ui.rush = false;
    ui.skip = null;
  }
  bump();
}
function setSpeed(v) {
  if (ui.watch) return watchSpeed(v);
  trail('speed', { v });
  prefs.speed = v;
  ui.skip = null;
  savePrefs();
  bump();
}
function copyExport() {
  const done = (msg, show) => {
    ui.copied = msg;
    if (show) ui.showExport = true;
    bump();
  };
  const blocked = 'Copying was blocked here. The export is shown below: select it all and copy.';
  try {
    navigator.clipboard.writeText(exportJSON()).then(() => done('Copied.', false), () => done(blocked, true));
  } catch {
    done(blocked, true);
  }
}
// The keeps in the slots. Whatever is being played is saved before another is put in play.
const waiting = () => s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over' || (s.phase === 'dusk' && s.dusk.step === 'crypt');
function freshKeep(g) {
  s = listen(g);
  seenPhase = s.phase;
  seenPhaseWas = s.phase;
  acc = 0;
  Object.assign(ui, { paused: true, resume: false, confirmNew: false, selected: null, person: null, hover: null, tool: 'candle', showExport: false, copied: '', rush: false, skip: null, cross: null });
  view.panX = 0;
  view.panY = 0;
  view.snap = true;
}
// A lost campaign's chapter begun again from its first dawn (round six): the keep rebuilt by replaying what
// came before it.
function chapterAgainNow() {
  const g = chapterAgain(s);
  if (!g) return toast("This chapter can't be begun again: the keep was begun on an older build, and its record no longer replays.", 'bad');
  g.alerts = []; // the replay's news is old news, as for a keep loaded
  freshKeep(g);
  saveGame();
  closeSheet();
  if (waiting()) openSheet('phase', 'game');
  toast(`${CHAPTERS[chapterOf(s)].name}, begun again from ${chapterOf(s) === 1 ? 'the keep\'s first morning' : 'its first dawn'}.`, 'rite');
  return bump();
}
function playKeep(n, g, lead) {
  if (ui.watch) {
    // Never let the session being watched stand in for a keep: the one in play comes back first.
    ui.watch = null;
    freshKeep(loadGame(saves.current) || newSeason());
  }
  closeTitle();
  if (n !== saves.current) saveGame();
  useSlot(store, saves, n);
  freshKeep(g);
  saveWarned = false;
  saveGame();
  closeSheet();
  if (waiting()) openSheet('phase', 'game');
  toast(`${lead} Season ${s.season}: ${phaseLabel()}.`, 'rite');
  if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
  retuned = 0;
  return bump();
}
function playSlot(n) {
  if (n === saves.current) {
    closeTitle();
    closeSheet();
    return titleContinue();
  }
  const g = loadGame(n);
  if (g) return playKeep(n, g, `Keep ${n}.`);
  ui.slotMsg = `Keep ${n} couldn't be read.`;
  return bump();
}
function newKeep(n) {
  retuned = 0;
  const p = presetNow();
  return playKeep(n, keepWith(p), `A new ${prefs.campaign ? 'campaign' : 'keep'} in slot ${n}${p === 'standard' ? '' : `, ${PRESETS[p].name.toLowerCase()}`}.`);
}
// Difficulty (round five): the preset chosen for a new keep, and a new keep made on it, with the player's own
// numbers from the keep before where the preset has none. The keep keeps them as its own defaults.
const presetNow = () => (PRESETS[prefs.preset] ? prefs.preset : 'standard');
function keepWith(p) {
  const custom = customNow(p);
  const defaults = { ...playerTuning(s), ...PRESETS[p].tuning, ...custom, campaign: prefs.campaign ? 1 : 0 };
  const k = newSeason(Date.now() >>> 0, defaults);
  k.defaults = defaults;
  if (p !== 'standard') k.preset = p;
  if (Object.keys(custom).length) k.custom = true;
  return k;
}
// Custom rules (round seven, phase 2), beside the difficulty: a few of its numbers, and which parts of the game
// are in it. A new keep keeps them as its own, as it keeps its preset's; the tutorial and today's keep don't take them.
const CUSTOM_NUMBERS = [
  ['cracksMax', 'Cracks that break the Veil', 3, 8, 1, (v) => String(v)],
  ['creepersPerNight', 'Creepers added each night of a season', 1, 3.4, 0.2, (v) => mult(v)],
  ['raidFightStrength', "The Host's strength", 0.6, 1.4, 0.05, (v) => `×${mult(v)}`],
  ['startFood', 'Food to start with', 6, 30, 2, (v) => String(v)],
  ['startCandles', 'Candles to start with', 4, 20, 2, (v) => String(v)],
  ['yearHardness', 'Each year starts harder than the last by', 1, 1.2, 0.02, (v) => `×${mult(v)}`],
];
const CUSTOM_PARTS = [
  ['visitors', 'Visitors at the gate'],
  ['fire', 'Fire by day'],
  ['weather', 'Weather: rain, fog and the Drowned'],
  ['omens', 'Omens at dusk'],
  ['errands', 'Errands in the dark: echoes, relics and sleepwalkers'],
  ['eclipse', "Midsummer's eclipse"],
  ['generations', 'Generations: growing old, couples and children'],
  ['church', "The Church's embargo, Inquisition and crusade"],
  ['deep', 'Down into the Deep'],
];
const presetValue = (p, k) => PRESETS[p].tuning[k] ?? TUNING[k];
// What the player has changed from the difficulty's rules, as the new keep's own numbers.
function customNow(p = presetNow()) {
  const c = prefs.custom || {};
  const out = {};
  for (const [k] of CUSTOM_NUMBERS) {
    if (k === 'yearHardness' && prefs.campaign) continue; // a campaign's years harden by its own rate
    if (typeof c[k] === 'number' && Math.abs(c[k] - presetValue(p, k)) > 1e-9) out[k] = c[k];
  }
  for (const [k] of CUSTOM_PARTS) if (c[k] === 0) out[k] = 0;
  return out;
}
function customPicker(where) {
  const p = presetNow();
  const c = prefs.custom || {};
  const n = Object.keys(customNow(p)).length;
  const nums = CUSTOM_NUMBERS.filter(([k]) => k !== 'yearHardness' || !prefs.campaign).map(([k, label, min, max, step, fmt]) => {
    const v = typeof c[k] === 'number' ? c[k] : presetValue(p, k);
    return `<label class="slider custom-num" for="custom-${where}-${k}"><span>${esc(label)}: <b id="custom-${where}-${k}-v">${esc(fmt(v))}</b></span><input type="range" id="custom-${where}-${k}" data-act="custom-num" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  }).join('');
  const parts = CUSTOM_PARTS.map(([k, label]) => `<label class="row" for="custom-${where}-${k}"><input type="checkbox" id="custom-${where}-${k}" data-act="custom-part" data-key="${k}"${c[k] === 0 ? '' : ' checked'}><span>${esc(label)}</span></label>`).join('');
  return `<details class="custom" id="custom-${where}" data-keep="custom-${where}"${ui.open[`custom-${where}`] ? ' open' : ''}><summary>Custom rules${n ? `: ${plural(n, 'change')}` : ''}</summary>
    <p class="hint">${esc(PRESETS[p].name)}'s rules, changed as you like. A new keep keeps them.</p>
    ${nums}
    <fieldset class="custom-parts"><legend>In the game</legend>${parts}</fieldset>
    <div class="row"><button class="btn sm" id="custom-${where}-reset" data-act="custom-reset"${n ? '' : ' disabled'}>Back to ${esc(PRESETS[p].name)}'s rules</button></div>
  </details>`;
}
// A campaign (round six) or the open year, for a new keep.
function campaignPicker(where) {
  const radio = (v, label) => `<input type="radio" class="visually-hidden" name="kind-${where}" id="kind-${where}-${v}" data-act="keep-kind" value="${v}"${(v === 'campaign') === !!prefs.campaign ? ' checked' : ''}><label class="btn sm" for="kind-${where}-${v}">${label}</label>`;
  return `<fieldset class="presets" id="kinds-${where}"><legend>What kind of keep${where === 'saves' ? ', for a new one' : ''}</legend>
      <div class="seg">${radio('open', 'The open year')}${radio('campaign', 'Campaign')}</div>
      <p class="hint">${prefs.campaign ? 'Five years, five chapters: each brings a new pressure and a goal, and closes on a choice; the fifth ends in one of three endings. The Host\'s sieges, the Church\'s wrath and the Hollow\'s growth come a year at a time, and a lost chapter can be begun again.' : 'Every year the same, a little harder, and a choice at each year\'s end: keep the watch, take your place in the glass, or seal the Veil.'}</p></fieldset>`;
}
function presetPicker(where) {
  const cur = presetNow();
  return `<fieldset class="presets" id="presets-${where}"><legend>Difficulty${where === 'saves' ? ' for a new keep' : ''}</legend>
      <div class="seg">${Object.entries(PRESETS).map(([k, P]) => `<input type="radio" class="visually-hidden" name="preset-${where}" id="preset-${where}-${k}" data-act="preset" value="${k}"${cur === k ? ' checked' : ''}><label class="btn sm" for="preset-${where}-${k}">${P.name}</label>`).join('')}</div>
      <p class="hint">${esc(PRESETS[cur].text)}</p></fieldset>`;
}
// A keep nothing has been done in yet, which a new one can take the place of.
const untouched = () => !s.actions.length && s.season === 1 && s.day === 1 && s.phase === 'day' && s.t === 0 && !s.daily && !s.tuning.tutorial;
function confirmSlot(n) {
  const ask = ui.confirmSlot;
  ui.confirmSlot = null;
  if (!ask || ask.n !== n) return bump();
  if (ask.kind === 'over') return newKeep(n);
  if (ask.kind === 'daily') return startDaily(n);
  if (ask.kind === 'tutorial') return startTutorial(n);
  if (ask.kind === 'import') {
    retuned = retune(ask.g, keepDefaults(ask.g));
    return playKeep(n, ask.g, `Keep ${n}, from ${ask.name}.`);
  }
  if (ask.kind !== 'delete' || n === saves.current) return bump(); // the keep being played is never deleted
  deleteSlot(store, saves, n);
  toast(`Keep ${n} is deleted.`);
  return bump();
}
// A file from the page: the browser's download of it.
function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
// A keep as a file: the save itself, which Load a file (here or on another device) takes back exactly.
function exportSlot(n) {
  const g = n === saves.current ? { ...s, alerts: [], cues: undefined, build: BUILD } : store.get(slotKey(n));
  if (!g) return undefined;
  const name = `afterglass-keep-${n}-season-${g.season}-day-${g.day}.json`;
  saveFile(new Blob([JSON.stringify(g)], { type: 'application/json' }), name);
  toast(`Keep ${n} is saved as ${name}.`);
  return undefined;
}
function importSlot(n, el) {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return undefined;
  ui.slotMsg = '';
  file.text().then(
    (text) => {
      const r = keepFromFile(text);
      if (r.error) {
        ui.slotMsg = r.error;
        return bump();
      }
      if (n === saves.current || saves.slots[n]) {
        ui.confirmSlot = { n, kind: 'import', g: r.s, name: file.name };
        return bump();
      }
      retuned = retune(r.s, keepDefaults(r.s));
      return playKeep(n, r.s, `Keep ${n}, from ${file.name}.`);
    },
    () => {
      ui.slotMsg = "That file couldn't be read.";
      bump();
    },
  );
  return undefined;
}

// On a phone the panels cover the castle: close them when the next tap belongs on the castle.
const toStage = () => {
  if (!wide()) closeSheet();
};

function onAct(name, el) {
  const id = el.dataset.id;
  switch (name) {
    case 'play': return togglePlay();
    case 'speed': return setSpeed(Number(el.dataset.v));
    case 'rush':
      ui.rush = !ui.rush;
      trail('rush', { on: ui.rush });
      if (ui.rush) ui.paused = false;
      return bump();
    case 'tool':
      ui.tool = el.dataset.tool;
      trail('tool', { tool: ui.tool });
      return bump();
    case 'flip':
      prefs.mode = prefs.mode === 'flipped' ? 'reflection' : 'flipped';
      savePrefs();
      view.panX = 0;
      view.panY = 0;
      view.snap = true;
      return bump();
    case 'zoom-in': return zoomBy(1);
    case 'zoom-out': return zoomBy(-1);
    case 'zoom-fit': return fitView();
    case 'ways':
      prefs.ways = typeof el?.checked === 'boolean' ? el.checked : prefs.ways === false;
      savePrefs();
      return bump();
    case 'labels':
      prefs.labels = !prefs.labels;
      savePrefs();
      drawnLabels = '';
      return bump();
    case 'camera':
      if (el.value === prefs.mode) return undefined;
      return onAct('flip', el);
    case 'sound':
      prefs.sound = typeof el.checked === 'boolean' ? el.checked : !prefs.sound;
      savePrefs();
      sound.set({ on: prefs.sound });
      if (prefs.sound) {
        sound.unlock();
        setTimeout(() => sfx('good'), 120);
      }
      if (typeof el.checked !== 'boolean') toast(prefs.sound ? 'Sound on.' : 'Sound off. S turns it back on.');
      return bump();
    case 'volume':
      prefs[el.dataset.key] = Number(el.value) / 100;
      savePrefs();
      sound.set({ fx: prefs.sfx, amb: prefs.amb });
      if (el.dataset.key === 'sfx') sfx('good');
      return undefined;
    case 'haptics':
      prefs.haptics = el.checked;
      savePrefs();
      buzz([30]);
      return bump();
    case 'hear':
      sound.unlock();
      sfx(el.dataset.cue);
      return undefined;
    case 'motion':
      prefs.motion = el.value;
      savePrefs();
      applyMotion();
      view.snap = true;
      return bump();
    case 'menu-tab':
      ui.menuTab = el.dataset.tab;
      trail('panel', { name: 'menu', tab: ui.menuTab });
      ui.confirmSlot = null;
      ui.slotMsg = '';
      return bump();
    case 'slot-play': return playSlot(Number(el.dataset.n));
    case 'slot-new': return newKeep(Number(el.dataset.n));
    case 'daily': return startDaily(Number(el.dataset.n));
    case 'daily-ask':
      ui.confirmSlot = { n: saves.current, kind: 'daily' };
      return bump();
    case 'tutorial': return startTutorial(Number(el.dataset.n));
    case 'tutorial-ask':
      ui.confirmSlot = { n: saves.current, kind: 'tutorial' };
      return bump();
    case 'slot-over':
    case 'slot-delete':
      ui.confirmSlot = { n: Number(el.dataset.n), kind: name === 'slot-over' ? 'over' : 'delete' };
      return bump();
    case 'slot-no':
      ui.confirmSlot = null;
      return bump();
    case 'slot-yes': return confirmSlot(Number(el.dataset.n));
    case 'slot-export': return exportSlot(Number(el.dataset.n));
    case 'import': return importSlot(Number(el.dataset.n), el);
    case 'sheet':
      return ui.sheet === el.dataset.sheet ? closeSheet() : openSheet(el.dataset.sheet);
    case 'sheet-close': return closeSheet();
    case 'hush': return game({ type: 'hush', on: !s.night?.hush });
    case 'person':
      ui.person = ui.person === id ? null : id;
      if (ui.person) toStage();
      return bump();
    case 'assign': return game({ type: 'assign', id, room: el.value || null });
    case 'by-day': {
      const [how, room] = (el.value || '').split(':');
      return game({ type: 'byDay', id, how: how || null, room: room || undefined });
    }
    case 'raise': {
      const at = ui.buildAt;
      const r = game({ type: 'raise', room: el.dataset.room, ...(at && at !== (nextSlot(s)?.newFloor ? 'top' : nextSlot(s)?.id) ? { at } : {}) });
      ui.buildAt = null;
      return r;
    }
    case 'build-at':
      ui.buildAt = el.dataset.at;
      return bump();
    case 'tear':
      ui.tearAsk = el.dataset.id;
      ui.moving = null;
      return bump();
    case 'tear-no':
      ui.tearAsk = null;
      return bump();
    case 'tear-yes':
      ui.tearAsk = null;
      return game({ type: 'teardown', id: el.dataset.id });
    case 'move':
      ui.moving = el.dataset.id;
      ui.tearAsk = null;
      return bump();
    case 'move-cancel':
      ui.moving = null;
      return bump();
    case 'move-to': {
      const from = ui.moving;
      ui.moving = null;
      return game({ type: 'moveRoom', id: from, to: el.dataset.id });
    }
    case 'wardgate': return game({ type: 'wardGate' });
    case 'payoff': return game({ type: 'payOff' });
    case 'bar-stores': return game({ type: 'barStores' });
    case 'pitch': return game({ type: 'pitch' });
    case 'shore': return game({ type: 'shore' });
    case 'raid-bell': return game({ type: 'raidBell' });
    case 'pursue': return game({ type: 'pursue' });
    case 'take-glass':
      if (game({ type: 'takeGlass' })) saveGame();
      return undefined;
    case 'close-chapter':
      if (game({ type: 'closeChapter', id: el.dataset.id })) saveGame();
      return undefined;
    case 'end-ask':
      ui.endAsk = el.dataset.id;
      return bump();
    case 'end-no':
      ui.endAsk = null;
      return bump();
    case 'end-yes': {
      const k = ui.endAsk;
      ui.endAsk = null;
      if (game({ type: k === 'seal' ? 'sealVeil' : 'openVeil' })) saveGame();
      return undefined;
    }
    case 'chapter-again': return chapterAgainNow();
    case 'seal-ask':
      ui.sealAsk = true;
      return bump();
    case 'seal-no':
      ui.sealAsk = false;
      return bump();
    case 'seal-yes':
      ui.sealAsk = false;
      if (game({ type: 'sealVeil' })) saveGame();
      return undefined;
    case 'request': return game({ type: 'request', id: el.dataset.id, grant: !!el.dataset.grant });
    case 'sally': return game({ type: 'sally' });
    case 'donate': return game({ type: 'donate' });
    case 'visitor': return game({ type: 'visitor', id: el.dataset.id, answer: el.dataset.answer });
    case 'rite-kind':
      ui.riteKind = el.value;
      return bump();
    case 'study': return game({ type: 'study', id: el.dataset.id, ...(el.dataset.id === 'rites' ? { kind: document.getElementById('rite-kind')?.value } : {}) });
    case 'decree': return game({ type: 'decree', id: el.dataset.id });
    case 'ward-undergate': return game({ type: 'ward', target: 'undergate' });
    case 'shade-act': return game({ type: 'shadeAct', id: el.dataset.id });
    case 'lantern': return game({ type: 'lantern', id: el.dataset.id });
    case 'omen': return game({ type: 'omen', i: Number(el.dataset.i) });
    case 'skip': return skipAhead();
    case 'hide': return game({ type: 'hide', id: el.dataset.id, on: !!el.dataset.on });
    case 'vigil': return game({ type: 'vigil' });
    case 'build': return game({ type: 'build', mirror: el.dataset.mirror });
    case 'descend': return game({ type: 'descend', id: el.dataset.id, depth: Number(el.dataset.depth) });
    case 'upgrade-mirror': return game({ type: 'upgradeMirror', id: el.dataset.id });
    case 'fight-fire': return game({ type: 'fightFire', room: el.dataset.room, bell: !!el.dataset.bell });
    case 'break-ask':
      ui.breakAsk = el.dataset.id;
      return bump();
    case 'break-no':
      ui.breakAsk = null;
      return bump();
    case 'break':
      // Saved at once, even at the paused rite: a reload shouldn't mend a broken mirror.
      ui.breakAsk = null;
      if (game({ type: 'break', id: el.dataset.id })) saveGame();
      return undefined;
    case 'funeral': return game({ type: 'funeral', id, on: el.getAttribute('aria-pressed') !== 'true' });
    case 'wake': {
      const plan = crossingPreview(s);
      if (game({ type: 'wake' })) {
        ui.tool = 'candle';
        closeSheet();
        startSouls(plan);
      }
      return undefined;
    }
    case 'start':
      if (game({ type: 'startNight' })) {
        ui.paused = false;
        ui.selected = null;
        if (ui.sheet === 'phase' || !wide()) closeSheet();
      }
      return undefined;
    case 'select':
      ui.selected = ui.selected === id ? null : id;
      ui.tool = 'move';
      if (ui.selected) toStage();
      return bump();
    case 'rite': return game({ type: 'rite', id, choice: el.dataset.choice });
    case 'name':
    case 'remember':
      return game({ type: name, id });
    case 'vigils': return game({ type: 'vigils', n: Number(el.dataset.n) });
    case 'begin-day':
      if (game({ type: 'beginDay' })) {
        ui.paused = false;
        saveGame();
      }
      return undefined;
    case 'answer': {
      const e = lastSeason(s);
      game({ type: 'answer', answer: e?.answer === el.dataset.v ? null : el.dataset.v });
      return saveGame();
    }
    case 'card-make': return makeCard();
    case 'card-save': return ui.card?.url && saveCard();
    case 'card-share': return ui.card?.url && shareCard();
    case 'next-season':
      if (game({ type: 'nextSeason' })) saveGame();
      return undefined;
    case 'tune': return game({ type: 'tune', key: el.dataset.key, value: el.value });
    case 'tab':
      prefs.tab = el.dataset.tab;
      savePrefs();
      trail('panel', { name: 'records', tab: prefs.tab });
      return bump();
    case 'book':
      prefs.tab = 'book';
      savePrefs();
      return openSheet('records');
    case 'autopause':
      prefs.autoPause = el.checked;
      savePrefs();
      return bump();
    case 'preset':
      prefs.preset = el.value;
      savePrefs();
      return bump();
    case 'keep-kind':
      prefs.campaign = el.value === 'campaign';
      savePrefs();
      return bump();
    case 'custom-num':
      prefs.custom = { ...(prefs.custom || {}), [el.dataset.key]: Math.round(Number(el.value) * 100) / 100 };
      savePrefs();
      return bump();
    case 'custom-part':
      prefs.custom = { ...(prefs.custom || {}), [el.dataset.key]: el.checked ? 1 : 0 };
      savePrefs();
      return bump();
    case 'custom-reset':
      prefs.custom = {};
      savePrefs();
      return bump();
    case 'tut-end':
      s.tut = { ...(s.tut || {}), off: true };
      saveGame();
      showCoach(null);
      toast('The tutorial is over, and the keep plays on. Every lesson is in the Menu, under How to play.', 'rite');
      if (s.test) {
        ui.testNote = false;
        openSheet('test');
      }
      return bump();
    case 'guide-ok':
      markSeen(el.dataset.id);
      return undefined;
    case 'guide-off':
      prefs.guide = false;
      savePrefs();
      showCoach(null);
      return bump();
    case 'title-open': return openTitle();
    case 'title-continue': return titleContinue();
    case 'title-view': return titleView(el.dataset.view);
    case 'title-back':
      ui.titleFor = null;
      return titleView(null);
    case 'title-start': return titleStart(el.dataset.what);
    case 'title-replace':
      ui.titleAsk = Number(el.dataset.n);
      return bump();
    case 'title-replace-no':
      ui.titleAsk = null;
      return bump();
    case 'title-replace-yes': return startIn(ui.titleFor || 'new', Number(el.dataset.n));
    case 'title-tab':
      ui.menuTab = el.dataset.tab;
      ui.confirmSlot = null;
      ui.slotMsg = '';
      return openSheet('menu');
    case 'install-help':
      ui.installHelp = true;
      bump();
      return requestAnimationFrame(() => document.getElementById('install-help-title')?.scrollIntoView({ block: 'nearest' }));
    case 'install': {
      const p = installPrompt;
      if (!p) return undefined;
      installPrompt = null;
      try {
        Promise.resolve(p.prompt()).catch(() => {});
      } catch {
        // Already shown, or the browser refused it; Chrome offers the event again on a later visit.
      }
      return bump();
    }
    case 'guide-toggle':
      prefs.guide = el.checked;
      if (prefs.guide) prefs.guideSeen = {};
      savePrefs();
      return bump();
    case 'new':
      ui.confirmNew = true;
      return bump();
    case 'new-no':
      ui.confirmNew = false;
      return bump();
    case 'new-yes': return newKeep(saves.current);
    case 'copy': return copyExport();
    case 'test-begin':
      ui.testNote = false;
      return closeSheet();
    case 'test-open':
      ui.testNote = false;
      ui.testMsg = '';
      ui.testShow = false;
      return openSheet('test');
    case 'test-here': return beginTest(saves.current, ui.testAsk?.label);
    case 'test-again':
      s.test.answers = { ...(s.test.answers || {}), again: s.test.answers?.again === el.dataset.v ? null : el.dataset.v };
      saveGame();
      return bump();
    case 'test-send':
      sendTest();
      return undefined;
    case 'test-copy': return copyTest();
    case 'w-play': return watchPlay();
    case 'w-speed': return watchSpeed(Number(el.dataset.v));
    case 'w-exit': return stopWatching();
    case 'w-prev': return watchPrev();
    case 'w-next': return watchNext();
    case 'w-go':
      watchSeek(Number(el.dataset.u) - LEAD);
      if (!wide()) closeSheet();
      return bump();
    case 'w-file': {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return undefined;
      file.text().then((text) => watchText(text, file.name), () => {
        ui.watchMsg = "That file couldn't be read.";
        bump();
      });
      return undefined;
    }
    case 'w-paste': return watchText(document.getElementById('watch-text')?.value || '', null);
    case 'show-export':
      ui.showExport = !ui.showExport;
      return bump();
    case 'toast-open': {
      const t = ui.toasts.find((x) => x.id === Number(id));
      ui.toasts = ui.toasts.filter((x) => x.id !== Number(id));
      ui.toastRev++;
      if (t?.open) openSheet(t.open);
      return undefined;
    }
    case 'toast-close':
      ui.toasts = ui.toasts.filter((t) => t.id !== Number(id));
      ui.toastRev++;
      return undefined;
    default:
      return undefined;
  }
}

document.addEventListener('click', (e) => {
  // A <details> keeps its open state in ui as it's clicked: the toggle event comes a task later, after a
  // render may already have replaced the element.
  const sum = e.target.closest('details[data-keep] > summary');
  if (sum) ui.open[sum.parentElement.dataset.keep] = !sum.parentElement.open;
  const el = e.target.closest('[data-act]');
  if (el && !el.matches('select, input, textarea')) onAct(el.dataset.act, el);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && el.matches('select, input')) onAct(el.dataset.act, el);
});
document.addEventListener('toggle', (e) => {
  if (e.target.dataset?.keep) ui.open[e.target.dataset.keep] = e.target.open;
}, true);
let noteTimer = 0;
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-act="custom-num"]')) {
    const row = CUSTOM_NUMBERS.find(([k]) => k === e.target.dataset.key);
    const out = document.getElementById(`${e.target.id}-v`);
    if (row && out) out.textContent = row[5](Number(e.target.value));
    return;
  }
  if (e.target.matches('[data-act="volume"]')) {
    prefs[e.target.dataset.key] = Number(e.target.value) / 100;
    sound.set({ fx: prefs.sfx, amb: prefs.amb });
    return;
  }
  if (e.target.matches('[data-test]')) {
    if (!s.test || ui.watch) return;
    s.test.answers = { ...(s.test.answers || {}), [e.target.dataset.test]: e.target.value };
    clearTimeout(noteTimer);
    noteTimer = setTimeout(saveGame, 400);
    return;
  }
  if (!e.target.matches('[data-note]') || ui.watch) return;
  const value = e.target.value;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    const e2 = lastSeason(s);
    if (!e2) return;
    act(s, { type: 'answer', answer: e2.answer, note: value });
    saveGame();
  }, 400);
});
document.addEventListener('keydown', (e) => {
  if (ui.title && !ui.sheet) {
    // Escape steps back, and from the main list, back to the keep. The game's keys wait for it to close.
    if (e.key === 'Escape') {
      if (ui.titleView) titleView(null);
      else if (continuable()) titleContinue();
    }
    return;
  }
  if (e.key === 'Escape') {
    if (ui.sheet) closeSheet();
    else if (kbAt()) {
      ui.kb = null;
      showHint();
      bump();
    } else if (!e.target.closest('input, select, textarea')) openSheet('menu');
    return;
  }
  if (ui.title) return;
  const k = e.key.toLowerCase();
  if (ui.cross && (k === ' ' || k === 'enter') && !e.target.closest('input, select, textarea, button, a')) {
    e.preventDefault();
    skipCrossing();
    return;
  }
  // Typing in a field is left alone; a focused button keeps space and enter for itself.
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea')) return;
  if (ui.watch && (k === '[' || k === ']')) {
    e.preventDefault();
    if (k === ']') watchNext();
    else watchPrev();
    return;
  }
  if (ui.watch && k === '8') return void watchSpeed(8);
  // While the cursor is out, Enter is the cursor's, even with the focus left on a button the mouse clicked
  // (Play, say). A button reached with Tab keeps it, and so does the panel.
  const clicked = e.target.closest('button, a') && !e.target.closest('#sheet') && !keyFocused(e.target);
  if (k === 'enter' && clicked && kbAt()) {
    e.preventDefault();
    actAt(kbAt());
    showHint();
    return;
  }
  if (e.target.closest('button, a') && (k === ' ' || k === 'enter')) return;
  const tain = placing() && !ui.cross && !(ui.sheet && !wide());
  if (tain && k.startsWith('arrow') && !e.shiftKey) {
    e.preventDefault();
    kbMove(k);
  } else if (tain && k === 'enter' && kbAt()) {
    e.preventDefault();
    actAt(kbAt());
    showHint();
  } else if (tain && (k === '[' || k === ']')) kbPick(k === ']' ? 1 : -1);
  else if (k === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (k === '1' || k === '2' || k === '4') setSpeed(Number(k));
  else if (k === 'c' || k === 'm' || k === 'w') {
    ui.tool = { c: 'candle', m: 'move', w: 'ward' }[k];
    trail('tool', { tool: ui.tool });
    showHint();
    bump();
  } else if (k === 'h' && s.phase === 'night') game({ type: 'hush', on: !s.night.hush });
  else if (k === 'a' && (s.phase === 'night' || eclipseNow()) && s.tuning.acts) {
    if (ui.selected) game({ type: 'shadeAct', id: ui.selected });
    else toast('Pick a shade first: its act is on the bar.', 'bad');
  } else if (k === 't' && placing() && s.tuning.lanterns) {
    if (ui.selected) game({ type: 'lantern', id: ui.selected });
    else toast('Pick a shade first: its lantern is on the bar.', 'bad');
  } else if (k === 'n' && s.phase === 'night') skipAhead();
  else if (k === 'v') onAct('flip', { dataset: {} });
  else if (k === 'l') onAct('labels', { dataset: {} });
  else if (k === 's') onAct('sound', { dataset: {} });
  else if (k === '+' || k === '=') zoomBy(1);
  else if (k === '-' || k === '_') zoomBy(-1);
  else if (k === '0') fitView();
  else if (k.startsWith('arrow')) {
    e.preventDefault();
    const step = 12 * ui.scale;
    panBy(k === 'arrowleft' ? step : k === 'arrowright' ? -step : 0, k === 'arrowup' ? step : k === 'arrowdown' ? -step : 0);
  }
  else if (k === 'k' || k === 'p' || k === 'r' || k === 'b') {
    const name = { k: 'phase', p: 'people', r: 'records', b: 'build' }[k];
    if (ui.sheet === name) closeSheet();
    else openSheet(name);
  }
});
// The viewer's timeline: a tap or a drag along it goes there.
// The bar is drawn again as the replay runs, so the line is found afresh each time.
let lineDrag = false;
function lineTo(e) {
  const line = document.getElementById('wline');
  if (!line || !ui.watch) return;
  const r = line.getBoundingClientRect();
  watchSeek(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ui.watch.idx.total));
}
document.addEventListener('pointerdown', (e) => {
  if (!ui.watch || !e.target.closest('#wline')) return;
  lineDrag = true;
  lineTo(e);
});
document.addEventListener('pointermove', (e) => {
  if (lineDrag && e.buttons) lineTo(e);
});
document.addEventListener('pointerup', () => {
  lineDrag = false;
});
// One finger or the mouse: a tap acts on release, a drag pans. Two fingers pinch to zoom. The wheel zooms
// toward the pointer. Zoom moves in whole-pixel steps so the art stays sharp.
const pointers = new Map();
let gesture = null;
const DRAG = 6;
const spread = () => {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Some pointers can't be captured (synthetic ones, or a finger already lifted); moves still arrive.
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { kind: 'press', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, button: e.button };
  else if (pointers.size === 2) gesture = { kind: 'pinch', d0: Math.max(10, spread().d), s0: ui.scale };
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') ui.hover = stageAt(e.clientX, e.clientY);
    return;
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (gesture?.kind === 'pinch' && pointers.size >= 2) {
    const sp = spread();
    zoomTo(Math.round(gesture.s0 * (sp.d / gesture.d0)), sp.x, sp.y);
    return;
  }
  if (!gesture || gesture.kind === 'done') return;
  if (gesture.kind === 'press' && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > DRAG) {
    gesture.kind = 'pan';
    ui.hover = null;
    canvas.classList.add('is-panning');
  }
  if (gesture.kind === 'pan') panBy(e.clientX - gesture.lx, e.clientY - gesture.ly);
  gesture.lx = e.clientX;
  gesture.ly = e.clientY;
});
function endPointer(e, cancelled) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!cancelled && gesture?.kind === 'press' && pointers.size === 0 && gesture.button === 0) onStage(e);
  if (pointers.size === 0) {
    gesture = null;
    canvas.classList.remove('is-panning');
  } else if (gesture?.kind === 'pinch') gesture = { kind: 'done' };
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !pointers.size) ui.hover = null;
});
let wheel = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheel += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  while (wheel <= -80) {
    zoomTo(ui.scale + 1, e.clientX, e.clientY);
    wheel += 80;
  }
  while (wheel >= 80) {
    zoomTo(ui.scale - 1, e.clientX, e.clientY);
    wheel -= 80;
  }
}, { passive: false });
window.addEventListener('resize', layout);
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(() => {
    const hh = `${hudEl.offsetHeight}|${barEl.offsetHeight}`;
    if (hh !== layout.last) {
      layout.last = hh;
      layout();
    }
  });
  ro.observe(hudEl);
  ro.observe(barEl);
}

render(1, performance.now());
layout();
trail('load', deviceNow());
// The tester link, taken off the address once read, so a reload just plays on.
const params = new URLSearchParams(location.search);
if (params.has('test') || params.has('watch') || params.has('dev')) history.replaceState(null, '', location.pathname + location.hash);
if (params.has('watch')) ui.devLink = true;
if (params.has('test')) startTest(params.get('test'));
else if (params.has('watch')) {
  // The viewer's link (season.html?watch): Saves, where a session is loaded to watch.
  prefs.introDone = true;
  savePrefs();
  ui.menuTab = 'saves';
  openSheet('menu', 'game');
  requestAnimationFrame(() => document.getElementById('watch-load')?.scrollIntoView({ block: 'start' }));
} else if (s.test && !s.test.sent) {
  // A tester part way through: straight back to the keep under test, as the link itself does.
  if (waiting()) openSheet('phase', 'game');
} else openTitle('game');
if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
if (bootError) crash(bootError, 'load');
requestAnimationFrame(frame);
