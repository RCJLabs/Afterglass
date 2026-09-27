// Weeks 7–10 slice UI: one season in one keep. The castle fills the screen; a HUD sits on top, an action
// bar at the bottom, and everything else opens in a panel over the castle. Like the greyboxes it changes
// the game only through act(), so every session replays from its seed and action log.

import { TICKS_PER_SEC, DAY_ROOMS, WORK_ROOMS, TWINS, KINDS, MIRRORS, CAUSES, MAP, BOND_OTHER, TUNING, BUILDABLE, TRAITS, SHADE_TRAITS } from './slice/data.js';
import {
  newSeason, step, act, retune, playerTuning, jobCap, jobCount, nextSlot, ritePreview, crossingPreview, capacity, canWork, defense, roomPower, bear, priests, funeralCap, eatRate,
  dayTicks, nightTicks, isNewMoon, choicesFor, byId, isTwinnedLiving, isTwinnedShade, lastSeason, SAVE_VERSION, fmt, mirrorCap,
  postRoom, wardCost, shadeTrait, peopleIn,
} from './slice/sim.js';
import { geo, feet, floorAtY, roomAt, typeAt, typeOf, roomSpan, roomsOf, lightMap, isLit, unitAt, DEEP_FLOOR, lineSpots as lineOf, guardLit } from './slice/geo.js';
import { drawScene } from './slice/draw.js';
import { threats } from './slice/threats.js';
import { epitaph, ordinal, RESTING, LOST } from './slice/book.js';
import { SLOTS, slotKey, openIndex, loadSlot, saveSlot, useSlot, deleteSlot, keepFromFile, summary, mergeIndex, isIndexKey } from './slice/saves.js';
import { createSound, SOUNDS } from './slice/sound.js';

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
  // Numbers the player never set in Settings follow this build's defaults.
  retuned = retune(g, TUNING);
  return g;
}
window.addEventListener('storage', (e) => {
  if (isIndexKey(e.key) && mergeIndex(store, saves)) bump();
});
let saveWarned = false;
function saveGame() {
  if (saveSlot(store, saves, saves.current, s, Date.now()) || saveWarned) return;
  saveWarned = true;
  toast("The keep couldn't be saved: this browser's storage is full or blocked. Export it from Menu, then Saves.", 'bad');
}

let s = listen(loadGame(saves.current) || newSeason());
// This keep's geometry (it grows as rooms are built), and the top row of its roof.
const K = () => geo(s);
const roofTop = () => K().top - 24;
const ui = {
  paused: true, rev: 0, tool: 'candle', selected: null, person: null, hover: null, toasts: [], toastRev: 0, confirmNew: false,
  copied: '', showExport: false, rush: false, flash: 0, scale: 3, sheet: null, cross: null, open: {},
};
const bump = () => {
  ui.rev++;
};
const running = () => s.phase === 'day' || s.phase === 'night';
// The castle shows the living keep by day and at the season's end; the Tain from dusk to dawn.
// The crossing at dusk keeps the living keep in view (sunset, lights out, the dead on the slab) until the
// dead have crossed; only then does the camera go down into the Tain.
const nightView = () => {
  if (s.phase === 'day' || s.phase === 'end') return false;
  if (s.phase === 'dusk' && (ui.cross || s.dusk.step === 'crypt')) return false;
  return true;
};

/* ---------------------------------------------------------------- words */

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
function phaseLabel() {
  const D = s.tuning.seasonDays;
  return {
    day: `Day ${s.day} of ${D}`,
    dusk: `Dusk, day ${s.day}`,
    night: isNewMoon(s) ? 'New moon' : `Night ${s.day}`,
    dawn: s.day === 0 ? `Season ${s.season}` : `Dawn, day ${s.day + 1}`,
    end: `Season ${s.season} over`,
    over: 'Keep lost',
  }[s.phase];
}
const pips = (n, max, hot) => `<span class="pips${hot ? ' hot' : ''}" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const kindTag = (k) => `<span class="kind k-${k}">${KINDS[k].name}</span>`;

function shadeStatus(d, L) {
  if (!canWork(d)) return d.kind === 'wraith' ? 'hunts in the Tain at night' : `Restless, ${s.tuning.restlessNights - d.restless} ${s.tuning.restlessNights - d.restless === 1 ? 'night' : 'nights'} from Wraith`;
  const room = typeAt(K(), d.f, d.x) || postRoom(s, d);
  if (s.phase !== 'night') return `posted in the ${roomName(postRoom(s, d), true)}`;
  if (d.grabbedBy) return 'caught!';
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

function hudHTML() {
  const T = s.tuning;
  const cap = capacity(s);
  const go = running() && !ui.paused;
  const res = (id, long, short, v) => `<div><dt><span class="long">${long}</span><span class="short">${short}</span></dt><dd><b data-live="${id}">${v}</b></dd></div>`;
  return `<div class="ghud-row">
    <div class="clock ${PH[s.phase]}"><span class="pill">${phaseLabel()}</span><span class="time" data-live="clock">${clockText()}</span><span class="bar" aria-hidden="true"><i data-bar="clock"></i></span></div>
    <div class="gctl">
      <button class="btn sm" id="btn-play" data-act="play"${running() ? '' : ' disabled'}>${go ? 'Pause' : 'Play'}</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map((v) => `<button class="btn sm" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`).join('')}</div>
    </div>
  </div>
  <dl class="gres">
    ${res('food', 'Food', 'Food', floor1(s.res.food))}
    ${res('candles', 'Candles', 'Cand', floor1(s.res.candles))}
    ${res('glass', 'Glass', 'Glass', floor1(s.res.glass))}
    ${res('stone', 'Stone', 'Stone', floor1(s.res.stone || 0))}
    ${res('essence', 'Essence', 'Ess', floor1(s.res.essence))}
    ${res('rem', 'Remembrance', 'Rem', floor1(s.res.remembrance))}
    <div><dt>Dread</dt><dd>${pips(s.dread, T.dreadMax, s.dread >= 4)}</dd></div>
    <div><dt>Veil</dt><dd>${pips(s.cracks, T.cracksMax, true)}</dd></div>
    <div><dt><span class="long">Living</span><span class="short">Liv</span></dt><dd><b>${s.living.length}</b></dd></div>
    <div><dt><span class="long">Shades</span><span class="short">Sh</span></dt><dd><b>${cap.used}</b>/${cap.cap}</dd></div>
  </dl>`;
}

/* ---------------------------------------------------------------- the action bar */

// What needs the player now, for a dot on the panel button.
function attention() {
  const r = s.raid;
  if (s.phase === 'day') return !!((r && r.warned && r.state === 'coming' && defense(s) < r.strength) || (s.inspection && !s.inspection.done && s.inspection.day === s.day) || s.hungry);
  if (s.phase === 'dusk') return s.dusk.step === 'crypt';
  return s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over';
}
const SHEET_NAME = () =>
  ({ day: 'Day', dusk: s.dusk?.step === 'crypt' ? 'Crossing' : 'Dusk', night: 'Night', dawn: 'Rite', end: 'Season', over: 'Lost' })[s.phase];

function barHTML() {
  const place = s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place');
  const tool = (id, label) => `<button class="btn sm" id="tool-${id}" data-act="tool" data-tool="${id}" aria-pressed="${ui.tool === id}">${label}</button>`;
  const flip = `<button class="btn sm" id="btn-flip" data-act="flip" aria-pressed="${prefs.mode === 'flipped'}" title="Turn the Tain upright (V)">Flip</button>`;
  let tools = '';
  if (s.phase === 'day') {
    tools = `<button class="btn sm" id="btn-rush" data-act="rush" aria-pressed="${ui.rush}">${ui.rush ? 'Hurrying…' : 'Hurry to dusk'}</button>`;
    tools += `<button class="btn sm" id="btn-build" data-act="sheet" data-sheet="build" aria-pressed="${ui.sheet === 'build'}" title="Raise a room on top of the keep (B)">Build</button>`;
  }
  else if (s.phase === 'dusk' && s.dusk.step === 'crypt') tools = `<button class="btn sm primary" id="bar-wake" data-act="wake">Let them wake</button>`;
  else if (place) {
    tools = `${tool('candle', `Candle ${floor1(s.res.candles)}`)}${tool('move', 'Move')}${tool('ward', `Ward ${fmt(wardCost(s))}`)}`;
    tools += s.phase === 'night' ? `<button class="btn sm" id="btn-hush" data-act="hush" aria-pressed="${!!s.night?.hush}">Hush</button>` : '';
    tools += flip;
    if (s.phase === 'dusk') tools += `<button class="btn sm primary" id="bar-start" data-act="start">Begin the night</button>`;
  } else if (s.phase === 'dawn') {
    const P = ritePreview(s);
    tools = `${flip}<button class="btn sm primary" id="bar-day" data-act="begin-day"${P.errors.length ? ' disabled' : ''}>Begin day ${s.day + 1}</button>`;
  } else if (s.phase === 'over') tools = flip;
  const menu = [['phase', SHEET_NAME(), attention()], ['people', 'People', false], ['records', 'Records', false], ['menu', 'Menu', false]]
    .map(([k, label, dot]) => `<button class="btn sm gm" id="open-${k}" data-act="sheet" data-sheet="${k}" aria-pressed="${ui.sheet === k}" aria-controls="sheet">${label}${dot ? '<span class="dot" aria-label="needs you"></span>' : ''}</button>`)
    .join('');
  return `<div class="gtools ${PH[s.phase]}">${tools}</div><div class="gmenu">${menu}</div>`;
}

function hintText() {
  const T = s.tuning;
  if (ui.guide) return '';
  if (ui.cross) return ui.cross.stage === 'sunset' ? 'Dusk falls on the keep. Tap to skip.' : '';
  if (ui.sheet && !wide()) return '';
  if (s.phase === 'day') {
    const p = byId(s.living, ui.person);
    return p ? `${p.name}: tap a room to put ${p.name} to work there.` : ui.rush ? '' : 'Jobs are in People. Or pick a name there, then tap a room.';
  }
  if (s.phase === 'dusk' && s.dusk.step === 'crypt') return 'The dead wake first. Choose funerals in the Crossing panel, or let them wake.';
  if (s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over') return '';
  const d = byId(s.shades, ui.selected);
  if (ui.tool === 'candle') {
    return s.res.candles >= 1
      ? `Tap a floor to set a candle. It lights its own room; the Unlit can't enter the light.`
      : 'No candles left. The Chandlery makes them by day; the Wick Room saves them at night.';
  }
  if (ui.tool === 'ward') return `Tap a stair or a rift to seal it until dawn (${fmt(wardCost(s))} essence${wardCost(s) < T.wardCost ? ', cheaper while a Bitter shade stays' : ''}). The Hollow breaks a ward in ${T.wardHold} s.`;
  if (!d) return 'Tap a shade to pick it, then tap where it should stand.';
  return s.phase === 'dusk' ? `${d.name}: tap a spot to post ${d.name} there.` : `${d.name}: tap a spot to send ${d.name} there. The dark between is dangerous.`;
}

/* ---------------------------------------------------------------- the phase panels */

function introHTML() {
  return `<div class="card intro">
    <h2>What this slice tests</h2>
    <p>Weeks 7–10 of the Afterglass plan: one whole season. Seven days and nights, ending on the new moon, when the Hollow rises. The question is <b>would you play a second season?</b> You'll be asked at the end.</p>
    <ul>
      <li><b>By day</b> the living work the keep. Raiders come on days 2, 4 and 6, each time stronger. Anyone who dies inside the walls wakes at dusk as a shade.</li>
      ${K().n === 1 ? '<li><b>The keep is two rooms</b>, the Hearth and the Crypt. Everyone else quarries stone in the Yard, and you raise the rest of the keep a room at a time: a Barracks before the raid on day 2.</li>' : ''}
      <li><b>By night</b> the shades work the Tain, the keep's reflection. Creepers climb from the rifts in the Deep toward the mirrors under the Veil. They can't enter candlelight; shades standing in light fight them at its edge.</li>
      <li><b>At dawn</b> you decide which of the dead stay. Every shade kept adds to the keep's Dread; the living bear some of it.</li>
      <li><b>The Lantern Church</b> inspects on day 5, and again whenever Dread reaches 5. Low Dread is blessed; high Dread costs you a mirror and the shades in it.</li>
    </ul>
    <p class="note">The castle is the screen. The bar at the bottom holds the tools for the moment and opens the panels: this phase, the people, and the records. Pause any time.</p>
    <div class="row"><button class="btn primary" id="btn-intro-guide" data-act="intro-guide">Begin with a guide</button><button class="btn" id="btn-intro" data-act="intro-close">Begin without</button></div>
    <p class="hint">The guide shows a short card the first time each thing happens: the jobs, a raid, the Crossing, the Tain, the Maws, the Church and the new moon. You can switch it off in Settings.</p>
    ${installHTML('intro')}
  </div>`;
}

function raidCard() {
  const r = s.raid;
  if (!r) {
    const next = Object.keys(s.tuning.raidDays).map(Number).find((d) => d > s.day && s.tuning.raidDays[d]);
    return next ? `<p class="note">No raid today. The Ashen Host is expected on day ${next}.</p>` : '';
  }
  const def = defense(s);
  if (r.state === 'held' || r.state === 'breached') {
    return `<div class="card ${r.state === 'held' ? 'ok' : 'warn'}"><h3>The raid</h3><p>${r.state === 'held' ? 'The gate held' : 'The raiders broke through'}: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}.</p></div>`;
  }
  if (!r.warned) return `<div class="card"><h3>A raid today</h3><p>Scouts expect the Ashen Host before noon. Guards give ${DAY_ROOMS.barracks.rate} defense each; the Watch of the Dead adds what it kept last night${s.watchBonus ? ` (+${fmt(s.watchBonus)} today)` : ''}.</p><p class="num">Defense now ${fmt(def)}</p></div>`;
  const short = def + 1e-9 < r.strength;
  return `<div class="card ${short ? 'warn' : 'ok'}"><h3>Raiders on the road</h3>
    <p>${r.count} raiders, strength <b class="num">${fmt(r.strength)}</b>. Your defense: <b class="num" data-live="defense">${fmt(def)}</b>. ${short ? 'Not enough. Move people to the Barracks or ward the gate.' : 'Enough, if nothing changes.'}</p>
    <div class="row"><button class="btn sm" id="btn-wardgate" data-act="wardgate"${r.ward || s.res.essence + 1e-9 < s.tuning.wardGateCost ? ' disabled' : ''}>${r.ward ? `Gate warded, +${r.ward}` : `Ward the gate: +${s.tuning.wardGateDefense} for ${s.tuning.wardGateCost} essence`}</button></div></div>`;
}

function inspectionCard() {
  const I = s.inspection;
  const T = s.tuning;
  const verdicts = 'Dread 0–1: blessed (candles and remembrance). 2–3: warned, with a tithe. 4–5: censured, and the fullest mirror is taken with its shades.';
  if (I && !I.done) {
    const when = I.day === s.day ? 'today at noon' : 'tomorrow at noon';
    return `<div class="card ${s.dread >= 4 ? 'warn' : ''}"><h3>The Lantern Church</h3><p>An inspector comes ${when} and judges the keep by its Dread, now <b>${s.dread}</b>. ${verdicts}</p>
      ${s.phase === 'day' ? `<div class="row"><button class="btn sm" id="btn-vigil" data-act="vigil"${s.dread <= 0 || s.res.remembrance + 1e-9 < T.vigilCost ? ' disabled' : ''}>Keep a vigil: Dread −1 for ${T.vigilCost} remembrance</button></div>` : ''}</div>`;
  }
  const done = s.inspections.filter((x) => x.season === s.season && x.day === s.day).pop();
  if (done) return `<div class="card ${done.verdict === 'blessed' ? 'ok' : 'warn'}"><h3>The Lantern Church</h3><p>The inspector's verdict: <b>${done.verdict}</b> (Dread ${done.dread}).</p></div>`;
  if (s.phase === 'day' && s.day < T.firstInspection) return `<p class="note">The Lantern Church inspects on day ${T.firstInspection}. ${verdicts}</p>`;
  return '';
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
  return `<div class="build"><span>Build a mirror</span>${Object.entries(MIRRORS)
    .map(([k, M]) => `<button class="btn sm" id="build-${k}" data-act="build" data-mirror="${k}"${s.res.glass + 1e-9 < M.glass ? ' disabled' : ''}>${M.name}, room for ${M.cap}: ${M.glass} glass</button>`)
    .join('')}</div>`;
}
function mirrorsHTML() {
  return `<div class="mirrors">${s.mirrors
    .map((m) => {
      const ds = s.shades.filter((d) => d.mirror === m.id);
      const slots = Array.from({ length: mirrorCap(m) }, (_, i) => (ds[i] ? `<span class="slot full">${esc(ds[i].name)}</span>` : '<span class="slot">empty</span>')).join('');
      return `<div class="mirror"><span class="mname">${esc(m.name)}</span><div class="slots">${slots}</div>${ds.length ? breakHTML(m) : ''}</div>`;
    })
    .join('')}</div>`;
}
// Breaking a mirror, asked twice: what it frees, what it costs.
function breakHTML(m) {
  const T = s.tuning;
  const ds = s.shades.filter((d) => d.mirror === m.id);
  if (ui.breakAsk !== m.id) return `<button class="btn sm" id="break-${m.id}" data-act="break-ask" data-id="${m.id}">Break</button>`;
  return `<div class="break-ask"><p class="note bad">Break the ${esc(m.name)}? ${esc(listOf(ds.map((d) => d.name)))} ${ds.length === 1 ? 'goes' : 'go'} free at once: +${ds.length} remembrance, Dread −${fmt(T.breakDread * ds.length)}. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness comes ${T.badLuck === 2 ? 'twice' : `${fmt(T.badLuck)} times`} as often.</p>
    <div class="row"><button class="btn sm primary" id="break-yes" data-act="break" data-id="${m.id}">Break it</button><button class="btn sm" id="break-no" data-act="break-no">Keep it</button></div></div>`;
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
    const out = id === 'infirmary' ? `heals ${fmt(pw[id] * R.rate)}/day` : R.out === 'defense' ? `defense ${fmt(pw[id] * R.rate)}` : `${fmt(pw[id] * R.rate)} ${R.out}/day`;
    return `<li><span>${R.name} <small class="muted">${plural(n, R.role)}${Number.isFinite(cap) ? ` of ${cap}` : ''}</small></span><span class="num">${out}</span></li>`;
  }).join('');
  return `<header class="ph-head"><h2>Day ${s.day}</h2><p>${moon > 0 ? `The new moon is ${plural(moon, 'night')} off.` : 'Tonight is the new moon. The Hollow will rise.'} The living work; anyone who dies inside the walls wakes at dusk.</p></header>
    ${fireCards()}
    ${raidCard()}
    ${inspectionCard()}
    ${sick.length ? `<p class="note bad">Sick: ${esc(listOf(sick.map((p) => p.name)))}. A healer in the Infirmary cures one a day; untreated, the sickness kills.</p>` : ''}
    ${badLuckNote()}
    ${s.hungry ? '<p class="note bad">The larder is empty. Everyone works hungry, and the weakest will starve. Put more cooks in the Hearth.</p>' : ''}
    ${s.haunted.length ? `<p class="note">Haunted today: the ${esc(listOf(s.haunted.map((id) => roomName(id))))}. A Maw broke ${s.haunted.length === 1 ? 'its twin' : 'their twins'} last night${T.hauntWork < 1 ? `, and whoever works there manages ${Math.round(100 * T.hauntWork)}% of their work` : ''}.</p>` : ''}
    <div class="card"><h3>Work today</h3><ul class="facts">${rows}</ul></div>
    <div class="card"><h3>The mirrors</h3><p class="note">Each shade needs a place in a mirror. With no room, the dead wake Restless. Breaking one, in an emergency, frees everyone in it at once and lowers Dread, at the price of the mirror and ${s.tuning.badLuckDays} days of bad luck.</p>${mirrorsHTML()}${buildRow()}</div>`;
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

function duskPlace() {
  const T = s.tuning;
  const n = s.night;
  const L = lightMap(K(), T, n.candles);
  const ds = s.shades.filter(canWork);
  const dark = ds.filter((d) => !isLit(L, d.post.f, d.post.x));
  const creepers = n.spawns.filter((x) => x.type === 'creeper').length;
  const maws = n.spawns.filter((x) => x.type === 'maw').length;
  const wraiths = s.shades.filter((d) => d.kind === 'wraith');
  return `<header class="ph-head"><h2>Dusk: set the night</h2><p>${plural(creepers, 'Creeper')} will climb out of the Deep tonight, most of them in tides around ${tidesText()}.${maws ? ` ${maws === 1 ? 'A Maw comes' : `${maws} Maws come`} with the last tide.` : ''}${isNewMoon(s) ? ' <b>Tonight is the new moon: the Hollow rises.</b>' : ''} Set candles and post the shades, then begin.</p></header>
    <ul class="facts">
      <li><span>Candles set tonight</span><b class="num">${n.candles.length}, ${floor1(s.res.candles)} left</b></li>
      <li><span>Shades posted in the dark</span><b class="num">${dark.length}</b></li>
      <li><span>Wards</span><b>${n.wards.length ? esc(listOf(n.wards.map(wardName))) : 'none'}</b></li>
    </ul>
    ${dark.length ? `<p class="note">${esc(listOf(dark.map((d) => d.name)))} ${dark.length === 1 ? 'stands' : 'stand'} in the dark, where Creepers catch and drain shades. A shade works only in light.</p>` : ''}
    ${wraiths.length ? `<p class="note bad">${esc(listOf(wraiths.map((d) => d.name)))} will rise as ${wraiths.length === 1 ? 'a Wraith' : 'Wraiths'} in the Waking Room. Cut ${wraiths.length === 1 ? 'it' : 'them'} down to banish for good.</p>` : ''}
    ${moonNote()}
    ${blackMirror()}
    <details class="card"><summary><b>How the Tain works</b></summary>
      <ul class="facts">
        <li><span>Creepers rise from the two rifts on the deepest floor and make for the two mirrors on the floor under the Veil, climbing the stairs between. The more floors the keep has, the longer their way.</span></li>
        <li><span>They can't cross light or climb a stair lit at either end.${T.goAround ? " If any way up is dark they take it, however long, and pass lit rooms by. When every way is lit, they gnaw at the edge of the light that bars them." : ' They gnaw at the edge of the first light on their shortest way up.'} Some hunt candles first.</span></li>
        <li><span>A shade standing in light fights anything at its edge. In the dark, shades get caught and drained.</span></li>
        ${T.lineGuard ? '<li><span>A shade in the light at the foot of a stair up to the Veil is guarding the line: it fights, and keeps the Watch if it stands in the Watch of the Dead, but does no other work. To work another room on that floor, light it with a candle of its own, away from the stair.</span></li>' : ''}
        <li><span>Each twin room has a night job for a lit shade at its post: the Choir sings essence, the Silvering makes glass, the Wick Room saves candles, the Threshold readies gentler deaths, the Watch adds to tomorrow's defense and the Cold Hearth halves fading.</span></li>
        <li><span>From night ${T.seepFrom}, some Unlit seep up in rooms with no candle at all.</span></li>
        <li><span>From night ${T.mawFrom}, a Maw comes with the last tide. It walks through light to whatever is worth most for the least fight: the candle barring the way up, or a room where people work, counting every fighter on its way. It tears a candle down. A room it stands in for ${fmt(T.mawBreak)} seconds breaks: no work there that night, and ${T.dreadPerBroken} Dread at dawn. It hits the shades beside it.</span></li>
      </ul></details>
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Begin the night</button></div>`;
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
  for (const x of tides) lines.push({ bad: x.bad, text: `${x.from.length > 1 ? 'From both rifts' : `From ${riftName(x.from[0])}`}, ${plural(x.n, 'Creeper')} will ${x.text}.` });
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
  if (th.hollow) {
    const held = th.hollow.held.length;
    lines.push({ bad: !held, text: `The Hollow rises from ${riftName(th.hollow.rift)} around ${at(th.hollow.at)} and walks to the Veil whatever the light. ${held ? `${plural(held, 'ward')} on its way will hold it ${fmt(T.wardHold)} seconds each.` : `No ward stands on its way yet: each one there holds it ${fmt(T.wardHold)} seconds.`}` });
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
      ${raidText}
      <label class="row" for="ways-on"><input type="checkbox" id="ways-on" data-act="ways"${prefs.ways !== false ? ' checked' : ''}>Show their ways on the Tain: dots march each rift's way up, ✕ where they'll gnaw, a ring on a mirror they'll reach, ! over a shade they'll catch</label>
    </details>`;
}

// Two nights before the new moon, and the night before: wards on the stairs are what hold the Hollow, so the
// essence spent on tonight's tides won't be there for it.
function moonNote() {
  const left = s.tuning.seasonDays - s.day;
  if (left < 1 || left > 2) return '';
  const stairs = K().stairs.length;
  const when = left === 1 ? 'Tomorrow night' : 'In two nights';
  if (!stairs) return `<p class="note">${when} comes the new moon, and the Hollow. This keep has no stairs yet, so only shades fighting it can stop it.</p>`;
  return `<p class="note">${when} comes the new moon. Wards on the stairs are what hold the Hollow back: warding all ${stairs} here would take ${fmt(stairs * wardCost(s))} essence, and you have ${floor1(s.res.essence)}. What you spend tonight won't be there then.</p>`;
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
      return `<p class="note bad">${esc(d.name)} is caught in the ${esc(roomName(roomAt(K(), d.f, d.x) || 'crypt', true))}. Drop a candle on the spot or send a fighter${m ? `, or break the ${esc(m.name)} to free ${esc(d.name)} at once` : ''}.</p>${m ? breakHTML(m) : ''}`;
    }).join('')}
    ${n.hush ? '<p class="note">Hushed: no work, no fighting, and the Unlit pass the shades by.</p>' : ''}`;
}

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
    ${r.lost.length ? `<p class="note bad">Lost: ${esc(listOf(r.lost))}.</p>` : ''}</div>`;
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
  return `<div class="rite-row${c === 'cover' || c === 'release' || c === 'banish' ? ' is-cover' : ''}">
    <div class="who"><div><b>${esc(d.name)}</b>${kindTag(d.kind)}${bonded ? `<small>${esc(bonded.name)}'s ${esc(BOND_OTHER[d.bond.rel] || d.bond.rel)}</small>` : ''}</div>${shadeTraitText(d)}<small>${note}</small></div>
    <div class="opts">${opts}</div>${acts}</div>`;
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
    ${nightReport()}
    ${s.dreamt ? `<p class="note">A Wistful shade rested the night through and sent good dreams: the living work ×${s.dreamt} today.</p>` : ''}
    <div class="rite-list">${s.shades.map(riteRow).join('') || '<p class="empty">The glass is empty.</p>'}</div>
    <div class="preview">
      <p>Dread <b class="big">${D.from} → ${D.to}</b> <small class="muted">(${parts})</small></p>
      ${P.inspector ? '<p class="note bad">At 5 the Lantern Church sends an inspector today. At noon a Dread of 4 or 5 is censured.</p>' : warn ? '<p class="note">The Lantern Church inspects soon. A Dread of 0 or 1 at noon is blessed.</p>' : ''}
      <div class="vigil"><span>Vigils at dawn, ${T.vigilCost} remembrance each:</span><button class="btn sm" id="vig-dn" data-act="vigils" data-n="${s.rite.vigils - 1}"${s.rite.vigils <= 0 ? ' disabled' : ''} aria-label="One fewer vigil">−</button><b>${s.rite.vigils}</b><button class="btn sm" id="vig-up" data-act="vigils" data-n="${s.rite.vigils + 1}" aria-label="One more vigil">+</button><small class="muted">remembrance ${floor1(s.res.remembrance)}</small></div>
      ${badLuckNote()}
      ${s.mirrors.some((m) => s.shades.some((d) => d.mirror === m.id)) ? `<details class="card" data-keep="breaking"${ui.open.breaking ?? P.inspector ? ' open' : ''}><summary><b>Break a mirror</b></summary><p class="note">In an emergency: everyone in it goes free at once and Dread falls ${fmt(T.breakDread)} for each, which covering can't do. The mirror is lost, and ${T.badLuckDays} days of bad luck follow.</p>${mirrorsHTML()}</details>` : ''}
      ${P.errors.map((e) => `<p class="note bad">${esc(e)}</p>`).join('')}
      <div class="row"><button class="btn primary" id="btn-day" data-act="begin-day"${P.errors.length ? ' disabled' : ''}>Begin day ${s.day + 1}</button></div>
    </div>`;
}

function summaryHTML(e) {
  const S = e.summary;
  const causes = Object.entries(S.byCause).filter(([, n]) => n).map(([k, n]) => `${n} ${k === 'hollow' ? 'taken by the Hollow' : CAUSES[k].name.toLowerCase()}`).join(', ');
  const raids = S.raids.map((r) => (r.held ? 'held' : 'breached')).join(', ');
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
    <p class="hint">Saved with the playtest export in the Records below.</p></div>`;
}

function endPanel() {
  const e = lastSeason(s);
  return `<header class="ph-head"><h2>Season ${e.season} is over</h2><p>The new moon has passed. The keep stands.</p></header>
    ${questionHTML(e)}
    <div class="card"><h3>The season</h3>${summaryHTML(e)}<div class="row"><button class="btn sm" id="end-book" data-act="book">Read the Book of the Dead</button></div></div>
    <div class="row"><button class="btn primary" id="btn-next-season" data-act="next-season">Begin season ${e.season + 1}</button><span class="hint">Raids and the Unlit come ×${s.tuning.hardness} harder.</span></div>`;
}

function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New season from day 1</button></div>';
  return `<div class="confirm"><p>Start keep ${saves.current} over from season 1, day 1? This one is gone unless you export it first, from Menu, then Saves; a new keep can go in another slot there instead.</p>
    <div class="row"><button class="btn primary" id="btn-new-yes" data-act="new-yes">Start over</button><button class="btn" id="btn-new-no" data-act="new-no">Cancel</button></div></div>`;
}

function overPanel() {
  const e = lastSeason(s);
  const why = s.over?.reason === 'veil' ? 'The Veil broke and the Unlit came through into the keep.' : 'No one living was left.';
  return `<header class="ph-head"><h2>The keep is lost</h2><p>${why} Season ${s.season}, ${s.phase === 'over' && s.over.day ? `day ${s.over.day}` : ''}.</p></header>
    ${e ? questionHTML(e) : ''}
    ${e ? `<div class="card"><h3>The season</h3>${summaryHTML(e)}</div>` : ''}
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
        isTwinnedLiving(s, p) ? '<span class="tag twin">Twinned</span>' : '',
      ].join('');
      const b = p.bond ? byId(s.living, p.bond.with) || byId(s.shades, p.bond.with) : null;
      const bond = b ? `${b.name}'s ${BOND_OTHER[p.bond.rel] || p.bond.rel}${byId(s.shades, b.id) ? ' (a shade)' : ''}` : '';
      return `<div class="prow${ui.person === p.id ? ' is-selected' : ''}" id="prow-${p.id}">
        <div class="pname"><button class="linkish" id="pick-${p.id}" data-act="person" data-id="${p.id}" aria-pressed="${ui.person === p.id}"><b>${esc(p.name)}</b></button><small>${p.age}</small></div>
        <div class="pwork"><select id="job-${p.id}" data-act="assign" data-id="${p.id}" aria-label="Job for ${esc(p.name)}"${s.phase === 'day' || s.phase === 'dusk' || s.phase === 'dawn' ? '' : ' disabled'}>${opts(p)}</select></div>
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
          <div><b>${esc(d.name)}</b>${kindTag(d.kind)}${d.named ? '<span class="tag peace">Named</span>' : ''}${isTwinnedShade(s, d) ? '<span class="tag twin">Twinned</span>' : ''}</div>
          ${shadeTraitText(d)}
          ${canWork(d) ? `<div><span class="memory${d.memory < 40 ? ' low' : ''}" aria-hidden="true"><i data-bar="mem" data-arg="${d.id}"></i></span><small><span data-live="mem" data-arg="${d.id}">${Math.ceil(d.memory)}</span> memory, <span data-live="status" data-arg="${d.id}">${esc(shadeStatus(d, L))}</span></small></div>` : `<small>${esc(shadeStatus(d, L))}</small>`}
        </div>
        <div class="acts">${pick ? `<button class="btn sm" id="sel-${d.id}" data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}">Select</button>` : ''}</div>
      </div>`;
    })
    .join('');
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
      return `<tr><td class="num">${d.season}.${d.day}</td><td class="num">${d.deaths.length}</td><td>${d.raid ? (d.raid.held ? 'held' : 'breached') : '—'}</td><td>${d.inspection ? d.inspection.verdict : '—'}</td>
        <td class="num">${n.spawned ?? '—'}</td><td class="num">${n.crossed ?? '—'}</td><td class="num">${n.grabbed ?? '—'}</td><td>${n.lost?.length ? esc(n.lost.join(', ')) : '—'}</td><td>${n.hollow || '—'}</td><td class="num">${d.dread ?? '—'}</td></tr>`;
    })
    .join('');
  return `<div class="table-wrap" id="days-wrap"><table class="ledger days"><thead><tr><th>Day</th><th>Deaths</th><th>Raid</th><th>Church</th><th>Creepers</th><th>Through</th><th>Caught</th><th>Lost</th><th>Hollow</th><th>Dread</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
      exported: new Date().toISOString(),
      seed: s.seed,
      now: { season: s.season, day: s.day, phase: s.phase },
      seasons: s.seasons,
      days: s.days,
      ledger: s.ledger,
      tuning0: s.tuning0,
      tuning: s.tuning,
      actions: s.actions,
    },
    null,
    1,
  );
}
function playtestTab() {
  const answered = s.seasons.filter((e) => e.answer);
  return `<p>The question for weeks 7–10: <b>would you play a second season?</b> It's asked when a season ends or the keep falls. ${answered.length ? `Answers so far: ${answered.map((e) => `season ${e.season}, ${e.answer === 'again' ? 'yes' : 'no'}`).join('; ')}.` : 'No answer yet.'}</p>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy playtest export</button><button class="btn" id="btn-show-export" data-act="show-export" aria-expanded="${ui.showExport}">${ui.showExport ? 'Hide export' : 'Show export'}</button><span class="hint">${esc(ui.copied)}</span></div>
    ${ui.showExport ? `<label for="export">Export (JSON)</label><textarea id="export" rows="8" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">The export holds your answers and notes, every day's numbers, the ledger of the dead, the seed and every action, so a session replays exactly with <code>replay()</code> in <code>src/slice/sim.js</code>.</p>`;
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
  ['wardHold', 'Seconds a ward holds the Hollow'],
  ['newMoonCreepers', 'Creepers on the new moon, as a share of the night before'],
  ['dreadLivingPer', 'Living per point of Dread borne'],
  ['traits', 'Traits: everyone has one, and death turns it over (1 on, 0 off)'],
  ['fadePerNight', 'Memory every shade loses per night'],
  ['cracksMax', 'Veil cracks that lose the keep'],
  ['hardness', 'How much harder each season is (raids, Creepers, the Hollow)'],
  ['mawHardness', 'How much stronger a Maw is each season'],
  ['roomStone', 'Stone a room costs'],
  ['roomCap', 'Workers a room holds'],
  ['startStone', 'Stone a new keep starts with'],
  ['startFloors', 'Floors a new keep starts with, from the ground (1 to 4)'],
  ['steelFight', 'How much harder shades fight with grave-steel'],
  ['lineGuard', 'Shades in the light at the stairs up to the Veil only guard and keep the Watch (1 on, 0 off)'],
  ['goAround', 'The Unlit take any dark way up and gnaw only a light that bars every way (1 on, 0 off)'],
  ['fire', 'Fire by day in Hearths and Forges (1 on, 0 off)'],
];
const KEYS = [
  ['Space', 'play or pause'], ['1, 2, 4', 'speed'], ['C, M, W, H', 'candle, move, ward, hush (at night)'], ['V', 'turn the Tain upright'],
  ['+ and −, 0', 'zoom, and fit the castle again'], ['Arrows', 'pan'], ['K, P, R, B', 'this phase, People, Records, Build'], ['L', 'room names'],
  ['S', 'sound on or off'], ['Esc', 'the Menu, or close a panel'],
];
function settingsTab() {
  const radio = (name, v, label, cur) => `<label class="row" for="${name}-${v}"><input type="radio" name="${name}" id="${name}-${v}" data-act="${name}" value="${v}"${cur === v ? ' checked' : ''}>${label}</label>`;
  const motion = prefs.motion || 'system';
  return `<section class="settings">
    <h3>Play</h3>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause for raids, fires, catches and the Hollow</label>
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
    <h3>Keys</h3>
    <dl class="keys">${KEYS.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${installHTML('settings')}
    <details class="advanced" id="advanced" data-keep="advanced"${ui.open.advanced ? ' open' : ''}><summary>Advanced: the playtest numbers</summary>
      <div class="fields">${TUNE.map(([k, label]) => `<label for="tune-${k}">${esc(label)}<input type="number" id="tune-${k}" data-act="tune" data-key="${k}" value="${s.tuning[k]}" min="0" step="any"></label>`).join('')}</div>
      <p class="hint">These are this keep's numbers. Changes apply from the next tick or the next dusk, and are recorded, so exports still replay. A new keep keeps only the ones you set. Seed ${s.seed}.</p>
    </details>
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
function whereText(m) {
  if (m.lost) return `fallen on day ${m.day}`;
  if (m.phase === 'end') return 'the season is over';
  if (m.phase === 'night') return `night ${m.day}`;
  if (m.phase === 'dusk') return `dusk, day ${m.day}`;
  if (m.phase === 'dawn') return m.day === 0 ? 'the first dawn' : `dawn after night ${m.day}`;
  return `day ${m.day}`;
}
function savesTab() {
  const slots = Array.from({ length: SLOTS }, (_, i) => i + 1).map((n) => {
    const here = n === saves.current;
    const m = here ? summary(s, Date.now()) : saves.slots[n];
    const ask = ui.confirmSlot?.n === n ? ui.confirmSlot : null;
    const file = `<input type="file" id="import-${n}" class="visually-hidden" data-act="import" data-n="${n}" accept=".json,application/json"><label class="btn sm" for="import-${n}">Load a file</label>`;
    let acts;
    if (ask) {
      const q = ask.kind === 'delete' ? `Delete keep ${n}? It can't be brought back unless you exported it.` : ask.kind === 'import' ? `Replace keep ${n} with the one in the file?` : `Start keep ${n} over from season 1, day 1? This keep is lost unless you exported it.`;
      acts = `<p class="note bad">${esc(q)}</p><div class="row"><button class="btn sm primary" id="slot-yes-${n}" data-act="slot-yes" data-n="${n}">${ask.kind === 'delete' ? 'Delete' : ask.kind === 'import' ? 'Replace' : 'Start over'}</button><button class="btn sm" id="slot-no-${n}" data-act="slot-no">Cancel</button></div>`;
    } else if (here) acts = `<div class="row"><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-over-${n}" data-act="slot-over" data-n="${n}">Start over</button></div>`;
    else if (m) acts = `<div class="row"><button class="btn sm primary" id="slot-play-${n}" data-act="slot-play" data-n="${n}">Continue</button><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-delete-${n}" data-act="slot-delete" data-n="${n}">Delete</button></div>`;
    else acts = `<div class="row"><button class="btn sm primary" id="slot-new-${n}" data-act="slot-new" data-n="${n}">New keep</button>${file}</div>`;
    const what = m
      ? `<p><b>Season ${m.season}, ${esc(whereText(m))}</b></p><p class="hint">${plural(m.rooms, 'room')} · ${m.living} living · ${plural(m.shades, 'shade')}${here ? '' : ` · played ${esc(agoText(m.saved))}`}</p>`
      : '<p class="hint">Empty.</p>';
    return `<div class="kslot${here ? ' is-here' : ''}" id="slot-${n}"><div class="kslot-head"><span class="eyebrow">Keep ${n}</span>${here ? '<span class="tag">Playing</span>' : ''}</div>${what}${acts}</div>`;
  }).join('');
  return `<section class="saves">
    <p class="note">Each keep saves itself as you play. Export writes a keep to a file you can keep or send; Load a file takes that file back, or a tester's playtest export, which is replayed into the keep it came from.</p>
    <div class="kslots">${slots}</div>
    ${ui.slotMsg ? `<p class="note bad" role="alert">${esc(ui.slotMsg)}</p>` : ''}
  </section>`;
}
const MENU_TABS = [['settings', 'Settings'], ['saves', 'Saves']];
function menuHTML() {
  const tab = ui.menuTab === 'saves' ? 'saves' : 'settings';
  return `<div class="tabs" role="tablist" aria-label="Menu">${MENU_TABS.map(([k, l]) => `<button class="tab" role="tab" id="menu-tab-${k}" data-act="menu-tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="menupanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="menupanel" aria-labelledby="menu-tab-${tab}">${tab === 'saves' ? savesTab() : settingsTab()}</div>`;
}
const TABS = [['book', 'Book of the Dead'], ['log', 'Log'], ['days', 'Days'], ['playtest', 'Playtest']];
function recordsHTML() {
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'log';
  const body = { book: bookTab, log: logTab, days: daysTab, playtest: playtestTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tabpanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
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
  const byHeight = Math.floor(freeH / (VEIL - roofTop() + 4));
  ui.fit = Math.max(1, Math.min(6, byWidth, Math.max(byHeight, Math.min(3, byWidth))));
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
  const fy = nightView() ? VEIL + h / 2 - 6 : VEIL - h / 2 - 4;
  const sx = (fr.left + fr.right) / 2 / ui.scale;
  const sy = (fr.top + fr.bottom) / 2 / ui.scale;
  return { x: fx - sx, y: flipped() ? fy - view.ch + sy : fy - sy };
}
// Keeps a dragged camera's centre over the castle (and the Tain at night), so it can't get lost.
function clampPan(a) {
  const [y0, y1] = nightView() ? [VEIL / 2, 2 * VEIL - roofTop() + 30] : [roofTop() - 40, VEIL + 20];
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
const keepToWorldY = (ky) => (nightView() ? 2 * VEIL - ky : ky);

// A tap on the screen as a spot in the keep (by day) or the Tain (by night): { f, x, y, room } or null.
function stageAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const x = (clientX - box.left) / ui.scale;
  let y = (clientY - box.top) / ui.scale;
  if (flipped()) y = view.ch - y;
  const wx = camX() + x;
  const wy = camY() + y;
  let ky;
  if (nightView()) {
    if (wy < VEIL) return null;
    ky = 2 * VEIL - wy;
  } else {
    if (wy >= VEIL) return null;
    ky = wy;
  }
  const f = floorAtY(K(), ky);
  if (f < 0) return null;
  return { f, x: Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, wx)), y: ky, room: typeAt(K(), f, wx), id: roomAt(K(), f, wx) };
}

let drawnLabels = '';
function placeLabels() {
  const night = nightView();
  const marked = night ? s.night?.broken || [] : s.haunted || [];
  const key = `${prefs.labels}|${night}|${prefs.mode}|${ui.scale}|${view.x.toFixed(2)}|${view.y.toFixed(2)}|${view.ch}|${K().key}|${marked.join()}`;
  if (key === drawnLabels) return;
  drawnLabels = key;
  labelsEl.hidden = !prefs.labels;
  if (!prefs.labels) return;
  const box = canvas.getBoundingClientRect();
  const out = [];
  const G = K();
  for (let f = 0; f < G.n; f++) {
    for (const [id, a, b, type] of G.floors[f].rooms) {
      // Each tag sits on the ceiling side of its room, so it never covers anyone's feet.
      const ceiling = night ? keepToWorldY(G.floors[f].y) : G.floors[f].y;
      const p = worldToScreen((a + b) / 2, ceiling);
      const up = night && !flipped();
      const mark = marked.includes(id) ? (night ? ', broken' : ', haunted') : '';
      out.push(`<span class="${up ? 'up' : ''}${mark ? ' marked' : ''}" style="left:${box.left + p.x}px;top:${box.top + p.y}px;max-width:${(b - a) * ui.scale - 6}px">${esc((night ? TWINS[type].name : DAY_ROOMS[type].name) + mark)}</span>`);
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
  return best;
}

function onStage(e) {
  if (skipCrossing()) return;
  const at = stageAt(e.clientX, e.clientY);
  if (!at) return;
  if (s.phase === 'day') {
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
  if (!(s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place'))) return;
  if (ui.tool === 'candle') {
    if (!at.room) return toast('That is inside a wall.', 'bad');
    return game({ type: 'candle', f: at.f, x: Math.round(at.x * 2) / 2 });
  }
  if (ui.tool === 'ward') {
    const w = wardNear(at);
    return w ? game({ type: 'ward', target: w.id }) : toast('Tap closer to a stair or a rift.', 'bad');
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
  const h = ui.hover;
  if (!h || !h.room || !(s.phase === 'night' || (s.phase === 'dusk' && s.dusk?.step === 'place'))) return null;
  if (ui.tool === 'candle' && s.res.candles >= 1) return { tool: 'candle', f: h.f, x: Math.round(h.x) };
  if (ui.tool === 'ward') {
    const w = wardNear(h);
    return w ? { tool: 'ward', target: w } : null;
  }
  return null;
}

// Between day and night the old picture fades out over the new one while the camera travels.
const fade = { cv: document.createElement('canvas'), until: 0, night: nightView() };
function draw(alpha, now) {
  const night = nightView();
  if (night !== fade.night) {
    fade.night = night;
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
    flip: flipped(),
    cam: { x: camX(), y: camY() },
    t,
    sunset: s.phase === 'day' ? Math.max(0, (s.t / dayTicks(s) - 0.82) / 0.18) : s.phase === 'end' ? 0.35 : 0,
    dusk: duskAmount(now),
    souls: soulSpots(now),
    marks: night && ui.guide?.marks ? ui.guide.marks() : null,
    threats: night && waysOn() ? threatsNow() : null,
    alpha: s.phase === 'night' && !ui.paused ? alpha : 1,
    selected: ui.selected,
    ghost: ghost(),
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
  spot(f, x) {
    const box = canvas.getBoundingClientRect();
    const p = worldToScreen(x + 0.5, keepToWorldY(feet(K(), f) - 5) + (nightView() ? -0.5 : 0.5));
    return { x: box.left + p.x, y: box.top + p.y };
  },
  get crossing() { return !!ui.cross; },
  get sound() { return { state: sound.state, bed: sound.bed, heard: [...heard] }; },
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
function installHTML(where) {
  if (!INSTALLABLE) return '';
  if (installed()) return where === 'settings' ? '<p class="hint">Running as an installed app. It plays offline.</p>' : '';
  if (installPrompt) return `<div class="row"><button class="btn" id="btn-install-${where}" data-act="install">Install the app</button><span class="hint">Full screen, from your home screen, and it plays offline.</span></div>`;
  if (IOS) return '<p class="hint">To install it on an iPhone or iPad: Share, then Add to Home Screen.</p>';
  if (where !== 'settings') return '';
  return '<p class="hint">This browser hasn\'t offered to install the season here (it may already be installed). In Chrome or Edge, look for Install in the address bar or the menu; in Firefox on Android, the menu has Install; on an iPhone or iPad, Share, then Add to Home Screen.</p>';
}

/* ---------------------------------------------------------------- the page */

// Raising rooms on top of the keep: what stone buys, and where the next room goes.
function buildHTML() {
  const T = s.tuning;
  const stone = s.res.stone || 0;
  const at = nextSlot(s);
  const top = K().floors[0].rooms;
  const where = !at
    ? 'The keep can rise no higher.'
    : at.newFloor
      ? 'The next room starts a new floor on top of the keep, with a bare hall beside it.'
      : `The next room goes into the bare hall beside the ${roomName(top[1 - at.slot][0])}.`;
  const masons = jobCount(s, 'yard');
  const can = s.phase === 'day' && !!at && stone + 1e-9 >= T.roomStone;
  const rows = BUILDABLE.map((type) => {
    const R = DAY_ROOMS[type];
    const tw = TWINS[type];
    const have = roomsOf(K(), type).length;
    return `<li class="build-row"><div><b>${esc(R.name)}</b>${have ? ` <small class="muted">you have ${have}</small>` : ''}<p class="note">${esc(R.job(R))} By night, the ${esc(tw.name)}: ${esc(tw.note)}</p></div>
      <button class="btn sm" id="raise-${type}" data-act="raise" data-room="${type}"${can ? '' : ' disabled'}>Build, ${T.roomStone} stone</button></li>`;
  }).join('');
  return `<section class="build">
    <p>Stone <b data-live="stone">${floor1(stone)}</b>. ${masons ? `${esc(plural(masons, 'mason'))} in the Yard quarry ${fmt(masons * DAY_ROOMS.yard.rate)} a day.` : 'Nobody is quarrying: put someone in the Yard, in People, for 2 stone a day.'}</p>
    <p class="note">${esc(where)} Each room holds ${T.roomCap} workers, so another Barracks lets more guards stand. What you build on top by day is the Tain's deepest room by night, nearest the rifts.</p>
    ${s.phase === 'day' ? '' : '<p class="note">Masons build by day.</p>'}
    <ul class="build-list">${rows}</ul>
  </section>`;
}

const SHEETS = {
  build: ['Build', buildHTML],
  intro: ['About', introHTML],
  phase: [null, () => `<section class="phase ${PH[s.phase]}">${phaseHTML()}</section>`],
  people: ['People', rosterHTML],
  records: ['Records', () => `<section class="records">${recordsHTML()}</section>`],
  menu: ['Menu', () => `<section class="menu">${menuHTML()}</section>`],
};
function sheetHTML() {
  if (!ui.sheet) return '';
  const [title, body] = SHEETS[ui.sheet];
  return `<div class="gsheet-head"><span class="eyebrow" id="sheet-title">${esc(title || SHEET_NAME())}</span><button class="btn sm" id="sheet-close" data-act="sheet-close">Close</button></div>
    <div class="gsheet-body" id="sheet-body">${body()}</div>`;
}
const SECTIONS = { hud: hudHTML, bar: barHTML, sheet: sheetHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let drawnToasts = -1;

const LIVE = {
  heat: (id) => fireTrend(id),
  clock: () => clockText(),
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
  status: (id) => {
    const d = byId(s.shades, id);
    return d ? shadeStatus(d, lightMap(K(), s.tuning, s.night?.candles || [])) : '';
  },
};
const BARS = {
  heat: (id) => s.fires?.find((f) => f.room === id)?.heat ?? 0,
  clock: () => (s.phase === 'day' ? s.t / dayTicks(s) : s.phase === 'night' ? s.t / nightTicks(s) : s.phase === 'dusk' ? 0 : 1),
  mem: (id) => (byId(s.shades, id)?.memory ?? 0) / 100,
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
    if (a && host.contains(a) && a.matches('select, textarea, input:not([type="checkbox"])')) continue;
    const focusId = a && host.contains(a) ? a.id : null;
    const scrolls = [...host.querySelectorAll('#sheet-body, #log, #days-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
    host.innerHTML = html();
    if (id === 'sheet') {
      host.hidden = !ui.sheet;
      host.className = `gsheet${ui.sheet ? ` is-${ui.sheet}` : ''}`;
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
    const hint = hintText();
    const el = document.getElementById('stage-hint');
    if (el.textContent !== hint) el.textContent = hint;
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

function openSheet(name) {
  if (name === 'menu' && running() && !ui.paused) {
    ui.paused = true;
    ui.resume = true;
  }
  ui.sheet = name;
  bump();
  requestAnimationFrame(() => document.getElementById('sheet-close')?.focus({ preventScroll: true }));
}
function closeSheet() {
  const was = ui.sheet;
  ui.sheet = null;
  ui.confirmSlot = null;
  ui.slotMsg = '';
  if (ui.resume) {
    ui.resume = false;
    if (running()) ui.paused = false;
  }
  if (was === 'intro') {
    prefs.introDone = true;
    savePrefs();
  }
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
    text: 'Raiders on the road. Your defense (two for each guard) has to match their strength. The Day panel has the numbers: move people to the Barracks, or ward the gate with essence.',
  },
  {
    id: 'fire', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.fires?.length > 0,
    done: () => ui.sheet === 'phase',
    text: "Fire! Everyone in the room fights it, but a Hearth or Forge fire outgrows a room's own hands. Send the Yard's masons from the Day panel, or at full heat it kills and spreads.",
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
    id: 'traits', target: '.rite-list',
    when: () => first() && seen('rite') && s.phase === 'dawn' && traitsOn() && s.shades.some((d) => SHADE_TRAITS[d.trait]),
    text: () => `Everyone has a trait, and death turns it over: the Brave wake Reckless, the Devout Bitter, the Greedy Hoarding. Each shade's line says what it does now. A Bitter one costs ${s.tuning.dreadPerKeep * SHADE_TRAITS.bitter.dread} Dread to keep, but makes wards cheap; read them before you choose.`,
  },
  {
    id: 'build', target: '#btn-build',
    when: () => first() && s.phase === 'day' && seen('jobs') && s.t > dayTicks(s) * 0.2,
    done: () => ui.sheet === 'build',
    text: () => `Build raises a room on top of the keep for ${s.tuning.roomStone} stone; masons in the Yard quarry ${DAY_ROOMS.yard.rate} a day each. Raiders come on day 2, so a Barracks first, and a Chandlery before the candles run out. A room holds ${s.tuning.roomCap} workers. What you build on top by day is the Tain's deepest room by night, next to the rifts.`,
  },
  {
    id: 'church', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.inspection && !s.inspection.done,
    text: 'The Lantern Church inspects at noon. Dread 0 or 1 is blessed; 4 or 5 costs your fullest mirror and the shades in it. A vigil in the Day panel lowers Dread for 3 remembrance.',
  },
  {
    id: 'maw', target: '#tool-move', pause: true,
    when: () => first() && s.phase === 'night' && s.night.foes.some((f) => f.type === 'maw'),
    text: 'A Maw. It goes for whatever is worth most for the least fight: the candle holding the stairs, or a room where people work. It counts every fighter on its way, so a thick line only sends it elsewhere. Watch where it heads, and send a fighter there with a candle. A room it stands in for 12 seconds breaks, and costs Dread at dawn.',
  },
  {
    id: 'moon', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && isNewMoon(s),
    text: 'Tonight is the new moon. The Hollow walks to the mirrors whatever the light. A ward on a stair holds it a while; shades fighting it drive it back. If it reaches the Veil, it takes one of the living.',
  },
];
let coachId = null;
const coachEl = document.getElementById('coach');
function guideStep() {
  if (!prefs.guide || ui.sheet === 'intro') return null;
  return GUIDE.find((g) => !seen(g.id) && g.when()) || null;
}
function markSeen(id) {
  prefs.guideSeen = { ...(prefs.guideSeen || {}), [id]: true };
  savePrefs();
  bump();
}
function showCoach(step) {
  const id = step?.id || null;
  if (id === coachId) return;
  // A card the player has moved past (the moment it was about is over) counts as read.
  const was = GUIDE.find((g) => g.id === coachId);
  if (was && !seen(was.id) && !was.when()) prefs.guideSeen = { ...(prefs.guideSeen || {}), [was.id]: true };
  coachId = id;
  bump();
  coachEl.hidden = !step;
  coachEl.innerHTML = step
    ? `<p>${esc(typeof step.text === 'function' ? step.text() : step.text)}</p><div class="row"><button class="btn sm primary" id="coach-ok" data-act="guide-ok" data-id="${step.id}">Got it</button><button class="btn sm" id="coach-off" data-act="guide-off">Skip the guide</button></div>`
    : '';
  if (step?.pause && running() && !ui.paused) {
    ui.paused = true;
    bump();
  }
}
function tickGuide() {
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
const STOPS = /has caught|The Hollow rises|Raiders on the road|inspector|has turned Wraith|A Maw is tearing|A Maw is breaking|^Fire in the|The fire spreads/;
const OPENS = /Raiders on the road|inspector|fallen sick|larder is empty|arrives at the gate|^Fire in the/;
function takeAlerts(fromClock) {
  let stop = false;
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone, OPENS.test(a.text) ? 'phase' : null);
    if (/slipped through the Veil|tore through the Veil/.test(a.text)) ui.flash = performance.now() + 600;
    if (fromClock && prefs.autoPause && STOPS.test(a.text)) stop = true;
  }
  if (stop) {
    ui.paused = true;
    ui.rush = false;
    bump();
  }
  return stop;
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
  if (!running()) ui.paused = true;
  if (s.phase === 'dusk') {
    ui.tool = 'candle';
    if (!REDUCED_NOW() && seenPhaseWas === 'day') ui.cross = { stage: 'sunset', t0: performance.now() };
    else if (s.dusk.step === 'crypt') openSheet('phase');
    if (s.dusk.step !== 'crypt' && ui.sheet === 'phase') closeSheet();
  } else if (s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over') openSheet('phase');
  else if (ui.sheet === 'phase') closeSheet();
  if (s.phase !== 'night' && s.phase !== 'dusk') ui.selected = null;
}

// The bed of sound for the moment, how near the Hollow is to the mirrors (its heart beats only while the night
// runs), and the danger: how many of the Unlit are about, and how cracked the Veil is.
function moodNow() {
  const bed = { day: 'day', dusk: 'dusk', night: 'night', dawn: 'rite', end: 'rite' }[s.phase] || 'none';
  if (s.phase !== 'night') return { bed };
  const n = s.night;
  const h = !ui.paused && n.foes.find((f) => f.type === 'hollow' && f.hp > 0 && !f.rising);
  return { bed, hollow: h ? h.f / Math.max(1, K().veil) : null, danger: Math.min(1, n.foes.length / 12 + (0.5 * s.cracks) / s.tuning.cracksMax) };
}

let lastNow = 0;
let acc = 0;
let seenPhase = s.phase;
let seenPhaseWas = s.phase;
function frame(now) {
  const dt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (!ui.paused && running()) {
    acc += dt * prefs.speed * (ui.rush ? 10 : 1) * TICKS_PER_SEC;
    let n = Math.floor(acc);
    acc -= n;
    while (n-- > 0 && running()) {
      const ph = s.phase;
      step(s);
      if (takeAlerts(true) || s.phase !== ph) {
        acc = 0;
        break;
      }
    }
  }
  takeAlerts(false);
  for (const c of s.cues.splice(0)) sfx(c.name, c.x);
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
    onPhase();
    saveGame();
    bump();
  }
  const before = ui.toasts.length;
  ui.toasts = ui.toasts.filter((t) => t.until > now);
  if (ui.toasts.length !== before) ui.toastRev++;
  moveCamera(dt);
  ui.guide = tickGuide();
  render(ui.paused || !running() ? 1 : Math.min(1, acc), now);
  requestAnimationFrame(frame);
}
setInterval(() => {
  if (running() && !ui.paused) saveGame();
}, 5000);

/* ---------------------------------------------------------------- input */

function game(a) {
  const r = act(s, a);
  if (!r.ok) {
    toast(r.error, 'bad');
    sfx('nope');
  }
  takeAlerts(false);
  bump();
  return r.ok;
}
function togglePlay() {
  if (!running()) return;
  ui.paused = !ui.paused;
  ui.resume = false; // played or paused by hand: closing the Menu leaves it so
  if (ui.paused) ui.rush = false;
  bump();
}
function setSpeed(v) {
  prefs.speed = v;
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
function playKeep(n, g, lead) {
  if (n !== saves.current) saveGame();
  useSlot(store, saves, n);
  s = listen(g);
  seenPhase = s.phase;
  seenPhaseWas = s.phase;
  acc = 0;
  Object.assign(ui, { paused: true, resume: false, confirmNew: false, selected: null, person: null, hover: null, tool: 'candle', showExport: false, copied: '', rush: false, cross: null });
  view.panX = 0;
  view.panY = 0;
  view.snap = true;
  saveWarned = false;
  saveGame();
  closeSheet();
  if (waiting()) openSheet('phase');
  toast(`${lead} Season ${s.season}: ${phaseLabel()}.`, 'rite');
  if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
  retuned = 0;
  return bump();
}
function playSlot(n) {
  if (n === saves.current) return closeSheet();
  const g = loadGame(n);
  if (g) return playKeep(n, g, `Keep ${n}.`);
  ui.slotMsg = `Keep ${n} couldn't be read.`;
  return bump();
}
function newKeep(n) {
  retuned = 0;
  return playKeep(n, newSeason(Date.now() >>> 0, playerTuning(s)), `A new keep in slot ${n}.`);
}
function confirmSlot(n) {
  const ask = ui.confirmSlot;
  ui.confirmSlot = null;
  if (!ask || ask.n !== n) return bump();
  if (ask.kind === 'over') return newKeep(n);
  if (ask.kind === 'import') {
    retuned = retune(ask.g, TUNING);
    return playKeep(n, ask.g, `Keep ${n}, from ${ask.name}.`);
  }
  if (ask.kind !== 'delete' || n === saves.current) return bump(); // the keep being played is never deleted
  deleteSlot(store, saves, n);
  toast(`Keep ${n} is deleted.`);
  return bump();
}
// A keep as a file: the save itself, which Load a file (here or on another device) takes back exactly.
function exportSlot(n) {
  const g = n === saves.current ? { ...s, alerts: [], cues: undefined } : store.get(slotKey(n));
  if (!g) return undefined;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(g)], { type: 'application/json' }));
  a.download = `afterglass-keep-${n}-season-${g.season}-day-${g.day}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Keep ${n} is saved as ${a.download}.`);
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
      retuned = retune(r.s, TUNING);
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
      if (ui.rush) ui.paused = false;
      return bump();
    case 'tool':
      ui.tool = el.dataset.tool;
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
      ui.confirmSlot = null;
      ui.slotMsg = '';
      return bump();
    case 'slot-play': return playSlot(Number(el.dataset.n));
    case 'slot-new': return newKeep(Number(el.dataset.n));
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
    case 'raise': return game({ type: 'raise', room: el.dataset.room });
    case 'wardgate': return game({ type: 'wardGate' });
    case 'vigil': return game({ type: 'vigil' });
    case 'build': return game({ type: 'build', mirror: el.dataset.mirror });
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
    case 'next-season':
      if (game({ type: 'nextSeason' })) saveGame();
      return undefined;
    case 'tune': return game({ type: 'tune', key: el.dataset.key, value: el.value });
    case 'tab':
      prefs.tab = el.dataset.tab;
      savePrefs();
      return bump();
    case 'book':
      prefs.tab = 'book';
      savePrefs();
      return openSheet('records');
    case 'autopause':
      prefs.autoPause = el.checked;
      savePrefs();
      return bump();
    case 'intro-close':
      prefs.guide = false;
      return closeSheet();
    case 'intro-guide':
      prefs.guide = true;
      prefs.guideSeen = {};
      return closeSheet();
    case 'guide-ok':
      markSeen(el.dataset.id);
      return undefined;
    case 'guide-off':
      prefs.guide = false;
      savePrefs();
      showCoach(null);
      return bump();
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
  if (e.target.matches('[data-act="volume"]')) {
    prefs[e.target.dataset.key] = Number(e.target.value) / 100;
    sound.set({ fx: prefs.sfx, amb: prefs.amb });
    return;
  }
  if (!e.target.matches('[data-note]')) return;
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
  if (e.key === 'Escape') {
    if (ui.sheet) closeSheet();
    else if (!e.target.closest('input, select, textarea')) openSheet('menu');
    return;
  }
  const k = e.key.toLowerCase();
  if (ui.cross && (k === ' ' || k === 'enter') && !e.target.closest('input, select, textarea, button, a')) {
    e.preventDefault();
    skipCrossing();
    return;
  }
  // Typing in a field is left alone; a focused button keeps space and enter for itself.
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea')) return;
  if (e.target.closest('button, a') && (k === ' ' || k === 'enter')) return;
  if (k === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (k === '1' || k === '2' || k === '4') setSpeed(Number(k));
  else if (k === 'c' || k === 'm' || k === 'w') {
    ui.tool = { c: 'candle', m: 'move', w: 'ward' }[k];
    bump();
  } else if (k === 'h' && s.phase === 'night') game({ type: 'hush', on: !s.night.hush });
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
if (!prefs.introDone) openSheet('intro');
else if (waiting()) openSheet('phase');
if (s.day > 1 || s.season > 1 || s.phase !== 'day') toast(`Welcome back. Season ${s.season}: ${phaseLabel()}.`, 'rite');
if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
requestAnimationFrame(frame);
