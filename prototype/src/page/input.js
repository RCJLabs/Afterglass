// Input: clicks, keys, the pointer and the wheel; then the page starts.

import { act, lastSeason } from '../slice/sim.js';
import { prefs, savePrefs, sound, retuned, saveGame, bootError, s, ui, bump, eclipseNow, toast } from './state.js';
import { showHint } from './hud.js';
import { trail, deviceNow, answered, startTest } from './playtest.js';
import { watchSpeed, watchSeek, watchNext, watchPrev } from './watch.js';
import { canvas, hudEl, barEl, wide, layout, zoomTo, zoomBy, panBy, fitView, stageAt, onStage, actAt, keyFocused, placing, kbAt, kbMove, kbPick } from './stage.js';
import { continuable, openTitle, titleContinue, titleView, render, openSheet, closeSheet } from './screen.js';
import { skipCrossing, skipAhead, frame, crash } from './clock.js';
import { game, togglePlay, setSpeed, waiting, CUSTOM_NUMBERS } from './keeps.js';
import { onAct } from './acts.js';

document.addEventListener('click', (e) => {
  // A <details> keeps its open state in ui as it's clicked: the toggle event comes a task later, after a
  // render may already have replaced the element.
  const sum = e.target.closest('details[data-keep] > summary');
  if (sum) ui.open[sum.parentElement.dataset.keep] = !sum.parentElement.open;
  const el = e.target.closest('[data-act]');
  if (el && !el.matches('select, input, textarea')) onAct(el.dataset.act, el, e);
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
  // A tab list's own keys (round seven): the arrows, Home and End go along the tabs and open the one they reach,
  // rather than panning the castle behind the panel.
  const tab = e.target.closest?.('[role="tab"]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(tab);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    e.preventDefault();
    tabs[j].focus();
    tabs[j].click();
    return;
  }
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
  // A tester part way through: straight back to the keep under test, as the link itself does. One who had
  // reached the questions, or chosen to stop, is asked to send what they have.
  if (s.test.endAsked || s.test.playOn === false || answered()) {
    ui.testBack = true;
    openSheet('test', 'game');
  } else if (waiting()) openSheet('phase', 'game');
} else openTitle('game');
if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
if (bootError) crash(bootError, 'load');
requestAnimationFrame(frame);
