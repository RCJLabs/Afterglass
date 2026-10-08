// The rosters, the records and the Menu: the Book, the log, the days, Settings, Saves, the Hall of Keepers.

import { BUILD } from '../build.js';
import { epitaph, ordinal, RESTING, LOST } from '../slice/book.js';
import { newDaily, dayKey, dayText } from '../slice/daily.js';
import { DAY_ROOMS, WORK_ROOMS, KINDS, BOND_OTHER, TUTORIAL, PRESETS, CHAPTERS } from '../slice/data.js';
import { lightMap } from '../slice/geo.js';
import { dailyHistory, keepId, slotKeepId, keepLabel, DEEDS } from '../slice/hall.js';
import { howTo } from '../slice/howto.js';
import { SLOTS, summary } from '../slice/saves.js';
import { playerTuning, jobCap, jobCount, capacity, canWork, defense, priests, dayTicks, nightTicks, byId, isTwinnedLiving, isTwinnedShade, SAVE_VERSION, fmt, beds, inGreatGlass, handsAt, whispers, stepsThrough, coaches, stepRoom, atGate, isGuard, musterOf, livingCap } from '../slice/sim.js';
import { SOUNDS } from '../slice/sound.js';
import { newTutorial, isTutorial } from '../slice/tutorial.js';
import { SYS_REDUCED, prefs, savePrefs, CAN_BUZZ, saves, hall, retuned, s, K, ui, devMode, playtesting, setRetuned } from './state.js';
import { esc, plural, upper, traitsOn, livingTraitText, shadeTraitText, hhmm, kindTag, shadeStatus, once, aside } from './hud.js';
import { testCard } from './playtest.js';
import { watchCard } from './watch.js';
import { installHTML, updateHTML } from './screen.js';
import { leaveSlot, heirsNow, playKeep, customPicker, campaignPicker, presetPicker } from './keeps.js';

/* ---------------------------------------------------------------- the rosters */

function livingRows() {
  const opts = (p) =>
    `<option value=""${p.job ? '' : ' selected'}>No job</option>${WORK_ROOMS.filter((id) => jobCap(s, id) > 0 || p.job === id)
      .map((id) => {
        const cap = jobCap(s, id);
        const full = p.job !== id && jobCount(s, id) >= cap;
        return `<option value="${id}"${p.job === id ? ' selected' : ''}${full ? ' disabled' : ''}>${DAY_ROOMS[id].name}${Number.isFinite(cap) ? ` ${jobCount(s, id)}/${cap}` : ''}</option>`;
      })
      .join('')}`;
  return s.living
    .map((p) => {
      const tags = [
        p.sick > 0 ? `<span class="tag sick">Sick, ${fmt(p.sick / dayTicks(s))} days</span>` : '',
        p.grief ? '<span class="tag grief">Grieving</span>' : '',
        p.peace > 0 ? '<span class="tag peace">At peace</span>' : '',
        p.nightmare ? `<span class="tag grief">Nightmare: ×${s.tuning.nightmareMult} today</span>` : '',
        isTwinnedLiving(s, p) ? '<span class="tag twin">Twinned</span>' : '',
        s.phase === 'day' && isGuard(p) && musterOf(s, p) < 1 ? '<span class="tag">Taking the post</span>' : '',
      ].join('');
      const b = p.bond ? byId(s.living, p.bond.with) || byId(s.shades, p.bond.with) : null;
      const bond = b ? `${b.name}'s ${BOND_OTHER[p.bond.rel] || p.bond.rel}${byId(s.shades, b.id) ? ' (a shade)' : ''}` : '';
      return `<div class="prow${ui.person === p.id ? ' is-selected' : ''}" id="prow-${p.id}">
        <div class="pname"><button class="linkish" id="pick-${p.id}" data-act="person" data-id="${p.id}" aria-pressed="${ui.person === p.id}"><b>${esc(p.name)}</b></button><small>${p.age}</small></div>
        <div class="pwork">${p.age === 'child' ? '<small class="muted">Too young to work, until spring</small>' : `<select id="job-${p.id}" data-act="assign" data-id="${p.id}" aria-label="Job for ${esc(p.name)}"${s.phase === 'day' || s.phase === 'dusk' || s.phase === 'dawn' ? '' : ' disabled'}>${opts(p)}</select>`}</div>
        <div class="pstat">${tags}</div>
        ${bond ? `<div class="pbond">${esc(bond)}</div>` : ''}
        ${livingTraitText(p)}
      </div>`;
    })
    .join('');
}

function shadeRows() {
  const L = lightMap(K(), s.tuning, s.night?.candles || []);
  return s.shades
    .map((d) => {
      const pick = canWork(d) && (s.phase === 'dusk' || s.phase === 'night');
      return `<div class="srow${ui.selected === d.id ? ' is-selected' : ''}" id="srow-${d.id}">
        <div class="who">
          <div><b>${esc(d.name)}</b>${kindTag(d.kind)}${d.named ? '<span class="tag peace">Named</span>' : ''}${isTwinnedShade(s, d) ? '<span class="tag twin">Twinned</span>' : ''}${whispers(s, d) ? `<span class="tag twin">Whispers to the ${DAY_ROOMS[coaches(s, d)].name}</span>` : stepsThrough(s, d) ? `<span class="tag twin">Works in the ${DAY_ROOMS[stepRoom(s, d)].name} by day</span>` : atGate(s, d) ? '<span class="tag twin">Stands at the gate today</span>' : ''}</div>
          ${shadeTraitText(d)}
          ${canWork(d) || d.deep ? `<div><span class="memory${d.memory < 40 ? ' low' : ''}" aria-hidden="true"><i data-bar="mem" data-arg="${d.id}"></i></span><small><span data-live="mem" data-arg="${d.id}">${Math.ceil(d.memory)}</span> memory, <span data-live="status" data-arg="${d.id}">${esc(shadeStatus(d, L))}</span></small></div>` : `<small>${esc(shadeStatus(d, L))}</small>`}
        </div>
        <div class="acts">${pick ? `<button class="btn sm" id="sel-${d.id}" data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}">Select</button>` : ''}${byDaySelect(d)}</div>
      </div>`;
    })
    .join('');
}

// What a shade does by day: rest, whisper its old trade, or (from a great glass) work a room in person.
function byDaySelect(d) {
  if (!s.tuning.whispers || !canWork(d) || !(s.phase === 'day' || s.phase === 'dawn')) return '';
  const trade = coaches(s, d);
  const R = DAY_ROOMS[trade];
  const cur = d.byDay ? (d.byDay.how === 'whisper' ? 'whisper' : `step:${stepRoom(s, d)}`) : '';
  const opts = [`<option value=""${cur ? '' : ' selected'}>Rests by day</option>`];
  if (R?.out && jobCap(s, trade) > 0) {
    const taken = s.shades.find((x) => x !== d && whispers(s, x) && coaches(s, x) === trade);
    opts.push(`<option value="whisper"${cur === 'whisper' ? ' selected' : ''}${taken ? ' disabled' : ''}>Whispers to the ${R.name}${taken ? ` (${esc(taken.name)} does)` : ''}</option>`);
  }
  if (inGreatGlass(s, d)) {
    // Since round seven's phase 13 (mirrorRooms) the glass's shades step only into the room it hangs in.
    for (const id of WORK_ROOMS.filter((k) => jobCap(s, k) > 0 && (!s.tuning.mirrorRooms || k === stepRoom(s, d)))) {
      const cap = jobCap(s, id);
      const full = cur !== `step:${id}` && handsAt(s, id) >= cap;
      opts.push(`<option value="step:${id}"${cur === `step:${id}` ? ' selected' : ''}${full ? ' disabled' : ''}>Works in the ${DAY_ROOMS[id].name}${Number.isFinite(cap) ? ` ${handsAt(s, id)}/${cap}` : ''}</option>`);
    }
  }
  if (opts.length === 1) return '';
  return `<select id="byday-${d.id}" data-act="by-day" data-id="${d.id}" aria-label="What ${esc(d.name)} does by day">${opts.join('')}</select>`;
}

export function rosterHTML() {
  const cap = capacity(s);
  const dead = `<div class="roster dead"><div class="roster-head"><h2>The dead</h2><span class="count">${s.shades.length}</span><button class="btn sm" id="people-book" data-act="book">Book of the Dead</button><p>${cap.used} of ${cap.cap} mirror places taken.</p>${once('kinds', `<p class="note">Loyal shades fight hardest; Serene ones work best. Memory weakens both.${traitsOn() ? " Death turns each one's trait over." : ''}</p>`, 'The kinds of the dead', 'dusk')}</div>
    <div class="rows">${shadeRows() || '<p class="empty" style="padding:12px">The glass is empty.</p>'}</div></div>`;
  const living = `<div class="roster"><div class="roster-head"><h2>The living</h2><span class="count">${s.living.length}</span><p>${s.living.length} of the ${livingCap(s)} the keep can shelter${s.tuning.dreamwell ? `, with beds for ${beds(s)}` : ''}. ${priests(s)} ${priests(s) === 1 ? 'priest' : 'priests'}, defense ${fmt(defense(s))}.</p>${aside('bonds', `<p class="note">Bonded pairs split across the Veil work ×${s.tuning.twinMult} when the shade is posted in the twin of the living one's room.</p>`, 'Bonds across the Veil', 'dusk')}</div>
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
      return `<tr><td class="num">${d.season}.${d.day}</td><td class="num">${d.deaths.length}</td><td>${d.raid ? `${d.raid.crusade ? 'crusade ' : ''}${d.raid.held ? 'held' : 'breached'}` : '—'}</td><td>${d.inspection ? d.inspection.verdict : '—'}</td>
        <td class="num">${n.spawned ?? '—'}</td><td class="num">${n.crossed ?? '—'}</td><td class="num">${n.grabbed ?? '—'}</td><td>${n.lost?.length ? esc(n.lost.join(', ')) : '—'}</td><td>${n.hollow || '—'}</td><td class="num">${d.dread ?? '—'}</td></tr>`;
    })
    .join('');
  return `${s.actionsFrom > 1 ? `<p class="hint">A long keep's save keeps its last two years of days: these are from season ${s.actionsFrom}.</p>` : ''}<div class="table-wrap" id="days-wrap"><table class="ledger days"><thead><tr><th>Day</th><th>Deaths</th><th>Raid</th><th>Church</th><th>Creepers</th><th>Through</th><th>Caught</th><th>Lost</th><th>Hollow</th><th>Dread</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bookTab() {
  return bookHTML(s.ledger, traitsOn());
}
// A Book of the Dead: this keep's, or one in the Hall of Keepers.
function bookHTML(book, traits) {
  if (!book.length) return '<p class="hint">No one has died yet. When they do, their story is written here.</p>';
  const still = book.filter((e) => !e.end && e.woke && e.woke !== 'funeral').length;
  const rest = book.filter((e) => RESTING.includes(e.end)).length;
  const lost = book.filter((e) => LOST.includes(e.end)).length;
  const seasons = [...new Set(book.map((e) => e.season))].sort((a, b) => b - a);
  const title = (k) => (k === 0 ? (book.some((e) => e.season === 0 && e.keep) ? 'From the keep before' : 'Before you came') : `The ${ordinal(k)} season`);
  return `<p class="note">${plural(book.length, 'name')}: ${still} still bound, ${rest} at rest, ${lost} lost.</p>
    ${seasons
      .map((k) => `<section class="book"><h3 class="eyebrow">${title(k)}</h3>${book
        .filter((e) => e.season === k)
        .sort((a, b) => a.day - b.day)
        .map((e) => `<article class="bookpage${e.end && e.end !== 'funeral' ? ' is-ended' : ''}${e.from === 'raider' ? ' is-raider' : ''}">
          <header><b>${esc(e.name)}</b>${e.woke && KINDS[e.woke] ? kindTag(e.woke) : ''}${e.named ? '<span class="tag peace">Named</span>' : ''}</header>
          <p>${esc(epitaph(e, { traits }))}</p></article>`)
        .join('')}</section>`)
      .join('')}`;
}
export function exportJSON() {
  return JSON.stringify(
    {
      game: 'afterglass-season',
      save: SAVE_VERSION,
      build: BUILD,
      exported: new Date().toISOString(),
      seed: s.seed,
      daily: s.daily || null,
      now: { season: s.season, day: s.day, phase: s.phase, t: s.t },
      seasons: s.seasons,
      days: s.days,
      ledger: s.ledger,
      tuning0: s.tuning0,
      tuning: s.tuning,
      actions: s.actions,
      actionsFrom: s.actionsFrom || 1,
      test: s.test || null,
      trail: s.trail || [],
    },
    null,
    1,
  );
}
function playtestTab() {
  const answered = s.seasons.filter((e) => e.answer);
  return `${testCard()}<p>The question for weeks 7–10: <b>would you play a second season?</b> It's asked when a season ends or the keep falls. ${answered.length ? `Answers so far: ${answered.map((e) => `season ${e.season}, ${e.answer === 'again' ? 'yes' : 'no'}`).join('; ')}.` : 'No answer yet.'}</p>
    <div class="row"><button class="btn" id="btn-copy" data-act="copy">Copy playtest export</button><button class="btn" id="btn-show-export" data-act="show-export" aria-expanded="${ui.showExport}">${ui.showExport ? 'Hide export' : 'Show export'}</button><span class="hint">${esc(ui.copied)}</span></div>
    ${ui.showExport ? `<label for="export">Export (JSON)</label><textarea id="export" rows="8" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">The export holds your answers and notes, every day's numbers, the ledger of the dead, the seed and every action, so a session replays exactly, and the trail: when you paused, opened a panel or sat idle. Menu, Saves, Watch a playtest plays one back.${s.actionsFrom > 1 ? ` This keep has run so long that its save keeps only the last two years (from season ${s.actionsFrom}) of days and actions, so its export no longer plays back.` : ''}</p>`;
}
const TUNE = [
  ['daySecs', 'Day length, seconds at 1×'],
  ['nightSecs', 'Night length, seconds at 1×'],
  ['creepersBase', 'Creepers on night 0'],
  ['creepersPerNight', 'Creepers added per night'],
  ['mawFrom', 'First night with a Maw'],
  ['mawsPerNight', 'Maws a night (none on the new moon)'],
  ['mawHp', 'A Maw’s strength'],
  ['mawSmash', 'Wax a second a Maw tears from a candle'],
  ['mawBreak', 'Seconds a Maw needs in a room to break it'],
  ['mawLine', 'What the candle barring the way up is worth to a Maw, in workers'],
  ['dreadPerBroken', 'Dread at dawn for each room a Maw broke'],
  ['hauntWork', 'Share of the work done the next day in a room a Maw broke'],
  ['mawRuin', 'Seconds a Maw left unmet in a room it broke takes to ruin it (0: it moves on at once)'],
  ['ruinLight', 'A candle in the room holds a Maw’s ruin while the Maw tears it down (1 on, 0 off)'],
  ['hollowHp', 'The Hollow’s strength'],
  ['hollowAt', 'When the Hollow rises, as a share of the night'],
  ['hollowReach', 'How far the Hollow eats light, pixels'],
  ['hollowEat', 'Wax the Hollow eats per second'],
  ['wardHold', 'Seconds a ward holds the Hollow with no essence to draw on'],
  ['wardDraw', 'Essence a second a ward draws to hold the Hollow, at first (0: none)'],
  ['essenceCap', 'Most essence the store holds (0: no limit)'],
  ['newMoonCreepers', 'Creepers on the new moon, as a share of the night before'],
  ['dreadLivingPer', 'Living per point of Dread borne'],
  ['traits', 'Traits: everyone has one, and death turns it over (1 on, 0 off)'],
  ['fadePerNight', 'Memory every shade loses per night'],
  ['cracksMax', 'Veil cracks that lose the keep'],
  ['crackPerTide', 'A mirror cracks once a tide, the rest of it giving nightmares (1), or every Creeper through is a crack (0)'],
  ['crackHeal', 'Cracks the Veil mends each dawn'],
  ['wisp', 'Wisps: essence burned as light where a candle would go, once the store is out (1 on, 0 off)'],
  ['wispCost', 'Essence a wisp takes'],
  ['wispSecs', 'Seconds a wisp burns'],
  ['hardness', 'How much harder each season is (raids, Creepers, the Hollow)'],
  ['yearHardness', 'With the year on, how much harder each year starts than the last (0: each season harder, straight on)'],
  ['mawHardness', 'How much stronger a Maw is each season'],
  ['roomStone', 'Stone a room costs'],
  ['roomCap', 'Workers a room holds'],
  ['startStone', 'Stone a new keep starts with'],
  ['startFloors', 'Floors a new keep starts with, from the ground (1 to 4)'],
  ['steelFight', 'How much harder shades fight with grave-steel'],
  ['lineGuard', 'Shades in the light at the stairs up to the Veil only guard and keep the Watch (1 on, 0 off)'],
  ['goAround', 'The Unlit take any dark way up and gnaw only a light that bars every way (1 on, 0 off)'],
  ['thinStair', 'A tide rises on the side whose stair to the Veil has less fight at its foot (1 on, 0 off)'],
  ['autoRelight', 'A candle that burns down at the line or a post is lit again from the store (1 on, 0 off)'],
  ['fire', 'Fire by day in Hearths and Forges (1 on, 0 off)'],
  ['dreamwell', 'Beds and crowding, the Dreamwell and the Weepers (1 on, 0 off)'],
  ['weepersMax', "The night after a death, a Weeper for each of the day's dead, up to this many (0: none)"],
  ['dreamRest', 'The Dreamwell is a place to rest, as the Cold Hearth is (1), or to dream in (0)'],
  ['whispers', 'Whispers and the great glass: the dead help by day (1 on, 0 off)'],
  ['raidFight', 'Raids fought at the gate, with pitch, stone and the bell (1 on, 0 off: decided at a throw)'],
  ['raidFightStrength', 'A Host you can fight back comes this many times stronger'],
  ['granaryGuards', 'A Granary halves the food raiders carry off (1 on; 0: every keep\'s food halved, as before)'],
  ['emboldenCarries', 'Paying off the season\'s last raid makes the next season\'s raids harder (1 on, 0 off)'],
  ['muster', 'Guards muster: a guard counts in full only after time at the post (1 on, 0 off)'],
  ['musterHours', 'Hours of the day at the post before a guard counts in full'],
  ['guardsGoOut', 'A sally or a pursuit counts only the guards who go out (1 on, 0: the whole keep\'s defense, and half the loot back)'],
  ['forgeArms', 'The Forge makes arms by day, one for each guard\'s post (1 on, 0: a smith is 1 defense at the gate)'],
  ['armDefense', 'Defense an arm adds to a guard at the gate'],
  ['armsBreak', 'Share of the arms in use a raid at the gate breaks'],
  ['coldForge', 'A Forge nobody works can\'t catch fire (1 on, 0 off)'],
  ['year', 'A year of four seasons, days and nights shifting, ending with the Long Night (1 on, 0 off)'],
  ['longNight', 'The Long Night lasts this many winter nights'],
  ['longNightCreepers', 'The Long Night brings this many times a night\'s Creepers'],
  ['requests', 'The dead ask for things at the rite (1 on, 0 off)'],
  ['refusals', 'Refused this many times, a shade turns Restless'],
  ['plague', "Summer's plague: sickness in a crowded keep takes one more for every few beyond the beds (1 on, 0 off)"],
  ['plagueCrowd', 'The plague takes one more for every this many living beyond the beds'],
  ['siege', "Autumn's siege: the Host camps outside after its day-2 raid (1 on, 0 off)"],
  ['siegeDays', 'Days the siege lasts'],
  ['weather', 'Weather: rain slows the Yard and damps fire, and brings the Drowned; fog clouds the black mirror (1 on, 0 off)'],
  ['rainYard', 'Share of the Yard’s stone quarried in the rain'],
  ['drownedBase', 'The Drowned on a rainy night, before one more every few nights'],
  ['deep', 'Down into the Deep: shades sent down at dusk bring back quicksilver to upgrade mirrors (1 on, 0 off)'],
  ['deepDrain', 'Memory a shade caught in the Deep loses'],
  ['generations', 'Generations: from the second year the living age each spring, pair off and have children (1 on, 0 off)'],
  ['oldChance', 'Chance each spring that an adult grows old'],
  ['birthChance', 'Chance each season that a couple has a child'],
  ['church', "The Lantern Church's escalation: an embargo after a censure, the Inquisition after a second (1 on, 0 off)"],
  ['churchLedger', 'The Church judges the Dread of every day since it last looked, averaged (1 on, 0: the Dread at noon)'],
  ['embargoDays', "Days the Church's silver embargo lasts"],
  ['inquisitionDays', 'Days the Inquisition inspects the keep every noon, unless a blessing sends it away sooner'],
  ['donation', 'Remembrance a donation to lift the embargo takes'],
  ['crusade', 'The crusade: censured under the Inquisition, the keep faces a crusade at the gate (1 on, 0 off)'],
  ['crusadeDays', 'Days from the crusade being proclaimed to its coming'],
  ['crusadeBase', "The crusade's strength, as a raid's base (harder each season)"],
  ['acts', "Shade acts: each shade's one act a night, paid in its memory (1 on, 0 off)"],
  ['standFight', 'How much harder a Loyal shade strikes while it Stands'],
  ['lureReach', "How far a Stranger's Lure reaches, in pixels"],
  ['lanterns', 'Lanterns: a shade carries a light of its own (1 on, 0 off)'],
  ['lanternCost', 'Candles a lantern takes'],
  ['lanternWax', 'Seconds a lantern burns'],
  ['hollowLure', 'The Hollow hunts a carried lantern before the mirrors (1 on, 0 off)'],
  ['errands', 'Errands: echoes, relics and sleepwalkers in the dark below the line (1 on, 0 off)'],
  ['echoMemory', 'Memory an echo gives the shade that finds it'],
  ['relicGlass', 'Glass a relic brings'],
  ['sleepChance', 'Chance a night brings a sleepwalker, from night 3 (not the new moon)'],
  ['sleepHold', 'Seconds the Unlit hold a sleepwalker before they die'],
  ['omens', 'Omens: a night of a different shape, shown at dusk (1 on, 0 off)'],
  ['omenChance', 'Chance a night has one of the six omens, from night 2 (not the new moon)'],
  ['omenChoice', 'Chance a night with one of the six offers two to choose between'],
  ['huntEssence', 'Essence for each Maw cut down under the Hunt'],
  ['bloodEssence', 'Essence for each Creeper cut down under a blood moon'],
  ['visitors', 'Visitors at the gate, each with answers to choose between (1 on, 0 off)'],
  ['cruelty', 'Cruelty: four happenings in the keep, each with an answer that kills one of your own, who wakes a Wraith (1 on, 0 off)'],
  ['moreOmens', 'Four more omens: a falling star, grave-cold, a lull in the Deep and the dead remembering (1 on, 0 off)'],
  ['moreOmenChance', 'Chance a night without one of the six has one of the four more'],
  ['yearVisitors', "The years' visitors: from the third year to the tenth, one a year who has never come (1 on, 0 off)"],
  ['payInKind', 'Visitors who want food for wares also take glass or remembrance (1 on, 0 off)'],
  ['visitorChance', 'Chance a visitor comes on a day'],
  ['visitorSecond', 'Chance, on a day one comes, that a second does too'],
  ['visitorWait', 'Share of the day a visitor waits for an answer'],
  ['charmBurn', "How fast candles burn the night of the hedge-witch's charm"],
  ['curseBurn', "How fast candles burn the night of the hedge-witch's curse, where there are no Weepers"],
  ['library', 'The Library, its studies and the Archive of the Dead (1 on, 0 off)'],
  ['lorePerSec', "Lore a shade reading in the Archive adds each second"],
  ['hall', "The Hall's decrees and the Court of Shades (1 on, 0 off)"],
  ['curfew', 'The Hall can proclaim a curfew (1 on, 0 off)'],
  ['gatehouse', 'The Gatehouse, the Host’s ladders and the Undergate (1 on, 0 off)'],
  ['laddersFrom', 'The season (of the keep) from which the Host brings ladders'],
  ['ladderEvery', 'Seconds between ladders at the gate'],
  ['ladderHost', 'What each ladder left standing adds to the Host'],
  ['undergateFrom', 'The season (of the keep) from which the Undergate opens'],
  ['undergateChance', 'Chance the Undergate stirs on a night, from the season it opens'],
  ['undergatePerTide', 'Creepers of each tide that come up the Undergate when it stirs'],
  ['eclipse', "Midsummer's eclipse, with the year on (1 on, 0 off)"],
  ['eclipseDay', 'The day of summer the eclipse comes'],
  ['eclipseAt', 'When the sun goes dark, as a share of the day'],
  ['eclipseSecs', 'Seconds the sun stays dark'],
  ['eclipseCreepers', "The eclipse's Creepers, as a share of that night's"],
  ['eclipseTide', 'When its tide comes, as a share of the eclipse'],
  ['eclipseTwin', 'How much harder a living person and their dead work and fight side by side in it'],
  ['repairs', 'Repairs: what a Maw broke, a fire burned or a breach left of the gate lasts a while unless masons mend it (1 on, 0 off)'],
  ['repairsFrom', 'The keep\'s year repairs begin in'],
  ['mendStone', 'Stone to mend a haunted or burned-out room'],
  ['hauntDays', 'Dawns a room a Maw broke stays haunted, a Dread at each, unless mended'],
  ['burnDays', 'Days a room a fire burned out stays dead, unless mended'],
  ['gateBreached', 'Share of the gate a breach leaves'],
  ['gateMend', 'Share of the gate that mends itself each dawn'],
  ['bedsHold', 'The keep holds as many living as it has beds, at least the most above (1 on, 0: the most above, whatever the beds)'],
  ['standingWard', "A standing ward for the season, set by day, costs this share of a night's ward for each night left (0: none)"],
  ['studyTiers', 'Ranks of each study: 2 gives each a second (1 or 2)'],
  ['studyTwoCost', "A study's second rank costs this many times its first"],
  ['glassHalls', 'The great-glass hall: a mirror for eight whose dead fade slower (1 on, 0 off)'],
  ['hallFade', 'How fast the dead fade in a great-glass hall, as a share'],
  ['lampworks', 'The Lampworks, from the eighth floor up: glass into candles, and its twin lit without one (1 on, 0 off)'],
  ['lampGlass', 'Glass a lampwright works into candles a day'],
  ['highFrom', 'The floor from which the Lampworks can be raised, and rooms cost more stone for each floor above the one below it'],
  ['highStone', 'Stone more a room costs for each floor it stands above'],
  ['mirrorRooms', 'Mirrors hang in rooms: whispers and the great glass work that room, and a mirror with a shade in it is a door a Maw can come through (1 on, 0 off)'],
  ['mawDoor', 'What a door is worth to a Maw choosing a room, against its workers (0: nothing)'],
  ['doorCracks', 'Cracks in the Veil when a Maw comes through a door'],
  ['doorsFrom', 'The season of the keep from which a Maw comes through a door (1: from its first)'],
  ['troubles', 'Each year of the open year brings a trouble (1 on, 0 off)'],
  ['troublesFrom', 'The year troubles begin in'],
  ['troubleRite', "Remembrance a rite against the year's trouble takes: half as hard until the season ends (0: none)"],
  ['veilWard', 'Essence a ward on the Veil takes: one crack more until the season ends, each more as much again (0: none)'],
];
const KEYS = [
  ['Space', 'play or pause'], ['1, 2, 4', 'speed'], ['C, M, W, H', 'candle, move, ward, hush (at night)'], ['V', 'turn the Tain upright'],
  ['+ and −, 0', 'zoom, and fit the castle again'], ['Arrows', 'pan by day; from dusk, move the cursor on the Tain (Shift and the arrows pan)'],
  ['Enter', 'at the cursor: set a candle, pick or send a shade, or ward, by the tool'], ['[ and ]', 'pick the previous or next shade'],
  ['A', "the picked shade's act, at night or in the eclipse"], ['T', "the picked shade's lantern: light it, or set it down"], ['N', 'at night, skip to the next mark on the tide clock'],
  ['K, P, R, B', 'this phase, People, Records, Build'], ['L', 'room names'],
  ['S', 'sound on or off'], ['Esc', 'the Menu, or close a panel'],
];
function settingsTab() {
  const radio = (name, v, label, cur) => `<label class="row" for="${name}-${v}"><input type="radio" name="${name}" id="${name}-${v}" data-act="${name}" value="${v}"${cur === v ? ' checked' : ''}>${label}</label>`;
  const motion = prefs.motion || 'system';
  return `<section class="settings">
    <h3>Play</h3>
    <p class="note">This keep is ${PRESETS[s.preset]?.name.toLowerCase() || 'standard'}${s.custom ? ', with custom rules' : ''}${s.daily ? ", as today's keep is for everyone" : ''}. A new keep's difficulty and rules are chosen under New game on the main screen, or in Saves.</p>
    <label class="row" for="autopause"><input type="checkbox" id="autopause" data-act="autopause"${prefs.autoPause ? ' checked' : ''}>Pause for raids, fires, catches, the Hollow and the eclipse</label>
    <label class="row" for="guide-on"><input type="checkbox" id="guide-on" data-act="guide-toggle"${prefs.guide ? ' checked' : ''}>Guide me through the first season (turning it on starts it over)</label>
    <h3>The castle</h3>
    <fieldset><legend>The Tain at night</legend>${radio('camera', 'reflection', 'Reflected, upside down, as the lake shows it', prefs.mode)}${radio('camera', 'flipped', 'Turned upright', prefs.mode)}</fieldset>
    <label class="row" for="labels-on"><input type="checkbox" id="labels-on" data-act="labels"${prefs.labels ? ' checked' : ''}>Show room names on the castle</label>
    <label class="row" for="ways-set"><input type="checkbox" id="ways-set" data-act="ways"${prefs.ways !== false ? ' checked' : ''}>At dusk, show on the Tain where the Unlit will go</label>
    <fieldset><legend>Motion</legend>${radio('motion', 'system', `As this device is set (now: ${SYS_REDUCED ? 'less motion' : 'full motion'})`, motion)}${radio('motion', 'reduce', 'Less motion: the camera cuts, nothing flickers or sways, the crossing is skipped', motion)}${radio('motion', 'full', 'Full motion', motion)}</fieldset>
    <h3>Sound</h3>
    <label class="row" for="sound-on"><input type="checkbox" id="sound-on" data-act="sound"${prefs.sound ? ' checked' : ''}>Sound</label>
    <label class="slider" for="vol-sfx"><span>Effects</span><input type="range" id="vol-sfx" data-act="volume" data-key="sfx" min="0" max="100" step="5" value="${Math.round(prefs.sfx * 100)}"${prefs.sound ? '' : ' disabled'}></label>
    <label class="slider" for="vol-amb"><span>Ambience: wind by day, the drone of the Tain at night</span><input type="range" id="vol-amb" data-act="volume" data-key="amb" min="0" max="100" step="5" value="${Math.round(prefs.amb * 100)}"${prefs.sound ? '' : ' disabled'}></label>
    ${CAN_BUZZ ? `<label class="row" for="haptics-on"><input type="checkbox" id="haptics-on" data-act="haptics"${prefs.haptics ? ' checked' : ''}>Vibrate: a tick for each candle, more for raids, deaths, cracks in the Veil and the Hollow (Android phones)</label>` : '<p class="hint">This browser can\'t vibrate. iPhones and iPads don\'t allow it for web pages.</p>'}
    <details class="hear" id="hear" data-keep="hear"${ui.open.hear ? ' open' : ''}><summary>What each sound means</summary>
      ${prefs.sound ? '' : '<p class="hint">Sound is off.</p>'}
      <div class="hear-list">${Object.entries(SOUNDS).map(([k, S]) => `<button class="btn sm" id="hear-${k}" data-act="hear" data-cue="${k}"${prefs.sound ? '' : ' disabled'}>${esc(S.label)}</button>`).join('')}</div>
    </details>
    <h3 class="keys-h">Keys</h3>
    <dl class="keys">${KEYS.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${installHTML('settings')}
    ${devMode() ? `<details class="advanced" id="advanced" data-keep="advanced"${ui.open.advanced ? ' open' : ''}><summary>Advanced: the playtest numbers</summary>
      <div class="fields">${TUNE.map(([k, label]) => `<label for="tune-${k}">${esc(label)}<input type="number" id="tune-${k}" data-act="tune" data-key="${k}" value="${esc(String(s.tuning[k]))}" min="0" step="any"${s.daily ? ' disabled' : ''}></label>`).join('')}</div>
      ${s.daily ? `<p class="note">This is the keep of ${esc(dayText(s.daily))}, the same for everyone, so its numbers are locked.</p>` : ''}
      <p class="hint">These are this keep's numbers. Changes apply from the next tick or the next dusk, and are recorded, so exports still replay. A new keep keeps only the ones you set. Seed ${s.seed}.</p>
    </details>` : ''}
    <p class="hint build">Build ${esc(BUILD)}${s.build && s.build !== BUILD ? `; this keep was last saved by ${esc(s.build)}` : ''}.</p>
  </section>`;
}
// The keeps in their slots: the one being played, and the rest.
const agoText = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
// A keep in a line, from its save's summary: what kind it is, and where it stands.
export const keepLine = (m) => `${m.daily ? `The keep of ${dayText(m.daily)}. ` : m.tutorial ? 'The tutorial keep. ' : m.preset && PRESETS[m.preset] ? `${PRESETS[m.preset].name}. ` : ''}${m.custom ? 'Custom rules. ' : ''}${m.chapter ? `Campaign, ${CHAPTERS[m.chapter].name}. ` : ''}Season ${m.season}, ${whereText(m)}`;
function whereText(m) {
  if (m.lost) return `fallen on day ${m.day}`;
  if (m.sealed) return 'the Veil is sealed';
  if (m.opened) return 'the Veil is open';
  if (m.phase === 'end') return 'the season is over';
  if (m.phase === 'night') return `night ${m.day}`;
  if (m.phase === 'dusk') return `dusk, day ${m.day}`;
  if (m.phase === 'dawn') return m.day === 0 ? 'the first dawn' : `dawn after night ${m.day}`;
  return `day ${m.day}`;
}
// Today's keep: continue it where a slot holds it, else start it in an empty slot, else offer to put it in
// place of the keep being played.
export const SLOT_NUMS = () => Array.from({ length: SLOTS }, (_, i) => i + 1);
export const dailyHeld = () => SLOT_NUMS().find((n) => (n === saves.current ? s.daily : saves.slots[n]?.daily) === dayKey()) || null;
export const tutorialHeld = () =>
  SLOT_NUMS().find((n) => (n === saves.current ? isTutorial(s) && s.season === 1 && !s.tut?.over : saves.slots[n]?.tutorial && saves.slots[n].season === 1 && !saves.slots[n].tutorialOver)) || null;
function dailyHTML() {
  const key = dayKey();
  const nums = SLOT_NUMS();
  const holds = dailyHeld();
  const empty = nums.find((n) => n !== saves.current && !saves.slots[n]);
  let acts;
  if (holds === saves.current) acts = "<p class=\"hint\">It's the keep you're playing.</p>";
  else if (holds) acts = `<div class="row"><button class="btn sm primary" id="daily-go" data-act="slot-play" data-n="${holds}">Continue it, in keep ${holds}</button></div>`;
  else if (ui.confirmSlot?.kind === 'daily') {
    acts = `<p class="note bad">Put today's keep in keep ${saves.current}, in place of the one you're playing? That one goes into the Hall of Keepers, and can't be played on unless you exported it.</p><div class="row"><button class="btn sm primary" id="daily-yes" data-act="slot-yes" data-n="${saves.current}">Play today's keep</button><button class="btn sm" id="daily-no" data-act="slot-no">Cancel</button></div>`;
  } else if (empty) acts = `<div class="row"><button class="btn sm primary" id="daily-go" data-act="daily" data-n="${empty}">Play it, in keep ${empty}</button></div>`;
  else acts = `<div class="row"><button class="btn sm" id="daily-go" data-act="daily-ask">Play it in keep ${saves.current}</button></div>`;
  // Today's keep with a history (round seven, phase 16): the days played before, newest first.
  const past = dailyHistory(hall).filter((d) => d.key !== key);
  const days = past.length
    ? `<div class="daily-past" id="daily-past"><p class="hint">You've played it on ${past.length === 1 ? 'one other day' : `${past.length} other days`}:</p><ul>${past.slice(0, 5).map((d) => `<li>${esc(d.date)}: ${d.fell ? `fell in ${esc(d.fell.toLowerCase())}` : `held ${d.seasons === 1 ? 'a season' : `${d.seasons} seasons`}`}, ${d.deaths} ${d.deaths === 1 ? 'death' : 'deaths'}</li>`).join('')}</ul></div>`
    : '';
  return `<div class="card daily"><h3>Today's keep: ${esc(dayText(key))}</h3>
    <p class="note">Everyone who plays on this date, wherever they are, gets this same keep, on the rules as they ship: your own numbers from Settings are set aside, and can't be changed in it. Its recap card names the day, so you can compare how it went, and sets it against the last day you played. A new one comes at your midnight.</p>${days}${acts}</div>`;
}
// The tutorial keep: continue it where a slot holds one still in its first season, else start it in an empty
// slot, else offer to put it in place of the keep being played.
function tutorialHTML() {
  const nums = SLOT_NUMS();
  const holds = tutorialHeld();
  const empty = nums.find((n) => n !== saves.current && !saves.slots[n]);
  let acts;
  if (holds === saves.current) acts = "<p class=\"hint\">It's the keep you're playing.</p>";
  else if (holds) acts = `<div class="row"><button class="btn sm primary" id="tutorial-go" data-act="slot-play" data-n="${holds}">Continue it, in keep ${holds}</button></div>`;
  else if (ui.confirmSlot?.kind === 'tutorial') {
    acts = `<p class="note bad">Put the tutorial in keep ${saves.current}, in place of the one you're playing? That one goes into the Hall of Keepers, and can't be played on unless you exported it.</p><div class="row"><button class="btn sm primary" id="tutorial-yes" data-act="slot-yes" data-n="${saves.current}">Play the tutorial</button><button class="btn sm" id="tutorial-no" data-act="slot-no">Cancel</button></div>`;
  } else if (empty) acts = `<div class="row"><button class="btn sm primary" id="tutorial-go" data-act="tutorial" data-n="${empty}">Play it, in keep ${empty}</button></div>`;
  else acts = `<div class="row"><button class="btn sm" id="tutorial-go" data-act="tutorial-ask">Play it in keep ${saves.current}</button></div>`;
  return `<div class="card daily"><h3>The tutorial</h3>
    <p class="note">A keep whose first three days are set out to teach, one thing at a time: jobs and building, the dead and the night, a raid and a fire, the rite, mirrors and the Church. The Veil can't break before night ${TUTORIAL.safeUntil}, and from day ${TUTORIAL.safeUntil} it's an ordinary season.</p>${acts}</div>`;
}
export function startTutorial(n) {
  leaveSlot(n);
  setRetuned(0);
  prefs.guide = true;
  savePrefs();
  return playKeep(n, newTutorial(playerTuning(s)), `The tutorial, in keep ${n}.`);
}
// How to play: the tutorial, and every lesson as a short manual, in this keep's numbers.
function howtoTab() {
  return `<section class="howto">${ui.watch ? '' : tutorialHTML()}${howTo(s.tuning)
    .map((sec) => `<div class="card" id="howto-${sec.id}"><h3>${esc(sec.title)}</h3>${sec.items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`)
    .join('')}</section>`;
}
export function startDaily(n) {
  leaveSlot(n);
  setRetuned(0);
  const key = dayKey();
  return playKeep(n, newDaily(key), `Today's keep, ${dayText(key)}, in keep ${n}.`);
}
function savesTab() {
  if (ui.watch) {
    return `<section class="saves"><div class="card"><p><b>You're watching a session.</b> Your keeps are here again when you stop.</p><div class="row"><button class="btn sm primary" id="w-exit-saves" data-act="w-exit">Stop watching</button></div></div>${watchCard()}</section>`;
  }
  const slots = Array.from({ length: SLOTS }, (_, i) => i + 1).map((n) => {
    const here = n === saves.current;
    const m = here ? summary(s, Date.now()) : saves.slots[n];
    const ask = ui.confirmSlot?.n === n && ui.confirmSlot.kind !== 'daily' && ui.confirmSlot.kind !== 'tutorial' ? ui.confirmSlot : null;
    const file = `<input type="file" id="import-${n}" class="visually-hidden" data-act="import" data-n="${n}" accept=".json,application/json"><label class="btn sm" for="import-${n}">Load a file</label>`;
    let acts;
    if (ask) {
      const q = ask.kind === 'delete' ? `Delete keep ${n}? Its Book and its card stay in the Hall of Keepers, but it can't be played on unless you exported it.` : ask.kind === 'import' ? `Replace keep ${n} with the one in the file?` : `Start keep ${n} over from season 1, day 1? This keep goes into the Hall of Keepers, and can't be played on unless you exported it.`;
      acts = `<p class="note bad">${esc(q)}</p><div class="row"><button class="btn sm primary" id="slot-yes-${n}" data-act="slot-yes" data-n="${n}">${ask.kind === 'delete' ? 'Delete' : ask.kind === 'import' ? 'Replace' : 'Start over'}</button><button class="btn sm" id="slot-no-${n}" data-act="slot-no">Cancel</button></div>`;
    } else if (here) acts = `<div class="row"><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-over-${n}" data-act="slot-over" data-n="${n}">Start over</button></div>`;
    else if (m) acts = `<div class="row"><button class="btn sm primary" id="slot-play-${n}" data-act="slot-play" data-n="${n}">Continue</button><button class="btn sm" id="slot-export-${n}" data-act="slot-export" data-n="${n}">Export</button>${file}<button class="btn sm" id="slot-delete-${n}" data-act="slot-delete" data-n="${n}">Delete</button></div>`;
    else acts = `<div class="row"><button class="btn sm primary" id="slot-new-${n}" data-act="slot-new" data-n="${n}">New keep</button>${file}</div>`;
    const what = m
      ? `<p><b>${esc(keepLine(m))}</b></p><p class="hint">${plural(m.rooms, 'room')} · ${m.living} living · ${plural(m.shades, 'shade')}${here ? '' : ` · played ${esc(agoText(m.saved))}`}</p>`
      : '<p class="hint">Empty.</p>';
    return `<div class="kslot${here ? ' is-here' : ''}" id="slot-${n}"><div class="kslot-head"><span class="eyebrow">Keep ${n}</span>${here ? '<span class="tag">Playing</span>' : ''}</div>${what}${acts}</div>`;
  }).join('');
  return `<section class="saves">
    ${dailyHTML()}
    ${tutorialHTML()}
    <p class="note">Each keep saves itself as you play. Export writes a keep to a file you can keep or send; Load a file takes that file back${devMode() ? ", or a tester's playtest export, which is replayed into the keep it came from" : ''}.</p>
    ${presetPicker('saves')}
    ${campaignPicker('saves')}
    ${customPicker('saves')}
    <div class="kslots">${slots}</div>
    ${ui.slotMsg ? `<p class="note bad" role="alert">${esc(ui.slotMsg)}</p>` : ''}
    ${devMode() ? watchCard() : ''}
  </section>`;
}
// The Hall of Keepers (round seven, phase 16): the deeds, then every keep played, newest first, each opening on its
// card and its Book of the Dead.
const HALL_STATUS = { fell: 'Fell', sealed: 'Sealed', opened: 'Opened', left: 'Left standing' };
function hallStatus(k) {
  const n = SLOT_NUMS().find((i) => (i === saves.current ? keepId(s) : slotKeepId(saves.slots[i])) === k.id);
  if (n && k.status === 'kept') return `In keep ${n}, at ${k.where}`;
  return `${HALL_STATUS[k.status] || 'Left standing'} in ${k.where}`;
}
function hallCardHTML(k) {
  const c = k.card;
  if (!c) return '<p class="hint">No season of it ended, so it has no card.</p>';
  if (c.img) return `<img class="recap hall-img" src="${c.img}" alt="${esc(`The recap card for ${c.title}: ${c.head}. ${c.sub} ${c.stats.map(([l, v]) => `${l}: ${v}`).join('; ')}.`)}" width="360" height="450">`;
  return `<div class="hall-words"><p><b>${esc(c.title)}: ${esc(c.head)}.</b> ${esc(c.sub)}</p><p class="hint">${c.stats.map(([l, v]) => `${esc(l)}: ${esc(v)}`).join(' · ')}</p>${c.remembered?.length ? `<p class="hint">Remembered: ${c.remembered.map((m) => `${esc(m.name)}, ${esc(m.line)}`).join('; ')}.</p>` : ''}</div>`;
}
function hallTab() {
  const next = heirsNow(saves.current);
  const keeps = [...hall.keeps].sort((a, b) => b.first - a.first);
  const done = DEEDS.filter((D) => hall.deeds[D.id]).length;
  const deeds = `<div class="card"><h3>Deeds</h3><p class="hint">${done} of ${DEEDS.length} done, across all your keeps.</p><ul class="deeds">${DEEDS.map((D) => {
    const d = hall.deeds[D.id];
    return `<li class="${d ? 'is-done' : ''}"><b>${esc(D.name)}</b> <span class="hint">${esc(D.text)}${d ? ` Done in ${esc(d.label)}, ${esc(new Date(d.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }))}.` : ''}</span></li>`;
  }).join('')}</ul></div>`;
  const rows = keeps.map((k) => {
    const open = ui.hallOpen === k.id;
    const dead = (k.book || []).filter((e) => e.from !== 'before').length;
    const what = [k.daily ? "Today's keep" : k.tutorial ? 'The tutorial' : k.campaign ? 'A campaign' : 'The open year', k.preset && PRESETS[k.preset] ? PRESETS[k.preset].name : '', `${(k.seasons || []).length} ${(k.seasons || []).length === 1 ? 'season' : 'seasons'}`, `${dead} dead`].filter(Boolean).join(' · ');
    const heirs = k.heirs?.length ? `<p class="hint">Began with ${esc(k.heirs.join(' and '))} in its glass, from the keep before.</p>` : '';
    return `<article class="hall-keep${open ? ' is-open' : ''}" id="hall-${esc(k.id.replace(/[^a-z0-9]/gi, '-'))}">
      <header><b>${esc(upper(keepLabel(k)))}</b><span class="tag${k.status === 'fell' ? ' bad' : ''}">${esc(hallStatus(k))}</span></header>
      <p class="hint">${esc(what)}</p>${heirs}
      <div class="row"><button class="btn sm" data-act="hall-open" data-id="${esc(k.id)}" aria-expanded="${open}">${open ? 'Close' : 'Its card and its Book'}</button></div>
      ${open ? `${hallCardHTML(k)}<div class="hall-book">${bookHTML(k.book || [], !!k.traits)}</div>` : ''}
    </article>`;
  }).join('');
  return `<section class="hall">
    <div class="card"><h3>The Hall of Keepers</h3><p class="note">Every keep you play is written here: how it ended, its last card and its Book of the Dead, kept when its slot goes to another keep.</p>
      <p class="hint">${next.length ? `A new keep begins with ${esc(next.map((x) => x.name).join(' and '))}, of ${esc(next[0].keep)}, in its glass.` : 'A new keep begins with the last keeper\'s dead, Garrick and Hesper: when a keep of yours ends or is left with its dead still in the glass, its two best remembered go on into the next.'}</p></div>
    ${deeds}
    ${rows || '<p class="hint">No keep yet: the first is written in when its first season ends, or when someone in it dies and its slot goes to another.</p>'}
  </section>`;
}
const MENU_TABS = [['settings', 'Settings'], ['saves', 'Saves'], ['hall', 'Hall of Keepers'], ['howto', 'How to play']];
export function menuHTML() {
  const tab = MENU_TABS.some(([k]) => k === ui.menuTab) ? ui.menuTab : 'settings';
  const body = { settings: settingsTab, saves: savesTab, hall: hallTab, howto: howtoTab }[tab]();
  const back = ui.watch || ui.title ? '' : '<div class="row"><button class="btn" id="btn-title" data-act="title-open">Main menu</button><span class="hint">Continue, a new keep, the tutorial, today\'s keep.</span></div>';
  return `${testCard()}${updateHTML()}${back}<div class="tabs" role="tablist" aria-label="Menu">${MENU_TABS.map(([k, l]) => `<button class="tab" role="tab" id="menu-tab-${k}" data-act="menu-tab" data-tab="${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" aria-controls="menupanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="menupanel" aria-labelledby="menu-tab-${tab}">${body}</div>`;
}
const ALL_TABS = [['book', 'Book of the Dead'], ['log', 'Log'], ['days', 'Days'], ['playtest', 'Playtest']];
const TABS_NOW = () => ALL_TABS.filter(([k]) => k !== 'playtest' || playtesting());
export function recordsHTML() {
  const TABS = TABS_NOW();
  const tab = TABS.some(([k]) => k === prefs.tab) ? prefs.tab : 'log';
  const body = { book: bookTab, log: logTab, days: daysTab, playtest: playtestTab }[tab]();
  return `<div class="tabs" role="tablist" aria-label="Records">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-act="tab" data-tab="${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" aria-controls="tabpanel">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}
