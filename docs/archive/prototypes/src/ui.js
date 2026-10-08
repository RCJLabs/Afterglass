// Greybox UI: boxes and text over the simulation. Each section is an HTML string rebuilt only when
// the game changes (s.rev) or the UI does (ui.rev); clocks, bars and counters update every frame.
// The UI never edits game state directly: everything goes through act() so sessions replay.

import { TICKS_PER_SEC, DAY_ROOMS, NIGHT_ROOMS, KINDS, TRAITS, SHADE_TRAITS, CAUSES, MIRRORS } from './data.js';
import {
  newGame, step, act, fmt, dayTicks, nightTicks, byId, ledgerOf, capacity, mirrorCap, canWork, livingMult,
  shadeMult, roomPower, defense, priests, funeralCap, eatRate, crossingPreview, ritePreview, choicesFor,
  isTwinnedLiving, isTwinnedShade, griefMult, FEELS, SAVE_VERSION,
} from './sim.js';

const SAVE_KEY = 'afterglass-greybox/save/v1';
const PREF_KEY = 'afterglass-greybox/prefs/v1';
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
      // Storage blocked or full: the game still runs, it just won't resume after a reload.
    }
  },
};

const prefs = { speed: 1, tab: 'ledger', autoPause: true, introDone: false, notes: '', ...(store.get(PREF_KEY) || {}) };
const savePrefs = () => store.set(PREF_KEY, prefs);

function loadGame() {
  const g = store.get(SAVE_KEY);
  if (!g || g.v !== SAVE_VERSION || !Array.isArray(g.living)) return null;
  g.alerts = [];
  return g;
}
const saveGame = () => store.set(SAVE_KEY, { ...s, alerts: [] });

let s = loadGame() || newGame();
const ui = { paused: true, rev: 0, toasts: [], toastRev: 0, confirmNew: false, directorId: '', copied: '', showExport: false };
const bump = () => {
  ui.rev++;
};

/* ---------------------------------------------------------------- words */

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const signed = (x) => `${x < -0.049 ? '−' : '+'}${fmt(Math.abs(x))}`;
const inDays = (ticks) => fmt(Math.max(0, ticks) / dayTicks(s));
const ticking = () => s.phase === 'day' || s.phase === 'night';
const roleOf = (job) => (job ? DAY_ROOMS[job].role : 'no job');
const nameOf = (id) => (byId(s.living, id) || byId(s.shades, id) || byId(s.bodies, id) || ledgerOf(s, id))?.name ?? '?';
const outText = (out, v) => (out === 'defense' ? `${fmt(v)} defense` : out === 'healing' ? `${fmt(v)} cures/day` : `${fmt(v)} ${out}/day`);

const PHASE = { day: 'is-day', dusk: 'is-dusk', night: 'is-night', rite: 'is-rite', fallen: 'is-fallen' };
const FEEL_LABEL = { loss: 'A loss', hire: 'A hire', both: 'Both', neither: 'Neither' };
const OUT_LABEL = { essence: 'essence', glass: 'glass', guidance: 'guidance', hold: 'on watch' };
const CHOICE = { keep: 'Keep', cover: 'Cover', release: 'Release', leave: 'Leave', bind: 'Bind', banish: 'Banish' };
const ENDS = { funeral: 'laid to rest', covered: 'released', released: 'released', taken: 'taken by the inspector', banished: 'banished' };

function hhmm(h) {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.floor(((x - hh) * 60) / 10) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function worldTime() {
  if (s.phase === 'day') return hhmm(6 + (12 * s.t) / dayTicks(s));
  if (s.phase === 'night') return hhmm(18 + (12 * s.t) / nightTicks(s));
  return { dusk: '18:00', rite: '06:00' }[s.phase] ?? '--:--';
}
const phaseLabel = () => ({ day: `Day ${s.day}`, dusk: `Dusk, day ${s.day}`, night: `Night ${s.day}`, rite: `Dawn, day ${s.day + 1}`, fallen: 'Fallen' })[s.phase];

function partner(id) {
  const p = byId(s.living, id);
  if (p) return `living, ${roleOf(p.job)}`;
  if (byId(s.bodies, id)) return 'in the crypt';
  const d = byId(s.shades, id);
  if (d) return d.mirror ? `a ${KINDS[d.kind].name} shade` : KINDS[d.kind].name;
  return ENDS[ledgerOf(s, id)?.end] ?? 'gone';
}
function bondLine(x) {
  if (!x.bond) return x.from === 'raider' ? 'No bonds in the keep' : 'No close bonds';
  return `${cap1(x.bond.rel)} of ${esc(nameOf(x.bond.with))} (${esc(partner(x.bond.with))})`;
}
const traitPair = (d) => `<span class="inv">${TRAITS[d.was].name} → <b>${SHADE_TRAITS[d.trait].name}</b></span>`;
const madeText = (made) =>
  Object.entries(made || {})
    .filter(([, v]) => v > 0.05)
    .map(([k, v]) => `${fmt(v)} ${OUT_LABEL[k] || k}`)
    .join(', ');
const pips = (n, max) =>
  `<span class="pips${n >= max - 1 ? ' hot' : ''}" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

/* ---------------------------------------------------------------- controls shared by sections */

function jobSelect(p) {
  const opts = [['', 'No job'], ...Object.entries(DAY_ROOMS).map(([k, R]) => [k, `${R.name}, ${R.role}`])];
  return `<select id="job-${p.id}" data-act="assign" data-id="${p.id}" aria-label="Job for ${esc(p.name)}">${opts
    .map(([v, l]) => `<option value="${v}"${(p.job || '') === v ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;
}
function postSelect(d, prefix = 'post') {
  const opts = Object.entries(NIGHT_ROOMS).map(
    ([k, R]) => `<option value="${k}"${d.post === k ? ' selected' : ''}${R.out ? '' : ' disabled'}>${esc(R.name)}${R.out ? '' : ' (weeks 3–4)'}</option>`,
  );
  return `<select id="${prefix}-${d.id}" data-act="post" data-id="${d.id}" aria-label="Night post for ${esc(d.name)}"><option value=""${d.post ? '' : ' selected'}>Waking Room, no post</option>${opts.join('')}</select>`;
}
function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New keep</button></div>';
  return `<div class="confirm">
    <p>Start a new keep? This replaces the saved keep${s.ledger.length ? ' and its ledger. Copy the playtest export first if you want it' : ''}.</p>
    <div class="row"><label for="new-seed">Seed</label><input id="new-seed" type="text" inputmode="numeric" placeholder="random" size="10">
    <button class="btn primary" id="btn-new-yes" data-act="new-yes">Start a new keep</button><button class="btn" id="btn-new-no" data-act="new-no">Cancel</button></div>
  </div>`;
}

/* ---------------------------------------------------------------- header */

function hudHTML() {
  const cap = capacity(s);
  const foodRate = roomPower(s, 'day').hearth * DAY_ROOMS.hearth.rate - eatRate(s);
  const running = ticking() && !ui.paused;
  const D = s.tuning.dread;
  return `<div class="hud-top">
    <p class="brand">Afterglass<span>greybox, weeks 1–2</span></p>
    <div class="clock ${PHASE[s.phase]}">
      <span class="pill">${phaseLabel()}</span>
      <span class="time" data-live="clock">${worldTime()}</span>
      <span class="bar" aria-hidden="true"><i data-bar="phase"></i></span>
    </div>
    <div class="controls">
      <button class="btn" id="btn-play" data-act="play"${ticking() ? '' : ' disabled'}>${running ? 'Pause' : 'Play'}</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4]
        .map((v) => `<button class="btn" id="speed-${v}" data-act="speed" data-v="${v}" aria-pressed="${prefs.speed === v}">${v}×</button>`)
        .join('')}</div>
      <button class="btn" id="btn-skip" data-act="skip"${ticking() ? '' : ' disabled'}>${s.phase === 'night' ? 'Skip to dawn' : 'Skip to dusk'}</button>
    </div>
  </div>
  <dl class="res">
    <div><dt>Food</dt><dd><b data-live="res" data-arg="food">${s.res.food.toFixed(1)}</b> <small class="${foodRate < -0.049 ? 'neg' : 'pos'}">${signed(foodRate)}/day</small></dd></div>
    <div><dt>Glass</dt><dd><b data-live="res" data-arg="glass">${Math.floor(s.res.glass)}</b></dd></div>
    <div><dt>Essence</dt><dd><b data-live="res" data-arg="essence">${Math.floor(s.res.essence)}</b></dd></div>
    <div><dt>Remembrance</dt><dd><b data-live="res" data-arg="remembrance">${Math.floor(s.res.remembrance)}</b></dd></div>
    <div><dt>Dread</dt><dd>${pips(s.dread, D.max)} <b>${s.dread}</b>/${D.max}</dd></div>
    <div><dt>Mirrors</dt><dd><b>${cap.used}</b>/${cap.cap}</dd></div>
    <div><dt>Guidance</dt><dd><b>${s.guidance}</b></dd></div>
  </dl>`;
}

/* ---------------------------------------------------------------- the phase panel */

function introHTML() {
  return `<div class="card intro">
    <h2>What this greybox tests</h2>
    <p>Weeks 1–2 of the Afterglass plan: two rosters and the Rite. The question is <b>does a death feel like a loss and a hire at once?</b></p>
    <ul>
      <li><b>Day.</b> The living work the rooms. Raids, sickness, old age and hunger kill people.</li>
      <li><b>Dusk.</b> The day's dead wake as shades. How someone died decides what wakes, and every shade needs room in a mirror.</li>
      <li><b>Night.</b> Shades work the twin rooms for essence, glass, guidance and the Watch.</li>
      <li><b>Dawn.</b> Keep or cover each shade. Keeping raises Dread; at ${s.tuning.dread.inspectorAt} the Church sends an inspector.</li>
      <li><b>After each death,</b> mark how it felt in the Loss &amp; hire tab.</li>
    </ul>
    <p class="hint">Boxes and text only. Candles, Creepers and fading arrive with the weeks 3–4 greybox. Progress saves at each dawn.</p>
    <div class="row"><button class="btn primary" id="btn-intro" data-act="intro-start">${ticking() ? `Start ${phaseLabel().toLowerCase()}` : 'Got it'}</button><button class="btn" id="btn-intro-close" data-act="intro-close">Hide</button></div>
  </div>`;
}

function phaseHTML() {
  const panel = { day: dayPanel, dusk: duskPanel, night: nightPanel, rite: ritePanel, fallen: fallenPanel }[s.phase];
  return (prefs.introDone ? '' : introHTML()) + panel();
}

function dayPanel() {
  const out = [
    `<header class="ph-head"><h2>Day ${s.day}</h2><p>The living work the rooms. Anyone who dies lies in the crypt until dusk, then wakes as a shade if a mirror has room.</p></header>`,
  ];
  const r = s.raid;
  if (r?.warned && r.state === 'coming') {
    const def = defense(s);
    const short = def + 1e-9 < r.strength;
    out.push(`<div class="card ${short ? 'warn' : 'ok'}">
      <h3>Raiders on the road</h3>
      <p>${r.count} of the Ashen Host, strength <b class="num">${fmt(r.strength)}</b>. Your defense is <b class="num">${fmt(def)}</b>${r.ward || s.watchBonus ? `, including ${listOf([r.ward ? `a ward of +${r.ward}` : '', s.watchBonus ? `+${fmt(s.watchBonus)} from the Watch of the Dead` : ''].filter(Boolean))}` : ''}. They reach the gate at ${hhmm(6 + (12 * r.hitAt) / dayTicks(s))}.</p>
      <p class="hint">${short ? `Too few on the walls. Each guard adds ${DAY_ROOMS.barracks.rate} defense. If they break in, someone in the yard dies and stores are taken, but the raiders cut down inside the walls wake too.` : 'The gate should hold. Guards can still fall.'}</p>
      ${r.ward ? '' : `<div class="row"><button class="btn sm" id="btn-ward" data-act="ward" data-need="essence:${s.tuning.wardCost}">Ward the gate: ${s.tuning.wardCost} essence for +${s.tuning.wardDefense} defense</button></div>`}
      <span class="bar" aria-hidden="true" style="width:100%;--ph:var(--bad)"><i data-bar="raid"></i></span>
    </div>`);
  } else if (r && r.state !== 'coming') {
    out.push(`<p class="note">${r.state === 'held' ? 'The gate held today.' : 'The raiders broke through today.'}</p>`);
  }
  const sick = s.living.filter((p) => p.sick > 0);
  if (sick.length) {
    const cures = roomPower(s, 'day').infirmary;
    out.push(`<div class="card"><h3>Sick</h3>${sick
      .map((p) => `<div class="sickrow"><span>${esc(p.name)}</span><span class="bar" aria-hidden="true"><i data-bar="sick" data-arg="${p.id}"></i></span><small>dies in <span data-live="sick" data-arg="${p.id}">${inDays(p.sick)}</span> days</small></div>`)
      .join('')}<p class="hint">The infirmary cures ${fmt(cures)} a day as staffed.${cures < 0.05 ? ' No one is healing: move someone to the Infirmary.' : ''} A sickness death wakes Pale.</p></div>`);
  }
  if (s.hungry) {
    out.push('<div class="card warn"><h3>The larder is empty</h3><p>Everyone works hungry, and every half day without food the weakest dies of neglect and wakes Restless. Move people to the Hearth.</p></div>');
  }
  const idle = s.living.filter((p) => !p.job);
  if (idle.length) out.push(`<p class="note">${esc(listOf(idle.map((p) => p.name)))} ${idle.length === 1 ? 'has' : 'have'} no job. Assign one in the roster.</p>`);
  if (s.guidance) out.push(`<p class="note">The Threshold will guide the next ${plural(s.guidance, 'death')} from sickness or neglect toward a better shade.</p>`);
  if (s.bodies.length) out.push(cryptCard(false));
  if (!r?.warned && !sick.length && !s.bodies.length && !s.hungry && !idle.length) {
    out.push('<p class="note">A quiet morning. Jobs are set in the roster; the clock runs to dusk.</p>');
  }
  return out.join('');
}

function cryptCard(atDusk) {
  const cap = funeralCap(s);
  const planned = s.bodies.filter((b) => b.funeral).length;
  const rows = crossingPreview(s)
    .map((x) => {
      const b = x.b;
      const fate = {
        funeral: 'Funeral: laid to rest, never wakes',
        mirror: `Wakes ${KINDS[b.kind].name} in the ${x.mirror?.name}`,
        overflow: 'No mirror has room: wakes Restless',
        restless: 'Wakes Restless',
        wraith: 'Wakes as a Wraith',
      }[x.to];
      const bad = x.to === 'overflow' || x.to === 'restless' || x.to === 'wraith';
      const full = !b.funeral && planned >= cap;
      return `<li>
        <div><b>${esc(b.name)}</b> <small>${b.from === 'raider' ? 'raider' : esc(roleOf(b.job))}, ${esc(b.how)}${b.guided ? ', guided' : ''}</small></div>
        <div class="fate${bad ? ' bad' : ''}">→ ${esc(fate)}</div>
        <button class="btn sm" id="fun-${b.id}" data-act="funeral" data-id="${b.id}" aria-pressed="${b.funeral}"${full ? ' disabled' : ''}>Funeral</button>
      </li>`;
    })
    .join('');
  return `<div class="card">
    <h3>The crypt</h3>
    <ul class="bodies">${rows}</ul>
    <p class="hint">Funerals ${planned} of ${cap}: one per priest in the Chapel. A funeral gives 1 remembrance and brings the bonded peace, but the body never wakes.</p>
    ${atDusk ? '<div class="row"><button class="btn primary" id="btn-wake" data-act="wake">Let the dead wake</button></div>' : ''}
  </div>`;
}

function duskPanel() {
  if (s.dusk.step === 'crypt') {
    return `<header class="ph-head"><h2>Dusk: the Crossing</h2><p>Each body in the crypt wakes as a shade if a mirror has room. How someone died decides what wakes: duty makes Loyal shades, old age Serene, sickness Pale, neglect Restless, and a killing you ordered makes a Wraith.</p></header>${cryptCard(true)}`;
  }
  const working = s.shades.filter(canWork);
  const waiting = s.shades.filter((d) => !canWork(d));
  return `<header class="ph-head"><h2>Dusk: post the shades</h2><p>Shades work the twin rooms tonight. A shade posted to the twin of its bonded partner's room is twinned, and both work ×${s.tuning.twinMult}.</p></header>
    ${working.length
      ? `<ul class="postlist">${working
          .map((d) => `<li><div class="who"><div><b>${esc(d.name)}</b> <span class="kind k-${d.kind}">${KINDS[d.kind].name}</span></div>${traitPair(d)}</div>${postSelect(d, 'dpost')}<span class="mult">×${shadeMult(s, d).toFixed(2)}</span></li>`)
          .join('')}</ul>`
      : '<p class="note">No shade can work tonight.</p>'}
    ${waiting.length ? `<p class="note">${esc(listOf(waiting.map((d) => `${d.name} (${KINDS[d.kind].name})`)))} ${waiting.length === 1 ? 'waits' : 'wait'} at the edge of the Deep.</p>` : ''}
    <div class="row"><button class="btn primary" id="btn-night" data-act="beginNight">Begin the night</button></div>`;
}

function nightPanel() {
  const pw = roomPower(s, 'night');
  const restless = s.shades.filter((d) => d.kind === 'restless');
  const calm = s.shades.filter((d) => d.post === 'choir' && shadeMult(s, d) > 0).length;
  const facts = [
    ['Essence from the Choir', `+${fmt(pw.choir * NIGHT_ROOMS.choir.rate)}`],
    ['Glass from the Silvering', `+${fmt(pw.silvering * NIGHT_ROOMS.silvering.rate)}`],
    ['Guidance from the Threshold', `+${fmt(pw.threshold * NIGHT_ROOMS.threshold.rate)}`],
    ['Wraiths the Watch can hold', String(Math.floor(pw.watch * NIGHT_ROOMS.watch.rate + 1e-9))],
    ["Tomorrow's defense from the Watch", `+${fmt(s.watchBonus)}`],
    ['Restless calmed by the Choir', `${Math.min(calm, restless.length)} of ${restless.length}`],
  ];
  return `<header class="ph-head"><h2>Night ${s.day}</h2><p>The living sleep. The shades work the twin rooms until dawn, when you decide who stays.</p></header>
    <ul class="facts">${facts.map(([k, v]) => `<li><span>${k}</span><b class="num">${v}</b></li>`).join('')}</ul>
    ${s.haunt.night.length ? `<p class="note bad">Haunted tonight: ${esc(listOf(s.haunt.night.map((r) => NIGHT_ROOMS[r].name)))}. No work there, and the room above works at half tomorrow.</p>` : ''}
    ${restless.length ? `<p class="note">${esc(listOf(restless.map((d) => `${d.name} (${plural(s.tuning.restlessNights - d.restless, 'night')} left)`)))} ${restless.length === 1 ? 'is' : 'are'} Restless. Release them at dawn or they turn Wraith.</p>` : ''}
    <p class="hint">Shades can change posts during the night from the roster.</p>`;
}

function bondEffect(d) {
  const p = d.bond ? byId(s.living, d.bond.with) : null;
  if (!p) return '';
  const bits = [];
  if (p.grief?.for === d.id) {
    const g = griefMult(s, p);
    bits.push(g < 1 ? `${p.name} grieves (×${g}) until ${d.name} is released` : `${p.name} does not grieve: ${d.name} is Wistful`);
  }
  if (isTwinnedShade(s, d)) bits.push('twinned across the Veil');
  return bits.length ? `. ${esc(cap1(bits.join('; ')))}` : '';
}

function riteRow(d) {
  const T = s.tuning;
  const c = s.rite.choice[d.id];
  const e = ledgerOf(s, d.id);
  const m = d.mirror ? byId(s.mirrors, d.mirror) : null;
  const made = madeText(e?.made);
  const cost = { bind: `, ${T.bindCost} essence`, banish: `, ${T.banishCost} essence` };
  const opts = choicesFor(d)
    .map((ch) => `<button class="btn sm" id="rite-${d.id}-${ch}" data-act="rite" data-id="${d.id}" data-choice="${ch}" aria-pressed="${c === ch}">${CHOICE[ch]}${cost[ch] || ''}</button>`)
    .join('');
  const feel =
    d.rites === 0 && d.from === 'living'
      ? `<div class="feel" role="group" aria-label="How did ${esc(d.name)}'s death feel?"><span>Playtest: ${esc(d.name)}'s death felt like</span>${FEELS.map(
          (f) => `<button class="btn sm" id="feel-${d.id}-${f}" data-act="feel-btn" data-id="${d.id}" data-feel="${f}" aria-pressed="${e?.feel === f}">${FEEL_LABEL[f].toLowerCase()}</button>`,
        ).join('')}</div>`
      : '';
  const who = e ? `${e.from === 'raider' ? 'Raider' : cap1(roleOf(e.job))}, ${e.how} on day ${e.day}` : '';
  return `<article class="rite-row${c === 'cover' || c === 'release' ? ' is-cover' : ''}">
    <div class="who">
      <span class="eyebrow">${esc(m ? cap1(m.name) : 'No mirror')}</span>
      <div><b>${esc(d.name)}</b> <span class="kind k-${d.kind}">${KINDS[d.kind].name}</span> ${traitPair(d)}</div>
      <small>${esc(who)}. ${plural(d.nights, 'night')} served${made ? `, made ${esc(made)}` : ''}.</small>
      <small>${bondLine(d)}${bondEffect(d)}.</small>
      ${d.kind === 'restless' || d.kind === 'wraith' ? `<div>${shadeTags(d)}</div>` : ''}
    </div>
    <div class="opts" role="group" aria-label="Choice for ${esc(d.name)}">${opts}</div>
    ${feel}
  </article>`;
}

function ritePanel() {
  const P = ritePreview(s);
  const T = s.tuning;
  const D = P.dread;
  const made = s.today.made;
  const since = ['food', 'glass', 'essence', 'remembrance'].filter((k) => (made[k] || 0) > 0.05).map((k) => `${fmt(made[k])} ${k}`);
  const deaths = s.today.deaths.length;
  const parts = [];
  if (D.keep) parts.push(`+${D.keep} kept`);
  if (D.restless) parts.push(`+${D.restless} Restless`);
  if (D.wraith) parts.push(`+${D.wraith} Wraiths`);
  parts.push(`−${D.bear} the living bear (${s.living.length} living ÷ ${T.dread.livingPer}, plus ${plural(priests(s), 'priest')})`);
  if (D.vigils) parts.push(`−${plural(D.vigils, 'vigil')}`);
  const tail = [
    P.rem ? `Remembrance +${P.rem}.` : '',
    P.remCost ? `Vigils cost ${P.remCost} remembrance.` : '',
    P.essence ? `Essence −${P.essence}.` : '',
    P.peace.length ? `At peace: ${esc(listOf(P.peace.map((p) => p.name)))}.` : '',
  ].filter(Boolean);
  return `<header class="ph-head"><h2>Dawn: the Rite</h2><p>Keep a shade and it works tomorrow night, but Dread rises. Cover its mirror and the shade is released: 1 remembrance, and anyone bonded to it is at peace.</p></header>
    <p class="hint">Since yesterday's dawn: ${since.length ? esc(since.join(', ')) : 'nothing made'}${deaths ? `; ${plural(deaths, 'death')}` : ''}.</p>
    ${s.shades.length ? `<div class="rite-list">${s.shades.map(riteRow).join('')}</div>` : '<p class="note">No shades to judge this dawn.</p>'}
    <div class="vigil"><span class="eyebrow">Vigils</span><button class="btn sm" id="vig-minus" data-act="vigil" data-d="-1" aria-label="One vigil fewer"${s.rite.vigils ? '' : ' disabled'}>−</button><b>${s.rite.vigils}</b><button class="btn sm" id="vig-plus" data-act="vigil" data-d="1" aria-label="One vigil more">+</button><small class="muted">${T.vigilCost} remembrance each, −1 Dread</small></div>
    <div class="preview">
      <p class="big">Dread ${D.from} → ${D.to} ${pips(D.to, T.dread.max)}</p>
      <p class="hint">${esc(parts.join(', '))}.</p>
      <p>Tomorrow night: <b>${plural(P.tonight, 'shade')}</b> at work. ${tail.join(' ')}</p>
      ${P.inspector ? `<p class="note bad">Dread ${T.dread.inspectorAt}: at daybreak the Lantern Church sends an inspector, who covers your fullest mirror and takes its shades. Taken shades bring no one peace.</p>` : ''}
      ${P.errors.map((e) => `<p class="note bad">${esc(e)}</p>`).join('')}
    </div>
    <div class="row"><button class="btn primary" id="btn-day" data-act="beginDay"${P.errors.length ? ' disabled' : ''}>Begin day ${s.day + 1}</button></div>`;
}

function fallenPanel() {
  const ours = s.ledger.filter((e) => e.from === 'living').length;
  const woke = s.ledger.filter((e) => e.woke && e.woke !== 'funeral').length;
  return `<header class="ph-head"><h2>The keep has fallen</h2><p>Day ${s.day}. ${plural(ours, 'person', 'people')} died and ${plural(woke, 'shade')} woke in all.</p></header>
    <p class="note">Before starting again, mark how the deaths felt in the Loss &amp; hire tab and copy the export from the Playtest tab.</p>
    ${newKeepControls()}`;
}

/* ---------------------------------------------------------------- the keep */

const DAY_GRID = ['hearth', 'glazier', 'chapel', 'barracks', 'infirmary', 'crypt'];
// The Tain is the keep flipped top to bottom: the bottom row by day is the top row by night.
const NIGHT_GRID = ['threshold', 'waking', 'choir', 'watch', 'coldhearth', 'silvering'];

function livingChip(p) {
  const dots = [];
  if (p.sick > 0) dots.push('<i class="dot sick"></i>');
  if (p.grief && griefMult(s, p) < 1) dots.push('<i class="dot grief"></i>');
  if (p.peace > 0) dots.push('<i class="dot peace"></i>');
  if (isTwinnedLiving(s, p)) dots.push('<i class="dot twin"></i>');
  return `<button class="chip" id="chip-${p.id}" data-act="focus" data-id="${p.id}" title="Show ${esc(p.name)} in the roster">${esc(p.name)}<small>×${livingMult(s, p).toFixed(2)}</small>${dots.join('')}</button>`;
}
function shadeChip(d) {
  return `<button class="chip shade" id="chip-${d.id}" data-act="focus" data-id="${d.id}" title="Show ${esc(d.name)} in the roster">${esc(d.name)}<small>${KINDS[d.kind].name} ×${shadeMult(s, d).toFixed(2)}</small>${isTwinnedShade(s, d) ? '<i class="dot twin"></i>' : ''}</button>`;
}

function dayRoom(r, pw) {
  const R = DAY_ROOMS[r];
  const people = s.living.filter((p) => p.job === r);
  const haunted = s.haunt.day.includes(r);
  return `<div class="room${haunted ? ' haunted' : ''}">
    <div class="room-head"><h3>${R.name}</h3><span class="out">${outText(R.out, pw[r] * R.rate)}</span></div>
    <p class="room-job">${esc(R.job(R))}</p>
    ${haunted ? '<p><span class="tag sick">Haunted: half work today</span></p>' : ''}
    <div class="chips">${people.map(livingChip).join('') || '<span class="empty">No one</span>'}</div>
  </div>`;
}
function cryptBox() {
  return `<div class="room">
    <div class="room-head"><h3>Crypt</h3><span class="out">${plural(s.bodies.length, 'body', 'bodies')}</span></div>
    <p class="room-job">The day's dead wait here for dusk.</p>
    <div class="chips">${s.bodies.map((b) => `<span class="chip body">${esc(b.name)}<small>${b.funeral ? 'funeral' : KINDS[b.kind].name}</small></span>`).join('') || '<span class="empty">Empty</span>'}</div>
  </div>`;
}
function nightRoom(r, pw) {
  const R = NIGHT_ROOMS[r];
  const twin = DAY_ROOMS[R.twin].name;
  if (!R.out) {
    return `<div class="room placeholder"><div class="room-head"><h3>${R.name}</h3><span class="out">weeks 3–4</span></div><p class="room-job">Twin of the ${twin}. ${esc(R.job(R))}</p></div>`;
  }
  const v = pw[r] * R.rate;
  const out = r === 'watch' ? `holds ${Math.floor(v + 1e-9)}` : `+${fmt(v)} ${R.out}/night`;
  const shades = s.shades.filter((d) => d.post === r && canWork(d));
  const haunted = s.haunt.night.includes(r);
  return `<div class="room${haunted ? ' haunted' : ''}">
    <div class="room-head"><h3>${R.name}</h3><span class="out">${out}</span></div>
    <p class="room-job">Twin of the ${twin}. ${esc(R.job(R))}</p>
    ${haunted ? '<p><span class="tag sick">Haunted tonight</span></p>' : ''}
    <div class="chips">${shades.map(shadeChip).join('') || '<span class="empty">No one posted</span>'}</div>
  </div>`;
}
function wakingBox() {
  const idle = s.shades.filter((d) => canWork(d) && !d.post);
  return `<div class="room">
    <div class="room-head"><h3>Waking Room</h3><span class="out">twin of the Crypt</span></div>
    <p class="room-job">The dead wake here. A shade with no post waits here and does nothing.</p>
    <div class="chips">${idle.map(shadeChip).join('') || '<span class="empty">No one waiting</span>'}</div>
  </div>`;
}
function deepBox() {
  const lost = s.shades.filter((d) => !canWork(d));
  return `<div class="deep">
    <h3>The edge of the Deep</h3>
    <p class="hint">Shades with no mirror. Restless shades turn Wraith after ${plural(s.tuning.restlessNights, 'night')} unless released at dawn.</p>
    <div class="chips">${lost
      .map((d) => `<button class="chip bad" id="chip-${d.id}" data-act="focus" data-id="${d.id}">${esc(d.name)}<small>${d.kind === 'restless' ? `Restless, ${plural(s.tuning.restlessNights - d.restless, 'night')} left` : 'Wraith'}</small></button>`)
      .join('') || '<span class="empty">Quiet</span>'}</div>
  </div>`;
}
function veilHTML() {
  const cap = capacity(s);
  const mirrors = s.mirrors
    .map((m) => {
      const inside = s.shades.filter((d) => d.mirror === m.id);
      const slots = Array.from({ length: mirrorCap(m) }, (_, i) => (inside[i] ? `<span class="slot full">${esc(inside[i].name)}</span>` : '<span class="slot">empty</span>')).join('');
      return `<div class="mirror"><span class="mname">${esc(cap1(m.name))}</span><span class="slots">${slots}</span></div>`;
    })
    .join('');
  const build = Object.entries(MIRRORS)
    .map(([k, M]) => `<button class="btn sm" id="build-${k}" data-act="build" data-m="${k}" data-need="glass:${M.glass}">${cap1(M.name)}: ${M.glass} glass, room for ${M.cap}</button>`)
    .join('');
  return `<div class="veil">
    <div class="veil-head"><h2>The Veil: mirrors ${cap.used}/${cap.cap}</h2><p>Every shade needs room in a mirror. The dead beyond that wake Restless.</p></div>
    <div class="mirrors">${mirrors}</div>
    <div class="build"><span>Build</span>${build}</div>
  </div>`;
}
function keepHTML() {
  const pwD = roomPower(s, 'day');
  const pwN = roomPower(s, 'night');
  return `<div class="band day"><h2>By day: the keep</h2><p>The living at work</p></div>
    <div class="rooms">${DAY_GRID.map((r) => (r === 'crypt' ? cryptBox() : dayRoom(r, pwD))).join('')}</div>
    ${veilHTML()}
    <div class="band night"><h2>By night: the Tain</h2><p>The same rooms reflected; twins face each other across the Veil</p></div>
    <div class="rooms night">${NIGHT_GRID.map((r) => (r === 'waking' ? wakingBox() : nightRoom(r, pwN))).join('')}</div>
    ${deepBox()}`;
}

/* ---------------------------------------------------------------- the two rosters */

function livingTags(p) {
  const t = [];
  if (p.sick > 0) t.push(`<span class="tag sick">Sick, dies in <span data-live="sick" data-arg="${p.id}">${inDays(p.sick)}</span> days</span>`);
  if (p.grief) {
    const g = griefMult(s, p);
    t.push(g < 1 ? `<span class="tag grief">Grieving ${esc(nameOf(p.grief.for))} ×${g}</span>` : `<span class="tag peace">No grief: ${esc(nameOf(p.grief.for))} is Wistful</span>`);
  }
  if (p.peace > 0) t.push(`<span class="tag peace">At peace ×${s.tuning.peaceMult}, <span data-live="peace" data-arg="${p.id}">${inDays(p.peace)}</span> days</span>`);
  if (isTwinnedLiving(s, p)) t.push(`<span class="tag twin">Twinned with ${esc(nameOf(p.bond.with))} ×${s.tuning.twinMult}</span>`);
  if (s.hungry) t.push(`<span class="tag hungry">Hungry ×${s.tuning.hungryMult}</span>`);
  if (p.job && s.haunt.day.includes(p.job)) t.push(`<span class="tag sick">Haunted room ×${s.tuning.hauntMult}</span>`);
  return t.join('');
}
function shadeTags(d) {
  if (d.kind === 'restless') {
    return `<span class="tag sick">Turns Wraith after ${plural(s.tuning.restlessNights - d.restless, 'more night')}</span>${d.trueKind ? `<span class="tag">Woke ${KINDS[d.trueKind].name} with no mirror: can be bound</span>` : ''}`;
  }
  if (d.kind === 'wraith') return '<span class="tag sick">Haunts a post each night unless the Watch holds it</span>';
  const t = [];
  if (isTwinnedShade(s, d)) t.push(`<span class="tag twin">Twinned with ${esc(nameOf(d.bond.with))} ×${s.tuning.twinMult}</span>`);
  if (d.post && s.haunt.night.includes(d.post) && !SHADE_TRAITS[d.trait]?.hauntImmune) t.push('<span class="tag sick">Haunted tonight</span>');
  if (!d.post) t.push('<span class="tag">No post</span>');
  return t.join('');
}
function livingRow(p) {
  const m = livingMult(s, p);
  const R = p.job && DAY_ROOMS[p.job];
  return `<div class="prow" id="row-${p.id}">
    <div class="pname"><b>${esc(p.name)}</b><small>${p.age}, ${TRAITS[p.trait].name.toLowerCase()}</small></div>
    <div>${jobSelect(p)}</div>
    <div class="pwork"><span class="mult">×${m.toFixed(2)}</span><small>${R ? outText(R.out, m * R.rate) : 'idle'}</small></div>
    <div class="pstat">${livingTags(p)}</div>
    <div class="pbond">${bondLine(p)}. ${esc(TRAITS[p.trait].name)}: ${esc(TRAITS[p.trait].desc)}</div>
  </div>`;
}
function deadRow(d) {
  const m = byId(s.mirrors, d.mirror);
  const ST = SHADE_TRAITS[d.trait];
  return `<div class="prow" id="row-${d.id}">
    <div class="pname"><b>${esc(d.name)}</b><small><span class="kind k-${d.kind}">${KINDS[d.kind].name}</span></small></div>
    <div>${canWork(d) ? postSelect(d) : `<span class="static">${d.kind === 'wraith' ? 'Wraith: no post' : 'Restless: no mirror'}</span>`}</div>
    <div class="pwork"><span class="mult">×${shadeMult(s, d).toFixed(2)}</span><small>${m ? esc(cap1(m.name)) : 'no mirror'}</small></div>
    <div class="pstat">${shadeTags(d)}</div>
    <div class="pbond">${TRAITS[d.was].name} → ${ST.name}: ${esc(ST.desc)} ${esc(KINDS[d.kind].desc)} ${bondLine(d)}. ${plural(d.nights, 'night')} served.</div>
  </div>`;
}
function rostersHTML() {
  return `<section class="roster" aria-labelledby="h-living">
    <div class="roster-head"><h2 id="h-living">The living</h2><span class="count">${s.living.length}</span><p>Work by day. Anyone who dies inside the walls wakes at dusk.</p></div>
    <div class="rows">${s.living.map(livingRow).join('') || '<p class="empty" style="padding:12px">No one is left.</p>'}</div>
  </section>
  <section class="roster dead" aria-labelledby="h-dead">
    <div class="roster-head"><h2 id="h-dead">The dead</h2><span class="count">${s.shades.length}</span><p>Work by night in the twin rooms. Kept or released at dawn.</p></div>
    <div class="rows">${s.shades.map(deadRow).join('') || '<p class="empty" style="padding:12px">No shades yet. The first death changes that.</p>'}</div>
  </section>`;
}

/* ---------------------------------------------------------------- records */

function wokeText(e) {
  if (!e.woke) return '<small>not yet</small>';
  if (e.woke === 'funeral') return 'Funeral, never woke';
  if (e.woke === 'overflow') return 'Restless: no mirror had room';
  return `${KINDS[e.woke].name}${e.mirror ? `<small>${esc(cap1(e.mirror))}</small>` : ''}`;
}
function endText(e) {
  if (e.end) return `${cap1(ENDS[e.end])}<small>day ${e.endDay}</small>`;
  const d = byId(s.shades, e.id);
  if (d) return d.mirror ? 'Kept' : `${KINDS[d.kind].name}${e.turned ? `<small>turned on day ${e.turned}</small>` : ''}`;
  return byId(s.bodies, e.id) ? 'In the crypt' : '—';
}
function ledgerTab() {
  if (!s.ledger.length) {
    return '<p class="hint">No deaths yet. Each death gets a row: what the keep lost by day, what the shade made by night, how it ended, and how it felt to you.</p>';
  }
  const rows = [...s.ledger]
    .reverse()
    .map((e) => `<tr class="${e.from}">
      <td class="num">${e.day}</td>
      <td><b>${esc(e.name)}</b><small>${e.from === 'raider' ? 'raider' : esc(roleOf(e.job))}</small></td>
      <td>${CAUSES[e.cause].name} → ${KINDS[e.kind].name}${e.guided ? '<small>guided by the Threshold</small>' : ''}</td>
      <td>${e.lost ? outText(e.lost.out, e.lost.perDay) : '—'}</td>
      <td>${wokeText(e)}</td>
      <td class="num">${e.nights}</td>
      <td>${esc(madeText(e.made)) || '—'}</td>
      <td>${endText(e)}</td>
      <td>${e.from === 'living'
        ? `<select id="feel-${e.id}" data-act="feel" data-id="${e.id}" aria-label="How ${esc(e.name)}'s death felt"><option value="">Not marked</option>${FEELS.map((f) => `<option value="${f}"${e.feel === f ? ' selected' : ''}>${FEEL_LABEL[f]}</option>`).join('')}</select>`
        : '<small>not asked</small>'}</td>
    </tr>`)
    .join('');
  return `<p class="hint">One row per death, newest first. <b>Lost</b> is what the person produced by day when they died. <b>Made</b> is what the shade has produced by night since. Marking how each death felt is the test for this greybox.</p>
    <div class="table-wrap" id="ledger-wrap"><table class="ledger"><thead><tr><th>Day</th><th>Who</th><th>Death → shade</th><th>Lost</th><th>Woke</th><th>Nights</th><th>Made</th><th>Now</th><th>Felt like</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function logTab() {
  const when = (l) => (l.phase === 'rite' ? `dawn ${l.day + 1}` : `${l.phase === 'fallen' ? 'end' : l.phase} ${l.day}`);
  return `<ul class="log" id="log">${s.log
    .slice(-250)
    .reverse()
    .map((l) => `<li><span class="when">${when(l)}</span><span class="${l.tone}">${esc(l.text)}</span></li>`)
    .join('')}</ul>`;
}
function exportJSON() {
  return JSON.stringify(
    {
      game: 'afterglass-greybox', save: SAVE_VERSION, exported: new Date().toISOString(), seed: s.seed, day: s.day, phase: s.phase,
      notes: prefs.notes, tuning0: s.tuning0, tuning: s.tuning, ledger: s.ledger, days: s.days, actions: s.actions,
    },
    null,
    1,
  );
}
function playtestTab() {
  const ours = s.ledger.filter((e) => e.from === 'living');
  const tally = FEELS.map((f) => `${FEEL_LABEL[f].toLowerCase()} ${ours.filter((e) => e.feel === f).length}`).join(', ');
  return `<p>The question for weeks 1–2: <b>does a death feel like a loss and a hire at once?</b> You have marked ${ours.filter((e) => e.feel).length} of ${plural(ours.length, 'death')} (${tally}). Mark them in the Loss &amp; hire tab or at the rite.</p>
    <label for="notes">Session notes</label>
    <textarea id="notes" rows="4" placeholder="Which death landed? Which felt like nothing? Who did you keep that you should have covered?">${esc(prefs.notes)}</textarea>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy playtest export</button><button class="btn" id="btn-show-export" data-act="show-export" aria-expanded="${ui.showExport}">${ui.showExport ? 'Hide export' : 'Show export'}</button><span class="hint">${esc(ui.copied)}</span></div>
    ${ui.showExport ? `<label for="export">Export (JSON)</label><textarea id="export" rows="8" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">The export holds your notes, the ledger, daily totals, the seed and every action, so the session replays exactly with <code>replay()</code> in <code>src/sim.js</code>.</p>`;
}
const TUNE_FIELDS = [
  ['daySecs', 'Day length, seconds at 1×'],
  ['nightSecs', 'Night length, seconds at 1×'],
  ['sickChance', 'Chance someone falls sick each day'],
  ['oldAgeChance', 'Old-age death chance per old person per day'],
  ['raidPerDay', 'Raid strength added per day'],
  ['newcomerEvery', 'Days between newcomers'],
  ['dread.perKeep', 'Dread per kept shade each dawn'],
  ['dread.livingPer', 'Living needed to bear one kept shade'],
  ['vigilCost', 'Remembrance per vigil'],
  ['restlessNights', 'Nights before a Restless shade turns Wraith'],
];
function settingsTab() {
  const get = (k) => {
    const [a, b] = k.split('.');
    return b ? s.tuning[a][b] : s.tuning[a];
  };
  return `<div class="fields">${TUNE_FIELDS.map(([k, label]) => {
    const id = `tune-${k.replace('.', '-')}`;
    return `<label for="${id}">${esc(label)}<input type="number" id="${id}" data-act="tune" data-key="${k}" value="${get(k)}" min="0" step="any"></label>`;
  }).join('')}</div>
    <p class="hint">Changes apply from now and are recorded, so exports still replay. A new keep starts with these numbers.</p>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause when someone dies, falls sick or raiders are sighted</label>
    <p class="hint">Seed ${s.seed}. Keys: space plays or pauses; 1, 2 and 4 set the speed.</p>
    ${newKeepControls()}`;
}
const directorPerson = () => byId(s.living, ui.directorId) || s.living[0] || null;
function directorTab() {
  if (s.phase === 'fallen') return '<p class="hint">The keep has fallen.</p>';
  const p = directorPerson();
  const kills = [['duty', 'On duty'], ['oldage', 'Of old age'], ['sickness', 'Of sickness'], ['neglect', 'Of neglect'], ['yours', 'On your order']];
  return `<p class="hint">Shortcuts for testing particular deaths. They are recorded in the export like any other action.</p>
    <div class="dir-grid">
      <label for="dir-person">Person<select id="dir-person" data-act="dir-person">${s.living.map((q) => `<option value="${q.id}"${q.id === p?.id ? ' selected' : ''}>${esc(q.name)}, ${esc(roleOf(q.job))}</option>`).join('')}</select></label>
      <div class="row"><span class="eyebrow">Dies</span>${kills.map(([c, l]) => `<button class="btn sm" id="dir-kill-${c}" data-act="debug" data-what="kill" data-cause="${c}">${l}</button>`).join('')}</div>
      <div class="row"><button class="btn sm" id="dir-sick" data-act="debug" data-what="sick">Falls sick</button><button class="btn sm" id="dir-raid" data-act="debug" data-what="raid"${s.phase === 'day' ? '' : ' disabled'}>Raiders now</button></div>
      <div class="row"><span class="eyebrow">Give</span>${[['food', 10], ['glass', 10], ['essence', 10], ['remembrance', 5]]
        .map(([r, n]) => `<button class="btn sm" id="dir-give-${r}" data-act="debug" data-what="give" data-res="${r}" data-n="${n}">+${n} ${r}</button>`)
        .join('')}</div>
    </div>`;
}
const TABS = [['ledger', 'Loss & hire'], ['log', 'Log'], ['playtest', 'Playtest'], ['settings', 'Settings'], ['director', 'Director']];
function recordsHTML() {
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'ledger';
  const body = { ledger: ledgerTab, log: logTab, playtest: playtestTab, settings: settingsTab, director: directorTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(
    ([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" aria-controls="tabpanel">${esc(l)}</button>`,
  ).join('')}</div>
  <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}

/* ---------------------------------------------------------------- rendering */

const SECTIONS = { hud: hudHTML, phase: phaseHTML, keep: keepHTML, rosters: rostersHTML, records: recordsHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let needEls = [];
let drawnToasts = -1;

const LIVE = {
  clock: () => worldTime(),
  res: (k) => (k === 'food' ? s.res.food.toFixed(1) : String(Math.floor(s.res[k] + 1e-9))),
  sick: (id) => inDays(byId(s.living, id)?.sick ?? 0),
  peace: (id) => inDays(byId(s.living, id)?.peace ?? 0),
};
const BARS = {
  phase: () => (s.phase === 'day' ? s.t / dayTicks(s) : s.phase === 'night' ? s.t / nightTicks(s) : 1),
  sick: (id) => (byId(s.living, id)?.sick ?? 0) / Math.max(1, s.tuning.sickDays * dayTicks(s)),
  raid: () => (s.raid ? s.t / Math.max(1, s.raid.hitAt) : 0),
};

function render() {
  const key = `${s.rev}|${ui.rev}`;
  let changed = false;
  for (const [id, html] of Object.entries(SECTIONS)) {
    if (drawn[id] === key) continue;
    const host = document.getElementById(id);
    const a = document.activeElement;
    // Don't pull a control out from under someone using it; redraw once they leave it.
    if (a && host.contains(a) && a.matches('select, textarea, input:not([type="checkbox"])')) continue;
    const focusId = a && host.contains(a) ? a.id : null;
    const scrolls = [...host.querySelectorAll('#log, #ledger-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
    host.innerHTML = html();
    if (id === 'phase' || id === 'hud') host.className = `${id} ${PHASE[s.phase]}`;
    for (const [sid, top, left] of scrolls) {
      const el = document.getElementById(sid);
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    drawn[id] = key;
    changed = true;
  }
  if (changed) {
    liveEls = [...document.querySelectorAll('[data-live]')];
    barEls = [...document.querySelectorAll('[data-bar]')];
    needEls = [...document.querySelectorAll('[data-need]')];
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
  for (const el of needEls) {
    const [res, n] = el.dataset.need.split(':');
    const off = s.res[res] + 1e-9 < Number(n);
    if (el.disabled !== off) el.disabled = off;
  }
  if (drawnToasts !== ui.toastRev) {
    drawnToasts = ui.toastRev;
    document.getElementById('toasts').innerHTML = ui.toasts
      .map((t) => `<div class="toast ${t.tone}"><span>${esc(t.text)}</span><button type="button" data-act="toast-close" data-id="${t.id}">Close</button></div>`)
      .join('');
  }
}

/* ---------------------------------------------------------------- the clock */

let toastSeq = 0;
function toast(text, tone = '') {
  ui.toasts.push({ id: ++toastSeq, text, tone, until: performance.now() + (tone === 'death' ? 9000 : 6000) });
  const room = window.innerWidth < 600 ? 2 : 4; // on a phone, toasts would cover the rite
  if (ui.toasts.length > room) ui.toasts.splice(0, ui.toasts.length - room);
  ui.toastRev++;
}
// Moves the simulation's alerts into toasts. While the clock runs, deaths and threats can pause it.
function takeAlerts(fromClock) {
  let stop = false;
  for (const a of s.alerts.splice(0)) {
    toast(a.text, a.tone);
    if (fromClock && prefs.autoPause && (a.tone === 'death' || a.tone === 'bad')) stop = true;
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
  if (!ui.paused && ticking()) {
    acc += dt * prefs.speed * TICKS_PER_SEC;
    let n = Math.floor(acc);
    acc -= n;
    while (n-- > 0 && ticking()) {
      step(s);
      if (takeAlerts(true)) {
        acc = 0;
        break;
      }
    }
  }
  takeAlerts(false);
  if (s.phase !== seenPhase) {
    seenPhase = s.phase;
    onPhaseChange();
  }
  const before = ui.toasts.length;
  ui.toasts = ui.toasts.filter((t) => t.until > now);
  if (ui.toasts.length !== before) ui.toastRev++;
  render();
  requestAnimationFrame(frame);
}
function onPhaseChange() {
  acc = 0;
  if (s.phase === 'rite' || s.phase === 'fallen') saveGame();
  if (!ticking()) {
    bump();
    const el = document.getElementById('phase');
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* ---------------------------------------------------------------- input */

function game(a) {
  const r = act(s, a);
  if (!r.ok) toast(r.error, 'bad');
  takeAlerts(false);
  bump();
  return r.ok;
}
function togglePlay() {
  if (!ticking()) return;
  ui.paused = !ui.paused;
  if (!prefs.introDone) {
    prefs.introDone = true;
    savePrefs();
  }
  bump();
}
function setSpeed(v) {
  prefs.speed = v;
  savePrefs();
  bump();
}
function skip() {
  if (!ticking()) return;
  const from = s.phase;
  for (let n = 0; s.phase === from && n < 500000; n++) step(s);
  takeAlerts(false);
  bump();
}
function newKeep() {
  const raw = document.getElementById('new-seed')?.value.trim();
  const seed = raw && /^\d+$/.test(raw) ? Number(raw) >>> 0 : Date.now() >>> 0;
  s = newGame(seed, s.tuning);
  seenPhase = s.phase;
  ui.confirmNew = false;
  ui.paused = true;
  ui.showExport = false;
  ui.copied = '';
  saveGame();
  toast(`A new keep, seed ${seed}. Press Play to start day 1.`, 'day');
  bump();
}
function copyExport() {
  const text = exportJSON();
  const done = (msg, show) => {
    ui.copied = msg;
    if (show) ui.showExport = true;
    bump();
  };
  try {
    navigator.clipboard.writeText(text).then(
      () => done('Copied.', false),
      () => done('Copying was blocked here. The export is shown below: select it all and copy.', true),
    );
  } catch {
    done('Copying was blocked here. The export is shown below: select it all and copy.', true);
  }
}
function focusPerson(id) {
  const row = document.getElementById(`row-${id}`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
  row.querySelector('select')?.focus({ preventScroll: true });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1400);
}

function onAct(name, el) {
  const id = el.dataset.id;
  switch (name) {
    case 'play': return togglePlay();
    case 'speed': return setSpeed(Number(el.dataset.v));
    case 'skip': return skip();
    case 'assign': return game({ type: 'assign', id, room: el.value || null });
    case 'post': return game({ type: 'post', id, room: el.value || null });
    case 'funeral': return game({ type: 'funeral', id, on: el.getAttribute('aria-pressed') !== 'true' });
    case 'wake': return game({ type: 'wake' });
    case 'beginNight':
    case 'beginDay':
      if (game({ type: name })) ui.paused = false;
      return;
    case 'rite': return game({ type: 'rite', id, choice: el.dataset.choice });
    case 'vigil': return game({ type: 'vigil', n: s.rite.vigils + Number(el.dataset.d) });
    case 'feel-btn': return game({ type: 'feel', id, feel: ledgerOf(s, id)?.feel === el.dataset.feel ? null : el.dataset.feel });
    case 'feel': return game({ type: 'feel', id, feel: el.value || null });
    case 'build': return game({ type: 'build', mirror: el.dataset.m });
    case 'ward': return game({ type: 'ward' });
    case 'tune': return game({ type: 'tune', key: el.dataset.key, value: el.value });
    case 'debug':
      return game({ type: 'debug', what: el.dataset.what, id: directorPerson()?.id, cause: el.dataset.cause, res: el.dataset.res, n: Number(el.dataset.n) });
    case 'dir-person':
      ui.directorId = el.value;
      return bump();
    case 'tab':
      prefs.tab = el.dataset.tab;
      savePrefs();
      return bump();
    case 'autopause':
      prefs.autoPause = el.checked;
      savePrefs();
      return bump();
    case 'intro-start':
      prefs.introDone = true;
      savePrefs();
      if (ticking()) ui.paused = false;
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
    case 'new-yes': return newKeep();
    case 'copy': return copyExport();
    case 'show-export':
      ui.showExport = !ui.showExport;
      return bump();
    case 'focus': return focusPerson(id);
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
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === '1' || e.key === '2' || e.key === '4') {
    setSpeed(Number(e.key));
  }
});

if (s.phase === 'rite' || s.phase === 'dusk') toast(`Welcome back: ${phaseLabel().toLowerCase()}.`, s.phase === 'rite' ? 'rite' : 'dusk');
requestAnimationFrame(frame);
