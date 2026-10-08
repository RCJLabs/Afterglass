// The stage and its camera, and the keyboard at night.

import { DAY_ROOMS, TWINS, MAP } from '../slice/data.js';
import { drawScene } from '../slice/draw.js';
import { feet, floorAtY, roomAt, typeAt, roomSpan, unitAt, DEEP_FLOOR } from '../slice/geo.js';
import { keepToStill, figuresOf } from '../slice/quiz.js';
import { canWork, dayTicks, byId, fmt, wardCost, raining, foggy } from '../slice/sim.js';
import { W, VEIL, prefs, savePrefs, REDUCED_NOW, sound, heard, s, K, roofTop, ui, bump, nightView, eclipseNow, viewMode, toast } from './state.js';
import { esc, showHint } from './hud.js';
import { wardName, threatsNow, waysOn } from './dusk.js';
import { quizBase } from './playtest.js';
import { openSheet } from './screen.js';
import { lineSpots, litAt } from './guide.js';
import { skipCrossing, duskAmount, soulSpots } from './clock.js';
import { game } from './keeps.js';

/* ---------------------------------------------------------------- the stage and its camera */

export const gameEl = document.getElementById('game');
export const canvas = document.getElementById('stage');
const labelsEl = document.getElementById('labels');
export const hudEl = document.getElementById('hud');
export const barEl = document.getElementById('bar');
const sheetEl = document.getElementById('sheet');
const WIDE = window.matchMedia('(min-width: 900px)');
export const wide = () => WIDE.matches;
// World pixels on the canvas; the camera's top-left corner in world pixels (x, y), where it's heading
// (tx, ty), and how far the player has dragged it from where it would sit on its own (panX, panY).
export const view = { cw: 0, ch: 0, x: 0, y: 0, tx: 0, ty: 0, panX: 0, panY: 0, snap: true };
const MAX_ZOOM = 10;

// The scale that fits the castle is ui.fit; the player's zoom is kept as whole steps from it, so turning
// a phone sideways keeps the zoom sensible.
export function layout() {
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
export function zoomTo(s1, sx, sy) {
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
export function zoomBy(d) {
  const fr = freeRect();
  zoomTo(ui.scale + d, (fr.left + fr.right) / 2, (fr.top + fr.bottom) / 2);
}
// Drags the castle by a distance in CSS pixels.
export function panBy(dx, dy) {
  view.panX -= dx / ui.scale;
  view.panY -= (flipped() ? -dy : dy) / ui.scale;
  snapCamera();
}
export function fitView() {
  prefs.zoomStep = 0;
  savePrefs();
  view.panX = 0;
  view.panY = 0;
  layout();
  snapCamera();
  drawnLabels = '';
  bump();
}

export function moveCamera(dt) {
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
export function stageAt(clientX, clientY) {
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

export let drawnLabels = '';
export const setDrawnLabels = (v) => (drawnLabels = v);
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

export function onStage(e) {
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
    } else if (at.room) toast(DAY_ROOMS[at.room].job(DAY_ROOMS[at.room], s.tuning), 'day');
    return;
  }
  ui.kb = null; // a tap puts the keyboard's cursor away
  return actAt(at);
}
// Whatever the tool does at a spot on the Tain, from a tap or from the keyboard's cursor.
export function actAt(at) {
  if (!placing()) return undefined;
  const i = tapIntent(at);
  if (i.kind === 'pick') {
    ui.selected = i.d.id;
    ui.tool = 'move';
    return bump();
  }
  if (i.kind === 'uncandle') return i.k.id === ui.lastSet?.id && performance.now() - ui.lastSet.at < TAKE_BACK_WAIT ? undefined : takeBack({ type: 'uncandle', id: i.k.id }, 'The candle is back in the store.');
  if (i.kind === 'wall') return toast('That is inside a wall.', 'bad');
  if (i.kind === 'candle') {
    const n = s.night?.candles.length;
    const ok = game({ type: wispNow() ? 'wisp' : 'candle', f: at.f, x: Math.round(at.x * 2) / 2 });
    if (ok && s.night?.candles.length > n) ui.lastSet = { id: s.night.candles.at(-1).id, at: performance.now() };
    return ok;
  }
  if (i.kind === 'far') return toast(`Tap closer to a stair or a rift${raining(s) ? ", or an end of the moat's twin" : ''}.`, 'bad');
  if (i.kind === 'unward') return takeBack({ type: 'unward', target: i.w.id }, `The ward on ${wardName(i.w.id)} is lifted, and its essence back.`);
  if (i.kind === 'ward') return game({ type: 'ward', target: i.w.id });
  if (i.kind === 'move') game({ type: 'move', id: ui.selected, f: at.f, x: Math.round(at.x * 2) / 2 });
  return undefined;
}
// What a tap there does with the tool in hand (round seven, phase 3). Dusk opens on Move, and the tool decides,
// with three kindnesses. Until the night begins, a tap on a candle or a ward set that dusk takes it back, whole,
// so nothing a tap spends there is lost. Candle out, a tap on a shade already standing in light picks it, since
// a second candle there would be wasted, while one in the dark, or caught, gets the candle (light on the one
// holding it is what frees it). Ward out, a tap away from any stair or rift picks the shade there. (Round seven's audit had a tap
// on a shade always pick it; that took away relighting the line where the shades stand, every dusk from the
// second, and warding the stair a shade guards.)
function tapIntent(at) {
  const d = shadeNear(at);
  if (ui.tool === 'candle') {
    const k = duskCandleNear(at);
    if (k) return { kind: 'uncandle', k };
    // A caught shade is freed when the one holding it stands in light: until then a tap lights, and after, picks.
    const holder = d?.grabbedBy && byId(s.night?.foes || [], d.grabbedBy);
    if (d && (holder ? litAt(holder.f, holder.x) : litAt(d.f, d.x))) return { kind: 'pick', d };
    return at.room ? { kind: 'candle' } : { kind: 'wall' };
  }
  if (ui.tool === 'ward') {
    const w = wardNear(at);
    if (w) return takingBack() && s.night.wards.includes(w.id) ? { kind: 'unward', w } : { kind: 'ward', w };
    return d ? { kind: 'pick', d } : { kind: 'far' };
  }
  if (d && d.id !== ui.selected) return { kind: 'pick', d };
  return ui.selected && at.room ? { kind: 'move' } : { kind: 'none' };
}
// Taking back what was set this dusk (sim.js: uncandle and unward).
export const takingBack = () => s.phase === 'dusk' && s.dusk?.step === 'place';
// Round seven, phase 9: with the store out of candles in the night, the Candle tool burns essence as a wisp.
export const wispNow = () => !!s.tuning.wisp && s.res.candles < 1 && (s.phase === 'night' || eclipseNow()) && s.res.essence + 1e-9 >= s.tuning.wispCost;
const TAKE_BACK_WAIT = 500; // ms: a quick second tap on a candle just set is a double tap, not a change of mind
function duskCandleNear(at) {
  if (!takingBack()) return null;
  let best = null;
  for (const k of s.night.candles) {
    if (k.carrier || k.f !== at.f) continue;
    const dist = Math.abs(k.x - at.x);
    if (dist <= 3 && (!best || dist < best.dist)) best = { k, dist };
  }
  return best?.k || null;
}
export function takeBack(a, said) {
  if (!game(a)) return false;
  toast(said, 'dusk');
  return true;
}

function ghost() {
  const h = kbAt() || ui.hover;
  if (!h || !h.room || !placing()) return null;
  const i = tapIntent(h);
  if (i.kind === 'candle' && (s.res.candles >= 1 || wispNow())) return { tool: 'candle', f: h.f, x: Math.round(h.x) };
  if (i.kind === 'ward') return { tool: 'ward', target: i.w };
  return null;
}

/* ---------------------------------------------------------------- the keyboard at night */

// Whether the focus came from the keyboard (Tab) rather than a click. Browsers without :focus-visible
// (Safari before 15.4) are taken as the keyboard, so a focused button keeps its keys there as before.
export function keyFocused(el) {
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
export const placing = () => s.phase === 'night' || (s.phase === 'dusk' && s.dusk?.step === 'place') || eclipseNow();
const KB_STEP = 3;
export function kbAt() {
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
export function kbMove(key) {
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
export function kbPick(dir) {
  const ds = s.shades.filter(canWork);
  if (!ds.length) return toast('No shade can take a post.', 'bad');
  const i = ds.findIndex((d) => d.id === ui.selected);
  const d = ds[i < 0 ? (dir > 0 ? 0 : ds.length - 1) : (i + dir + ds.length) % ds.length];
  ui.selected = d.id;
  ui.tool = 'move';
  ui.kb = { f: d.f, x: unitAt(K(), d, 1).x };
  return kbShown();
}
// The Dusk panel on a phone (round seven, phase 3) takes half the free height rather than two thirds, so the
// Tain stays in view while the black mirror is read, and a tap on one of its lines brings that spot to the
// middle of what's left, ringed a moment.
export const halfSheet = () => ui.sheet === 'phase' && s.phase === 'dusk' && s.dusk?.step === 'place' && !wide();
export function showSpot(f, x) {
  const fr = freeRect();
  const box = canvas.getBoundingClientRect();
  const p = worldToScreen(x, keepToWorldY(feet(K(), f) - 6));
  panBy((fr.left + fr.right) / 2 - (box.left + p.x), (fr.top + fr.bottom) / 2 - (box.top + p.y));
  ui.spot = { f, x, until: performance.now() + 2400 };
  bump();
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
export function kbText() {
  const at = kbAt();
  const where = at.room ? `the ${TWINS[at.room].name}` : 'inside a wall';
  const here = shadeNear(at);
  const d = byId(s.shades, ui.selected);
  const i = tapIntent(at);
  const enter = {
    pick: () => `pick ${i.d.name}`,
    uncandle: () => 'take the candle back',
    candle: () => (s.res.candles >= 1 ? 'set a candle' : 'nothing (no candles left)'),
    wall: () => 'nothing here',
    far: () => 'nothing (no stair or rift near)',
    unward: () => `lift the ward on ${wardName(i.w.id)}`,
    ward: () => `ward ${wardName(i.w.id)} (${fmt(wardCost(s))} essence)`,
    move: () => `${s.phase === 'dusk' ? 'post' : 'send'} ${d.name} here`,
    none: () => (d ? 'nothing here' : 'nothing ([ and ] pick a shade)'),
  }[i.kind]();
  return `Cursor: ${where}${here ? `, ${here.name}` : ''}. Enter: ${enter}. Esc puts it away.`;
}

// Between day and night the old picture fades out over the new one while the camera travels.
const fade = { cv: document.createElement('canvas'), until: 0, mode: viewMode() };
export function draw(alpha, now) {
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
    marks: night ? [...(ui.guide?.marks ? ui.guide.marks() : []), ...(ui.spot && ui.spot.until > now ? [ui.spot] : [])] : null,
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
  get tool() { return ui.tool; },
  get selected() { return ui.selected; },
  get watch() {
    const w = ui.watch;
    return w && { u: w.c.u, total: w.idx.total, playing: w.playing, speed: w.speed, done: w.c.done, marks: w.idx.marks.length, caption: w.caption, off: w.idx.off, differs: w.idx.differs };
  },
  get line() { return lineSpots(); },
  // The glass test's question on screen: its kind, its answer, and where each figure is on the still.
  get quiz() {
    const Q = ui.quiz;
    if (!Q || Q.done || !Q.img || Q.feedback) return null;
    const sc = Q.img.scene;
    return { i: Q.i, type: sc.type, cam: sc.cam, answer: sc.answer, figures: figuresOf(quizBase, sc).map((u) => ({ id: u.id, ...keepToStill(quizBase, sc, u.cx, u.cy, Q.img.h) })) };
  },
  room(type) {
    const r = roomSpan(K(), type);
    return r ? { f: r.f, x: Math.round((r.x0 + r.x1) / 2) } : null;
  },
};
