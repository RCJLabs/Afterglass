// A scripted player for the season slice, for soak tests and balance runs. It plays through act() only,
// so everything it does is replayable. Plans differ in how they treat the dead:
//   keeper   keeps every shade it can, funerals only for the dead that would wake wrong
//   mourner  holds every funeral it can and covers shades whenever Dread climbs
//   balanced keeps shades while Dread allows, and aims low before an inspection
//   double   the balanced plan, but from the first Maw night it posts two fighters on each stair of the
//            line and never moves anyone: the static answer the Maws are meant to break
//   idle     works the day but leaves the night alone: no candles, no posts (a baseline)
//   human    the balanced plan as a person plays it, with a person's lapses (HUMAN, below)
// All but double and idle react at night: a second fighter to each stair of the line for each tide, a ward
// on the line for the biggest tides when the essence is there, and a fighter to meet a Maw. They move a
// shade only along a lit floor; where its way is dark it stays.

import { nightTicks, hollowNeed, chapterOf, yearsEnd, bondedShade, postRoom, bareHalls, buildSpot, raiseCost, step, act, newSeason, ritePreview, crossingPreview, capacity, canWork, defense, funeralCap, choicesFor, jobCap, jobCount, eatRate, wardCost, livingTrait, shadeTrait, peopleIn, crowded, tradeOf, inGreatGlass, handsAt, seasonIndex, tributeOf, besieged, sallyOdds, embargoed, inquisition, crusadeDaysLeft, canAct, actOf, actCost, NEW_ROOMS, atTheGate, gatehouseOf, decreeOf, undergateMouth, roomReady, isGuard, armsCap, musterGain, livingCap, raidsAhead, nextRank, studyRem, standingOf, standingCost, nightsLeft, undergateOpen, mirrorGlass as mirrorGlassOf } from './sim.js';
import { DAY_ROOMS, MIRRORS, KINDS, MAP, TICKS_PER_SEC, VISITORS, STUDIES, CHAPTERS } from './data.js';
import { geo, roomSpan, roomAt, roomsOf, lineSpots, lightMap, isLit } from './geo.js';
import { STOPS } from './alerts.js';

export const PLANS = ['balanced', 'keeper', 'mourner', 'double', 'idle', 'human'];

// The human plan (round seven, phase 6): the balanced player with a person's lapses. It looks at the night only
// every HUMAN.every ticks, so it reacts up to that late; on HUMAN.lapse of nights it looks away once, for
// HUMAN.lapseSecs, somewhere in the night; and it doesn't read the forecast: it sends a second fighter to the
// line only once a tide is in the Tain, never wards ahead of the biggest tides, and takes the first omen it's
// offered. By day it answers the gate as slowly. These numbers are guesses until playtest trails can set them.
// Its lapses come from the keep's seed and the day, never the game's own dice, so the keep plays the same
// underneath.
const envNum = (k, d) => (globalThis.process?.env?.[k] !== undefined ? Number(globalThis.process.env[k]) : d);
export const HUMAN = {
  every: envNum('AP_HUMANEVERY', 30),
  raidEvery: envNum('AP_HUMANRAID', 20),
  lapse: envNum('AP_HUMANLAPSE', 0.5),
  lapseSecs: envNum('AP_HUMANLAPSESECS', 10),
  forecast: !!globalThis.process?.env?.AP_HUMANFORECAST, // reads the forecast after all (to measure what not reading it costs)
  // The page stops the clock for raids, catches, the Hollow, the great tide and the like (Settings, on by default),
  // and a person looks then, lapse or no lapse (round seven, phase 8). AP_HUMANNOPAUSE=1 plays as if it didn't.
  pauses: !globalThis.process?.env?.AP_HUMANNOPAUSE,
};
// Whether something that stops the page's clock was called out since the plan last looked.
const seenAlerts = new WeakMap();
function newStop(s) {
  const from = Math.min(seenAlerts.get(s) ?? 0, s.alerts.length);
  seenAlerts.set(s, s.alerts.length);
  for (let i = from; i < s.alerts.length; i++) if (STOPS.has(s.alerts[i].kind)) return true;
  return false;
}
// AP_LAPSES=1 gives any plan the human plan's lapses (to compare Double with the human at a person's pace).
const LAPSES = !!globalThis.process?.env?.AP_LAPSES;
const lapsing = (plan) => plan === 'human' || LAPSES;
function hash01(...xs) {
  let h = 2166136261;
  for (const x of xs) for (const ch of `${x}|`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
// Whether the human is looking away right now: at most once a night.
function lapsed(s) {
  if (hash01(s.seed, s.season, s.day, 'lapse') >= HUMAN.lapse) return false;
  const len = HUMAN.lapseSecs * TICKS_PER_SEC;
  const from = Math.floor(hash01(s.seed, s.season, s.day, 'from') * Math.max(1, nightTicks(s) - len));
  return s.t >= from && s.t < from + len;
}

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
// Verbs the autopilot never used until round seven, phase 6, each off by default, to measure what it's worth:
// AP_HUSH=1 hushes the night while shades stand in the dark with the Unlit close and no candle to spare, and
// ends it when none do; AP_BIND=1 binds a Restless shade into a free mirror, when the essence can be spared,
// rather than releasing it; AP_CURFEW=1 proclaims the curfew from the Hall once sleepwalkers or Weepers can come,
// unless the larder needs rationing; AP_COURT=1 seats a shade in the Court of Shades, lit, on a night before a
// rite where one of the dead will ask. The Keeper is AP_ENDING=watch, and building by choice AP_TALL=line.
const HUSH = !!globalThis.process?.env?.AP_HUSH;
const BIND = !!globalThis.process?.env?.AP_BIND;
const CURFEW = !!globalThis.process?.env?.AP_CURFEW;
const COURT = !!globalThis.process?.env?.AP_COURT;
// Round seven, phase 7. AP_NOTHIN=1 reinforces the line as before thinStair, at each stair around each tide (to
// measure what meeting the tide where it rose is worth); AP_LUREHOLLOW=1 gives a shade a lantern on the new moon
// and leads the Hollow away from the mirrors with it, where the Hollow hunts lanterns.
const NOTHIN = !!globalThis.process?.env?.AP_NOTHIN;
const LUREHOLLOW = !!globalThis.process?.env?.AP_LUREHOLLOW;
// AP_LANTERNMAW=1 takes a lantern to meet a Maw going for a room across the dark, where a Maw left unmet ruins
// the room (it cost the store: 17 keeps of 48 finished the first year with it, 31 without). AP_MAWLINE=1 also
// sends a fighter from the line, once no Creeper is still climbing (12 of 48). AP_WATCH=1 sets the night at dusk
// and then only watches: nothing is done in the night at all, the plan phase 7 asks reacting to beat.
const LANTERNMAW = !!globalThis.process?.env?.AP_LANTERNMAW;
const MAWLINE = !!globalThis.process?.env?.AP_MAWLINE;
const WATCH = !!globalThis.process?.env?.AP_WATCH;
// Round seven, phase 8: meeting the Hollow. Rather than ward it at the foot of the keep, the reacting plans let it
// climb to the line, hold it at the line's stair with a ward, and send up to three fighters to strike it there,
// when the store can't hold it at the foot until dawn anyway, or when three fighters could cut it down in 15
// seconds (need+weak:15, the default), and in a campaign's fourth year until it has been driven back once, the
// chapter's goal. AP_MEETHOLLOW=1 always meets it, =need or =weak (weak:10 for 10 seconds) only then, and =off
// never does, as before. Decided once, when it rises. Double never meets it.
const MEETHOLLOW = globalThis.process?.env?.AP_MEETHOLLOW || 'need+weak:15';
const meets = new WeakMap(); // night -> whether this night's Hollow is met at the line
function meetHollow(s, h, plan) {
  const n = s.night;
  if (MEETHOLLOW === 'off' || plan === 'double') return false;
  if (meets.has(n)) return meets.get(n);
  const T = s.tuning;
  const LINE = lineOf(s);
  const off = s.shades.filter((d) => canWork(d) && fighter(d) >= 1 && d.memory > 50 && !LINE.some((st) => d.post.f === st.f && Math.abs(d.post.x - st.x) <= 3));
  const dps = off.map((d) => fighter(d) * T.fightDps).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const modes = MEETHOLLOW.split(/[+,]/);
  const weak = modes.find((m) => m.startsWith('weak'));
  const secs = weak && weak.includes(':') ? Number(weak.split(':')[1]) : 10;
  // A campaign's fourth year asks for it driven back once: until it has been, every one of its nights.
  const goal = chapterOf(s) === 4 && !s.days.some((d) => d.night?.hollow === 'driven back' && Math.ceil(d.season / 4) === Math.ceil(s.season / 4));
  const yes = modes.includes('1') || goal || (modes.includes('need') && s.res.essence < hollowNeed(s).essence) || (!!weak && h.max <= dps * secs);
  meets.set(n, yes);
  return yes;
}
const RUINCANDLE = !!globalThis.process?.env?.AP_RUINCANDLE;
const NOBRACE = !!globalThis.process?.env?.AP_NOBRACE;
const NOWISP = !!globalThis.process?.env?.AP_NOWISP;
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
// AP_JIT=1 plays raids the way round seven's audit found paid best: everyone at work until the Host is at the
// gate, then every hand it can spare into the Barracks and the Gatehouse, and back to work after (to measure
// what guarding costs, before muster and after).
const JIT = !!globalThis.process?.env?.AP_JIT;
const jitPosted = new WeakSet();
// AP_LEDGERBLIND=1 keeps Dread as it did before the Church kept a ledger: low only on the eve of an inspection
// (to measure what the ledger costs a keep that doesn't heed it).
const LEDGERBLIND = !!globalThis.process?.env?.AP_LEDGERBLIND;
// AP_DREADLOW=1 holds Dread at 1 through those days with the ledger off too (to measure what the answer is worth
// on its own, apart from the rule).
const DREADLOW = !!globalThis.process?.env?.AP_DREADLOW;
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
// Round seven, phase 12: once the build list stands, a keep whose beds hold its living (bedsHold) grows. It
// raises another room of a kind whose places are all wanted (a Hearth when the cooks can't feed everyone, a
// Chandlery when the chandlers can't keep up), and, while the keep is full, Quarters for four more, up to
// GROW_QUARTERS of them. AP_NOGROW=1 stops at the list, as before (to measure what growing is worth).
const NOGROW = !!globalThis.process?.env?.AP_NOGROW;
const GROW_QUARTERS = 3;
// A keep seven floors high with glass piling up (lampworks) raises a Lampworks on top: its lampwrights work the
// glass into candles, and its twin is lit without one. AP_NOLAMP=1 raises none (to measure what it's worth).
const NOLAMP = !!globalThis.process?.env?.AP_NOLAMP;
const LAMP_GLASS = 40;
function growBuild(s) {
  if (NOGROW || !buildSpot(s)) return null;
  const T = s.tuning;
  const want = wantedJobs(s, true);
  for (const k of ['hearth', 'chandlery', 'chapel']) if (want[k] > jobCap(s, k)) return k;
  if (T.bedsHold && s.living.length >= livingCap(s) && roomsOf(geo(s), 'quarters').length < GROW_QUARTERS) return 'quarters';
  if (T.lampworks && !NOLAMP && geo(s).n + 1 >= T.highFrom && !roomsOf(geo(s), 'lampworks').length && s.res.glass >= LAMP_GLASS) return 'lampworks';
  return null;
}
function nextBuild(s) {
  const want = {};
  for (const type of BUILD_ORDER) {
    if (type === 'quarters' && (NOQUARTERS || !crowded(s))) continue;
    if (NEW_ROOMS.includes(type) && (!s.tuning[type] || NO(type.toUpperCase()))) continue;
    if (!roomReady(s, type)) continue;
    // The Gatehouse waits until there's a bare hall to move a room into, to make it room at the gate.
    if (type === 'gatehouse' && !gatehouseOf(s) && !gateSpot(s) && !bareHalls(s).length) continue;
    want[type] = (want[type] || 0) + 1;
    if (roomsOf(geo(s), type).length < want[type]) return type;
  }
  return growBuild(s);
}

// Candles to keep in store: with the year on, more put by through summer and autumn for winter's long nights
// and the Long Night.
const CANDLES_BY = [8, 16, 26, 26];
const candleTarget = (s) => (s.tuning.year ? CANDLES_BY[seasonIndex(s)] : 8);

// Stone for repairs (round seven, phase 12): a mend for each room broken or burned and one more in hand, and
// the gate's missing quarters while the season has raids to come.
const NOMEND = !!globalThis.process?.env?.AP_NOMEND;
function mendNeed(s) {
  const T = s.tuning;
  if (!T.repairs || NOMEND) return 0;
  const rooms = new Set([...(s.scorched || []), ...(s.haunted || [])]).size;
  const gate = raidsAhead(s) ? Math.ceil((1 - (s.gate ?? 1)) / T.raidShore - 1e-9) * T.raidShoreCost : 0;
  return T.mendStone * (rooms + 1) + gate;
}
// The glass the Lampworks leaves in store: enough for the mirror the dead will want next.
const glassKeep = (s) => (s.tuning.glassHalls ? MIRRORS.hall.glass : MIRRORS.pier.glass) + 10;
// uncapped: what's wanted before the rooms there are to work in (growBuild's measure).
function wantedJobs(s, uncapped = false) {
  const n = s.living.length;
  const r = s.raid;
  // With guards mustering, a threat doesn't empty the workrooms into the Barracks: staff() posts just enough
  // (below), and they stay posted.
  const threat = !JIT && !s.tuning.muster && r && (r.state === 'coming' || r.state === 'assault') && r.warned && defense(s) < r.strength;
  const food = eatRate(s) + (s.res.food < n ? 2 : 0) - (s.res.food > 3 * n ? 3 : 0);
  const want = {
    hearth: Math.max(1, Math.ceil(food / DAY_ROOMS.hearth.rate)),
    chapel: n >= 10 ? 2 : 1,
    infirmary: s.living.some((p) => p.sick > 0) ? 1 : 0,
    chandlery: threat ? 0 : s.res.candles < candleTarget(s) ? 2 : 1,
    glazier: threat || n < 6 ? 0 : 1,
    library: !threat && s.study && s.res.food >= n ? 2 : 0,
    // Lampwrights while the glass beyond a hall's worth (or a pier glass's, with halls off) lasts.
    lampworks: !threat && s.res.glass > glassKeep(s) ? Math.min(3, Math.floor((s.res.glass - glassKeep(s)) / 5)) : 0,
    yard: uncapped ? 0 : !threat && ((nextBuild(s) && s.res.stone < s.tuning.roomStone) || s.res.stone < mendNeed(s)) ? 1 : 0,
  };
  // Nobody can work a room that isn't built.
  if (!uncapped) for (const k of Object.keys(want)) want[k] = Math.min(want[k], jobCap(s, k));
  return want;
}

function staff(s) {
  const want = wantedJobs(s);
  // On a raid day a guard taken off the post musters again from nothing (muster): take others first, and until
  // the Host is gone, nobody posted leaves the post.
  const keepPosted = s.tuning.muster && !!s.raid && !JIT;
  const holding = keepPosted && s.raid.warned && (s.raid.state === 'coming' || s.raid.state === 'assault');
  const order = ['hearth', 'chapel', 'infirmary', 'chandlery', 'glazier', 'library', 'lampworks', 'yard'];
  const count = Object.fromEntries(order.map((k) => [k, 0]));
  const free = [];
  for (const p of s.living) {
    if (p.age === 'child') continue; // too young to work
    if (holding && isGuard(p)) continue;
    if (p.job in count && count[p.job] < want[p.job]) count[p.job]++;
    else free.push(p);
  }
  // Keep the old at the Chapel and the sick out of the barracks where there's a choice.
  free.sort((a, b) => (a.age === 'old') - (b.age === 'old'));
  for (const k of order) {
    while (count[k] < want[k] && free.length) {
      // The usual pick, unless someone else's trait suits the job better.
      const ok = (q) => !keepPosted || !isGuard(q) || free.every(isGuard);
      let i = k === 'chapel' ? free.length - 1 : 0;
      while (!ok(free[i])) i = k === 'chapel' ? i - 1 : i + 1;
      for (const [j, q] of free.entries()) if (ok(q) && fit(s, q, k) > fit(s, free[i], k) + 1e-9) i = j;
      const [p] = free.splice(i, 1);
      if (p.job !== k) doAct(s, { type: 'assign', id: p.id, room: k });
      count[k]++;
    }
  }
  free.sort((a, b) => fit(s, b, 'barracks') - fit(s, a, 'barracks')); // the Brave to the gate first, Cowards last
  // The rest hold the gate on a raid day, or when there's nothing to build, as many as the barracks hold;
  // everyone else quarries stone.
  // The Gatehouse first: its guards count for more, and throw down the ladders.
  const gate = !JIT && (!!s.raid || !nextBuild(s));
  // The Forge's arms (forgeArms): on a day with no raid, once the keep is built (a hand taken from the Yard
  // while it was still building cost more first years than the arms won), as many smiths as the Forge holds
  // while the store is short of an arm for each guard's post.
  if (s.tuning.forgeArms && !s.raid && !nextBuild(s) && (s.arms || 0) + 1 <= armsCap(s) && !NO('ARMS')) {
    const smiths = jobCap(s, 'forge');
    const at = free.filter((p) => p.job === 'forge');
    for (const p of free.filter((q) => q.job !== 'forge')) if (at.length < smiths) at.push(p);
    for (const p of at.slice(0, smiths)) {
      free.splice(free.indexOf(p), 1);
      if (p.job !== 'forge') doAct(s, { type: 'assign', id: p.id, room: 'forge' });
    }
  }
  for (const p of free) {
    const room = !gate ? 'yard' : p.job === 'gatehouse' || jobCount(s, 'gatehouse') < jobCap(s, 'gatehouse') ? 'gatehouse' : p.job === 'barracks' || jobCount(s, 'barracks') < jobCap(s, 'barracks') ? 'barracks' : 'yard';
    if (p.job !== room) doAct(s, { type: 'assign', id: p.id, room });
  }
  // With guards mustering, the Host on the road and the gate short, counting the guards still taking their
  // places: post just enough more, from the work the keep can best spare.
  const r = s.raid;
  if (holding && r.warned && r.state === 'coming') {
    const spare = ['yard', 'lampworks', 'library', 'glazier', 'chandlery', 'chapel', 'infirmary', 'hearth', null];
    while (defense(s) + musterGain(s) + EPS < r.strength) {
      const room = jobCount(s, 'gatehouse') < jobCap(s, 'gatehouse') ? 'gatehouse' : jobCount(s, 'barracks') < jobCap(s, 'barracks') ? 'barracks' : null;
      const p = s.living.filter((q) => !isGuard(q) && !q.fighting && !q.walls && !(q.sick > 0) && q.age !== 'child').sort((a, b) => spare.indexOf(a.job) - spare.indexOf(b.job) || fit(s, b, 'barracks') - fit(s, a, 'barracks'))[0];
      if (!room || !p || !doAct(s, { type: 'assign', id: p.id, room })) break;
    }
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
    const best = defense(s) + musterGain(s) + (r.ward ? 0 : s.res.essence >= T.wardGateCost ? T.wardGateDefense : 0) + hands * T.raidBellDefense + pitchable(s.res.candles);
    if (best + EPS < r.strength) {
      const t = tributeOf(s);
      if (TRIBUTE && s.res.food >= t.food + eatRate(s) && s.res.candles >= t.candles + PITCH_KEEP) doAct(s, { type: 'payOff' });
      else if (!r.barred && !NO('BAR')) doAct(s, { type: 'barStores' });
    }
  } else if (r.state === 'assault') {
    if (JIT && !jitPosted.has(r)) {
      jitPosted.add(r);
      const order = ['yard', 'lampworks', 'library', 'glazier', 'chandlery', 'chapel', 'infirmary', 'hearth', null];
      const hands = s.living.filter((p) => !isGuard(p) && !p.fighting && !p.walls && !(p.sick > 0) && p.age !== 'child').sort((a, b) => order.indexOf(a.job) - order.indexOf(b.job));
      for (const k of ['gatehouse', 'barracks']) while (hands.length && jobCount(s, k) < jobCap(s, k)) doAct(s, { type: 'assign', id: hands.shift().id, room: k });
    }
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
    const rooms = [r && r.state === 'coming' && defense(s) + musterGain(s) < r.strength ? 'barracks' : null, s.res.candles < 10 ? 'chandlery' : null, 'chapel', 'glazier', 'hearth'].filter(Boolean);
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
// The Library: begin the next study when the remembrance is there, keeping a vigil's worth back; with every
// first rank learned, the second ranks in the same order (round seven, phase 12). AP_NOTWO=1 stops at the
// first ranks (to measure what the second are worth).
const STUDY_ORDER = ['masonry', 'tallow', 'wards', 'hollow', 'pitch', 'herbs', 'silvering', 'rites'];
const NOTWO = !!globalThis.process?.env?.AP_NOTWO;
function libraryMoves(s) {
  if (!s.tuning.library || s.study || !roomsOf(geo(s), 'library').length) return;
  const id = STUDY_ORDER.find((k) => nextRank(s, k) === 1) || (NOTWO ? null : STUDY_ORDER.find((k) => nextRank(s, k) === 2));
  if (!id) return;
  const rank = nextRank(s, id);
  if (s.res.remembrance >= studyRem(s, id, rank) + s.tuning.vigilCost) doAct(s, { type: 'study', id, ...(id === 'rites' && rank === 1 ? { kind: 'loyal' } : {}) });
}
// Standing wards (round seven, phase 12): essence the store would spill buys one, once it holds standFull of
// its cap and keeps the new moon's back after paying. The Undergate first once it can stir (it saves the
// candle at its mouth), then the moat in a wet season (spring and autumn). AP_STAND=none sets none; rift
// adds a ward on the right-hand rift after those, every Creeper then rising at the left.
const STAND = globalThis.process?.env?.AP_STAND || 'auto';
const STAND_FULL = 0.8;
function standMoves(s) {
  const T = s.tuning;
  if (!T.standingWard || STAND === 'none' || !T.essenceCap) return;
  const want = [undergateOpen(s) && 'undergate', T.rainChance[seasonIndex(s)] >= 0.2 && 'moat', STAND === 'rift' && MAP.rifts.at(-1).id].filter(Boolean);
  for (const w of want) {
    if (standingOf(s).includes(w)) continue;
    const cost = standingCost(s);
    if (s.res.essence < STAND_FULL * T.essenceCap || s.res.essence - cost < moonReserve(s)) return;
    doAct(s, { type: 'standWard', target: w });
  }
}
// The Hall: a levy while raids are still to come this season and there's food for it; rationing when the larder
// runs low; else nothing, and no price.
function hallMoves(s) {
  if (!s.tuning.hall || decreeOf(s) || s.decree?.season === s.season || !roomsOf(geo(s), 'hall').length) return;
  const raids = Object.entries(s.tuning.raidDays).some(([d, b]) => Number(d) >= s.day && b);
  if (s.res.food < eatRate(s)) doAct(s, { type: 'decree', id: 'rationing' });
  else if (CURFEW && s.tuning.curfew && ((s.tuning.errands && s.day >= s.tuning.sleepFrom - 1) || (s.tuning.dreamwell && s.tuning.weepersMax))) doAct(s, { type: 'decree', id: 'curfew' });
  else if (raids && s.res.food >= 3 * eatRate(s)) doAct(s, { type: 'decree', id: 'levy' });
}

// Mending (round seven, phase 12): a burned-out room first, then a haunted one (a Dread at every dawn), then
// the gate while the season has raids to come, as far as the stone goes.
function mendMoves(s) {
  const T = s.tuning;
  if (!T.repairs || NOMEND) return;
  for (const id of [...new Set([...(s.scorched || []), ...(s.haunted || [])])]) if (s.res.stone >= T.mendStone && !s.fires.some((f) => f.room === id)) doAct(s, { type: 'mend', id });
  while (raidsAhead(s) && (s.gate ?? 1) < 1 - 1e-9 && s.res.stone >= T.raidShoreCost && s.raid?.state !== 'assault') if (!doAct(s, { type: 'mend', id: 'gate' })) break;
}

// The great-glass hall (round seven, phase 12): with four shades or more and no hall with room, glass to spare
// builds one, the newly dead are bound into it first, and they fade half as fast there; with quicksilver from
// the Deep, a great glass grows into one instead. AP_NOGLASSHALL=1 builds none (to measure what one is worth).
const NOGLASSHALL = !!globalThis.process?.env?.AP_NOGLASSHALL;
function hallMirror(s) {
  const T = s.tuning;
  if (!T.glassHalls || NOGLASSHALL || embargoed(s) || s.shades.filter(canWork).length < 4) return;
  if (s.mirrors.some((m) => m.type === 'hall' && !m.hidden && s.shades.filter((d) => d.mirror === m.id).length < MIRRORS.hall.cap)) return;
  const great = s.mirrors.find((m) => m.type === 'great');
  if (great && (s.res.quicksilver || 0) >= T.upgradeSilver.hall && s.res.glass >= T.upgradeGlass.hall && doAct(s, { type: 'upgradeMirror', id: great.id })) return;
  if (s.res.glass >= mirrorGlassOf(s, MIRRORS.hall.glass) + 10) doAct(s, { type: 'build', mirror: 'hall' });
}

function dayMoves(s) {
  mendMoves(s);
  const b = nextBuild(s);
  const lineHall = TALLLINE && b === 'chapel' && bareHalls(s).find((h) => h.f === geo(s).veil - 1);
  const at = TALL ? (lineHall ? lineHall.id : 'top') : undefined;
  if (b === 'gatehouse') raiseGatehouse(s);
  else if (b && s.res.stone >= raiseCost(s, buildSpot(s, at))) doAct(s, { type: 'raise', room: b, ...(at ? { at } : {}) });
  libraryMoves(s);
  hallMoves(s);
  standMoves(s);
  // With guards mustering, the ward first, while the essence is there, and then only the guards still wanted
  // (before muster the ward came after the guards, who could be sent back to work the moment it stood).
  const w = s.raid;
  if (s.tuning.muster && w?.warned && w.state === 'coming' && !w.ward && defense(s) + musterGain(s) < w.strength) doAct(s, { type: 'wardGate' });
  if (s.raid?.state !== 'assault') staff(s); // nobody leaves the walls while the Host is at the gate
  if (!NOSALLY && besieged(s) && s.raid?.state !== 'assault' && sallyOdds(s) >= SALLY_AT && s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0)).length >= 2) doAct(s, { type: 'sally' });
  const r = s.raid;
  if (r && (r.state === 'coming' || r.state === 'assault') && r.warned && !r.ward && defense(s) + (r.state === 'coming' ? musterGain(s) : 0) < r.strength) doAct(s, { type: 'wardGate' });
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
  hallMirror(s);
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
  // A second price in glass or remembrance (payInKind), taken when the store can spare it: glass beyond a hand
  // mirror's worth, remembrance beyond a vigil's.
  const kind = (id, n) => {
    const A = VISITORS[v.kind].answers.find((a) => a.id === id);
    if (!A || (A.rule && !T[A.rule])) return false;
    const [[res]] = Object.entries(A.cost);
    return s.res[res] - n >= (res === 'glass' ? MIRRORS.hand.glass : T.vigilCost);
  };
  switch (v.kind) {
    case 'peddler': return spare(6) && s.res.glass < MIRRORS.pier.glass ? 'buy' : 'no';
    case 'chandler': return s.res.candles >= candleTarget(s) ? 'no' : kind('glass', 3) ? 'glass' : spare(6) ? 'buy' : 'no';
    case 'grain': return food < 1.5 * larder && s.res.glass >= 4 ? 'buy' : 'no';
    case 'mason': return !nextBuild(s) || s.res.stone >= T.roomStone ? 'no' : kind('glass', 2) ? 'glass' : spare(4) ? 'hire' : 'no';
    case 'mirrors': return capacity(s).free > 1 ? 'no' : kind('glass', 4) ? 'glass' : spare(8) ? 'buy' : 'no';
    case 'pilgrims': return spare(0) || (r?.state === 'coming' && defense(s) + musterGain(s) < r.strength) ? 'take' : 'no';
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
    case 'deserter': return spare(1) && (!s.raid || s.raid.state !== 'coming' || defense(s) + musterGain(s) + 3 >= 1.2 * s.raid.strength) ? 'take' : 'no';
    case 'almoner': return s.dread < ((T.churchLedger || DREADLOW) && !LEDGERBLIND ? 1 : 2) ? 'no' : kind('pray', 2) ? 'pray' : spare(5) ? 'give' : 'no';
    case 'witch': return s.dread >= 3 ? 'church' : s.res.candles < candleTarget(s) && s.res.glass >= 3 + MIRRORS.hand.glass ? 'charm' : 'no';
    case 'physician': return s.res.glass >= 4 && (s.living.filter((p) => p.sick > 0).length >= 2 || !jobCount(s, 'infirmary')) ? 'pay' : 'no';
    case 'priest': return spare(2) ? 'feed' : 'no';
    case 'reeve': return kind('glass', 3) ? 'glass' : spare(6) ? 'pay' : 'no';
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
  // The Court of Shades (AP_COURT): the weakest fighter left sits in the Hall's twin, lit, when one of the dead
  // will ask at the next rite, so the request is heard free.
  if (COURT && T.hall && T.requests && ds.length >= 2 && roomsOf(G, 'hall').length && s.shades.some((d) => canWork(d) && !d.granted && d.nights + 1 >= T.askAfter)) {
    const d = ds.pop();
    const { f, x0, x1 } = roomSpan(G, 'hall');
    const x = Math.round((x0 + x1) / 2);
    doAct(s, { type: 'move', id: d.id, f, x });
    if (s.res.candles > 1 && !lit.has(roomAt(G, f, x))) doAct(s, { type: 'candle', f, x: x + 3 });
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
// The essence kept back, late in a season, for the new moon: a ward on every stair, or, where wards draw on
// the essence to hold the Hollow, what holding it off until dawn will take, as much of it as the store holds.
const moonReserve = (s) => {
  const every = geo(s).stairs.length * wardCost(s);
  if (!s.tuning.wardDraw) return every;
  const need = Math.max(every, hollowNeed(s).essence);
  return s.tuning.essenceCap ? Math.min(need, s.tuning.essenceCap) : need;
};
function meetDrowned(s, ds) {
  const T = s.tuning;
  const G = geo(s);
  const lit = new Set();
  const sp = s.night.spawns.find((x) => x.type === 'drowned');
  mirrorGuard.delete(s);
  if (DROWN === 'none' || !sp || s.night.wards.includes('moat')) return lit; // a standing ward holds the moat
  const reserve = DROWN === 'ward' || s.day < T.seasonDays - 2 ? 0 : moonReserve(s);
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
  if (!g || G.n === 1 || !s.night.spawns.some((x) => x.rift === 'undergate') || s.night.wards.includes('undergate')) return;
  const { x } = undergateMouth(g);
  if (globalThis.process?.env?.AP_UGFREE) doAct(s, { type: 'debug', what: 'give', res: 'candles', n: 1 }); // measuring only: the candle free
  if (s.res.candles >= 1 + (NO('UGCANDLE') ? Infinity : 0) && doAct(s, { type: 'candle', f: g.f, x })) {
    lit.add(roomAt(G, g.f, x));
    return;
  }
  const reserve = s.day < T.seasonDays - 2 ? 0 : moonReserve(s);
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
// A lantern for a dark way where lanterns are on and the store can spare one: with AP_LANTERNMOVE for any move,
// and with AP_LANTERNMAW (round seven, phase 7) for going to meet a Maw.
function safeMove(s, L, d, f, x, urgent = false) {
  if (NOMOVE) return false;
  if (RECKLESS) return doAct(s, { type: 'move', id: d.id, f, x });
  const lit = d.f === f && litAll(L, f, d.x, x);
  const carried = s.night.candles.some((k) => k.carrier === d.id);
  if (!lit && !carried) {
    const lantern = (LANTERNMOVE && s.res.candles >= 4) || (urgent && LANTERNMAW && s.res.candles >= 2);
    if (!lantern || !s.tuning.lanterns || !doAct(s, { type: 'lantern', id: d.id })) return false;
  }
  return doAct(s, { type: 'move', id: d.id, f, x });
}

// The Hollow led away (AP_LUREHOLLOW): the strongest shade off the line takes a lantern and keeps to the far end
// of the Hollow's own floor, where the Hollow can reach it past the wards on the stairs above, so the Hollow
// walks after it rather than battering a ward and drawing on the essence. Cornered, it slips up the nearest
// stair and comes back down once the Hollow has turned away.
function leadHollow(s, h) {
  const n = s.night;
  const G = geo(s);
  const LINE = lineOf(s);
  const k = n.candles.find((c) => c.carrier && s.shades.some((d) => d.id === c.carrier));
  let d = k && s.shades.find((x) => x.id === k.carrier);
  if (!d || !canWork(d)) {
    d = s.shades
      .filter((x) => canWork(x) && !x.grabbedBy && !x.climb && x.memory > 50 && !LINE.some((st) => x.post.f === st.f && Math.abs(x.post.x - st.x) <= 3))
      .sort((a, b) => b.memory - a.memory)[0];
    if (!d || s.res.candles < (s.tuning.lanternCost ?? 1) + 1 || !doAct(s, { type: 'lantern', id: d.id })) return;
  } else if (k.wax < 8 && s.res.candles >= (s.tuning.lanternCost ?? 1)) {
    doAct(s, { type: 'lantern', id: d.id }); // set the spent one down
    doAct(s, { type: 'lantern', id: d.id }); // and take up another
  }
  if (d.climb || h.climb) return;
  const far = h.x < MAP.W / 2 ? MAP.RIGHT - 7 : MAP.LEFT + 6;
  if (d.f === h.f) {
    if (Math.abs(d.x - h.x) < 18) {
      const up = G.stairs.filter((st) => st.f === h.f).sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
      if (up && d.post.f !== h.f + 1) doAct(s, { type: 'move', id: d.id, f: h.f + 1, x: up.x });
    } else if (Math.abs(d.post.x - far) > 4 || d.post.f !== h.f) doAct(s, { type: 'move', id: d.id, f: h.f, x: far });
  } else if (d.post.f !== h.f && (d.f !== h.f + 1 || Math.abs(d.x - h.x) > 30)) doAct(s, { type: 'move', id: d.id, f: h.f, x: far });
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
  // Round seven, phase 9: with the store out of candles, a wisp at a dark stair of the line, from essence the new
  // moon won't want (late in a season, what holding the Hollow off will take stays back). AP_NOWISP=1 doesn't.
  if (T.wisp && !NOWISP && s.res.candles < 1) {
    const keep = s.day >= T.seasonDays - 2 ? moonReserve(s) : 0;
    for (const st of LINE) if (!lit(st.f, st.x) && s.res.essence - keep >= T.wispCost) doAct(s, { type: 'wisp', f: st.f, x: st.x });
  }
  const inRoom = (f, x) => n.candles.some((c) => c.f === f && roomAt(G, c.f, c.x) === roomAt(G, f, x) && c.wax > 15);
  const run = runners.get(s)?.night === n ? runners.get(s) : null;
  const out = new Set(run ? [...run.by.values(), ...run.home] : []);
  // Before the Long Night's last great tide (phase 8), keep candles back for the line, a stair's worth each.
  const keep = !NOBRACE && n.great && s.t < n.great ? 1 + LINE.length : 1;
  for (const d of s.shades.filter(canWork)) {
    const { f, x } = d.post;
    if (!out.has(d.id) && f !== LINE[0].f && !inRoom(f, x) && s.res.candles > keep) doAct(s, { type: 'candle', f, x });
  }
  // AP_HUSH: hush while shades stand in the dark with the Unlit close and no candle to spare; end it when none do.
  if (HUSH) {
    const L = lightMap(G, T, n.candles);
    const danger = s.res.candles < 1 && s.shades.some((d) => canWork(d) && !d.grabbedBy && !d.climb && !isLit(L, d.f, d.x) && n.foes.some((u) => u.type === 'creeper' && u.f === d.f && Math.abs(u.x - d.x) <= 10));
    if (danger !== !!n.hush) doAct(s, { type: 'hush', on: danger });
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
    // Where a Maw left unmet ruins the room it broke (round seven, phase 7): AP_LANTERNMAW and AP_MAWLINE, above.
    const forRoom = T.mawRuin > 0 && t.kind === 'room';
    const calm = MAWLINE && forRoom && !n.foes.some((u) => u.type === 'creeper' && u.temper === 'climb' && u.mode !== 'idle' && u.mode !== 'flee');
    const help = s.shades
      .filter((d) => canWork(d) && !near.includes(d) && !d.grabbedBy && !d.climb && d.memory > 30 && (calm || !LINE.some((st) => d.post.f === st.f && d.post.x === st.x)) && mirrorGuard.get(s) !== d.id)
      .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory - 0.01 * (Math.abs(a.x - m.x) + 30 * Math.abs(a.f - m.f) - Math.abs(b.x - m.x) - 30 * Math.abs(b.f - m.f)))[0];
    if (!help || (help.post.f === t.f && Math.abs(help.post.x - t.x) <= 8)) continue;
    const x = m.ruining ? m.x + (help.x < m.x ? -2 : 2) : t.x + (help.x < t.x ? -2 : 2);
    if (!safeMove(s, lightMap(G, T, n.candles), help, t.f, x, forRoom)) continue;
    // Don't send anyone to stand in the dark: light the spot, with the last candle if need be.
    if (!n.candles.some((c) => c.f === t.f && roomAt(G, c.f, c.x) === roomAt(G, t.f, x) && Math.abs(c.x - x) <= 12 && c.wax > 15)) doAct(s, { type: 'candle', f: t.f, x });
  }
  // A Maw ruining a room (phase 7, where mawRuin is set, with ruinLight): AP_RUINCANDLE=1 lights a candle in the
  // room to hold the ruin while the Maw tears it down, wax ÷ mawSmash seconds a candle, with a fighter on the way
  // or when the store can hold it off until dawn with two candles to spare. It cost keeps (problem 50).
  if (plan !== 'double' && T.ruinLight && RUINCANDLE) {
    for (const m of n.foes.filter((u) => u.type === 'maw' && u.ruining)) {
      if (n.candles.some((c) => c.f === m.f && !c.carrier && c.wax > 0 && roomAt(G, c.f, c.x) === m.ruining)) continue;
      const x = [m.x + 2, m.x - 2, m.x].find((xx) => roomAt(G, m.f, xx) === m.ruining);
      const coming = s.shades.some((d) => canWork(d) && d.post.f === m.f && roomAt(G, d.post.f, d.post.x) === m.ruining);
      const per = T.candleWax / T.mawSmash;
      const need = Math.ceil((nightTicks(s) - s.t) / TICKS_PER_SEC / per);
      if (x !== undefined && (coming || need <= s.res.candles - 2)) doAct(s, { type: 'candle', f: m.f, x });
    }
  }
  // The tides, announced at dusk: from a few seconds before each until it has spent itself, a second fighter
  // from the rooms stands at each stair of the line; then they go back to work. (Double never moves anyone.)
  const home = homes.get(s);
  // (Not on the new moon, whose tides the Hollow's wards used to shut out, unless those wards now hold only it.)
  if (plan !== 'double' && home && (s.day < T.seasonDays || T.hollowWardOnly)) {
    const at = (d, p) => d.post.f === p.f && Math.abs(d.post.x - p.x) <= 3;
    const onLine = (d) => LINE.some((st) => at(d, st));
    const busy = new Set();
    for (const m of n.foes) {
      const tg = m.type === 'maw' && m.target;
      if (tg) for (const d of s.shades) if (d.post.f === tg.f && (tg.kind === 'candle' ? Math.abs(d.post.x - tg.x) <= 8 : roomAt(G, d.post.f, d.post.x) === tg.id)) busy.add(d.id);
    }
    // Between tides, everyone back to their own posts: a second fighter from the line to its room, and a line
    // fighter that went to meet a Maw (phase 7) back to its stair once no Maw needs it.
    const goHome = () => {
      for (const d of s.shades.filter(canWork)) {
        const h = home.get(d.id);
        if (!h) continue;
        if (onLine(d) && !LINE.some((st) => at({ post: h }, st))) safeMove(s, lightMap(G, T, n.candles), d, h.f, h.x);
        else if (!onLine(d) && !busy.has(d.id) && LINE.some((st) => at({ post: h }, st))) safeMove(s, lightMap(G, T, n.candles), d, h.f, h.x, true);
      }
    };
    // The human doesn't read the tides' times: it reinforces once one is in the Tain.
    const tide = plan === 'human' && !HUMAN.forecast ? n.foes.some((u) => u.type === 'creeper') : n.tides.some((tt) => s.t >= tt - 50 && s.t <= tt + 350);
    // Round seven, phase 7: where a tide goes for the thinner stair, a second fighter set before it rises only
    // sends it to the other one. So hold one to a stair until it's up, then send help to the side it's climbing.
    const rising = T.thinStair ? n.foes.filter((u) => u.type === 'creeper' && u.temper === 'climb' && u.f <= LINE[0].f && !u.grabbed) : [];
    // The Long Night's last great tide (phase 8) is announced at dusk and on the clock: brace for it, a second
    // fighter to each stair before it rises, as for every tide before the thin stair (AP_NOBRACE=1 doesn't).
    const bracing = !NOBRACE && n.great && s.t >= n.great - 80 && s.t <= n.great + 400;
    if (T.thinStair && !NOTHIN && !bracing) {
      if (rising.length) {
        const mid = MAP.W / 2;
        const left = rising.filter((u) => u.x < mid).length >= rising.length / 2;
        const st = LINE.find((p) => p.x < mid === left) || LINE[0];
        if (s.shades.filter((d) => canWork(d) && at(d, st)).length < 2) {
          const d = s.shades
            .filter((x) => canWork(x) && !onLine(x) && !busy.has(x.id) && !x.grabbedBy && !x.climb && x.memory > 30 && fighter(x) >= 0.8 && mirrorGuard.get(s) !== x.id)
            .sort((a, b) => Math.abs(a.x - st.x) + 30 * Math.abs(a.f - st.f) - (Math.abs(b.x - st.x) + 30 * Math.abs(b.f - st.f)))[0];
          if (d) safeMove(s, lightMap(G, T, n.candles), d, st.f, st.x + (st.x < mid ? 2 : -2));
        }
      } else {
        goHome();
      }
    } else if (tide || bracing) {
      for (const st of LINE) {
        if (s.shades.filter((d) => canWork(d) && at(d, st)).length >= 2) continue;
        // Only from the stair's own room: nobody crosses a dark floor, or climbs the tide's way, to get there.
        const d = s.shades
          .filter((x) => canWork(x) && !onLine(x) && !busy.has(x.id) && !x.grabbedBy && !x.climb && x.memory > 30 && fighter(x) >= 0.8 && roomAt(G, x.post.f, x.post.x) === roomAt(G, st.f, st.x))
          .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
        if (d) safeMove(s, lightMap(G, T, n.candles), d, st.f, st.x + 2);
      }
    } else goHome();
  }
  // The last tide of the two biggest nights before the new moon: ward the stairs of the line if the
  // Choir has sung enough essence, beyond what the new moon needs to ward every stair against the Hollow.
  // Warded stairs turn the whole tide back. (Spending that reserve lost the Hollow's night: in season 2 the
  // Hollow got through 50 times in 180 with it spent, 11 without.)
  const last = n.tides[n.tides.length - 1];
  const unwarded = LINE.filter((st) => st.id && !n.wards.includes(st.id));
  const reserve = moonReserve(s);
  if (plan !== 'double' && (plan !== 'human' || HUMAN.forecast) && s.day >= T.seasonDays - 2 && s.day < T.seasonDays && s.t >= last - 60 && s.t <= last && unwarded.length && s.res.essence >= unwarded.length * wardCost(s) + reserve) {
    for (const st of unwarded) doAct(s, { type: 'ward', target: st.id });
  }
  // The Hollow: ward the stairs above it while the essence lasts, and meet it with fighters near the top.
  // AP_HOLLOWGOAL=1 leaves it unwarded on spring's new moon in a campaign's fourth year, for the chapter's goal.
  const h = n.foes.find((f) => f.type === 'hollow');
  if (LUREHOLLOW && h && T.hollowLure && T.lanterns) leadHollow(s, h);
  if (h && !h.climb) {
    const up = G.stairs.filter((st) => st.f === h.f && !n.wards.includes(st.id));
    // AP_MEETHOLLOW: no ward below the line's floor, so it climbs to the line; there, a ward holds it at the stair
    // while every fighter strikes it.
    const meet = meetHollow(s, h, plan);
    const goal = (HOLLOWGOAL && chapterOf(s) === 4 && seasonIndex(s) === 0) || (meet && h.f < G.veil - 1);
    if (!goal && h.f < G.veil && up.length && s.res.essence >= up.length * wardCost(s)) for (const st of up) doAct(s, { type: 'ward', target: st.id });
    else if (!goal && h.f < G.veil && up.length && T.wardDraw) {
      // Short of essence for every way up, the nearest first: it has to go round to the other, which is time.
      for (const st of up.sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))) if (s.res.essence >= wardCost(s)) doAct(s, { type: 'ward', target: st.id });
    }
    if (h.f === G.veil) {
      for (const d of s.shades.filter((x) => canWork(x) && fighter(x) >= 1 && x.memory > 30 && !x.grabbedBy && !x.climb)) {
        if (d.f !== h.f || Math.abs(d.x - h.x) > 6) doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x + (d.x < h.x ? -5.5 : 5.5) });
      }
    } else if (meet && h.f === G.veil - 1 && h.batter) {
      // Held at a stair of the line: up to three strong fighters off the line go to stand 5.5 from it, in reach
      // and past its drain, once; the line's own stay at their stairs.
      const onLine = (d) => LINE.some((st) => d.post.f === st.f && Math.abs(d.post.x - st.x) <= 3);
      const near = s.shades.filter((d) => canWork(d) && d.f === h.f && Math.abs(d.x - h.x) <= 7 && !onLine(d));
      const go = s.shades
        .filter((x) => canWork(x) && !near.includes(x) && !onLine(x) && fighter(x) >= 1 && x.memory > 50 && !x.grabbedBy && !x.climb && mirrorGuard.get(s) !== x.id)
        .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)
        .slice(0, Math.max(0, 3 - near.length));
      for (const d of go) doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x + (d.x < h.x ? -5.5 : 5.5) });
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
  // With the Church's ledger, every day before the season's first inspection counts, not only its eve.
  const ledger = (T.churchLedger || DREADLOW) && !LEDGERBLIND && s.day + 1 <= T.firstInspection && !s.inspections.some((x) => x.season === s.season);
  const target = plan === 'keeper' ? T.dreadMax - 1 : plan === 'mourner' ? 1 : inspectedToday || soon || inquired || ledger ? 1 : 3;
  for (const d of s.shades) {
    const cs = choicesFor(d);
    if (d.kind === 'wraith') doAct(s, { type: 'rite', id: d.id, choice: s.res.essence >= T.banishCost ? 'banish' : 'leave' });
    else if (d.kind === 'restless') doAct(s, { type: 'rite', id: d.id, choice: BIND && cs.includes('bind') && capacity(s).free > 0 && s.res.essence >= T.bindCost + moonReserve(s) ? 'bind' : 'release' });
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
const HOLLOWGOAL = !!globalThis.process?.env?.AP_HOLLOWGOAL;
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
  const stopped = lapsing(plan) && HUMAN.pauses && newStop(s); // the clock stopped: a person looks now
  if (s.phase === 'day') {
    if (s.eclipse && plan !== 'idle' && ECLIPSE !== 'ignore') {
      if (metEclipse.get(s) !== s.eclipse) {
        metEclipse.set(s, s.eclipse);
        placeNight(s, plan);
        if (SIDE) sideBySide(s);
      } else if (s.t % (lapsing(plan) ? HUMAN.every : 10) === 0 || stopped) tendNight(s, plan);
    }
    if (s.t % 50 === 0 || (s.raid?.warned && s.raid.state === 'coming' && !s.raid.ward)) dayMoves(s);
    if (s.raid && (s.t % (lapsing(plan) ? HUMAN.raidEvery : 5) === 0 || stopped)) raidMoves(s);
    if (s.visitors?.some((v) => v.here && !v.done)) visitorMoves(s, way);
    step(s);
  } else if (s.phase === 'dusk') {
    if (s.dusk.step === 'crypt') {
      funerals(s, way);
      doAct(s, { type: 'wake' });
    }
    if (plan !== 'idle' && s.night?.omens) doAct(s, { type: 'omen', i: plan === 'human' && !HUMAN.forecast ? 0 : pickOmen(s, plan) });
    if (plan !== 'idle') placeNight(s, plan);
    doAct(s, { type: 'startNight' });
  } else if (s.phase === 'night') {
    if (plan !== 'idle' && !WATCH && ((s.t % (lapsing(plan) ? HUMAN.every : 10) === 0 && !(lapsing(plan) && lapsed(s))) || stopped)) tendNight(s, plan);
    step(s);
  } else if (s.phase === 'dawn') {
    rite(s, way);
  }
}

// A year's end: a campaign's years 1 to 4 close by rule (round six), the lasting help unless AP_CLOSE=goods; the
// fifth's ending, and the open year's, are the player's, unless AP_ENDING names one (seal, open or watch, which
// plays on). Unnamed, the open year's watch goes on. Returns whether it went on.
const CLOSE = globalThis.process?.env?.AP_CLOSE || 'help';
const ENDING = globalThis.process?.env?.AP_ENDING || '';
export function closeYear(s) {
  const k = chapterOf(s);
  if (!yearsEnd(s)) return false;
  if (k && k < 5) {
    const c = CHAPTERS[k].close;
    return doAct(s, { type: 'closeChapter', id: (CLOSE === 'goods' ? c.find((x) => x.gain) : c.find((x) => !x.gain)).id });
  }
  const type = { seal: 'sealVeil', open: 'openVeil', watch: 'takeGlass' }[ENDING];
  return !!type && doAct(s, { type }) && ENDING === 'watch';
}

// Plays whole seasons; stops at the end of the last one (or when the keep falls, or a campaign ends).
export function runSeasonAuto(seed, { plan = 'balanced', seasons = 1, tuning = {} } = {}) {
  const s = newSeason(seed, tuning);
  for (let guard = 0; guard < 2e6; guard++) {
    if (s.phase === 'over') return s;
    if (s.phase === 'end') {
      if (s.season >= seasons) return s;
      // A year's end is closed first (a chapter, or an ending AP_ENDING names); otherwise the watch goes on.
      if (!closeYear(s) && !act(s, { type: 'nextSeason' }).ok) return s;
      continue;
    }
    autoStep(s, plan);
  }
  throw new Error('Autopilot ran away');
}
