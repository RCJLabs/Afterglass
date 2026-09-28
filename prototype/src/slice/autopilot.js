// A scripted player for the season slice, for soak tests and balance runs. It plays through act() only,
// so everything it does is replayable. Plans differ in how they treat the dead:
//   keeper   keeps every shade it can, funerals only for the dead that would wake wrong
//   mourner  holds every funeral it can and covers shades whenever Dread climbs
//   balanced keeps shades while Dread allows, and aims low before an inspection
//   double   the balanced plan, but from the first Maw night it posts two fighters on each stair of the
//            line and never moves anyone: the static answer the Maws are meant to break
//   idle     works the day but leaves the night alone: no candles, no posts (a baseline)
// All but double and idle react at night: a second fighter to each stair of the line for each tide, a ward
// on the line for the biggest tides when the essence is there, and a fighter to meet a Maw. They move a
// shade only along a lit floor; where its way is dark it stays.

import { bondedShade, postRoom, bareHalls, buildSpot, raiseCost, step, act, newSeason, ritePreview, crossingPreview, capacity, canWork, defense, funeralCap, choicesFor, jobCap, jobCount, eatRate, wardCost, livingTrait, shadeTrait, peopleIn, crowded, tradeOf, inGreatGlass, handsAt, seasonIndex, tributeOf, besieged, sallyOdds, embargoed, inquisition, crusadeDaysLeft, canAct, actOf, actCost, NEW_ROOMS, atTheGate, gatehouseOf, decreeOf, undergateMouth } from './sim.js';
import { DAY_ROOMS, MIRRORS, KINDS, MAP, TICKS_PER_SEC, VISITORS, STUDIES } from './data.js';
import { geo, roomSpan, roomAt, roomsOf, lineSpots, lightMap, isLit } from './geo.js';

export const PLANS = ['balanced', 'keeper', 'mourner', 'double', 'idle'];

const doAct = (s, a) => act(s, a).ok;
// AP_NOHIDE=1 never hides a mirror from a crusade (to measure whether hiding pays).
const NOHIDE = !!globalThis.process?.env?.AP_NOHIDE;
// AP_NOACTS=1 never uses the shades' acts; AP_DOUBLEACTS=1 lets Double use them too (it doesn't, as the
// line that never reacts).
const NOACTS = !!globalThis.process?.env?.AP_NOACTS;
const DOUBLEACTS = !!globalThis.process?.env?.AP_DOUBLEACTS;
// AP_ACTSONLY=stand,kindle uses only those acts (to measure what each is worth).
const ACTSONLY = globalThis.process?.env?.AP_ACTSONLY?.split(',') || null;
// AP_NOERRANDS=1 leaves the night's echoes and relics alone; AP_LANTERNS=1 sends shades to them with lanterns.
const NOERRANDS = !!globalThis.process?.env?.AP_NOERRANDS;
const LANTERNS = !!globalThis.process?.env?.AP_LANTERNS;
const NOFREESLEEPER = !!globalThis.process?.env?.AP_NOFREESLEEPER; // no candle to wake a sleepwalker
// AP_RECKLESS=1 sends shades across the dark at night as the autopilot first did, without a lit way or a
// lantern (to measure what moving carefully is worth). AP_LANTERNMOVE=1 lights a lantern for a move where
// the way is dark, if the store can spare a candle (4 or more), rather than staying (to measure what that
// costs). AP_NOMOVE=1 never moves a shade at night to meet a Maw or a tide (to measure what the moves are
// worth).
const RECKLESS = !!globalThis.process?.env?.AP_RECKLESS;
const LANTERNMOVE = !!globalThis.process?.env?.AP_LANTERNMOVE;
const NOMOVE = !!globalThis.process?.env?.AP_NOMOVE;
// AP_HYBRID=1 gives every plan Double's second fighter at each stair on Maw nights, reactions and all (to
// measure what reacting adds to a static line as good as Double's).
const HYBRID = !!globalThis.process?.env?.AP_HYBRID;
// AP_OMENPICK=first takes the first of two omens, =worst the one that costs most (to measure what choosing is
// worth).
const OMENPICK = globalThis.process?.env?.AP_OMENPICK || null;
// Traits, as a player reads them. AP_BLIND=1 plays as if nobody had one (to measure what they're worth).
const BLIND = !!globalThis.process?.env?.AP_BLIND;
// AP_BELOW=1 also works the rooms below the line on the Choir's side of the keep, leaving the other side dark
// as the Unlit's way up (to measure whether working below the line pays).
const BELOW = !!globalThis.process?.env?.AP_BELOW;
// AP_BREAK=1 breaks a mirror to stop a censure (to measure whether that pays).
const BREAK = globalThis.process?.env?.AP_BREAK;
// AP_WEEPGUARD=1 posts a fighter in the Weepers' room the night after a death, AP_DREAM=1 a worker to dream
// in the Dreamwell every night, below the line or not, under a candle of its own (to measure whether either
// pays).
const WEEPGUARD = !!globalThis.process?.env?.AP_WEEPGUARD;
const DREAM = !!globalThis.process?.env?.AP_DREAM;
// AP_WHISPER=1 has a shade whisper to every trade someone works; AP_STEP=1 builds a great glass when it
// needs mirror room and sends its shades through to work by day (to measure whether either pays).
const WHISPER = !!globalThis.process?.env?.AP_WHISPER;
// Raids you fight. AP_RAIDPASSIVE=1 does nothing at the gate (the old autopilot under the new rules);
// AP_TRIBUTE=1 also pays the Host off when a breach looks certain (to measure whether either pays).
const RAIDPASSIVE = !!globalThis.process?.env?.AP_RAIDPASSIVE;
const TRIBUTE = !!globalThis.process?.env?.AP_TRIBUTE;
// One part of the raid policy off at a time, to find what it costs.
const NO = (k) => !!globalThis.process?.env?.[`AP_NO${k}`];
// Candles kept back from pitch for the night.
const PITCH_KEEP = 8;
const EPS = 1e-9;
const STEP = !!globalThis.process?.env?.AP_STEP;
// A shade spent below this much memory by day would be lost to the night soon after.
const DAY_KEEP = 30;
const LT = (s, p) => (BLIND ? null : livingTrait(s, p));
const ST = (s, d) => (BLIND ? null : shadeTrait(s, d));
// How well someone does a job, by their trait.
const fit = (s, p, k) => {
  const L = LT(s, p);
  return L ? (L.any ?? 1) * (L.jobs?.[k] ?? 1) * (k === 'barracks' ? (L.guard ?? 1) : 1) : 1;
};

/* ---------------------------------------------------------------- day */

// What it builds, in order, counting what's already standing: a Barracks for the day-2 raid, a Chapel (its
// priests bear Dread and hold funerals), a Chandlery before the first candles run out, a Glazier for mirrors,
// an Infirmary, a second Barracks (one holds only three guards), Quarters once the keep is crowded, a Forge
// for grave-steel, a Granary and a Cellar. A crude player: nothing past that. AP_NOQUARTERS=1 never builds
// Quarters (to measure whether they pay).
// Round six's rooms go in last, once the keep's own stand: the Hall, then the Library, then the Gatehouse (for a
// keep that holds its raids, what they cost in stone came to more than they gave while the keep's own rooms
// waited: problem 39). AP_GATEEARLY=1 builds the Gatehouse before the ladders come instead, fifth. AP_NO<ROOM>=1
// leaves one out (AP_NOGATEHOUSE, AP_NOLIBRARY, AP_NOHALL).
const GATEEARLY = !!globalThis.process?.env?.AP_GATEEARLY;
const BUILD_ORDER = GATEEARLY
  ? ['barracks', 'chapel', 'chandlery', 'glazier', 'gatehouse', 'infirmary', 'barracks', 'quarters', 'forge', 'granary', 'cellar', 'hall', 'library']
  : ['barracks', 'chapel', 'chandlery', 'glazier', 'infirmary', 'barracks', 'quarters', 'forge', 'granary', 'cellar', 'hall', 'library', 'gatehouse'];
const NOQUARTERS = !!globalThis.process?.env?.AP_NOQUARTERS;
// AP_TALL=1 starts a new floor with every room, never filling a bare hall: the tallest keep its rooms can
// make (to measure whether a taller Tain makes the night easier).
const TALL = !!globalThis.process?.env?.AP_TALL;
// AP_TALL=line builds tall but puts the Chapel in the line's floor's bare hall, where the shades holding the
// line sing in the Choir as they hold it.
const TALLLINE = globalThis.process?.env?.AP_TALL === 'line';
// Autumn's siege: the autopilot sallies out when the odds are SALLY_AT or better with two guards or more.
// AP_NOSALLY=1 waits the siege out (to measure whether sallying pays).
const SALLY_AT = 0.6;
const NOSALLY = !!globalThis.process?.env?.AP_NOSALLY;
// The dead's requests at the rite. The autopilot grants a Loyal shade the gate when a raid comes tomorrow, a
// name or a remembering when it has the remembrance, and anything asked a second time (a second refusal turns
// a shade Restless), except that it lets a Serene shade go only then. AP_GRANT=1 grants every request, and
// AP_REFUSE=1 none (to measure whether answering them matters).
const GRANT = !!globalThis.process?.env?.AP_GRANT;
const REFUSE = !!globalThis.process?.env?.AP_REFUSE;
const NOGATE = !!globalThis.process?.env?.AP_NOGATE;
// Rain: the Drowned come up behind the line. By default the autopilot wards the moat when it has the essence
// beyond what the new moon will need, and otherwise lights each mirror and posts its best free fighter there.
// AP_DROWN=ward only wards (whenever it can), guard only guards, none does neither (to measure each).
const DROWN = globalThis.process?.env?.AP_DROWN || 'both';
// Down into the Deep. AP_DEEP=1, 2 or 3 sends one shade down to that depth every night but the new moon, the
// weakest fighter left once the line is held, if at least one other is left to post and a catch wouldn't
// finish it; and upgrades a mirror with quicksilver, rather than building one, when the dead need room. By
// default it never goes down (to measure whether going down pays).
const DEEP = Number(globalThis.process?.env?.AP_DEEP || 0);
// Upgrades a hand mirror (or else a pier glass) with quicksilver, if the stores run to it.
function upgradeOne(s) {
  const T = s.tuning;
  for (const [from, to] of [['hand', 'pier'], ['pier', 'great']]) {
    const m = s.mirrors.find((x) => x.type === from);
    if (m && (s.res.quicksilver || 0) >= T.upgradeSilver[to] && s.res.glass >= T.upgradeGlass[to]) return doAct(s, { type: 'upgradeMirror', id: m.id });
  }
  return false;
}
function nextBuild(s) {
  const want = {};
  for (const type of BUILD_ORDER) {
    if (type === 'quarters' && (NOQUARTERS || !crowded(s))) continue;
    if (NEW_ROOMS.includes(type) && (!s.tuning[type] || NO(type.toUpperCase()))) continue;
    // The Gatehouse waits until there's a bare hall to move a room into, to make it room at the gate.
    if (type === 'gatehouse' && !gatehouseOf(s) && !gateSpot(s) && !bareHalls(s).length) continue;
    want[type] = (want[type] || 0) + 1;
    if (roomsOf(geo(s), type).length < want[type]) return type;
  }
  return null;
}

// Candles to keep in store: with the year on, more put by through summer and autumn for winter's long nights
// and the Long Night.
const CANDLES_BY = [8, 16, 26, 26];
const candleTarget = (s) => (s.tuning.year ? CANDLES_BY[seasonIndex(s)] : 8);

function wantedJobs(s) {
  const n = s.living.length;
  const r = s.raid;
  const threat = r && (r.state === 'coming' || r.state === 'assault') && r.warned && defense(s) < r.strength;
  const food = eatRate(s) + (s.res.food < n ? 2 : 0) - (s.res.food > 3 * n ? 3 : 0);
  const want = {
    hearth: Math.max(1, Math.ceil(food / DAY_ROOMS.hearth.rate)),
    chapel: n >= 10 ? 2 : 1,
    infirmary: s.living.some((p) => p.sick > 0) ? 1 : 0,
    chandlery: threat ? 0 : s.res.candles < candleTarget(s) ? 2 : 1,
    glazier: threat || n < 6 ? 0 : 1,
    library: !threat && s.study && s.res.food >= n ? 2 : 0,
    yard: !threat && nextBuild(s) && s.res.stone < s.tuning.roomStone ? 1 : 0,
  };
  // Nobody can work a room that isn't built.
  for (const k of Object.keys(want)) want[k] = Math.min(want[k], jobCap(s, k));
  return want;
}

function staff(s) {
  const want = wantedJobs(s);
  const order = ['hearth', 'chapel', 'infirmary', 'chandlery', 'glazier', 'library', 'yard'];
  const count = Object.fromEntries(order.map((k) => [k, 0]));
  const free = [];
  for (const p of s.living) {
    if (p.age === 'child') continue; // too young to work
    if (p.job in count && count[p.job] < want[p.job]) count[p.job]++;
    else free.push(p);
  }
  // Keep the old at the Chapel and the sick out of the barracks where there's a choice.
  free.sort((a, b) => (a.age === 'old') - (b.age === 'old'));
  for (const k of order) {
    while (count[k] < want[k] && free.length) {
      // The usual pick, unless someone else's trait suits the job better.
      let i = k === 'chapel' ? free.length - 1 : 0;
      for (const [j, q] of free.entries()) if (fit(s, q, k) > fit(s, free[i], k) + 1e-9) i = j;
      const [p] = free.splice(i, 1);
      if (p.job !== k) doAct(s, { type: 'assign', id: p.id, room: k });
      count[k]++;
    }
  }
  free.sort((a, b) => fit(s, b, 'barracks') - fit(s, a, 'barracks')); // the Brave to the gate first, Cowards last
  // The rest hold the gate on a raid day, or when there's nothing to build, as many as the barracks hold;
  // everyone else quarries stone.
  // The Gatehouse first: its guards count for more, and throw down the ladders.
  const gate = !!s.raid || !nextBuild(s);
  for (const p of free) {
    const room = !gate ? 'yard' : p.job === 'gatehouse' || jobCount(s, 'gatehouse') < jobCap(s, 'gatehouse') ? 'gatehouse' : p.job === 'barracks' || jobCount(s, 'barracks') < jobCap(s, 'barracks') ? 'barracks' : 'yard';
    if (p.job !== room) doAct(s, { type: 'assign', id: p.id, room });
  }
}

// A raid you fight. From the warning: if even the bell and all the pitch it can spare won't hold the gate,
// bar the stores (and, with AP_TRIBUTE, pay the Host off if the keep can spare it). At the gate: pitch while
// the Host outweighs the defense, then the bell if pitch isn't enough, and stone if the gate would fall before
// the Host gives up. After a breach worth chasing, go after them.
function raidMoves(s) {
  const r = s.raid;
  const T = s.tuning;
  if (!T.raidFight || RAIDPASSIVE || !r) return;
  const hands = s.living.filter((p) => p.job !== 'barracks' && !p.fighting && !p.walls && !(p.sick > 0) && p.age !== 'child').length;
  const pitchable = (c) => Math.max(0, Math.floor((c - PITCH_KEEP) / T.raidPitchCost)) * T.raidPitch;
  if (r.state === 'coming' && r.warned) {
    const best = defense(s) + (r.ward ? 0 : s.res.essence >= T.wardGateCost ? T.wardGateDefense : 0) + hands * T.raidBellDefense + pitchable(s.res.candles);
    if (best + EPS < r.strength) {
      const t = tributeOf(s);
      if (TRIBUTE && s.res.food >= t.food + eatRate(s) && s.res.candles >= t.candles + PITCH_KEEP) doAct(s, { type: 'payOff' });
      else if (!r.barred && !NO('BAR')) doAct(s, { type: 'barStores' });
    }
  } else if (r.state === 'assault') {
    while (!NO('PITCH') && r.host > defense(s) + EPS && s.res.candles >= PITCH_KEEP + T.raidPitchCost && doAct(s, { type: 'pitch' }));
    if (!NO('BELL') && r.host > defense(s) + EPS && !r.bell && hands) doAct(s, { type: 'raidBell' });
    // Stone only if the gate would give before the Host's time is up.
    const loss = (T.raidBreak * Math.max(0, r.host - defense(s))) / r.strength;
    if (!NO('SHORE') && loss > 0 && r.gate / loss < r.left / TICKS_PER_SEC) doAct(s, { type: 'shore' });
  } else if (r.state === 'breached' && r.loot && !r.pursued) {
    const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length;
    if (guards >= 2 && r.loot.food + r.loot.glass + r.loot.candles >= 6) doAct(s, { type: 'pursue' });
  }
}

// The dead by day: whisper each trade someone works, from the shade with the most memory to spare; send a
// great glass's shades through to whichever room most needs hands. Stop anyone near the end of their memory.
function deadByDay(s) {
  const T = s.tuning;
  for (const d of s.shades) if (d.byDay && d.memory - T.stepFade < DAY_KEEP) doAct(s, { type: 'byDay', id: d.id, how: null });
  if (STEP) {
    const r = s.raid;
    const rooms = [r && r.state === 'coming' && defense(s) < r.strength ? 'barracks' : null, s.res.candles < 10 ? 'chandlery' : null, 'chapel', 'glazier', 'hearth'].filter(Boolean);
    for (const d of s.shades.filter((x) => canWork(x) && inGreatGlass(s, x) && !x.byDay && x.memory - T.stepFade >= DAY_KEEP)) {
      const room = rooms.find((k) => jobCap(s, k) > handsAt(s, k));
      if (room) doAct(s, { type: 'byDay', id: d.id, how: 'step', room });
    }
  }
  if (WHISPER) {
    const done = new Set(s.shades.filter((d) => d.byDay?.how === 'whisper').map((d) => tradeOf(s, d)));
    const free = s.shades.filter((d) => canWork(d) && !d.byDay && d.memory - T.whisperFade >= DAY_KEEP).sort((a, b) => b.memory - a.memory);
    for (const d of free) {
      const k = tradeOf(s, d);
      if (k && !done.has(k) && jobCount(s, k) > 0 && jobCap(s, k) > 0) {
        doAct(s, { type: 'byDay', id: d.id, how: 'whisper' });
        done.add(k);
      }
    }
  }
}

// Where the Gatehouse can go now: a bare hall on the ground floor, where the gate is.
function gateSpot(s) {
  const G = geo(s);
  return bareHalls(s).find((h) => h.f === G.veil)?.id || null;
}
// Building the Gatehouse: at the gate, moving the Hearth up into a bare hall first to make it room.
function raiseGatehouse(s) {
  const G = geo(s);
  const T = s.tuning;
  let at = gateSpot(s);
  if (!at) {
    const up = bareHalls(s).find((h) => !atTheGate(G, h.f));
    const ground = G.floors[G.veil].rooms.map(([id, , , type]) => ({ id, type }));
    const move = ground.find((r) => r.type === 'hearth') || ground.find((r) => r.type !== 'crypt' && r.type !== 'empty');
    if (!up || !move || s.res.stone < T.moveStone + raiseCost(s, { newFloor: false })) return;
    if (!doAct(s, { type: 'moveRoom', id: move.id, to: up.id })) return;
    at = gateSpot(s);
  }
  if (at && s.res.stone >= raiseCost(s, buildSpot(s, at))) doAct(s, { type: 'raise', room: 'gatehouse', at });
}
// The Library: begin the next study when the remembrance is there, keeping a vigil's worth back.
const STUDY_ORDER = ['masonry', 'tallow', 'wards', 'hollow', 'pitch', 'herbs', 'silvering', 'rites'];
function libraryMoves(s) {
  if (!s.tuning.library || s.study || !roomsOf(geo(s), 'library').length) return;
  const id = STUDY_ORDER.find((k) => !s.learned.includes(k));
  if (id && s.res.remembrance >= STUDIES[id].rem + s.tuning.vigilCost) doAct(s, { type: 'study', id, ...(id === 'rites' ? { kind: 'loyal' } : {}) });
}
// The Hall: a levy while raids are still to come this season and there's food for it; rationing when the larder
// runs low; else nothing, and no price.
function hallMoves(s) {
  if (!s.tuning.hall || decreeOf(s) || s.decree?.season === s.season || !roomsOf(geo(s), 'hall').length) return;
  const raids = Object.entries(s.tuning.raidDays).some(([d, b]) => Number(d) >= s.day && b);
  if (s.res.food < eatRate(s)) doAct(s, { type: 'decree', id: 'rationing' });
  else if (raids && s.res.food >= 3 * eatRate(s)) doAct(s, { type: 'decree', id: 'levy' });
}

function dayMoves(s) {
  const b = nextBuild(s);
  const lineHall = TALLLINE && b === 'chapel' && bareHalls(s).find((h) => h.f === geo(s).veil - 1);
  const at = TALL ? (lineHall ? lineHall.id : 'top') : undefined;
  if (b === 'gatehouse') raiseGatehouse(s);
  else if (b && s.res.stone >= raiseCost(s, buildSpot(s, at))) doAct(s, { type: 'raise', room: b, ...(at ? { at } : {}) });
  libraryMoves(s);
  hallMoves(s);
  if (s.raid?.state !== 'assault') staff(s); // nobody leaves the walls while the Host is at the gate
  if (!NOSALLY && besieged(s) && s.raid?.state !== 'assault' && sallyOdds(s) >= SALLY_AT && s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length >= 2) doAct(s, { type: 'sally' });
  const r = s.raid;
  if (r && (r.state === 'coming' || r.state === 'assault') && r.warned && !r.ward && defense(s) < r.strength) doAct(s, { type: 'wardGate' });
  const { free } = capacity(s);
  // The crusade: on the last day to hide, if a full gate (every hand the Barracks hold, the ward, the bell for
  // the rest, and the pitch it can spare) still falls short, hide the fullest mirror, and only that one: the
  // rest hold the line the night before.
  if (!NOHIDE && crusadeDaysLeft(s) === 1 && !s.mirrors.some((m) => m.hidden)) {
    const T = s.tuning;
    const able = s.living.filter((p) => !(p.sick > 0) && p.age !== 'child').length;
    const guards = Math.min(able, jobCap(s, 'barracks'));
    const pitch = Math.max(0, Math.floor((s.res.candles - PITCH_KEEP) / T.raidPitchCost)) * T.raidPitch;
    const best = guards * DAY_ROOMS.barracks.rate + (s.res.essence >= T.wardGateCost ? T.wardGateDefense : 0) + (able - guards) * T.raidBellDefense + pitch;
    const open = s.mirrors.filter((m) => !m.hidden).map((m) => ({ m, n: s.shades.filter((d) => d.mirror === m.id).length })).sort((a, b) => b.n - a.n);
    if (best < s.church.strength && open[0]?.n) doAct(s, { type: 'hide', id: open[0].m.id, on: true });
  }
  // The Church's embargo: pay it off when the dead need mirrors and the remembrance is there.
  if (embargoed(s) && !inquisition(s) && (free <= 1 || s.bodies.length) && s.res.remembrance >= s.tuning.donation + 2) doAct(s, { type: 'donate' });
  // AP_STEP saves its glass for a great glass unless the dead are waiting for room now.
  const saving = STEP && s.tuning.whispers && !s.bodies.length && s.res.glass < MIRRORS.great.glass;
  const up = DEEP && s.tuning.deep && ((free <= 0 && !saving) || (free <= 1 && s.bodies.length)) && upgradeOne(s);
  if (up) {
    // A mirror upgraded with quicksilver made the room.
  } else if ((free <= 0 && !saving) || (free <= 1 && s.bodies.length)) {
    const kind = STEP && s.tuning.whispers && s.res.glass >= MIRRORS.great.glass ? 'great' : s.res.glass >= MIRRORS.pier.glass ? 'pier' : s.res.glass >= MIRRORS.hand.glass ? 'hand' : null;
    if (kind) doAct(s, { type: 'build', mirror: kind });
  } else if (STEP && s.tuning.whispers && s.res.glass >= MIRRORS.great.glass && !s.mirrors.some((m) => m.type === 'great')) doAct(s, { type: 'build', mirror: 'great' });
  if (s.tuning.whispers && (WHISPER || STEP)) deadByDay(s);
  // A fire: send the Yard at once, and ring the bell if the fire is still gaining on them.
  for (const f of s.fires || []) {
    doAct(s, { type: 'fightFire', room: f.room });
    if (s.tuning.fireGrow - s.tuning.fireFight * peopleIn(s, f.room).length > 0) doAct(s, { type: 'fightFire', room: f.room, bell: true });
  }
  const I = s.inspection;
  if (I && !I.done && I.day === s.day) while (s.dread >= 2 && doAct(s, { type: 'vigil' }));
  // A censure coming at noon that vigils can't stop: break the mirror that brings Dread under it for the
  // fewest shades, rather than let the Church carry off the fullest.
  if (BREAK && I && !I.done && I.day === s.day && s.dread >= 4) {
    const need = Math.ceil((s.dread - 3) / s.tuning.breakDread);
    const all = s.mirrors.map((x) => ({ x, n: s.shades.filter((d) => d.mirror === x.id).length }));
    const m = all.filter((e) => e.n >= need).sort((a, b) => a.n - b.n)[0];
    // What the censure would carry off: the fullest mirror.
    const taken = Math.max(0, ...all.map((e) => e.n));
    if (m && (BREAK !== 'smart' || taken - m.n >= 2)) doAct(s, { type: 'break', id: m.x.id });
  }
}

/* ---------------------------------------------------------------- visitors */

// Visitors at the gate (round six), answered by rule the moment they arrive: what a careful keeper would say,
// from what the keep has and what the day holds. Two days' food stays in the larder whatever is bought.
// AP_VISIT=default leaves every one waiting, to take the last answer; AP_VISIT=first gives each the first;
// AP_VISIT=kind:answer gives that kind that answer and the rest their rule: to measure what an answer costs.
const VISIT = globalThis.process?.env?.AP_VISIT || null;
function visitorAnswer(s, v, plan) {
  const T = s.tuning;
  const food = s.res.food;
  const larder = 2 * eatRate(s);
  const spare = (n) => food - n >= larder;
  const r = s.raid;
  const fighters = s.shades.filter((d) => canWork(d) && fighter(d)).length;
  switch (v.kind) {
    case 'peddler': return spare(6) && s.res.glass < MIRRORS.pier.glass ? 'buy' : 'no';
    case 'chandler': return spare(6) && s.res.candles < candleTarget(s) ? 'buy' : 'no';
    case 'grain': return food < 1.5 * larder && s.res.glass >= 4 ? 'buy' : 'no';
    case 'mason': return spare(4) && nextBuild(s) && s.res.stone < T.roomStone ? 'hire' : 'no';
    case 'mirrors': return spare(8) && capacity(s).free <= 1 ? 'buy' : 'no';
    case 'pilgrims': return spare(0) || (r?.state === 'coming' && defense(s) < r.strength) ? 'take' : 'no';
    case 'refugees': return spare(9) ? 'take' : 'no'; // 6 to feed them now, and three more mouths
    case 'graverobber': return plan === 'mourner' ? 'go' : 'hang'; // the mourner has funerals enough to give
    case 'knight': {
      // A fighter is worth more to the line than a harder raid costs: free only one near the end of its memory.
      const d = s.shades.find((x) => x.id === v.shade);
      return d && (d.memory < 35 || fighters > 4) ? 'free' : 'keep';
    }
    case 'plague': return spare(2) && jobCap(s, 'infirmary') > 0 ? 'take' : 'no';
    case 'wedding': return spare(4) ? 'feast' : 'no';
    case 'bard': return spare(2) ? 'sing' : 'no';
    case 'deserter': return spare(1) && (!s.raid || s.raid.state !== 'coming' || defense(s) + 3 >= 1.2 * s.raid.strength) ? 'take' : 'no';
    case 'almoner': return s.dread >= 2 && spare(5) ? 'give' : 'no';
    case 'witch': return s.dread >= 3 ? 'church' : s.res.candles < candleTarget(s) && s.res.glass >= 3 + MIRRORS.hand.glass ? 'charm' : 'no';
    case 'physician': return s.res.glass >= 4 && (s.living.filter((p) => p.sick > 0).length >= 2 || !jobCount(s, 'infirmary')) ? 'pay' : 'no';
    case 'priest': return spare(2) ? 'feed' : 'no';
    case 'reeve': return spare(6) ? 'pay' : 'no';
    case 'necromancer': return plan !== 'mourner' && s.dread <= 2 ? 'bind' : 'no';
    case 'cooper': return s.res.glass >= 3 + MIRRORS.hand.glass ? 'buy' : 'no';
    default: return VISITORS[v.kind].answers.at(-1).id;
  }
}
function visitorMoves(s, plan) {
  if (VISIT === 'default') return;
  const [kind, forced] = VISIT?.includes(':') ? VISIT.split(':') : [];
  for (const v of s.visitors.filter((x) => x.here && !x.done)) {
    const answer = v.kind === kind ? forced : VISIT === 'first' ? VISITORS[v.kind].answers[0].id : visitorAnswer(s, v, plan);
    doAct(s, { type: 'visitor', id: v.id, answer });
  }
}

/* ---------------------------------------------------------------- dusk */

// Where each shade was posted at dusk, so those called to the line for a tide can go back to work after.
const homes = new WeakMap();

const fighter = (d) => KINDS[d.kind].fight;
const worker = (d) => KINDS[d.kind].work;

function funerals(s, plan) {
  const cap = funeralCap(s);
  const rank = { wraith: 0, restless: 1, pale: 2, stranger: 3, serene: 4, loyal: 5 };
  const bodies = [...s.bodies].sort((a, b) => rank[a.kind] - rank[b.kind]);
  let n = 0;
  for (const b of bodies) {
    if (n >= cap) break;
    const wrong = b.kind === 'wraith' || b.kind === 'restless';
    if (plan === 'mourner' || wrong || (plan === 'balanced' && s.dread >= 3 && b.kind === 'pale')) {
      if (doAct(s, { type: 'funeral', id: b.id, on: true })) n++;
    }
  }
  // Anyone left over who would overflow the mirrors gets a funeral if a priest is free.
  for (const x of crossingPreview(s)) if (x.to === 'overflow' && n < cap && doAct(s, { type: 'funeral', id: x.b.id, on: true })) n++;
}

// The line: the feet of the two stairs up to the Veil floor (or between rift and mirror, in a keep with no
// stairs). Lit, they turn every climber aside to gnaw at the light's edge, where a shade in it can fight.
const lineOf = (s) => lineSpots(geo(s));

// Where the shades not holding the line work tonight: [room, shades]. Nobody works below the line's floor,
// out where the tides and the Maws come up, except in the Choir: its essence is worth the risk.
function postings(s, ds) {
  const T = s.tuning;
  const lf = lineOf(s)[0].f;
  const rooms = [];
  const G = geo(s);
  const left = (room) => roomSpan(G, room).x0 < (MAP.LEFT + MAP.RIGHT) / 2;
  const side = roomsOf(G, 'chapel').length ? left('chapel') : true;
  // The night after a death the Weepers come for the sleepers' twin: a fighter there cuts them down. It
  // doesn't pay (a nightmare apiece costs less than a fighter off the line), so only to measure that.
  const weepRoom = roomsOf(G, 'quarters').length ? 'quarters' : 'hearth';
  const weepers = WEEPGUARD && s.night?.spawns.some((sp) => sp.type === 'weeper') && roomSpan(G, weepRoom).f >= lf;
  const take = (room, score) => {
    if (!ds.length || !roomsOf(G, room).length) return false;
    if (room !== 'chapel' && !(weepers && room === weepRoom) && !(DREAM && room === 'quarters') && roomSpan(G, room).f < lf && !(BELOW && left(room) === side)) return false;
    const d = [...ds].sort((a, b) => score(b) - score(a))[0];
    ds.splice(ds.indexOf(d), 1);
    const r = rooms.find((x) => x[0] === room);
    if (r) r[1].push(d);
    else rooms.push([room, [d]]);
    return true;
  };
  // Traits: a Wistful shade rests in the Cold Hearth (good dreams: the living work better); a Hoarding one sings.
  for (const d of ds.filter((x) => ST(s, x)?.dreams)) take('hearth', (x) => (x === d ? 1 : 0));
  for (const d of ds.filter((x) => ST(s, x)?.essence)) take('chapel', (x) => (x === d ? 1 : 0));
  if (weepers) take(weepRoom, fighter);
  take('chapel', worker);
  if (roomsOf(geo(s), 'forge').length) take('forge', worker);
  if (DREAM && s.tuning.dreamwell) take('quarters', worker);
  if (ds.some((d) => d.memory < 50 && ST(s, d)?.rests !== false)) take('hearth', (d) => (ST(s, d)?.rests === false ? -1e9 : -d.memory));
  if (capacity(s).free <= 1) take('glazier', worker);
  if (s.res.candles < 6) take('chandlery', worker);
  if (s.living.some((p) => p.sick > 0)) take('infirmary', worker);
  // The rest: the Watch before a raid, else the Choir, else rest at the Cold Hearth.
  while (ds.length && (take(T.raidDays[s.day + 1] ? 'barracks' : 'chapel', fighter) || take('chapel', fighter) || take('hearth', fighter)));
  return rooms;
}

function placeNight(s, plan) {
  const T = s.tuning;
  const G = geo(s);
  const LINE = lineOf(s);
  const line = (d) => fighter(d) * d.memory * (ST(s, d)?.fight ?? 1) * (ST(s, d)?.dreams ? 0.3 : 1);
  const ds = s.shades.filter(canWork).sort((a, b) => line(b) - line(a));
  for (const st of LINE) {
    doAct(s, { type: 'candle', f: st.f, x: st.x });
    const d = ds.shift();
    if (d) doAct(s, { type: 'move', id: d.id, f: st.f, x: st.x });
  }
  // The doubled line: a second fighter beside each stair's candle on every Maw night, taken from the rooms.
  if ((plan === 'double' || HYBRID) && s.day >= T.mawFrom && s.day < T.seasonDays) {
    for (const st of LINE) {
      const d = ds.shift();
      if (d) doAct(s, { type: 'move', id: d.id, f: st.f, x: st.x + 2 });
    }
  }
  const lit = meetDrowned(s, ds);
  meetUndergate(s, ds, lit);
  if (DEEP && s.tuning.deep && s.day < T.seasonDays && ds.length >= 2) {
    const d = ds[ds.length - 1];
    if (d.memory > s.tuning.deepDrain + 10 && doAct(s, { type: 'descend', id: d.id, depth: DEEP })) ds.pop();
  }
  // The new moon: no work tonight. Everyone off the line waits by the Veil for the Hollow.
  if (s.day >= T.seasonDays) {
    const { f, x0 } = roomSpan(G, 'hearth');
    ds.forEach((d, i) => doAct(s, { type: 'move', id: d.id, f, x: x0 + 14 + (i % 4) * 5 }));
    if (ds.length && !lit.has(roomAt(G, f, x0 + 24))) doAct(s, { type: 'candle', f, x: x0 + 24 });
    homes.set(s, new Map(s.shades.filter(canWork).map((d) => [d.id, { ...d.post }])));
    return;
  }
  for (const [room, group] of postings(s, ds)) {
    const { f, x0, x1 } = roomSpan(G, room);
    // On the line's floor: just behind the line, in its light. With lineGuard on, only to keep the Watch (the
    // one job a shade guarding the line does); anything else goes to the far side of the room from the stair,
    // out of the guard light, under a candle of its own.
    const st = LINE.find((p) => p.f === f && roomAt(G, f, p.x) === roomAt(G, f, x0));
    const near = st && (!T.lineGuard || G.n === 1 || room === 'barracks');
    const mid = !st ? (x0 + x1) / 2 : near ? (st === LINE[0] ? st.x + 10 : st.x - 10) : st.x - x0 < x1 - st.x ? x1 - 8 : x0 + 8;
    group.forEach((d, i) => doAct(s, { type: 'move', id: d.id, f, x: mid - 4 + (i % 3) * 4 }));
    if (!near && s.res.candles > 1 && !lit.has(roomAt(G, f, mid))) doAct(s, { type: 'candle', f, x: mid });
  }
  homes.set(s, new Map(s.shades.filter(canWork).map((d) => [d.id, { ...d.post }])));
}
// A rainy night (DROWN above): ward the moat, or light the mirror nearest the end the Drowned come up at and
// post the best fighter left (ds is strongest first) by it. Returns the rooms it lit, so no second candle
// goes in them.
function meetDrowned(s, ds) {
  const T = s.tuning;
  const G = geo(s);
  const lit = new Set();
  const sp = s.night.spawns.find((x) => x.type === 'drowned');
  mirrorGuard.delete(s);
  if (DROWN === 'none' || !sp) return lit;
  const reserve = DROWN === 'ward' || s.day < T.seasonDays - 2 ? 0 : G.stairs.length * wardCost(s);
  const ward = () => s.res.essence >= wardCost(s) + reserve && doAct(s, { type: 'ward', target: 'moat' });
  if (DROWN === 'guardfirst' && (!ds.length || G.n === 1)) {
    ward();
    return lit;
  }
  if (DROWN !== 'guard' && DROWN !== 'guardfirst' && ward()) return lit;
  if (DROWN === 'ward' || G.n === 1) return lit; // a keep one floor high has its moat outside the line
  const end = MAP.moat.find((w) => w.id === sp.rift);
  const m = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - end.x) < Math.abs(a.x - end.x) ? b : a));
  if (doAct(s, { type: 'candle', f: G.veil, x: m.x })) lit.add(roomAt(G, G.veil, m.x));
  const d = ds.shift();
  if (d && doAct(s, { type: 'move', id: d.id, f: G.veil, x: m.x })) mirrorGuard.set(s, d.id);
  return lit;
}
// Tonight's guard at the mirror, kept there: nobody sends it off to a Maw.
const mirrorGuard = new WeakMap();
// The Undergate (round six), under the Veil behind the line: a candle at its mouth keeps it shut; with no
// candle to spare, a ward if the essence is there (keeping the new moon's back late in the season); else light
// the mirror nearest it and post a fighter there, as for the Drowned.
function meetUndergate(s, ds, lit) {
  const T = s.tuning;
  const G = geo(s);
  const g = gatehouseOf(s);
  if (!g || G.n === 1 || !s.night.spawns.some((x) => x.rift === 'undergate')) return;
  const { x } = undergateMouth(g);
  if (globalThis.process?.env?.AP_UGFREE) doAct(s, { type: 'debug', what: 'give', res: 'candles', n: 1 }); // measuring only: the candle free
  if (s.res.candles >= 1 + (NO('UGCANDLE') ? Infinity : 0) && doAct(s, { type: 'candle', f: g.f, x })) {
    lit.add(roomAt(G, g.f, x));
    return;
  }
  const reserve = s.day < T.seasonDays - 2 ? 0 : G.stairs.length * wardCost(s);
  if (s.res.essence >= wardCost(s) + reserve && doAct(s, { type: 'ward', target: 'undergate' })) return;
  const m = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  if (!lit.has(roomAt(G, G.veil, m.x)) && doAct(s, { type: 'candle', f: G.veil, x: m.x })) lit.add(roomAt(G, G.veil, m.x));
  if (mirrorGuard.has(s)) return;
  const d = ds.shift();
  if (d && doAct(s, { type: 'move', id: d.id, f: G.veil, x: m.x })) mirrorGuard.set(s, d.id);
}

/* ---------------------------------------------------------------- night */

// The shades' acts, by rule. Each keeps 30 memory after paying, since memory is its strength. A Loyal shade
// stands against a Maw or the Hollow at its light; a Serene one kindles its candle when it's low and the
// store is nearly out, or a light wherever it stands in the dark; a Pale one slips a grip; a Stranger in light
// lures when three or more of the Unlit are within reach and not at its light already.
function actMoves(s, plan) {
  if (NOACTS || !s.tuning.acts || (plan === 'double' && !DOUBLEACTS)) return;
  const n = s.night;
  const T = s.tuning;
  const G = geo(s);
  const L = lightMap(G, T, n.candles);
  for (const d of s.shades) {
    if (!canAct(s, d) || d.memory - actCost(s, d) < 30) continue;
    const what = actOf(d);
    if (ACTSONLY && !ACTSONLY.includes(what)) continue;
    const lit = isLit(L, d.f, d.x);
    const near = n.foes.filter((c) => c.hp > 0 && !c.climb && c.f === d.f);
    let go = false;
    if (what === 'pass') go = !!d.grabbedBy;
    else if (what === 'stand') go = lit && near.some((c) => (c.type === 'maw' || c.type === 'hollow') && Math.abs(c.x - d.x) <= 10);
    else if (what === 'kindle') {
      const mine = n.candles.filter((k) => L.spans[d.f].some(([a, b, id]) => id === k.id && d.x >= a - 1e-6 && d.x <= b + 1e-6));
      // In the dark anywhere it isn't caught, walking to a stair included: it lights its own way.
      go = lit ? s.res.candles < 3 && mine.some((k) => k.wax < 0.3 * k.max) : !d.grabbedBy && !!roomAt(G, d.f, d.x);
    } else if (what === 'lure') go = lit && near.filter((c) => c.type !== 'maw' && c.type !== 'hollow' && Math.abs(c.x - d.x) <= T.lureReach && Math.abs(c.x - d.x) > 8).length >= 3;
    if (go) doAct(s, { type: 'shadeAct', id: d.id });
  }
}

// Echoes and relics, by rule; Double, which never moves anyone, leaves them. (Sleepwalkers get a candle, from
// every plan: see tendNight.) Each waits for a lull: none of the Unlit that hunt (all but Weepers and
// Wraiths) in the Tain, and none due before a shade could be there and back. Then it goes to the nearest free
// shade off the line (not caught, not guarding a mirror, memory over 40), and that shade comes home once it's
// taken, or the moment the lull ends. No lantern: in a lull there's nothing for one to keep off, and a candle
// a trip cost the balanced plan 14 whole years in 200 (AP_LANTERNS=1 takes one when the store has 4).
const runners = new WeakMap();
const errandDist = (d, e) => Math.abs(d.f - e.f) * 60 + Math.abs(d.x - e.x);
function errandMoves(s, plan) {
  const n = s.night;
  if (NOERRANDS || plan === 'double' || !n.errands?.length) return;
  const T = s.tuning;
  const LINE = lineOf(s);
  const home = homes.get(s);
  let run = runners.get(s);
  if (!run || run.night !== n) {
    run = { night: n, by: new Map(), home: new Set() };
    runners.set(s, run);
  }
  // Those on their way home keep being sent until the move takes (it doesn't on a stair, or while held).
  for (const id of run.home) {
    const d = s.shades.find((x) => x.id === id);
    const h = d && canWork(d) && home?.get(id);
    if (!h || (!d.climb && !d.grabbedBy && doAct(s, { type: 'move', id, f: h.f, x: h.x }))) run.home.delete(id);
  }
  const busy = new Set([...run.by.values(), ...run.home]);
  const onLine = (d) => LINE.some((st) => d.post.f === st.f && Math.abs(d.post.x - st.x) <= 3);
  const hunts = (c) => c.type !== 'weeper' && c.type !== 'wraith';
  const next = n.spawns.find(hunts);
  const lull = (secs) => !n.foes.some((c) => c.hp > 0 && hunts(c)) && (!next || next.at - s.t > secs * TICKS_PER_SEC);
  const back = (d) => {
    const h = d && canWork(d) && home?.get(d.id);
    if (h && (d.climb || d.grabbedBy || !doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x }))) run.home.add(d.id);
  };
  for (const e of n.errands) {
    if (e.kind === 'sleeper') continue;
    const d = s.shades.find((x) => x.id === run.by.get(e.id));
    if (e.done || (d && !lull(0))) {
      back(d);
      run.by.delete(e.id);
      continue;
    }
    if (d) continue;
    const go = s.shades.filter((x) => canWork(x) && !x.grabbedBy && !x.climb && x.memory > 40 && !onLine(x) && !busy.has(x.id) && mirrorGuard.get(s) !== x.id).sort((a, b) => errandDist(a, e) - errandDist(b, e))[0];
    if (!go || !lull((2 * errandDist(go, e)) / T.shadeSpeed + 5)) continue;
    if (LANTERNS && T.lanterns && s.res.candles >= 4 && !n.candles.some((k) => k.carrier === go.id)) doAct(s, { type: 'lantern', id: go.id });
    doAct(s, { type: 'move', id: go.id, f: e.f, x: Math.round(e.x * 2) / 2 });
    run.by.set(e.id, go.id);
    busy.add(go.id);
  }
}

// Of two omens, the one that costs this plan least, by what each cost it on every night over the whole year
// (problem 35): cheapest first. Double, which never moves anyone, feels the gnawing of still air and a second
// Maw more.
const OMEN_COST = {
  double: ['sealed', 'thin', 'restless', 'blood', 'still', 'hunt'],
  other: ['thin', 'still', 'restless', 'blood', 'sealed', 'hunt'],
};
function pickOmen(s, plan) {
  const [a, b] = s.night.omens;
  if (OMENPICK === 'first') return 0;
  const order = OMEN_COST[plan === 'double' ? 'double' : 'other'];
  const worse = order.indexOf(a.id) > order.indexOf(b.id) ? 0 : 1;
  return OMENPICK === 'worst' ? worse : 1 - worse;
}

// A move at night that doesn't walk a shade into the dark: along its own floor through light, or with the
// lantern it already carries. Otherwise it stays. (Lighting a lantern for the move cost more than staying:
// README, problem 36.)
const litAll = (L, f, x1, x2) => L.merged[f].some(([a, b]) => a <= Math.min(x1, x2) + 1e-9 && b >= Math.max(x1, x2) - 1e-9);
function safeMove(s, L, d, f, x) {
  if (NOMOVE) return false;
  if (RECKLESS) return doAct(s, { type: 'move', id: d.id, f, x });
  const lit = d.f === f && litAll(L, f, d.x, x);
  const carried = s.night.candles.some((k) => k.carrier === d.id);
  if (!lit && !carried) {
    if (!LANTERNMOVE || !s.tuning.lanterns || s.res.candles < 4 || !doAct(s, { type: 'lantern', id: d.id })) return false;
  }
  return doAct(s, { type: 'move', id: d.id, f, x });
}

function tendNight(s, plan) {
  const n = s.night;
  const T = s.tuning;
  const G = geo(s);
  const LINE = lineOf(s);
  actMoves(s, plan);
  errandMoves(s, plan);
  // Relight the line first, then any post whose candle is going out.
  const lit = (f, x) => n.candles.some((c) => c.f === f && Math.abs(c.x - x) <= 6 && c.wax > 15);
  for (const st of LINE) if (!lit(st.f, st.x)) doAct(s, { type: 'candle', f: st.f, x: st.x });
  const inRoom = (f, x) => n.candles.some((c) => c.f === f && roomAt(G, c.f, c.x) === roomAt(G, f, x) && c.wax > 15);
  const run = runners.get(s)?.night === n ? runners.get(s) : null;
  const out = new Set(run ? [...run.by.values(), ...run.home] : []);
  for (const d of s.shades.filter(canWork)) {
    const { f, x } = d.post;
    if (!out.has(d.id) && f !== LINE[0].f && !inRoom(f, x) && s.res.candles > 1) doAct(s, { type: 'candle', f, x });
  }
  // Free the caught. A sleepwalker gets a candle, which wakes them, once they're caught or on the Deep's floor.
  for (const d of s.shades) if (d.grabbedBy && s.res.candles > 0) doAct(s, { type: 'candle', f: d.f, x: d.x });
  for (const e of n.errands || []) if (!NOFREESLEEPER && e.kind === 'sleeper' && e.out && !e.done && !e.climb && (e.held || e.f === G.deep) && s.res.candles > 0) doAct(s, { type: 'candle', f: e.f, x: e.x });
  // A Maw going for a candle or a room: send the best free fighter to stand with whoever holds it.
  for (const m of n.foes.filter((f) => plan !== 'double' && f.type === 'maw' && f.target)) {
    const t = m.target;
    const at = (d) => d.f === t.f && (t.kind === 'candle' ? Math.abs(d.x - t.x) <= 8 : roomAt(G, d.f, d.x) === t.id);
    const near = s.shades.filter((d) => canWork(d) && at(d));
    if (near.length >= 2) continue;
    const help = s.shades
      .filter((d) => canWork(d) && !near.includes(d) && !d.grabbedBy && !d.climb && d.memory > 30 && !LINE.some((st) => d.post.f === st.f && d.post.x === st.x) && mirrorGuard.get(s) !== d.id)
      .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
    if (!help || (help.post.f === t.f && Math.abs(help.post.x - t.x) <= 8)) continue;
    const x = t.x + (help.x < t.x ? -2 : 2);
    if (!safeMove(s, lightMap(G, T, n.candles), help, t.f, x)) continue;
    // Don't send anyone to stand in the dark: light the spot, with the last candle if need be.
    if (!n.candles.some((c) => c.f === t.f && roomAt(G, c.f, c.x) === roomAt(G, t.f, x) && Math.abs(c.x - x) <= 12 && c.wax > 15)) doAct(s, { type: 'candle', f: t.f, x });
  }
  // The tides, announced at dusk: from a few seconds before each until it has spent itself, a second fighter
  // from the rooms stands at each stair of the line; then they go back to work. (Double never moves anyone.)
  const home = homes.get(s);
  if (plan !== 'double' && home && s.day < T.seasonDays) {
    const at = (d, p) => d.post.f === p.f && Math.abs(d.post.x - p.x) <= 3;
    const onLine = (d) => LINE.some((st) => at(d, st));
    const busy = new Set();
    for (const m of n.foes) {
      const tg = m.type === 'maw' && m.target;
      if (tg) for (const d of s.shades) if (d.post.f === tg.f && (tg.kind === 'candle' ? Math.abs(d.post.x - tg.x) <= 8 : roomAt(G, d.post.f, d.post.x) === tg.id)) busy.add(d.id);
    }
    if (n.tides.some((tt) => s.t >= tt - 50 && s.t <= tt + 350)) {
      for (const st of LINE) {
        if (s.shades.filter((d) => canWork(d) && at(d, st)).length >= 2) continue;
        // Only from the stair's own room: nobody crosses a dark floor, or climbs the tide's way, to get there.
        const d = s.shades
          .filter((x) => canWork(x) && !onLine(x) && !busy.has(x.id) && !x.grabbedBy && !x.climb && x.memory > 30 && fighter(x) >= 0.8 && roomAt(G, x.post.f, x.post.x) === roomAt(G, st.f, st.x))
          .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
        if (d) safeMove(s, lightMap(G, T, n.candles), d, st.f, st.x + 2);
      }
    } else {
      for (const d of s.shades.filter(canWork)) {
        const h = home.get(d.id);
        if (h && onLine(d) && !LINE.some((st) => at({ post: h }, st))) safeMove(s, lightMap(G, T, n.candles), d, h.f, h.x);
      }
    }
  }
  // The last tide of the two biggest nights before the new moon: ward the stairs of the line if the
  // Choir has sung enough essence, beyond what the new moon needs to ward every stair against the Hollow.
  // Warded stairs turn the whole tide back. (Spending that reserve lost the Hollow's night: in season 2 the
  // Hollow got through 50 times in 180 with it spent, 11 without.)
  const last = n.tides[n.tides.length - 1];
  const unwarded = LINE.filter((st) => st.id && !n.wards.includes(st.id));
  const reserve = G.stairs.length * wardCost(s);
  if (plan !== 'double' && s.day >= T.seasonDays - 2 && s.day < T.seasonDays && s.t >= last - 60 && s.t <= last && unwarded.length && s.res.essence >= unwarded.length * wardCost(s) + reserve) {
    for (const st of unwarded) doAct(s, { type: 'ward', target: st.id });
  }
  // The Hollow: ward the stairs above it while the essence lasts, and meet it with fighters near the top.
  const h = n.foes.find((f) => f.type === 'hollow');
  if (h && !h.climb) {
    const up = G.stairs.filter((st) => st.f === h.f && !n.wards.includes(st.id));
    if (h.f < G.veil && up.length && s.res.essence >= up.length * wardCost(s)) for (const st of up) doAct(s, { type: 'ward', target: st.id });
    if (h.f === G.veil) {
      for (const d of s.shades.filter((x) => canWork(x) && fighter(x) >= 1 && x.memory > 30 && !x.grabbedBy && !x.climb)) {
        if (d.f !== h.f || Math.abs(d.x - h.x) > 6) doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x + (d.x < h.x ? -5.5 : 5.5) });
      }
    }
  }
}

/* ---------------------------------------------------------------- dawn */

function rite(s, plan) {
  const T = s.tuning;
  const I = s.inspection;
  const inspectedToday = I && !I.done && I.day === s.day + 1;
  const soon = s.day + 1 === T.firstInspection && !s.inspections.some((x) => x.season === s.season);
  const inquired = ritePreview(s).inquisition; // the inquisitor inspects again tomorrow
  const target = plan === 'keeper' ? T.dreadMax - 1 : plan === 'mourner' ? 1 : inspectedToday || soon || inquired ? 1 : 3;
  for (const d of s.shades) {
    const cs = choicesFor(d);
    if (d.kind === 'wraith') doAct(s, { type: 'rite', id: d.id, choice: s.res.essence >= T.banishCost ? 'banish' : 'leave' });
    else if (d.kind === 'restless') doAct(s, { type: 'rite', id: d.id, choice: 'release' });
    else doAct(s, { type: 'rite', id: d.id, choice: cs[0] });
  }
  // What a shade is worth keeping, per point of Dread it costs, by its trait: an Anchored one lasts, a
  // Reckless one burns out, a Hoarding one costs a candle a night, a Keening one matters when the Restless
  // wait, a Wistful one sends good dreams, a Bitter one costs double Dread.
  const restless = s.shades.some((x) => x.kind === 'restless');
  const value = (d) => {
    const S = ST(s, d);
    let v = worker(d) * d.memory + (d.named ? 40 : 0);
    if (S?.fade) v *= S.fade < 1 ? 1.4 : 0.8;
    if (S?.work) v *= S.work;
    if (S?.pockets) v *= s.res.candles < 8 ? 0.5 : 0.8;
    if (S?.calms && restless) v *= 1.5;
    if (S?.dreams) v *= 1.5;
    return v / (S?.dread ?? 1);
  };
  const keep = s.shades.filter(canWork).sort((a, b) => value(a) - value(b));
  let P = ritePreview(s);
  while (P.dread.to > target && keep.length && plan !== 'keeper') {
    doAct(s, { type: 'rite', id: keep.shift().id, choice: 'cover' });
    P = ritePreview(s);
  }
  // The dead's requests.
  for (const [id, k] of Object.entries(s.rite.asks || {})) {
    const d = s.shades.find((x) => x.id === id);
    if (!d || !canWork(d) || s.rite.choice[id] === 'cover') continue;
    const last = (d.refused || 0) >= T.refusals - 1;
    const spare = s.res.remembrance + ritePreview(s).rem - ritePreview(s).remCost;
    let yes;
    if (REFUSE) yes = false;
    else if (GRANT) yes = true;
    else if (k === 'release') yes = last;
    else if (k === 'gate') yes = last || (!NOGATE && (!!T.raidDays[s.day + 1] || besieged({ ...s, day: s.day + 1 })));
    else if (k === 'name') yes = last || spare >= T.nameCost + 2;
    else yes = last || spare >= T.rememberCost + 1;
    doAct(s, { type: 'request', id, grant: yes });
  }
  P = ritePreview(s);
  let v = 0;
  while (P.dread.to > target && P.remCost + T.vigilCost <= s.res.remembrance + P.rem) {
    doAct(s, { type: 'vigils', n: ++v });
    P = ritePreview(s);
  }
  // Spend what's left on the shades that stay.
  const stay = [...P.keep].sort((a, b) => a.memory - b.memory);
  const spare = () => s.res.remembrance - ritePreview(s).remCost;
  for (const d of stay) if (d.memory < 50 && spare() >= T.rememberCost + 1) doAct(s, { type: 'remember', id: d.id });
  for (const d of [...stay].reverse()) if (!d.named && d.memory >= 60 && spare() >= T.nameCost + 2) doAct(s, { type: 'name', id: d.id });
  if (!doAct(s, { type: 'beginDay' })) {
    for (const d of s.shades) doAct(s, { type: 'rite', id: d.id, choice: choicesFor(d).includes('cover') ? 'keep' : 'release' });
    for (const id of Object.keys(s.rite.asks || {})) if (s.rite.asks[id] !== 'release') doAct(s, { type: 'request', id, grant: false });
    doAct(s, { type: 'vigils', n: 0 });
    doAct(s, { type: 'beginDay' });
  }
}

/* ---------------------------------------------------------------- the loop */

// The eclipse the autopilot has met with its night's posts and candles (round six): it meets one as it meets a
// night, at the sun's going dark, and tends it as it tends a night, while the day's moves go on. For measuring:
// AP_ECLIPSE=ignore leaves it be (the shades at last night's posts, no candles), and AP_SIDE=1 posts each
// shade bonded to one of the living in the twin of that one's room, side by side, off the line.
const metEclipse = new WeakMap();
const ECLIPSE = globalThis.process?.env?.AP_ECLIPSE || '';
const SIDE = !!globalThis.process?.env?.AP_SIDE;
function sideBySide(s) {
  const G = geo(s);
  const LINE = lineOf(s);
  for (const p of s.living) {
    const d = bondedShade(s, p);
    if (!d || !canWork(d) || !p.job || LINE.some((st) => d.post.f === st.f && Math.abs(d.post.x - st.x) <= 3)) continue;
    const r = roomsOf(G, p.job)[0];
    if (!r || postRoom(s, d) === p.job) continue;
    const x = Math.round((r.x0 + r.x1) / 2);
    if (!doAct(s, { type: 'move', id: d.id, f: r.f, x })) continue;
    if (s.res.candles > 2 && !s.night.candles.some((c) => c.f === r.f && roomAt(G, c.f, c.x) === r.id)) doAct(s, { type: 'candle', f: r.f, x });
  }
}
export function autoStep(s, plan = 'balanced') {
  const way = plan === 'double' ? 'balanced' : plan; // how the dead are treated
  if (s.phase === 'day') {
    if (s.eclipse && plan !== 'idle' && ECLIPSE !== 'ignore') {
      if (metEclipse.get(s) !== s.eclipse) {
        metEclipse.set(s, s.eclipse);
        placeNight(s, plan);
        if (SIDE) sideBySide(s);
      } else if (s.t % 10 === 0) tendNight(s, plan);
    }
    if (s.t % 50 === 0 || (s.raid?.warned && s.raid.state === 'coming' && !s.raid.ward)) dayMoves(s);
    if (s.raid && s.t % 5 === 0) raidMoves(s);
    if (s.visitors?.some((v) => v.here && !v.done)) visitorMoves(s, way);
    step(s);
  } else if (s.phase === 'dusk') {
    if (s.dusk.step === 'crypt') {
      funerals(s, way);
      doAct(s, { type: 'wake' });
    }
    if (plan !== 'idle' && s.night?.omens) doAct(s, { type: 'omen', i: pickOmen(s, plan) });
    if (plan !== 'idle') placeNight(s, plan);
    doAct(s, { type: 'startNight' });
  } else if (s.phase === 'night') {
    if (plan !== 'idle' && s.t % 10 === 0) tendNight(s, plan);
    step(s);
  } else if (s.phase === 'dawn') {
    rite(s, way);
  }
}

// Plays whole seasons; stops at the end of the last one (or when the keep falls).
export function runSeasonAuto(seed, { plan = 'balanced', seasons = 1, tuning = {} } = {}) {
  const s = newSeason(seed, tuning);
  for (let guard = 0; guard < 2e6; guard++) {
    if (s.phase === 'over') return s;
    if (s.phase === 'end') {
      if (s.season >= seasons) return s;
      act(s, { type: 'nextSeason' });
      continue;
    }
    autoStep(s, plan);
  }
  throw new Error('Autopilot ran away');
}
