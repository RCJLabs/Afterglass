// The Night, Dawn and End panels, and the recap card.

import { drawCard, cardFonts } from '../slice/card.js';
import { DAY_ROOMS, KINDS, CAUSES, BOND_OTHER, SHADE_TRAITS, SEASONS, REQUESTS, OMENS, CHAPTERS, ENDINGS } from '../slice/data.js';
import { drawMoment } from '../slice/draw.js';
import { roomAt, roomsOf } from '../slice/geo.js';
import { againstOf } from '../slice/hall.js';
import { recapOf } from '../slice/recap.js';
import { ritePreview, canWork, bear, isNewMoon, choicesFor, byId, lastSeason, fmt, yearRate, shadeTrait, perf, seasonIndex, yearOf, isLongNight, omenText, nextMark, chapterOf, campaignOn } from '../slice/sim.js';
import { prefs, saves, hall, s, K, ui, bump, devMode } from './state.js';
import { esc, plural, upper, shadeTraitText, listOf, floor1, roomName, hhmm, seasonWord, kindTag, markText, aside } from './hud.js';
import { mirrorsHTML, breakHTML, sleepNotes, badLuckNote, dayPanel } from './day.js';
import { chapterCard, chapterCloseHTML, mult, duskCrypt, duskPlace, DEPTH_NAMES, errandsAtDawn, errandNote, mawNote, hollowNote } from './dusk.js';

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
    ${h ? `<p class="note bad">${hollowNote(h)}</p>` : ''}
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
  const made = [r.wick ? `${r.wick} ${r.wick === 1 ? 'candle' : 'candles'} saved` : '', r.guidance ? `${r.guidance} guidance readied` : '', r.watch ? `+${fmt(r.watch)} defense from the Watch` : '', r.essence >= 0.1 ? `${fmt(r.essence)} essence` : '', r.glass >= 0.1 ? `${fmt(r.glass)} glass` : '']
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
       <button class="btn sm" id="rem-${d.id}" data-act="remember" data-id="${d.id}"${d.memory >= 100 || s.res.remembrance + 1e-9 < T.rememberCost ? ' disabled' : ''}>Remember +${T.rememberGain}, ${T.rememberCost}</button></div>`
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
  return `<header class="ph-head"><h2>${s.day === 0 ? `Season ${s.season}: the first dawn` : 'Dawn: the Rite'}</h2><p>Choose who stays. Each shade kept adds Dread, and the living bear ${bear(s)} of it.</p></header>
    ${aside('rite', `<p class="note">The living bear 1 Dread for every ${T.dreadLivingPer} of them, and each priest 1. Cover a shade's mirror and it rests: +1 remembrance, and its kin find peace. Naming a shade (${T.nameCost} remembrance) halves its fading for good.</p>`, 'The rite', 'dawn')}
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
  // Round seven, phase 15: a campaign's ending told as its epilogue, before the count.
  const epilogue = s.campaign?.ending && ENDINGS[s.campaign.ending]?.epilogue ? `<p class="epilogue">${esc(ENDINGS[s.campaign.ending].epilogue)}</p>` : '';
  const head = s.opened
    ? `<header class="ph-head"><h2>The Veil is open</h2>${epilogue}<p>After five years, ${s.opened.shades ? `${plural(s.opened.shades, 'shade')} walked out of the glass into the keep` : 'with the glass empty'}, the living went down into the Tain, and the keep became a crossing between the two. This keep's story is over.</p></header>`
    : s.sealed
    ? `<header class="ph-head"><h2>The Veil is sealed</h2>${epilogue}<p>After ${s.campaign?.ending === 'seal' ? 'five years' : 'a whole year'}, ${s.sealed.freed ? `${plural(s.sealed.freed, 'shade')} went free` : 'the glass stood empty'}, and the Book of the Dead is closed. This keep's story is over.</p></header>`
    : `<header class="ph-head"><h2>${yearEnd ? `Year ${yearOf(s)} is over` : T.year ? `${seasonWord()} is over` : `Season ${e.season} is over`}</h2><p>${yearEnd ? 'The Long Night has passed. The keep has stood a whole year.' : 'The new moon has passed. The keep stands.'}</p></header>`;
  const go = s.sealed || s.opened
    ? newKeepControls()
    : yearEnd && chapterOf(s) ? chapterCloseHTML()
    : yearEnd ? endingsHTML(next)
      : `<div class="row"><button class="btn primary" id="btn-next-season" data-act="next-season">${next}</button><span class="hint">${harderNote()}</span></div>`;
  return `${head}
    ${devMode() && !s.test ? questionHTML(e) : ''}
    ${s.sealed || s.opened ? '' : reviewHTML(isLongNight(s) ? 'The Long Night in moments' : 'The new moon in moments')}
    <div class="card"><h3>The season</h3>${summaryHTML(e)}${againstHTML(e)}<div class="row"><button class="btn sm" id="end-book" data-act="book">Read the Book of the Dead</button></div></div>
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

// The season against the same season of the player's last keep, as the recap card has it (round seven, phase 16).
function againstHTML(e) {
  const a = againstOf(hall, s, e.season);
  return a ? `<p class="hint" id="end-against">Against ${esc(a.page)}'s ${esc(a.then.title.toLowerCase())}: ${esc(a.value)}.</p>` : '';
}
function newKeepControls() {
  if (!ui.confirmNew) return '<div class="row"><button class="btn" id="btn-new" data-act="new">New season from day 1</button></div>';
  return `<div class="confirm"><p>Start keep ${saves.current} over from season 1, day 1? This one goes into the Hall of Keepers, and can't be played on unless you export it first, from Menu, then Saves, where you can start a new keep beside it instead.</p>
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
export async function makeCard() {
  const r = recapOf(s, undefined, againstOf(hall, s));
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
export function saveCard() {
  const a = document.createElement('a');
  a.href = ui.card.url;
  a.download = ui.card.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export async function shareCard() {
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
    ${e && devMode() && !s.test ? questionHTML(e) : ''}
    ${reviewHTML('How the last night went')}
    ${e ? `<div class="card"><h3>The season</h3>${summaryHTML(e)}</div>` : ''}
    ${e ? recapHTML(e) : ''}
    ${campaignOn(s) && s.campaign && !s.campaign.ending ? `<div class="card chapter"><h3>Begin the chapter again</h3><p class="note">The keep as it stood at the first dawn of year ${chapterOf(s)}, ${esc(CHAPTERS[chapterOf(s)].name)}${chapterOf(s) === 1 ? ' (its first morning)' : ''}, with everything since undone. It plays the same until you choose otherwise.</p><div class="row"><button class="btn primary" id="btn-chapter-again" data-act="chapter-again">Begin ${esc(CHAPTERS[chapterOf(s)].name)} again</button></div></div>` : ''}
    ${newKeepControls()}`;
}

export function phaseHTML() {
  let panel;
  if (s.phase === 'day') panel = dayPanel();
  else if (s.phase === 'dusk') panel = s.dusk.step === 'crypt' ? duskCrypt() : duskPlace();
  else if (s.phase === 'night') panel = nightPanel();
  else if (s.phase === 'dawn') panel = dawnPanel();
  else if (s.phase === 'end') panel = endPanel();
  else panel = overPanel();
  return panel;
}
