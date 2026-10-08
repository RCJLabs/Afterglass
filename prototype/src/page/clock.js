// The clock: the frame loop.

import { BUILD } from '../build.js';
import { STOPS, OPENS, FLASHES } from '../slice/alerts.js';
import { TICKS_PER_SEC, MAP } from '../slice/data.js';
import { roomSpan } from '../slice/geo.js';
import { slotKey, saveSpare, loadSpare } from '../slice/saves.js';
import { step, nextMark, SKIP_LEAD, cracksOf } from '../slice/sim.js';
import { SOUNDS } from '../slice/sound.js';
import { store, prefs, savePrefs, REDUCED_NOW, sound, buzz, sfx, saves, crashed, saveGame, s, K, ui, bump, running, eclipseNow, toast, setCrashed } from './state.js';
import { esc } from './hud.js';
import { trail } from './playtest.js';
import { watchFrame } from './watch.js';
import { view, layout, moveCamera, placing } from './stage.js';
import { render, openSheet, closeSheet } from './screen.js';
import { tickGuide } from './guide.js';
import { noteSeason, saveFile } from './keeps.js';

/* ---------------------------------------------------------------- the clock */

// What an alert does is decided by its kind (alerts.js), not its words.
export function takeAlerts(fromClock) {
  let stop = false;
  if (ui.skip && s.alerts.length) endSkip(); // something happened: back to the clock's own pace
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone, OPENS.has(a.kind) ? 'phase' : null);
    if (FLASHES.has(a.kind)) ui.flash = performance.now() + 600;
    if (fromClock && prefs.autoPause && STOPS.has(a.kind)) stop = a.text;
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
export function startSouls(plan) {
  if (REDUCED_NOW() || !plan.length) return;
  ui.cross = { stage: 'souls', t0: performance.now(), souls: plan.map((x) => ({ up: x.to === 'funeral', flashed: false })) };
}
function crossingDone(now) {
  const c = ui.cross;
  if (!c) return false;
  if (c.stage === 'sunset') return now - c.t0 >= CROSS.sunset;
  return now - c.t0 >= CROSS.rise + CROSS.sink + CROSS.gap * c.souls.length + 200;
}
export function skipCrossing() {
  if (!ui.cross) return false;
  if (ui.cross.stage === 'sunset') afterSunset();
  else {
    ui.cross = null;
    bump();
  }
  return true;
}
export function duskAmount(now) {
  if (s.phase !== 'dusk') return 0;
  if (ui.cross?.stage === 'sunset') return Math.min(1, (now - ui.cross.t0) / CROSS.sunset);
  return 1;
}
// Where each crossing soul is now, in world pixels, and how bright.
export function soulSpots(now) {
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
    ui.tool = 'move';
    if (!REDUCED_NOW() && seenPhaseWas === 'day') ui.cross = { stage: 'sunset', t0: performance.now() };
    else if (s.dusk.step === 'crypt') openSheet('phase', 'game');
    if (s.dusk.step !== 'crypt' && ui.sheet === 'phase') closeSheet();
  } else if (s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over') openSheet('phase', 'game');
  else if (ui.sheet === 'phase') closeSheet();
  // A tester who played on is asked at the season's end, or when the keep falls, whichever comes first.
  if ((s.phase === 'end' || s.phase === 'over') && s.test && !s.test.endAsked) {
    s.test.endAsked = true;
    ui.testNote = false;
    ui.testPlayOn = false;
    ui.quiz = null;
    openSheet('test', 'game');
  }
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
  return { bed, hollow: h ? h.f / Math.max(1, K().veil) : null, danger: Math.min(1, n.foes.length / 12 + (0.5 * s.cracks) / cracksOf(s)) };
}

// Skip (round six): at SKIP_SPEED times the 1× clock to SKIP_LEAD before the next mark on the tide clock,
// ending at once if anything calls out on the way.
const SKIP_SPEED = 20;
export function skipAhead() {
  if (ui.skip) return endSkip();
  const m = nextMark(s);
  if (!m) return toast('Nothing more on the clock before dawn.', 'bad');
  ui.skip = { to: m.at - SKIP_LEAD, kind: m.kind };
  trail('skip', { to: m.kind });
  ui.paused = false;
  ui.rush = false;
  bump();
}
export function endSkip() {
  ui.skip = null;
  bump();
}

let lastNow = 0;
export let acc = 0;
export const setAcc = (v) => (acc = v);
export let seenPhase = s.phase;
export const setSeenPhase = (v) => (seenPhase = v);
export let seenPhaseWas = s.phase;
export const setSeenPhaseWas = (v) => (seenPhaseWas = v);
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
export function frame(now) {
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
    if ((s.phase === 'end' || s.phase === 'over') && !ui.watch) noteSeason();
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
export function crash(err, where) {
  if (crashed) return;
  setCrashed({ where, message: String(err?.message || err || 'unknown error'), stack: String(err?.stack || '').slice(0, 3000), build: BUILD, at: s && { season: s.season, day: s.day, phase: s.phase, t: s.t }, w: Date.now() });
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
