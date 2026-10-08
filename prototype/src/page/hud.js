// Words, the HUD, the action bar and the standing explanations.

import { TICKS_PER_SEC, DAY_ROOMS, TWINS, KINDS, TRAITS, SHADE_TRAITS, ACTS, VISITORS, shadeTraitShort, twinJob } from '../slice/data.js';
import { roomAt, typeAt, typeOf, isLit, guardLit } from '../slice/geo.js';
import { jobCap, ritePreview, capacity, canWork, defense, dayTicks, nightTicks, isNewMoon, byId, fmt, postRoom, wardCost, peopleIn, seasonIndex, seasonName, yearOf, isLongNight, weatherOf, forecastOf, raining, actOf, actCost, canAct, acting, actText, nextMark, visitorBlock, actsFor, musterGain, armsCap, cracksOf } from '../slice/sim.js';
import { prefs, dirty, s, K, ui, running, eclipseNow, setDirty } from './state.js';
import { untilText, fireTrend } from './day.js';
import { DEPTH_NAMES } from './dusk.js';
import { watchBarHTML } from './watch.js';
import { wide, takingBack, wispNow, kbAt, kbText } from './stage.js';
import { openSheet } from './screen.js';

/* ---------------------------------------------------------------- words */

export const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const upper = (x) => x.charAt(0).toUpperCase() + x.slice(1);
// Traits in words, shown only while they're on: a living one's, and a shade's with what it was in life.
export const traitsOn = () => !!s.tuning.traits;
export const livingTraitText = (p) => (traitsOn() && TRAITS[p.trait] ? `<div class="ptrait"><b>${TRAITS[p.trait].name}</b>: ${esc(TRAITS[p.trait].short)}</div>` : '');
export const shadeTraitText = (d) => (traitsOn() && SHADE_TRAITS[d.trait] ? `<small class="strait"><b>${SHADE_TRAITS[d.trait].name}</b>${TRAITS[d.was] ? ` (${TRAITS[d.was].name} in life)` : ''}: ${esc(shadeTraitShort(s.tuning, d.trait))}</small>` : '');
export const wakesAs = (b) => (traitsOn() && TRAITS[b.was] ? SHADE_TRAITS[TRAITS[b.was].dead].name : '');
export const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const floor1 = (x) => String(Math.floor(x + 1e-9));
export const PH = { day: 'is-day', dusk: 'is-dusk', night: 'is-night', dawn: 'is-rite', end: 'is-rite', over: 'is-fallen' };
// A room's name by day or by night, given its id (or its type).
export const roomName = (id, night) => {
  const type = typeOf(K(), id) || id;
  return night ? TWINS[type].name : DAY_ROOMS[type].name;
};
const nightNow = () => s.phase === 'dusk' || s.phase === 'night' || s.phase === 'dawn' || s.phase === 'over';

export function hhmm(h) {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.floor(((x - hh) * 60) / 10) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function clockText() {
  if (s.phase === 'day') return hhmm(6 + (12 * s.t) / dayTicks(s));
  if (s.phase === 'night') return hhmm(18 + (12 * s.t) / nightTicks(s));
  return s.phase === 'dusk' ? '18:00' : '06:00';
}
// How much longer the Long Night is than a winter night, in words.
export const longTimes = () => (s.tuning.longNight === 2 ? 'twice' : `${fmt(s.tuning.longNight)} times`);
// The season's name, capitalised, with the year on; else null.
export const seasonWord = () => (s.tuning.year ? seasonName(s)[0].toUpperCase() + seasonName(s).slice(1) : null);
export function phaseLabel() {
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
export function seasonNote() {
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
export const kindTag = (k) => `<span class="kind k-${k}">${KINDS[k].name}</span>`;

export function shadeStatus(d, L) {
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
  const job = twinJob(s.tuning, room);
  const at = Math.abs(d.post.x - d.x) <= 1.5 && d.post.f === d.f;
  if (s.tuning.lineGuard && job !== 'watch' && guardLit(K(), L, d.f, d.x)) return 'guarding the line';
  if (!at || !job) return `holding the light, ${roomName(room, true)}`;
  if (s.night.broken.includes(roomAt(K(), d.f, d.x))) return `in the broken ${roomName(room, true)}`;
  return { essence: 'singing in the Choir', glass: 'silvering glass', wick: 'saving wax', guidance: 'at the Threshold', watch: 'keeping watch', rest: `resting in the ${roomName(room, true)}`, dreams: 'dreaming in the Dreamwell', steel: 'forging grave-steel', lore: 'reading in the Archive', court: 'seated in the Court' }[job] || `holding the light, ${roomName(room, true)}`;
}


/* ---------------------------------------------------------------- the HUD */

// The tide clock (round six): the night from dusk to dawn, a mark for each tide, Maw, the Hollow, each of the
// Drowned and a sleepwalker's hour, and the night so far filling it.
const markTime = (m) => (s.phase === 'day' ? hhmm(6 + (12 * m.at) / dayTicks(s)) : hhmm(18 + (12 * m.at) / nightTicks(s)));
export function markText(m) {
  const at = markTime(m);
  return {
    sun: () => `the sun back at ${at}`,
    tide: () => `a tide of ${m.count} at ${at}`,
    great: () => `the last great tide, ${m.count}, at ${at}`,
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
  return `<div class="tide"><div class="tclock${e ? ' eclipse' : ''}" role="img" aria-label="${label}">
    <i class="tfill" data-bar="tclock"></i>${marks.map((m) => `<b class="mk mk-${m.kind}" style="left:${((100 * (m.at - a)) / N).toFixed(2)}%" title="${esc(upper(markText(m)))}"></b>`).join('')}
  </div><span class="tnext" data-live="tnext">${esc(nextMarkText())}</span></div>`;
}
// The clock's next mark in words (round seven: the marks were told apart only by colour and a hover title).
export function nextMarkText() {
  const m = s.night?.marks?.find((x) => x.at > s.t);
  return m ? `Next: ${markText(m)}` : '';
}

// On a phone (round seven, phase 3) the HUD shows what a moment's play turns on, food, candles, Dread and the
// Veil, and the rest of the keep's stores behind More; a wide screen shows them all. Dread and the Veil are
// numbers as well as squares, so they read aloud and at a glance.
export function hudHTML() {
  const T = s.tuning;
  const cap = capacity(s);
  const go = running() && !ui.paused;
  const all = !!prefs.hudAll;
  const res = (id, name, v, cap = 0) => `<div class="rest"><dt>${name}</dt><dd><b data-live="${id}">${v}</b>${cap ? `<span class="cap">/${cap}</span>` : ''}</dd></div>`;
  const gauge = (id, name, n, max, hot, what) => `<div class="gauge"><dt>${name}</dt><dd><b data-live="${id}">${n}</b><span class="cap" aria-hidden="true">/${max}</span><span class="visually-hidden"> of ${max}${what}</span>${pips(n, max, hot)}</dd></div>`;
  const next = { 1: 2, 2: 4, 4: 1 }[prefs.speed] || 1;
  return `<div class="ghud-row">
    <div class="clock ${eclipseNow() ? 'is-night' : PH[s.phase]}"><span class="pill">${eclipseNow() ? 'The eclipse' : phaseLabel()}</span><span class="time" data-live="clock">${clockText()}</span><span class="bar" aria-hidden="true"><i data-bar="clock"></i></span></div>
    <div class="gctl">${ui.watch ? `<span class="pill watching">Watching</span><button class="btn sm" id="w-exit-hud" data-act="w-exit">Exit</button>` : `
      <button class="btn sm" id="btn-play" data-act="play"${running() ? '' : ' disabled'}>${go ? 'Pause' : 'Play'}</button>
      <div class="seg speeds" role="group" aria-label="Speed">${[1, 2, 4].map((v) => `<button class="btn sm" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`).join('')}</div>
      <button class="btn sm speed1" id="speed-next" data-act="speed" data-v="${next}" aria-label="Speed ${prefs.speed}×: tap for ${next}×">${prefs.speed}×</button>
      ${s.phase === 'night' ? `<button class="btn sm" id="btn-skip" data-act="skip" aria-pressed="${!!ui.skip}" title="Skip ahead to the next mark on the tide clock, unless something happens first (N)"${ui.skip || nextMark(s) ? '' : ' disabled'}>${ui.skip ? 'Skipping…' : 'Skip'}</button>` : ''}`}
    </div>
  </div>
  ${tideClock()}
  <div class="gres-row">
  <dl class="gres${all ? ' all' : ''}" id="gres">
    <div><dt>Food</dt><dd><b data-live="food">${floor1(s.res.food)}</b></dd></div>
    <div><dt>Candles</dt><dd><b data-live="candles">${floor1(s.res.candles)}</b></dd></div>
    ${gauge('dread', 'Dread', s.dread, T.dreadMax, s.dread >= 4, '')}
    ${gauge('veil', 'Veil', s.cracks, cracksOf(s), true, ' cracked')}
    ${res('glass', 'Glass', floor1(s.res.glass))}
    ${res('stone', 'Stone', floor1(s.res.stone || 0))}
    ${res('essence', 'Essence', floor1(s.res.essence), T.essenceCap)}
    ${res('rem', 'Remembrance', floor1(s.res.remembrance))}
    ${s.res.quicksilver ? res('qs', 'Quicksilver', floor1(s.res.quicksilver)) : ''}
    ${T.forgeArms && (s.arms >= 1 || jobCap(s, 'forge') > 0) ? res('arms', 'Arms', floor1(s.arms || 0), armsCap(s)) : ''}
    <div class="rest"><dt>Living</dt><dd><b>${s.living.length}</b></dd></div>
    <div class="rest"><dt>Shades</dt><dd><b>${cap.used}</b><span class="cap">/${cap.cap}</span></dd></div>
    ${skyHUD()}
  </dl>
  <button class="btn sm gmore" id="hud-more" data-act="hud-more" aria-expanded="${all}" aria-controls="gres">${all ? 'Less' : 'More'}</button>
  </div>
  ${stripHTML()}`;
}

// The emergency strip (round seven, phase 3): under the HUD, the one thing by day that won't wait, with its
// countdown and the two or three things to do about it, so a phone needn't dig for them in the Day panel.
// The Host at the gate comes first, then a fire, then a visitor waiting on an answer, then raiders on the
// road when the gate is short. It stands aside while the Day panel is open, where the same cards are.
function emergencies() {
  if (ui.watch || ui.title || (s.phase !== 'day' && !eclipseNow())) return [];
  const out = [];
  const r = s.raid;
  if (r?.state === 'assault') out.push('assault');
  for (const f of s.fires || []) out.push(`fire:${f.room}`);
  for (const v of (s.tuning.visitors && s.visitors) || []) if (v.here && !v.done) out.push(`visit:${v.id}`);
  if (r?.state === 'coming' && r.warned && defense(s) + musterGain(s) + 1e-9 < r.strength) out.push('road');
  return out;
}
function stripHTML() {
  const all = emergencies();
  if (!all.length || ui.sheet === 'phase') return '';
  const [kind, id] = all[0].split(':');
  const T = s.tuning;
  const r = s.raid;
  const more = all.length > 1 ? `<span class="emore">, and ${plural(all.length - 1, 'more thing', 'more things')} in the Day panel</span>` : '';
  const open = `<button class="btn sm" id="e-open" data-act="strip-open" data-card="${kind}" aria-label="Details, in the Day panel">Details</button>`;
  const head = (text, more = true) => `<div class="ehead"><p class="etext">${text}</p>${more ? open : ''}</div>`;
  let body;
  if (kind === 'assault') {
    const hands = s.living.filter((p) => p.job !== 'barracks' && p.job !== 'gatehouse' && !p.fighting && !p.walls && !(p.sick > 0)).length;
    body = `${head(`<b>${r.crusade ? 'The crusade is at the gate.' : 'The Host is at the gate.'}</b> <span data-live="estrip">${esc(stripText())}</span>${more}`)}
      <span class="ebar" aria-hidden="true"><i data-bar="gate"></i></span>
      <div class="row eacts"><button class="btn sm primary" id="e-pitch" data-act="pitch"${s.res.candles + 1e-9 < T.raidPitchCost ? ' disabled' : ''}>Pour pitch: ${T.raidPitchCost} candles</button>
        <button class="btn sm" id="e-bell" data-act="raid-bell"${r.bell || !hands ? ' disabled' : ''}>${r.bell ? 'The bell has rung' : `Ring the bell (${hands})`}</button></div>`;
  } else if (kind === 'fire') {
    const yard = s.living.filter((p) => p.job === 'yard' && !p.fighting).length;
    const burning = s.fires.flatMap((x) => peopleIn(s, x.room));
    const hands = s.living.filter((p) => !p.fighting && !(p.sick > 0) && !burning.includes(p)).length;
    body = `${head(`<b>Fire in the ${esc(roomName(id))}.</b> <span data-live="heat" data-arg="${id}">${esc(fireTrend(id))}</span>${more}`)}
      <span class="ebar" aria-hidden="true"><i data-bar="heat" data-arg="${id}"></i></span>
      <div class="row eacts"><button class="btn sm primary" id="e-yard" data-act="fight-fire" data-room="${id}"${yard ? '' : ' disabled'}>${yard ? `Send the Yard (${yard})` : 'Nobody in the Yard'}</button>
        <button class="btn sm" id="e-firebell" data-act="fight-fire" data-room="${id}" data-bell="1"${hands ? '' : ' disabled'}>Ring the bell (${hands})</button></div>`;
  } else if (kind === 'visit') {
    const v = s.visitors.find((x) => x.id === id);
    const V = VISITORS[v.kind];
    const last = V.answers.at(-1);
    body = `${head(`<b>${esc(V.name)} ${V.inside ? 'in the keep' : 'at the gate'}.</b> Answer by ${untilText(v)}; with no answer, it's “${esc(last.text)}”.${more}`, false)}
      <span class="ebar" aria-hidden="true"><i data-bar="visit" data-arg="${v.id}"></i></span>
      <div class="row eacts"><button class="btn sm primary" id="e-answer" data-act="strip-open" data-card="visit">Answer</button>
        <button class="btn sm" id="e-last" data-act="visitor" data-id="${v.id}" data-answer="${last.id}"${visitorBlock(s, v, last.id) ? ' disabled' : ''}>${esc(last.text)}</button></div>`;
  } else {
    body = `${head(`<b>${r.crusade ? 'The crusade is on the road.' : 'Raiders on the road.'}</b> At the gate about ${hhmm(6 + (12 * r.hitAt) / dayTicks(s))}: strength ${fmt(r.strength)} against your defense <span data-live="defense">${fmt(defense(s))}</span>${musterGain(s) > 0.05 ? `, ${fmt(defense(s) + musterGain(s))} once the guards posted have taken their places` : ''}.${more}`)}
      <div class="row eacts">${r.ward ? '' : `<button class="btn sm primary" id="e-wardgate" data-act="wardgate"${s.res.essence + 1e-9 < T.wardGateCost ? ' disabled' : ''}>Ward the gate: ${T.wardGateCost} essence</button>`}
        <button class="btn sm" id="e-people" data-act="sheet" data-sheet="people">Guards, in People</button></div>`;
  }
  return `<section class="estrip is-${kind}" aria-label="Now">${body}</section>`;
}
// The strip's countdown for the Host at the gate, shorter than the Day panel's.
export function stripText() {
  const r = s.raid;
  if (r?.state !== 'assault') return '';
  const def = defense(s);
  return `The gate is ${Math.round(100 * Math.max(0, r.gate))}% whole and ${r.host > def + 1e-9 ? 'giving' : 'holding'}, ${fmt(r.host)} against ${fmt(def)}; they give up in ${Math.ceil(r.left / TICKS_PER_SEC)} s.`;
}
// More, from the strip: the Day panel, at the card.
const STRIP_CARD = { assault: '.card.raid', fire: '.card.fire', visit: '.card.visit', road: '.card.raid-road' };
export function stripOpen(kind) {
  openSheet('phase');
  requestAnimationFrame(() => document.querySelector(`#sheet-body ${STRIP_CARD[kind] || ''}`)?.scrollIntoView({ block: 'start' }));
}
// The weather (round five): today's, and tomorrow's forecast.
const WX = { clear: 'Clear', rain: 'Rain', fog: 'Fog' };
function skyHUD() {
  if (!s.tuning.weather) return '';
  const now = weatherOf(s);
  const next = forecastOf(s);
  return `<div class="rest wx wx-${now}${next === 'rain' ? ' wx-coming' : ''}" title="Today: ${WX[now]}. Tomorrow: ${next ? WX[next] : 'not known yet'}."><dt>Sky</dt><dd><b>${WX[now]}</b>${next && next !== now ? `<span class="fc">, then ${WX[next].toLowerCase()}</span>` : next ? '<span class="fc"> today and tomorrow</span>' : ''}</dd></div>`;
}

/* ---------------------------------------------------------------- the action bar */

// What needs the player now, for a dot on the panel button.
function attention() {
  const r = s.raid;
  if (s.phase === 'day') return !!((r && r.warned && r.state === 'coming' && defense(s) + musterGain(s) < r.strength) || (s.inspection && !s.inspection.done && s.inspection.day === s.day) || s.hungry || s.visitors?.some((v) => v.here && !v.done));
  if (s.phase === 'dusk') return s.dusk.step === 'crypt';
  return s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over';
}
export const SHEET_NAME = () =>
  ({ day: 'Day', dusk: s.dusk?.step === 'crypt' ? 'Crossing' : 'Dusk', night: 'Night', dawn: 'Rite', end: 'Season', over: 'Lost' })[s.phase];

export function barHTML() {
  if (ui.watch) return watchBarHTML();
  const place = s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place') || eclipseNow();
  const tool = (id, label) => `<button class="btn sm" id="tool-${id}" data-act="tool" data-tool="${id}" aria-pressed="${ui.tool === id}">${label}</button>`;
  const flip = `<button class="btn sm" id="btn-flip" data-act="flip" aria-pressed="${prefs.mode === 'flipped'}" title="Turn the Tain upright (V)">Flip</button>`;
  let tools = '';
  if (eclipseNow()) {
    tools = `${tool('candle', wispNow() ? `Wisp −${fmt(s.tuning.wispCost)}` : `Candle ${floor1(s.res.candles)}`)}${tool('move', 'Move')}${tool('ward', `Ward ${fmt(wardCost(s))}`)}`;
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
    tools = `${tool('candle', wispNow() ? `Wisp −${fmt(s.tuning.wispCost)}` : `Candle ${floor1(s.res.candles)}`)}${tool('move', 'Move')}${tool('ward', `Ward ${fmt(wardCost(s))}`)}`;
    tools += s.phase === 'night' ? `<button class="btn sm" id="btn-hush" data-act="hush" aria-pressed="${!!s.night?.hush}">Hush</button>` : '';
    const d = s.phase === 'night' && s.tuning.acts ? byId(s.shades, ui.selected) : null;
    const a = d && canWork(d) && actOf(d);
    if (a) tools += `<button class="btn sm act" id="btn-act" data-act="shade-act" data-id="${d.id}"${canAct(s, d) ? '' : ' disabled'} title="${ACTS[a].name} (A)">${ACTS[a].name}${(d.acted || 0) >= actsFor(s, d) ? ': spent' : ` −${fmt(actCost(s, d))}`}</button>`;
    const lit = s.tuning.lanterns ? byId(s.shades, ui.selected) : null;
    if (lit && canWork(lit)) {
      const held = s.night?.candles.some((k) => k.carrier === lit.id);
      tools += `<button class="btn sm" id="btn-lantern" data-act="lantern" data-id="${lit.id}"${held || s.res.candles + 1e-9 >= (s.tuning.lanternCost ?? 1) ? '' : ' disabled'} title="A lantern for ${esc(lit.name)} (T)">${held ? 'Set lantern down' : `Lantern −${fmt(s.tuning.lanternCost ?? 1)} candle`}</button>`;
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
  const back = takingBack();
  if (ui.tool === 'candle') {
    if (wispNow()) return `No candles left: a tap burns ${fmt(T.wispCost)} essence as a wisp, a pale light for about a tide (${fmt(T.wispSecs)} s). The Chandlery makes candles by day.`;
    return s.res.candles >= 1
      ? `${eclipseNow() ? 'The eclipse: tap a floor below the Veil' : 'Tap a floor'} to set a candle. It lights its own room; the Unlit can't enter the light. A tap on a shade in the light picks it.${back && s.night.candles.length ? ' Tap a candle to take it back.' : ''}`
      : `No candles left. The Chandlery makes them by day; the Wick Room saves them at night.${back && s.night.candles.length ? ' Tap a candle to take it back.' : ''}`;
  }
  if (ui.tool === 'ward') return `Tap a stair or a rift${raining(s) ? ", or an end of the moat's twin under the Veil," : ''} to seal it until dawn (${fmt(wardCost(s))} essence${wardCost(s) < T.wardCost ? ', cheaper while a Bitter shade stays' : ''}). ${back && s.night.wards.length ? 'Tap a ward to lift it.' : `The Hollow breaks a ward in ${T.wardHold} s.`}`;
  if (!d) return 'Tap a shade to pick it, then tap where it should stand.';
  if (s.phase === 'dusk') return `${d.name}: tap a spot to post ${d.name} there.`;
  const a = T.acts && actOf(d);
  const act = !a ? '' : (d.acted || 0) >= actsFor(s, d) ? ` Its ${actsFor(s, d) > 1 ? 'acts are' : 'act is'} spent tonight.` : ` ${ACTS[a].name} (A, −${fmt(actCost(s, d))} memory): ${actText(T, a)}.`;
  return `${d.name}: tap a spot to send ${d.name} there. The dark between is dangerous.${act}`;
}

export function showHint() {
  const hint = hintText();
  const el = document.getElementById('stage-hint');
  if (el.textContent !== hint) el.textContent = hint;
}

/* ---------------------------------------------------------------- explanations */

// Round seven, phase 4: fewer words. A panel's standing explanation is shown in full the first time a keep shows
// it (once), and from then on folds to a "?" with a short label, opened in place, with a way on to How to play.
// A legend or a rule met later is folded from the start (aside). What a keep has read goes with it (s.read),
// marked when the panel it was shown in closes.
function why(id, html, label, howto) {
  const key = `why-${id}`;
  const more = howto ? `<p class="why-more"><button class="linkish" data-act="howto" data-sec="${howto}">More in How to play</button></p>` : '';
  return `<details class="why" data-keep="${key}"${ui.open[key] ? ' open' : ''}><summary><span class="q" aria-hidden="true">?</span>${esc(label)}</summary><div class="why-body">${html}${more}</div></details>`;
}
export function once(id, html, label, howto) {
  if (s.read?.[id] || ui.watch) return why(id, html, label, howto);
  ui.reading.add(id);
  return html;
}
export const aside = why;
export function markRead() {
  if (!ui.reading.size || ui.watch) return;
  s.read = { ...(s.read || {}) };
  for (const id of ui.reading) s.read[id] = 1;
  ui.reading.clear();
  setDirty(true);
}
// How to play, opened at a section.
export function openHowto(sec) {
  ui.menuTab = 'howto';
  openSheet('menu');
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`howto-${sec}`)?.scrollIntoView({ block: 'start' })));
}
