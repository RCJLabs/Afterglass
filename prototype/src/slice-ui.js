// Weeks 7–10 slice UI: one season in one keep, day and night on the pixel stage.
// Like the greyboxes it changes the game only through act(), so every session replays from its seed.

import { TICKS_PER_SEC, DAY_ROOMS, WORK_ROOMS, TWINS, KINDS, MIRRORS, CAUSES, MAP, DEEP_FLOOR } from './slice/data.js';
import {
  newSeason, step, act, ritePreview, crossingPreview, capacity, canWork, defense, roomPower, bear, priests, funeralCap, eatRate,
  dayTicks, nightTicks, isNewMoon, choicesFor, byId, isTwinnedLiving, isTwinnedShade, lastSeason, SAVE_VERSION, fmt, mirrorCap,
  postRoom,
} from './slice/sim.js';
import { VIEW_H, fromView, floorAtY, roomAt, lightMap, isLit, unitAt } from './slice/geo.js';
import { drawDay, drawNight, labelSpots } from './slice/draw.js';

const SAVE_KEY = 'afterglass-season/save/v1';
const PREF_KEY = 'afterglass-season/prefs/v1';
const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const W = MAP.W;

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
      // Storage blocked or full: the season still runs, it just won't resume after a reload.
    }
  },
};

const prefs = { speed: 1, mode: 'reflection', labels: true, tab: 'log', autoPause: true, introDone: false, ...(store.get(PREF_KEY) || {}) };
const savePrefs = () => store.set(PREF_KEY, prefs);

function loadGame() {
  const g = store.get(SAVE_KEY);
  if (!g || g.v !== SAVE_VERSION || g.mode !== 'season' || !Array.isArray(g.shades)) return null;
  g.alerts = [];
  return g;
}
const saveGame = () => store.set(SAVE_KEY, { ...s, alerts: [] });

let s = loadGame() || newSeason();
const ui = { paused: true, rev: 0, tool: 'candle', selected: null, person: null, hover: null, toasts: [], toastRev: 0, confirmNew: false, copied: '', showExport: false, rush: false, flash: 0, scale: 3 };
const bump = () => {
  ui.rev++;
};
const running = () => s.phase === 'day' || s.phase === 'night';

/* ---------------------------------------------------------------- words */

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const floor1 = (x) => String(Math.floor(x + 1e-9));
const PH = { day: 'is-day', dusk: 'is-dusk', night: 'is-night', dawn: 'is-rite', end: 'is-rite', over: 'is-fallen' };
const roomName = (id, night) => (night ? TWINS[id].name : DAY_ROOMS[id].name);
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
  const room = roomAt(d.f, d.x) || postRoom(d);
  if (s.phase !== 'night') return `posted in the ${roomName(postRoom(d), true)}`;
  if (d.grabbedBy) return 'caught!';
  if (d.climb) return 'on the stairs';
  if (d.path.length) return `walking to the ${roomName(postRoom(d), true)}`;
  if (s.night?.hush) return 'hushed';
  if (!isLit(L, d.f, d.x)) return `in the dark, ${roomName(room, true)}`;
  if (s.night.foes.some((c) => c.f === d.f && Math.abs(c.x - d.x) <= s.tuning.reach + 0.5)) return 'fighting';
  const job = TWINS[room].job;
  const at = Math.abs(d.post.x - d.x) <= 1.5 && d.post.f === d.f;
  if (!at || !job) return `holding the light, ${roomName(room, true)}`;
  return { essence: 'singing in the Choir', glass: 'silvering glass', wick: 'saving wax', guidance: 'at the Threshold', watch: 'keeping watch', rest: 'resting by the Cold Hearth' }[job];
}

/* ---------------------------------------------------------------- the header */

function hudHTML() {
  const T = s.tuning;
  const cap = capacity(s);
  const go = running() && !ui.paused;
  return `<div class="hud-top">
    <p class="brand">Afterglass<span>one season, weeks 7–10</span></p>
    <div class="clock ${PH[s.phase]}"><span class="pill">${phaseLabel()}</span><span class="time" data-live="clock">${clockText()}</span><span class="bar" aria-hidden="true"><i data-bar="clock"></i></span></div>
    <div class="controls">
      <button class="btn" id="btn-play" data-act="play"${running() ? '' : ' disabled'}>${go ? 'Pause' : 'Play'}</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map((v) => `<button class="btn" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`).join('')}</div>
    </div>
  </div>
  <dl class="res">
    <div><dt>Food</dt><dd><b data-live="food">${floor1(s.res.food)}</b> <small class="${s.hungry ? 'neg' : 'muted'}">eat ${fmt(eatRate(s))}/day</small></dd></div>
    <div><dt>Candles</dt><dd><b data-live="candles">${floor1(s.res.candles)}</b></dd></div>
    <div><dt>Glass</dt><dd><b data-live="glass">${floor1(s.res.glass)}</b></dd></div>
    <div><dt>Essence</dt><dd><b data-live="essence">${floor1(s.res.essence)}</b></dd></div>
    <div><dt>Remembrance</dt><dd><b data-live="rem">${floor1(s.res.remembrance)}</b></dd></div>
    <div><dt>Dread</dt><dd>${pips(s.dread, T.dreadMax, s.dread >= 4)} <b>${s.dread}</b></dd></div>
    <div><dt>Veil</dt><dd>${pips(s.cracks, T.cracksMax, true)} <b>${s.cracks}</b>/${T.cracksMax}</dd></div>
    <div><dt>Living</dt><dd><b>${s.living.length}</b></dd></div>
    <div><dt>Shades</dt><dd><b>${cap.used}</b>/${cap.cap}</dd></div>
  </dl>`;
}

/* ---------------------------------------------------------------- the toolbar and hint */

function toolsHTML() {
  const night = s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place');
  const tool = (id, label, key) => `<button class="btn sm" id="tool-${id}" data-act="tool" data-tool="${id}" aria-pressed="${ui.tool === id}"${night ? '' : ' disabled'}>${label}<kbd>${key}</kbd></button>`;
  const cams = `<div class="seg" role="group" aria-label="Night camera">${[['reflection', 'Reflection'], ['flipped', 'Flipped']]
    .map(([m, l]) => `<button class="btn sm" id="cam-${m}" data-act="cam" data-mode="${m}" aria-pressed="${prefs.mode === m}"${nightNow() ? '' : ' disabled'}>${l}</button>`)
    .join('')}</div>`;
  const labels = `<button class="btn sm" id="btn-labels" data-act="labels" aria-pressed="${prefs.labels}">Labels</button>`;
  if (s.phase === 'day') {
    return `<button class="btn sm" id="btn-rush" data-act="rush" aria-pressed="${ui.rush}">${ui.rush ? 'Hurrying to dusk' : 'Hurry to dusk'}</button>${labels}<span class="sep" aria-hidden="true"></span>${cams}`;
  }
  if (s.phase === 'end') return labels;
  if (s.phase === 'over') return `${cams}${labels}`;
  return `${tool('candle', `Candle (${floor1(s.res.candles)})`, 'C')}${tool('move', 'Move', 'M')}${tool('ward', `Ward, ${s.tuning.wardCost} essence`, 'W')}
    <button class="btn sm" id="btn-hush" data-act="hush" aria-pressed="${!!s.night?.hush}"${s.phase === 'night' ? '' : ' disabled'}>Hush<kbd>H</kbd></button>
    <span class="sep" aria-hidden="true"></span>${cams}${labels}`;
}

function hintText() {
  const T = s.tuning;
  if (s.phase === 'day') {
    const p = byId(s.living, ui.person);
    return p ? `${p.name}: tap a room to put ${p.name} to work there.` : 'Tap a name in the roster, then a room, to change jobs. Or use the job lists.';
  }
  if (s.phase === 'dusk' && s.dusk.step === 'crypt') return 'The dead wake first. Choose funerals, then let them wake.';
  if (s.phase === 'dawn') return 'Dawn. Decide who stays in the glass, then begin the day.';
  if (s.phase === 'end' || s.phase === 'over') return '';
  const d = byId(s.shades, ui.selected);
  if (ui.tool === 'candle') {
    return s.res.candles >= 1
      ? `Tap a floor to set a candle (${floor1(s.res.candles)} left). It lights its own room only, and the Unlit can't enter the light.`
      : 'No candles left. The Chandlery makes them by day; the Wick Room saves them at night.';
  }
  if (ui.tool === 'ward') return `Tap a stair or a rift to seal it until dawn for ${T.wardCost} essence. The Hollow breaks a ward in ${T.wardHold} seconds.`;
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
      <li><b>By night</b> the shades work the Tain, the keep's reflection. Creepers climb from the rifts in the Deep toward the mirrors under the Veil. They can't enter candlelight; shades standing in light fight them at its edge.</li>
      <li><b>At dawn</b> you decide which of the dead stay. Every shade kept adds to the keep's Dread; the living bear some of it.</li>
      <li><b>The Lantern Church</b> inspects on day 5, and again whenever Dread reaches 5. Low Dread is blessed; high Dread costs you a mirror and the shades in it.</li>
    </ul>
    <div class="row"><button class="btn primary" id="btn-intro" data-act="intro-close">Begin</button></div>
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
      return `<div class="mirror"><span class="mname">${esc(m.name)}</span><div class="slots">${slots}</div></div>`;
    })
    .join('')}</div>`;
}

function dayPanel() {
  const T = s.tuning;
  const pw = roomPower(s);
  const sick = s.living.filter((p) => p.sick > 0);
  const moon = T.seasonDays - s.day;
  const rows = WORK_ROOMS.map((id) => {
    const R = DAY_ROOMS[id];
    const n = s.living.filter((p) => p.job === id).length;
    const out = id === 'infirmary' ? `heals ${fmt(pw[id] * R.rate)}/day` : id === 'barracks' ? `defense ${fmt(pw[id] * R.rate)}` : `${fmt(pw[id] * R.rate)} ${R.out}/day`;
    return `<li><span>${R.name} <small class="muted">${plural(n, R.role)}</small></span><span class="num">${out}</span></li>`;
  }).join('');
  return `<header class="ph-head"><h2>Day ${s.day}</h2><p>${moon > 0 ? `The new moon is ${plural(moon, 'night')} off.` : 'Tonight is the new moon. The Hollow will rise.'} The living work; anyone who dies inside the walls wakes at dusk.</p></header>
    ${raidCard()}
    ${inspectionCard()}
    ${sick.length ? `<p class="note bad">Sick: ${esc(listOf(sick.map((p) => p.name)))}. A healer in the Infirmary cures one a day; untreated, the sickness kills.</p>` : ''}
    ${s.hungry ? '<p class="note bad">The larder is empty. Everyone works hungry, and the weakest will starve. Put more cooks in the Hearth.</p>' : ''}
    <div class="card"><h3>Work today</h3><ul class="facts">${rows}</ul></div>
    <div class="card"><h3>The mirrors</h3><p class="note">Each shade needs a place in a mirror. With no room, the dead wake Restless.</p>${mirrorsHTML()}${buildRow()}</div>`;
}

function duskCrypt() {
  const plan = crossingPreview(s);
  const cap = funeralCap(s);
  const booked = s.bodies.filter((b) => b.funeral).length;
  const fate = (x) => {
    if (x.to === 'funeral') return ['Funeral: laid to rest, +1 remembrance', ''];
    if (x.to === 'mirror') return [`Wakes ${KINDS[x.b.kind].name} in the ${x.mirror.name}`, ''];
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
  const st = MAP.stairs.find((x) => x.id === id);
  if (st) return `the ${TWINS[roomAt(st.f, st.x)].name} stair`;
  const rf = MAP.rifts.find((x) => x.id === id);
  return rf ? `the rift in the ${TWINS[roomAt(DEEP_FLOOR, rf.x)].name}` : id;
}

function tidesText() {
  const n = s.night;
  const N = nightTicks(s);
  return n.tides.map((t) => hhmm(18 + (12 * t) / N)).join(', ');
}

function duskPlace() {
  const T = s.tuning;
  const n = s.night;
  const L = lightMap(T, n.candles);
  const ds = s.shades.filter(canWork);
  const dark = ds.filter((d) => !isLit(L, d.post.f, d.post.x));
  const creepers = n.spawns.filter((x) => x.type === 'creeper').length;
  const wraiths = s.shades.filter((d) => d.kind === 'wraith');
  return `<header class="ph-head"><h2>Dusk: set the night</h2><p>${plural(creepers, 'Creeper')} will climb out of the Deep tonight, most of them in tides around ${tidesText()}.${isNewMoon(s) ? ' <b>Tonight is the new moon: the Hollow rises.</b>' : ''} Set candles and post the shades, then begin.</p></header>
    <ul class="facts">
      <li><span>Candles set tonight</span><b class="num">${n.candles.length}, ${floor1(s.res.candles)} left</b></li>
      <li><span>Shades posted in the dark</span><b class="num">${dark.length}</b></li>
      <li><span>Wards</span><b>${n.wards.length ? esc(listOf(n.wards.map(wardName))) : 'none'}</b></li>
    </ul>
    ${dark.length ? `<p class="note">${esc(listOf(dark.map((d) => d.name)))} ${dark.length === 1 ? 'stands' : 'stand'} in the dark, where Creepers catch and drain shades. A shade works only in light.</p>` : ''}
    ${wraiths.length ? `<p class="note bad">${esc(listOf(wraiths.map((d) => d.name)))} will rise as ${wraiths.length === 1 ? 'a Wraith' : 'Wraiths'} in the Waking Room. Cut ${wraiths.length === 1 ? 'it' : 'them'} down to banish for good.</p>` : ''}
    <details class="card"><summary><b>How the Tain works</b></summary>
      <ul class="facts">
        <li><span>Creepers rise from the two rifts on the deepest floor and climb the stairs toward the two mirrors by the Veil.</span></li>
        <li><span>They can't cross light or climb a stair lit at either end, so they gnaw at the light's edge. Some hunt candles first.</span></li>
        <li><span>A shade standing in light fights anything at its edge. In the dark, shades get caught and drained.</span></li>
        <li><span>Each twin room has a night job for a lit shade at its post: the Choir sings essence, the Silvering makes glass, the Wick Room saves candles, the Threshold readies gentler deaths, the Watch adds to tomorrow's defense and the Cold Hearth halves fading.</span></li>
        <li><span>From night ${T.seepFrom}, some Unlit seep up in rooms with no candle at all.</span></li>
      </ul></details>
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Begin the night</button></div>`;
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
    ${h ? `<p class="note bad">The Hollow is in the ${esc(roomName(roomAt(h.f, h.x) || 'chapel', true))}${h.mode === 'batter' ? ', battering a ward' : ''}. It eats light and drains shades near it. Only shades fighting it drive it back.</p>` : ''}
    ${caught.map((d) => `<p class="note bad">${esc(d.name)} is caught in the ${esc(roomName(roomAt(d.f, d.x) || 'crypt', true))}. Drop a candle on the spot or send a fighter.</p>`).join('')}
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
  const note = canWork(d)
    ? `${Math.ceil(d.memory)} memory${d.named ? ', named' : ''}. ${c === 'cover' ? 'Released at dawn: +1 remembrance, and the living it was bound to find peace.' : `Kept: +${T.dreadPerKeep} Dread.`}`
    : d.kind === 'wraith'
      ? `Left: +${T.dreadPerWraith} Dread, and it rises again tonight.`
      : `${c === 'release' ? 'Released: +1 remembrance.' : c === 'bind' ? `Bound into a mirror as ${KINDS[d.trueKind].name}: +${T.dreadPerKeep} Dread.` : `Left at the edge: +${T.dreadPerRestless} Dread, and a night closer to Wraith.`}`;
  const acts = canWork(d) && c !== 'cover'
    ? `<div class="feel"><button class="btn sm" id="name-${d.id}" data-act="name" data-id="${d.id}"${d.named || s.res.remembrance + 1e-9 < T.nameCost ? ' disabled' : ''}>Name, ${T.nameCost}</button>
       <button class="btn sm" id="rem-${d.id}" data-act="remember" data-id="${d.id}"${d.memory >= 100 || s.res.remembrance + 1e-9 < T.rememberCost ? ' disabled' : ''}>Remember +${T.rememberGain}, ${T.rememberCost}</button>
       <span>Naming halves fading for good.</span></div>`
    : '';
  const bonded = d.bond && byId(s.living, d.bond.with);
  return `<div class="rite-row${c === 'cover' || c === 'release' || c === 'banish' ? ' is-cover' : ''}">
    <div class="who"><div><b>${esc(d.name)}</b>${kindTag(d.kind)}${bonded ? `<small>${esc(bonded.name)}'s ${esc(d.bond.rel)}</small>` : ''}</div><small>${note}</small></div>
    <div class="opts">${opts}</div>${acts}</div>`;
}

function dawnPanel() {
  const T = s.tuning;
  const P = ritePreview(s);
  const D = P.dread;
  const I = s.inspection;
  const warn = (I && !I.done && I.day === s.day + 1) || (s.day + 1 === T.firstInspection - 1);
  const parts = [
    D.keep ? `+${D.keep} kept` : '',
    D.restless ? `+${D.restless} Restless left` : '',
    D.wraith ? `+${D.wraith} Wraiths left` : '',
    D.cracks ? `+${D.cracks} from the cracked Veil` : '',
    `−${D.bear} borne by the living`,
    D.vigils ? `−${D.vigils} vigils` : '',
  ].filter(Boolean).join(', ');
  return `<header class="ph-head"><h2>${s.day === 0 ? `Season ${s.season}: the first dawn` : 'Dawn: the Rite'}</h2><p>The Unlit withdraw and the shades go back into the glass. Choose who stays. Each shade kept adds Dread; ${bear(s)} ${bear(s) === 1 ? 'is' : 'are'} borne by the living (one per ${T.dreadLivingPer} living, one per priest).</p></header>
    ${nightReport()}
    <div class="rite-list">${s.shades.map(riteRow).join('') || '<p class="empty">The glass is empty.</p>'}</div>
    <div class="preview">
      <p>Dread <b class="big">${D.from} → ${D.to}</b> <small class="muted">(${parts})</small></p>
      ${P.inspector ? '<p class="note bad">At 5 the Lantern Church sends an inspector today. At noon a Dread of 4 or 5 is censured.</p>' : warn ? '<p class="note">The Lantern Church inspects soon. A Dread of 0 or 1 at noon is blessed.</p>' : ''}
      <div class="vigil"><span>Vigils at dawn, ${T.vigilCost} remembrance each:</span><button class="btn sm" id="vig-dn" data-act="vigils" data-n="${s.rite.vigils - 1}"${s.rite.vigils <= 0 ? ' disabled' : ''} aria-label="One fewer vigil">−</button><b>${s.rite.vigils}</b><button class="btn sm" id="vig-up" data-act="vigils" data-n="${s.rite.vigils + 1}" aria-label="One more vigil">+</button><small class="muted">remembrance ${floor1(s.res.remembrance)}</small></div>
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
    <div class="card"><h3>The season</h3>${summaryHTML(e)}</div>
    <div class="row"><button class="btn primary" id="btn-next-season" data-act="next-season">Begin season ${e.season + 1}</button><span class="hint">Raids and the Unlit come ×${s.tuning.hardness} harder.</span></div>`;
}

function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New season from day 1</button></div>';
  return `<div class="confirm"><p>Start over from season 1, day 1? This replaces the saved game. Copy the playtest export first if you want it.</p>
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
  return (prefs.introDone ? '' : introHTML()) + panel;
}

/* ---------------------------------------------------------------- the rosters */

function livingRows() {
  const opts = (p) =>
    `<option value=""${p.job ? '' : ' selected'}>No job</option>${WORK_ROOMS.map((id) => `<option value="${id}"${p.job === id ? ' selected' : ''}>${DAY_ROOMS[id].name}</option>`).join('')}`;
  return s.living
    .map((p) => {
      const tags = [
        p.sick > 0 ? `<span class="tag sick">Sick, ${fmt(p.sick / dayTicks(s))} days</span>` : '',
        p.grief ? '<span class="tag grief">Grieving</span>' : '',
        p.peace > 0 ? '<span class="tag peace">At peace</span>' : '',
        isTwinnedLiving(s, p) ? '<span class="tag twin">Twinned</span>' : '',
      ].join('');
      const b = p.bond ? byId(s.living, p.bond.with) || byId(s.shades, p.bond.with) : null;
      const bond = b ? `${b.name}'s ${p.bond.rel}${byId(s.shades, b.id) ? ' (a shade)' : ''}` : '';
      return `<div class="prow${ui.person === p.id ? ' is-selected' : ''}" id="prow-${p.id}">
        <div class="pname"><button class="linkish" id="pick-${p.id}" data-act="person" data-id="${p.id}" aria-pressed="${ui.person === p.id}"><b>${esc(p.name)}</b></button><small>${p.age}</small></div>
        <div class="pwork"><select id="job-${p.id}" data-act="assign" data-id="${p.id}" aria-label="Job for ${esc(p.name)}"${s.phase === 'day' || s.phase === 'dusk' || s.phase === 'dawn' ? '' : ' disabled'}>${opts(p)}</select></div>
        <div class="pstat">${tags}</div>
        ${bond ? `<div class="pbond">${esc(bond)}</div>` : ''}
      </div>`;
    })
    .join('');
}

function shadeRows() {
  const L = lightMap(s.tuning, s.night?.candles || []);
  return s.shades
    .map((d) => {
      const pick = canWork(d) && (s.phase === 'dusk' || s.phase === 'night');
      return `<div class="srow${ui.selected === d.id ? ' is-selected' : ''}" id="srow-${d.id}">
        <div class="who">
          <div><b>${esc(d.name)}</b>${kindTag(d.kind)}${d.named ? '<span class="tag peace">Named</span>' : ''}${isTwinnedShade(s, d) ? '<span class="tag twin">Twinned</span>' : ''}</div>
          ${canWork(d) ? `<div><span class="memory${d.memory < 40 ? ' low' : ''}" aria-hidden="true"><i data-bar="mem" data-arg="${d.id}"></i></span><small><span data-live="mem" data-arg="${d.id}">${Math.ceil(d.memory)}</span> memory, <span data-live="status" data-arg="${d.id}">${esc(shadeStatus(d, L))}</span></small></div>` : `<small>${esc(shadeStatus(d, L))}</small>`}
        </div>
        <div class="acts">${pick ? `<button class="btn sm" id="sel-${d.id}" data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}">Select</button>` : ''}</div>
      </div>`;
    })
    .join('');
}

function rosterHTML() {
  const cap = capacity(s);
  const dead = `<div class="roster dead"><div class="roster-head"><h2>The dead</h2><span class="count">${s.shades.length}</span><p>${cap.used} of ${cap.cap} mirror places taken. Loyal shades fight hardest; Serene ones work best. Memory weakens both.</p></div>
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
function ledgerTab() {
  if (!s.ledger.length) return '<p class="hint">Every death gets a line: how, what it woke as, and how it ended.</p>';
  const rows = [...s.ledger]
    .reverse()
    .map((e) => `<tr class="${e.from === 'raider' ? 'raider' : ''}"><td><b>${esc(e.name)}</b><small>${e.from === 'raider' ? 'raider' : e.from === 'before' ? 'the last keeper\'s dead' : esc(e.job ? DAY_ROOMS[e.job].name : 'no job')}</small></td><td>${e.season ? `${e.season}.${e.day}` : '—'}</td><td>${esc(e.how)}</td><td>${e.woke ? esc(e.woke) : '—'}</td><td>${e.end ? `${esc(e.end)}${e.endDay ? `, day ${e.endDay}` : ''}` : 'in the glass'}</td></tr>`)
    .join('');
  return `<div class="table-wrap"><table class="ledger"><thead><tr><th>Name</th><th>Died</th><th>How</th><th>Woke</th><th>End</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  ['hollowHp', 'The Hollow’s strength'],
  ['wardHold', 'Seconds a ward holds the Hollow'],
  ['dreadLivingPer', 'Living per point of Dread borne'],
  ['fadePerNight', 'Memory every shade loses per night'],
  ['cracksMax', 'Veil cracks that lose the keep'],
  ['hardness', 'How much harder each season is'],
];
function settingsTab() {
  return `<div class="fields">${TUNE.map(([k, label]) => `<label for="tune-${k}">${esc(label)}<input type="number" id="tune-${k}" data-act="tune" data-key="${k}" value="${s.tuning[k]}" min="0" step="any"></label>`).join('')}</div>
    <p class="hint">Changes apply from the next tick or the next dusk, and are recorded so exports still replay.</p>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause for raids, catches and the Hollow</label>
    <p class="hint">Seed ${s.seed}. Keys: space to play or pause, 1, 2 and 4 for speed; at night C candle, M move, W ward, H hush, V to switch cameras.</p>
    ${newKeepControls()}`;
}
const TABS = [['log', 'Log'], ['days', 'Days'], ['ledger', 'The dead'], ['playtest', 'Playtest'], ['settings', 'Settings']];
function recordsHTML() {
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'log';
  const body = { log: logTab, days: daysTab, ledger: ledgerTab, playtest: playtestTab, settings: settingsTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tabpanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}

/* ---------------------------------------------------------------- the stage */

const canvas = document.getElementById('stage');
const labelsEl = document.getElementById('labels');
const boxEl = document.getElementById('stage-box');

function layout() {
  canvas.width = W;
  canvas.height = VIEW_H;
  const avail = Math.max(W, boxEl.clientWidth);
  const tall = Math.max(VIEW_H, window.innerHeight - 170);
  ui.scale = Math.max(1, Math.min(6, Math.floor(avail / W), Math.max(2, Math.floor(tall / VIEW_H))));
  canvas.style.width = `${W * ui.scale}px`;
  canvas.style.height = `${VIEW_H * ui.scale}px`;
  drawnLabels = '';
}

let drawnLabels = '';
function placeLabels() {
  const view = s.phase === 'day' || s.phase === 'end' ? 'day' : 'night';
  const key = `${prefs.labels}|${view}|${prefs.mode}|${ui.scale}|${boxEl.clientWidth}`;
  if (key === drawnLabels) return;
  drawnLabels = key;
  labelsEl.hidden = !prefs.labels;
  if (!prefs.labels) return;
  const off = (boxEl.clientWidth - W * ui.scale) / 2;
  labelsEl.innerHTML = labelSpots(view, prefs.mode)
    .map((p) => `<span class="${p.below ? 'up' : ''}" style="left:${off + p.x * ui.scale}px;top:${p.y * ui.scale}px">${esc(view === 'day' ? DAY_ROOMS[p.id].name : TWINS[p.id].name)}</span>`)
    .join('');
}

// Stage pixels to the keep: a floor and an x, or null outside the rooms.
function stageAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const vx = (clientX - box.left) / ui.scale;
  const vy = (clientY - box.top) / ui.scale;
  const p = s.phase === 'day' || s.phase === 'end' ? { x: vx, y: vy } : fromView(prefs.mode, vx, vy);
  const f = floorAtY(p.y);
  if (f < 0) return null;
  return { f, x: Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, p.x)), y: p.y, room: roomAt(f, p.x) };
}
function shadeNear(at, alpha = 1) {
  let best = null;
  for (const d of s.shades.filter(canWork)) {
    if (d.f !== at.f && !d.climb) continue;
    const u = unitAt(d, alpha);
    const dist = Math.abs(u.x - at.x);
    if (dist <= 3.5 && (!best || dist < best.dist)) best = { d, dist };
  }
  return best?.d || null;
}
function wardNear(at) {
  let best = null;
  for (const st of MAP.stairs) {
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
  const at = stageAt(e.clientX, e.clientY);
  if (!at) return;
  if (s.phase === 'day') {
    const p = byId(s.living, ui.person);
    if (p && at.room && DAY_ROOMS[at.room].out) {
      if (game({ type: 'assign', id: p.id, room: at.room })) ui.person = null;
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

// The rosters sit below the stage: bring the stage back into view when the next tap belongs there.
function showStage() {
  const r = boxEl.getBoundingClientRect();
  const hud = document.getElementById('hud').getBoundingClientRect().bottom;
  if (r.top >= hud - 4 && r.bottom <= window.innerHeight + 4) return;
  window.scrollBy({ top: r.top - hud - 8, behavior: REDUCED ? 'auto' : 'smooth' });
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

function draw(alpha, now) {
  const t = REDUCED ? 0 : now / 1000;
  if (s.phase === 'day') drawDay(canvas, s, t, Math.max(0, (s.t / dayTicks(s) - 0.82) / 0.18));
  else if (s.phase === 'end') drawDay(canvas, s, t, 0.35);
  else {
    drawNight(canvas, s, prefs.mode, t, {
      alpha: s.phase === 'night' && !ui.paused ? alpha : 1,
      selected: ui.selected,
      ghost: ghost(),
      ambient: s.phase === 'dawn' || s.phase === 'over' ? 0.45 : 0.22,
      veilFlash: ui.flash > now ? (ui.flash - now) / 600 : 0,
    });
  }
  placeLabels();
}

/* ---------------------------------------------------------------- rendering the page */

const SECTIONS = { hud: hudHTML, tools: toolsHTML, phase: phaseHTML, roster: rosterHTML, records: recordsHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let drawnToasts = -1;

const LIVE = {
  clock: () => clockText(),
  food: () => floor1(s.res.food),
  candles: () => floor1(s.res.candles),
  glass: () => floor1(s.res.glass),
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
    return d ? shadeStatus(d, lightMap(s.tuning, s.night?.candles || [])) : '';
  },
};
const BARS = {
  clock: () => (s.phase === 'day' ? s.t / dayTicks(s) : s.phase === 'night' ? s.t / nightTicks(s) : s.phase === 'dusk' ? 0 : 1),
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
    const scrolls = [...host.querySelectorAll('#log, #days-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
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
  ui.toasts.push({ id: ++toastSeq, text, tone, until: performance.now() + 5500 });
  const room = window.innerWidth < 600 ? 2 : 3;
  if (ui.toasts.length > room) ui.toasts.splice(0, ui.toasts.length - room);
  ui.toastRev++;
}
const STOPS = /has caught|The Hollow rises|Raiders on the road|inspector|has turned Wraith/;
function takeAlerts(fromClock) {
  let stop = false;
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone);
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

let lastNow = 0;
let acc = 0;
let seenPhase = s.phase;
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
  if (s.phase !== seenPhase) {
    seenPhase = s.phase;
    acc = 0;
    ui.rush = false;
    if (!running()) ui.paused = true;
    if (s.phase === 'dusk') ui.tool = 'candle';
    if (s.phase !== 'night' && s.phase !== 'dusk') ui.selected = null;
    saveGame();
    bump();
  }
  const before = ui.toasts.length;
  ui.toasts = ui.toasts.filter((t) => t.until > now);
  if (ui.toasts.length !== before) ui.toastRev++;
  render(ui.paused || !running() ? 1 : Math.min(1, acc), now);
  requestAnimationFrame(frame);
}
setInterval(() => {
  if (running() && !ui.paused) saveGame();
}, 5000);

/* ---------------------------------------------------------------- input */

function game(a) {
  const r = act(s, a);
  if (!r.ok) toast(r.error, 'bad');
  takeAlerts(false);
  bump();
  return r.ok;
}
function togglePlay() {
  if (!running()) return;
  ui.paused = !ui.paused;
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
    case 'cam':
      prefs.mode = el.dataset.mode;
      savePrefs();
      return bump();
    case 'labels':
      prefs.labels = !prefs.labels;
      savePrefs();
      return bump();
    case 'hush': return game({ type: 'hush', on: !s.night?.hush });
    case 'person':
      ui.person = ui.person === id ? null : id;
      if (ui.person) showStage();
      return bump();
    case 'assign': return game({ type: 'assign', id, room: el.value || null });
    case 'wardgate': return game({ type: 'wardGate' });
    case 'vigil': return game({ type: 'vigil' });
    case 'build': return game({ type: 'build', mirror: el.dataset.mirror });
    case 'funeral': return game({ type: 'funeral', id, on: el.getAttribute('aria-pressed') !== 'true' });
    case 'wake':
      if (game({ type: 'wake' })) {
        ui.tool = 'candle';
        showStage();
      }
      return undefined;
    case 'start':
      if (game({ type: 'startNight' })) {
        ui.paused = false;
        ui.selected = null;
        showStage();
      }
      return undefined;
    case 'select':
      ui.selected = ui.selected === id ? null : id;
      ui.tool = 'move';
      if (ui.selected) showStage();
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
      s = newSeason(Date.now() >>> 0, s.tuning0);
      seenPhase = s.phase;
      Object.assign(ui, { paused: true, confirmNew: false, selected: null, person: null, tool: 'candle', showExport: false, copied: '', rush: false });
      saveGame();
      toast('A new season. Day 1.', 'day');
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
let noteTimer = 0;
document.addEventListener('input', (e) => {
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
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea, button, a')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (k === '1' || k === '2' || k === '4') setSpeed(Number(k));
  else if (k === 'c' || k === 'm' || k === 'w') {
    ui.tool = { c: 'candle', m: 'move', w: 'ward' }[k];
    bump();
  } else if (k === 'h' && s.phase === 'night') game({ type: 'hush', on: !s.night.hush });
  else if (k === 'v') {
    prefs.mode = prefs.mode === 'reflection' ? 'flipped' : 'reflection';
    savePrefs();
    bump();
  }
});
canvas.addEventListener('pointerdown', onStage);
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  ui.hover = stageAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  ui.hover = null;
});
if ('ResizeObserver' in window) new ResizeObserver(layout).observe(boxEl);
window.addEventListener('resize', layout);

layout();
if (s.day > 1 || s.season > 1 || s.phase !== 'day') toast(`Welcome back. Season ${s.season}: ${phaseLabel()}.`, 'rite');
requestAnimationFrame(frame);
