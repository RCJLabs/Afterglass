// The Day panel and its cards.

import { dayText } from '../slice/daily.js';
import { TICKS_PER_SEC, DAY_ROOMS, WORK_ROOMS, KINDS, MIRRORS, MAP, SEASONS, ACTS, VISITORS, STUDIES, DECREES, decreeDoes, decreesOf, TROUBLES, mirrorsOf } from '../slice/data.js';
import { typeOf, roomsOf } from '../slice/geo.js';
import { jobCap, jobCount, defense, roomPower, funeralCap, eatRate, dayTicks, nightTicks, byId, fmt, mirrorCap, tainPlace, hangsIn, mirrorIn, isDoor, hangSpot, mawLure, doorsOpen, wardCost, raidsAhead, peopleIn, beds, whispers, stepsThrough, coaches, stepRoom, seasonIndex, yearOf, dayLength, isLongNight, tributeOf, sallyOdds, plagueSeason, atGate, gateGuard, weatherOf, forecastOf, drownedDue, embargoed, inquisition, churchDaysLeft, crusadeDay, crusadeDaysLeft, visitorBlock, decreeOf, gatehouseOf, undergateOpen, laddersDue, pitchOf, brought, musterGain, armsCap, pursueShare, ledgerDread, judgedDread, standingOf, standingCost, nightsLeft, nextRank, studyLore, studyRem, repairing, troubleOf, cracksOf, veilWardCost, eased } from '../slice/sim.js';
import { s, K, ui } from './state.js';
import { esc, plural, upper, listOf, floor1, roomName, hhmm, longTimes, seasonWord, seasonNote, once } from './hud.js';
import { winterCard, chapterCard, eclipseCard, mult, deadByDay, wardName } from './dusk.js';

/* ---------------------------------------------------------------- the phase panels */

function raidCard() {
  const r = s.raid;
  if (!r) {
    const next = Object.keys(s.tuning.raidDays).map(Number).find((d) => d > s.day && s.tuning.raidDays[d]);
    return next ? `<p class="note">No raid today. The Ashen Host is expected on day ${next}.</p>` : '';
  }
  const T = s.tuning;
  const def = defense(s);
  if (r.state === 'paid') return `<div class="card"><h3>The raid</h3><p>You paid the Host ${r.paid.food} food and ${r.paid.candles} candles, and they turned back. ${s.grudge ? `Next season's raids come ×${mult(s.grudge)} harder.` : raidsAhead(s) ? `The season's raids after this one come ×${mult(s.embolden || 1)} harder.` : 'It was the season\'s last raid.'}</p></div>`;
  if (r.crusade && (r.state === 'held' || r.state === 'breached')) {
    const C = s.today.crusade;
    const after = r.state === 'held' ? 'It turned for home, and the Lantern Church gave up: the embargo and the Inquisition are over.' : `They smashed ${C?.smashed ? plural(C.smashed, 'mirror') : 'no mirror: every one was hidden'}${C?.freed ? `, and ${plural(C.freed, 'shade')} went free` : ''}, and left the keep purged.`;
    return `<div class="card ${r.state === 'held' ? 'ok' : 'warn'}"><h3>The crusade</h3><p>${r.state === 'held' ? 'The gate held' : 'The crusaders broke in'}: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}. ${after}</p></div>`;
  }
  if (r.state === 'held') return `<div class="card ok"><h3>The raid</h3><p>The gate held: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}.</p></div>`;
  if (r.state === 'breached') {
    const k = r.loot;
    const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length;
    const chase = !k || !T.raidFight ? '' : r.pursued ? '<p>The guards went after them.</p>'
      : `<p>They carried off ${k.food} food, ${k.glass} glass and ${k.candles} candles. Guards sent after them would take back ${Math.round(100 * pursueShare(s))}% of it${T.guardsGoOut ? ' (the more guards, and the better mustered and armed, the more)' : ''}, and each has a ${Math.round(100 * T.raidPursueRisk)}% chance of not coming back.</p>
        <div class="row"><button class="btn sm" id="btn-pursue" data-act="pursue"${guards ? '' : ' disabled'}>${guards ? `Go after them (${plural(guards, 'guard')})` : 'No guards to send'}</button></div>`;
    return `<div class="card warn"><h3>The raid</h3><p>The raiders broke through: strength ${fmt(r.strength)} against defense ${fmt(s.today.raid?.defense ?? def)}.</p>${chase}</div>`;
  }
  if (r.state === 'assault') return assaultCard(r);
  const more = musterGain(s);
  const rising = more > 0.05 ? `, ${fmt(def + more)} once the guards posted have taken their places` : '';
  if (!r.warned) return `<div class="card"><h3>A raid today</h3><p>Scouts expect the Ashen Host before noon. Defense now <b class="num">${fmt(def)}</b>${s.watchBonus ? `, ${fmt(s.watchBonus)} of it from last night's Watch` : ''}${rising}.</p>${once('guards', `<p class="note">Guards give ${DAY_ROOMS.barracks.rate} defense each${T.muster ? `, in full once they've stood ${fmt(T.musterHours)} hours at their post: post them before the Host comes, and their work stops while they stand there` : ''}${T.forgeArms ? `, and ${fmt(T.armDefense)} more with arms from the Forge` : ''}. The Watch of the Dead adds what it kept the night before.</p>`, 'Defense', 'raids')}</div>`;
  const short = def + more + 1e-9 < r.strength;
  const t = tributeOf(s);
  const canPay = s.res.food + 1e-9 >= t.food && s.res.candles + 1e-9 >= t.candles;
  const fight = r.crusade ? `<p class="note">The crusade takes no tribute and wants none of the stores: it's the mirrors it's after. At the gate you'll have pitch (${T.raidPitchCost} candles for −${fmt(T.raidPitch)}), stone to shore it up, and the bell.</p>`
    : !T.raidFight ? '' : `<div class="row"><button class="btn sm" id="btn-payoff" data-act="payoff"${canPay ? '' : ' disabled'}>Pay them off: ${t.food} food, ${t.candles} candles</button>
      <button class="btn sm" id="btn-bar" data-act="bar-stores"${r.barred ? ' disabled' : ''}>${r.barred ? 'Stores barred' : 'Bar the stores'}</button></div>
    ${once('raid-choices', `<p class="note">Paid, they turn back${raidsAhead(s) ? `, but the season's raids after it come ×${mult(T.raidEmbolden)} harder` : T.emboldenCarries ? `, but next season's raids come ×${mult(T.raidEmbolden)} harder` : ''}. Barred, the Hearth, the Chandlery and the Glazier stop while the Host is at the gate, and a breach carries off half as much. At the gate you'll have pitch (${T.raidPitchCost} candles for −${fmt(T.raidPitch)}), stone to shore it up, and the bell.</p>`, 'Paying and barring', 'raids')}`;
  return `<div class="card raid-road ${short ? 'warn' : 'ok'}"><h3>${r.crusade ? 'The crusade on the road' : r.camp ? 'The camp comes at the gate' : 'Raiders on the road'}</h3>
    <p>${r.count} ${r.crusade ? 'knights of the Lantern' : 'raiders'}, strength <b class="num">${fmt(r.strength)}</b>, at the gate about ${hhmm(6 + (12 * r.hitAt) / dayTicks(s))}. Your defense: <b class="num" data-live="defense">${fmt(def)}</b>${rising}. ${short ? (T.muster ? `Not enough. Post guards now: each takes ${fmt(T.musterHours)} hours at the post to count in full. Or ward the gate.` : 'Not enough. Move people to the Barracks or ward the gate.') : 'Enough, if nothing changes.'}</p>${laddersDue(s) ? ladderNote(r) : ''}
    <div class="row"><button class="btn sm" id="btn-wardgate" data-act="wardgate"${r.ward || s.res.essence + 1e-9 < s.tuning.wardGateCost ? ' disabled' : ''}>${r.ward ? `Gate warded, +${r.ward}` : `Ward the gate: +${s.tuning.wardGateDefense} for ${s.tuning.wardGateCost} essence`}</button></div>${fight}</div>`;
}
export const share = (x) => (x === 0.5 ? 'half' : `${mult(x)} times`);
// From summer the Host brings ladders: how many go up over the assault, and whether a gate guard is on the
// Gatehouse's walls to throw them down.
function ladderNote(r) {
  const T = s.tuning;
  const n = Math.floor((T.raidAssaultSecs - 1e-9) / T.ladderEvery);
  const manned = gatehouseOf(s) && s.living.some((p) => p.job === 'gatehouse' && !(p.sick > 0));
  const who = r.crusade ? 'The crusaders' : 'They';
  return `<p class="note${manned ? '' : ' bad'}">${who} bring ladders: about ${n} go up over the assault, each left standing adding ${fmt(T.ladderHost)} to their strength. ${manned ? 'A gate guard on the Gatehouse\'s walls will throw every one down.' : gatehouseOf(s) ? `Put a gate guard in the Gatehouse and every one is thrown down; with none, all would stand, +${fmt(n * T.ladderHost)}.` : `Only a Gatehouse's guards throw them down: without one, all would stand, +${fmt(n * T.ladderHost)}.`}</p>`;
}
// The weather by day: today's, and a warning a day ahead of rain.
function weatherNotes() {
  const T = s.tuning;
  if (!T.weather) return '';
  const now = weatherOf(s);
  const next = forecastOf(s);
  const out = [];
  if (now === 'rain') out.push(`<p class="note bad">Rain today. The Yard quarries at ${Math.round(100 * T.rainYard)}%, and a fire is ${share(T.rainFire)} as likely and grows ${share(T.rainFire)} as fast. ${drownedDue(s) ? `Tonight the Drowned come up out of the moat's twin${K().n > 1 ? ', behind the line' : ''}.` : 'The Drowned stay under tonight: the new moon belongs to the Hollow.'}</p>`);
  else if (now === 'fog') out.push("<p class=\"note\">Fog today. At dusk the black mirror will show how many come and when, but not their ways.</p>");
  if (next === 'rain' && !drownedDue(s, true)) out.push('<p class="note">Rain tomorrow. The Drowned will stay under: the new moon belongs to the Hollow.</p>');
  else if (next === 'rain') out.push(`<p class="note bad">Rain tomorrow. Tomorrow night the Drowned come up out of the moat's twin, on the floor under the Veil, and make for the mirrors${K().n > 1 ? ' from behind the line' : ''}. Keep ${fmt(wardCost(s))} essence to ward the moat, or a candle and a fighter for the mirror on their side.</p>`);
  else if (next) out.push(`<p class="note">Tomorrow: ${next === 'fog' ? 'fog' : 'clear'}.</p>`);
  return out.join('');
}
// Autumn's siege: how long the camp stays, what the shut gate costs, and the sally.
function siegeCard() {
  const g = s.siege;
  if (!g || s.phase !== 'day' || s.day < g.from || s.day > g.until) return '';
  if (g.broken) return '<p class="note">The camp is broken, and the gate is open.</p>';
  const T = s.tuning;
  const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length;
  const left = g.until - s.day + 1;
  return `<div class="card warn siege"><h3>The siege</h3><p>The Ashen Host is camped outside the walls, strength ${fmt(g.strength)}, ${left === 1 ? 'until tomorrow' : `for ${left} more days`}. The gate is shut: nobody quarries in the Yard, and no one new can come.</p>
    <div class="row"><button class="btn sm" id="btn-sally" data-act="sally"${guards && s.raid?.state !== 'assault' ? '' : ' disabled'}>${guards ? `Sally out: ${plural(guards, 'guard')}, about ${Math.round(100 * sallyOdds(s))}% to break the camp` : 'No guards to sally out'}</button></div>
    <p class="note">Broken, the Host scatters and the gate opens${s.raid?.camp && s.raid.state === 'coming' ? ", and today's assault is off" : ''}. Held, they fall back behind it. Either way, each guard has a ${Math.round(100 * T.raidPursueRisk)}% chance of not coming back. ${T.guardsGoOut ? 'Only the guards who go out count, as far as they have mustered, and their arms: more guards make better odds.' : 'More guards, and the watch of the dead, make better odds.'}</p></div>`;
}
// The Host at the gate: the gate's bar, the fight in numbers, and what can turn it.
export function assaultText() {
  const r = s.raid;
  if (r?.state !== 'assault') return '';
  const def = defense(s);
  const giving = r.host > def + 1e-9;
  const L = r.ladders;
  const ladders = L && (L.up || L.down) ? ` Ladders: ${L.down} thrown down, ${L.up} standing.` : '';
  const more = musterGain(s);
  return `${r.crusade ? 'The crusade' : 'The Host'} ${fmt(r.host)} against your defense ${fmt(def)}${more > 0.05 ? ` (${fmt(def + more)} as the guards posted take their places)` : ''}. The gate is ${Math.round(100 * Math.max(0, r.gate))}% whole and ${giving ? 'giving' : 'holding'}; they give up in ${Math.ceil(r.left / TICKS_PER_SEC)} s.${ladders}`;
}
function assaultCard(r) {
  const T = s.tuning;
  const hands = s.living.filter((p) => p.job !== 'barracks' && p.job !== 'gatehouse' && !p.fighting && !p.walls && !(p.sick > 0)).length;
  return `<div class="card warn raid"><h3>${r.crusade ? 'The crusade is at the gate' : 'The Host is at the gate'}</h3>
    <div class="gatebar"><span data-bar="gate"></span></div>
    <p data-live="assault">${esc(assaultText())}</p>
    <div class="row"><button class="btn sm primary" id="btn-pitch" data-act="pitch"${s.res.candles + 1e-9 < T.raidPitchCost ? ' disabled' : ''}>Pour pitch: −${fmt(pitchOf(s))} for ${T.raidPitchCost} candles</button>
      <button class="btn sm" id="btn-shore" data-act="shore"${(s.res.stone || 0) + 1e-9 < T.raidShoreCost || r.gate >= 1 - 1e-9 ? ' disabled' : ''}>Shore up the gate: ${T.raidShoreCost} stone</button>
      <button class="btn sm" id="btn-raidbell" data-act="raid-bell"${r.bell || !hands ? ' disabled' : ''}>${r.bell ? 'The bell has rung' : `Ring the bell: everyone to the walls (${hands})`}</button>
      ${r.ward ? '' : `<button class="btn sm" id="btn-wardgate" data-act="wardgate"${s.res.essence + 1e-9 < T.wardGateCost ? ' disabled' : ''}>Ward the gate: +${T.wardGateDefense} for ${T.wardGateCost} essence</button>`}</div>
    <p class="note">Each second ${r.crusade ? 'the crusade' : 'the Host'} is stronger than your defense, the gate gives. If it still stands when their time is up, they fall back. Candles poured are candles you won't have tonight; the bell stops all work, and whoever is on the walls can fall.${r.ladders ? ` A ladder goes up every ${fmt(T.ladderEvery)} s: with a gate guard on the Gatehouse's walls every one is thrown down, and each left standing adds ${fmt(T.ladderHost)} to ${r.crusade ? 'the crusade' : 'the Host'}.` : ''}</p></div>`;
}

function inspectionCard() {
  const I = s.inspection;
  const T = s.tuning;
  const ledger = !!T.churchLedger;
  const verdicts = once('verdicts', `<p class="note">${ledger ? "The Church judges the Dread of every day since it last looked, as it stood at each dusk and at noon on the day, averaged and rounded. " : ''}Dread 0–1: blessed (candles and remembrance). 2–3: warned, with a tithe. 4–5: censured, and the fullest mirror is taken with its shades.</p>`, "The Church's verdicts", 'church');
  const sofar = () => `Its ledger so far: Dread ${fmt(ledgerDread(s))} on average over ${plural((s.churchLog || []).length + 1, 'day')}, so <b>${judgedDread(s)}</b>.`;
  if (I && !I.done) {
    const when = I.day === s.day ? 'today at noon' : 'tomorrow at noon';
    return `<div class="card ${judgedDread(s) >= 4 ? 'warn' : ''}"><h3>The Lantern Church</h3><p>${I.reason === 'inquisition' ? 'The inquisitor inspects' : 'An inspector comes'} ${when} and judges the keep by its Dread${ledger ? `, now ${s.dread}. ${sofar()}` : `, now <b>${s.dread}</b>.`}</p>${verdicts}
      ${s.phase === 'day' ? `<div class="row"><button class="btn sm" id="btn-vigil" data-act="vigil"${s.dread <= 0 || s.res.remembrance + 1e-9 < T.vigilCost ? ' disabled' : ''}>Keep a vigil: Dread −1 for ${T.vigilCost} remembrance</button></div>` : ''}</div>`;
  }
  const done = s.inspections.filter((x) => x.season === s.season && x.day === s.day).pop();
  if (done) return `<div class="card ${done.verdict === 'blessed' ? 'ok' : 'warn'}"><h3>The Lantern Church</h3><p>The inspector's verdict: <b>${done.verdict}</b> (Dread ${done.dread}${ledger ? ' on its ledger' : ''}).</p></div>`;
  if (s.phase === 'day' && s.day < T.firstInspection && !crusadeDay(s)) return `<p class="note">The Lantern Church inspects on day ${T.firstInspection}.${ledger ? ` ${sofar()}` : ''}</p>${verdicts}`;
  return '';
}

// Visitors at the gate (round six): whoever is waiting, what each answer costs and gives, and the hour they
// stop waiting and the last answer is taken for you. Then what came of the day's other visitors, and what
// their answers left behind: riders promised, a raid made harder or easier, barrels, a charm, a curse.
const amounts = (o) => listOf(Object.entries(o).map(([k, n]) => `${fmt(n)} ${k}`));
function answerTerms(A) {
  return [A.cost && `costs ${amounts(A.cost)}`, A.gain && `gives ${amounts(A.gain)}`, A.dread && `Dread ${A.dread > 0 ? '+' : '−'}${Math.abs(A.dread)}`, typeof A.does === 'function' ? A.does(s.tuning) : A.does].filter(Boolean).join('; ');
}
// Who a visitor has come about, by name.
function visitorAbout(v) {
  const glassOf = (d) => s.mirrors.find((m) => m.id === d.mirror)?.name;
  if (v.kind === 'wedding') return `${listOf(v.who.map((id) => byId(s.living, id)?.name || 'someone'))} ask to be wed.`;
  if (v.kind === 'knight') {
    const d = byId(s.shades, v.shade);
    return d ? `His brother is ${d.name}, in the ${glassOf(d) || 'glass'}.` : 'His brother is gone from the glass.';
  }
  if (v.kind === 'graverobber') {
    const b = byId(s.bodies, v.body);
    return b ? `The body in his sack is ${b.name}'s.` : '';
  }
  if (v.kind === 'necromancer') {
    const d = byId(s.shades, v.shade);
    return d ? `${d.name} waits Restless at the edge of the Deep.` : '';
  }
  if (v.kind === 'physician') {
    const sick = s.living.filter((p) => p.sick > 0);
    return sick.length ? `Sick now: ${listOf(sick.map((p) => p.name))}.` : 'Nobody is sick now.';
  }
  if (v.kind === 'priest') return `The crypt holds ${plural(s.bodies.length, 'body', 'bodies')}, and the Chapel can give ${plural(funeralCap(s), 'funeral')} tonight.`;
  // Round seven, phase 14: who a happening inside the keep is about.
  if (v.named) {
    const p = byId(s.living, v.named);
    return p ? VISITORS[v.kind].who(p.name) : '';
  }
  return '';
}
export const untilText = (v) => hhmm(6 + (12 * v.until) / dayTicks(s));
function visitorCards() {
  if ((!s.tuning.visitors && !s.tuning.cruelty && !s.tuning.yearVisitors) || !s.visitors) return '';
  const cards = s.visitors
    .filter((v) => v.here && !v.done)
    .map((v) => {
      const V = VISITORS[v.kind];
      const rows = V.answers
        .filter((A) => !A.rule || s.tuning[A.rule])
        .map((A) => {
          const why = visitorBlock(s, v, A.id);
          const terms = answerTerms(A);
          return `<li><button class="btn sm" id="visit-${v.id}-${A.id}" data-act="visitor" data-id="${v.id}" data-answer="${A.id}"${why ? ' disabled' : ''}>${esc(A.text)}</button>${terms || why ? `<small>${esc(terms)}${why ? `<span class="why">${esc(why)}</span>` : ''}</small>` : ''}</li>`;
        })
        .join('');
      return `<div class="card visit"><h3>${V.inside ? 'In the keep' : 'At the gate'}</h3><p><b>${esc(V.name)}.</b> ${esc(V.text)} ${esc(visitorAbout(v))}</p>
        <ul class="answers">${rows}</ul>
        <p class="note">${esc(V.answers.at(-1).text)} unless you answer by ${untilText(v)}.</p><span class="waitbar" aria-hidden="true"><i data-bar="visit" data-arg="${v.id}"></i></span></div>`;
    })
    .join('');
  const past = s.visitors
    .filter((v) => v.done)
    .map((v) => {
      const V = VISITORS[v.kind];
      const A = V.answers.find((a) => a.id === v.done);
      return `${V.name.toLowerCase()} (${v.late ? 'left waiting: ' : ''}${A.text.toLowerCase()})`;
    });
  return `${cards}${past.length ? `<p class="note">Earlier today: ${esc(listOf(past))}.</p>` : ''}${gateNotes()}`;
}
function gateNotes() {
  const T = s.tuning;
  const out = [];
  const today = s.raid && s.raid.state === 'coming' && !s.raid.crusade;
  if (s.gateHelp) out.push(`The pilgrims stand the gate with you today: +${fmt(s.gateHelp)} defense.`);
  if (s.riders) out.push(today ? `The lord's riders stand with you against today's raid: +${fmt(s.riders)} defense.` : `The lord's riders will stand with you when the Host next comes: +${fmt(s.riders)} defense.`);
  if (s.raidEdge && Math.abs(s.raidEdge - 1) > 1e-9) out.push(`Word from the gate: the Host's next raid comes ×${mult(s.raidEdge)} ${s.raidEdge > 1 ? 'harder' : 'as hard'}.`);
  if (s.barrels) out.push('Water barrels stand ready: until the season ends, fire comes half as often.');
  if (s.charm) out.push(`The hedge-witch's charm: tonight the candles burn ×${mult(T.charmBurn)} as fast.`);
  if (s.curse) out.push(`The hedge-witch's curse: ${T.dreamwell && T.weepersMax ? 'a Weeper comes tonight' : `tonight the candles burn ×${mult(T.curseBurn)} as fast`}.`);
  return out.map((x) => `<p class="note">${esc(x)}</p>`).join('');
}

// The Library (round six): what it studies and how far along, and what else it could; what it has learned. Since
// round seven's phase 12 each study has a second rank, offered once the first is learned.
const studyWhat = (id, kind, rank = 1) => (id === 'rites' && kind ? `the ${KINDS[kind].name} can act ${rank === 2 ? 'three times' : 'twice'} a night` : rank === 2 ? STUDIES[id].two.text : STUDIES[id].text);
const studyName = (id, rank = 1) => `${STUDIES[id].name}${rank === 2 ? ' II' : ''}`;
function libraryCard() {
  const T = s.tuning;
  if (!T.library || !roomsOf(K(), 'library').length) return '';
  const day = s.phase === 'day';
  const St = s.study;
  const scholars = jobCount(s, 'library');
  const now = St
    ? `<p>Studying <b>${esc(studyName(St.id, St.rank))}</b>: ${esc(studyWhat(St.id, St.kind ?? s.riteKind, St.rank))}. <b class="num" data-live="lore">${fmt(St.lore)}</b> of ${studyLore(s, St.id, St.rank)} lore.</p>`
    : '<p>Nothing is being studied. Remembrance begins a study; the scholars and the Archive finish it.</p>';
  const kinds = Object.values(ACTS).map((a) => a.kind);
  const pick = ui.riteKind && kinds.includes(ui.riteKind) ? ui.riteKind : kinds[0];
  const rows = Object.entries(STUDIES)
    .map(([id, S]) => [id, S, nextRank(s, id)])
    .filter(([, , rank]) => rank)
    .map(([id, S, rank]) => {
      const rem = studyRem(s, id, rank);
      const can = day && !St && s.res.remembrance + 1e-9 >= rem;
      const choose = id === 'rites' && rank === 1 ? `<select id="rite-kind" data-act="rite-kind" aria-label="For which kind">${kinds.map((k) => `<option value="${k}"${k === pick ? ' selected' : ''}>${KINDS[k].name}</option>`).join('')}</select>` : '';
      return `<li><div><b>${esc(studyName(id, rank))}:</b> <small>${esc(rank === 2 ? studyWhat(id, s.riteKind, 2) : S.text)}; ${studyLore(s, id, rank)} lore</small></div><span class="row">${choose}<button class="btn sm" id="study-${id}" data-act="study" data-id="${id}"${can ? '' : ' disabled'}>Begin, ${rem} remembrance</button></span></li>`;
    })
    .join('');
  const done = s.learned.map((x) => {
    const id = x.replace(/2$/, '');
    const rank = x.endsWith('2') ? 2 : 1;
    return `${studyName(id, rank)} (${studyWhat(id, id === 'rites' ? s.riteKind : null, rank)})`;
  });
  return `<div class="card lib"><h3>The Library</h3>${now}
    <p class="note">${scholars ? `${esc(plural(scholars, 'scholar'))} ${scholars === 1 ? 'makes' : 'make'} ${fmt(scholars * DAY_ROOMS.library.rate)} lore a day.` : 'Nobody works in the Library: give someone the job, in People.'} By night a lit shade posted in the Archive of the Dead adds to it.</p>
    ${rows && !St ? `<ul class="studies">${rows}</ul>` : ''}
    ${done.length ? `<p class="note">Learned: ${esc(listOf(done))}.</p>` : ''}</div>`;
}
// The Hall (round six): the season's decree, or the choice of one; and what the Court of Shades does by night.
function hallCard() {
  const T = s.tuning;
  if (!T.hall || !roomsOf(K(), 'hall').length) return '';
  const d = decreeOf(s);
  const day = s.phase === 'day';
  const court = 'By night, a shade seated in the Court of Shades, lit, through half the night has one of the dead\'s requests heard free at the next rite: granted, it costs nothing; refused, it isn\'t held against you.';
  if (d) {
    const D = DECREES[d];
    return `<div class="card hall"><h3>The Hall</h3><p><b>${esc(D.name)}</b> stands until the season ends: ${esc(decreeDoes(T, D))}. The price: ${esc(D.price)}.</p><p class="note">${court}</p></div>`;
  }
  const rows = decreesOf(T)
    .map((id) => [id, DECREES[id]])
    .map(([id, D]) => `<li><div><b>${esc(D.name)}:</b> <small>${esc(decreeDoes(T, D))}. The price: ${esc(D.price)}.</small></div><button class="btn sm" id="decree-${id}" data-act="decree" data-id="${id}"${day ? '' : ' disabled'}>Proclaim</button></li>`)
    .join('');
  return `<div class="card hall"><h3>The Hall</h3><p>One decree a season, proclaimed from here, stands until the season ends.</p><ul class="studies">${rows}</ul><p class="note">${court}</p></div>`;
}

// The Lantern Church's escalation: its silver embargo, and the Inquisition.
function churchCard() {
  const T = s.tuning;
  const more = (n) => (n === 0 ? 'through today' : `today and ${plural(n, 'more day')}`);
  if (crusadeDay(s)) {
    const C = s.church;
    const n = crusadeDaysLeft(s);
    const when = n === 0 ? 'today, a little after noon' : n === 1 ? 'tomorrow, a little after noon' : `a little after noon in ${n} days`;
    const day = s.phase === 'day';
    const rows = s.mirrors
      .map((m) => {
        const ds = s.shades.filter((d) => d.mirror === m.id);
        const btn = m.hidden
          ? `<button class="btn sm" id="hide-${m.id}-0" data-act="hide" data-id="${m.id}">Bring it out</button>`
          : `<button class="btn sm" id="hide-${m.id}-1" data-act="hide" data-id="${m.id}" data-on="1"${n > 0 ? '' : ' disabled'}>Hide it</button>`;
        return `<li><span>The ${esc(m.name)}: ${ds.length ? esc(listOf(ds.map((d) => d.name))) : 'empty'}${m.hidden ? ', hidden' : ''}</span>${day ? btn : ''}</li>`;
      })
      .join('');
    return `<div class="card warn church"><h3>The crusade</h3><p>The Lantern Church has proclaimed a crusade against the keep: ${Math.max(2, Math.round(C.strength / 2))} knights of the Lantern, strength <b class="num">${fmt(C.strength)}</b>, at the gate ${when}. It takes no tribute. Held at the gate, it turns for home and the Church gives up. Broken in, the crusaders smash every mirror they can find, and the shades in them go free.</p>
      ${n > 0 ? '<p>Until then the inquisitor inspects each noon, and the embargo stands. A blessing, at Dread 0 or 1, calls the crusade off.</p>' : ''}
      <p class="note">${n > 0 ? "A mirror hidden before the day it comes can't be found, by the crusaders or the inquisitor, but its shades sit out every day and night until the crusade is over." : 'Too late to hide anything now: the crusaders are on the road.'}</p>
      ${rows ? `<ul class="facts hides">${rows}</ul>` : ''}</div>`;
  }
  if (inquisition(s)) {
    return `<div class="card warn church"><h3>The Inquisition</h3><p>An inquisitor inspects the keep every day at noon, ${more(churchDaysLeft(s, 'inquisition'))}, and the silver embargo stands with it: the Glazier makes no glass, and no mirror can be built. A blessing, at Dread 0 or 1, sends the inquisitor away at once. A censure takes another mirror and starts its days over.</p></div>`;
  }
  if (!embargoed(s)) return '';
  const can = s.res.remembrance + 1e-9 >= T.donation;
  return `<div class="card warn church"><h3>The Church's embargo</h3><p>A silver embargo, ${more(churchDaysLeft(s))}: the Glazier makes no glass, and no mirror can be built or upgraded. A blessing lifts it, and so does a donation. Censured again while it stands, the keep is given to the Inquisition.</p>
    <div class="row"><button class="btn sm" id="btn-donate" data-act="donate"${can ? '' : ' disabled'}>Donate ${T.donation} remembrance to lift it</button></div></div>`;
}
// A fire by day: how hot, who fights it, whether they're winning, and the Yard to send.
export function fireTrend(id) {
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
  const scorched = s.scorched?.length && !repairing(s) ? `<p class="note bad">Scorched in last night's fire: the ${esc(listOf(s.scorched.map((id) => roomName(id))))}. Nobody works there today.</p>` : '';
  return cards.join('') + scorched;
}

function buildRow() {
  const shut = embargoed(s);
  const spot = s.tuning.mirrorRooms && hangSpot(s);
  if (s.tuning.mirrorRooms && !spot) return `<div class="build"><span>Build a mirror: every room has its mirror, so there is nowhere to hang another. Raise a room first.</span></div>`;
  const why = spot && (mawLure(typeOf(K(), spot)) === 0 ? ', where nobody works' : mawLure(typeOf(K(), spot)) === 1 ? ', where nobody works yet' : ', the free room nearest the Veil');
  return `<div class="build"><span>Build a mirror${shut ? ": not under the Church's embargo" : spot ? `, to hang in the ${roomName(spot)}${why}` : ''}</span>${mirrorsOf(s.tuning)
    .map((k) => [k, MIRRORS[k]])
    .map(([k, M]) => `<button class="btn sm" id="build-${k}" data-act="build" data-mirror="${k}"${shut || s.res.glass + 1e-9 < M.glass ? ' disabled' : ''}>${M.name}, room for ${M.cap}: ${M.glass} glass</button>`)
    .join('')}</div>`;
}
export function mirrorsHTML({ upgrades = true } = {}) {
  return `<div class="mirrors">${s.mirrors
    .map((m) => {
      const ds = s.shades.filter((d) => d.mirror === m.id);
      const slots = Array.from({ length: mirrorCap(m) }, (_, i) => (ds[i] ? `<span class="slot full">${esc(ds[i].name)}</span>` : '<span class="slot">empty</span>')).join('');
      return `<div class="mirror"><span class="mname">${esc(m.name)}${m.hidden ? ' <small class="muted">hidden</small>' : ''}${m.turned ? ' <small class="muted">turned to the wall</small>' : ''}</span><div class="slots">${slots}</div>${upgrades ? hangHTML(m) : ''}${upgrades ? upgradeHTML(m) : ''}${ds.length ? breakHTML(m) : ''}</div>`;
    })
    .join('')}</div>${upgrades && s.tuning.deep && brought(s, 'deep') ? `<p class="note">Quicksilver: ${floor1(s.res.quicksilver || 0)}.</p>${once('quicksilver', '<p class="note">Shades bring quicksilver back from the Deep, sent down at dusk. It upgrades a mirror where it hangs, its shades and all.</p>', 'Quicksilver', 'mirrors')}` : ''}`;
}
// Round seven, phase 13 (mirrorRooms): where a mirror hangs, whether it's a door, the room to hang it in (by day),
// and turning it to the wall (by day or at dusk).
const floorWord = (G, f) => (G.n - f === 1 ? 'the ground floor' : `floor ${G.n - f}`);
function hangHTML(m) {
  const id = hangsIn(s, m);
  if (!s.tuning.mirrorRooms || !id || s.phase === 'over') return '';
  const G = K();
  const n = s.shades.filter((d) => d.mirror === m.id).length;
  const where = `By night it opens on the ${roomName(id, true)}, ${tainPlace(G, G.rooms[id].f, true)}.`;
  const state = m.turned
    ? `Turned to the wall, it lets nothing through${n ? `, and ${n === 1 ? 'its shade sits' : 'its shades sit'} out until it's turned back` : ''}.`
    : m.hidden
      ? ''
      : n
        ? doorsOpen(s)
          ? `A door: a Maw that breaks the ${roomName(id, true)} comes through it, and the Veil cracks.`
          : `A door: from ${doorsWhen()}, a Maw that breaks the ${roomName(id, true)} will come through it, and the Veil crack.`
        : 'Empty, it is no door.';
  const sel = s.phase === 'day'
    ? `<select id="hang-${m.id}" data-act="hang" data-id="${m.id}" aria-label="Where the ${esc(m.name)} hangs">${Object.values(G.rooms)
        .sort((a, b) => b.f - a.f || a.x0 - b.x0)
        .map((r) => {
          const o = mirrorIn(s, r.id);
          return `<option value="${r.id}"${r.id === id ? ' selected' : ''}>${r.id === id ? 'Hangs in' : 'Hang in'} the ${roomName(r.id)}, ${floorWord(G, r.f)}${o && o !== m ? `, for the ${esc(o.name)}` : ''}</option>`;
        })
        .join('')}</select>`
    : '';
  const turn = (s.phase === 'day' || s.phase === 'dusk') && !m.hidden ? `<button class="btn sm" id="turn-${m.id}" data-act="turn" data-id="${m.id}"${m.turned ? '' : ' data-on="1"'}>${m.turned ? 'Turn it back' : 'Turn to the wall'}</button>` : '';
  return `<p class="note mplace">${where} ${state}</p>${sel || turn ? `<div class="row">${sel}${turn}</div>` : ''}`;
}
// When the Maws first come through a door: the keep's doorsFrom-th season, by name in a year.
const doorsWhen = () => (s.tuning.year && s.tuning.doorsFrom <= SEASONS.length ? SEASONS[s.tuning.doorsFrom - 1] : `the keep's season ${s.tuning.doorsFrom}`);
// At dusk: the doors tonight, and a turn for each.
export function doorsCard() {
  if (!doorsOpen(s)) return '';
  const G = K();
  const ms = s.mirrors.filter((m) => hangsIn(s, m) && !m.hidden && (m.turned || isDoor(s, m)));
  if (!ms.length) return '';
  const maws = s.night?.spawns?.filter((x) => x.type === 'maw').length || 0;
  const rows = ms
    .map((m) => {
      const id = hangsIn(s, m);
      const n = s.shades.filter((d) => d.mirror === m.id).length;
      return `<li><span>The ${esc(m.name)}, opening on the ${roomName(id, true)} ${tainPlace(G, G.rooms[id].f, true)}: ${m.turned ? `turned to the wall${n ? `, ${plural(n, 'shade')} sitting out` : ''}` : `open, ${plural(n, 'shade')}`}</span><button class="btn sm" id="turn-${m.id}" data-act="turn" data-id="${m.id}"${m.turned ? '' : ' data-on="1"'}>${m.turned ? 'Turn back' : 'Turn to the wall'}</button></li>`;
    })
    .join('');
  return `<div class="card doors"><h3>The doors</h3><p class="note">${maws ? `${maws === 1 ? 'A Maw rises' : `${maws} Maws rise`} tonight. ` : ''}A mirror with a shade in it is a door: a Maw that breaks its twin comes through, and the Veil cracks. Turned to the wall it lets nothing through, but its shades sit the night out.</p><ul class="facts">${rows}</ul></div>`;
}
// Quicksilver upgrades a hand mirror into a pier glass, a pier glass into a great glass, and since round seven's
// phase 12 a great glass into a great-glass hall.
function upgradeHTML(m) {
  const T = s.tuning;
  const next = { hand: 'pier', pier: 'great', ...(T.glassHalls ? { great: 'hall' } : {}) }[m.type];
  if (!T.deep || !brought(s, 'deep') || !next || s.phase === 'over') return '';
  const qs = T.upgradeSilver[next];
  const gl = T.upgradeGlass[next];
  const can = !embargoed(s) && (s.res.quicksilver || 0) + 1e-9 >= qs && s.res.glass + 1e-9 >= gl;
  return `<button class="btn sm" id="upgrade-${m.id}" data-act="upgrade-mirror" data-id="${m.id}"${can ? '' : ' disabled'}>To a ${MIRRORS[next].name}: ${qs} quicksilver, ${gl} glass</button>`;
}
// Breaking a mirror, asked twice: what it frees, what it costs.
export function breakHTML(m) {
  const T = s.tuning;
  const ds = s.shades.filter((d) => d.mirror === m.id);
  if (ui.breakAsk !== m.id) return `<button class="btn sm" id="break-${m.id}" data-act="break-ask" data-id="${m.id}">Break</button>`;
  return `<div class="break-ask"><p class="note bad">Break the ${esc(m.name)}? ${esc(listOf(ds.map((d) => d.name)))} ${ds.length === 1 ? 'goes' : 'go'} free at once: +${ds.length} remembrance, Dread −${fmt(T.breakDread * ds.length)}. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness comes ${T.badLuck === 2 ? 'twice' : `${fmt(T.badLuck)} times`} as often.</p>
    <div class="row"><button class="btn sm primary" id="break-yes" data-act="break" data-id="${m.id}">Break it</button><button class="btn sm" id="break-no" data-act="break-no">Keep it</button></div></div>`;
}
// Where the living sleep: beds, the crowded, and last night's dreams and nightmares.
export function sleepNotes() {
  const T = s.tuning;
  if (!T.dreamwell) return '';
  const b = beds(s);
  const n = s.living.length;
  const bad = s.living.filter((p) => p.nightmare);
  const plague = plagueSeason(s) ? 1 + Math.floor(Math.max(0, n - b) / T.plagueCrowd) : 0;
  return [
    n > b ? `<p class="note bad">Beds for ${b}, and ${n} living: ${n - b} sleep crowded, and sickness comes ${fmt(T.crowdSick)} times as often. Each Quarters adds ${T.quartersBeds} beds.</p>` : '',
    plague ? `<p class="note${plague > 1 ? ' bad' : ''}">Summer is plague season: in a crowded keep, sickness takes one more for every ${T.plagueCrowd} living beyond the beds. ${plague > 1 ? `As you sleep now, it would take ${plague} at once.` : 'As you sleep now, it would take one.'}</p>` : '',
    bad.length ? `<p class="note">${esc(listOf(bad.map((p) => p.name)))} woke from ${bad.length === 1 ? 'a nightmare and works' : 'nightmares and work'} at ${Math.round(100 * T.nightmareMult)}% today.</p>` : '',
  ].join('');
}
// Where a Maw broke a room's twin last night: haunted today, or ruined where it was left alone there. Since round
// seven, phase 11, the dawn doesn't call these out, so this is where they're said.
function hauntedNote() {
  const T = s.tuning;
  const ruined = (s.ruined || []).filter((id) => s.haunted.includes(id));
  const haunted = s.haunted.filter((id) => !ruined.includes(id));
  const names = (ids) => esc(listOf(ids.map((id) => roomName(id))));
  return [
    haunted.length ? `<p class="note">Haunted today: the ${names(haunted)}. A Maw broke ${haunted.length === 1 ? 'its twin' : 'their twins'} last night${T.hauntWork < 1 ? `, and whoever works there manages ${Math.round(100 * T.hauntWork)}% of their work` : ''}.</p>` : '',
    ruined.length ? `<p class="note bad">Ruined today: the ${names(ruined)}. A Maw was left alone in ${ruined.length === 1 ? 'its twin' : 'their twins'} last night, and whoever works there manages ${Math.round(100 * T.ruinWork)}% of their work.</p>` : '',
  ].join('');
}
// Round seven, phase 12: from the keep's second year, what a Maw broke, a fire burned out or an assault took off
// the gate stays a while, each with its mending.
function repairsCard() {
  const T = s.tuning;
  if (!repairing(s)) return '';
  const day = s.phase === 'day';
  const stone = s.res.stone || 0;
  const mend = (id, cost, label = `Mend, ${fmt(cost)} stone`) => `<button class="btn sm" id="mend-${id}" data-act="mend" data-id="${id}"${day && stone + 1e-9 >= cost ? '' : ' disabled'}>${label}</button>`;
  const rows = [];
  for (const id of s.haunted || []) {
    const more = (s.hauntLeft?.[id] || 1) - 1;
    rows.push(`<li><span>The ${esc(roomName(id))} is haunted: ${more ? `${T.dreadPerBroken} Dread at ${more === 1 ? 'the next dawn' : `each of the next ${more} dawns`}` : 'it lifts at the next dawn'}.</span>${more ? mend(id, T.mendStone) : ''}</li>`);
  }
  for (const id of s.scorched || []) {
    const n = s.burnLeft?.[id] || 1;
    rows.push(`<li><span>The ${esc(roomName(id))} is burned out: nobody works there ${n === 1 ? 'today' : `for ${n} days`}.</span>${mend(id, T.mendStone)}</li>`);
  }
  const gate = s.gate ?? 1;
  if (gate < 1 - 1e-9) rows.push(`<li><span>The gate is ${Math.round(100 * gate)}% whole; it mends a quarter a day of itself.</span>${s.raid?.state === 'assault' ? '' : mend('gate', T.raidShoreCost, `Mend a quarter, ${fmt(T.raidShoreCost)} stone`)}</li>`);
  if (!rows.length) return '';
  return `<div class="card repairs"><h3>Repairs</h3><ul class="facts">${rows.join('')}</ul><p class="note">Stone ${floor1(stone)}: masons in the Yard quarry ${DAY_ROOMS.yard.rate} a day each.</p></div>`;
}
// Round seven, phase 12: the year's trouble, from the second year of the open year.
function troubleNote() {
  const T = s.tuning;
  const id = troubleOf(s);
  if (!id) return '';
  const X = TROUBLES[id];
  const can = s.phase === 'day' && roomsOf(K(), 'chapel').length && s.res.remembrance + 1e-9 >= T.troubleRite;
  const rite = !T.troubleRite ? '' : eased(s) ? ' A rite against it holds until the season ends: it does half what it would.' : '';
  const btn = T.troubleRite && !eased(s) ? `<div class="row"><button class="btn sm" id="ease-trouble" data-act="ease-trouble"${can ? '' : ' disabled'}>A rite against it, ${fmt(T.troubleRite)} remembrance: half as hard this season</button></div>` : '';
  return `<div class="note chapter"><p>Year ${yearOf(s)}: <b>${esc(X.name)}</b>: ${esc(X.text)}.${esc(rite)}</p>${btn}</div>`;
}
// Round seven, phase 12: standing wards, set by day for the rest of the season with essence the store has.
function standingCard() {
  const T = s.tuning;
  // From the keep's first summer, as the Library and the Hall (phase 4's staging): a first spring has enough.
  if (!T.standingWard || s.phase !== 'day' || s.season < (T.lateRoomsFrom || 1)) return '';
  const cost = standingCost(s);
  const n = nightsLeft(s);
  const stand = standingOf(s);
  const targets = [...MAP.rifts.map((r) => r.id), 'moat', ...(undergateOpen(s) ? ['undergate'] : [])].filter((w) => !stand.includes(w));
  const can = s.res.essence + 1e-9 >= cost;
  const veil = T.veilWard ? `<li><span>The Veil: it breaks at ${cracksOf(s)} cracks this season${s.veilHeld ? ', warded' : ''}</span><button class="btn sm" id="ward-veil" data-act="ward-veil"${s.res.essence + 1e-9 >= veilWardCost(s) ? '' : ' disabled'}>One crack more, ${fmt(veilWardCost(s))} essence</button></li>` : '';
  const rows = veil + targets.map((w) => `<li><span>${esc(upper(wardName(w)))}</span><button class="btn sm" id="stand-${w}" data-act="stand-ward" data-target="${w}"${can ? '' : ' disabled'}>Ward for the season, ${fmt(cost)} essence</button></li>`).join('');
  return `<div class="card standing"><h3>Standing wards</h3>${stand.length ? `<p class="note">Warded every night this season: ${esc(listOf(stand.map((w) => wardName(w))))}.</p>` : ''}
    ${once('standing', `<p class="note">A standing ward holds every night left in the season, ${n === 1 ? 'tonight only' : `${n} of them`}, for ${fmt(T.standingWard * 100)}% of a night's ward each, paid now. A stair's can be set at dusk.</p>`, 'Standing wards', 'growth')}
    ${rows ? `<ul class="facts">${rows}</ul>` : ''}</div>`;
}
export const badLuckNote = () => (s.badLuck > 0 ? `<p class="note bad">A broken mirror's bad luck: ${plural(s.badLuck, 'more day')} when sickness comes ${s.tuning.badLuck === 2 ? 'twice' : `${fmt(s.tuning.badLuck)} times`} as often.</p>` : '');

export function dayPanel() {
  const T = s.tuning;
  const pw = roomPower(s);
  const sick = s.living.filter((p) => p.sick > 0);
  const moon = T.seasonDays - s.day;
  const len = dayLength(s);
  const rows = WORK_ROOMS.filter((id) => jobCap(s, id) > 0 || jobCount(s, id) > 0).map((id) => {
    const R = DAY_ROOMS[id];
    const n = jobCount(s, id);
    const cap = jobCap(s, id);
    const k = s.shades.filter((d) => stepsThrough(s, d) && stepRoom(s, d) === id).length;
    const w = s.shades.find((d) => whispers(s, d) && coaches(s, d) === id);
    const out = id === 'infirmary' ? `heals ${fmt(pw[id] * R.rate * len)}/day` : id === 'forge' && T.forgeArms ? `${fmt(pw[id] * R.rate * len)} arms/day` : R.out === 'defense' ? `defense ${fmt(pw[id] * R.rate)}` : `${fmt(pw[id] * R.rate * len)} ${R.out}/day`;
    return `<li><span>${R.name} <small class="muted">${plural(n, R.role)}${k ? ` and ${plural(k, 'shade')},` : ''}${Number.isFinite(cap) ? ` of ${cap}` : ''}${w ? `, ${esc(w.name)} whispering` : ''}</small></span><span class="num">${out}</span></li>`;
  }).join('');
  // Food in and out, a day at a time (round seven: rates, not only stores).
  const makes = (pw.hearth || 0) * DAY_ROOMS.hearth.rate * len;
  const eats = eatRate(s);
  const food = `<p class="note${makes + 1e-9 < eats ? ' bad' : ''}">Food ${floor1(s.res.food)}: the keep eats ${fmt(eats)} a day and the Hearth makes ${fmt(makes)}.</p>`;
  const arms = T.forgeArms && (jobCap(s, 'forge') > 0 || s.arms >= 1) ? `<p class="note">Arms ${floor1(s.arms || 0)} of ${armsCap(s)}, one for each guard's post: each makes a guard ${fmt(T.armDefense)} stronger at the gate, and a raid at the gate breaks one in ${Math.round(1 / T.armsBreak)} of those in use. Smiths make ${fmt(DAY_ROOMS.forge.rate)} a day each${T.coldForge ? '; a Forge nobody works is cold, and can\'t catch fire' : ''}.</p>` : '';
  const lunar = isLongNight(s) ? `Tonight is the Long Night: ${longTimes()} as long as a winter night, with the Hollow, a Maw and more of the Unlit${s.night?.great ? `, and at ${hhmm(18 + (12 * s.night.great) / nightTicks(s))} a last great tide` : ''}. At dawn the year ends.` : moon > 0 ? `The ${T.year && seasonIndex(s) === 3 ? 'Long Night' : 'new moon'} is ${plural(moon, 'night')} off.` : 'Tonight is the new moon. The Hollow will rise.';
  // A raid today, or one on its way, is now; one expected on a later day is what's coming.
  const raid = raidCard();
  const raidNow = s.raid ? raid : '';
  return `<header class="ph-head"><h2>${seasonWord() ? `${seasonWord()}, day ${s.day}` : `Day ${s.day}`}</h2><p>${lunar}</p></header>
    ${once('day', '<p class="note">The living work by day. Anyone who dies inside the walls wakes at dusk, as a shade.</p>', 'The day', 'day')}
    ${chapterCard(false)}
    ${troubleNote()}
    ${eclipseCard()}
    ${fireCards()}
    ${visitorCards()}
    ${siegeCard()}
    ${gateGuard(s) ? `<p class="note">${esc(listOf(s.shades.filter((d) => atGate(s, d)).map((d) => d.name)))} ${s.shades.filter((d) => atGate(s, d)).length === 1 ? 'stands' : 'stand'} at the gate today, as asked: +${fmt(gateGuard(s))} defense.</p>` : ''}
    ${raidNow}
    ${inspectionCard()}
    ${sick.length ? `<p class="note bad">Sick: ${esc(listOf(sick.map((p) => p.name)))}. A healer in the Infirmary cures one a day; untreated, the sickness kills.</p>` : ''}
    ${s.hungry ? '<p class="note bad">The larder is empty. Everyone works hungry, and the weakest will starve. Put more cooks in the Hearth.</p>' : ''}
    ${repairing(s) ? repairsCard() : hauntedNote()}
    ${badLuckNote()}
    ${sleepNotes()}
    <div class="card"><h3>Work today</h3>${food}<ul class="facts">${rows}</ul>${arms}</div>
    ${winterCard()}
    ${s.day === 1 ? seasonNote() : ''}
    ${s.daily && s.season === 1 && s.day === 1 ? `<p class="note">This is the keep of ${esc(dayText(s.daily))}: everyone who plays it gets this same keep, on the same rules.</p>` : ''}
    ${weatherNotes()}
    ${s.raid ? '' : raid}
    ${churchCard()}
    ${standingCard()}
    ${libraryCard()}
    ${hallCard()}
    ${deadByDay()}
    <div class="card"><h3>The mirrors</h3>${once('mirrors', `<p class="note">Each shade needs a place in a mirror; with no room, the dead wake Restless. Breaking one, in an emergency, frees everyone in it at once and lowers Dread, at the price of the mirror and ${s.tuning.badLuckDays} days of bad luck.</p>`, 'Mirrors', 'mirrors')}${mirrorsHTML()}${buildRow()}</div>`;
}
