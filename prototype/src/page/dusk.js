// The campaign's cards, the eclipse, the dead by day, and the Dusk panel.

import { TICKS_PER_SEC, DAY_ROOMS, KINDS, MAP, SEASONS, OMENS, CHAPTERS, ENDINGS } from '../slice/data.js';
import { roomAt, roomSpan, lightMap, isLit, DEEP_FLOOR } from '../slice/geo.js';
import { jobCap, jobCount, crossingPreview, canWork, funeralCap, dayTicks, nightTicks, isNewMoon, byId, isTwinnedLiving, fmt, tainPlace, doorAt, doorsOpen, postRoom, wardCost, wardDrawOf, wardHoldOf, hollowNeed, hollowRewardOf, pinned, winterNeed, shadeTrait, inGreatGlass, whispers, stepsThrough, perf, coaches, stepRoom, seasonIndex, isLongNight, besieged, sallyOdds, omenText, gatehouseOf, undergateOpen, eclipseDue, eclipseSpan, bondedShade, chapterOf, boonNow, brought, goalOf, closeOf, wardPlace } from '../slice/sim.js';
import { threats } from '../slice/threats.js';
import { W, prefs, s, K, ui } from './state.js';
import { esc, plural, upper, wakesAs, listOf, floor1, roomName, hhmm, longTimes, once, aside } from './hud.js';
import { share, doorsCard } from './day.js';
import { takingBack } from './stage.js';
import { lineSpots } from './guide.js';

// Round seven, phase 9: from autumn, winter's candles by the keep's own last week (sim.js: winterNeed), and in
// the open year the campaign's first goal as the rule of thumb it is.
export function winterCard() {
  const w = winterNeed(s);
  if (!w) return '';
  const goal = chapterOf(s) ? '' : ` A campaign's first year asks for ${CHAPTERS[1].goal.n} put by as winter begins.`;
  return `<p class="note${w.have < w.need ? ' bad' : ''}">Winter, by this keep's last week: its nights will burn about ${plural(w.burn, 'candle')} and it will make about ${w.make}, so it needs about ${w.need} put by. You have ${w.have}.${goal}</p>`;
}
// The campaign (round six): the chapter this year is, what it brings, its goal and how it's going. Told in full
// at the chapter's first dawn; by day a line.
function goalSoFar(k) {
  const g = goalOf(s, k);
  const y = (season) => Math.floor((season - 1) / SEASONS.length) + 1;
  const days = [...s.days.filter((d) => y(d.season) === k), s.today];
  if (s.campaign.goals[k] !== undefined) return s.campaign.goals[k] ? 'Met.' : 'Not met.';
  if (g.id === 'candles') return `${floor1(s.res.candles)} candles in the store now; it counts as winter begins.`;
  if (g.id === 'gate') {
    const raids = days.map((d) => d.raid).filter((r) => r && !r.crusade && !r.paid);
    const lost = raids.filter((r) => !r.held).length;
    return lost ? `The gate gave way ${plural(lost, 'time')} this year: not met.` : `${plural(raids.length, 'raid')} held so far.`;
  }
  if (g.id === 'church') return s.inspections.some((i) => y(i.season) === k && i.verdict === 'censured') ? 'Censured this year: not met.' : `No censure so far.`;
  if (g.id === 'hollow') return days.some((d) => d.night?.hollow === 'driven back') ? 'The Hollow was driven back: met at the year\'s end.' : 'Not yet: it withdraws at dawn if it isn\'t met on its way. Send fighters down to it.';
  // Round seven, phase 15 (chapterGoals).
  if (g.id === 'sally') {
    if (days.some((d) => d.sallies?.includes(1))) return 'The camp was broken: met at the year\'s end.';
    if (besieged(s)) return `The Host is camped outside: sally out from the Day panel's siege card (the odds now ${Math.round(100 * sallyOdds(s))}%). More guards, better odds.`;
    return seasonIndex(s) < 2 ? 'The Host lays siege in autumn. Guards in the Barracks and the Gatehouse are the ones who sally out.' : 'Not this year: the siege is past.';
  }
  if (g.id === 'kept') {
    const looked = s.inspections.filter((i) => y(i.season) === k);
    const kept = s.shades.filter((d) => d.mirror).length;
    if (looked.some((i) => i.verdict !== 'blessed' || (i.shades ?? 0) < g.n)) return 'Not met this year: an inspection found the keep short of it.';
    return `${looked.length ? `${plural(looked.length, 'inspection')} so far, each blessed with ${g.n} or more in the glass. ` : ''}${kept} in the glass now. Keeping the dead raises Dread: vigils ease it.`;
  }
  if (g.id === 'silver') return days.some((d) => d.upgraded) ? 'A mirror was raised: met at the year\'s end.' : `Quicksilver ${floor1(s.res.quicksilver || 0)}: a shade sent down into the Deep at dusk brings it back, and Mirrors raises a mirror with it.`;
  return 'At the year\'s end.';
}
export function chapterCard(full) {
  const k = chapterOf(s);
  if (!k) return '';
  const C = CHAPTERS[k];
  const reward = `worth ${s.tuning.goalReward} remembrance`;
  const goal = goalOf(s, k);
  if (!full) return `<p class="note chapter">Year ${k} of the campaign, <b>${esc(C.name)}</b>. The goal: to ${esc(goal.text)} (${reward}). ${esc(goalSoFar(k))}</p>`;
  const help = Object.entries(s.campaign.boons || {}).filter(([id]) => boonNow(s, id)).map(([id]) => closeOf(s, k - 1).find((c) => c.id === id)).filter(Boolean);
  // Round seven, phase 15: the chapter told in full, and what it brings that the year before hadn't
  // (chapterSystems); a keep from before has the line it always had.
  const told = s.tuning.chapterSystems && C.story;
  return `<div class="card chapter"><span class="eyebrow">The campaign, year ${k} of 5</span><h3>${esc(C.name)}</h3><p>${esc(told ? C.story : C.text)}</p>${told && C.brings ? `<p class="note"><b>New this year:</b> ${esc(C.brings)}.</p>` : ''}<p class="note">The goal: to ${esc(goal.text)}, ${reward}.${help.length ? ` From last year's close: ${esc(help.map((c) => `${c.name.charAt(0).toLowerCase()}${c.name.slice(1)}, ${c.text}`).join('; '))}.` : ''}</p></div>`;
}
// A chapter's close (years 1 to 4): its goal, and the choice for the next; after the fifth, the three endings.
export function chapterCloseHTML() {
  const k = chapterOf(s);
  const C = CHAPTERS[k];
  const met = s.campaign.goals[k];
  const goal = `<p class="note${met ? ' good' : ''}">The goal, to ${esc(goalOf(s, k).text)}, was ${met ? `met: +${s.tuning.goalReward} remembrance` : 'not met'}.</p>`;
  if (C.close) {
    const next = CHAPTERS[k + 1];
    const closes = closeOf(s, k);
    // Round six's closes set the lasting help against goods now; phase 15's are two helps, neither the default.
    const lead = closes.some((c) => c.gain);
    return `<div class="card ending"><h3>${esc(C.name)} closes</h3>${goal}<p>Next comes year ${k + 1}, ${esc(next.name)}${s.tuning.chapterSystems && next.brings ? `, with ${esc(next.brings)}` : ''}. Its goal: to ${esc(goalOf(s, k + 1).text)}. How does this chapter close?</p>
      <div class="endings">${closes.map((c) => `<div><button class="btn${lead && !c.gain ? ' primary' : ''}" id="close-${c.id}" data-act="close-chapter" data-id="${c.id}">${esc(c.name)}</button><p class="note">${esc(upper(c.text))}.</p></div>`).join('')}</div></div>`;
  }
  const n = s.shades.length;
  const ask = ui.endAsk;
  const confirm = ask ? `<p class="note bad">${esc(ENDINGS[ask].name)}? The keep's story ends here${ask === 'seal' && n ? `, and ${n === 1 ? 'the last shade goes' : `all ${n} shades go`} free` : ''}, and it can't be played on.</p><div class="row"><button class="btn sm primary" id="end-yes" data-act="end-yes">${esc(ENDINGS[ask].name)}</button><button class="btn sm" id="end-no" data-act="end-no">Cancel</button></div>` : '';
  return `<div class="card ending"><h3>The campaign's end</h3>${goal}<p>Five years, and the last Long Night, are behind the keep. How does its story end?</p>
    <div class="endings">
      <div><button class="btn" id="end-seal" data-act="end-ask" data-id="seal">${ENDINGS.seal.name}</button><p class="note">${esc(ENDINGS.seal.text)}</p></div>
      <div><button class="btn" id="end-open" data-act="end-ask" data-id="open">${ENDINGS.open.name}</button><p class="note">${esc(ENDINGS.open.text)}</p></div>
      <div><button class="btn primary" id="end-watch" data-act="take-glass">${ENDINGS.watch.name}</button><p class="note">${esc(ENDINGS.watch.text)}</p></div>
    </div>${confirm}</div>`;
}

// The eclipse (round six): midsummer's morning, the dark itself, and what it left.
export function eclipseCard() {
  const T = s.tuning;
  if (!eclipseDue(s)) return '';
  const e = s.today.eclipse;
  if (e) {
    const woke = e.woke.map((id) => byId(s.shades, id)?.name || s.ledger.find((x) => x.id === id)?.name).filter(Boolean);
    return `<div class="card eclipse"><h3>The eclipse is over</h3><p>${plural(e.spawned, 'Creeper')} climbed in the dark: ${e.killed} cut down${e.burned ? `, ${e.burned} burned away when the sun came back` : ''}${e.cracks ? `, and the Veil cracked ${plural(e.cracks, 'time')}: ${e.cracks === 1 ? 'it counts' : 'they count'} at the next rite` : ''}.${e.back ? ` ${plural(e.back, 'candle')} came back to the store.` : ''}</p>${woke.length ? `<p class="note">Woke at once: ${esc(listOf(woke))}.</p>` : ''}${e.side.length ? `<p class="note good">Stood beside their dead, and at peace: ${esc(listOf(e.side))}.</p>` : ''}</div>`;
  }
  // Who stands beside their dead: a living one working a room, their shade posted in its twin.
  const pairs = s.living.map((p) => [p, bondedShade(s, p)]).filter(([p, d]) => d && canWork(d) && p.job);
  const side = pairs.filter(([p]) => isTwinnedLiving(s, p));
  const apart = pairs.filter(([p]) => !isTwinnedLiving(s, p));
  const pairText = `${side.length ? `Side by side now: ${esc(listOf(side.map(([p, d]) => `${p.name} and ${d.name}`)))}. ` : ''}${apart.length ? `Bonded but apart: ${esc(listOf(apart.map(([p, d]) => `${p.name} (${DAY_ROOMS[p.job].name}) and ${d.name} (${roomName(postRoom(s, d), true)})`)))}; post the shade in the twin of the living one's room.` : ''}`;
  const rule = `A living person and their dead, the shade posted in the twin of the living one's room, work and fight ×${mult(T.eclipseTwin)} while it lasts, and one who stands beside their dead through half of it is at peace after. Anyone who dies in the dark wakes at once, with no funeral.`;
  if (!s.eclipse) {
    const [from] = eclipseSpan(s);
    if (s.t >= from) return '';
    return `<div class="card eclipse"><h3>Midsummer</h3><p>At ${hhmm(6 + (12 * from) / dayTicks(s))} the sun goes dark for ${fmt(T.eclipseSecs)} seconds, and the Tain wakes while the day goes on: the dead stand at their posts, and about ${Math.round(T.eclipseCreepers * 100)}% of a night's Creepers climb from the rifts in one tide. Set candles and move the shades below the Veil, as at night. When the sun comes back, the Unlit left burn away.</p><p class="note">${rule}</p>${pairs.length ? `<p class="note">${pairText}</p>` : ''}</div>`;
  }
  const n = s.night;
  const left = Math.max(0, Math.ceil((s.eclipse.to - s.t) / TICKS_PER_SEC));
  const up = n.foes.filter((f) => f.type !== 'wraith').length;
  const coming = n.spawns.length;
  return `<div class="card eclipse warn"><h3>The eclipse</h3><p>The sun is dark for <b data-live="eclipse-left">${left}</b> more seconds. ${up ? `${plural(up, 'of the Unlit', 'of the Unlit')} in the Tain` : 'None of the Unlit in the Tain yet'}${coming ? `, ${coming} still to come` : ''}. Tap below the Veil to set candles and move the shades; the Host and the day's work go on above.</p><p class="note">${rule}</p>${pairs.length ? `<p class="note">${pairText}</p>` : ''}</div>`;
}

// Whispers and the great glass: which of the dead help today, and what it will cost them at dusk.
export const mult = (x) => String(Math.round(x * 100) / 100);
const dayCost = (d, base) => base * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1);
export function deadByDay() {
  const T = s.tuning;
  if (!T.whispers) return '';
  const can = s.shades.filter(canWork);
  const busy = can.filter((d) => whispers(s, d) || stepsThrough(s, d));
  const able = can.filter((d) => (DAY_ROOMS[coaches(s, d)]?.out && jobCap(s, coaches(s, d)) > 0) || inGreatGlass(s, d));
  if (!busy.length && !able.length) return '';
  const rows = busy
    .map((d) => {
      if (whispers(s, d)) {
        const R = DAY_ROOMS[coaches(s, d)];
        const n = jobCount(s, coaches(s, d));
        return `<li><span><b>${esc(d.name)}</b> whispers to the ${R.name}: ${n ? `${plural(n, R.role)} ${n === 1 ? 'works' : 'work'} ×${mult(T.whisperMult)}` : "nobody works there, so it costs nothing today"}</span><span class="num">−${fmt(n ? dayCost(d, T.whisperFade) : 0)} memory</span></li>`;
      }
      return `<li><span><b>${esc(d.name)}</b> works in the ${DAY_ROOMS[stepRoom(s, d)].name} in person, at ${Math.round(100 * perf(d) * T.stepWork)}%</span><span class="num">−${fmt(dayCost(d, T.stepFade))} memory</span></li>`;
    })
    .join('');
  return `<div class="card"><h3>The dead by day</h3>${rows ? `<ul class="facts">${rows}</ul>` : ''}
    ${once('by-day', T.mirrorRooms ? `<p class="note">A shade can whisper through its mirror to whoever works the room it hangs in (×${mult(T.whisperMult)}), for ${fmt(T.whisperFade)} memory at dusk. One in a great glass can step through instead and work that room in person, for ${fmt(T.stepFade)}. The named pay half. Memory is what keeps a shade in the glass.</p>` : `<p class="note">A shade can whisper its old trade to whoever works it now (×${mult(T.whisperMult)}), for ${fmt(T.whisperFade)} memory at dusk. One in a great glass can step through instead and work a room in person, for ${fmt(T.stepFade)}. The named pay half. Memory is what keeps a shade in the glass.</p>`, 'Whispering, and stepping through', 'mirrors')}<p class="note">${busy.length ? 'Change it in People.' : 'Set it in People.'}</p></div>`;
}

export function duskCrypt() {
  const plan = crossingPreview(s);
  const cap = funeralCap(s);
  const booked = s.bodies.filter((b) => b.funeral).length;
  const fate = (x) => {
    if (x.to === 'funeral') return ['Funeral: laid to rest, +1 remembrance', ''];
    if (x.to === 'mirror') return [`Wakes ${KINDS[x.b.kind].name}${wakesAs(x.b) ? ` and ${wakesAs(x.b)}` : ''} in the ${x.mirror.name}`, ''];
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

export const wardName = (id) => wardPlace(s, id);

function tidesText() {
  const n = s.night;
  const N = nightTicks(s);
  return n.tides.map((t) => hhmm(18 + (12 * t) / N)).join(', ');
}

// Tonight's omen at dusk (round six): one, or two to choose between.
function omenCard() {
  const n = s.night;
  if (!n?.omen && !n?.omens) return '';
  const line = (o) => `<b>${esc(OMENS[o.id].name)}</b>: ${esc(omenText(s.tuning, o))}.`;
  if (!n.omens) return `<div class="card omen"><p><span class="k">Tonight's omen.</span> ${line(n.omen)}</p></div>`;
  return `<div class="card omen"><p><span class="k">The black mirror shows two omens.</span> Choose one before the night begins; until then you can change your mind, and if you don't choose, the first comes.</p>
    <div class="omen-pick">${n.omens.map((o, i) => `<button class="btn omen-btn" id="omen-${i}" data-act="omen" data-i="${i}" aria-pressed="${n.omen?.id === o.id}">${line(o)}</button>`).join('')}</div></div>`;
}

export function duskPlace() {
  const T = s.tuning;
  const n = s.night;
  const L = lightMap(K(), T, n.candles);
  const ds = s.shades.filter(canWork);
  const dark = ds.filter((d) => !isLit(L, d.post.f, d.post.x));
  const creepers = n.spawns.filter((x) => x.type === 'creeper').length;
  const maws = n.spawns.filter((x) => x.type === 'maw').length;
  const wraiths = s.shades.filter((d) => d.kind === 'wraith');
  return `<header class="ph-head"><h2>Dusk: set the night</h2><p>${plural(creepers, 'Creeper')} tonight, in tides around ${tidesText()}.${maws ? ` ${maws === 1 ? 'A Maw comes' : `${maws} Maws come`} with the ${n.great ? 'tide before the last' : 'last tide'}.` : ''}${isLongNight(s) ? ` <b>Tonight is the Long Night: ${longTimes()} as long as a winter night, with the Hollow and a Maw${n.great ? `, and at ${hhmm(18 + (12 * n.great) / nightTicks(s))} a last great tide of ${n.spawns.filter((x) => x.great).length}` : ''}. At dawn the year ends.</b>` : isNewMoon(s) ? ' <b>Tonight is the new moon: the Hollow rises.</b>' : ''} Set candles, post the shades, and begin.</p></header>
    ${s.lastDusk ? `<div class="row"><button class="btn" id="btn-last" data-act="as-last-night">As last night</button></div>${once('as-last', '<p class="hint">As last night puts the shades back at the posts last night began with, and lights its candles again where they stood, as far as the store goes. Wards you set again yourself.</p>', 'As last night')}` : ''}
    ${blackMirror()}
    ${doorsCard()}
    ${nightTicks(s) > s.tuning.candleWax * TICKS_PER_SEC ? `<p class="note">Tonight lasts ${minsSecs(nightTicks(s) / TICKS_PER_SEC)} at 1×, and a candle burns ${minsSecs(s.tuning.candleWax)}. Keep candles back to relight before dawn.</p>` : ''}
    <ul class="facts">
      <li><span>Candles set tonight</span><b class="num">${n.candles.length}, ${floor1(s.res.candles)} left</b></li>
      <li><span>Shades posted in the dark</span><b class="num">${dark.length}</b></li>
      <li><span>Wards</span><b>${n.wards.length ? esc(listOf(n.wards.map(wardName))) : 'none'}</b></li>
    </ul>
    ${n.candles.length || n.wards.length ? once('take-back', '<p class="hint">Until the night begins, a tap on a candle or ward you set takes it back.</p>', 'Taking back') : ''}
    ${dark.length ? `<p class="note">${esc(listOf(dark.map((d) => d.name)))} ${dark.length === 1 ? 'stands' : 'stand'} in the dark, where Creepers catch and drain shades. A shade works only in light.</p>` : ''}
    ${wraiths.length ? `<p class="note bad">${esc(listOf(wraiths.map((d) => d.name)))} will rise as ${wraiths.length === 1 ? 'a Wraith' : 'Wraiths'} in the Waking Room. Cut ${wraiths.length === 1 ? 'it' : 'them'} down to banish for good.</p>` : ''}
    ${s.charm ? `<p class="note">The hedge-witch's charm: tonight the candles burn ×${mult(T.charmBurn)} as fast.</p>` : ''}
    ${n.spawns.some((sp) => sp.curse) ? '<p class="note bad">On the hedge-witch\'s curse, a Weeper comes tonight.</p>' : ''}
    ${n.curse ? `<p class="note bad">The hedge-witch's curse: tonight the candles burn ×${mult(T.curseBurn)} as fast.</p>` : ''}
    ${omenCard()}
    ${undergateDusk()}
    ${drownedDusk()}
    ${moonNote()}
    ${deepCard()}
    <details class="card"><summary><b>How the Tain works</b></summary>
      <ul class="facts">
        <li><span>Creepers rise from the two rifts on the deepest floor and make for the two mirrors on the floor under the Veil, climbing the stairs between. The more floors the keep has, the longer their way.${T.thinStair ? ' A tide rises on the side whose stair up to the Veil has less fight at its foot: leave one thin and it draws them.' : ''}</span></li>
        <li><span>They can't cross light or climb a stair lit at either end.${T.goAround ? " If any way up is dark they take it, however long, and pass lit rooms by. When every way is lit, they gnaw at the edge of the light that bars them." : ' They gnaw at the edge of the first light on their shortest way up.'} Some hunt candles first.</span></li>
        <li><span>A shade standing in light fights anything at its edge. In the dark, shades get caught and drained.</span></li>
        ${T.lineGuard ? '<li><span>A shade in the light at the foot of a stair up to the Veil is guarding the line: it fights, and keeps the Watch if it stands in the Watch of the Dead, but does no other work. To work another room on that floor, light it with a candle of its own, away from the stair.</span></li>' : ''}
        <li><span>Each twin room has a night job for a lit shade at its post: the Choir sings essence, the Silvering makes glass, the Wick Room saves candles, the Threshold readies gentler deaths, the Watch adds to tomorrow's defense and the Cold Hearth halves fading.</span></li>
        <li><span>From night ${T.seepFrom}, some Unlit seep up in rooms with no candle at all.</span></li>
        ${T.dreamwell && T.weepersMax ? `<li><span>The night after a death, Weepers come: one for each of the day's dead, for the dark of the sleepers' twin (the Dreamwell, or the Cold Hearth before there are Quarters). One that weeps there ${fmt(T.nightmareSecs)} seconds gives one of the living a nightmare. They can't enter light, a shade cuts them down, and a Keening shade on their floor sings them quiet.</span></li>` : ''}
        ${T.weather ? `<li><span>On a rainy night the Drowned come up out of the moat's twin, at one end of the floor under the Veil, behind the line. They never take a stair: they make for the mirrors on that floor, and one that reaches a mirror cracks the Veil. Light bars them, and they gnaw it ${share(T.drownedGnaw)} as fast as a Creeper. A shade they catch in the dark is drained and dragged to the moat, and pulled under there. A ward on the moat keeps them under.</span></li>` : ''}
        <li><span>From night ${T.mawFrom}, a Maw comes with the last tide. It walks through light to whatever is worth most for the least fight: the candle barring the way up, or a room where people work, counting every fighter on its way. It tears a candle down. A room it stands in for ${fmt(T.mawBreak)} seconds breaks: no work there that night, and ${T.dreadPerBroken} Dread at dawn. It hits the shades beside it.${T.mawRuin ? ` If no shade meets it there, ${fmt(T.mawRuin)} seconds more ruin the room: tomorrow its workers manage ${Math.round(100 * T.ruinWork)}%, and it costs ${T.dreadPerRuin} more Dread.` : ''}</span></li>
        ${T.lanterns ? `<li><span>A shade can take up a lantern for ${(T.lanternCost ?? 1) === 1 ? 'a candle' : (T.lanternCost ?? 1) === 0.5 ? 'half a candle' : `${fmt(T.lanternCost)} candles`}: its own light for ${fmt(T.lanternWax)} seconds, wherever it goes.${T.hollowLure ? ' On the new moon the Hollow hunts a lantern before it makes for the mirrors.' : ''}</span></li>` : ''}
      </ul></details>
    <div class="row"><button class="btn primary" id="btn-start" data-act="start">Begin the night</button></div>`;
}

// A rainy dusk: where the Drowned come up, and how to meet them.
const moatEnd = (x) => `the ${x < MAP.W / 2 ? 'left' : 'right'} end, in the ${roomName(roomAt(K(), K().veil, x), true)}`;
function drownedDusk() {
  const n = s.night;
  const dr = n?.spawns.filter((x) => x.type === 'drowned') || [];
  if (!dr.length) return '';
  const end = MAP.moat.find((w) => w.id === dr[0].rift) || MAP.moat[0];
  const warded = n.wards.includes('moat');
  if (warded) return `<p class="note">Rain. The moat's twin is warded: the ${plural(dr.length, 'Drowned', 'Drowned')} stay under tonight.</p>`;
  const one = K().n === 1;
  return `<p class="note bad">Rain. ${dr.length === 1 ? 'One of the Drowned comes' : `${dr.length} of the Drowned come`} up tonight out of the moat's twin at ${esc(moatEnd(end.x))}${one ? '' : ', behind the line'}, and ${dr.length === 1 ? 'makes' : 'make'} for the mirrors on that floor. Ward the moat (${fmt(wardCost(s))} essence), or light the mirror on their side and post a fighter by it. A shade they catch in the dark is dragged to the moat and pulled under.</p>`;
}

// The Undergate (round six): the Gatehouse's twin, where from summer a Creeper of each tide comes up.
const undergateMouthOf = () => {
  const g = gatehouseOf(s);
  return g && { f: g.f, x: g.x0 < MAP.W / 2 ? g.x0 + 4 : g.x1 - 4 };
};
function undergateDusk() {
  const n = s.night;
  if (!n || !undergateOpen(s)) return '';
  const g = gatehouseOf(s);
  const k = n.spawns.filter((x) => x.rift === 'undergate').length;
  const where = tainPlace(K(), g.f);
  if (n.wards.includes('undergate')) return `<div class="card"><p class="note">The Undergate is warded tonight: whatever would have come up it comes up at the rifts.</p>${takingBack() ? `<div class="row"><button class="btn sm" id="btn-unward-undergate" data-act="unward" data-target="undergate">Lift the ward: ${fmt(n.wardPaid?.undergate ?? wardCost(s))} essence back</button></div>` : ''}</div>`;
  if (!k) return `<p class="note">The Undergate, your Gatehouse's twin, is ${esc(where)}. It's still tonight: nothing is coming up it.</p>`;
  const can = s.res.essence + 1e-9 >= wardCost(s);
  const m = undergateMouthOf();
  if (m && isLit(lightMap(K(), s.tuning, n.candles), m.f, m.x)) return `<p class="note">A candle burns at the Undergate's mouth: while it's lit, whatever would come up it comes up at the rifts.</p>`;
  return `<div class="card warn"><h3>The Undergate stirs</h3><p>Your Gatehouse's twin is ${esc(where)}, and tonight ${k === 1 ? 'one Creeper comes' : `${k} Creepers come`} up it instead of at a rift, making for the mirrors. A candle at its mouth, at the room's outer end, keeps it shut while it burns; or ward it; or light the mirror nearest it and post a fighter there.</p>
    <div class="row"><button class="btn sm" id="btn-ward-undergate" data-act="ward-undergate"${can ? '' : ' disabled'}>Ward the Undergate: ${fmt(wardCost(s))} essence</button></div></div>`;
}

// Down into the Deep (round five): at dusk, send a shade down past the rifts for quicksilver instead of
// posting it, or call one back.
export const DEPTH_NAMES = ['', 'Not far', 'Deep', 'Deepest'];
const deepOdds = (p) => (p < 0.3 ? `1 in ${Math.round(1 / p)}` : `${Math.round(100 * p)}%`);
function deepCard() {
  const T = s.tuning;
  if (!T.deep || !brought(s, 'deep') || s.dusk?.step !== 'place') return ''; // in a campaign, from The Deep Rises
  const down = s.shades.filter((d) => d.deep);
  const up = s.shades.filter(canWork);
  if (isNewMoon(s)) return ''; // the Hollow is down there
  const depths = [1, 2, 3].map((k) => `depth ${k} (${DEPTH_NAMES[k].toLowerCase()}), ${T.deepSilver[k - 1]} quicksilver, caught ${deepOdds(T.deepCatch[k - 1])}`).join('; ');
  const rows = up.map((d) => `<li><span>${esc(d.name)} <small class="muted">${KINDS[d.kind].name}, memory ${fmt(d.memory)}${shadeTrait(s, d)?.unseen ? ', a Lurker: caught half as often' : ''}</small></span><span class="seg">${[1, 2, 3].map((k) => `<button class="btn sm" id="deep-${d.id}-${k}" data-act="descend" data-id="${d.id}" data-depth="${k}" title="Depth ${k}: ${DEPTH_NAMES[k].toLowerCase()}" aria-label="Send ${esc(d.name)} down to depth ${k}">${k}</button>`).join('')}</span></li>`).join('');
  const gone = down.map((d) => `<li><span>${esc(d.name)} is down at depth ${d.deep}, ${DEPTH_NAMES[d.deep].toLowerCase()}</span><button class="btn sm" id="deep-${d.id}-0" data-act="descend" data-id="${d.id}" data-depth="0">Call back</button></li>`).join('');
  return `<details class="card deep" data-keep="deep"${ui.open.deep ? ' open' : ''}><summary><b>Down into the Deep</b>${down.length ? ` <small class="muted">${down.length} down tonight</small>` : ''}</summary>
      <p class="note">A shade can go down past the rifts tonight instead of taking a post. It's gone until dawn: no light, no fighting, no work. It comes back with quicksilver, which upgrades a mirror where it hangs, unless something down there catches it: then it comes back drained by ${fmt(T.deepDrain)} memory and empty-handed, or not at all. The deeper, the more, and the likelier it's caught: ${depths}.</p>
      ${gone ? `<ul class="facts deep-down">${gone}</ul>` : ''}
      ${rows ? `<ul class="facts deep-list">${rows}</ul>` : ''}
    </details>`;
}

// The black mirror (threats.js): tonight as the candles, posts and wards stand, and tomorrow's raid. Worked
// out again only when something it reads has changed.
let mirrorMemo = { key: '', th: null };
export function threatsNow() {
  const n = s.night;
  if (!n || s.phase !== 'dusk') return null;
  const key = JSON.stringify([s.season, s.day, n.candles.map((k) => [k.id, k.f, k.x]), n.wards, s.shades.map((d) => [d.id, d.f, d.x, d.kind, d.mirror])]);
  if (mirrorMemo.key !== key) mirrorMemo = { key, th: threats(s) };
  return mirrorMemo.th;
}
export const waysOn = () => prefs.ways !== false && s.phase === 'dusk' && s.dusk?.step === 'place';
function blackMirror() {
  const th = threatsNow();
  if (!th) return '';
  const T = s.tuning;
  const N = nightTicks(s);
  const at = (t) => hhmm(18 + (12 * t) / N);
  const side = (x) => (x < MAP.W / 2 ? 'left' : 'right');
  const riftName = (id) => {
    if (id === 'undergate') return 'the Undergate';
    const r = MAP.rifts.find((x) => x.id === id);
    return `the ${side(r.x)} rift`;
  };
  const candleName = (id) => {
    const k = s.night.candles.find((c) => c.id === id);
    if (!k) return 'a candle';
    const stair = lineSpots().some((p) => p.f === k.f && Math.abs(p.x - k.x) <= 6);
    return `the candle ${stair ? 'at the stair up to the Veil, in' : 'in'} the ${roomName(roomAt(K(), k.f, k.x), true)}`;
  };
  const shadeName = (id) => esc(s.shades.find((d) => d.id === id)?.name || 'a shade');
  // Where a line points on the Tain, for a tap to bring into view: where a way ends, or a rift or a room.
  const endOf = (w) => w?.pts?.at(-1) || null;
  const riftSpot = (id) => {
    const r = MAP.rifts.find((x) => x.id === id);
    return r ? { f: DEEP_FLOOR, x: r.x } : undergateMouthOf();
  };
  const roomSpot = (id) => {
    const r = roomSpan(K(), id);
    return r ? { f: r.f, x: Math.round((r.x0 + r.x1) / 2) } : null;
  };
  const goes = (w) => {
    if (w.end === 'gnaw') return { text: `gnaw ${candleName(w.candle)}`, bad: false };
    if (w.end === 'veil') return { text: `reach the ${side(MAP.mirrors.find((m) => m.id === w.mirror).x)} mirror: nothing lit bars their way`, bad: true };
    if (w.end === 'catch') return { text: `catch ${shadeName(w.prey)}, standing in the dark on their way`, bad: true };
    return { text: 'find no way up', bad: false };
  };
  const lines = [];
  if (th.drowned) {
    const D = th.drowned;
    const when = listOf(D.at.map((t) => at(t)));
    lines.push(D.warded
      ? { bad: false, text: `The moat's twin is warded: the Drowned stay under.` }
      : { bad: D.way?.end === 'veil' || D.way?.end === 'catch', spot: endOf(D.way) || { f: D.f, x: D.x }, text: `${D.count === 1 ? 'One of the Drowned comes' : `${D.count} of the Drowned come`} up at ${esc(moatEnd(D.x))} around ${when}. As things stand, ${D.count === 1 ? 'it' : 'they'} would ${goes(D.way || { end: 'none' }).text.replace('find no way up', 'find nothing to go for')}.` });
  }
  // Fog: how many come and when, and not their ways.
  if (th.fog) {
    const all = s.night.spawns.filter((x) => x.type === 'creeper').length;
    return `<details class="card scry fogged" data-keep="scry"${ui.open.scry !== false ? ' open' : ''}><summary><b>The black mirror</b></summary>
      <p class="note">Fog clouds the black mirror tonight. It shows ${plural(all, 'Creeper')}${th.maws.length ? ` and ${plural(th.maws.length, 'Maw')}` : ''}${th.hollow ? ', and the Hollow' : ''}, but not their ways.</p>
      ${th.tides.length ? `<p class="note">Tides at ${listOf(th.tides.map((t) => `${at(t.at)} (${t.count})`))}${th.alone ? `; ${plural(th.alone, 'Creeper')} ${th.alone === 1 ? 'comes' : 'come'} alone` : ''}.</p>` : ''}
    </details>`;
  }
  // Each rift's tide, and its candle hunters where they go elsewhere; rifts whose tides end alike in one line.
  const tides = [];
  for (const e of th.rises) {
    if (!e.way) continue;
    const g = goes(e.way);
    // Candle hunters going the same way count with the tide.
    const n = e.climb + (e.hunt && goes(e.hunt).text === g.text ? e.snuff : 0);
    const same = tides.find((x) => x.text === g.text);
    if (same) {
      same.n += n;
      same.from.push(e.rift);
    } else tides.push({ ...g, n, from: [e.rift], spot: endOf(e.way) });
  }
  for (const x of tides) lines.push({ bad: x.bad, spot: x.spot, text: `${x.from.length > 2 ? 'From both rifts and the Undergate' : x.from.length > 1 ? (x.from.includes('undergate') ? `From ${riftName(x.from.find((r) => r !== 'undergate'))} and the Undergate` : 'From both rifts') : `From ${riftName(x.from[0])}`}, ${plural(x.n, 'Creeper')} will ${x.text}.` });
  for (const e of th.rises) {
    if (!e.hunt || (e.way && goes(e.hunt).text === goes(e.way).text)) continue;
    const g = goes(e.hunt);
    lines.push({ bad: g.bad, spot: endOf(e.hunt), text: `${plural(e.snuff, 'candle hunter')} from ${riftName(e.rift)} will ${g.text}.` });
  }
  if (th.seep) {
    const rooms = [...new Set(th.seepRooms.map((id) => roomName(id, true)))];
    lines.push({ bad: false, spot: th.seepRooms.length ? roomSpot(th.seepRooms[0]) : null, text: `${plural(th.seep, 'Creeper')} may seep up in a room with no candle${rooms.length && rooms.length <= 4 ? `: ${listOf(rooms.map((r) => `the ${r}`))}` : rooms.length ? ` (${rooms.length} such rooms)` : ''}.` });
  }
  for (const m of th.maws) {
    const tg = m.target;
    const what = !tg ? 'nothing it can reach' : tg.kind === 'room' ? `the ${roomName(tg.id, true)} (bracketed)` : `${candleName(tg.id)} (ringed)`;
    const door = tg?.kind === 'room' && doorsOpen(s) && doorAt(s, tg.id); // round seven, phase 13
    lines.push({ bad: !!door, spot: tg ? { f: tg.f, x: tg.x } : riftSpot(m.rift), text: `A Maw rises from ${riftName(m.rift)} around ${at(m.at)}. As things stand it would go for ${what}: what's worth most for the least fight on its way.${door ? ` The ${door.name} hangs open there: break the room, and the Maw comes through it.` : ''}` });
  }
  if (th.weepers) {
    const W = th.weepers;
    const why = !W.curse ? `${plural(W.count, 'Weeper')} will rise for the day's dead` : W.curse === W.count ? `${W.count === 1 ? 'A Weeper' : plural(W.count, 'Weeper')} will rise on the hedge-witch's curse` : `${plural(W.count, 'Weeper')} will rise, for the day's dead and on the hedge-witch's curse,`;
    lines.push({ bad: W.dark, spot: roomSpot(W.rooms[0]), text: `${why} and make for the dark of the ${roomName(W.rooms[0], true)}. ${W.dark ? `It has dark to weep in: each one that weeps there ${fmt(T.nightmareSecs)} seconds gives someone a nightmare. A shade in its light cuts them down, and a Keening shade on its floor sings them quiet.` : "It's lit wall to wall: they can't weep there while the candles last."}` });
  }
  if (th.hollow) {
    const held = th.hollow.held.length;
    lines.push({ bad: !held, spot: riftSpot(th.hollow.rift), text: `The Hollow rises from ${riftName(th.hollow.rift)} around ${at(th.hollow.at)} and walks to the Veil whatever the light. ${held ? `${plural(held, 'ward')} on its way will hold it${s.tuning.wardDraw ? ` while the essence lasts (${rate(wardDrawOf(s))} a second), then` : ''} ${fmt(wardHoldOf(s))} seconds each.` : `No ward stands on its way yet: each one there holds it${s.tuning.wardDraw ? ` while the essence lasts (${rate(wardDrawOf(s))} a second), then` : ''} ${fmt(wardHoldOf(s))} seconds.`}` });
  }
  const tideText = th.tides.map((t) => `${at(t.at)} (${t.count})`);
  const r = th.raid;
  const raidText = r
    ? `<p class="note${r.defense < r.hi ? ' bad' : ''}">Tomorrow, raiders: strength ${fmt(r.lo)} to ${fmt(r.hi)}, against the gate's ${fmt(r.defense)} now.</p>`
    : '';
  return `<details class="card scry" data-keep="scry"${ui.open.scry !== false ? ' open' : ''}><summary><b>The black mirror</b></summary>
      <p class="note">As things stand now. Tap a line to see where.</p>${aside('scry', '<p class="note">What tonight holds as the candles, posts and wards stand now; once it begins, candles burn down and shades move, so it can still turn out otherwise.</p>', 'How sure is it?', 'dusk')}
      <ul class="ways">${lines.map((l, i) => `<li${l.bad ? ' class="bad"' : ''}>${l.spot ? `<button class="way" id="way-${i}" data-act="way-spot" data-f="${l.spot.f}" data-x="${Math.round(l.spot.x)}" title="Show it on the Tain">${l.text}<span class="go" aria-hidden="true">Show</span></button>` : l.text}</li>`).join('')}</ul>
      ${tideText.length ? `<p class="note">Tides at ${listOf(tideText)}${th.alone ? `; ${plural(th.alone, 'Creeper')} ${th.alone === 1 ? 'comes' : 'come'} alone` : ''}.</p>` : ''}
      ${errandsAtDusk()}
      ${raidText}
      <label class="row" for="ways-on"><input type="checkbox" id="ways-on" data-act="ways"${prefs.ways !== false ? ' checked' : ''}>Show their ways on the Tain</label>
      ${aside('ways', "<p class=\"note\">Red chevrons mark each rift's way up, ✕ where they'll gnaw, a ring a mirror they'll reach, ! a shade they'll catch.</p>", 'What the marks mean', 'dusk')}
    </details>`;
}

// What came of the night's errands, at the rite.
export function errandsAtDawn(r) {
  const es = (r.errands || []).filter((e) => e.done && e.done !== 'gone');
  const lost = (r.errands || []).filter((e) => !e.done && e.kind !== 'sleeper').length;
  if (!es.length && !lost) return '';
  const T = s.tuning;
  const bits = es.map((e) => (e.kind === 'echo' ? `${esc(e.by)} found an echo (+${fmt(T.echoMemory)} memory)` : e.kind === 'relic' ? `${esc(e.by)} brought back a relic (${fmt(T.relicGlass)} glass)` : e.done === 'saved' ? (e.by ? `${esc(e.by)} walked ${esc(e.name)} back to bed` : `${esc(e.name)} woke in the light`) : `${esc(e.name)} died sleepwalking in the Tain`));
  return `<p class="note${es.some((e) => e.done === 'lost') ? ' bad' : ''}">The errands: ${bits.length ? listOf(bits) : 'nothing fetched'}${lost ? `; ${plural(lost, 'thing')} left in the dark` : ''}.</p>`;
}
// Errands in words: what, and where.
const errandWhere = (e) => roomName(roomAt(K(), e.f, e.x) || 'crypt', true);
function errandsAtDusk() {
  const es = s.night?.errands || [];
  if (!es.length) return '';
  const T = s.tuning;
  const N = nightTicks(s);
  const bits = es.map((e) => (e.kind === 'echo' ? `an echo in the ${esc(errandWhere(e))} (+${fmt(T.echoMemory)} memory to the shade that reaches it)` : e.kind === 'relic' ? `a relic in the ${esc(errandWhere(e))} (${fmt(T.relicGlass)} glass)` : `around ${hhmm(18 + (12 * e.at) / N)}, ${esc(e.name)} will sleepwalk out of the ${esc(errandWhere(e))} and make for the Deep: light in their way wakes them, and a shade that reaches them walks them back`));
  return `<p class="note${es.some((e) => e.kind === 'sleeper') ? ' bad' : ''}">In the dark tonight: ${listOf(bits)}.${T.lanterns ? ' A lantern (T) carries its own light there.' : ''}</p>`;
}
// Out in the dark now, at night.
export function errandNote() {
  const es = (s.night?.errands || []).filter((e) => !e.done && (e.kind !== 'sleeper' || e.out));
  if (!es.length) return '';
  const walker = es.find((e) => e.kind === 'sleeper');
  const rest = es.filter((e) => e.kind !== 'sleeper').map((e) => `${e.kind === 'echo' ? 'an echo' : 'a relic'} in the ${esc(errandWhere(e))}`);
  const held = walker?.held && `${esc(walker.name)} is held by the Unlit in the dark of the ${esc(errandWhere(walker))}: light the spot or reach them within ${fmt(Math.max(0, s.tuning.sleepHold - (walker.heldFor || 0)))} seconds.`;
  return `${walker ? `<p class="note bad">${held || `${esc(walker.name)} is sleepwalking in the ${esc(errandWhere(walker))}, making for the Deep. Send a shade, or set a candle in their way, before the Unlit find them.`}</p>` : ''}${rest.length ? `<p class="note">Still out in the dark: ${listOf(rest)}.</p>` : ''}`;
}

// Two nights before the new moon, and the night before: wards on the stairs are what hold the Hollow, so the
// essence spent on tonight's tides won't be there for it.
const minsSecs = (x) => {
  const m = Math.floor(x / 60);
  const sec = Math.round(x - m * 60);
  return m ? `${m} min${sec ? ` ${sec} s` : ''}` : `${sec} s`;
};
// A small rate, to two places where one would round it off (0.25, not 0.3).
const rate = (x) => (x < 1 ? x.toFixed(2).replace(/0$/, '') : fmt(x));
function moonNote() {
  const left = s.tuning.seasonDays - s.day;
  if (left < 1 || left > 2) return '';
  const stairs = K().stairs.length;
  const when = left === 1 ? 'Tomorrow night' : 'In two nights';
  // What holding it off until dawn takes: where wards draw on the essence while it batters them, its hours
  // there at tonight's rate; before that, a ward on every stair.
  const need = hollowNeed(s);
  const cap = s.tuning.essenceCap ? ` (the store holds ${s.tuning.essenceCap} at most)` : '';
  const cost = s.tuning.wardDraw
    ? `each draws on the essence while the Hollow batters it, about ${rate(need.rate)} a second now, and it has about ${Math.round(need.secs)} seconds before dawn: holding it off takes about ${Math.round(need.essence)} essence${cap}`
    : `warding all ${stairs} here would take ${fmt(stairs * wardCost(s))} essence`;
  if (s.tuning.year && seasonIndex(s) === 3) return `<p class="note">${when} comes the Long Night, ${longTimes()} as long as a winter night, with the Hollow, a Maw and more of the Unlit${s.tuning.greatTide ? `, and at about ${hhmm(18 + 12 * s.tuning.greatTideAt)} a last great tide` : ''}. Put candles by for it.${stairs ? ` Wards on the stairs hold the Hollow back: ${cost}, and you have ${floor1(s.res.essence)}.` : ''}</p>`;
  if (!stairs) return `<p class="note">${when} comes the new moon, and the Hollow. This keep has no stairs yet, so only shades fighting it can stop it.</p>`;
  const only = s.tuning.hollowWardOnly ? ' (they hold it alone: the tides climb past)' : '';
  const fight = s.tuning.hollowPinned ? ` Or hold it high, at the line, and send fighters: held, it can't feed, and driving it back is worth ${hollowRewardOf(s)} remembrance.` : '';
  return `<p class="note">${when} comes the new moon. Wards on the stairs are what hold the Hollow back${only}: ${cost}, and you have ${floor1(s.res.essence)}. What you spend tonight won't be there then.${fight}</p>`;
}

// What a Maw is after, in words.
export function mawNote(m) {
  const T = s.tuning;
  const tg = m.target;
  if (m.rising > 0) return `A Maw is hauling itself out of the ${m.x < W / 2 ? 'left' : 'right'} rift. In ${Math.ceil(m.rising / TICKS_PER_SEC)} seconds it goes for whatever is worth most for the least fight. It can be cut down while it climbs.`;
  if (!tg) return 'A Maw is prowling. Nothing it can reach is worth its while yet.';
  if (tg.kind === 'candle') {
    return `A Maw is ${m.gnawing ? 'tearing down' : 'making for'} the candle in the ${roomName(roomAt(K(), tg.f, tg.x), true)}. One strong fighter in the light can stop it; a second makes sure. Relight if it falls.`;
  }
  const left = m.gnawing ? ` It breaks in ${fmt(Math.max(0, T.mawBreak - (m.breaking || 0) / TICKS_PER_SEC))} seconds.` : ` It breaks a room it stands in for ${fmt(T.mawBreak)} seconds.`;
  return `A Maw is ${m.gnawing ? 'breaking' : 'making for'} the ${roomName(tg.id, true)}.${left} Send a fighter to meet it there, with a candle, or pay ${T.dreadPerBroken} Dread at dawn.`;
}

// The Hollow tonight, in words: where it is, and (round seven, phase 8) whether a ward has it pinned, when
// fighters sent to it can drive it back for what that's worth.
export function hollowNote(h) {
  const where = esc(roomName(roomAt(K(), h.f, h.x) || 'chapel', true));
  if (pinned(s, h)) return `The Hollow is held at a ward in the ${where}. Held, it eats no light and drains no one: fighters sent to it can drive it back, for ${hollowRewardOf(s)} remembrance.`;
  return `The Hollow is in the ${where}${h.mode === 'batter' ? ', battering a ward' : ''}. It eats light and drains shades near it. Only shades fighting it drive it back${s.tuning.hollowPinned ? ', and a ward holding it keeps it from feeding while they do' : ''}.`;
}
