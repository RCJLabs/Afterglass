// Weeks 5–6 pixel pass: the keep by day, the dusk crossing, the Tain at night in both cameras, and a
// timed tap test for the plan's question: can players read the Tain on a phone?

import { WORLD, VIEW_H, ROOMS, MODES, SHOWCASE, toView, room, shadeBox, creeperBox, makeQuestion, makeQuiz, isRight, summarize, QUESTION_TYPES } from './px/scene.js';
import { drawDay, drawNight, drawCrossing, drawKey, markBox, crossingCaption, CROSSING_SECS, DAY_H } from './px/draw.js';
import { hex2rgb, tainRGB } from './px/lut.js';
import { P } from './px/kit.js';

const PREF_KEY = 'afterglass-pixel/prefs/v1';
const RUNS_KEY = 'afterglass-pixel/runs/v1';
const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
    } catch {
      // Storage blocked: results still show, they just aren't kept.
    }
  },
};
const prefs = { view: 'night', mode: 'reflection', labels: true, phone: false, ...(store.get(PREF_KEY) || {}) };
const savePrefs = () => store.set(PREF_KEY, prefs);

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const secs = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`);
const CAMERA = { reflection: 'Reflection', flipped: 'Flipped' };
const CAMERA_LONG = { reflection: 'Reflection (upside down, below the Veil)', flipped: 'Flipped (turned upright)' };
const TYPE_LABEL = { room: 'Find a room', dark: 'Shade in the dark', caught: 'Caught shade', unlit: 'Room with no candle', creeper: 'Find the Creeper', count: 'Count the shades' };
const VIEWS = [['day', 'Day'], ['crossing', 'Crossing'], ['night', 'Night'], ['test', 'Readability test']];

const canvas = document.getElementById('stage');
const wrap = document.getElementById('stage-wrap');
const labels = document.getElementById('labels');
const ui = { t0: performance.now(), crossAt: performance.now(), crossStage: 3, scale: 1, quiz: null, pref: null, notes: '', copied: '' };

/* ---------------------------------------------------------------- layout */

function scaleFor() {
  const fit = Math.max(1, Math.floor(wrap.clientWidth / WORLD.W));
  return prefs.phone || prefs.view === 'test' ? Math.min(3, fit) : Math.min(6, fit);
}
function layout() {
  const h = prefs.view === 'day' ? DAY_H : VIEW_H;
  canvas.width = WORLD.W;
  canvas.height = h;
  ui.scale = scaleFor();
  canvas.style.width = `${WORLD.W * ui.scale}px`;
  canvas.style.height = `${h * ui.scale}px`;
  wrap.classList.toggle('is-test', prefs.view === 'test');
  placeLabels();
}
function placeLabels() {
  const show = prefs.labels && prefs.view !== 'test' && prefs.view !== 'crossing';
  labels.hidden = !show;
  if (!show) return;
  const off = (wrap.clientWidth - WORLD.W * ui.scale) / 2;
  labels.innerHTML = ROOMS.map((r) => {
    const cx = r.x + r.w / 2;
    let top;
    if (prefs.view === 'day') top = r.y + 1;
    else {
      const a = toView(prefs.mode, cx, r.y).y;
      const b = toView(prefs.mode, cx, r.y + r.h - 1).y;
      top = Math.min(a, b) + 1;
    }
    return `<span style="left:${off + cx * ui.scale}px;top:${top * ui.scale}px">${esc(prefs.view === 'day' ? r.day : r.night)}</span>`;
  }).join('');
}

/* ---------------------------------------------------------------- header and side panels */

function hudHTML() {
  const camOn = prefs.view === 'crossing' || prefs.view === 'night';
  return `<div class="hud-top">
    <p class="brand">Afterglass<span>pixel pass, weeks 5–6</span></p>
    <div class="seg" role="group" aria-label="View">${VIEWS.map(([k, l]) => `<button class="btn sm" id="view-${k}" data-act="view" data-v="${k}" aria-pressed="${prefs.view === k}">${l}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Night camera">${MODES.map((m) => `<button class="btn sm" id="mode-${m}" data-act="mode" data-v="${m}" aria-pressed="${prefs.mode === m}"${camOn ? '' : ' disabled'}>${CAMERA[m]}</button>`).join('')}</div>
    <label class="row"><input type="checkbox" id="opt-labels" data-act="labels"${prefs.labels ? ' checked' : ''}${prefs.view === 'test' ? ' disabled' : ''}> Room names</label>
    <label class="row"><input type="checkbox" id="opt-phone" data-act="phone"${prefs.phone || prefs.view === 'test' ? ' checked' : ''}${prefs.view === 'test' ? ' disabled' : ''}> Phone size</label>
  </div>`;
}

function swatches() {
  const cols = Object.values(P).slice(0, 32);
  const row = (f) => cols.map((h) => `<span style="background:${f(h)}" title="${h}"></span>`).join('');
  const tain = (h) => `rgb(${tainRGB(...hex2rgb(h)).join(',')})`;
  return `<div class="swatches" aria-hidden="true">${row((h) => h)}</div><div class="swatches" aria-hidden="true">${row(tain)}</div>`;
}

function dayPanel() {
  return `<div class="card"><h2>Four room pairs</h2>
    <p>The whole Tain comes from one set of room art: the day keep turned upside down and recoloured through a palette lookup, plus one detail per twin.</p>
    <table class="pairs"><thead><tr><th>By day</th><th>By night</th><th>What changes</th></tr></thead><tbody>
      <tr><td>Chapel</td><td>Choir of Echoes</td><td>Echoes ring off the altar</td></tr>
      <tr><td>Granary</td><td>Hollow Granary</td><td>The stores are gone; only outlines</td></tr>
      <tr><td>Hearth</td><td>Cold Hearth</td><td>The fire burns blue and cold</td></tr>
      <tr><td>Crypt</td><td>Waking Room</td><td>The slab glows where the dead wake</td></tr>
    </tbody></table></div>
    <div class="card"><h2>The palette lookup</h2>
    <p>Top row: ENDESGA 32, the day palette. Bottom row: what each colour becomes in the Tain. Brightness picks a step on an 8-step violet ramp; warm lights take the brightest step.</p>
    ${swatches()}</div>`;
}

function crossingPanel(t) {
  const stages = ['Sunset', 'Lights out', 'The dead rise', 'At their posts'];
  const at = [0, 2.6, 4, 6.8];
  const now = at.filter((x) => t >= x).length - 1;
  return `<div class="card"><h2>Dusk: the Crossing</h2>
    <p>About ten seconds here; the design allows thirty. With the Flipped camera the view turns over at the end.</p>
    <ol class="stages">${stages.map((s, i) => `<li class="${i === now ? 'now' : ''}">${s}</li>`).join('')}</ol>
    <div class="row">${REDUCED ? '<button class="btn" id="btn-stage" data-act="stage">Next stage</button>' : ''}<button class="btn" id="btn-replay" data-act="replay">Replay</button></div></div>`;
}

function keyHTML() {
  return `<div class="keyrow">
    <figure><canvas width="16" height="16" data-key="shade"></canvas><figcaption>Shade: dark, with lit eyes</figcaption></figure>
    <figure><canvas width="16" height="16" data-key="creeper"></canvas><figcaption>Creeper: low, red eyes</figcaption></figure>
    <figure><canvas width="16" height="16" data-key="candle"></canvas><figcaption>Candle</figcaption></figure>
  </div>`;
}

function nightPanel() {
  return `<div class="card"><h2>Two night cameras</h2>
    <p><b>Reflection</b> shows the Tain as the world has it: under the Veil, upside down, the upper rooms hanging lowest. <b>Flipped</b> turns the same picture over so it reads upright. The UI never flips.</p>
    ${keyHTML()}
    <p class="hint">Tonight: Tam and Bran sing in the Choir of Echoes, Mira keeps the Cold Hearth, and Ada, new tonight, wakes beside Hesk in the Waking Room. The Hollow Granary has no candle, and a Creeper is in it; another prowls the dark end of the Cold Hearth.</p></div>`;
}

function testIntro() {
  const runs = store.get(RUNS_KEY) || [];
  return `<div class="card"><h2>Can players read the Tain on a phone?</h2>
    <p>Twelve quick questions about a night in the Tain, shown at phone size. Half use the Reflection camera and half the Flipped one, in a random order. Tap as fast as you can while still being right.</p>
    ${keyHTML()}
    <p>Every room is its day room's twin: the Choir of Echoes is the Chapel's, the Hollow Granary the Granary's, the Cold Hearth the Hearth's and the Waking Room the Crypt's. Look at the Day view first if you haven't.</p>
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Start the test</button></div>
    ${runs.length ? `<p class="hint">${runs.length} earlier run${runs.length === 1 ? '' : 's'} on this device.</p>` : ''}</div>`;
}

function testProgress() {
  const Q = ui.quiz;
  const p = Q.plan[Q.i];
  return `<div class="card"><h2>Question ${Q.i + 1} of ${Q.plan.length}</h2>
    <p class="progress">${esc(CAMERA_LONG[p.mode])}</p>
    <p>${esc(Q.q.prompt)}</p>
    ${Q.feedback ? `<p class="verdict ${Q.feedback.right ? 'right' : 'wrong'}">${Q.feedback.right ? 'Right' : 'Not that one'}, ${secs(Q.feedback.ms)}</p>` : ''}</div>`;
}

function testResults() {
  const Q = ui.quiz;
  const S = summarize(Q.results);
  const row = (m) => `<tr><td>${CAMERA_LONG[m]}</td><td>${S.byMode[m].right} of ${S.byMode[m].n}</td><td>${secs(S.byMode[m].medianMs)}</td></tr>`;
  const cell = (x) => (x ? `${x.right ? 'right' : 'wrong'}, ${secs(x.ms)}` : '—');
  return `<div class="card"><h2>Results</h2>
    <table class="pairs"><thead><tr><th>Camera</th><th>Right</th><th>Median time</th></tr></thead><tbody>${MODES.map(row).join('')}</tbody></table>
    <table class="pairs"><thead><tr><th>Question</th><th>Reflection</th><th>Flipped</th></tr></thead><tbody>${QUESTION_TYPES.map((k) => `<tr><td>${TYPE_LABEL[k]}</td><td>${cell(S.byType[k].reflection)}</td><td>${cell(S.byType[k].flipped)}</td></tr>`).join('')}</tbody></table>
    <p>Which camera was easier to read?</p>
    <div class="row">${[['reflection', 'Reflection'], ['flipped', 'Flipped'], ['same', 'No difference']].map(([k, l]) => `<button class="btn sm" id="pref-${k}" data-act="pref" data-v="${k}" aria-pressed="${ui.pref === k}">${l}</button>`).join('')}</div>
    <label for="notes">Notes</label>
    <textarea id="notes" rows="3" placeholder="What was hard to see? Which view did you have to think about?">${esc(ui.notes)}</textarea>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy results</button><button class="btn" id="btn-again" data-act="start">Take it again</button><span class="hint">${esc(ui.copied)}</span></div>
    <p class="hint">A small sample: one run is twelve taps. The export includes your screen size and the scale the Tain was drawn at.</p></div>`;
}

let sideKey = '';
function renderSide(force = false) {
  const t = (performance.now() - ui.crossAt) / 1000;
  const Q = ui.quiz;
  const key = [prefs.view, prefs.mode, Q ? `${Q.i}-${Q.done}-${!!Q.feedback}-${ui.pref}-${ui.copied}` : '', prefs.view === 'crossing' ? crossingCaption(Math.min(t, CROSSING_SECS)) : ''].join('|');
  if (!force && key === sideKey) return;
  const a = document.activeElement;
  if (!force && a && a.id === 'notes') return;
  sideKey = key;
  const side = document.getElementById('side');
  side.innerHTML = prefs.view === 'day' ? dayPanel()
    : prefs.view === 'crossing' ? crossingPanel(Math.min(t, CROSSING_SECS))
    : prefs.view === 'night' ? nightPanel()
    : !Q ? testIntro() : Q.done ? testResults() : testProgress();
  for (const cv of side.querySelectorAll('canvas[data-key]')) drawKey(cv, cv.dataset.key, 0);
  renderAnswers();
}
function renderHud() {
  document.getElementById('hud').innerHTML = hudHTML();
}
function renderAnswers() {
  const el = document.getElementById('answers');
  const Q = ui.quiz;
  if (prefs.view !== 'test' || !Q || Q.done || Q.feedback) {
    el.innerHTML = '';
    return;
  }
  const count = 'count' in Q.q.answer;
  el.innerHTML = `${count ? [0, 1, 2, 3, 4].map((n) => `<button class="btn" id="ans-${n}" data-act="count" data-n="${n}">${n}</button>`).join('') : ''}<button class="btn" id="btn-skip-q" data-act="cant">Can't tell</button>`;
}

/* ---------------------------------------------------------------- the test */

function startQuiz() {
  const seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  ui.quiz = { seed, plan: makeQuiz(seed), i: 0, results: [], q: null, shownAt: 0, feedback: null, done: false };
  ui.pref = null;
  ui.notes = '';
  ui.copied = '';
  nextQuestion();
}
function nextQuestion() {
  const Q = ui.quiz;
  if (Q.i >= Q.plan.length) {
    Q.done = true;
    Q.q = null;
    saveRun();
    renderSide(true);
    return;
  }
  const p = Q.plan[Q.i];
  Q.q = makeQuestion(p.seed, p.type);
  Q.feedback = null;
  Q.shownAt = performance.now();
  renderSide(true);
}
function answer(tap) {
  const Q = ui.quiz;
  if (!Q || Q.done || Q.feedback || !Q.q) return;
  const p = Q.plan[Q.i];
  const ms = Math.round(performance.now() - Q.shownAt);
  const right = tap ? isRight(Q.q, p.mode, tap) : false;
  Q.results.push({ i: Q.i, type: p.type, mode: p.mode, seed: p.seed, right, ms, tap: tap || null, answer: Q.q.answer });
  Q.feedback = { right, ms, until: performance.now() + (right ? 600 : 1100) };
  renderSide(true);
}
function targetBox(q) {
  if (q.answer.room) return room(q.answer.room);
  if (q.answer.shade) return shadeBox(q.scene.shades.find((s) => s.id === q.answer.shade));
  if (q.answer.creeper) return creeperBox(q.scene.creepers.find((c) => c.id === q.answer.creeper));
  return null;
}
function runExport() {
  const Q = ui.quiz;
  return {
    game: 'afterglass-pixel', test: 'can players read the Tain on a phone?', exported: new Date().toISOString(), seed: Q.seed,
    results: Q.results, summary: summarize(Q.results), preference: ui.pref, notes: ui.notes,
    screen: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1, scale: ui.scale },
  };
}
function saveRun() {
  const runs = store.get(RUNS_KEY) || [];
  runs.push(runExport());
  store.set(RUNS_KEY, runs.slice(-50));
}
function copyResults() {
  const text = JSON.stringify({ current: runExport(), earlierRuns: (store.get(RUNS_KEY) || []).length }, null, 1);
  const done = (msg) => {
    ui.copied = msg;
    renderSide(true);
  };
  try {
    navigator.clipboard.writeText(text).then(() => done('Copied.'), () => done('Copying was blocked in this browser.'));
  } catch {
    done('Copying was blocked in this browser.');
  }
}

/* ---------------------------------------------------------------- frames */

function frame(now) {
  const t = REDUCED ? 1 : (now - ui.t0) / 1000;
  const caption = document.getElementById('caption');
  if (prefs.view === 'day') {
    drawDay(canvas, t);
    caption.innerHTML = 'By day. The Tain lies under the Veil, the waterline, as a dim reflection.';
  } else if (prefs.view === 'night') {
    drawNight(canvas, SHOWCASE, prefs.mode, t, { still: REDUCED });
    caption.innerHTML = `Night, <b>${CAMERA_LONG[prefs.mode].toLowerCase()}</b>.`;
  } else if (prefs.view === 'crossing') {
    const ct = REDUCED ? [1.8, 3.6, 5.6, CROSSING_SECS][ui.crossStage] : Math.min(CROSSING_SECS, (now - ui.crossAt) / 1000);
    drawCrossing(canvas, ct, prefs.mode, SHOWCASE);
    caption.textContent = crossingCaption(ct);
    renderSide();
  } else {
    const Q = ui.quiz;
    const q = Q && Q.q;
    if (q) {
      const p = Q.plan[Q.i];
      drawNight(canvas, q.scene, p.mode, t, { still: REDUCED });
      caption.innerHTML = `<b>${esc(q.prompt)}</b>`;
      if (Q.feedback) {
        const box = targetBox(q);
        if (box) markBox(canvas, p.mode, box, Q.feedback.right ? '#6fd097' : '#ffffff');
        if (now >= Q.feedback.until) {
          Q.i++;
          nextQuestion();
        }
      }
    } else {
      drawNight(canvas, SHOWCASE, 'reflection', t, { still: true });
      caption.textContent = Q && Q.done ? 'Done. Your results are beside the picture.' : 'Twelve questions at phone size.';
    }
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- input */

function setView(v) {
  prefs.view = v;
  savePrefs();
  if (v === 'crossing') ui.crossAt = performance.now();
  renderHud();
  layout();
  renderSide(true);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input, textarea')) return;
  const act = el.dataset.act;
  if (act === 'view') setView(el.dataset.v);
  else if (act === 'mode') {
    prefs.mode = el.dataset.v;
    savePrefs();
    if (prefs.view === 'crossing') ui.crossAt = performance.now();
    renderHud();
    placeLabels();
    renderSide(true);
  } else if (act === 'replay') {
    ui.crossAt = performance.now();
    ui.crossStage = 0;
    renderSide(true);
  } else if (act === 'stage') {
    ui.crossStage = (ui.crossStage + 1) % 4;
    renderSide(true);
  } else if (act === 'start') {
    if (prefs.view !== 'test') setView('test');
    startQuiz();
  } else if (act === 'count') answer({ count: Number(el.dataset.n) });
  else if (act === 'cant') answer(null);
  else if (act === 'pref') {
    ui.pref = el.dataset.v;
    const runs = store.get(RUNS_KEY) || [];
    if (runs.length) {
      runs[runs.length - 1].preference = ui.pref;
      store.set(RUNS_KEY, runs);
    }
    renderSide(true);
  } else if (act === 'copy') copyResults();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.act === 'labels') {
    prefs.labels = el.checked;
    savePrefs();
    placeLabels();
  } else if (el.dataset.act === 'phone') {
    prefs.phone = el.checked;
    savePrefs();
    layout();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'notes') return;
  ui.notes = e.target.value;
  const runs = store.get(RUNS_KEY) || [];
  if (runs.length) {
    runs[runs.length - 1].notes = ui.notes;
    store.set(RUNS_KEY, runs);
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (prefs.view !== 'test') return;
  const box = canvas.getBoundingClientRect();
  answer({ x: (e.clientX - box.left) / ui.scale, y: (e.clientY - box.top) / ui.scale });
});
if ('ResizeObserver' in window) new ResizeObserver(layout).observe(wrap);
window.addEventListener('resize', layout);

renderHud();
layout();
renderSide(true);
requestAnimationFrame(frame);
