// Weeks 3–4 greybox UI: the Tain drawn as plain shapes on a canvas, with the controls around it.
// Like ui.js it changes the game only through actNight(), so every session can be replayed.

import { TICKS_PER_SEC } from './data.js';
import { W, FLOORS, BOTTOM, STAIRS, RIFTS, VEIL_MIRRORS, NIGHT_KINDS, WORK_ROOM, REST_ROOM } from './night-data.js';
import { newNightGame, stepNight, actNight, nightTicks, lightMap, isLit, roomAt, roomName, byId, NIGHT_SAVE } from './night.js';

const SAVE_KEY = 'afterglass-night/save/v1';
const PREF_KEY = 'afterglass-night/prefs/v1';
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
      // Storage blocked or full: the night still runs, it just won't resume after a reload.
    }
  },
};

const prefs = { speed: 1, tab: 'nights', autoPause: true, introDone: false, notes: '', ...(store.get(PREF_KEY) || {}) };
const savePrefs = () => store.set(PREF_KEY, prefs);

function loadGame() {
  const g = store.get(SAVE_KEY);
  if (!g || g.v !== NIGHT_SAVE || g.mode !== 'night' || !Array.isArray(g.shades)) return null;
  g.alerts = [];
  return g;
}
const saveGame = () => store.set(SAVE_KEY, { ...s, alerts: [] });

let s = loadGame() || newNightGame();
const ui = { paused: true, rev: 0, tool: 'candle', selected: null, hover: null, toasts: [], toastRev: 0, confirmNew: false, copied: '', showExport: false };
const bump = () => {
  ui.rev++;
};

/* ---------------------------------------------------------------- words */

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const fmt = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const PH = { dusk: 'is-dusk', night: 'is-night', dawn: 'is-rite', over: 'is-fallen' };
const RATING = ['', 'A chore', 'Flat', 'Fine', 'Good', 'Gripping'];

function hhmm(h) {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.floor(((x - hh) * 60) / 10) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
const clockText = () => (s.phase === 'night' ? hhmm(18 + (12 * s.t) / nightTicks(s)) : s.phase === 'dusk' ? '18:00' : '06:00');
const phaseLabel = () => ({ dusk: `Dusk, night ${s.night}`, night: `Night ${s.night}`, dawn: `Dawn after night ${s.night}`, over: 'Lost' })[s.phase];
const pips = (n, max) => `<span class="pips${n >= max - 1 ? ' hot' : ''}" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

function statusOf(d, L) {
  if (d.grabbedBy) return 'caught!';
  if (d.climb) return 'on the stairs';
  if (d.path.length) return `walking to the ${roomName(d.post.f, d.post.x)}`;
  const room = roomAt(d.f, d.x);
  if (!isLit(L, d.f, d.x)) return `in the dark, ${room[1]}`;
  if (s.phase === 'night' && s.creepers.some((c) => c.f === d.f && Math.abs(c.x - d.x) <= s.tuning.reach + 0.5)) return 'fighting';
  if (room[0] === WORK_ROOM) return 'singing in the Choir';
  if (room[0] === REST_ROOM) return 'resting at the Cold Hearth';
  return `holding the light, ${room[1]}`;
}

/* ---------------------------------------------------------------- panels */

function hudHTML() {
  const running = s.phase === 'night' && !ui.paused;
  const T = s.tuning;
  return `<div class="hud-top">
    <p class="brand">Afterglass<span>night greybox, weeks 3–4</span></p>
    <div class="clock ${PH[s.phase]}"><span class="pill">${phaseLabel()}</span><span class="time" data-live="clock">${clockText()}</span><span class="bar" aria-hidden="true"><i data-bar="night"></i></span></div>
    <div class="controls">
      <button class="btn" id="btn-play" data-act="play"${s.phase === 'night' ? '' : ' disabled'}>${running ? 'Pause' : 'Play'}</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map((v) => `<button class="btn" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`).join('')}</div>
    </div>
  </div>
  <dl class="res">
    <div><dt>Candles</dt><dd><b>${s.candlesLeft}</b> in hand</dd></div>
    <div><dt>Essence</dt><dd><b data-live="essence">${Math.floor(s.essence)}</b></dd></div>
    <div><dt>Remembrance</dt><dd><b>${Math.floor(s.remembrance)}</b></dd></div>
    <div><dt>Veil</dt><dd>${pips(s.cracks, T.cracksMax)} <b>${s.cracks}</b>/${T.cracksMax}</dd></div>
    <div><dt>Shades</dt><dd><b>${s.shades.length}</b>/${T.capacity}</dd></div>
    <div><dt>Creepers</dt><dd><b data-live="creepers">${s.creepers.length}</b> out, <b data-live="to-come">${s.spawns.length}</b> to come</dd></div>
  </dl>`;
}

function toolsHTML() {
  const active = s.phase === 'dusk' || s.phase === 'night';
  const tool = (id, label, key) =>
    `<button class="btn sm" id="tool-${id}" data-act="tool" data-tool="${id}" aria-pressed="${ui.tool === id}"${active ? '' : ' disabled'}>${label}<kbd>${key}</kbd></button>`;
  return `${tool('candle', `Candle (${s.candlesLeft})`, 'C')}${tool('guide', 'Guide', 'G')}${tool('ward', `Ward, ${s.tuning.wardCost} essence`, 'W')}<span class="sep" aria-hidden="true"></span><button class="btn sm" id="btn-hush" data-act="hush" aria-pressed="${s.hush}"${s.phase === 'night' ? '' : ' disabled'}>Hush<kbd>H</kbd></button>`;
}

function hintText() {
  if (s.phase === 'dawn') return 'Dawn. Spend remembrance on the shades, rate the night, then go on to dusk.';
  if (s.phase === 'over') return 'This keep is lost.';
  const d = byId(s.shades, ui.selected);
  if (ui.tool === 'candle') {
    return s.candlesLeft
      ? `Tap a floor to set a candle (${s.candlesLeft} left). The Unlit can't enter its light, which shrinks as it burns.`
      : 'No candles left tonight. Switch to Guide to move shades.';
  }
  if (ui.tool === 'ward') return `Tap a stair, or a rift on the bottom floor, to seal it until dawn for ${s.tuning.wardCost} essence. A sealed rift sends its Creepers to another.`;
  if (!d) return 'Tap a shade to pick it, then tap where it should go.';
  return s.phase === 'dusk'
    ? `${d.name}: tap a spot to place ${d.name} there.`
    : `${d.name}: tap a spot to send ${d.name} there. Shades walk, and the dark between is dangerous.`;
}

function introHTML() {
  return `<div class="card intro">
    <h2>What this greybox tests</h2>
    <p>Weeks 3–4 of the Afterglass plan: the night on its own, with no day. The question is <b>is the night fun without the day?</b></p>
    <ul>
      <li><b>The Tain</b> is the keep flipped: the Veil and its mirrors at the top, the Deep and its rifts at the bottom.</li>
      <li><b>Creepers</b> climb from the rifts. Some hunt candles; the rest make for the mirrors. Each one through a mirror cracks the Veil. Five cracks and the keep is lost.</li>
      <li><b>Candles</b> make light the Unlit can't enter. They gnaw at its edge, and light shrinks as a candle burns.</li>
      <li><b>Shades</b> in light fight at its edge on their own. In the dark they get caught and drained. Singers in a lit Choir make essence for wards.</li>
      <li><b>Dawn</b> fades every shade a little. Spend remembrance to name or remember them, then rate the night.</li>
    </ul>
    <div class="row"><button class="btn primary" id="btn-intro" data-act="intro-close">Got it</button></div>
  </div>`;
}

function duskPanel() {
  const L = lightMap(s);
  const inDark = s.shades.filter((d) => !isLit(L, d.f, d.x));
  const singers = s.shades.filter((d) => isLit(L, d.f, d.x) && roomAt(d.f, d.x)[0] === WORK_ROOM);
  return `<header class="ph-head"><h2>Dusk, night ${s.night}</h2><p>${plural(s.spawns.length, 'Creeper')} will climb out of the Deep before dawn. Set candles and place the shades, then begin the night.</p></header>
    <ul class="facts">
      <li><span>Candles set</span><b class="num">${s.candles.length} of ${s.candles.length + s.candlesLeft}</b></li>
      <li><span>Singers in a lit Choir of Echoes</span><b class="num">${singers.length}</b></li>
      <li><span>Shades left in the dark</span><b class="num">${inDark.length}</b></li>
    </ul>
    ${inDark.length ? `<p class="note">${esc(listOf(inDark.map((d) => d.name)))} ${inDark.length === 1 ? 'is' : 'are'} in the dark, where Creepers can catch them.</p>` : ''}
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Begin the night</button></div>`;
}

function nightPanel() {
  const caught = s.shades.filter((d) => d.grabbedBy);
  return `<header class="ph-head"><h2>Night ${s.night}</h2><p>Hold the light until dawn. Drop a candle on a caught shade to free it, send fighters where the edge is gnawed, and ward what you can't hold.</p></header>
    <ul class="facts">
      <li><span>Creepers out so far</span><b class="num" data-live="t-spawned">${s.tonight.spawned}</b></li>
      <li><span>Cut down</span><b class="num" data-live="t-killed">${s.tonight.killed}</b></li>
      <li><span>Through the Veil</span><b class="num">${s.tonight.crossed}</b></li>
      <li><span>Shades caught</span><b class="num">${s.tonight.grabbed}</b></li>
      <li><span>Essence sung tonight</span><b class="num" data-live="t-essence">${fmt(s.tonight.essence)}</b></li>
    </ul>
    ${caught.map((d) => `<p class="note bad">${esc(d.name)} is caught in the ${esc(roomName(d.f, d.x))}. Drop a candle on the spot or send a fighter.</p>`).join('')}
    ${s.hush ? '<p class="note">Hushed: no singing, no fighting, and the Unlit pass the shades by.</p>' : ''}`;
}

function dawnPanel() {
  const T = s.tuning;
  const last = s.nights[s.nights.length - 1];
  const rows = last.fading
    .map((f) => `<li><span>${esc(f.name)}${f.rested ? ', rested' : ''}</span><span class="num">−${fmt(f.fade)}${f.drained ? `, −${fmt(f.drained)} drained` : ''} → ${fmt(Math.max(0, f.memory))}</span></li>`)
    .join('');
  return `<header class="ph-head"><h2>Dawn after night ${last.night}</h2><p>The Unlit withdraw and the candles are out. Each night a shade loses ${T.fadePerNight} memory, or half that if it is named or rested in a lit Cold Hearth. At zero it is gone.</p></header>
    <div class="card"><h3>Tonight</h3>
      <p>${plural(last.spawned, 'Creeper')}, ${last.killed} cut down, ${last.crossed} through the Veil, ${plural(last.grabbed, 'shade')} caught, ${fmt(last.essence)} essence sung.</p>
      <ul class="fadelist">${rows}</ul>
      ${last.lost.length ? `<p class="note bad">Lost: ${esc(listOf(last.lost))}.</p>` : ''}
    </div>
    <p class="note">Remembrance: <b>${Math.floor(s.remembrance)}</b>. In the shade list: name a shade (${T.nameCost}) to halve its fading for good, remember one (${T.rememberCost}) for +${T.rememberGain} memory, or cover its mirror to release it (+${T.releaseGain}).</p>
    <div class="rating" role="group" aria-label="How was that night?"><span>Playtest: that night was</span>${[1, 2, 3, 4, 5]
      .map((n) => `<button class="btn sm" id="rate-${n}" data-act="rate" data-n="${n}" aria-pressed="${last.rating === n}">${n} ${RATING[n].toLowerCase()}</button>`)
      .join('')}</div>
    <div class="row"><button class="btn primary" id="btn-next" data-act="next">Go to dusk on night ${s.night + 1}</button></div>`;
}

function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New keep</button></div>';
  return `<div class="confirm"><p>Start over from night 1? This replaces the saved nights. Copy the playtest export first if you want it.</p>
    <div class="row"><button class="btn primary" id="btn-new-yes" data-act="new-yes">Start over</button><button class="btn" id="btn-new-no" data-act="new-no">Cancel</button></div></div>`;
}

function overPanel() {
  const why = s.over?.reason === 'veil' ? 'The Veil broke.' : 'The glass is empty.';
  const rated = s.nights.filter((n) => n.rating);
  return `<header class="ph-head"><h2>The keep is lost</h2><p>${why} You held ${plural(Math.max(0, s.night - 1), 'night')} before this one.${rated.length ? ` Your average rating: ${fmt(rated.reduce((a, n) => a + n.rating, 0) / rated.length)} of 5.` : ''}</p></header>
    <p class="note">Rate the last nights in the Nights tab and copy the export from the Playtest tab before starting over.</p>
    ${newKeepControls()}`;
}

function phaseHTML() {
  const panel = { dusk: duskPanel, night: nightPanel, dawn: dawnPanel, over: overPanel }[s.phase];
  return (prefs.introDone ? '' : introHTML()) + panel();
}

function shadesHTML() {
  const T = s.tuning;
  const L = lightMap(s);
  const row = (d) => {
    const K = NIGHT_KINDS[d.kind];
    const acts =
      s.phase === 'dawn'
        ? `<button class="btn sm" id="name-${d.id}" data-act="name" data-id="${d.id}"${d.named || s.remembrance + 1e-9 < T.nameCost ? ' disabled' : ''}>Name, ${T.nameCost}</button>
           <button class="btn sm" id="rem-${d.id}" data-act="remember" data-id="${d.id}"${d.memory >= 100 || s.remembrance + 1e-9 < T.rememberCost ? ' disabled' : ''}>Remember, ${T.rememberCost}</button>
           <button class="btn sm" id="rel-${d.id}" data-act="release" data-id="${d.id}">Release, +${T.releaseGain}</button>`
        : `<button class="btn sm" id="sel-${d.id}" data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}"${s.phase === 'over' ? ' disabled' : ''}>Select</button>`;
    return `<div class="srow${ui.selected === d.id ? ' is-selected' : ''}" id="srow-${d.id}">
      <div class="who">
        <div><b>${esc(d.name)}</b><span class="kind k-${d.kind}">${K.name}</span>${d.named ? '<span class="tag peace">Named</span>' : ''}</div>
        <div><span class="memory${d.memory < 30 ? ' low' : ''}" aria-hidden="true"><i data-bar="mem" data-arg="${d.id}"></i></span><small><span data-live="mem" data-arg="${d.id}">${Math.ceil(d.memory)}</span> memory, <span data-live="status" data-arg="${d.id}">${esc(statusOf(d, L))}</span></small></div>
      </div>
      <div class="acts">${acts}</div>
    </div>`;
  };
  return `<div class="roster-head"><h2>The shades</h2><span class="count">${s.shades.length}</span><p>Loyal shades fight hardest and Serene ones sing best. Memory weakens both.</p></div>
    <div class="rows">${s.shades.map(row).join('') || '<p class="empty" style="padding:12px">The glass is empty.</p>'}</div>`;
}

function nightsTab() {
  if (!s.nights.length) return '<p class="hint">Each night gets a row here: Creepers, kills, crossings, catches, memory drained, essence, shades lost and your rating.</p>';
  const rows = [...s.nights]
    .reverse()
    .map((n) => `<tr><td class="num">${n.night}</td><td class="num">${n.spawned}</td><td class="num">${n.killed}</td><td class="num">${n.crossed}</td><td class="num">${n.grabbed}</td><td class="num">${fmt(n.drained)}</td><td class="num">${fmt(n.essence)}</td><td>${n.lost.length ? esc(n.lost.join(', ')) : '—'}</td><td class="num">${n.actions}</td>
      <td><select id="nrate-${n.night}" data-act="rate-select" data-night="${n.night}" aria-label="Rating for night ${n.night}"><option value="">Not rated</option>${[1, 2, 3, 4, 5].map((k) => `<option value="${k}"${n.rating === k ? ' selected' : ''}>${k}, ${RATING[k].toLowerCase()}</option>`).join('')}</select></td></tr>`)
    .join('');
  return `<p class="hint">Newest first. <b>Actions</b> counts what you did during dusk and the night: a low count on a long night can mean the night asked nothing of you.</p>
    <div class="table-wrap" id="nights-wrap"><table class="ledger nights"><thead><tr><th>Night</th><th>Creepers</th><th>Cut down</th><th>Through</th><th>Caught</th><th>Drained</th><th>Essence</th><th>Lost</th><th>Actions</th><th>Rating</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function logTab() {
  const when = (l) => `${l.phase} ${l.night}`;
  return `<ul class="log" id="log">${s.log.slice(-250).reverse().map((l) => `<li><span class="when">${when(l)}</span><span class="${l.tone}">${esc(l.text)}</span></li>`).join('')}</ul>`;
}
function exportJSON() {
  return JSON.stringify({ game: 'afterglass-night', save: NIGHT_SAVE, exported: new Date().toISOString(), seed: s.seed, night: s.night, phase: s.phase, notes: prefs.notes, tuning0: s.tuning0, tuning: s.tuning, nights: s.nights, actions: s.actions }, null, 1);
}
function playtestTab() {
  const rated = s.nights.filter((n) => n.rating);
  return `<p>The question for weeks 3–4: <b>is the night fun without the day?</b> Rate each night at dawn or in the Nights tab. ${rated.length ? `So far: ${rated.map((n) => n.rating).join(', ')}.` : 'No ratings yet.'}</p>
    <label for="notes">Session notes</label>
    <textarea id="notes" rows="4" placeholder="When were you busiest? When were you waiting? What did you wish you could do?">${esc(prefs.notes)}</textarea>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy playtest export</button><button class="btn" id="btn-show-export" data-act="show-export" aria-expanded="${ui.showExport}">${ui.showExport ? 'Hide export' : 'Show export'}</button><span class="hint">${esc(ui.copied)}</span></div>
    ${ui.showExport ? `<label for="export">Export (JSON)</label><textarea id="export" rows="8" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">The export holds your notes, every night's numbers and rating, the seed and every action, so a session replays exactly with <code>replayNight()</code> in <code>src/night.js</code>.</p>`;
}
const TUNE = [
  ['nightSecs', 'Night length, seconds at 1×'],
  ['candles', 'Candles each dusk'],
  ['creepersBase', 'Creepers on night 0'],
  ['creepersPerNight', 'Creepers added per night'],
  ['snuffShare', 'Share of Creepers that hunt candles'],
  ['gnawRate', 'Wax a gnawing Creeper eats per second'],
  ['drainPerSec', 'Memory a caught shade loses per second'],
  ['fadePerNight', 'Memory every shade loses per night'],
  ['essencePerSec', 'Essence per singer per second'],
  ['cracksMax', 'Veil cracks that lose the keep'],
];
function settingsTab() {
  return `<div class="fields">${TUNE.map(([k, label]) => `<label for="tune-${k}">${esc(label)}<input type="number" id="tune-${k}" data-act="tune" data-key="${k}" value="${s.tuning[k]}" min="0" step="any"></label>`).join('')}</div>
    <p class="hint">Changes apply from the next tick or the next dusk, and are recorded so exports still replay.</p>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause when a shade is caught</label>
    <p class="hint">Seed ${s.seed}. Keys: C candle, G guide, W ward, H hush, space to play or pause, 1, 2 and 4 for speed.</p>
    ${newKeepControls()}`;
}
const TABS = [['nights', 'Nights'], ['log', 'Log'], ['playtest', 'Playtest'], ['settings', 'Settings']];
function recordsHTML() {
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'nights';
  const body = { nights: nightsTab, log: logTab, playtest: playtestTab, settings: settingsTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tabpanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}

/* ---------------------------------------------------------------- the stage */

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const G = { cw: 0, ch: 0, tile: 0, fh: 0, veil: 26, deep: 28, dpr: 1 };
const top = (f) => G.veil + f * G.fh;
const ground = (f) => G.veil + (f + 1) * G.fh - 6;
const COL = {
  bg: '#0b0a12', veil: '#150f1d', veilLine: '#c2458f', mirror: '#e28bbf', room: '#131020', roomEdge: '#29243d',
  label: '#8a83aa', floor: '#3a3452', light: '255, 196, 102', flame: '#ffcf6e', stair: '#4f4970', ward: '#4ccdbf',
  rift: '#ff5a4d', deep: '#07060b', shade: '#b8a7f6', shadeInk: '#16122a', low: '#ff7d6c', sel: '#ffffff', creeper: '#030205',
  eye: '#ff5a4d', burn: '#ffb347',
};

function layout() {
  const box = document.getElementById('stage-box');
  const cw = Math.max(280, box.clientWidth);
  G.cw = cw;
  G.tile = cw / W;
  G.fh = Math.round(Math.max(46, Math.min(64, G.tile * 2.2)));
  G.ch = G.veil + FLOORS.length * G.fh + G.deep;
  G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.style.height = `${G.ch}px`;
  canvas.width = Math.round(cw * G.dpr);
  canvas.height = Math.round(G.ch * G.dpr);
}

function unitPos(u, alpha) {
  const t = G.tile;
  if (u.climb > 0 && u.path[0]?.climb) {
    const k = Math.min(1, (u.climbTotal - u.climb + alpha) / u.climbTotal);
    return { x: u.x * t, y: ground(u.f) + (ground(u.path[0].f) - ground(u.f)) * k };
  }
  const x = u.of === u.f ? u.ox + (u.x - u.ox) * alpha : u.x;
  return { x: x * t, y: ground(u.f) };
}

function draw(alpha, now) {
  const t = G.tile;
  const c = ctx;
  c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  c.fillStyle = COL.bg;
  c.fillRect(0, 0, G.cw, G.ch);
  const L = lightMap(s);
  const labelSize = Math.max(9, Math.min(12, t * 0.45));

  // The Veil and its mirrors.
  c.fillStyle = COL.veil;
  c.fillRect(0, 0, G.cw, G.veil);
  for (const m of VEIL_MIRRORS) {
    c.fillStyle = '#2a1830';
    c.strokeStyle = COL.mirror;
    c.lineWidth = 1;
    c.fillRect(m.x * t - t * 0.6, 5, t * 1.2, G.veil - 9);
    c.strokeRect(m.x * t - t * 0.6 + 0.5, 5.5, t * 1.2 - 1, G.veil - 10);
  }
  c.fillStyle = COL.veilLine;
  c.fillRect(0, G.veil - 2, G.cw, 2);
  c.strokeStyle = COL.veilLine;
  c.lineWidth = 1.5;
  for (let i = 0; i < s.cracks; i++) {
    const x = ((i + 0.5) / s.tuning.cracksMax) * G.cw;
    c.beginPath();
    c.moveTo(x - 6, G.veil - 12);
    c.lineTo(x - 1, G.veil - 5);
    c.lineTo(x + 3, G.veil - 10);
    c.lineTo(x + 7, G.veil - 1);
    c.stroke();
  }

  // Rooms.
  c.font = `600 ${labelSize}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  c.textBaseline = 'top';
  for (let f = 0; f < FLOORS.length; f++) {
    for (const [, name, a, b] of FLOORS[f]) {
      c.fillStyle = COL.room;
      c.fillRect(a * t, top(f) + 1, (b - a) * t, G.fh - 2);
      c.strokeStyle = COL.roomEdge;
      c.lineWidth = 1;
      c.strokeRect(a * t + 0.5, top(f) + 1.5, (b - a) * t - 1, G.fh - 3);
      c.save();
      c.beginPath();
      c.rect(a * t + 3, top(f) + 2, (b - a) * t - 6, labelSize + 4);
      c.clip();
      c.fillStyle = COL.label;
      c.fillText(name, a * t + 5, top(f) + 4);
      c.restore();
    }
    c.fillStyle = COL.floor;
    c.fillRect(0, ground(f) + 1, G.cw, 2);
  }

  // Light, brightest at the candle.
  for (let f = 0; f < FLOORS.length; f++) {
    for (const [a, b, id] of L.spans[f]) {
      const k = byId(s.candles, id);
      if (!k) continue;
      const gnawed = s.creepers.some((x) => x.gnawing && x.gnaw === id);
      const flick = gnawed && !REDUCED ? 0.75 + 0.25 * Math.sin(now / 60 + k.x) : 1;
      const g = c.createLinearGradient(a * t, 0, b * t, 0);
      const mid = Math.max(0, Math.min(1, (k.x - a) / Math.max(0.01, b - a)));
      g.addColorStop(0, `rgba(${COL.light}, ${0.1 * flick})`);
      g.addColorStop(mid, `rgba(${COL.light}, ${0.32 * flick})`);
      g.addColorStop(1, `rgba(${COL.light}, ${0.1 * flick})`);
      c.fillStyle = g;
      c.fillRect(a * t, top(f) + 1, (b - a) * t, G.fh - 2);
    }
  }

  // Where a candle would light, under the pointer.
  if (ui.hover && ui.tool === 'candle' && s.candlesLeft && (s.phase === 'dusk' || s.phase === 'night')) {
    const [, , a, b] = roomAt(ui.hover.f, ui.hover.x);
    const lo = Math.max(a, ui.hover.x - s.tuning.lightMax);
    const hi = Math.min(b, ui.hover.x + s.tuning.lightMax);
    c.strokeStyle = `rgba(${COL.light}, 0.6)`;
    c.setLineDash([4, 3]);
    c.strokeRect(lo * t + 0.5, top(ui.hover.f) + 3.5, (hi - lo) * t - 1, G.fh - 7);
    c.setLineDash([]);
  }

  // Stairs.
  for (const st of STAIRS) {
    const warded = s.wards.includes(st.id);
    c.strokeStyle = warded ? COL.ward : COL.stair;
    c.lineWidth = warded ? 3 : 2;
    c.setLineDash(warded ? [] : [3, 3]);
    c.beginPath();
    c.moveTo(st.x * t, ground(st.f));
    c.lineTo(st.x * t, ground(st.f + 1));
    c.stroke();
    c.setLineDash([]);
    if (warded) diamond(c, st.x * t, (ground(st.f) + ground(st.f + 1)) / 2, 5, COL.ward);
  }

  // The Deep and its rifts.
  c.fillStyle = COL.deep;
  c.fillRect(0, G.ch - G.deep, G.cw, G.deep);
  for (const r of RIFTS) {
    const warded = s.wards.includes(r.id);
    const x = r.x * t;
    c.strokeStyle = warded ? COL.ward : COL.rift;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - t, ground(BOTTOM) + 2);
    c.lineTo(x - t * 0.4, ground(BOTTOM) + 9);
    c.lineTo(x + t * 0.2, ground(BOTTOM) + 4);
    c.lineTo(x + t, ground(BOTTOM) + 12);
    c.stroke();
    c.fillStyle = warded ? COL.ward : COL.rift;
    c.font = `600 ${Math.max(9, labelSize - 1)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    c.fillText(warded ? 'sealed' : 'rift', x - t * 0.8, G.ch - G.deep + 12);
  }

  // Candles.
  for (const k of s.candles) {
    const x = k.x * t;
    const y = ground(k.f);
    const size = 1.8 + 2 * Math.max(0.2, k.wax / k.max);
    c.fillStyle = '#d8c9a8';
    c.fillRect(x - 1.5, y - 6, 3, 6);
    c.fillStyle = COL.flame;
    c.beginPath();
    c.arc(x, y - 7 - size / 2, size, 0, Math.PI * 2);
    c.fill();
  }

  // Creepers.
  for (const k of s.creepers) {
    const p = unitPos(k, alpha);
    const w = Math.max(7, t * 0.62);
    const jitter = k.gnawing && !REDUCED ? Math.sin(now / 40 + p.x) * 1.2 : 0;
    const burning = !k.climb && isLit(L, k.f, k.x);
    c.fillStyle = COL.creeper;
    c.strokeStyle = burning ? COL.burn : COL.eye;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(p.x - w / 2 + jitter, p.y);
    c.lineTo(p.x + w / 2 + jitter, p.y);
    c.lineTo(p.x + jitter, p.y - w * 1.15);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = COL.eye;
    c.fillRect(p.x - 2.5 + jitter, p.y - w * 0.55, 1.6, 1.6);
    c.fillRect(p.x + 1 + jitter, p.y - w * 0.55, 1.6, 1.6);
  }

  // Shades, with a ring for memory.
  const r = Math.max(6, Math.min(10, t * 0.42));
  for (const d of s.shades) {
    const p = unitPos(d, alpha);
    const shake = d.grabbedBy && !REDUCED ? Math.sin(now / 30) * 1.5 : 0;
    const cx = p.x + shake;
    const cy = p.y - r - 1;
    if (d.id === ui.selected) {
      c.strokeStyle = COL.sel;
      c.lineWidth = 1;
      c.setLineDash([2, 2]);
      c.beginPath();
      c.moveTo(d.x * t, ground(d.f) + 3);
      for (const step of d.path) c.lineTo(step.x * t, ground(step.f) + 3);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = COL.shade;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = d.memory < 30 ? COL.low : COL.sel;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, r + 2.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, d.memory)) / 100);
    c.stroke();
    if (d.grabbedBy) {
      c.strokeStyle = COL.rift;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, r + 5, 0, Math.PI * 2);
      c.stroke();
    }
    if (d.id === ui.selected) {
      c.strokeStyle = COL.sel;
      c.lineWidth = 1.5;
      c.strokeRect(cx - r - 6, cy - r - 6, 2 * r + 12, 2 * r + 12);
    }
    c.fillStyle = COL.shadeInk;
    c.font = `700 ${Math.round(r * 1.1)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(d.name[0], cx, cy + 0.5);
    c.textAlign = 'start';
    c.textBaseline = 'top';
  }

  if (s.hush) {
    c.fillStyle = 'rgba(11, 10, 18, 0.35)';
    c.fillRect(0, G.veil, G.cw, G.ch - G.veil - G.deep);
    c.fillStyle = '#d9d3f5';
    c.font = `700 ${labelSize + 2}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    c.fillText('HUSH', G.cw - 60, G.veil + 6);
  }
}

function diamond(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fill();
}

// Canvas pixels to a place in the Tain.
function placeAt(px, py) {
  if (py < G.veil || py > G.ch) return null;
  const f = Math.min(FLOORS.length - 1, Math.floor((py - G.veil) / G.fh));
  return { f, x: Math.max(0, Math.min(W - 0.05, px / G.tile)), deep: py > G.ch - G.deep };
}

function onStage(e) {
  const box = canvas.getBoundingClientRect();
  const at = placeAt(e.clientX - box.left, e.clientY - box.top);
  if (!at || (s.phase !== 'dusk' && s.phase !== 'night')) return;
  const x = Math.round(at.x * 10) / 10;
  if (ui.tool === 'candle') {
    game({ type: 'candle', f: at.f, x });
    if (!s.candlesLeft) ui.tool = 'guide';
    return;
  }
  if (ui.tool === 'ward') {
    const tol = Math.max(1.2, 16 / G.tile);
    const stairs = STAIRS.filter((st) => (st.f === at.f || st.f + 1 === at.f) && Math.abs(st.x - at.x) <= tol).map((st) => ({ id: st.id, d: Math.abs(st.x - at.x) }));
    const rifts = at.f === BOTTOM ? RIFTS.filter((r) => Math.abs(r.x - at.x) <= tol + 0.5).map((r) => ({ id: r.id, d: Math.abs(r.x - at.x) - (at.deep ? 1 : 0) })) : [];
    const target = [...stairs, ...rifts].sort((a, b) => a.d - b.d)[0];
    if (!target) return toast('Tap closer to a stair or a rift.', 'bad');
    game({ type: 'ward', target: target.id });
    return;
  }
  const tol = Math.max(0.9, 14 / G.tile);
  const hit = s.shades.filter((d) => d.f === at.f && Math.abs(d.x - at.x) <= tol).sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x))[0];
  if (hit && hit.id !== ui.selected) {
    ui.selected = hit.id;
    bump();
    return;
  }
  if (ui.selected) game({ type: 'move', id: ui.selected, f: at.f, x });
}

/* ---------------------------------------------------------------- rendering */

const SECTIONS = { hud: hudHTML, tools: toolsHTML, phase: phaseHTML, shades: shadesHTML, records: recordsHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let drawnToasts = -1;

const LIVE = {
  clock: () => clockText(),
  essence: () => String(Math.floor(s.essence + 1e-9)),
  creepers: () => String(s.creepers.length),
  'to-come': () => String(s.spawns.length),
  't-spawned': () => String(s.tonight.spawned),
  't-killed': () => String(s.tonight.killed),
  't-essence': () => fmt(s.tonight.essence),
  mem: (id) => String(Math.max(0, Math.ceil(byId(s.shades, id)?.memory ?? 0))),
  status: (id) => {
    const d = byId(s.shades, id);
    return d ? statusOf(d, lightMap(s)) : '';
  },
};
const BARS = {
  night: () => (s.phase === 'night' ? s.t / nightTicks(s) : s.phase === 'dusk' ? 0 : 1),
  mem: (id) => (byId(s.shades, id)?.memory ?? 0) / 100,
};

function render(alpha, now) {
  const key = `${s.rev}|${ui.rev}`;
  let changed = false;
  for (const [id, html] of Object.entries(SECTIONS)) {
    if (drawn[id] === key) continue;
    const host = document.getElementById(id);
    const a = document.activeElement;
    if (a && host.contains(a) && a.matches('select, textarea, input:not([type="checkbox"])')) continue;
    const focusId = a && host.contains(a) ? a.id : null;
    const scrolls = [...host.querySelectorAll('#log, #nights-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
    host.innerHTML = html();
    if (id === 'phase' || id === 'hud') host.className = `${id} ${PH[s.phase]}`;
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
    document.getElementById('stage-hint').textContent = hintText();
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
      .map((t) => `<div class="toast ${t.tone}"><span>${esc(t.text)}</span><button type="button" data-act="toast-close" data-id="${t.id}">Close</button></div>`)
      .join('');
  }
  draw(alpha, now);
}

/* ---------------------------------------------------------------- the clock */

let toastSeq = 0;
function toast(text, tone = '') {
  ui.toasts.push({ id: ++toastSeq, text, tone, until: performance.now() + 5000 });
  const room = window.innerWidth < 600 ? 2 : 3;
  if (ui.toasts.length > room) ui.toasts.splice(0, ui.toasts.length - room);
  ui.toastRev++;
}
function takeAlerts(fromClock) {
  let stop = false;
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone);
    if (fromClock && prefs.autoPause && /has caught/.test(a.text)) stop = true;
  }
  if (stop) {
    ui.paused = true;
    bump();
  }
  return stop;
}

let lastNow = 0;
let acc = 0;
let seenPhase = s.phase;
function frame(now) {
  const dt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (!ui.paused && s.phase === 'night') {
    acc += dt * prefs.speed * TICKS_PER_SEC;
    let n = Math.floor(acc);
    acc -= n;
    while (n-- > 0 && s.phase === 'night') {
      stepNight(s);
      if (takeAlerts(true)) {
        acc = 0;
        break;
      }
    }
  }
  takeAlerts(false);
  if (s.phase !== seenPhase) {
    seenPhase = s.phase;
    acc = 0;
    if (s.phase === 'dawn' || s.phase === 'over') saveGame();
    if (s.phase !== 'night') ui.paused = true;
    if (s.phase === 'dusk') ui.tool = 'candle';
    bump();
  }
  const before = ui.toasts.length;
  ui.toasts = ui.toasts.filter((t) => t.until > now);
  if (ui.toasts.length !== before) ui.toastRev++;
  render(ui.paused || s.phase !== 'night' ? 1 : Math.min(1, acc), now);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- input */

function game(a) {
  const r = actNight(s, a);
  if (!r.ok) toast(r.error, 'bad');
  takeAlerts(false);
  bump();
  return r.ok;
}
function togglePlay() {
  if (s.phase !== 'night') return;
  ui.paused = !ui.paused;
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

function onAct(name, el) {
  const id = el.dataset.id;
  switch (name) {
    case 'play': return togglePlay();
    case 'speed': return setSpeed(Number(el.dataset.v));
    case 'tool':
      ui.tool = el.dataset.tool;
      return bump();
    case 'hush': return game({ type: 'hush', on: !s.hush });
    case 'start':
      if (game({ type: 'start' })) {
        ui.paused = false;
        ui.tool = s.candlesLeft ? 'candle' : 'guide';
      }
      return undefined;
    case 'select':
      ui.selected = ui.selected === id ? null : id;
      ui.tool = 'guide';
      return bump();
    case 'name':
    case 'remember':
    case 'release':
      return game({ type: name, id });
    case 'rate': return game({ type: 'rate', score: Number(el.dataset.n) });
    case 'rate-select':
      game({ type: 'rate', night: Number(el.dataset.night), score: el.value ? Number(el.value) : null });
      return saveGame();
    case 'next':
      if (game({ type: 'next' })) ui.tool = 'candle';
      return undefined;
    case 'tune': return game({ type: 'tune', key: el.dataset.key, value: el.value });
    case 'tab':
      prefs.tab = el.dataset.tab;
      savePrefs();
      return bump();
    case 'autopause':
      prefs.autoPause = el.checked;
      savePrefs();
      return bump();
    case 'intro-close':
      prefs.introDone = true;
      savePrefs();
      return bump();
    case 'new':
      ui.confirmNew = true;
      return bump();
    case 'new-no':
      ui.confirmNew = false;
      return bump();
    case 'new-yes':
      s = newNightGame(Date.now() >>> 0, s.tuning);
      seenPhase = s.phase;
      Object.assign(ui, { paused: true, confirmNew: false, selected: null, tool: 'candle', showExport: false, copied: '' });
      saveGame();
      toast('A new keep. Dusk on night 1.', 'dusk');
      return bump();
    case 'copy': return copyExport();
    case 'show-export':
      ui.showExport = !ui.showExport;
      return bump();
    case 'toast-close':
      ui.toasts = ui.toasts.filter((t) => t.id !== Number(id));
      ui.toastRev++;
      return undefined;
    default:
      return undefined;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.matches('select, input, textarea')) onAct(el.dataset.act, el);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && el.matches('select, input')) onAct(el.dataset.act, el);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'notes') {
    prefs.notes = e.target.value;
    savePrefs();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea, button, a')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (k === '1' || k === '2' || k === '4') setSpeed(Number(k));
  else if (k === 'c' || k === 'g' || k === 'w') {
    ui.tool = { c: 'candle', g: 'guide', w: 'ward' }[k];
    bump();
  } else if (k === 'h' && s.phase === 'night') game({ type: 'hush', on: !s.hush });
});
canvas.addEventListener('pointerdown', onStage);
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const box = canvas.getBoundingClientRect();
  ui.hover = placeAt(e.clientX - box.left, e.clientY - box.top);
});
canvas.addEventListener('pointerleave', () => {
  ui.hover = null;
});
if ('ResizeObserver' in window) new ResizeObserver(layout).observe(document.getElementById('stage-box'));
window.addEventListener('resize', layout);

layout();
if (s.phase !== 'dusk' && s.night > 1) toast(`Welcome back: ${phaseLabel().toLowerCase()}.`, 'rite');
requestAnimationFrame(frame);
