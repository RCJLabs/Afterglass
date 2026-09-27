// The weeks 7–10 slice: one season in one keep. Pure and deterministic like the greyboxes: one JSON
// state, step() is one fixed tick, act() one player action, replay() rebuilds a session.
//
// The day runs the weeks 1–2 rules (the living, deaths by cause, the crypt, raids). The night runs the
// weeks 3–4 engine on the same keep's Tain (candles, Creepers, holding the light), with a job in each
// twin room. Dawn joins the weeks 1–2 rite to the weeks 3–4 fading. On top: a seven-day season with
// escalating raids, the Lantern Church's inspections, and the Hollow on the night of the new moon.

import {
  TICKS_PER_SEC, TUNING, DAY_ROOMS, WORK_ROOMS, TWINS, MAP, KINDS, WORKING, CAUSES, GUIDE_UP,
  MIRRORS, START_MIRRORS, MIRROR_PLACES, CAST, BONDS, START_SHADES, BOND_OTHER, NAMES, RAIDER_NAMES, BUILDABLE, TRAITS, TRAIT_KEYS, SHADE_TRAITS, SEASONS,
  TUTORIAL, REQUESTS, ACTS, OMENS,
} from './data.js';
import {
  geo, FULL_KEEP, startKeep, lineSpots, MAX_FLOORS, roomsOf, roomAt, roomSpan, typeOf, typeAt, lightMap, isLit, spanAt, darkBetween, darkRooms, darkGaps, route, firstLight, fleePath, touching,
  mirrorGoals, GNAW_GAP, DEEP_FLOOR, guardLit,
} from './geo.js';
import { rand, randInt, pick, chance } from '../rng.js';

export const SAVE_VERSION = 1;
const EPS = 1e-9;
const DT = 1 / TICKS_PER_SEC;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
export const fmt = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const listNames = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const byId = (list, id) => list.find((x) => x.id === id);
// The year: which season (0 spring to 3 winter; always spring with year off), how long its days and
// nights run, and the Long Night that ends it.
export const seasonIndex = (s) => (s.tuning.year ? (s.season - 1) % SEASONS.length : 0);
export const seasonName = (s) => SEASONS[seasonIndex(s)];
export const yearOf = (s) => Math.floor((s.season - 1) / SEASONS.length) + 1;
export const dayLength = (s) => (s.tuning.year ? s.tuning.seasonDay[seasonIndex(s)] : 1);
export const isNewMoon = (s) => s.day >= s.tuning.seasonDays;
export const isLongNight = (s) => !!s.tuning.year && seasonIndex(s) === 3 && isNewMoon(s);
const nightLength = (s) => (s.tuning.year ? s.tuning.seasonNight[seasonIndex(s)] * (isLongNight(s) ? s.tuning.longNight : 1) : 1);
export const dayTicks = (s) => Math.round(s.tuning.daySecs * dayLength(s) * TICKS_PER_SEC);
export const nightTicks = (s) => Math.round(s.tuning.nightSecs * nightLength(s) * TICKS_PER_SEC);
export const perf = (d) => 0.4 + (0.6 * Math.max(0, d.memory)) / 100;
export const hard = (s, k = 'hardness') => {
  const T = s.tuning;
  // With the year on, a season's place in its year, and the year: each year yearHardness harder (Maws aside).
  if (T.year && T.yearHardness) return Math.pow(T[k], seasonIndex(s)) * (k === 'hardness' ? Math.pow(T.yearHardness, yearOf(s) - 1) : 1);
  return Math.pow(T[k], s.season - 1);
};
// The tutorial keep's script for today and tonight, while it lasts (its first three days), and whether the
// Veil is still kept from breaking.
export const tutorialDay = (s) => (s.tuning.tutorial && s.season === 1 ? TUTORIAL.days[s.day] || null : null);
export const tutorialNight = (s) => (s.tuning.tutorial && s.season === 1 ? TUTORIAL.nights[s.day] || null : null);
export const veilKept = (s) => !!s.tuning.tutorial && s.season === 1 && s.day < TUTORIAL.safeUntil;
// Each season its own trouble: summer's plague and autumn's siege, with the year on.
// The year's end: after the Long Night, before the next season, unless the Veil was sealed.
export const yearsEnd = (s) => s.phase === 'end' && !!s.tuning.year && seasonIndex(s) === 3 && !s.sealed;
export const plagueSeason = (s) => !!s.tuning.plague && !!s.tuning.year && seasonIndex(s) === 1;
export const besieged = (s) => !!s.siege && !s.siege.broken && s.day >= s.siege.from && s.day <= s.siege.until;
export const sallyOdds = (s) => (s.siege ? clamp(defense(s) / (s.tuning.sallyOdds * s.siege.strength), 0.1, 0.9) : 0);
// Weather (round five): today's, which holds through the night after it, and tomorrow's, known a day ahead.
// Every day is clear with the weather off.
export const weatherOf = (s) => (s.tuning.weather ? s.weather || 'clear' : 'clear');
export const forecastOf = (s) => (s.tuning.weather ? s.forecast || null : null);
export const raining = (s) => weatherOf(s) === 'rain';
export const foggy = (s) => weatherOf(s) === 'fog';
// The Lantern Church's escalation: a day's number across seasons, and whether its embargo or its Inquisition
// stands today.
const dayNo = (s) => (s.season - 1) * s.tuning.seasonDays + s.day;
// Days the embargo, or the Inquisition, has left after today.
export const churchDaysLeft = (s, what = 'embargo') => Math.max(0, (s.church?.[what] || 0) - dayNo(s));
export const embargoed = (s) => !!s.tuning.church && !!s.church?.embargo && dayNo(s) <= s.church.embargo;
export const inquisition = (s) => !!s.tuning.church && !!s.church?.inquisition && dayNo(s) <= s.church.inquisition;
// The day's number a crusade comes on, if one is proclaimed (0 if not); and whether today is that day.
export const crusadeDay = (s) => (s.tuning.church && s.tuning.crusade && s.church?.crusade) || 0;
export const crusadeDue = (s) => crusadeDay(s) > 0 && dayNo(s) === crusadeDay(s);
export const crusadeDaysLeft = (s) => Math.max(0, crusadeDay(s) - dayNo(s));
// How many of the Drowned come up on a rainy night: as many in a later season as in the first.
export const drownedCount = (s) => s.tuning.drownedBase + Math.floor(s.day / s.tuning.drownedEvery);
// Whether they come on a rainy night (tonight's, or tomorrow's): not on the new moon, which belongs to the
// Hollow, as for the Maws, except the Long Night.
export function drownedDue(s, tomorrow = false) {
  const T = s.tuning;
  const day = s.day + (tomorrow ? 1 : 0);
  return day !== T.seasonDays || (!!T.year && seasonIndex(s) === 3);
}
// Traits (data.js): what a living one's trait does by day, and a shade's by night, while traits are on.
export const livingTrait = (s, p) => (s.tuning.traits && p.trait ? TRAITS[p.trait] : null);
export const shadeTrait = (s, d) => (s.tuning.traits && d.trait ? SHADE_TRAITS[d.trait] : null);
// A newcomer's trait comes from their name and the seed, not from the random stream, so a seed brings the
// same raids, sickness and arrivals whether traits are on or off.
export function traitFor(s, name) {
  let h = (2166136261 ^ s.seed) >>> 0;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return TRAIT_KEYS[(h >>> 0) % TRAIT_KEYS.length];
}

/* ---------------------------------------------------------------- setup */

export function newSeason(seed = Date.now() >>> 0, overrides = {}) {
  const tuning = { ...TUNING, ...overrides, raidDays: { ...TUNING.raidDays, ...(overrides.raidDays || {}) } };
  const s = {
    v: SAVE_VERSION,
    mode: 'season',
    seed: seed >>> 0,
    rng: seed >>> 0,
    tuning,
    tuning0: JSON.parse(JSON.stringify(tuning)),
    season: 1,
    day: 1,
    phase: 'day', // day → dusk (paused) → night → dawn (the rite, paused) → day …; 'end' after the new moon; 'over' if lost
    t: 0,
    rev: 0,
    res: { food: tuning.startFood, candles: tuning.startCandles, glass: tuning.startGlass, essence: 0, remembrance: 0, stone: tuning.startStone },
    // The keep's layout, top floor first. Never changed in place: building replaces it.
    keep: { floors: startKeep(tuning.startFloors).floors.map((fl) => fl.map((r) => ({ ...r }))) },
    steel: false,
    haunted: [], // rooms (ids) a Maw broke last night, haunted until dusk
    badLuck: 0, // unlucky days to come, from a broken mirror
    fires: [], // rooms burning today: { room, heat, full }
    scorched: [], // rooms (ids) burned out yesterday, dead until dusk
    dreamt: 0, // a Wistful shade's good dreams: what the living work at the day after, or 0
    dread: 0,
    cracks: 0,
    living: [],
    bodies: [],
    shades: [],
    mirrors: [],
    raid: null,
    events: [],
    heal: 0,
    hungry: false,
    starve: 0,
    guidance: 0,
    watchBonus: 0,
    inspection: null,
    inspections: [],
    dusk: null,
    night: null,
    rite: null,
    over: null,
    nextId: 1,
    used: [],
    log: [],
    alerts: [],
    actions: [],
    ledger: [],
    days: [],
    seasons: [],
    today: blankToday(),
  };
  const cast = {};
  for (const c of CAST) {
    const p = newPerson(s, c.name, c.age, roomsOf(geo(s), c.job).length ? c.job : 'yard', c.trait);
    s.living.push(p);
    cast[c.name] = p;
  }
  for (const [a, b, rel] of BONDS) bond(cast[a], cast[b], rel);
  if (tuning.tutorial) {
    const m = TUTORIAL.servant;
    s.living.push(newPerson(s, m.name, m.age, 'yard', m.trait));
  }
  for (const [type, place] of START_MIRRORS) addMirror(s, type, place);
  const line = lineSpots(geo(s));
  for (const [i, x] of START_SHADES.entries()) {
    const spot = line[i % line.length];
    const post = { f: spot.f, x: spot.x + (spot.x < MAP.W / 2 ? 2 : -2) }; // just inside the light, on the mirror's side
    const d = newShade(s, { id: 'p' + s.nextId++, name: x.name, kind: x.kind, cause: x.cause, from: 'living', day: 0, memory: x.memory, named: x.named, post, was: x.was });
    s.used.push(x.name);
    d.mirror = s.mirrors[0].id;
    if (x.bond) {
      // A bond's rel says what the partner is to this one: Osk's bond says Garrick is his parent.
      const p = cast[x.bond[0]];
      p.bond = { with: d.id, rel: x.bond[1] };
      d.bond = { with: p.id, rel: BOND_OTHER[x.bond[1]] };
    }
    s.shades.push(d);
    s.ledger.push({
      id: d.id, name: d.name, from: 'before', season: 0, day: 0, cause: x.cause, how: CAUSES[x.cause].text, kind: x.kind, guided: false, job: x.job,
      age: x.age, bond: x.bond ? { name: x.bond[0], rel: x.bond[1] } : null, woke: x.kind, end: null, endDay: null, nights: 0, kills: 0,
      posts: {}, named: x.named, memory: x.memory, was: x.was,
    });
  }
  rollDay(s);
  say(s, `Season 1, day 1. The new moon is ${tuning.seasonDays} days off. Anyone who dies inside the walls wakes at dusk as a shade.`, 'day');
  weatherNews(s);
  return s;
}

function blankToday() {
  return { made: {}, deaths: [], arrivals: [], raid: null, inspection: null, night: null };
}

function newPerson(s, name, age, job = null, trait = null) {
  if (!s.used.includes(name)) s.used.push(name);
  return { id: 'p' + s.nextId++, name, age, job, trait: trait || traitFor(s, name), bond: null, sick: 0, grief: null, peace: 0, joined: { season: s.season, day: s.day } };
}
function bond(a, b, rel) {
  a.bond = { with: b.id, rel };
  b.bond = { with: a.id, rel };
}
function freshName(s, list, r = s) {
  const free = list.filter((n) => !s.used.includes(n));
  const name = free.length ? pick(r, free) : `${pick(r, list)} ${s.nextId}`;
  s.used.push(name);
  return name;
}
function addMirror(s, type, place) {
  const m = { id: 'm' + s.nextId++, type, name: `${place} ${MIRRORS[type].name}` };
  s.mirrors.push(m);
  return m;
}
function nextPlace(s) {
  const taken = s.mirrors.map((m) => m.name.split(' ')[0]);
  return MIRROR_PLACES.find((p) => !taken.includes(p)) || `Mirror ${s.mirrors.length + 1}`;
}
function say(s, text, tone = '', alert = false) {
  s.log.push({ season: s.season, day: s.day, phase: s.phase, t: s.t, text, tone });
  if (s.log.length > 800) s.log.splice(0, s.log.length - 800);
  if (alert) s.alerts.push({ text, tone });
  s.rev++;
}
// Sounds and vibration: a side channel for the page, never read by the rules. It exists only while a page
// listens (the page sets s.cues to an array and empties it each frame), so replays, tests and the autopilot
// never fill it. A cue with a place (floor and x) can be panned to where it happened.
function cue(s, name, f, x) {
  if (s.cues && s.cues.length < 64) s.cues.push(f === undefined ? { name } : { name, f, x });
}
function gain(s, res, n) {
  s.res[res] = (s.res[res] || 0) + n; // quicksilver has no store until a shade first brings some back
  s.today.made[res] = (s.today.made[res] || 0) + n;
}

/* ---------------------------------------------------------------- derived values */

export const mirrorCap = (m) => MIRRORS[m.type].cap;
export const mirrorUse = (s, m) => s.shades.filter((d) => d.mirror === m.id).length;
export function capacity(s) {
  let cap = 0;
  let used = 0;
  for (const m of s.mirrors) {
    cap += m.hidden ? mirrorUse(s, m) : mirrorCap(m); // nobody new is bound into a hidden mirror
    used += mirrorUse(s, m);
  }
  return { cap, used, free: cap - used };
}
const freeMirror = (s) => s.mirrors.find((m) => !m.hidden && mirrorUse(s, m) < mirrorCap(m)) || null;
// A shade down in the Deep (from dusk to dawn) is out of the Tain for the night, and one in a mirror hidden
// from a crusade is out of everything until it's brought out.
export const canWork = (d) => !!d.mirror && WORKING.includes(d.kind) && !d.deep && !d.hidden;
// A shade's act (round six): which it has, whether it's at it now, and what it costs.
export const actOf = (d) => Object.keys(ACTS).find((k) => ACTS[k].kind === d.kind) || null;
export const acting = (s, d, what) => !!d.act && d.act.what === what && s.phase === 'night' && s.t < d.act.until;
export const actCost = (s, d) => {
  const a = actOf(d);
  return a ? Math.round(s.tuning.actCost[a] * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1) * 100) / 100 : 0;
};
// What an act does, in words, by this keep's numbers.
export function actText(T, a) {
  const times = (x) => (x === 2 ? 'twice' : `${x} times`);
  const share = T.kindleWax === 1 ? 'a whole candle' : T.kindleWax === 0.5 ? 'half a candle' : `${Math.round(100 * T.kindleWax)}% of a candle`;
  return {
    stand: `for ${T.actSecs.stand} seconds the light it stands in can't be gnawed, smashed or eaten, and it strikes ${times(T.standFight)} as hard`,
    kindle: T.kindleWax === 1 ? 'renews the candle it stands in, or lights one at its feet in the dark, free' : `adds ${share} to the candle it stands in, or lights that much of one at its feet in the dark, free`,
    pass: `for ${T.actSecs.pass} seconds the Unlit pass it by, and it slips any grip`,
    lure: `for ${T.actSecs.lure} seconds the Unlit on its floor nearby come for it, into its light if it stands in one`,
  }[a];
}
// Whether a shade could act now: tonight's act unspent, and memory to pay for it.
export const canAct = (s, d) => !!s.tuning.acts && s.phase === 'night' && canWork(d) && !!actOf(d) && !d.acted && !d.climb && d.memory > actCost(s, d) + EPS;
// The type of room a shade is posted in (its twin's type), or null.
export const postRoom = (s, d) => (d.post ? typeAt(geo(s), d.post.f, d.post.x) : null);
export const griefMult = (s, p) => (p.grief ? p.grief.mult : 1);
export const bondedShade = (s, p) => (p.bond ? byId(s.shades, p.bond.with) : null);
// A living worker and a bonded shade posted in the twin of the same room work x1.25, both of them.
// A Tireless shade never talks, so it never works as a twin, on either side.
export function isTwinnedLiving(s, p) {
  const d = bondedShade(s, p);
  return !!(d && p.job && canWork(d) && postRoom(s, d) === p.job && shadeTrait(s, d)?.twins !== false);
}
export function isTwinnedShade(s, d) {
  if (!d.bond || !canWork(d) || shadeTrait(s, d)?.twins === false) return false;
  const p = byId(s.living, d.bond.with);
  return !!(p && p.job && postRoom(s, d) === p.job);
}
export function livingMult(s, p) {
  if (!p.job) return 0;
  const T = s.tuning;
  let m = 1;
  if (p.sick > 0) m *= T.sickMult;
  if (s.hungry) m *= T.hungryMult;
  m *= griefMult(s, p);
  if (p.peace > 0) m *= T.peaceMult;
  if (isTwinnedLiving(s, p)) m *= T.twinMult;
  const L = livingTrait(s, p);
  if (L) m *= (L.any ?? 1) * (L.jobs?.[p.job] ?? L.other ?? 1) * (p.job === 'barracks' ? (L.guard ?? 1) : 1);
  if (s.dreamt) m *= s.dreamt; // good dreams, the day after
  if (p.nightmare) m *= T.nightmareMult;
  return m;
}
// What each room type makes today. Only as many work as its rooms hold, the strongest first and in the
// rooms that aren't haunted first; in a haunted room they make hauntWork of what they would. The rest of
// that job stand idle.
export function roomPower(s) {
  const out = Object.fromEntries(Object.keys(DAY_ROOMS).map((r) => [r, 0]));
  const by = {};
  const coached = whisperedTrades(s);
  for (const p of s.living) if (p.job && !p.fighting && !p.walls) (by[p.job] ||= []).push(livingMult(s, p) * (coached.has(p.job) ? s.tuning.whisperMult : 1));
  for (const d of s.shades) if (stepsThrough(s, d)) (by[d.byDay.room] ||= []).push(perf(d) * s.tuning.stepWork);
  if (storesBarred(s)) for (const k of BARRED) delete by[k];
  if (besieged(s)) delete by.yard; // the gate is shut: nobody quarries outside
  if (embargoed(s)) delete by.glazier; // no silver to be had
  for (const [job, ms] of Object.entries(by)) {
    const free = workCap(s, job);
    const all = jobCap(s, job) - (DAY_ROOMS[job]?.outdoors ? 0 : roomsOf(geo(s), job).filter((r) => isAblaze(s, r.id)).length * s.tuning.roomCap);
    if (ms.length > free) ms.sort((a, b) => b - a);
    for (let i = 0; i < ms.length && i < all; i++) out[job] += i < free ? ms[i] : ms[i] * s.tuning.hauntWork;
  }
  if (raining(s)) out.yard *= s.tuning.rainYard; // the Yard is outdoors
  return out;
}
export const defense = (s) => {
  const pw = roomPower(s);
  return pw.barracks * DAY_ROOMS.barracks.rate + pw.forge * DAY_ROOMS.forge.rate + (s.raid?.ward || 0) + (s.watchBonus || 0) + onWalls(s).length * s.tuning.raidBellDefense + gateGuard(s);
};
// The dead at the gate: Loyal shades granted their request stand guard by day at their night strength.
export const atGate = (s, d) => !!s.tuning.requests && canWork(d) && d.byDay?.how === 'gate';
export const gateGuard = (s) => s.shades.filter((d) => atGate(s, d)).reduce((a, d) => a + KINDS[d.kind].fight * perf(d) * DAY_ROOMS.barracks.rate, 0);
// A raid you fight: those the bell brought onto the walls, whether the stores are barred, and what the Host
// wants to turn back.
export const onWalls = (s) => s.living.filter((p) => p.walls);
const BARRED = ['hearth', 'chandlery', 'glazier'];
export const storesBarred = (s) => !!s.raid?.barred && s.raid.state === 'assault'; // the doors shut when the Host reaches the gate
export function tributeOf(s) {
  const r = s.raid;
  const T = s.tuning;
  return r ? { food: Math.ceil(r.strength * T.raidTributeFood), candles: Math.ceil(r.strength * T.raidTributeCandles) } : null;
}
// How many can work a job: roomCap in each room of its kind. The Yard is outdoors and holds any number.
export function jobCap(s, type) {
  if (DAY_ROOMS[type]?.outdoors) return Infinity;
  return roomsOf(geo(s), type).length * s.tuning.roomCap;
}
export const isHaunted = (s, id) => !!s.haunted?.includes(id);
// Beds: the keep sleeps baseBeds, and each Quarters more. More living than that sleep crowded.
export const beds = (s) => s.tuning.baseBeds + roomsOf(geo(s), 'quarters').length * s.tuning.quartersBeds;
export const crowded = (s) => !!s.tuning.dreamwell && s.living.length > beds(s);
// How many can work a job today in its rooms that aren't haunted.
export function workCap(s, type) {
  if (DAY_ROOMS[type]?.outdoors) return Infinity;
  return roomsOf(geo(s), type).filter((r) => !isHaunted(s, r.id) && !isAblaze(s, r.id)).length * s.tuning.roomCap;
}
// A room burning today, or burned out yesterday: nobody works in it.
export const isAblaze = (s, id) => !!(s.fires?.some((f) => f.room === id) || s.scorched?.includes(id));
export const jobCount = (s, type) => s.living.filter((p) => p.job === type).length;
// The dead by day. A shade whispers its old trade, or steps through a great glass to work a room in person.
export const whispers = (s, d) => !!s.tuning.whispers && canWork(d) && d.byDay?.how === 'whisper';
export const stepsThrough = (s, d) => !!s.tuning.whispers && canWork(d) && d.byDay?.how === 'step' && inGreatGlass(s, d);
export const inGreatGlass = (s, d) => byId(s.mirrors, d.mirror)?.type === 'great';
export const whisperedTrades = (s) => new Set(s.shades.filter((d) => whispers(s, d)).map((d) => tradeOf(s, d)));
// A shade's trade: the job it had in life (the keep's first dead have theirs in the ledger).
export const tradeOf = (s, d) => d.job || ledgerOf(s, d.id)?.job || null;
// Everyone at a job today, the living and the dead who stepped through.
export const handsAt = (s, type) => jobCount(s, type) + s.shades.filter((d) => stepsThrough(s, d) && d.byDay.room === type).length;
// A ward's price tonight: half while a Bitter shade stays in the glass.
export const wardCost = (s) => s.tuning.wardCost * (s.shades.some((d) => canWork(d) && shadeTrait(s, d)?.wards) ? SHADE_TRAITS.bitter.wards : 1);
// Where the next room goes: the top floor's bare hall if it has one, else a new floor on top.
export function nextSlot(s) {
  const keep = s.keep || FULL_KEEP;
  const i = keep.floors[0].findIndex((r) => r.type === 'empty');
  if (i >= 0) return { newFloor: false, f: 0, slot: i, id: keep.floors[0][i].id };
  return keep.floors.length >= MAX_FLOORS ? null : { newFloor: true, f: 0, slot: 0 };
}
// Every bare hall in the keep, top floor first: where a room can be built besides a new floor on top.
export const bareHalls = (s) => (s.keep || FULL_KEEP).floors.flatMap((fl, f) => fl.map((r, slot) => ({ ...r, f, slot })).filter((r) => r.type === 'empty'));
// What a room costs where it goes: a new floor takes floorStone more than a bare hall.
export const raiseCost = (s, spot) => s.tuning.roomStone + (spot?.newFloor ? s.tuning.floorStone || 0 : 0);
// Where a room built at `at` goes: a bare hall's id, 'top' for a new floor, or nothing for the default.
export function buildSpot(s, at) {
  const keep = s.keep || FULL_KEEP;
  if (!at) return nextSlot(s);
  if (at === 'top') return keep.floors.length >= MAX_FLOORS ? null : { newFloor: true, f: 0, slot: 0 };
  const h = bareHalls(s).find((r) => r.id === at);
  return h ? { newFloor: false, f: h.f, slot: h.slot, id: h.id } : null;
}
// Where a floor's twin stands in the Tain, for the player: the floor under the Veil (where the mirrors hang),
// the line's floor (at the feet of the stairs up to it), the deepest (where the rifts open), or between. The
// short form is for messages.
export function tainPlace(G, f, short = false) {
  const line = G.n > 1 && f === G.veil - 1;
  if (short) return G.n === 1 ? 'on the only floor' : f === G.veil ? 'under the Veil' : f === 0 ? (line ? "by the rifts, on the line's floor" : 'by the rifts') : line ? "on the line's floor" : 'under the line';
  if (G.n === 1) return 'the only floor, where the rifts and the mirrors both are';
  if (f === G.veil) return 'the floor under the Veil, where the mirrors hang, above the line';
  if (f === 0) return line ? 'the deepest floor, where the rifts open and the line is held' : 'the deepest floor, where the rifts open';
  return line ? "the line's floor, one below the Veil's" : `${G.veil - f} floors below the Veil's, under the line`;
}
export const priests = (s) => s.living.filter((p) => p.job === 'chapel').length;
export const funeralCap = priests;
export const eatRate = (s) => s.living.reduce((a, p) => a + (livingTrait(s, p)?.eats ?? 1), 0) * s.tuning.eatPerDay;
export const bear = (s) => Math.floor(s.living.length / s.tuning.dreadLivingPer) + priests(s);

/* ---------------------------------------------------------------- the clock */

export function step(s) {
  if (s.phase === 'day') dayTick(s);
  else if (s.phase === 'night') nightTick(s);
}

function dayTick(s) {
  const D = dayTicks(s);
  s.t++;
  const pw = roomPower(s);
  const len = dayLength(s); // a long summer day makes more, a short winter one less
  for (const r of WORK_ROOMS) {
    const R = DAY_ROOMS[r];
    if (R.out in s.res) gain(s, R.out, (pw[r] * R.rate * len) / D);
  }
  heal(s, (pw.infirmary * DAY_ROOMS.infirmary.rate * len) / D);
  eat(s, D);
  if (s.fires?.length) burn(s);
  if (s.raid?.state === 'assault') assaultTick(s);
  if (s.phase !== 'day') return;
  for (const p of [...s.living]) {
    if (s.phase !== 'day') return;
    if (p.peace > 0 && --p.peace === 0) s.rev++;
    if (p.sick > 0 && --p.sick <= 0) {
      p.sick = 0;
      kill(s, p, 'sickness');
    }
  }
  while (s.phase === 'day' && s.events.length && s.events[0].at <= s.t) fire(s, s.events.shift());
  if (s.phase === 'day' && s.t >= D) endDay(s);
}

function heal(s, amount) {
  const sick = s.living.filter((p) => p.sick > 0);
  if (!sick.length) {
    s.heal = 0;
    return;
  }
  s.heal += amount;
  while (s.heal >= 1 - EPS && sick.length) {
    sick.sort((a, b) => a.sick - b.sick);
    const p = sick.shift();
    p.sick = 0;
    s.heal -= 1;
    say(s, `${p.name} recovered in the infirmary.`, 'good');
    cue(s, 'good');
  }
}

function eat(s, D) {
  const need = eatRate(s) / D;
  if (s.res.food + EPS >= need) {
    s.res.food = Math.max(0, s.res.food - need);
    if (s.hungry && s.res.food >= 1) {
      s.hungry = false;
      s.starve = 0;
      say(s, 'There is food in the larder again.', 'good');
      cue(s, 'good');
    }
    return;
  }
  s.res.food = 0;
  if (!s.hungry) {
    s.hungry = true;
    say(s, 'The larder is empty. Everyone works hungry, and the weakest will starve.', 'bad', true);
    cue(s, 'warn');
  }
  s.starve += 1 / D;
  if (s.starve >= s.tuning.starveDays - EPS) {
    s.starve = 0;
    const score = (p) => (p.sick > 0 ? 0 : 10) + (p.age === 'old' ? 0 : p.age === 'child' ? 1 : p.age === 'young' ? 2 : 4);
    const v = [...s.living].sort((a, b) => score(a) - score(b))[0];
    if (v) kill(s, v, 'neglect');
  }
}

function rollDay(s) {
  const T = s.tuning;
  const D = dayTicks(s);
  s.events = [];
  s.raid = null;
  if (T.weather) rollWeather(s);
  const tut = tutorialDay(s);
  const base = tut ? tut.raid : T.raidDays[s.day];
  if (base) s.raid = newRaid(s, raidStrength(s, base), Math.round(T.raidWarnAt * D), Math.round(T.raidHitAt * D), !!tut);
  else if (besieged(s)) {
    // The camp outside comes at the gate on a day with no raid of its own: seen from the first light.
    s.raid = newRaid(s, s.siege.strength, Math.round(0.05 * D), Math.round(T.raidHitAt * D));
    s.raid.camp = true;
  }
  // The crusade's day: it comes at the gate in the raid's place, at the strength it was proclaimed with, seen
  // from the first light.
  if (crusadeDue(s)) {
    s.events = s.events.filter((e) => e.type !== 'raidWarn' && e.type !== 'raidHit');
    const C = s.church;
    s.raid = { strength: C.strength, count: Math.max(2, Math.round(C.strength / 2)), ward: 0, state: 'coming', warned: false, warnAt: Math.round(0.05 * D), hitAt: Math.round(T.raidHitAt * D), crusade: true };
    s.events.push({ at: s.raid.warnAt, type: 'raidWarn' }, { at: s.raid.hitAt, type: 'raidHit' });
  }
  // A broken mirror's bad luck: sickness more likely, from the same one throw of the dice.
  const luck = s.badLuck > 0 ? T.badLuck : 1;
  if (s.badLuck > 0) s.badLuck--;
  // The tutorial's days: its events, and nothing else.
  if (tut) {
    for (const e of tut.events) {
      const at = Math.round(e.at * D);
      if (e.type === 'oldage') {
        const p = s.living.find((x) => x.name === e.who);
        if (p) s.events.push({ at, type: 'oldage', id: p.id });
      } else if (e.type === 'fire') {
        const r = roomsOf(geo(s), e.room)[0];
        if (r) s.events.push({ at, type: 'fire', room: r.id, safe: true });
      } else s.events.push({ at, type: e.type });
    }
    if (s.inspection && !s.inspection.done && s.inspection.day === s.day) s.events.push({ at: Math.round(T.inspectAt * D), type: 'inspect' });
    s.events.sort((a, b) => a.at - b.at);
    return;
  }
  if (chance(s, Math.min(1, T.sickChance * luck * (crowded(s) ? T.crowdSick : 1)))) s.events.push({ at: Math.round((0.1 + rand(s) * 0.5) * D), type: 'sick' });
  for (const p of s.living) {
    if (p.age === 'old' && chance(s, T.oldAgeChance)) s.events.push({ at: Math.round((0.15 + rand(s) * 0.8) * D), type: 'oldage', id: p.id });
  }
  if (T.fire) {
    const hot = [...roomsOf(geo(s), 'hearth'), ...roomsOf(geo(s), 'forge')];
    if (chance(s, Math.min(1, T.fireChance * luck * (raining(s) ? T.rainFire : 1))) && hot.length) s.events.push({ at: Math.round((0.1 + 0.6 * rand(s)) * D), type: 'fire', room: pick(s, hot).id });
  }
  if (s.inspection && !s.inspection.done && s.inspection.day === s.day) s.events.push({ at: Math.round(T.inspectAt * D), type: 'inspect' });
  s.events.sort((a, b) => a.at - b.at);
}

// A random stream of a feature's own, from the seed, the season, the day and a tag: a feature rolled from one
// (the weather, the Drowned, errands, omens, generations) leaves every other roll where it was, on or off.
// ownStreams 0, a keep from before the weather and generations had theirs, rolls those from its own.
const ownStream = (s, tag) => (s.tuning.ownStreams ? sideStream(s, tag) : s);
function sideStream(s, tag) {
  let h = (2166136261 ^ s.seed) >>> 0;
  for (const v of [s.season, s.day, tag]) h = Math.imul(h ^ v, 16777619);
  return { rng: h >>> 0 };
}

// Today's weather is yesterday's forecast (a keep's first day is clear), and tomorrow's is rolled now, with
// tomorrow's season's odds, from the weather's own stream. The tutorial's days are clear.
function rollWeather(s) {
  const T = s.tuning;
  s.weather = s.forecast || 'clear';
  if (T.tutorial && s.season === 1 && TUTORIAL.days[s.day + 1]) {
    s.forecast = 'clear';
    return;
  }
  const si = T.year ? (seasonIndex(s) + (s.day >= T.seasonDays ? 1 : 0)) % SEASONS.length : 0;
  const r = rand(ownStream(s, 0x3a7));
  s.forecast = r < T.rainChance[si] ? 'rain' : r < T.rainChance[si] + T.fogChance[si] ? 'fog' : 'clear';
}
// What the day's weather means, said at its dawn; and a warning a day ahead of rain.
function weatherNews(s) {
  if (!s.tuning.weather) return;
  const behind = geo(s).n > 1 ? ', behind the line' : ''; // a keep one floor high has its moat outside the line
  const under = 'the new moon belongs to the Hollow';
  if (raining(s)) say(s, `Rain. The Yard quarries at ${Math.round(100 * s.tuning.rainYard)}%, and fire catches and spreads less. ${drownedDue(s) ? `Tonight the Drowned come up out of the moat's twin${behind}.` : `The Drowned stay under tonight: ${under}.`}`, 'bad');
  else if (foggy(s)) say(s, 'Fog. Tonight the black mirror will show how many come and when, but not their ways.');
  if (forecastOf(s) === 'rain' && drownedDue(s, true)) {
    say(s, `Rain is coming tomorrow. Tomorrow night the Drowned will come up out of the moat's twin, on the floor under the Veil, and make for the mirrors${behind ? ' from behind the line' : ''}.`, 'bad', true);
    cue(s, 'warn');
  } else if (forecastOf(s) === 'rain') say(s, `Rain is coming tomorrow. The Drowned will stay under: ${under}.`);
}

// A raid's strength before the spread: the day's, harder each season, stronger for one you paid off before, and
// for a Host you can fight back if raidFightStrength says so.
export const raidStrength = (s, base) => base * hard(s) * (s.embolden || 1) * (s.tuning.raidFight ? s.tuning.raidFightStrength : 1);

// A scripted raid (the tutorial's) comes at its exact strength, kills no one on the walls, and always leaves
// one raider dead inside.
function newRaid(s, base, warnAt, hitAt, scripted = false) {
  const T = s.tuning;
  const strength = scripted ? r1(base) : r1(Math.max(2, base + (rand(s) * 2 - 1) * T.raidSpread));
  const raid = { strength, count: Math.max(2, Math.round(strength / 2)), ward: 0, state: 'coming', warned: false, warnAt, hitAt };
  if (scripted) raid.safe = true;
  s.events.push({ at: warnAt, type: 'raidWarn' }, { at: hitAt, type: 'raidHit' });
  s.events.sort((a, b) => a.at - b.at);
  return raid;
}

function fire(s, e) {
  if (e.type === 'sick') {
    const well = s.living.filter((p) => !(p.sick > 0));
    if (!well.length) return;
    // Summer's plague: in a crowded keep it takes one more for every plagueCrowd beyond the beds.
    const n = plagueSeason(s) ? Math.min(well.length, 1 + Math.floor(Math.max(0, s.living.length - beds(s)) / s.tuning.plagueCrowd)) : 1;
    const taken = [];
    for (let i = 0; i < n; i++) {
      const p = pick(s, well.filter((x) => !taken.includes(x)));
      p.sick = Math.round(s.tuning.sickDays * (livingTrait(s, p)?.sick ?? 1) * dayTicks(s));
      taken.push(p);
    }
    const days = s.tuning.sickDays;
    if (n > 1) say(s, `Plague: ${listNames(taken.map((p) => p.name))} have fallen sick. In a crowded keep it spreads; untreated, it kills within ${fmt(days)} days.`, 'bad', true);
    else say(s, `${taken[0].name} has fallen sick. Untreated, the sickness kills within ${fmt(days * (livingTrait(s, taken[0])?.sick ?? 1))} days.`, 'bad', true);
    cue(s, 'warn');
  } else if (e.type === 'oldage') {
    const p = byId(s.living, e.id);
    if (p) kill(s, p, 'oldage');
  } else if (e.type === 'raidWarn') {
    const r = s.raid;
    if (!r || r.state !== 'coming') return;
    r.warned = true;
    if (r.crusade) say(s, `The crusade is on the road: ${r.count} knights of the Lantern, strength ${fmt(r.strength)}, at the gate a little after noon. Your defense is ${fmt(defense(s))}. They take no tribute; if they break in, they will smash every mirror they can find.`, 'bad', true);
    else if (r.camp) say(s, `The camp outside stirs: ${r.count} of the Ashen Host will come at the gate, strength ${fmt(r.strength)}. Your defense is ${fmt(defense(s))}.`, 'bad', true);
    else say(s, `Raiders on the road: ${r.count} of the Ashen Host, strength ${fmt(r.strength)}. Your defense is ${fmt(defense(s))}.`, 'bad', true);
    cue(s, 'horn');
  } else if (e.type === 'raidHit') {
    if (s.tuning.raidFight) startAssault(s);
    else resolveRaid(s);
  } else if (e.type === 'fire') {
    ignite(s, e.room, !!e.safe);
  } else if (e.type === 'inspect') {
    inspect(s);
  } else if (e.type === 'notice') {
    const T = s.tuning;
    say(s, `Word comes from the Lantern Church: its inspector will visit on day ${T.firstInspection}, at noon, to judge how the keep keeps its dead. The less Dread, the better it goes.`, 'rite', true);
    cue(s, 'warn');
  }
}

function resolveRaid(s) {
  const r = s.raid;
  if (!r || r.state !== 'coming') return;
  const T = s.tuning;
  const def = defense(s);
  const held = def + EPS >= r.strength;
  const ratio = r.strength / Math.max(def, 0.5);
  const fallen = [];
  for (const g of s.living.filter((p) => p.job === 'barracks')) {
    // The Brave fall twice as often; a Coward never does, though the dice are still thrown, so the random
    // stream doesn't shift with traits.
    const fall = livingTrait(s, g)?.fall ?? 1;
    if (chance(s, clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio * fall, 0.02, T.raidRiskMax)) && fall > 0 && !r.safe) fallen.push({ p: g, how: 'died holding the gate' });
  }
  const raiders = r.safe ? 1 : held ? (chance(s, T.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => p.job !== 'barracks' && p.age !== 'child'); // children shelter inside
    if (civ.length && !r.safe) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
  }
  if (!held && !r.crusade) {
    const food = Math.floor(s.res.food * T.raidLoot * 0.5); // the Granary keeps half the food out of their hands
    const kept = roomsOf(geo(s), 'cellar').length ? 0.5 : 1; // a Cellar keeps half the candles and glass out of their hands
    const glass = Math.floor(s.res.glass * T.raidLoot * kept);
    const candles = Math.floor(s.res.candles * T.raidLoot * kept);
    s.res.food -= food;
    s.res.glass -= glass;
    s.res.candles -= candles;
    loot = ` They carried off ${food} food, ${glass} glass and ${candles} candles.`;
  }
  r.state = held ? 'held' : 'breached';
  s.today.raid = { strength: r.strength, defense: r1(def), held, ...(r.crusade ? { crusade: true } : {}) };
  cue(s, held ? 'held' : 'breached');
  const who = r.crusade ? 'crusaders' : 'raiders';
  say(
    s,
    held ? `The gate held against ${r.count} ${who} (defense ${fmt(def)} against strength ${fmt(r.strength)}).` : `The ${who} broke through (defense ${fmt(def)} against strength ${fmt(r.strength)}).${loot}`,
    held ? 'good' : 'bad',
    true,
  );
  for (const f of fallen) kill(s, f.p, 'duty', f.how);
  for (let i = 0; i < raiders; i++) raiderBody(s);
  const one = who.slice(0, -1);
  if (raiders) say(s, held ? `One ${one} fell inside the gatehouse. The body lies in the crypt.` : `${raiders} ${one}${raiders === 1 ? ' was' : 's were'} cut down inside the walls. The bodies lie in the crypt.`);
  if (r.crusade) crusadeOver(s, held);
}

// Raids you fight: the Host at the gate. Each second it's stronger than the defense, the gate gives by its
// excess as a share of its strength; it falls back if the gate still stands when its time is up, or when
// pitch has burned it all.
function startAssault(s) {
  const r = s.raid;
  if (!r || r.state !== 'coming') return;
  r.state = 'assault';
  r.host = r.strength;
  r.gate = 1;
  r.left = Math.round(s.tuning.raidAssaultSecs * TICKS_PER_SEC);
  r.warned = true;
  const def = defense(s);
  const who = r.crusade ? `The crusade is at the gate: ${r.count} knights of the Lantern` : `The Host is at the gate: ${r.count} raiders`;
  say(s, `${who}, strength ${fmt(r.strength)}, against your defense of ${fmt(def)}. ${def + EPS >= r.strength ? 'The gate should hold.' : 'The gate is giving.'} Pitch, stone and the bell can turn it.`, 'bad', true);
  cue(s, 'ram');
}
function assaultTick(s) {
  const r = s.raid;
  const def = defense(s);
  r.gate -= ((s.tuning.raidBreak * Math.max(0, r.host - def)) / r.strength) * DT;
  r.left--;
  if (r.left % 20 === 0 && r.host > def + EPS) cue(s, 'ram');
  if (r.gate <= 0) endAssault(s, false);
  else if (r.host <= EPS || r.left <= 0) endAssault(s, true);
}
function endAssault(s, held) {
  const r = s.raid;
  const T = s.tuning;
  const def = defense(s);
  const ratio = r.host / Math.max(def, 0.5);
  const fallen = [];
  // Everyone on the walls stands a chance of falling, the guards and whoever the bell brought, and the more
  // of them there are, the more the Host's blows are shared.
  const walls = s.living.filter((p) => p.job === 'barracks' || p.walls);
  const share = Math.min(1, T.raidShare / Math.max(1, walls.length));
  for (const g of walls) {
    const fall = (livingTrait(s, g)?.fall ?? 1) * (g.walls ? T.raidBellRisk : 1) * share;
    if (chance(s, clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio * fall, 0.02, T.raidRiskMax)) && fall > 0 && !r.safe) fallen.push({ p: g, how: g.job === 'barracks' ? 'died holding the gate' : 'died on the walls' });
  }
  const raiders = r.safe ? 1 : held ? (chance(s, T.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => p.job !== 'barracks' && !p.walls && p.age !== 'child'); // children shelter inside
    if (civ.length && !r.safe) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
  }
  if (!held && !r.crusade) {
    const barred = r.barred ? 0.5 : 1;
    const food = Math.floor(s.res.food * T.raidLoot * 0.5 * barred);
    const kept = (roomsOf(geo(s), 'cellar').length ? 0.5 : 1) * barred;
    const glass = Math.floor(s.res.glass * T.raidLoot * kept);
    const candles = Math.floor(s.res.candles * T.raidLoot * kept);
    s.res.food -= food;
    s.res.glass -= glass;
    s.res.candles -= candles;
    r.loot = { food, glass, candles };
    loot = ` They carried off ${food} food, ${glass} glass and ${candles} candles${r.barred ? ', half what the barred stores would have given up' : ''}.`;
  }
  r.state = held ? 'held' : 'breached';
  for (const p of s.living) if (p.walls) delete p.walls;
  s.today.raid = { strength: r.strength, defense: r1(def), held, ...(r.crusade ? { crusade: true } : {}) };
  cue(s, held ? 'held' : 'breached');
  const host = r.crusade ? 'the crusade' : 'the Host';
  say(s, held ? `${cap(host)} fell back from the gate${r.pitched ? `, burned by ${r.pitched} ${r.pitched === 1 ? 'pour' : 'pours'} of pitch` : ''}.` : `The gate gave way, and ${host} broke in.${loot}`, held ? 'good' : 'bad', true);
  for (const f of fallen) kill(s, f.p, 'duty', f.how);
  for (let i = 0; i < raiders; i++) raiderBody(s);
  const who = r.crusade ? 'crusader' : 'raider';
  if (raiders) say(s, held ? `One ${who} fell inside the gatehouse. The body lies in the crypt.` : `${raiders} ${who}${raiders === 1 ? ' was' : 's were'} cut down inside the walls. The bodies lie in the crypt.`);
  if (r.crusade) crusadeOver(s, held);
}

// The crusade's end. Held at the gate, the Church gives up. Broken in, the crusaders smash every mirror they
// can find, and the shades in them go free; the Church, satisfied, leaves a purged keep. Either way the
// embargo and the Inquisition are over, and hidden mirrors come back out.
function crusadeOver(s, held) {
  const smashed = held ? [] : s.mirrors.filter((m) => !m.hidden);
  const freed = [];
  for (const m of smashed) {
    for (const d of s.shades.filter((x) => x.mirror === m.id)) {
      s.shades.splice(s.shades.indexOf(d), 1);
      endLedger(s, d.id, 'purged');
      restFor(s, d.id, true);
      freed.push(d.name);
    }
    s.mirrors.splice(s.mirrors.indexOf(m), 1);
  }
  const hidden = s.mirrors.filter((m) => m.hidden);
  for (const m of hidden) showMirror(s, m);
  const was = s.dread;
  if (!held) s.dread = 0;
  s.church = null;
  s.today.crusade = { held, smashed: smashed.length, freed: freed.length };
  const back = hidden.length ? ` The ${listNames(hidden.map((m) => m.name))} ${hidden.length === 1 ? 'comes' : 'come'} out of hiding.` : '';
  if (held) say(s, `The crusade breaks on your walls and turns for home. The Lantern Church lifts its embargo and calls its inquisitor away.${back}`, 'good', true);
  else say(s, `The crusaders smash ${smashed.length ? listNames(smashed.map((m) => `the ${m.name}`)) : 'nothing: every mirror was hidden'}${freed.length ? `, and ${listNames(freed)} ${freed.length === 1 ? 'goes' : 'go'} free` : ''}. Satisfied, the Lantern Church leaves the keep purged and lifts its embargo. Dread ${was} → 0.${back}`, 'bad', true);
  cue(s, held ? 'blessed' : 'shatter');
}
// A mirror hidden from a crusade, brought back out, with its shades.
function showMirror(s, m) {
  delete m.hidden;
  for (const d of s.shades) if (d.mirror === m.id) delete d.hidden;
}

// The Lantern Church judges the keep by its Dread at noon.
function inspect(s) {
  const I = s.inspection;
  if (!I || I.done) return;
  const d = s.dread;
  let verdict;
  let text;
  if (d <= 1) {
    verdict = 'blessed';
    s.res.candles += 3;
    gain(s, 'remembrance', 2);
    text = 'The Lantern Church inspector finds a keep at peace with its dead, and blesses it: 3 candles and 2 remembrance.';
    if (crusadeDay(s)) text += ' The crusade is called off, the inquisitor leaves, and the embargo is lifted.';
    else if (s.church) text += inquisition(s) ? ' The inquisitor leaves, and the embargo is lifted.' : ' The embargo is lifted.';
    s.church = null;
    for (const m of s.mirrors) if (m.hidden) showMirror(s, m);
  } else if (d <= 3) {
    verdict = 'warned';
    let tithe;
    if (s.res.essence >= 5) {
      s.res.essence -= 5;
      tithe = '5 essence';
    } else if (s.res.remembrance >= 5) {
      s.res.remembrance -= 5;
      tithe = '5 remembrance';
    } else if (s.res.candles >= 3) {
      s.res.candles -= 3;
      tithe = '3 candles';
    } else {
      tithe = `${Math.floor(s.res.remembrance)} remembrance, all you had`;
      s.res.remembrance = 0;
    }
    s.dread = Math.max(0, d - 1);
    text = `The Lantern Church inspector warns you and takes a tithe of ${tithe}. Dread ${d} → ${s.dread}.`;
  } else {
    verdict = 'censured';
    const groups = s.mirrors.filter((m) => !m.hidden).map((m) => ({ m, ds: s.shades.filter((x) => x.mirror === m.id) })).sort((a, b) => b.ds.length - a.ds.length || MIRRORS[b.m.type].cap - MIRRORS[a.m.type].cap);
    const g = groups[0];
    if (g) {
      for (const x of g.ds) {
        s.shades.splice(s.shades.indexOf(x), 1);
        endLedger(s, x.id, 'taken');
        restFor(s, x.id, false);
      }
      s.mirrors.splice(s.mirrors.indexOf(g.m), 1);
    }
    s.dread = 2;
    text = g
      ? `The Lantern Church inspector censures the keep, covers the ${g.m.name}${g.ds.length ? ` and takes ${listNames(g.ds.map((x) => x.name))}` : ''}, and carries the mirror away. Dread ${d} → 2.`
      : `The Lantern Church inspector censures the keep. Dread ${d} → 2.`;
    text += escalate(s);
  }
  I.done = true;
  I.verdict = verdict;
  I.dread = d;
  s.inspections.push({ season: s.season, day: s.day, reason: I.reason, verdict, dread: d });
  s.today.inspection = { verdict, dread: d };
  say(s, text, verdict === 'blessed' ? 'good' : 'bad', true);
  cue(s, verdict === 'blessed' ? 'blessed' : 'censured');
}

// A censure with the Church's escalation on: a silver embargo, or, under one already, the Inquisition.
function escalate(s) {
  const T = s.tuning;
  if (!T.church) return '';
  if (crusadeDay(s)) return ' The crusade is still coming.';
  if (T.crusade && inquisition(s)) {
    const day = dayNo(s) + T.crusadeDays;
    // As strong as a raid of that base this season, but not emboldened: that's the Host's, not the Church's.
    const strength = r1(Math.max(2, T.crusadeBase * hard(s) * (T.raidFight ? T.raidFightStrength : 1) + (rand(s) * 2 - 1) * T.raidSpread));
    s.church = { embargo: Math.max(s.church.embargo, day), inquisition: day - 1, crusade: day, strength };
    const when = T.crusadeDays === 1 ? 'tomorrow' : `in ${T.crusadeDays} days`;
    return ` Censured under the Inquisition, the keep is given up to a crusade: ${Math.max(2, Math.round(strength / 2))} knights of the Lantern will come to the gate a little after noon ${when}, strength ${fmt(strength)}, and smash every mirror they can find if they break in. Until then the inquisitor inspects each noon, and a blessing calls the crusade off.`;
  }
  if (embargoed(s)) {
    const again = inquisition(s);
    const until = dayNo(s) + T.inquisitionDays;
    s.church = { embargo: Math.max(s.church.embargo, until), inquisition: until };
    if (again) return ` The Inquisition stays: the inquisitor will inspect the keep every day at noon for ${T.inquisitionDays} more days.`;
    return ` Censured under its embargo, the keep is given to the Inquisition: an inquisitor will inspect it every day at noon for ${T.inquisitionDays} days, unless it finds the keep at peace first.`;
  }
  s.church = { embargo: dayNo(s) + T.embargoDays, inquisition: 0 };
  return ` The Church lays a silver embargo on the keep for ${T.embargoDays} days: the Glazier can make no glass, and no mirror can be built. A blessing lifts it, or a donation of ${T.donation} remembrance.`;
}

/* ---------------------------------------------------------------- death */

export function kill(s, p, cause, how) {
  const i = s.living.indexOf(p);
  if (i < 0) return null;
  s.living.splice(i, 1);
  let kind = CAUSES[cause].kind;
  let guided = false;
  if (s.guidance > 0 && GUIDE_UP[kind]) {
    kind = GUIDE_UP[kind];
    s.guidance--;
    guided = true;
  }
  const b = { id: p.id, name: p.name, age: p.age, job: p.job, bond: p.bond, joined: p.joined, cause, kind, guided, how: how || CAUSES[cause].text, day: s.day, funeral: false, from: 'living', was: p.trait || null, ...(p.born ? { born: true } : {}) };
  s.bodies.push(b);
  s.today.deaths.push(p.id);
  addLedger(s, b);
  let grief = '';
  const q = p.bond ? byId(s.living, p.bond.with) : null;
  if (q && livingTrait(s, q)?.grieves !== false) {
    q.grief = { for: p.id, mult: livingTrait(s, q)?.grief ?? s.tuning.griefMult };
    q.peace = 0;
    grief = ` ${q.name} grieves.`;
  }
  say(s, `${p.name} ${b.how}.${guided ? ' The Threshold eased the passing.' : ''}${grief}`, 'death', true);
  cue(s, 'knell');
  if (!s.living.length) lose(s, 'fallen', 'No one living is left. The keep has fallen.');
  return b;
}
function raiderBody(s) {
  const b = {
    id: 'r' + s.nextId++, name: freshName(s, RAIDER_NAMES), age: 'adult', job: null, bond: null, cause: 'raider', kind: 'stranger',
    guided: false, how: CAUSES.raider.text, day: s.day, funeral: false, from: 'raider',
  };
  s.bodies.push(b);
  addLedger(s, b);
}
// Everything the Book of the Dead tells about someone, from the day they die.
function addLedger(s, b) {
  s.ledger.push({
    id: b.id, name: b.name, from: b.from, season: s.season, day: b.day, cause: b.cause, how: b.how, kind: b.kind, guided: b.guided, job: b.job,
    age: b.age, bond: bondOf(s, b.bond), joined: b.joined ?? null, woke: null, end: null, endDay: null, nights: 0, kills: 0, posts: {}, named: false,
    memory: null, was: b.was || null, ...(b.born ? { born: true } : {}),
  });
}
// A bond as the Book records it: the partner's name, and what they were to the dead.
function bondOf(s, bond) {
  if (!bond) return null;
  const other = byId(s.living, bond.with) || byId(s.shades, bond.with) || ledgerOf(s, bond.with);
  return other ? { name: other.name, rel: BOND_OTHER[bond.rel] || bond.rel } : null;
}
export const ledgerOf = (s, id) => s.ledger.find((e) => e.id === id);
function endLedger(s, id, end) {
  const e = ledgerOf(s, id);
  if (e && !e.end) {
    e.end = end;
    e.endDay = s.day;
    e.endSeason = s.season;
  }
}
function restFor(s, deadId, peace) {
  for (const p of s.living) {
    if (p.grief && p.grief.for === deadId) {
      p.grief = null;
      if (peace) {
        p.peace = Math.round(s.tuning.peaceDays * dayTicks(s));
        say(s, `${p.name} is at peace.`, 'good');
      }
    }
  }
}
function lose(s, reason, text) {
  if (s.phase === 'night') review(s);
  s.phase = 'over';
  s.over = { reason, season: s.season, day: s.day };
  closeSeason(s, s.night ? s.night.stats.cracks : 0, reason);
  say(s, text, 'bad', true);
  cue(s, 'over');
}

/* ---------------------------------------------------------------- dusk: the Crossing */

/* ---------------------------------------------------------------- fire */

// Who is in a room by day: its share of the workers of its type, in the order the living are listed (as the
// page draws them, the last room taking any overflow; anyone idle sits in the first Hearth), and whoever
// was sent there to fight a fire.
export function peopleIn(s, id) {
  const G = geo(s);
  const type = typeOf(G, id);
  const rooms = roomsOf(G, type);
  const i = rooms.findIndex((r) => r.id === id);
  if (i < 0) return [];
  const cap = s.tuning.roomCap;
  const workers = s.living.filter((p) => !p.fighting && (p.job || 'hearth') === type);
  const mine = i === rooms.length - 1 ? workers.slice(i * cap) : workers.slice(i * cap, (i + 1) * cap);
  return [...mine, ...s.living.filter((p) => p.fighting === id)];
}
function ignite(s, id, safe = false) {
  if (!id || s.fires.some((f) => f.room === id) || !typeOf(geo(s), id)) return;
  s.fires.push({ room: id, heat: s.tuning.fireStart, full: 0, ...(safe ? { safe } : {}) });
  const R = geo(s).rooms[id];
  say(s, `Fire in the ${DAY_ROOMS[R.type].name}! Everyone in it fights it; send the Yard to help, or it will spread and kill.`, 'bad', true);
  cue(s, 'fire', R.f, (R.x0 + R.x1) / 2);
}
// The rooms a fire can catch from this one: beside it on its floor, and over or under it.
function besideRoom(G, id) {
  const r = G.rooms[id];
  return Object.values(G.rooms).filter((o) => o.id !== id && ((o.f === r.f && (Math.abs(o.x0 - r.x1) <= 6 || Math.abs(r.x0 - o.x1) <= 6)) || (Math.abs(o.f - r.f) === 1 && o.x0 < r.x1 && r.x0 < o.x1)));
}
function burn(s) {
  const T = s.tuning;
  const G = geo(s);
  for (const f of [...s.fires]) {
    const inside = peopleIn(s, f.room);
    f.heat = Math.min(1, f.heat + (T.fireGrow * (raining(s) ? T.rainFire : 1) - T.fireFight * inside.length) * DT);
    const name = DAY_ROOMS[typeOf(G, f.room)].name;
    if (f.heat <= 0) {
      s.fires.splice(s.fires.indexOf(f), 1);
      for (const p of s.living) if (p.fighting === f.room) p.fighting = null;
      say(s, `The fire in the ${name} is out.`, 'good', true);
      cue(s, 'fire-out');
      continue;
    }
    // Fighting it is dangerous, the more so the hotter it burns.
    for (const p of inside) {
      if (s.phase === 'day' && s.living.includes(p) && chance(s, T.fireDeath * f.heat * f.heat * DT) && !f.safe) kill(s, p, 'duty', `died fighting the fire in the ${name}`);
    }
    if (f.heat < 1) continue;
    f.full += DT;
    if (f.full >= T.fireSpread) {
      f.full = 0;
      const next = besideRoom(G, f.room).filter((o) => !s.fires.some((x) => x.room === o.id));
      if (next.length) {
        const o = pick(s, next);
        say(s, `The fire spreads from the ${name} to the ${DAY_ROOMS[o.type].name}.`, 'bad', true);
        ignite(s, o.id);
      }
    }
  }
}

function endDay(s) {
  if (s.raid?.state === 'assault') {
    endAssault(s, s.raid.gate > 0); // the Host falls back at nightfall if the gate still stands
    if (s.phase === 'over') return;
  }
  s.phase = 'dusk';
  s.t = 0;
  s.events = [];
  s.watchBonus = 0;
  s.haunted = [];
  // A fire still burning at dusk burns the night through: its room is dead tomorrow.
  s.scorched = (s.fires || []).map((f) => f.room);
  for (const id of s.scorched) say(s, `The fire in the ${DAY_ROOMS[typeOf(geo(s), id)].name} burns into the night. Nobody can work there tomorrow.`, 'bad', true);
  s.fires = [];
  for (const p of s.living) {
    if (p.fighting) p.fighting = null;
    if (p.nightmare) delete p.nightmare;
  }
  s.dusk = { step: s.bodies.length ? 'crypt' : 'place' };
  s.night = newNight(s);
  s.dreamt = 0;
  // A Hoarding shade pockets candles from the store as the night's are counted out, but never the last few.
  for (const d of s.shades) {
    const S = shadeTrait(s, d);
    const k = S?.pockets;
    if (k && canWork(d) && s.res.candles >= k + S.spares) {
      s.res.candles -= k;
      say(s, `${d.name} pockets ${k === 1 ? 'a candle' : `${k} candles`} from the store.`, 'bad');
    }
  }
  if (s.tuning.whispers) dayTired(s);
  gateTired(s);
  const n = s.bodies.length;
  say(s, n ? `Dusk. ${n} ${n === 1 ? 'body lies' : 'bodies lie'} in the crypt. Hold funerals or let them wake.` : 'Dusk. Set the candles and post the shades.', 'dusk', true);
  cue(s, 'dusk');
}

// At dusk a shade that stood the gate by day pays for it in memory, and goes back to the glass.
function gateTired(s) {
  const T = s.tuning;
  for (const d of [...s.shades]) {
    if (d.byDay?.how !== 'gate') continue;
    d.byDay = null;
    if (!canWork(d)) continue;
    const loss = T.gateFade * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1);
    d.memory = Math.round((d.memory - loss) * 100) / 100;
    const e = ledgerOf(s, d.id);
    if (e) {
      e.gated = (e.gated || 0) + 1;
      e.memory = Math.max(0, d.memory);
    }
    say(s, `${d.name} stood the gate all day, and comes back to the glass the more faded: −${fmt(loss)} memory.`);
    if (d.memory <= 0) fadeAway(s, d, `${d.name} spent the last of their memory at the gate, and has faded. Nothing is left in the glass.`, 'faded', false);
  }
}

// At dusk, the dead who helped by day are the more tired for it: a whisper costs nothing on a day nobody
// worked its trade. One spent to nothing fades before the night.
function dayTired(s) {
  const T = s.tuning;
  const tired = [];
  for (const d of [...s.shades]) {
    if (!d.byDay || d.byDay.how === 'gate') continue;
    const step = stepsThrough(s, d);
    if (!step && !whispers(s, d)) {
      d.byDay = null; // it can't any more: out of the glass, turned, or no longer in a great glass
      continue;
    }
    if (!step && !jobCount(s, tradeOf(s, d))) continue;
    const loss = (step ? T.stepFade : T.whisperFade) * (d.named ? 0.5 : 1) * (shadeTrait(s, d)?.fade ?? 1);
    d.memory = Math.round((d.memory - loss) * 100) / 100;
    const e = ledgerOf(s, d.id);
    if (e) {
      const k = step ? 'stepped' : 'whispered';
      e[k] = (e[k] || 0) + 1;
      e.memory = Math.max(0, d.memory);
    }
    tired.push(`${d.name} −${fmt(loss)}`);
    if (d.memory <= 0) fadeAway(s, d, `${d.name} spent the last of their memory helping the living by day, and has faded. Nothing is left in the glass.`, 'faded', false);
  }
  if (tired.length) say(s, `The dead who helped by day are the more tired for it. Memory: ${tired.join(', ')}.`);
}

export function crossingPreview(s) {
  const cap = funeralCap(s);
  let buried = 0;
  const use = Object.fromEntries(s.mirrors.map((m) => [m.id, mirrorUse(s, m)]));
  return s.bodies.map((b) => {
    if (b.funeral && buried < cap) {
      buried++;
      return { b, to: 'funeral' };
    }
    if (b.kind === 'wraith' || b.kind === 'restless') return { b, to: b.kind };
    const m = s.mirrors.find((x) => use[x.id] < mirrorCap(x));
    if (!m) return { b, to: 'overflow' };
    use[m.id]++;
    return { b, to: 'mirror', mirror: m };
  });
}

function bury(s, b) {
  gain(s, 'remembrance', 1);
  const e = ledgerOf(s, b.id);
  if (e) e.woke = 'funeral';
  endLedger(s, b.id, 'funeral');
  say(s, b.from === 'raider' ? `${b.name} was burned with the Host's dead.` : `${b.name} was laid to rest.`, 'rest');
  cue(s, 'rest');
  restFor(s, b.id, true);
}

// A free spot in the Waking Room for the newly woken.
function wakingSpot(s) {
  const { f, x0 } = roomSpan(geo(s), 'crypt');
  const taken = s.shades.filter((d) => d.post && d.post.f === f).map((d) => d.post.x);
  for (let i = 0; i < 12; i++) {
    const x = x0 + 8 + ((i * 7) % 36);
    if (taken.every((t) => Math.abs(t - x) >= 5)) return { f, x };
  }
  return { f, x: x0 + 20 };
}

function newShade(s, o) {
  const post = o.post || wakingSpot(s);
  return {
    id: o.id, name: o.name, kind: o.kind, trueKind: null, mirror: null, bond: o.bond || null, cause: o.cause, from: o.from, day: o.day,
    job: o.job || null, memory: o.memory ?? 100, named: !!o.named, nights: 0, rites: 0, restless: 0, post, f: post.f, x: post.x,
    was: o.was || null, trait: o.was ? TRAITS[o.was].dead : null, // the living trait, and what death turned it into
    ox: post.x, of: post.f, path: [], climb: 0, climbTotal: 0, grabbedBy: null, rest: 0, sang: 0, watch: 0, drained: 0,
  };
}

function rise(s, b, x) {
  const d = newShade(s, b);
  let text;
  if (x.to === 'mirror') {
    d.mirror = x.mirror.id;
    text = `${b.name} wakes ${KINDS[d.kind].name} in the ${x.mirror.name}.`;
  } else if (x.to === 'overflow') {
    d.trueKind = d.kind;
    d.kind = 'restless';
    text = `${b.name} wakes Restless at the edge of the Deep. No mirror had room.`;
  } else if (x.to === 'restless') text = `${b.name} wakes Restless at the edge of the Deep.`;
  else text = `${b.name} wakes as a Wraith.`;
  const e = ledgerOf(s, b.id);
  if (e) e.woke = x.to === 'overflow' ? 'overflow' : d.kind;
  s.shades.push(d);
  say(s, text, d.mirror ? 'wake' : 'bad');
  cue(s, d.mirror ? 'wake' : d.kind === 'wraith' ? 'wraith' : 'restless');
}

/* ---------------------------------------------------------------- the night */

function newNight(s) {
  const T = s.tuning;
  const N = nightTicks(s);
  const long = isLongNight(s);
  const tut = tutorialNight(s); // the tutorial's first nights: its numbers
  const count = tut ? tut.creepers : Math.round((T.creepersBase + T.creepersPerNight * Math.min(s.day, T.seasonDays - 1)) * (long ? T.longNightCreepers : isNewMoon(s) ? T.newMoonCreepers : 1) * hard(s));
  // The Unlit come in tides: a few stragglers, and the rest in waves that can swamp one candle. The Long
  // Night has one tide more.
  const waves = tut ? tut.tides : 1 + Math.floor(s.day / T.tideEvery) + (long ? 1 : 0);
  const tides = Array.from({ length: waves }, (_, w) => 0.12 + (0.7 * (w + 0.2 + 0.6 * rand(s))) / waves);
  const spawns = [];
  for (let i = 0; i < count; i++) {
    const straggler = chance(s, tut?.stragglers ?? T.stragglers);
    const at = straggler ? 0.05 + 0.85 * rand(s) : tides[i % waves] + (rand(s) - 0.5) * T.tideSpread;
    spawns.push({
      at: Math.round(clamp(at, 0.02, 0.92) * N), type: 'creeper', seep: s.day >= T.seepFrom && chance(s, tut?.seep ?? T.seepShare),
      snuff: chance(s, tut?.snuff ?? T.snuffShare), rift: tut ? MAP.rifts[i % MAP.rifts.length].id : pick(s, MAP.rifts).id,
    });
  }
  // Maws rise just ahead of the last tide, to open a way for the Creepers behind them, from night mawFrom.
  // The new moon belongs to the Hollow, except the Long Night, which has both.
  if (s.day >= T.mawFrom && (!isNewMoon(s) || long)) {
    const maws = Math.round(T.mawsPerNight);
    const order = [...tides].sort((a, b) => b - a);
    for (let i = 0; i < maws; i++) spawns.push({ at: Math.round(clamp(order[i % order.length] - 0.03, 0.02, 0.9) * N), type: 'maw', seep: false, snuff: false, rift: pick(s, MAP.rifts).id, ...(tut?.maw ? { weak: tut.maw } : {}) });
  }
  if (isNewMoon(s)) spawns.push({ at: Math.round(T.hollowAt * N), type: 'hollow', seep: false, snuff: false, rift: pick(s, MAP.rifts).id });
  // The night after a death, the Weepers: one for each of the day's dead.
  if (T.dreamwell) {
    for (let i = 0; i < Math.min(tut?.weepers ?? T.weepersMax, s.today.deaths.length); i++) spawns.push({ at: Math.round((0.1 + 0.6 * rand(s)) * N), type: 'weeper', seep: true, snuff: false, rift: pick(s, MAP.rifts).id });
  }
  // A rainy night: the Drowned come up out of the moat's twin at any hour, all at one end of it (the
  // spawn's rift is its end of the moat). Not on the new moon, which belongs to the Hollow, as for the Maws.
  if (raining(s) && drownedDue(s)) {
    const r = ownStream(s, 0xd20);
    const end = pick(r, MAP.moat).id;
    for (let i = 0; i < drownedCount(s); i++) spawns.push({ at: Math.round((0.08 + 0.8 * rand(r)) * N), type: 'drowned', seep: false, snuff: false, rift: end });
  }
  spawns.sort((a, b) => a.at - b.at);
  const night = {
    ...(T.errands && !tut ? { errands: rollErrands(s, N) } : {}),
    candles: [], foes: [], spawns, tides: tides.map((x) => Math.round(x * N)).sort((a, b) => a - b), wards: [], wardHold: {}, hush: false, steel: !!s.steel,
    broken: [], // twin rooms (ids) a Maw has broken tonight
    stats: { spawned: 0, killed: 0, crossed: 0, cracks: 0, grabbed: 0, drained: 0, essence: 0, glass: 0, wick: 0, guidance: 0, candles: 0, wards: 0, lost: [], hollow: null, taken: null, wraiths: 0, maws: 0, smashed: 0, broken: [], drowned: 0, under: 0, pulled: 0, deep: [] },
  };
  // Tonight's omen, or two to choose between: the night as rolled is kept, so a choice can be changed at dusk.
  const offered = T.omens && !tut && !long && !isNewMoon(s) && s.day >= T.omenFrom ? rollOmens(s, N, night) : [];
  if (offered.length === 1) applyOmen(s, night, offered[0]);
  else if (offered.length === 2) Object.assign(night, { omens: offered, base: { spawns: spawns.map((x) => ({ ...x })), tides: [...night.tides] } });
  return night;
}

// Omens (round six) come from their own stream, from the seed and the night, like errands, so a seed brings
// the same raids, sickness and Unlit whether omens are on or off. Everything an omen adds is rolled here, so
// choosing between two needs nothing new from the stream.
function rollOmens(s, N, n) {
  const T = s.tuning;
  const r = sideStream(s, 0x0e1);
  if (!chance(r, T.omenChance)) return [];
  const can = Object.keys(OMENS).filter((id) => (T.omenOnly ? id === T.omenOnly : true) && (id !== 'hunt' || s.day >= T.mawFrom));
  if (!can.length) return [];
  const ids = [pick(r, can)];
  if (!T.omenOnly && can.length > 1 && chance(r, T.omenChoice)) ids.push(pick(r, can.filter((x) => x !== ids[0])));
  const tides = n.tides.map((x) => x / N);
  const creepers = n.spawns.filter((sp) => sp.type === 'creeper').length;
  return ids.map((id) => {
    const o = { id };
    if (id === 'sealed') o.rift = pick(r, MAP.rifts).id; // the one left open
    if (id === 'hunt') o.adds = [{ at: Math.round(clamp(Math.max(...tides) - 0.03, 0.02, 0.9) * N), type: 'maw', seep: false, snuff: false, rift: pick(r, MAP.rifts).id }];
    if (id === 'blood') {
      o.adds = Array.from({ length: Math.round(T.bloodMore * creepers) }, (_, i) => {
        const at = chance(r, T.stragglers) ? 0.05 + 0.85 * rand(r) : tides[i % tides.length] + (rand(r) - 0.5) * T.tideSpread;
        return { at: Math.round(clamp(at, 0.02, 0.92) * N), type: 'creeper', seep: s.day >= T.seepFrom && chance(r, T.seepShare), snuff: chance(r, T.snuffShare), rift: pick(r, MAP.rifts).id };
      });
    }
    return o;
  });
}
// An omen on the night as rolled: where the Unlit come up, which seep, more of them, or the tides split.
function applyOmen(s, n, o) {
  const T = s.tuning;
  const N = nightTicks(s);
  const w = (T.tideSpread * N) / 2 + 1;
  if (n.base) {
    n.spawns = n.base.spawns.map((x) => ({ ...x }));
    n.tides = [...n.base.tides];
  }
  if (o.id === 'sealed') for (const sp of n.spawns) if (sp.type === 'creeper' || sp.type === 'maw') sp.rift = o.rift;
  if (o.id === 'thin') for (const sp of n.spawns) if (sp.type === 'creeper' && Math.abs(sp.at - n.tides[0]) <= w) sp.seep = true;
  if (o.adds) n.spawns.push(...o.adds.map((x) => ({ ...x })));
  if (o.id === 'restless') {
    // Every other Creeper of each tide comes halfway to the next one, or to the night's end.
    const ends = [...n.tides.slice(1), Math.round(0.92 * N)];
    const halves = n.tides.map((at, i) => Math.round((at + ends[i]) / 2));
    n.tides.forEach((at, i) => n.spawns.filter((sp) => sp.type === 'creeper' && Math.abs(sp.at - at) <= w).forEach((sp, k) => k % 2 && (sp.at = Math.min(Math.round(0.92 * N), sp.at + halves[i] - at))));
    n.tides = [...n.tides, ...halves].sort((a, b) => a - b);
  }
  n.spawns.sort((a, b) => a.at - b.at);
  n.omen = o;
}
// What an omen does, in words, by this keep's numbers.
export function omenText(T, o) {
  const times = (x) => (x === 2 ? 'twice' : `${x} times`);
  const side = (id) => (MAP.rifts.find((r) => r.id === id).x < MAP.W / 2 ? 'left' : 'right');
  return {
    sealed: () => `the ${side(o.rift) === 'left' ? 'right' : 'left'} rift is sealed: every Creeper and Maw comes up the ${side(o.rift)} one`,
    thin: () => `the first tide seeps up in rooms with no candle, and the Choir sings ${times(T.thinChoir)} as loud`,
    hunt: () => `one more Maw rises with the last tide, and each Maw cut down gives ${fmt(T.huntEssence)} essence`,
    still: () => `candles burn ${T.stillBurn === 0.5 ? 'half' : T.stillBurn === 0.75 ? 'three quarters' : `${fmt(T.stillBurn)} times`} as fast, and the Unlit gnaw them ${times(T.stillGnaw)} as hard`,
    blood: () => `${T.bloodMore === 0.5 ? 'half again as many' : Math.abs(T.bloodMore - 1 / 3) < 0.01 ? 'a third again as many' : `${Math.round(100 * T.bloodMore)}% more`} Creepers come, and each one cut down gives ${fmt(T.bloodEssence)} essence`,
    restless: () => 'the tides come twice as often, each half as big',
  }[o.id]();
}
// The night's marks, from its spawns as they stand when it begins: each tide from its first Creeper, with
// how many come in it; each Maw, the Hollow and each of the Drowned; a sleepwalker's hour; and dawn.
export function nightMarks(s) {
  const n = s.night;
  const T = s.tuning;
  const N = nightTicks(s);
  const w = (T.tideSpread * N) / 2 + 1;
  const tides = n.tides.map((at) => ({ at, kind: 'tide', count: 0, from: at }));
  const marks = [];
  for (const sp of n.spawns) {
    if (sp.type === 'creeper') {
      const m = tides.find((x) => Math.abs(x.at - sp.at) <= w);
      if (m) {
        m.count++;
        m.from = Math.min(m.from, sp.at);
      }
    } else if (sp.type === 'maw' || sp.type === 'hollow' || sp.type === 'drowned') marks.push({ at: sp.at, kind: sp.type });
  }
  for (const m of tides) if (m.count) marks.push({ at: m.from, kind: 'tide', count: m.count });
  for (const e of n.errands || []) if (e.kind === 'sleeper') marks.push({ at: e.at, kind: 'sleeper' });
  marks.push({ at: N, kind: 'dawn' });
  return marks.sort((a, b) => a.at - b.at);
}
// The next mark worth skipping to: SKIP_LEAD before it, so there's time to see it come.
export const SKIP_LEAD = 2 * TICKS_PER_SEC;
export const nextMark = (s) => (s.phase === 'night' && s.night?.marks?.find((m) => m.at - SKIP_LEAD > s.t)) || null;

// The twin room at a place, or the nearest one on its floor: a lantern carried through the doorway between
// two rooms is in neither.
function twinAt(G, f, x) {
  const rooms = G.floors[f]?.rooms || [];
  const id = roomAt(G, f, x) || rooms.reduce((a, r) => (!a || Math.abs((r[1] + r[2]) / 2 - x) < Math.abs((a[1] + a[2]) / 2 - x) ? r : a), null)?.[0];
  return TWINS[typeOf(G, id)] || TWINS.hearth;
}

// Errands (round six): what turns up in the dark rooms below the line tonight, from night errandFrom, and a
// sleepwalker from night sleepFrom on some nights. Rolled with the night at dusk, so the black mirror shows
// them, from their own stream (the seed and the night) and with ids of their own, so a seed brings the same
// raids, sickness and Unlit whether errands are on or off.
function rollErrands(s, N) {
  const T = s.tuning;
  const G = geo(s);
  const r = sideStream(s, 0xe44);
  const out = [];
  const eid = () => `e${s.season}.${s.day}.${out.length}`;
  const below = G.floors.flatMap((fl, f) => (f < G.veil - 1 ? fl.rooms.map(([id]) => ({ f, id })) : []));
  if (s.day >= T.errandFrom && below.length) {
    const n = chance(r, 0.4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const room = pick(r, below);
      const { x0, x1 } = roomSpan(G, room.id);
      out.push({ id: eid(), kind: chance(r, 0.5) ? 'echo' : 'relic', f: room.f, x: Math.round(x0 + (x1 - x0) * (0.3 + 0.4 * rand(r))), done: null });
    }
  }
  const sleepers = s.living.filter((p) => p.age !== 'child' && !(p.sick > 0));
  if (s.day >= T.sleepFrom && !isNewMoon(s) && sleepers.length && chance(r, T.sleepChance)) {
    const p = pick(r, sleepers);
    const room = weeperRooms(s)[0];
    if (room) {
      const { x0, x1 } = roomSpan(G, room.id);
      out.push({ id: eid(), kind: 'sleeper', who: p.id, name: p.name, f: room.f, x: Math.round((x0 + x1) / 2), at: Math.round((0.3 + 0.4 * rand(r)) * N), done: null, out: false });
    }
  }
  return out;
}

function startNight(s) {
  s.phase = 'night';
  s.t = 0;
  s.dusk = null;
  for (const d of s.shades) {
    Object.assign(d, { path: [], climb: 0, grabbedBy: null, rest: 0, sang: 0, watch: 0, drained: 0, forged: 0 });
    if (s.tuning.acts) Object.assign(d, { acted: false, act: null });
    if (d.dreamed) d.dreamed = 0;
    if (canWork(d)) Object.assign(d, { f: d.post.f, x: d.post.x, ox: d.post.x, of: d.post.f });
  }
  const { f, x0 } = roomSpan(geo(s), 'crypt');
  for (const [i, w] of s.shades.filter((d) => d.kind === 'wraith').entries()) {
    addFoe(s, 'wraith', f, x0 + 10 + i * 9, { shade: w.id, temper: 'snuff' });
    s.night.stats.wraiths++;
  }
  const n = s.night;
  if (n.omens && !n.omen) applyOmen(s, n, n.omens[0]);
  delete n.base;
  const drowned = s.night.spawns.filter((x) => x.type === 'drowned').length;
  const under = drowned && s.night.wards.includes('moat');
  say(s, `Night ${s.day}${isLongNight(s) ? `: the Long Night. It lasts ${s.tuning.longNight === 2 ? 'twice' : `${fmt(s.tuning.longNight)} times`} as long as a winter night, and the Hollow, a Maw and more of the Unlit will come. At its end the year ends` : isNewMoon(s) ? ': the new moon. The Hollow will rise' : ''}. ${s.night.spawns.filter((x) => x.type === 'creeper').length} Creepers will come before dawn${drowned && !under ? `, and ${drowned === 1 ? 'one of the Drowned' : `${drowned} of the Drowned`} out of the moat` : ''}.`, 'night', isNewMoon(s));
  if (n.omen) say(s, `The omen: ${OMENS[n.omen.id].name}. ${cap(omenText(s.tuning, n.omen))}.`, 'night');
  n.marks = nightMarks(s);
  if (isLongNight(s)) cue(s, 'long-night');
  cue(s, 'night');
  if (s.night.stats.wraiths) say(s, `${listNames(s.shades.filter((d) => d.kind === 'wraith').map((d) => d.name))} ${s.night.stats.wraiths === 1 ? 'rises' : 'rise'} as a Wraith in the Waking Room.`, 'bad', true);
  if (s.night.stats.wraiths) cue(s, 'wraith');
}

export function addFoe(s, type, f, x, extra = {}) {
  const T = s.tuning;
  const hp = type === 'hollow' ? T.hollowHp * hard(s) : type === 'maw' ? T.mawHp * hard(s, 'mawHardness') : type === 'wraith' ? T.wraithHp : type === 'weeper' ? T.weeperHp : type === 'drowned' ? T.drownedHp : T.creeperHp;
  const foe = {
    id: 'c' + s.nextId++, type, f, x, ox: x, of: f, hp, max: hp, path: [], climb: 0, climbTotal: 0, temper: extra.temper || 'climb',
    mode: 'climb', prey: null, gnaw: null, gnawing: false, grab: null, replan: 0, shade: extra.shade || null, batter: null, smashing: false, target: null, breaking: 0,
  };
  s.night.foes.push(foe);
  return foe;
}
export const addCreeper = (s, f, x, temper = 'climb') => addFoe(s, 'creeper', f, x, { temper });

function advance(u, speed, climbTicks) {
  u.ox = u.x;
  u.of = u.f;
  if (u.climb > 0) {
    if (--u.climb === 0) {
      const st = u.path.shift();
      u.f = st.f;
      u.x = st.x;
      u.of = u.f;
      u.ox = u.x;
    }
    return;
  }
  let budget = speed * DT;
  while (u.path.length && budget > EPS) {
    const st = u.path[0];
    if (st.climb) {
      u.climb = climbTicks;
      u.climbTotal = climbTicks;
      return;
    }
    const dx = st.x - u.x;
    if (Math.abs(dx) <= budget) {
      u.x = st.x;
      budget -= Math.abs(dx);
      u.path.shift();
    } else {
      u.x += Math.sign(dx) * budget;
      budget = 0;
    }
  }
}

function nightTick(s) {
  const n = s.night;
  const T = s.tuning;
  s.t++;
  carryLanterns(s);
  const L = lightMap(geo(s), T, n.candles);
  L.stood = stood(s, L);
  spawnFoes(s, L);
  biggestTide(s);
  const burn = n.omen?.id === 'still' ? T.stillBurn * DT : DT;
  for (const c of n.candles) c.wax -= burn;
  for (const h of n.foes) {
    if (h.type !== 'hollow' || h.hp <= 0 || h.climb) continue;
    for (const c of n.candles) if (c.f === h.f && Math.abs(c.x - h.x) <= T.hollowReach && !L.stood.has(c.id)) c.wax -= T.hollowEat * DT;
  }
  for (const d of [...s.shades]) if (canWork(d) && s.shades.includes(d)) shadeTick(s, L, d);
  for (const f of [...n.foes]) foeTick(s, L, f);
  if (n.errands?.length) errandTick(s, L);
  if (s.phase !== 'night') return;
  for (const f of n.foes) if (f.hp <= 0) foeDown(s, f);
  n.foes = n.foes.filter((f) => f.hp > 0);
  for (const c of n.candles) if (c.wax <= 0) cue(s, 'snuff', c.f, c.x);
  n.candles = n.candles.filter((c) => c.wax > 0);
  if (s.t >= nightTicks(s)) endNight(s);
}

// Lanterns go where their shades go; one whose shade can't carry it any more (caught, gone, faded) is left
// where it is, burning as a candle.
function carryLanterns(s) {
  for (const k of s.night.candles) {
    if (!k.carrier) continue;
    const d = byId(s.shades, k.carrier);
    if (!d || !canWork(d) || d.grabbedBy) {
      delete k.carrier;
      continue;
    }
    k.f = d.f;
    k.x = d.x;
  }
}
// Tonight's errands. An echo or a relic is taken by the first shade to reach it. A sleepwalker comes out of
// the sleepers' twin at its hour and makes for the nearest rift. A shade that reaches them, or light, sends
// them back to bed; the Unlit hold them in the dark, and held too long, or at the rift, they die in their
// sleep.
function errandTick(s, L) {
  const T = s.tuning;
  const n = s.night;
  const G = geo(s);
  const at = (e, u, r) => u.f === e.f && !u.climb && Math.abs(u.x - e.x) <= r;
  for (const e of n.errands) {
    if (e.done) continue;
    if (e.kind === 'sleeper') {
      const p = byId(s.living, e.who);
      if (!p) {
        e.done = 'gone';
        continue;
      }
      if (!e.out) {
        if (s.t < e.at) continue;
        e.out = true;
        Object.assign(e, { ox: e.x, of: e.f, path: [], climb: 0, climbTotal: 0 });
        const r = route(G, L, e, MAP.rifts.map((rf) => ({ f: G.deep, x: rf.x })));
        e.path = r ? r.path : [];
        say(s, `${e.name} is sleepwalking in the Tain, out of the ${TWINS[typeAt(G, e.f, e.x) || 'hearth'].name}, making for the Deep. Send a shade, or light their way.`, 'bad', true);
        cue(s, 'warn', e.f, e.x);
      }
      if (!e.held) advance(e, T.sleepSpeed, Math.round(T.shadeClimb * 2 * TICKS_PER_SEC));
      if (e.climb) continue;
      // A shade that reaches them walks them back; light wakes them.
      const where = TWINS[typeAt(G, e.f, e.x) || 'hearth'].name;
      const saver = s.shades.find((d) => canWork(d) && !d.grabbedBy && at(e, d, 3));
      const lit = isLit(L, e.f, e.x);
      if (saver || lit) {
        e.done = 'saved';
        e.by = saver ? saver.name : null;
        say(s, saver ? `${saver.name} finds ${e.name} sleepwalking in the Tain and walks them back to bed.` : `${e.name} wakes in the light in the ${where} and finds their way back to bed.`, 'good', true);
        cue(s, 'good', e.f, e.x);
        continue;
      }
      // Caught in the dark, they're held, not taken at once: sleepHold seconds in all, while light or a shade
      // can still reach them.
      const holder = n.foes.find((c) => c.hp > 0 && (c.type === 'creeper' || c.type === 'wraith') && at(e, c, 2.5));
      if (holder && !e.held) {
        say(s, `A ${holder.type === 'wraith' ? 'Wraith' : 'Creeper'} has caught ${e.name}, sleepwalking in the dark of the ${where}. Light them or reach them within ${fmt(Math.max(0, T.sleepHold - (e.heldFor || 0)))} seconds.`, 'bad', true);
        cue(s, 'caught', e.f, e.x);
      }
      e.held = holder ? holder.id : null;
      if (holder) e.heldFor = (e.heldFor || 0) + DT;
      const caught = holder && e.heldFor >= T.sleepHold - 1e-9;
      const deep = !e.path.length && e.f === G.deep;
      if (caught || deep) {
        e.done = 'lost';
        keepMoment(s, 'sleeper', e, `${e.name} died sleepwalking in the ${where}.`);
        kill(s, p, 'sleep', caught ? 'was caught by the Unlit, sleepwalking in the Tain' : 'walked into the Deep in their sleep');
      }
      continue;
    }
    const d = s.shades.find((x) => canWork(x) && !x.grabbedBy && at(e, x, 3));
    if (!d) continue;
    e.done = 'taken';
    e.by = d.name;
    if (e.kind === 'echo') {
      d.memory = Math.min(100, Math.round((d.memory + T.echoMemory) * 100) / 100);
      say(s, `${d.name} finds an echo in the ${twinAt(G, e.f, e.x).name}, a memory come loose, and takes it in: +${fmt(T.echoMemory)} memory.`, 'good', true);
    } else {
      gain(s, 'glass', T.relicGlass);
      say(s, `${d.name} brings back a relic from the dark of the ${twinAt(G, e.f, e.x).name}: ${fmt(T.relicGlass)} glass.`, 'good', true);
    }
    cue(s, 'good', e.f, e.x);
  }
}
// The candles whose light a Loyal shade is standing in: nothing gnaws, smashes or eats them while it stands.
function stood(s, L) {
  const ids = new Set();
  for (const d of s.shades) {
    if (!acting(s, d, 'stand') || !canWork(d) || d.climb) continue;
    for (const [a, b, id] of L.spans[d.f]) if (d.x >= a - EPS && d.x <= b + EPS) ids.add(id);
  }
  return ids;
}

function spawnFoes(s, L) {
  const n = s.night;
  while (n.spawns.length && n.spawns[0].at <= s.t) {
    const sp = n.spawns.shift();
    if (sp.type === 'drowned') {
      riseDrowned(s, sp);
      continue;
    }
    const open = MAP.rifts.filter((r) => !n.wards.includes(r.id));
    const rift = open.find((r) => r.id === sp.rift) || open[0] || null;
    let at = null;
    let seeped = null;
    if (sp.type === 'creeper' && (sp.seep || !rift)) {
      const dark = darkRooms(geo(s), L);
      if (dark.length) {
        const [f, id, a, b] = pick(s, dark);
        at = { f, x: a + (b - a) * (0.25 + 0.5 * rand(s)) };
        say(s, `The Unlit seep up in the ${TWINS[typeOf(geo(s), id)].name}. It has no candle.`, 'bad', n.foes.length < 3);
        cue(s, 'seep', at.f, at.x);
        seeped = { at, text: `The Unlit seeped up in the dark of the ${TWINS[typeOf(geo(s), id)].name}.` };
      } else if (!rift) {
        // Every rift warded and every room lit: they come up wherever the light doesn't reach.
        const gaps = darkGaps(geo(s), L);
        if (gaps.length) {
          const [f, a, b] = pick(s, gaps);
          at = { f, x: (a + b) / 2 };
        }
      }
    }
    // A Weeper seeps up in the dark of the sleepers' twin, if there's any dark there; if not, at its rift.
    if (sp.type === 'weeper') {
      const spots = weeperSpots(s, L);
      if (spots.length) at = pick(s, spots);
      say(s, `A Weeper rises for the day's dead${at ? ` in the ${twinAt(geo(s), at.f, at.x).name}` : ''}. In the dark there it gives the sleepers nightmares.`, 'bad', true);
      cue(s, 'weep', at?.f, at?.x);
    }
    // Wards can't hold the new moon or a Maw: they break up through their rift whatever seals it.
    if (!at) at = { f: DEEP_FLOOR, x: (rift || byId(MAP.rifts, sp.rift)).x };
    const foe = addFoe(s, sp.type, at.f, at.x, { temper: sp.snuff ? 'snuff' : 'climb' });
    if (sp.weak) foe.hp = foe.max = foe.hp * sp.weak; // the tutorial's Maw
    if (seeped) keepMoment(s, 'seep', seeped.at, seeped.text);
    n.stats.spawned++;
    if (sp.type === 'maw') {
      n.stats.maws++;
      n.foes[n.foes.length - 1].rising = Math.round(s.tuning.mawRise * TICKS_PER_SEC);
      const side = at.x < MAP.W / 2 ? 'left' : 'right';
      say(s, `A Maw is hauling itself out of the ${side} rift. It will go for whatever is worth most for the least fight.`, 'bad', true);
      cue(s, 'maw', at.f, at.x);
    }
    if (sp.type === 'hollow') {
      n.stats.hollow = 'rose';
      say(s, 'The Hollow rises out of the Deep. It eats the light around it and makes for the mirrors.', 'bad', true);
      cue(s, 'hollow', at.f, at.x);
    }
  }
}

// One of the Drowned comes up out of its end of the moat's twin, unless a ward there keeps it under.
function riseDrowned(s, sp) {
  const n = s.night;
  const G = geo(s);
  if (n.wards.includes('moat')) {
    n.stats.under++;
    return;
  }
  const w = byId(MAP.moat, sp.rift) || MAP.moat[0];
  addFoe(s, 'drowned', G.veil, w.x);
  n.stats.spawned++;
  const first = !n.stats.drowned;
  n.stats.drowned++;
  const room = TWINS[typeAt(G, G.veil, w.x)]?.name || 'dark';
  say(s, `One of the Drowned comes up out of the moat's twin in the ${room}${G.n > 1 ? ', behind the line' : ''}. It makes for the mirrors, and drags any shade it catches in the dark down into the moat.`, 'bad', first);
  cue(s, 'drowned', G.veil, w.x);
}

function drainShade(s, d, amount) {
  amount *= shadeTrait(s, d)?.drain ?? 1; // the Reckless lose themselves faster
  d.memory -= amount;
  d.drained += amount;
  s.night.stats.drained += amount;
  if (d.memory <= 0) fadeAway(s, d, `${d.name} was drained to nothing in the ${TWINS[typeAt(geo(s), d.f, d.x) || 'crypt'].name} and is gone.`, 'drained');
}

function shadeTick(s, L, d) {
  const T = s.tuning;
  const n = s.night;
  const K = KINDS[d.kind];
  if (d.grabbedBy) {
    const f = byId(n.foes, d.grabbedBy);
    if (!f || f.grab !== d.id || n.hush || acting(s, d, 'pass')) {
      d.grabbedBy = null;
      if (f && f.grab === d.id) f.grab = null;
    } else {
      drainShade(s, d, (f.type === 'wraith' ? T.wraithDrain : T.drainPerSec) * DT);
      return;
    }
  }
  if (d.dragged) {
    // Let go by the Drowned somewhere along the way to the moat: back to its post.
    d.dragged = false;
    const r = !d.climb && route(geo(s), L, d, [d.post]);
    if (r) d.path = r.path;
  }
  advance(d, T.shadeSpeed * K.speed, Math.round(T.shadeClimb * TICKS_PER_SEC));
  if (d.climb || n.hush) return;
  const p = perf(d);
  const S = shadeTrait(s, d);
  // Hold: a shade in light defends that light, stepping to whichever edge is attacked, never past it.
  const span = !d.path.length && spanAt(L, d.f, d.x);
  if (span) {
    const threat = n.foes
      .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && c.x >= span[0] - 5 && c.x <= span[1] + 5)
      .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
    const home = d.post.f === d.f && d.post.x >= span[0] && d.post.x <= span[1] ? d.post.x : d.x;
    const goal = threat ? clamp(threat.x, span[0] + 1, span[1] - 1) : home;
    const stepPx = T.shadeSpeed * K.speed * DT;
    d.x = Math.abs(goal - d.x) <= stepPx ? goal : d.x + Math.sign(goal - d.x) * stepPx;
  }
  // A Reckless shade lunges: it strikes from further out of its light's edge.
  const foe = n.foes
    .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && Math.abs(c.x - d.x) <= T.reach + (S?.reach || 0))
    .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
  if (foe) {
    foe.hp -= T.fightDps * K.fight * p * (n.steel ? T.steelFight : 1) * (S?.fight ?? 1) * (acting(s, d, 'stand') ? T.standFight : 1) * DT;
    foe.lastHit = d.id;
    return;
  }
  if (d.path.length || d.post.f !== d.f || Math.abs(d.post.x - d.x) > 1.5 || !isLit(L, d.f, d.x)) return;
  const id = roomAt(geo(s), d.f, d.x);
  if (n.broken.includes(id)) return;
  const room = typeOf(geo(s), id);
  const job = room && TWINS[room].job;
  // Guarding the line is keeping watch: in the guard light the Watch's is the only work a shade does.
  if (T.lineGuard && job !== 'watch' && guardLit(geo(s), L, d.f, d.x)) return;
  const w = K.work * p * (isTwinnedShade(s, d) ? T.twinMult : 1) * (S?.work ?? 1) * DT;
  if (job === 'essence') {
    const sung = T.essencePerSec * w * (S?.essence ?? 1) * (n.omen?.id === 'thin' ? T.thinChoir : 1);
    gain(s, 'essence', sung);
    n.stats.essence += sung;
    d.sang++;
  } else if (job === 'glass') {
    gain(s, 'glass', T.glassPerSec * w);
    n.stats.glass += T.glassPerSec * w;
  } else if (job === 'wick') n.stats.wick += T.wickPerSec * w;
  else if (job === 'guidance') n.stats.guidance += T.guidePerSec * w;
  else if (job === 'watch') d.watch++;
  else if (job === 'rest' && S?.rests !== false) d.rest++;
  else if (job === 'dreams') d.dreamed = (d.dreamed || 0) + 1;
  else if (job === 'steel') d.forged = (d.forged || 0) + 1;
}

function foeTick(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  if (c.hp <= 0 || s.phase !== 'night') return;
  c.gnawing = false;
  if (c.type === 'hollow') {
    hollowTick(s, L, c);
    return;
  }
  if (c.type === 'maw') {
    mawTick(s, L, c);
    return;
  }
  if (c.type === 'weeper') {
    weeperTick(s, L, c);
    return;
  }
  if (c.type === 'drowned') {
    drownedTick(s, L, c);
    return;
  }
  const lit = !c.climb && isLit(L, c.f, c.x);
  if (c.grab) {
    const d = byId(s.shades, c.grab);
    if (!d || d.grabbedBy !== c.id || n.hush || lit) {
      if (d && d.grabbedBy === c.id) d.grabbedBy = null;
      c.grab = null;
      c.replan = 0;
    } else return;
  }
  if (lit) {
    c.hp -= T.burnDps * (c.type === 'wraith' ? 0.5 : 1) * DT;
    if (c.mode !== 'flee') {
      c.mode = 'flee';
      c.path = fleePath(L, c);
      c.replan = 10;
    }
  }
  if (--c.replan <= 0 && !c.climb) plan(s, L, c);
  advance(c, c.type === 'wraith' ? T.wraithSpeed : T.creeperSpeed, Math.round(T.creeperClimb * TICKS_PER_SEC));
  if (c.climb) return;
  if (c.type === 'creeper' && c.f === geo(s).veil) {
    const m = MAP.mirrors.find((x) => Math.abs(x.x - c.x) < 2);
    if (m) {
      cross(s, c, m, 1);
      return;
    }
  }
  if (c.mode === 'hunt' && !n.hush) {
    const d = byId(s.shades, c.prey);
    if (d && canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) < 2.5 && !isLit(L, d.f, d.x) && !acting(s, d, 'pass')) {
      c.grab = d.id;
      c.path = [];
      d.grabbedBy = c.id;
      d.path = [];
      n.stats.grabbed++;
      const caught = `${c.type === 'wraith' ? 'A Wraith' : 'A Creeper'} has caught ${d.name} in the dark of the ${TWINS[typeAt(geo(s), d.f, d.x) || 'crypt'].name}.`;
      keepMoment(s, 'caught', d, caught);
      say(s, caught, 'bad', true);
      cue(s, 'caught', d.f, d.x);
    }
  }
  if (c.mode === 'gnaw' && !c.path.length) {
    const k = byId(n.candles, c.gnaw);
    if (k && touching(geo(s), L, c, k.id)) {
      if (!L.stood?.has(k.id)) k.wax -= T.gnawRate * (c.type === 'wraith' ? 2 : 1) * (n.omen?.id === 'still' ? T.stillGnaw : 1) * DT;
      c.gnawing = true;
    } else c.replan = 0;
  }
}

// What crossing a light costs a Creeper's way up when it is choosing which light to gnaw: more than any
// walk, so the way that crosses the fewest lights wins.
const LIT_COST = 1000;
// Where a Creeper or Wraith at c would go now: out of the light, after a shade in the dark near it, to a
// candle's edge (a candle hunter's nearest, or the light that bars its way up), up a dark way to a mirror,
// or nowhere. Pure: plan() follows it, and the dusk preview (threats.js) shows it.
export function wayOf(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  if (isLit(L, c.f, c.x)) return { mode: 'flee', path: fleePath(L, c) };
  // A Stranger's Lure: everything on its floor within reach comes for it, into its light if it stands in one.
  const lure = !n.hush && s.phase === 'night' && s.shades.find((d) => acting(s, d, 'lure') && canWork(d) && !d.climb && d.f === c.f && Math.abs(d.x - c.x) <= T.lureReach);
  if (lure) return { mode: 'hunt', prey: lure.id, path: [{ f: c.f, x: lure.x }] };
  const sleeper = !n.hush && c.type !== 'drowned' && n.errands?.find((e) => e.kind === 'sleeper' && e.out && !e.done && !e.climb && e.f === c.f && Math.abs(e.x - c.x) <= T.senseRange && !isLit(L, e.f, e.x) && darkBetween(L, c.f, c.x, e.x));
  if (sleeper) return { mode: 'hunt', prey: sleeper.id, path: [{ f: c.f, x: sleeper.x }] };
  if (!n.hush) {
    const prey = preyNear(s, L, c, c.x, c.x);
    if (prey) return { mode: 'hunt', prey: prey.id, path: [{ f: c.f, x: prey.x }] };
  }
  if (c.type === 'drowned') return drownedWay(L, c);
  if (c.temper === 'snuff') {
    const edges = [];
    for (let f = 0; f < L.spans.length; f++) {
      for (const [a, b, id] of L.spans[f]) for (const x of [a - GNAW_GAP, b + GNAW_GAP]) if (x >= MAP.LEFT && x <= MAP.RIGHT - 1 && !isLit(L, f, x)) edges.push({ f, x, candle: id });
    }
    const to = edges.length && route(geo(s), L, c, edges, { creeper: true, wards: n.wards });
    if (to) return { mode: 'gnaw', gnaw: to.goal.candle, path: to.path };
  }
  if (c.type === 'wraith') return { mode: 'idle', path: [] };
  const r = route(geo(s), L, c, mirrorGoals(geo(s)), { creeper: true, wards: n.wards });
  if (r) return { mode: 'climb', path: r.path };
  // Cut off: gnaw the light that bars the way. With goAround, the way that crosses the fewest lights, so a
  // light with a dark way around it is passed by; without, whatever light the shortest way meets first.
  const open = route(geo(s), L, c, mirrorGoals(geo(s)), { creeper: true, ignoreLight: true, wards: n.wards, litCost: T.goAround ? LIT_COST : 0 });
  const cut = open && firstLight(L, c, open.path);
  if (!cut) return { mode: 'idle', path: [] };
  return { mode: 'gnaw', gnaw: cut.candle, path: cut.path };
}
// The nearest shade a Creeper or Wraith on c's floor, anywhere from x0 to x1, would go after: in the dark,
// within its sense, with nothing lit between.
export function preyNear(s, L, c, x0, x1) {
  const sense = c.type === 'wraith' ? 40 : s.tuning.senseRange;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const from = (d) => clamp(d.x, lo, hi);
  return s.shades
    .filter((d) => canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - from(d)) <= sense && !isLit(L, d.f, d.x) && darkBetween(L, c.f, from(d), d.x) && !shadeTrait(s, d)?.unseen && !acting(s, d, 'pass'))
    .sort((a, b) => Math.abs(a.x - from(a)) - Math.abs(b.x - from(b)))[0];
}
function plan(s, L, c) {
  c.replan = 5;
  const w = wayOf(s, L, c);
  c.mode = w.mode;
  c.path = w.path;
  if (w.mode === 'hunt') c.prey = w.prey;
  else if (w.mode === 'gnaw') c.gnaw = w.gnaw;
  else if (w.mode === 'climb') c.gnaw = null;
}

// One of the Drowned never leaves the floor under the Veil: it walks to the nearest mirror it can reach in
// the dark, or else to the light barring its way to the nearest mirror, to gnaw it.
function drownedWay(L, c) {
  const ms = [...MAP.mirrors].sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
  const open = ms.find((m) => darkBetween(L, c.f, c.x, m.x));
  if (open) return { mode: 'climb', path: [{ f: c.f, x: open.x }] };
  const cut = firstLight(L, c, [{ f: c.f, x: ms[0].x }]);
  return cut ? { mode: 'gnaw', gnaw: cut.candle, path: cut.path } : { mode: 'idle', path: [] };
}
const moatNear = (x) => MAP.moat.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));

// The Drowned (a rainy night). Light makes one let go, and burns it, less than a Creeper; a shade cuts it
// down. A shade it has caught it drags toward the nearer end of the moat's twin, and there pulls it under:
// the shade is gone, and so is it. Otherwise it goes its way (drownedWay), catching any shade in the dark on
// the way, and one that reaches a mirror cracks the Veil.
function drownedTick(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  const lit = isLit(L, c.f, c.x);
  if (c.grab) {
    const d = byId(s.shades, c.grab);
    if (!d || d.grabbedBy !== c.id || n.hush || lit) {
      if (d && d.grabbedBy === c.id) d.grabbedBy = null;
      c.grab = null;
      c.replan = 0;
    } else {
      const w = moatNear(c.x);
      const stepPx = T.drownedDrag * DT;
      c.ox = c.x;
      c.of = c.f;
      c.x = Math.abs(w.x - c.x) <= stepPx ? w.x : c.x + Math.sign(w.x - c.x) * stepPx;
      Object.assign(d, { ox: d.x, of: d.f, x: c.x, dragged: true });
      if (c.x === w.x) {
        n.foes = n.foes.filter((x) => x !== c);
        n.stats.pulled++;
        fadeAway(s, d, `${d.name} was dragged down into the moat's twin by the Drowned and is gone.`, 'drowned');
      }
      return;
    }
  }
  if (lit) {
    c.hp -= T.burnDps * T.drownedBurn * DT;
    if (c.mode !== 'flee') {
      c.mode = 'flee';
      c.path = fleePath(L, c);
      c.replan = 10;
    }
  }
  if (--c.replan <= 0) plan(s, L, c);
  advance(c, T.drownedSpeed, 1);
  const m = MAP.mirrors.find((x) => Math.abs(x.x - c.x) < 2);
  if (m) {
    cross(s, c, m, 1);
    return;
  }
  if (c.mode === 'hunt' && !n.hush) {
    const d = byId(s.shades, c.prey);
    if (d && canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) < 2.5 && !isLit(L, d.f, d.x) && !acting(s, d, 'pass')) {
      c.grab = d.id;
      c.path = [];
      d.grabbedBy = c.id;
      d.path = [];
      n.stats.grabbed++;
      const caught = `One of the Drowned has caught ${d.name} in the dark of the ${TWINS[typeAt(geo(s), d.f, d.x) || 'crypt'].name} and is dragging them to the moat.`;
      keepMoment(s, 'caught', d, caught);
      say(s, `${caught} Light the spot to make it let go.`, 'bad', true);
      cue(s, 'caught', d.f, d.x);
    }
  }
  if (c.mode === 'gnaw' && !c.path.length) {
    const k = byId(n.candles, c.gnaw);
    if (k && touching(geo(s), L, c, k.id)) {
      k.wax -= T.gnawRate * T.drownedGnaw * (n.omen?.id === 'still' ? T.stillGnaw : 1) * DT;
      c.gnawing = true;
    } else c.replan = 0;
  }
}

// The Weepers' rooms: the twins of where the living sleep, the Dreamwells, or the Cold Hearth in a keep
// without Quarters; and every dark spot in them.
export function weeperRooms(s) {
  const G = geo(s);
  const q = roomsOf(G, 'quarters');
  return q.length ? q : roomsOf(G, 'hearth');
}
export function weeperSpots(s, L) {
  const out = [];
  for (const r of weeperRooms(s)) for (let x = r.x0 + 3; x <= r.x1 - 3; x += 2) if (!isLit(L, r.f, x)) out.push({ f: r.f, x });
  return out;
}
// A Weeper drifts to the dark of the sleepers' twin and weeps there. Once it has wept its fill it gives one
// of the living asleep above a nightmare and sinks away. It catches no one and gnaws nothing. Light burns it
// and turns it back, a shade cuts it down, and a Keening shade on its floor sings it quiet.
function weeperTick(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  const lit = !c.climb && isLit(L, c.f, c.x);
  if (lit) {
    c.hp -= T.burnDps * DT;
    if (c.mode !== 'flee') {
      c.mode = 'flee';
      c.path = fleePath(L, c);
      c.replan = 10;
    }
  } else if (!c.climb && weeperRooms(s).some((r) => r.id === roomAt(geo(s), c.f, c.x))) {
    c.mode = 'weep';
    c.path = [];
    c.quiet = s.shades.some((d) => canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && shadeTrait(s, d)?.hushes);
    if (!c.quiet) c.wept = (c.wept || 0) + DT;
    if (c.wept >= T.nightmareSecs) {
      n.nightmares = (n.nightmares || 0) + 1;
      n.foes.splice(n.foes.indexOf(c), 1);
      say(s, `A Weeper has wept its fill in the ${twinAt(geo(s), c.f, c.x).name} and sinks away. Someone asleep above will wake from a nightmare.`, 'bad');
      cue(s, 'nightmare', c.f, c.x);
    }
    return;
  }
  if (--c.replan <= 0 && !c.climb) {
    c.replan = 10;
    const spots = weeperSpots(s, L);
    const r = spots.length && route(geo(s), L, c, spots, { creeper: true, wards: n.wards });
    c.mode = r ? 'drift' : 'idle';
    c.path = r ? r.path : [];
  }
  advance(c, T.weeperSpeed, Math.round(T.creeperClimb * TICKS_PER_SEC));
}

// A Maw weighs what it could wreck against the fight it would meet: the candle barring the Creepers' way up
// (where their path first meets light, worth mawLine to it) and every twin room where the living work by
// day or the dead work tonight (worth its workers). The fight is every shade standing at the target or near
// the way there. It goes for the most worth for the least fight, the nearest of those, and keeps to its
// choice once on that floor, or unless something else becomes worth twice as much. Light doesn't burn it;
// wards on the stairs stop it. It tears a candle down; it breaks a room by standing in it mawBreak seconds.
// So a line held thick only moves it on to whatever the line left bare.
function roomWorth(s, r) {
  const G = geo(s);
  const R = DAY_ROOMS[r.type];
  const day = R?.out && !R.outdoors ? Math.min(s.tuning.roomCap, jobCount(s, r.type) / roomsOf(G, r.type).length) : 0;
  const night = TWINS[r.type]?.job ? s.shades.filter((d) => canWork(d) && d.post && roomAt(G, d.post.f, d.post.x) === r.id).length : 0;
  return day + night;
}
function mawTargets(s, L, m) {
  const G = geo(s);
  const n = s.night;
  const out = [];
  const open = route(G, L, m, mirrorGoals(G), { creeper: true, ignoreLight: true, wards: n.wards, litCost: s.tuning.goAround ? LIT_COST : 0 });
  const cut = open && firstLight(L, m, open.path);
  const candles = [cut && byId(n.candles, cut.candle), m.target?.kind === 'candle' && byId(n.candles, m.target.id)];
  for (const k of candles) if (k && !out.some((t) => t.id === k.id)) out.push({ kind: 'candle', id: k.id, f: k.f, x: k.x, worth: s.tuning.mawLine });
  for (const r of Object.values(G.rooms)) {
    if (n.broken.includes(r.id)) continue;
    const worth = roomWorth(s, r);
    if (worth > 0) out.push({ kind: 'room', id: r.id, f: r.f, x: (r.x0 + r.x1) / 2, worth });
  }
  return out;
}
// The strength of every shade able to fight that stands at the target or within reach of the way there.
function fightOnWay(s, from, path, t) {
  const G = geo(s);
  const near = s.tuning.reach + 2;
  const legs = [];
  let f = from.f;
  let x = from.x;
  for (const st of path) {
    if (!st.climb) legs.push([f, Math.min(x, st.x) - near, Math.max(x, st.x) + near]);
    f = st.f;
    x = st.x;
  }
  let g = 0;
  for (const d of s.shades) {
    if (!canWork(d) || d.grabbedBy || d.climb) continue;
    const at = d.f === t.f && (t.kind === 'candle' ? Math.abs(d.x - t.x) <= 8 : roomAt(G, d.f, d.x) === t.id);
    if (at || legs.some(([lf, a, b]) => d.f === lf && d.x >= a && d.x <= b)) g += KINDS[d.kind].fight * perf(d);
  }
  return g;
}
export function mawPick(s, L, m) {
  const G = geo(s);
  const all = [];
  for (const t of mawTargets(s, L, m)) {
    const r = route(G, L, m, [{ f: t.f, x: t.x }], { creeper: true, ignoreLight: true, wards: s.night.wards });
    if (!r) continue;
    const guard = fightOnWay(s, m, r.path, t);
    all.push({ ...t, path: r.path, cost: r.cost, guard, score: t.worth / (1 + guard) });
  }
  if (!all.length) return null;
  const cur = m.target && all.find((t) => t.kind === m.target.kind && t.id === m.target.id);
  const best = Math.max(...all.map((t) => t.score));
  if (cur && (m.f === cur.f || 2 * cur.score >= best)) return cur;
  return all.filter((t) => t.score >= 0.9 * best).sort((a, b) => a.cost - b.cost)[0];
}
// What a haunting costs, in words: Dread at dawn, and the day's work if the tuning takes it.
function hauntCost(s) {
  const T = s.tuning;
  const work = T.hauntWork < 1 ? `, and tomorrow its workers manage ${Math.round(100 * T.hauntWork)}%` : '';
  return `${T.dreadPerBroken} Dread at dawn${work}`;
}
function breakRoom(s, m, id) {
  const n = s.night;
  const G = geo(s);
  const type = typeOf(G, id);
  n.broken.push(id);
  keepMoment(s, 'broken', m, `A Maw broke the ${TWINS[type].name}.`);
  say(s, `A Maw has broken the ${TWINS[type].name}. Nobody works there tonight, and the ${DAY_ROOMS[type].name} is haunted: ${hauntCost(s)}.`, 'bad', true);
  cue(s, 'broken', m.f, m.x);
  m.target = null;
  m.breaking = 0;
  m.replan = 0;
}
function mawTick(s, L, m) {
  const T = s.tuning;
  const n = s.night;
  const G = geo(s);
  // Hauling itself out of the rift: it can be hit, but it neither moves nor strikes yet.
  if ((m.rising || 0) > 0) {
    m.rising--;
    return;
  }
  if (!n.hush) {
    for (const d of s.shades) {
      if (canWork(d) && s.shades.includes(d) && !d.climb && d.f === m.f && Math.abs(d.x - m.x) <= 3) drainShade(s, d, T.mawHit * DT);
    }
  }
  if (!m.climb && --m.replan <= 0) {
    m.replan = 10;
    const to = mawPick(s, L, m);
    if (!to || !m.target || to.kind !== m.target.kind || to.id !== m.target.id) {
      m.breaking = 0;
      m.smashing = false;
    }
    m.target = to ? { kind: to.kind, id: to.id, f: to.f, x: to.x } : null;
    m.gnaw = to?.kind === 'candle' ? to.id : null;
    m.path = to ? to.path : [];
    m.mode = to ? (to.kind === 'candle' ? 'smash' : 'break') : 'idle';
  }
  const tg = m.target;
  if (tg && !m.climb && !m.path.length && m.f === tg.f) {
    const k = tg.kind === 'candle' && byId(n.candles, tg.id);
    if (k && Math.abs(k.x - m.x) <= 2) {
      if (!m.smashing) {
        m.smashing = true;
        keepMoment(s, 'smash', k, `A Maw is tearing down the ${k.carrier ? 'lantern' : 'candle'} in the ${twinAt(G, k.f, k.x).name}.`);
        say(s, `A Maw is tearing down the ${k.carrier ? 'lantern' : 'candle'} in the ${twinAt(G, k.f, k.x).name}.`, 'bad', true);
        cue(s, 'smash', k.f, k.x);
      }
      if (!L.stood?.has(k.id)) k.wax -= T.mawSmash * DT;
      m.gnawing = true;
      if (k.wax <= 0) {
        n.stats.smashed++;
        m.smashing = false;
        m.replan = 0;
      }
      return;
    }
    if (tg.kind === 'room' && roomAt(G, m.f, m.x) === tg.id) {
      const type = typeOf(G, tg.id);
      if (!m.breaking) {
        say(s, `A Maw is breaking the ${TWINS[type].name}. Cut it down, or the ${DAY_ROOMS[type].name} is haunted: ${hauntCost(s)}.`, 'bad', true);
        cue(s, 'breaking', m.f, m.x);
      }
      m.breaking = (m.breaking || 0) + 1;
      m.gnawing = true;
      if (m.breaking >= Math.round(T.mawBreak * TICKS_PER_SEC)) breakRoom(s, m, tg.id);
      return;
    }
  }
  advance(m, T.mawSpeed, Math.round(T.creeperClimb * 2 * TICKS_PER_SEC));
}

// The Hollow makes for the mirrors whatever the light, eating candles and draining shades as it goes.
// A ward on a stair only holds it a while; only shades standing and fighting drive it back.
function hollowTick(s, L, h) {
  const T = s.tuning;
  const n = s.night;
  if (!n.hush) {
    for (const d of s.shades) {
      if (canWork(d) && s.shades.includes(d) && !d.climb && d.f === h.f && Math.abs(d.x - h.x) <= 5) drainShade(s, d, T.hollowDrain * DT);
    }
  }
  if (!h.climb && --h.replan <= 0) {
    h.replan = 10;
    h.batter = null;
    let r = route(geo(s), L, h, mirrorGoals(geo(s)), { creeper: true, ignoreLight: true, wards: n.wards });
    if (!r) {
      // Every way up is warded: go and break the nearest ward.
      const open = route(geo(s), L, h, mirrorGoals(geo(s)), { creeper: true, ignoreLight: true });
      const i = open ? open.path.findIndex((st) => st.climb && n.wards.includes(st.climb)) : -1;
      if (i >= 0) {
        h.batter = open.path[i].climb;
        r = { path: open.path.slice(0, i) };
      }
    }
    h.path = r ? r.path : [];
    h.mode = h.batter ? 'batter' : r ? 'climb' : 'idle';
  }
  if (h.batter && !h.path.length) {
    h.gnawing = true;
    n.wardHold[h.batter] = (n.wardHold[h.batter] ?? T.wardHold) - DT;
    if (n.wardHold[h.batter] <= EPS) {
      n.wards = n.wards.filter((w) => w !== h.batter);
      delete n.wardHold[h.batter];
      say(s, 'The Hollow breaks the ward on the stair.', 'bad', true);
      cue(s, 'ward-break', h.f, h.x);
      h.batter = null;
      h.replan = 0;
      for (const c of n.foes) c.replan = 0;
    }
    return;
  }
  advance(h, T.hollowSpeed, Math.round(T.creeperClimb * 2 * TICKS_PER_SEC));
  if (h.climb || h.f !== geo(s).veil) return;
  const m = MAP.mirrors.find((x) => Math.abs(x.x - h.x) < 2);
  if (m) cross(s, h, m, T.hollowCracks);
}

function cross(s, c, m, cracks) {
  const n = s.night;
  const where = twinAt(geo(s), geo(s).veil, m.x).name;
  const who = c.type === 'drowned' ? 'One of the Drowned' : 'A Creeper';
  if (!veilKept(s) && s.cracks + cracks >= s.tuning.cracksMax) keepMoment(s, 'broke', { f: c.f, x: m.x }, `${c.type === 'hollow' ? 'The Hollow' : who} broke the Veil at the mirror in the ${where}.`);
  else keepMoment(s, c.type === 'hollow' ? 'torn' : 'crack', { f: c.f, x: m.x }, c.type === 'hollow' ? `The Hollow reached the mirror in the ${where}.` : `${who} slipped through the Veil at the mirror in the ${where}.`);
  n.foes = n.foes.filter((x) => x !== c);
  s.cracks += cracks;
  n.stats.crossed++;
  n.stats.cracks += cracks;
  if (c.type === 'hollow') {
    n.stats.hollow = 'crossed';
    say(s, `The Hollow reached the mirror in the ${where} and tore through the Veil: ${cracks} cracks.`, 'bad', true);
    cue(s, 'torn', c.f, m.x);
    if (s.cracks < s.tuning.cracksMax && s.living.length) takeLiving(s, pick(s, s.living));
  } else if (veilKept(s) && s.cracks >= s.tuning.cracksMax) {
    // The tutorial's first nights: the Veil holds by a thread.
    s.cracks = s.tuning.cracksMax - 1;
    say(s, `${who} slipped through the Veil at the mirror in the ${where}. The Veil holds by a thread; from night ${TUTORIAL.safeUntil}, that would break it and lose the keep.`, 'bad', true);
    cue(s, 'crack', c.f, m.x);
  } else {
    say(s, `${who} slipped through the Veil at the mirror in the ${where}. The Veil cracks: ${s.cracks} of ${s.tuning.cracksMax}.`, 'bad', true);
    cue(s, 'crack', c.f, m.x);
  }
  if (s.phase === 'night' && s.cracks >= s.tuning.cracksMax) {
    if (veilKept(s)) s.cracks = s.tuning.cracksMax - 1;
    else lose(s, 'veil', 'The Veil has broken. The Unlit are loose in the keep above.');
  }
}

/* ---------------------------------------------------------------- the night in moments */

// The night review at dawn (round five): the three moments that most decided the night, each with the Tain
// as it stood, for the page to draw. A record like the log; the rules never read it. Each kind has a weight,
// the Veil breaking the most and the biggest tide the least. A kind is kept once, at its
// first, except a shade lost (each one) and the biggest tide, which moves to each new height.
const MOMENTS = { broke: 11, torn: 10, lost: 9, crack: 8, broken: 7, 'hollow-down': 6, smash: 6, caught: 5, 'maw-down': 4, seep: 3, tide: 2 };
const SHADE_KEYS = ['id', 'name', 'kind', 'climb', 'climbTotal', 'grabbedBy', 'named', 'memory', 'mirror'];
const FOE_KEYS = ['id', 'type', 'climb', 'climbTotal', 'gnawing', 'temper', 'mode', 'quiet', 'rising', 'smashing', 'target', 'grab', 'hp', 'max'];
function frameOf(s) {
  const n = s.night;
  const unit = (u, keys) => {
    const x = Math.round(u.x * 10) / 10;
    const o = { f: u.f, x, of: u.f, ox: x };
    for (const k of keys) if (u[k] !== undefined && u[k] !== null && u[k] !== false && u[k] !== 0) o[k] = u[k];
    o.path = u.climb > 0 && u.path?.[0] ? [u.path[0]] : [];
    return o;
  };
  return {
    candles: n.candles.map((k) => ({ id: k.id, f: k.f, x: k.x, wax: Math.round(k.wax * 10) / 10, max: k.max })),
    foes: n.foes.map((u) => unit(u, FOE_KEYS)),
    shades: s.shades.filter(canWork).map((d) => unit(d, SHADE_KEYS)),
    broken: [...n.broken],
    wards: [...n.wards],
    wardHold: { ...n.wardHold },
    hush: !!n.hush,
  };
}
function keepMoment(s, kind, at, text, key = kind) {
  const n = s.night;
  if (!n || s.phase !== 'night') return;
  n.moments ||= [];
  const i = n.moments.findIndex((m) => m.key === key);
  if (i >= 0 && kind !== 'tide') return;
  const m = { key, kind, weight: MOMENTS[kind], t: s.t, f: at.f, x: Math.round(at.x), text, frame: frameOf(s) };
  if (i >= 0) n.moments[i] = m;
  else n.moments.push(m);
  n.moments.sort((a, b) => b.weight - a.weight || a.t - b.t);
  if (n.moments.length > 3) n.moments.length = 3;
}
// The most Creepers in the Tain at once, where most of them are.
function biggestTide(s) {
  const n = s.night;
  const cs = n.foes.filter((u) => u.type === 'creeper');
  if (cs.length < 2 || cs.length <= (n.peak || 0)) return;
  n.peak = cs.length;
  const by = {};
  for (const u of cs) by[u.f] = (by[u.f] || 0) + 1;
  const f = Number(Object.entries(by).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
  const on = cs.filter((u) => u.f === f);
  keepMoment(s, 'tide', { f, x: on.reduce((a, u) => a + u.x, 0) / on.length }, `The biggest tide: ${cs.length} of the Unlit in the Tain at once.`);
}
// What the page shows at dawn: the moments of the night just ended, in the order they came.
function review(s) {
  const n = s.night;
  s.review = { season: s.season, day: s.day, ticks: nightTicks(s), moments: [...(n?.moments || [])].sort((a, b) => a.t - b.t) };
}

// The Hollow, loose above the Veil, takes one of the living. No body is left to wake.
function takeLiving(s, p) {
  s.living.splice(s.living.indexOf(p), 1);
  s.today.deaths.push(p.id);
  s.ledger.push({
    id: p.id, name: p.name, from: 'living', season: s.season, day: s.day, cause: 'hollow', how: CAUSES.hollow.text, kind: null, guided: false, job: p.job,
    age: p.age, bond: bondOf(s, p.bond), joined: p.joined, woke: 'taken', end: 'taken', endDay: s.day, nights: 0, kills: 0, posts: {}, named: false, memory: null,
  });
  s.night.stats.taken = p.name;
  const q = p.bond ? byId(s.living, p.bond.with) : null;
  const grieves = q && livingTrait(s, q)?.grieves !== false;
  if (grieves) {
    q.grief = { for: p.id, mult: livingTrait(s, q)?.grief ?? s.tuning.griefMult };
    q.peace = 0;
  }
  say(s, `It came up into the keep and took ${p.name} from their bed. There is no body to wake.${grieves ? ` ${q.name} grieves.` : ''}`, 'death', true);
  cue(s, 'knell');
  if (!s.living.length) lose(s, 'fallen', 'No one living is left. The keep has fallen.');
}

function foeDown(s, f) {
  const n = s.night;
  n.stats.killed++;
  // The Hunt pays for each Maw, a blood moon for each Creeper.
  const bounty = n.omen?.id === 'hunt' && f.type === 'maw' ? s.tuning.huntEssence : n.omen?.id === 'blood' && f.type === 'creeper' ? s.tuning.bloodEssence : 0;
  if (bounty) {
    gain(s, 'essence', bounty);
    n.stats.omenEssence = (n.stats.omenEssence || 0) + bounty;
    if (f.type === 'maw') say(s, `A Maw is cut down, and the Hunt pays ${fmt(bounty)} essence.`, 'good');
  }
  if (f.type === 'creeper' || f.type === 'maw' || f.type === 'weeper' || f.type === 'drowned') cue(s, f.type === 'maw' ? 'maw-down' : 'foe-down', f.f, f.x);
  const hero = f.lastHit && ledgerOf(s, f.lastHit);
  if (hero) hero.kills = (hero.kills || 0) + 1;
  const d = f.grab && byId(s.shades, f.grab);
  if (d && d.grabbedBy === f.id) d.grabbedBy = null;
  if (f.type === 'wraith' && f.shade) {
    const w = byId(s.shades, f.shade);
    if (w) {
      s.shades.splice(s.shades.indexOf(w), 1);
      endLedger(s, w.id, 'banished');
      restFor(s, w.id, false);
      say(s, `${w.name}'s Wraith is cut down and sinks into the Deep for good.`, 'good', true);
      cue(s, 'wraith-down', f.f, f.x);
    }
  }
  if (f.type === 'maw') keepMoment(s, 'maw-down', f, 'A Maw was cut down.');
  if (f.type === 'hollow') {
    keepMoment(s, 'hollow-down', f, 'The Hollow was driven back into the Deep.');
    n.stats.hollow = 'driven back';
    gain(s, 'remembrance', s.tuning.hollowReward);
    say(s, `The Hollow is driven back into the Deep. The keep will tell of it: +${s.tuning.hollowReward} remembrance.`, 'good', true);
    cue(s, 'hollow-down', f.f, f.x);
  }
}

// Dawn: the shades sent down into the Deep come back, with quicksilver for their depth, or caught down there,
// drained and empty-handed, or not at all.
const DEPTHS = ['', 'not far down', 'deep', 'as deep as a shade can go'];
function upFromTheDeep(s) {
  const T = s.tuning;
  for (const d of s.shades.filter((x) => x.deep)) {
    const k = d.deep - 1;
    const S = shadeTrait(s, d);
    d.deep = 0;
    if (chance(s, T.deepCatch[k] * (S?.unseen ? 0.5 : 1))) {
      const lost = T.deepDrain * (S?.drain ?? 1);
      d.memory = Math.round((d.memory - lost) * 100) / 100;
      s.night.stats.deep.push({ name: d.name, depth: k + 1, caught: true, lost });
      if (d.memory <= 0) {
        s.night.stats.lost.push(d.name);
        fadeAway(s, d, `${d.name} was caught in the Deep and never came back up.`, 'deep', false);
        continue;
      }
      say(s, `${d.name} comes back up from the Deep empty-handed. Something caught it down there: −${fmt(lost)} memory.`, 'bad', true);
      cue(s, 'caught');
    } else {
      const got = T.deepSilver[k];
      gain(s, 'quicksilver', got);
      s.night.stats.deep.push({ name: d.name, depth: k + 1, silver: got });
      say(s, `${d.name} comes back up from the Deep with ${got} quicksilver.`, 'good');
      cue(s, 'good');
    }
  }
}

function fadeAway(s, d, text, how = 'faded', tonight = true) {
  if (tonight && s.phase === 'night') keepMoment(s, 'lost', d, text, `lost:${d.id}`);
  s.shades = s.shades.filter((x) => x !== d);
  for (const c of s.night?.foes || []) {
    if (c.grab === d.id) c.grab = null;
    if (c.prey === d.id) c.prey = null;
  }
  if (tonight) s.night?.stats.lost.push(d.name);
  const e = ledgerOf(s, d.id);
  if (e) e.memory = 0;
  endLedger(s, d.id, how);
  restFor(s, d.id, false);
  say(s, text, 'death', true);
  cue(s, 'fade', d.f, d.x);
}

/* ---------------------------------------------------------------- dawn */

function endNight(s) {
  const T = s.tuning;
  const n = s.night;
  const N = nightTicks(s);
  if (n.stats.hollow === 'rose') n.stats.hollow = 'withdrew';
  const withdrew = n.foes.filter((f) => f.type !== 'wraith').length;
  n.foes = [];
  n.candles = [];
  for (const d of s.shades) if (d.act) d.act = null;
  const wick = Math.floor(n.stats.wick + EPS);
  if (wick) s.res.candles += wick;
  const g = Math.floor(n.stats.guidance + EPS);
  if (g) s.guidance = Math.min(T.guidanceMax, s.guidance + g);
  upFromTheDeep(s);
  let watch = 0;
  let calm = 0;
  let steel = false;
  for (const d of s.shades) {
    if (!canWork(d)) continue;
    watch += KINDS[d.kind].fight * perf(d) * DAY_ROOMS.barracks.rate * (d.watch / N);
    if (d.sang >= N / 2) calm++;
    calm += shadeTrait(s, d)?.calms || 0;
    if ((d.forged || 0) >= N / 2) steel = true;
  }
  s.watchBonus = r1(watch);
  // Grave-steel forged through half the night arms every shade the next night.
  s.steel = steel;
  if (steel) say(s, 'Grave-steel from the Cold Forge: tomorrow night every shade fights harder.', 'good');
  if (steel) cue(s, 'forge');
  // The Restless: calmed by the Choir, or a night closer to turning Wraith.
  for (const d of s.shades.filter((x) => x.kind === 'restless').sort((a, b) => b.restless - a.restless)) {
    if (calm > 0) {
      calm--;
      continue;
    }
    d.restless++;
    if (d.restless >= T.restlessNights) {
      d.kind = 'wraith';
      d.trueKind = null;
      const e = ledgerOf(s, d.id);
      if (e) e.turned = s.day;
      say(s, `${d.name} has turned Wraith.`, 'bad', true);
      cue(s, 'wraith');
    }
  }
  // Fading. A Wistful shade that rested the night through sends the sleepers good dreams: they work better
  // the next day.
  const fading = [];
  let dreams = 0;
  for (const d of [...s.shades]) {
    if (!canWork(d)) continue;
    const S = shadeTrait(s, d);
    const rested = d.rest >= T.restShare * N;
    if (rested && S?.dreams) dreams = Math.max(dreams, S.dreams);
    // Dreaming in the Dreamwell through half the night: better still for a Wistful shade.
    if ((d.dreamed || 0) >= T.restShare * N) dreams = Math.max(dreams, S?.dreams ?? T.dreamWork);
    const loss = T.fadePerNight * (d.named ? 0.5 : 1) * (rested ? 0.5 : 1) * (S?.fade ?? 1);
    d.memory = Math.round((d.memory - loss) * 100) / 100;
    d.nights++;
    const e = ledgerOf(s, d.id);
    if (e) {
      e.nights = d.nights;
      e.memory = Math.max(0, d.memory);
      const room = postRoom(s, d);
      if (room) {
        e.posts ||= {};
        e.posts[room] = (e.posts[room] || 0) + 1;
      }
    }
    fading.push({ id: d.id, name: d.name, fade: loss, drained: Math.round(d.drained * 10) / 10, rested, memory: d.memory });
    if (d.memory <= 0) fadeAway(s, d, `${d.name} has faded. Nothing is left in the glass.`);
  }
  // What a Maw broke tonight is haunted tomorrow; good dreams last the day, and so do nightmares: one for each
  // Weeper that wept its fill in the dark.
  s.haunted = [...n.broken];
  s.dreamt = dreams || 0;
  const bad = Math.min(s.living.length, n.nightmares || 0);
  const dreamers = [];
  for (let i = 0; i < bad; i++) {
    const p = pick(s, s.living.filter((x) => !x.nightmare));
    p.nightmare = true;
    dreamers.push(p.name);
  }
  if (bad) {
    const where = roomsOf(geo(s), 'quarters').length ? 'Quarters' : 'Hearth';
    say(s, `Nightmares: ${bad}, in the ${where}. ${listNames(dreamers)} ${bad === 1 ? 'works' : 'work'} at ${Math.round(100 * T.nightmareMult)}% today.`, 'bad', true);
  }
  n.stats.nightmares = bad;
  s.today.night = { ...n.stats, broken: [...n.broken], fading, withdrew, wick, guidance: g, watch: s.watchBonus, ...(n.errands ? { errands: n.errands.map(({ kind, name, by, done }) => ({ kind, name, by, done })) } : {}), ...(n.omen ? { omen: n.omen.id } : {}) };
  const cracks = n.stats.cracks;
  review(s);
  s.night = null;
  if (s.cracks > 0) s.cracks--;
  if (s.phase === 'over') return;
  if (isNewMoon(s)) {
    endSeason(s, cracks);
    return;
  }
  toRite(s, cracks);
}

const defaultChoice = (d) => (d.kind === 'restless' ? 'release' : d.kind === 'wraith' ? 'leave' : 'keep');
export function choicesFor(d) {
  if (d.kind === 'wraith') return ['banish', 'leave'];
  if (d.kind === 'restless') return d.trueKind ? ['release', 'leave', 'bind'] : ['release', 'leave'];
  return ['keep', 'cover'];
}

// The dead ask for things: which shades ask at this rite, and what.
export function asksNow(s, d) {
  const T = s.tuning;
  const R = REQUESTS[d.kind];
  if (!T.requests || !canWork(d) || d.granted || !R) return null;
  if (d.nights < T.askAfter || (d.askedAt !== undefined && d.nights - d.askedAt < T.askEvery)) return null;
  if (R.fading && d.memory >= T.askFade) return null;
  return R.kind;
}
function toRite(s, cracks) {
  s.phase = 'dawn';
  s.t = 0;
  const asks = Object.fromEntries(s.shades.map((d) => [d.id, asksNow(s, d)]).filter(([, k]) => k));
  for (const id of Object.keys(asks)) byId(s.shades, id).askedAt = byId(s.shades, id).nights;
  s.rite = { choice: Object.fromEntries(s.shades.map((d) => [d.id, defaultChoice(d)])), vigils: 0, cracks, broken: (s.haunted || []).length, asks, grant: {} };
  say(s, 'Dawn. The Unlit withdraw and the shades go back into the glass. Decide who stays.', 'rite', true);
  cue(s, 'dawn');
}

export function ritePreview(s) {
  const R = s.rite;
  if (!R) return null;
  const T = s.tuning;
  const P = { keep: [], cover: [], release: [], leave: [], bind: [], banish: [], peace: [], rem: 0, essence: 0, errors: [] };
  let keepD = 0;
  let restD = 0;
  let wraithD = 0;
  for (const d of s.shades) {
    const c = R.choice[d.id] ?? defaultChoice(d);
    if (d.kind === 'wraith') {
      if (c === 'banish') {
        P.banish.push(d);
        P.essence += T.banishCost;
      } else {
        P.leave.push(d);
        wraithD += T.dreadPerWraith;
      }
    } else if (d.kind === 'restless') {
      if (c === 'release') {
        P.release.push(d);
        P.rem += 1;
      } else if (c === 'bind') {
        P.bind.push(d);
        P.essence += T.bindCost;
        keepD += T.dreadPerKeep * (shadeTrait(s, d)?.dread ?? 1);
      } else {
        P.leave.push(d);
        restD += T.dreadPerRestless;
      }
    } else if (c === 'cover') {
      P.cover.push(d);
      P.rem += 1;
    } else {
      P.keep.push(d);
      keepD += T.dreadPerKeep * (d.keeper ? T.keeperDread : shadeTrait(s, d)?.dread ?? 1); // a Bitter shade costs more, and the keeper
    }
  }
  for (const d of [...P.cover, ...P.release]) for (const p of s.living) if (p.grief?.for === d.id) P.peace.push(p);
  const free = capacity(s).free + P.cover.length;
  if (P.bind.length > free) P.errors.push(`Only ${free} mirror ${free === 1 ? 'space is' : 'spaces are'} free to bind into.`);
  const crackD = (R.cracks || 0) * T.dreadPerCrack;
  const brokenD = (R.broken || 0) * T.dreadPerBroken; // the living saw what the Maws broke walk their rooms
  const bears = bear(s);
  const delta = keepD + restD + wraithD + crackD + brokenD - bears - R.vigils;
  // In the tutorial's first days Dread stops one short of bringing the Church.
  const top = veilKept(s) ? T.dreadMax - 1 : T.dreadMax;
  P.dread = { from: s.dread, keep: keepD, restless: restD, wraith: wraithD, cracks: crackD, broken: brokenD, bear: bears, vigils: R.vigils, delta, to: clamp(s.dread + delta, 0, Math.max(top, s.dread)) };
  P.inspector = P.dread.to >= T.dreadMax;
  // The Inquisition inspects tomorrow at noon if it still stands then.
  P.inquisition = !!T.church && !!s.church?.inquisition && dayNo(s) + 1 <= s.church.inquisition;
  P.crusade = crusadeDay(s) > 0 && crusadeDay(s) === dayNo(s) + 1;
  P.remCost = R.vigils * T.vigilCost;
  // Requests granted: a name or a remembering costs remembrance, as bought.
  P.granted = [];
  for (const [id, k] of Object.entries(R.asks || {})) {
    const d = byId(s.shades, id);
    if (!d || !(R.grant?.[id] || (k === 'release' && P.cover.includes(d)))) continue;
    P.granted.push(d);
    if (k === 'name' && !d.named) P.remCost += T.nameCost;
    if (k === 'remember') P.remCost += T.rememberCost;
  }
  if (P.remCost > s.res.remembrance + P.rem + EPS) P.errors.push(P.granted.some((d) => ['name', 'remember'].includes(R.asks?.[d.id])) ? 'Not enough remembrance for those vigils and requests.' : 'Not enough remembrance for that many vigils.');
  if (P.essence > s.res.essence + EPS) P.errors.push(`Not enough essence (${fmt(P.essence)} needed).`);
  P.tonight = P.keep.length + P.bind.length;
  return P;
}

function release(s, d, how, text) {
  s.shades.splice(s.shades.indexOf(d), 1);
  endLedger(s, d.id, how);
  say(s, text, 'rest');
  cue(s, 'rest');
  restFor(s, d.id, true);
}

function beginDay(s) {
  const P = ritePreview(s);
  if (P.errors.length) return P.errors[0];
  const T = s.tuning;
  for (const d of P.cover) {
    const m = byId(s.mirrors, d.mirror);
    release(s, d, 'covered', `The ${m ? m.name : 'mirror'} is covered. ${d.name} is released.`);
  }
  for (const d of P.release) release(s, d, 'released', `${d.name} is released from the edge of the Deep.`);
  for (const d of P.banish) {
    s.shades.splice(s.shades.indexOf(d), 1);
    endLedger(s, d.id, 'banished');
    restFor(s, d.id, false);
    say(s, `${d.name} is banished into the Deep.`);
    cue(s, 'banish');
  }
  for (const d of P.bind) {
    const m = freeMirror(s);
    Object.assign(d, { mirror: m.id, kind: d.trueKind, trueKind: null, restless: 0, post: wakingSpot(s), granted: true }); // bound anew, it asks no more
    const e = ledgerOf(s, d.id);
    if (e) e.bound = { season: s.season, day: s.day, kind: d.kind };
    say(s, `${d.name} is bound to the ${m.name} and settles as ${KINDS[d.kind].name}.`, 'wake');
    cue(s, 'wake');
  }
  s.res.essence = Math.max(0, s.res.essence - P.essence);
  gain(s, 'remembrance', P.rem);
  s.res.remembrance = Math.max(0, s.res.remembrance - P.remCost);
  if (P.dread.to !== s.dread) say(s, `Dread ${P.dread.from} → ${P.dread.to}.`, P.dread.to > s.dread ? 'bad' : 'good');
  s.dread = P.dread.to;
  answerRequests(s, P);
  for (const d of s.shades) d.rites = (d.rites || 0) + 1;
  s.rite = null;
  s.days.push({ season: s.season, day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  const yesterday = s.days[s.days.length - 1];
  s.today = blankToday();
  s.day++;
  s.phase = 'day';
  s.t = 0;
  siegeDawn(s, yesterday);
  churchDawn(s);
  // A mirror is hidden only from a crusade: with none coming (the Church turned off, say), it comes back out.
  if (!crusadeDay(s)) for (const m of s.mirrors) if (m.hidden) showMirror(s, m);
  if (s.dread >= T.dreadMax && (!s.inspection || s.inspection.done) && !crusadeDue(s)) {
    s.inspection = { day: s.day, reason: 'dread', done: false };
    say(s, 'Dread has reached its height. The Lantern Church sends an inspector; it arrives at noon.', 'bad', true);
    cue(s, 'warn');
  } else if (s.day === T.firstInspection - 1 && (!s.inspection || s.inspection.done) && !crusadeDay(s)) {
    s.inspection = { day: T.firstInspection, reason: 'season', done: false };
    say(s, 'Word comes from the Lantern Church: an inspector will visit tomorrow at noon and judge how the keep keeps its dead.', 'rite', true);
  }
  if (s.day % T.newcomerEvery === 0 && s.living.length < T.maxLiving) {
    if (besieged(s)) say(s, 'No one new can reach the gate through the siege.', 'bad');
    else newcomer(s);
  }
  rollDay(s);
  const when = s.tuning.year ? `${cap(seasonName(s))} of year ${yearOf(s)}` : `Season ${s.season}`;
  say(s, `${when}, day ${s.day}${isLongNight(s) ? ': tonight is the Long Night' : isNewMoon(s) ? ': tonight is the new moon' : ''}.`, 'day');
  cue(s, 'day');
  weatherNews(s);
  const haunted = (s.haunted || []).map((id) => DAY_ROOMS[typeOf(geo(s), id)].name);
  const half = T.hauntWork < 1 ? ` Whoever works there manages ${Math.round(100 * T.hauntWork)}% until dusk.` : '';
  if (haunted.length) say(s, `The ${listNames(haunted)} ${haunted.length === 1 ? 'is' : 'are'} haunted today.${half}`, 'bad', true);
  if (haunted.length) cue(s, 'warn');
  return null;
}

// The Church's escalation at dawn: the Inquisition's days running out, then the embargo's; or the inquisitor
// coming again at noon.
function churchDawn(s) {
  const C = s.church;
  if (!C) return;
  if (crusadeDay(s)) {
    if (crusadeDue(s)) {
      if (s.inspection && !s.inspection.done) s.inspection = null; // the Church comes with swords today, not a ledger
      say(s, `The crusade comes today: ${Math.max(2, Math.round(C.strength / 2))} knights of the Lantern, strength ${fmt(C.strength)}, at the gate a little after noon.`, 'bad', true);
      cue(s, 'warn');
    } else if (!s.inspection || s.inspection.done) {
      s.inspection = { day: s.day, reason: 'inquisition', done: false };
      const n = crusadeDaysLeft(s);
      say(s, `The inquisitor will inspect the keep again at noon. The crusade comes ${n === 1 ? 'tomorrow' : `in ${n} days`}; a blessing calls it off.`, 'bad', true);
      cue(s, 'warn');
    }
    return;
  }
  const gone = !!C.inquisition && !inquisition(s);
  if (gone) C.inquisition = 0;
  if (!embargoed(s)) {
    s.church = null;
    say(s, gone ? 'The inquisitor leaves, and the Lantern Church lifts its embargo.' : 'The Lantern Church lifts its embargo.', 'good', true);
  } else if (gone) {
    const n = churchDaysLeft(s);
    say(s, `The inquisitor leaves. The silver embargo stands ${n ? `today and ${n} more day${n === 1 ? '' : 's'}` : 'through today'}.`, 'good', true);
  } else if (inquisition(s) && (!s.inspection || s.inspection.done)) {
    s.inspection = { day: s.day, reason: 'inquisition', done: false };
    say(s, 'The inquisitor will inspect the keep again at noon.', 'bad', true);
    cue(s, 'warn');
  }
}

// Autumn's siege: the morning after its day-2 raid, unless that was paid off, the Host makes camp; it
// breaks camp after siegeDays, unless the guards broke it first.
function siegeDawn(s, yesterday) {
  const T = s.tuning;
  if (s.siege && s.day > s.siege.until) {
    if (!s.siege.broken) say(s, 'The Ashen Host breaks camp and marches off. The gate opens.', 'good', true);
    s.siege = null;
  }
  if (!T.siege || !T.year || seasonIndex(s) !== 2 || s.day !== 3 || s.siege) return;
  const raid = yesterday?.raid;
  if (!raid || raid.paid) return;
  const strength = r1(raidStrength(s, (T.raidDays[2] || 4) * T.siegeStrength));
  s.siege = { from: s.day, until: s.day + T.siegeDays - 1, strength, broken: false };
  say(s, `The Ashen Host has made camp outside the walls. For ${T.siegeDays} days the gate is shut: nobody quarries in the Yard, and no one new can come. The guards can sally out to break the camp.`, 'bad', true);
  cue(s, 'horn');
}

// The rite's requests, answered: granted, a shade never asks again; refused `refusals` times, it turns Restless
// and leaves its mirror.
function answerRequests(s, P) {
  const R = s.rite;
  const T = s.tuning;
  for (const [id, k] of Object.entries(R.asks || {})) {
    const d = byId(s.shades, id);
    if (!d) continue; // covered, released or banished at this rite
    const e = ledgerOf(s, d.id);
    if (P.granted.includes(d)) {
      d.granted = true;
      if (e) e.granted = k;
      if (k === 'gate') {
        d.byDay = { how: 'gate' };
        say(s, `${d.name} will stand at the gate today.`, 'good');
      } else if (k === 'name' && !d.named) {
        d.named = true;
        if (e) e.named = true;
        say(s, `${d.name} is given a name to keep, and will fade half as fast.`, 'good');
      } else if (k === 'remember') {
        d.memory = Math.min(100, d.memory + T.rememberGain);
        say(s, `${d.name} is remembered: +${T.rememberGain} memory.`, 'good');
      }
      continue;
    }
    d.refused = (d.refused || 0) + 1;
    if (d.refused < T.refusals) {
      say(s, `${d.name}'s request goes unanswered. ${T.refusals - d.refused === 1 ? 'Refused again, it will turn Restless.' : ''}`.trim(), 'bad');
      continue;
    }
    d.trueKind = d.kind;
    d.kind = 'restless';
    d.mirror = null;
    d.byDay = null;
    d.restless = 0;
    if (e) e.turned = 'restless';
    say(s, `${d.name}, refused ${T.refusals === 2 ? 'twice' : `${T.refusals} times`}, turns Restless and leaves its mirror for the edge of the Deep.`, 'bad', true);
    cue(s, 'restless');
  }
}

function newcomer(s) {
  const p = newPerson(s, freshName(s, NAMES), pick(s, ['young', 'adult', 'adult', 'old']));
  s.living.push(p);
  s.today.arrivals.push(p.id);
  say(s, `${p.name} (${p.age}) arrives at the gate and asks to stay. Assign a job.`, 'good', true);
  cue(s, 'arrive');
}

/* ---------------------------------------------------------------- the season */

export function seasonSummary(s) {
  const ours = s.ledger.filter((e) => e.from === 'living' && e.season === s.season);
  const days = s.days.filter((d) => d.season === s.season);
  const nights = [...days.map((d) => d.night), s.today.night || s.night?.stats].filter(Boolean);
  return {
    season: s.season,
    living: s.living.length,
    shades: s.shades.filter(canWork).length,
    deaths: ours.length,
    byCause: Object.fromEntries(Object.keys(CAUSES).map((k) => [k, ours.filter((e) => e.cause === k).length])),
    raids: [...days.map((d) => d.raid), s.today.raid].filter(Boolean),
    inspections: s.inspections.filter((i) => i.season === s.season),
    cracks: nights.reduce((a, x) => a + x.cracks, 0),
    lost: nights.flatMap((x) => x.lost),
    broken: nights.reduce((a, x) => a + (x.broken?.length || 0), 0),
    hollow: (s.today.night || s.night?.stats)?.hollow || null,
    taken: nights.map((x) => x.taken).filter(Boolean),
    dread: s.dread,
  };
}

// One record per season played, won or lost, with the playtest answer once it's given.
function closeSeason(s, cracks, lost = null) {
  s.seasons.push({ season: s.season, day: s.day, lost, cracks, answer: null, note: '', summary: seasonSummary(s) });
}
export const lastSeason = (s) => s.seasons[s.seasons.length - 1] || null;

function endSeason(s, cracks) {
  s.phase = 'end';
  s.t = 0;
  closeSeason(s, cracks);
  say(s, `The new moon has passed. Season ${s.season} is over.`, 'rite', true);
  cue(s, 'end');
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);
const SEASON_TEXT = ['', 'the days are long and the nights short. Summer builds.', 'day and night are even again, and the year turns toward winter.', 'the days are short and the nights long. Winter lives on what was put by, and it ends with the Long Night.'];

function nextSeason(s) {
  const { cracks } = lastSeason(s);
  s.days.push({ season: s.season, day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  s.today = blankToday();
  s.season++;
  s.day = 0;
  s.inspection = null;
  s.embolden = 1;
  s.siege = null;
  // Nothing the player does mends the Veil, so cracks don't follow the keep into a new season.
  const mended = s.cracks > 0;
  s.cracks = 0;
  s.haunted = [];
  toRite(s, cracks);
  const T = s.tuning;
  const turn = !T.year ? '' : seasonIndex(s) === 0 ? ` A new year begins: year ${yearOf(s)}.` : ` ${cap(seasonName(s))}: ${SEASON_TEXT[seasonIndex(s)]}`;
  say(s, `Season ${s.season} begins with the dawn.${turn}${mended ? ' The Veil has knit whole again.' : ''} The Host will come harder, and so will the Unlit.`, 'rite', true);
  cue(s, 'dawn');
  generations(s);
}

// Generations (round five), from the second year: each spring the living age and the unwed pair off, and
// each season spouses may have a child. From their own stream, so a keep's raids and Unlit are the same with
// them or without until someone is born or grows old.
function generations(s) {
  const T = s.tuning;
  if (!T.generations || !T.year || yearOf(s) < 2) return;
  const r = ownStream(s, 0x9e7);
  const news = [];
  if (seasonIndex(s) === 0) {
    for (const p of s.living) {
      if (p.age === 'child') {
        p.age = 'young';
        news.push(`${p.name} comes of age and can work`);
      } else if (p.age === 'young') {
        p.age = 'adult';
        news.push(`${p.name} is grown`);
      } else if (p.age === 'adult' && chance(r, T.oldChance)) {
        p.age = 'old';
        news.push(`${p.name} grows old`);
      }
    }
    // The unwed pair off, the young and the grown alike, in the order they came to the keep.
    const free = s.living.filter((p) => !p.bond && (p.age === 'young' || p.age === 'adult'));
    for (let i = 0; i + 1 < free.length; i += 2) {
      if (!chance(r, T.pairChance)) continue;
      const [a, b] = [free[i], free[i + 1]];
      a.bond = { with: b.id, rel: 'spouse' };
      b.bond = { with: a.id, rel: 'spouse' };
      news.push(`${a.name} and ${b.name} are wed`);
    }
  }
  // Births: once for each pair of living spouses, neither old, while the keep has room.
  const seen = new Set();
  for (const p of [...s.living]) {
    const q = p.bond?.rel === 'spouse' ? byId(s.living, p.bond.with) : null;
    if (!q || seen.has(p.id) || p.age === 'old' || q.age === 'old' || p.age === 'child' || q.age === 'child') continue;
    seen.add(p.id);
    seen.add(q.id);
    if (s.living.length >= T.maxLiving || !chance(r, T.birthChance)) continue;
    const c = newPerson(s, freshName(s, NAMES, r), 'child', null);
    Object.assign(c, { bond: { with: p.id, rel: 'parent' }, born: true, joined: { season: s.season, day: 1 } });
    s.living.push(c);
    news.push(`${p.name} and ${q.name} have a child, ${c.name}`);
  }
  if (!news.length) return;
  say(s, `${cap(listNames(news))}.`, 'good', true);
  cue(s, 'arrive');
}

/* ---------------------------------------------------------------- player actions */

const onFloor = (s, f, x) => Number.isInteger(f) && f >= 0 && f < geo(s).n && Number.isFinite(x) && x >= MAP.LEFT && x <= MAP.RIGHT;

const ACTIONS = {
  assign(s, { id, room }) {
    const p = byId(s.living, id);
    if (!p) return 'No one living by that name.';
    if (p.age === 'child' && room !== null) return `${p.name} is a child: too young to work.`;
    if (room !== null && !(DAY_ROOMS[room] && DAY_ROOMS[room].out)) return 'No one works there.';
    if (room !== null && room !== p.job) {
      const cap = jobCap(s, room);
      const name = DAY_ROOMS[room].name;
      if (!cap) return `There is no ${name} yet. Build one first.`;
      if (handsAt(s, room) >= cap) return `The ${name} is full: ${cap} work there. Build another ${name}.`;
    }
    p.job = room;
  },
  // What a shade does by day: rests in the glass (how null), whispers its old trade to whoever works it, or
  // steps through a great glass to work a room in person. It keeps to it day after day until changed.
  byDay(s, { id, how, room }) {
    if (!s.tuning.whispers) return 'The dead rest by day.';
    if (s.phase !== 'day' && s.phase !== 'dawn') return 'The dead can help only by day.';
    const d = byId(s.shades, id);
    if (!d) return 'No shade by that name.';
    if (!how) {
      d.byDay = null;
      return;
    }
    if (!canWork(d)) return `${d.name} can't help anyone from where they are.`;
    if (how === 'whisper') {
      const trade = tradeOf(s, d);
      const R = trade && DAY_ROOMS[trade];
      if (!R?.out) return `${d.name} had no trade in the keep to whisper.`;
      if (!jobCap(s, trade)) return `There is no ${R.name} for ${d.name} to whisper to.`;
      const other = s.shades.find((x) => x !== d && whispers(s, x) && tradeOf(s, x) === trade);
      if (other) return `${other.name} already whispers to the ${R.name}.`;
      d.byDay = { how };
      say(s, `${d.name} will whisper to whoever works the ${R.name}, as they did in life.`);
    } else if (how === 'step') {
      if (!inGreatGlass(s, d)) return 'Only the shades of a great glass can step through by day.';
      const R = DAY_ROOMS[room];
      if (!R?.out) return 'No one works there.';
      const cap = jobCap(s, room);
      if (!cap) return `There is no ${R.name} yet. Build one first.`;
      if (!(d.byDay?.how === 'step' && d.byDay.room === room) && handsAt(s, room) >= cap) return `The ${R.name} is full: ${cap} work there.`;
      d.byDay = { how, room };
      say(s, `${d.name} will step through the ${byId(s.mirrors, d.mirror).name} by day and work in the ${R.name}.`);
    } else return 'The dead can whisper or step through.';
    cue(s, 'whisper');
  },
  // Raise a room on top of the keep: into the top floor's bare hall, or as a new floor with a bare hall
  // beside it. By day, for roomStone stone.
  raise(s, { room, at: where }) {
    if (s.phase !== 'day') return 'Masons build by day.';
    if (!BUILDABLE.includes(room)) return 'That cannot be built.';
    const T = s.tuning;
    const at = buildSpot(s, where);
    if (!at) return where && where !== 'top' ? 'There is no bare hall there.' : 'The keep can rise no higher.';
    const cost = raiseCost(s, at);
    if ((s.res.stone || 0) + EPS < cost) return at.newFloor && cost > T.roomStone ? `A room on a new floor takes ${fmt(cost)} stone.` : `A room takes ${fmt(cost)} stone.`;
    s.res.stone -= cost;
    const keep = s.keep || FULL_KEEP;
    const ids = new Set(keep.floors.flat().map((r) => r.id));
    const idFor = (type) => {
      let k = 2;
      while (ids.has(`${type}${k}`)) k++;
      ids.add(`${type}${k}`);
      return `${type}${k}`;
    };
    const made = { id: ids.has(room) ? idFor(room) : (ids.add(room), room), type: room };
    if (at.newFloor) {
      s.keep = { floors: [[made, { id: idFor('empty'), type: 'empty' }], ...keep.floors] };
      // Every floor index moves down one; the shades keep their places.
      for (const d of s.shades) {
        d.f += 1;
        d.of += 1;
        if (d.post) d.post = { f: d.post.f + 1, x: d.post.x };
        d.path = (d.path || []).map((st) => ({ ...st, f: st.f + 1 }));
      }
    } else {
      s.keep = { floors: keep.floors.map((fl, f) => (f === at.f ? fl.map((r, i) => (i === at.slot ? made : r)) : fl)) };
    }
    const G = geo(s);
    if (at.f === 0) say(s, `The masons raise a ${DAY_ROOMS[room].name} on top of the keep. By night its twin, the ${TWINS[room].name}, is the Tain's deepest room.`, 'good', true);
    else say(s, `The masons raise a ${DAY_ROOMS[room].name} in the bare hall on floor ${G.n - at.f}. By night its twin, the ${TWINS[room].name}, is ${tainPlace(G, at.f, true)}.`, 'good', true);
    cue(s, 'build');
  },
  // Tearing a room down leaves a bare hall and gives back part of its stone. The Crypt stays (the dead wake
  // there), and so does the last Hearth. Whoever worked there beyond what the rest of its kind can hold goes
  // to the Yard.
  teardown(s, { id }) {
    if (s.phase !== 'day') return 'Masons work by day.';
    const G = geo(s);
    const r = G.rooms[id];
    if (!r || r.type === 'empty') return 'There is no room there to tear down.';
    if (r.type === 'crypt') return 'The Crypt stays: the dead wake there.';
    if (r.type === 'hearth' && roomsOf(G, 'hearth').length === 1) return 'The keep needs a Hearth.';
    if (s.fires.some((f) => f.room === id)) return 'Not while it burns.';
    const T = s.tuning;
    const back = Math.floor(T.roomStone * T.teardownBack);
    const keep = s.keep || FULL_KEEP;
    const ids = new Set(keep.floors.flat().map((x) => x.id));
    let k = 2;
    while (ids.has(`empty${k}`)) k++;
    s.keep = { floors: keep.floors.map((fl) => fl.map((x) => (x.id === id ? { id: `empty${k}`, type: 'empty' } : x))) };
    s.res.stone = (s.res.stone || 0) + back;
    s.haunted = (s.haunted || []).filter((x) => x !== id);
    s.scorched = (s.scorched || []).filter((x) => x !== id);
    const name = DAY_ROOMS[r.type].name;
    const out = [];
    if (DAY_ROOMS[r.type].out) {
      const cap = jobCap(s, r.type);
      const workers = s.living.filter((p) => p.job === r.type);
      for (const p of workers.slice(cap)) {
        p.job = 'yard';
        out.push(p.name);
      }
      for (const d of s.shades) if (d.byDay?.how === 'step' && d.byDay.room === r.type && !jobCap(s, r.type)) d.byDay = null;
    }
    say(s, `The masons tear down the ${name}: ${back} stone back, and a bare hall.${out.length ? ` ${listNames(out)} ${out.length === 1 ? 'goes' : 'go'} to the Yard.` : ''}`, 'good', true);
    cue(s, 'build');
  },
  // Moving a room swaps it with another room or a bare hall, anywhere in the keep, for stone. Its twin moves
  // with it, and whoever works there keeps their job.
  moveRoom(s, { id, to }) {
    if (s.phase !== 'day') return 'Masons work by day.';
    const G = geo(s);
    const a = G.rooms[id];
    const b = G.rooms[to];
    if (!a || !b || a === b) return 'Choose two places.';
    if (a.type === 'empty' && b.type === 'empty') return 'Both halls are bare.';
    if (s.fires.some((f) => f.room === id || f.room === to)) return 'Not while it burns.';
    const T = s.tuning;
    if ((s.res.stone || 0) + EPS < T.moveStone) return `Moving a room takes ${T.moveStone} stone.`;
    s.res.stone -= T.moveStone;
    const keep = s.keep || FULL_KEEP;
    const A = keep.floors[a.f].find((x) => x.id === id);
    const B = keep.floors[b.f].find((x) => x.id === to);
    s.keep = { floors: keep.floors.map((fl) => fl.map((x) => (x.id === id ? B : x.id === to ? A : x))) };
    const H = geo(s);
    const named = (r) => (r.type === 'empty' ? 'a bare hall' : `the ${DAY_ROOMS[r.type].name}`);
    const moved = a.type === 'empty' ? b : a;
    const twin = moved.type === 'empty' ? '' : ` By night the ${TWINS[moved.type].name} is ${tainPlace(H, H.rooms[moved.id].f, true)}.`;
    say(s, `The masons swap ${named(a)} and ${named(b)}.${twin}`, 'good', true);
    cue(s, 'build');
  },
  // Choosing between tonight's two omens (round six), at dusk; until the night begins it can be changed.
  omen(s, { i }) {
    const n = s.night;
    if (s.phase !== 'dusk' || !n?.omens) return 'There are no omens to choose between.';
    const o = n.omens[i];
    if (!o) return 'No such omen.';
    if (n.omen === o) return undefined;
    applyOmen(s, n, o);
    say(s, `Tonight's omen, chosen: ${OMENS[o.id].name}.`, 'night');
    cue(s, 'post');
    return undefined;
  },
  // A lantern (round six): a candle from the store, carried by a shade; asked again, set down where it stands.
  lantern(s, { id }) {
    const T = s.tuning;
    if (!T.lanterns) return 'There are no lanterns in this keep.';
    if (!(s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place'))) return 'Lanterns are for the night.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'That shade can carry nothing tonight.';
    const n = s.night;
    const held = n.candles.find((k) => k.carrier === d.id);
    if (held) {
      delete held.carrier;
      held.x = Math.round(held.x * 2) / 2;
      say(s, `${d.name} sets its lantern down.`);
      cue(s, 'light', d.f, d.x);
      return undefined;
    }
    if (d.grabbedBy) return `${d.name} is caught: it can't light a lantern now.`;
    if (s.res.candles < 1) return 'A lantern takes a candle, and the store is empty.';
    s.res.candles--;
    n.candles.push({ id: 'k' + s.nextId++, f: d.f, x: d.x, wax: T.lanternWax, max: T.lanternWax, carrier: d.id });
    n.stats.candles++;
    say(s, `${d.name} takes up a lantern: its own light for ${fmt(T.lanternWax)} seconds, wherever it goes.`);
    cue(s, 'light', d.f, d.x);
    return undefined;
  },
  // A shade's one act a night (round six), paid in its memory. Stand, Pass unseen and Lure last their
  // seconds; Kindle is done at once.
  shadeAct(s, { id }) {
    const T = s.tuning;
    if (!T.acts) return 'The dead have no acts in this keep.';
    if (s.phase !== 'night') return 'The dead act at night.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'That shade can do nothing tonight.';
    const what = actOf(d);
    if (!what) return `${d.name} has no act.`;
    if (d.acted) return `${d.name} has acted once tonight already.`;
    if (d.climb) return `${d.name} is on the stairs.`;
    const cost = actCost(s, d);
    if (d.memory <= cost + EPS) return `${ACTS[what].name} would cost ${d.name} ${fmt(cost)} memory, and it has ${fmt(d.memory)}.`;
    const n = s.night;
    const where = TWINS[typeAt(geo(s), d.f, d.x) || 'crypt'].name;
    let text;
    if (what === 'kindle') {
      const L = lightMap(geo(s), T, n.candles);
      const mine = n.candles.filter((k) => L.spans[d.f].some(([a, b, cid]) => cid === k.id && d.x >= a - EPS && d.x <= b + EPS));
      const add = T.candleWax * T.kindleWax;
      if (mine.length) {
        for (const k of mine) k.wax = Math.min(k.max, k.wax + add);
        text = `${d.name} kindles the candle in the ${where}.`;
      } else {
        if (!roomAt(geo(s), d.f, d.x)) return `${d.name} is inside a wall.`;
        // kindleWax of a candle's burning, at a whole candle's light.
        n.candles.push({ id: 'k' + s.nextId++, f: d.f, x: Math.round(d.x * 2) / 2, wax: add, max: add });
        n.stats.candles++;
        text = `${d.name} kindles a light in the dark of the ${where}.`;
      }
      d.act = { what, until: s.t + TICKS_PER_SEC };
      cue(s, 'light', d.f, d.x);
    } else {
      d.act = { what, until: s.t + Math.round(T.actSecs[what] * TICKS_PER_SEC) };
      const secs = `${T.actSecs[what]} seconds`;
      if (what === 'stand') text = `${d.name} stands its ground in the ${where}: for ${secs} nothing gnaws its light.`;
      else if (what === 'pass') {
        const f = d.grabbedBy && byId(n.foes, d.grabbedBy);
        if (f) f.grab = null;
        d.grabbedBy = null;
        text = `${d.name} passes unseen${f ? ", out of the Creeper's grip," : ''} for ${secs}.`;
      } else {
        for (const c of n.foes) if (c.f === d.f && Math.abs(c.x - d.x) <= T.lureReach) c.replan = 0;
        text = `${d.name} calls to the Unlit in the ${where}: for ${secs} they come for it.`;
      }
      if (what === 'stand') cue(s, 'ward', d.f, d.x);
      else if (what === 'pass') cue(s, 'hush', d.f, d.x);
      else cue(s, 'horn', d.f, d.x);
    }
    d.memory = Math.round((d.memory - cost) * 100) / 100;
    d.acted = true;
    (n.stats.acts ||= []).push({ name: d.name, what, t: s.t });
    say(s, `${text} −${fmt(cost)} memory.`, 'good');
    return undefined;
  },
  // Before the day a crusade comes, a mirror can be hidden from it: its shades sit out every day and night
  // until the crusade is over, and neither the crusaders nor the inquisitor can find it. It can be brought out
  // again at any time by day.
  hide(s, { id, on }) {
    const m = byId(s.mirrors, id);
    if (!m) return 'No such mirror.';
    if (s.phase !== 'day') return 'Mirrors are hidden, and brought out, by day.';
    if (!on) {
      if (!m.hidden) return `The ${m.name} isn't hidden.`;
      showMirror(s, m);
      say(s, `The ${m.name} is brought out of hiding.`);
      cue(s, 'mirror');
      return undefined;
    }
    if (!crusadeDay(s)) return 'Mirrors are hidden from a crusade, and none is coming.';
    if (dayNo(s) >= crusadeDay(s)) return 'Too late: the crusaders are already on the road.';
    if (m.hidden) return `The ${m.name} is already hidden.`;
    m.hidden = true;
    const ds = s.shades.filter((d) => d.mirror === m.id);
    for (const d of ds) d.hidden = true;
    say(s, `The ${m.name} is hidden away${ds.length ? ` with ${listNames(ds.map((d) => d.name))}, who sit${ds.length === 1 ? 's' : ''} out every day and night until the crusade is over` : ''}.`);
    cue(s, 'post');
    return undefined;
  },
  // A donation to the Lantern Church lifts its embargo, but the inquisitor takes no gifts.
  donate(s) {
    const T = s.tuning;
    if (!embargoed(s)) return 'There is no embargo to lift.';
    if (inquisition(s)) return 'The inquisitor takes no gifts. Only a blessing sends it away before its days are out.';
    if (s.res.remembrance + EPS < T.donation) return `A donation takes ${T.donation} remembrance.`;
    s.res.remembrance -= T.donation;
    s.church = null;
    say(s, `A donation of ${T.donation} remembrance to the Lantern Church: it lifts the embargo.`, 'good');
    cue(s, 'good');
  },
  // At dusk, a shade goes down into the Deep instead of taking a post (depth 1 to 3), or is called back (0).
  descend(s, { id, depth }) {
    const T = s.tuning;
    if (!T.deep) return 'The way down is closed.';
    if (s.phase !== 'dusk' || s.dusk?.step !== 'place') return 'Shades go down into the Deep at dusk.';
    if (isNewMoon(s)) return 'Not on the new moon: the Hollow is down there.';
    const d = byId(s.shades, id);
    if (!d || !d.mirror || !WORKING.includes(d.kind)) return 'No such shade in the glass.';
    if (![0, 1, 2, 3].includes(depth)) return 'No such depth.';
    if (!depth) {
      if (!d.deep) return `${d.name} is not down there.`;
      d.deep = 0;
      say(s, `${d.name} is called back from the edge of the Deep.`);
      cue(s, 'post', d.post?.f, d.post?.x);
      return undefined;
    }
    d.deep = depth;
    say(s, `${d.name} goes down past the rifts into the Deep, ${DEPTHS[depth]}, to look for quicksilver. It will be back at dawn.`);
    cue(s, 'post');
  },
  // Quicksilver upgrades a mirror where it hangs, with its shades: a hand mirror into a pier glass, a pier
  // glass into a great glass.
  upgradeMirror(s, { id }) {
    const T = s.tuning;
    if (embargoed(s)) return "Under the Church's embargo there's no silver to be had for a mirror.";
    const m = byId(s.mirrors, id);
    if (!m) return 'No such mirror.';
    const next = { hand: 'pier', pier: 'great' }[m.type];
    if (!next) return `The ${m.name} is as great as a glass can be.`;
    const qs = T.upgradeSilver[next];
    const gl = T.upgradeGlass[next];
    if ((s.res.quicksilver || 0) + EPS < qs || s.res.glass + EPS < gl) return `Upgrading the ${m.name} takes ${qs} quicksilver and ${gl} glass.`;
    s.res.quicksilver -= qs;
    s.res.glass = Math.max(0, s.res.glass - gl);
    const was = m.name;
    m.type = next;
    m.name = `${was.split(' ')[0]} ${MIRRORS[next].name}`;
    say(s, `The ${was} is silvered anew as the ${m.name}: room for ${MIRRORS[next].cap}.`, 'good');
    cue(s, 'mirror');
  },
  build(s, { mirror }) {
    const M = MIRRORS[mirror];
    if (!M) return 'No such mirror.';
    if (embargoed(s)) return "Under the Church's embargo there's no silver to be had for a mirror.";
    if (s.res.glass + EPS < M.glass) return `A ${M.name} needs ${M.glass} glass.`;
    s.res.glass = Math.max(0, s.res.glass - M.glass);
    const m = addMirror(s, mirror, nextPlace(s));
    say(s, `The ${m.name} is finished: room for ${M.cap} more ${M.cap === 1 ? 'shade' : 'shades'}.`, 'good');
    cue(s, 'mirror');
  },
  // Send the Yard's masons to a fire, or ring the bell: everyone well and not already fighting a fire drops
  // their work and runs to it.
  fightFire(s, { room, bell }) {
    if (s.phase !== 'day') return 'Fires burn by day.';
    if (!s.fires.some((f) => f.room === room)) return 'Nothing is burning there.';
    const burning = s.fires.flatMap((f) => peopleIn(s, f.room));
    const hands = s.living.filter((p) => !p.fighting && !(p.sick > 0) && p.age !== 'child' && (bell ? !burning.includes(p) : p.job === 'yard'));
    if (!hands.length) return bell ? 'Everyone who can is already fighting.' : 'Nobody is in the Yard to send.';
    for (const p of hands) p.fighting = room;
    const name = DAY_ROOMS[typeOf(geo(s), room)].name;
    say(s, bell ? `The bell rings: ${listNames(hands.map((p) => p.name))} drop their work and run to the fire in the ${name}.` : `${listNames(hands.map((p) => p.name))} run from the Yard to fight the fire in the ${name}.`);
    if (bell) cue(s, 'bell');
  },
  wardGate(s) {
    const r = s.raid;
    if (s.phase !== 'day' || !r || !(r.state === 'coming' || r.state === 'assault') || !r.warned) return 'No raid to ward against.';
    if (r.ward) return 'The gate is already warded.';
    if (s.res.essence + EPS < s.tuning.wardGateCost) return `A ward costs ${s.tuning.wardGateCost} essence.`;
    s.res.essence -= s.tuning.wardGateCost;
    r.ward = s.tuning.wardGateDefense;
    say(s, `The gate is warded with essence: defense +${r.ward}.`, 'good');
    cue(s, 'ward');
  },
  // Raids you fight. Before the Host arrives: pay it off, or bar the stores. At the gate: pitch, stone and the
  // bell. After a breach: go after them.
  payOff(s) {
    const r = s.raid;
    if (!s.tuning.raidFight || s.phase !== 'day' || !r || r.state !== 'coming' || !r.warned) return 'There is no raid on the road to pay off.';
    if (r.crusade) return 'The crusade takes no tribute.';
    const { food, candles } = tributeOf(s);
    if (s.res.food + EPS < food || s.res.candles + EPS < candles) return `They want ${food} food and ${candles} candles to turn back.`;
    s.res.food -= food;
    s.res.candles -= candles;
    r.state = 'paid';
    r.paid = { food, candles };
    s.embolden = (s.embolden || 1) * s.tuning.raidEmbolden;
    s.today.raid = { strength: r.strength, defense: r1(defense(s)), held: false, paid: true };
    s.events = s.events.filter((e) => e.type !== 'raidHit');
    say(s, `You pay the Host ${food} food and ${candles} candles, and they turn back. They'll remember: the season's next raid comes harder.`, 'bad', true);
    cue(s, 'tribute');
  },
  barStores(s) {
    const r = s.raid;
    if (!s.tuning.raidFight || s.phase !== 'day' || !r || !r.warned || !(r.state === 'coming' || r.state === 'assault')) return 'There is no raid to bar the stores against.';
    if (r.crusade) return 'The crusaders want the mirrors, not the stores.';
    if (r.barred) return 'The stores are already barred.';
    r.barred = true;
    say(s, `The stores ${r.state === 'assault' ? 'are' : 'will be'} barred: nobody works the Hearth, the Chandlery or the Glazier while the Host is at the gate, and raiders who break in will carry off half as much.`);
  },
  pitch(s) {
    const r = s.raid;
    const T = s.tuning;
    if (s.phase !== 'day' || r?.state !== 'assault') return 'Pitch is for the Host at the gate.';
    if (s.res.candles + EPS < T.raidPitchCost) return `Pitch takes ${T.raidPitchCost} candles.`;
    s.res.candles -= T.raidPitchCost;
    r.host = Math.max(0, r.host - T.raidPitch);
    r.pitched = (r.pitched || 0) + 1;
    r.pitchAt = s.t;
    say(s, `Burning pitch from the walls: the Host's strength falls to ${fmt(r.host)}.`);
    cue(s, 'pitch');
  },
  shore(s) {
    const r = s.raid;
    const T = s.tuning;
    if (s.phase !== 'day' || r?.state !== 'assault') return 'Stone is for the gate while the Host is at it.';
    if ((s.res.stone || 0) + EPS < T.raidShoreCost) return `Shoring the gate takes ${T.raidShoreCost} stone.`;
    if (r.gate >= 1 - EPS) return 'The gate is whole.';
    s.res.stone -= T.raidShoreCost;
    r.gate = Math.min(1, r.gate + T.raidShore);
    r.shoreAt = s.t;
    say(s, `The masons shore up the gate with stone: it's ${Math.round(100 * r.gate)}% whole.`);
    cue(s, 'build');
  },
  raidBell(s) {
    const r = s.raid;
    if (s.phase !== 'day' || r?.state !== 'assault') return 'The bell calls everyone to the walls only while the Host is at the gate.';
    const hands = s.living.filter((p) => p.job !== 'barracks' && !p.fighting && !p.walls && !(p.sick > 0) && p.age !== 'child');
    if (!hands.length) return 'Everyone who can is already on the walls.';
    for (const p of hands) p.walls = true;
    r.bell = true;
    say(s, `The bell rings: ${listNames(hands.map((p) => p.name))} drop their work and run to the walls.`);
    cue(s, 'bell');
  },
  pursue(s) {
    const r = s.raid;
    const T = s.tuning;
    if (s.phase !== 'day' || r?.state !== 'breached' || !r.loot || r.pursued) return 'There is no one to go after.';
    const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0));
    if (!guards.length) return 'There are no guards to send after them.';
    r.pursued = true;
    const back = Object.fromEntries(Object.entries(r.loot).map(([k, v]) => [k, Math.floor(v * T.raidRecover)]));
    for (const [k, v] of Object.entries(back)) s.res[k] += v;
    const fallen = guards.filter(() => chance(s, T.raidPursueRisk));
    say(s, `The guards go after the Host and take back ${back.food} food, ${back.glass} glass and ${back.candles} candles.${fallen.length ? ` ${listNames(fallen.map((p) => p.name))} ${fallen.length === 1 ? 'is' : 'are'} brought home dead.` : ''}`, fallen.length ? 'bad' : 'good', true);
    for (const p of fallen) kill(s, p, 'duty', 'died chasing the raiders');
  },
  // Autumn's siege: the guards go out against the camp. Broken, the Host scatters and the gate opens (and
  // the camp's own assault today is off); held, they fall back. Each guard risks raidPursueRisk either way.
  sally(s) {
    const g = s.siege;
    if (s.phase !== 'day' || !besieged(s)) return 'There is no camp to break.';
    if (s.raid?.state === 'assault') return 'Not while the Host is at the gate.';
    const guards = s.living.filter((p) => p.job === 'barracks' && !(p.sick > 0));
    if (!guards.length) return 'There are no guards to send out.';
    const T = s.tuning;
    const won = chance(s, sallyOdds(s));
    const fallen = guards.filter(() => chance(s, T.raidPursueRisk));
    if (won) {
      g.broken = true;
      if (s.raid?.camp && s.raid.state === 'coming') {
        s.raid = null;
        s.events = s.events.filter((e) => e.type !== 'raidWarn' && e.type !== 'raidHit');
      }
    }
    say(s, won ? `The guards sally out and break the camp. The Host scatters, and the gate opens.${fallen.length ? ` ${listNames(fallen.map((p) => p.name))} ${fallen.length === 1 ? 'is' : 'are'} brought home dead.` : ''}` : `The guards sally out, but the camp holds, and they fall back behind the gate.${fallen.length ? ` ${listNames(fallen.map((p) => p.name))} ${fallen.length === 1 ? 'does' : 'do'} not come back.` : ''}`, won ? 'good' : 'bad', true);
    cue(s, won ? 'held' : 'breached');
    for (const p of fallen) kill(s, p, 'duty', 'died sallying out against the camp');
  },
  // The rite: grant a shade's request, or not.
  request(s, { id, grant }) {
    if (s.phase !== 'dawn') return 'The dead ask at the rite.';
    const k = s.rite.asks?.[id];
    if (!k) return 'That shade asks nothing today.';
    const d = byId(s.shades, id);
    if (k === 'release') {
      s.rite.choice[id] = grant ? 'cover' : 'keep';
      if (!grant) delete s.rite.grant[id];
      return undefined;
    }
    if (grant) s.rite.grant[id] = true;
    else delete s.rite.grant[id];
    if (d && k === 'gate' && grant && s.rite.choice[id] === 'cover') s.rite.choice[id] = 'keep';
    return undefined;
  },
  // A vigil by day lowers Dread straight away; at dawn, vigils count in the rite's reckoning.
  vigil(s) {
    if (s.phase !== 'day') return 'Vigils by day lower Dread at once. At dawn, set them in the rite.';
    if (s.dread <= 0) return 'There is no Dread to ease.';
    if (s.res.remembrance + EPS < s.tuning.vigilCost) return `A vigil costs ${s.tuning.vigilCost} remembrance.`;
    s.res.remembrance -= s.tuning.vigilCost;
    s.dread--;
    say(s, `A vigil in the Chapel eases the keep. Dread ${s.dread + 1} → ${s.dread}.`, 'good');
    cue(s, 'vigil');
  },
  vigils(s, { n }) {
    if (s.phase !== 'dawn') return 'The rite is at dawn.';
    s.rite.vigils = clamp(Math.floor(n) || 0, 0, 10);
  },
  funeral(s, { id, on }) {
    if (s.phase === 'dusk' && s.dusk.step !== 'crypt') return 'The dead have already woken.';
    const b = byId(s.bodies, id);
    if (!b) return 'No such body.';
    if (on && !b.funeral) {
      const cap = funeralCap(s);
      if (!cap) return 'Funerals need a priest in the Chapel.';
      if (s.bodies.filter((x) => x.funeral).length >= cap) return `Each priest holds one funeral a day. You have ${cap}.`;
    }
    b.funeral = !!on;
  },
  wake(s) {
    if (s.phase !== 'dusk' || s.dusk.step !== 'crypt') return 'The dead wake at dusk.';
    for (const x of crossingPreview(s)) {
      if (x.to === 'funeral') bury(s, x.b);
      else rise(s, x.b, x);
    }
    s.bodies = [];
    s.dusk.step = 'place';
  },
  candle(s, { f, x }) {
    if (!(s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place'))) return 'Candles are set at dusk, once the dead have woken, or during the night.';
    if (!onFloor(s, f, x)) return 'That is not a place in the Tain.';
    if (!roomAt(geo(s), f, x)) return 'That is inside a wall.';
    if (s.res.candles < 1) return 'No candles left. The Chandlery makes them by day.';
    s.res.candles--;
    s.night.candles.push({ id: 'k' + s.nextId++, f, x, wax: s.tuning.candleWax, max: s.tuning.candleWax });
    s.night.stats.candles++;
    cue(s, 'light', f, x);
  },
  move(s, { id, f, x }) {
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!canWork(d)) return `${d.name} can't be posted.`;
    if (!onFloor(s, f, x) || !roomAt(geo(s), f, x)) return 'That is not a place in the Tain.';
    if (s.phase === 'dusk' || s.phase === 'dawn' || s.phase === 'day') {
      Object.assign(d, { post: { f, x }, f, x, ox: x, of: f, path: [], climb: 0 });
      cue(s, 'post', f, x);
      return undefined;
    }
    if (s.phase !== 'night') return 'Not now.';
    if (d.grabbedBy) return `${d.name} is held. Light the spot to free it.`;
    if (d.climb) return `${d.name} is on the stairs.`;
    const r = route(geo(s), lightMap(geo(s), s.tuning, s.night.candles), d, [{ f, x }]);
    if (!r) return 'No way there.';
    d.path = r.path;
    d.post = { f, x };
    cue(s, 'post', f, x);
  },
  ward(s, { target }) {
    if (s.phase !== 'night' && s.phase !== 'dusk') return 'Wards are set at dusk or during the night.';
    if (target === 'moat' && !raining(s)) return "The moat's twin is still tonight: nothing will come up it.";
    if (!geo(s).stairs.some((x) => x.id === target) && !MAP.rifts.some((x) => x.id === target) && target !== 'moat') return 'Wards seal a stair, a rift or the moat.';
    if (s.night.wards.includes(target)) return 'Already warded tonight.';
    const cost = wardCost(s);
    if (s.res.essence + EPS < cost) return `A ward costs ${fmt(cost)} essence.`;
    s.res.essence -= cost;
    s.night.wards.push(target);
    if (geo(s).stairs.some((x) => x.id === target)) s.night.wardHold[target] = s.tuning.wardHold;
    s.night.stats.wards++;
    for (const c of s.night.foes) c.replan = 0;
    cue(s, 'ward');
  },
  // Breaking a mirror, in an emergency: everyone in it is freed at once, as if covered (remembrance, and
  // peace for their kin), even out of a Creeper's grip at night. Dread falls for each, which covering at
  // the rite can't do, so it can turn a censure into a warning. The mirror is gone, and seven days of bad
  // luck follow.
  break(s, { id }) {
    const T = s.tuning;
    if (s.phase === 'over' || s.phase === 'end') return 'Not now.';
    const m = byId(s.mirrors, id);
    if (!m) return 'No such mirror.';
    const ds = s.shades.filter((d) => d.mirror === m.id);
    if (!ds.length) return `The ${m.name} holds no one.`;
    for (const d of ds) {
      if (s.night) {
        for (const f of s.night.foes) if (f.grab === d.id) f.grab = null;
        s.night.foes = s.night.foes.filter((f) => f.shade !== d.id); // a Wraith freed is gone from the Tain
      }
      if (s.rite) delete s.rite.choice[d.id];
      release(s, d, 'freed', `${d.name} is freed as the ${m.name} breaks.`);
    }
    gain(s, 'remembrance', ds.length);
    const was = s.dread;
    s.dread = Math.max(0, s.dread - T.breakDread * ds.length);
    s.mirrors.splice(s.mirrors.indexOf(m), 1);
    s.badLuck = Math.max(s.badLuck || 0, T.badLuckDays);
    say(s, `The ${m.name} is broken and everyone in it is free. Dread ${was} → ${s.dread}. ${T.badLuckDays} days of bad luck follow: sickness comes ${T.badLuck === 2 ? 'twice' : `${fmt(T.badLuck)} times`} as often.`, 'bad', true);
    cue(s, 'shatter');
  },
  hush(s, { on }) {
    if (s.phase !== 'night') return 'Hush is for the night.';
    s.night.hush = !!on;
    say(s, on ? 'Hush. The shades go silent; the Unlit pass them by, and all work stops.' : 'The hush ends.', on ? 'night' : '');
    cue(s, on ? 'hush' : 'unhush');
  },
  startNight(s) {
    if (s.phase !== 'dusk') return 'The night begins at dusk.';
    if (s.dusk.step !== 'place') return 'Let the dead wake first.';
    startNight(s);
  },
  rite(s, { id, choice }) {
    if (s.phase !== 'dawn') return 'The rite is at dawn.';
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!choicesFor(d).includes(choice)) return 'Not a choice for this shade.';
    s.rite.choice[id] = choice;
  },
  name(s, { id }) {
    if (s.phase !== 'dawn') return 'The dead are named at dawn.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'No such shade in the glass.';
    if (d.named) return `${d.name} is already in the ledger.`;
    if (s.res.remembrance + EPS < s.tuning.nameCost) return `Naming costs ${s.tuning.nameCost} remembrance.`;
    s.res.remembrance -= s.tuning.nameCost;
    d.named = true;
    const e = ledgerOf(s, d.id);
    if (e) e.named = true;
    say(s, `${d.name} is written in the ledger and will fade half as fast.`, 'good');
    cue(s, 'good');
  },
  remember(s, { id }) {
    if (s.phase !== 'dawn') return 'Remembrance is spent at dawn.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'No such shade in the glass.';
    if (d.memory >= 100) return `${d.name} remembers everything.`;
    if (s.res.remembrance + EPS < s.tuning.rememberCost) return `Remembering costs ${s.tuning.rememberCost} remembrance.`;
    s.res.remembrance -= s.tuning.rememberCost;
    d.memory = Math.min(100, d.memory + s.tuning.rememberGain);
  },
  beginDay(s) {
    if (s.phase !== 'dawn') return 'The day begins after the rite.';
    return beginDay(s);
  },
  // The weeks 7–10 test: would you play a second season?
  answer(s, { answer, note }) {
    const e = lastSeason(s);
    if (!e || (s.phase !== 'end' && s.phase !== 'over')) return 'The season is not over.';
    if (answer !== null && answer !== 'again' && answer !== 'stop') return 'Answer again or stop.';
    e.answer = answer;
    if (typeof note === 'string') e.note = note.slice(0, 2000);
  },
  nextSeason(s) {
    if (s.phase !== 'end') return 'The season is not over.';
    if (s.sealed) return "The Veil is sealed. This keep's story is over.";
    nextSeason(s);
  },
  // The year's end: seal the Veil, and the keep's story ends with every shade free.
  sealVeil(s) {
    if (!yearsEnd(s)) return 'The Veil can be sealed only when a year ends.';
    const n = s.shades.length;
    for (const d of [...s.shades]) {
      endLedger(s, d.id, 'sealed');
      restFor(s, d.id, true);
    }
    s.shades = [];
    s.sealed = { season: s.season, year: yearOf(s), freed: n };
    const e = lastSeason(s);
    if (e) e.sealed = n;
    say(s, `The Veil is sealed. ${n ? `${n === 1 ? 'The last shade goes' : n === 2 ? 'Both shades go' : `All ${n} shades go`} free, and` : 'The glass is empty, and'} the Book of the Dead is closed. The keep's story ends here.`, 'good', true);
    cue(s, 'blessed');
  },
  // The year's end: the keeper takes their own place in the glass, and a new keeper inherits the keep.
  takeGlass(s) {
    if (!yearsEnd(s)) return 'That is for the end of a year.';
    const T = s.tuning;
    nextSeason(s);
    const m = freeMirror(s) || addMirror(s, 'hand', nextPlace(s));
    const d = newShade(s, { id: 'p' + s.nextId++, name: 'The Keeper', kind: 'loyal', cause: 'duty', from: 'keeper', day: 0, memory: 100, named: true, was: 'stubborn' });
    d.mirror = m.id;
    d.keeper = true;
    s.shades.push(d);
    s.rite.choice[d.id] = 'keep';
    s.ledger.push({
      id: d.id, name: d.name, from: 'keeper', season: s.season, day: 0, cause: 'duty', how: 'kept the keep a whole year, and took their place in the glass', kind: 'loyal', guided: false, job: null,
      age: 'adult', bond: null, woke: 'loyal', end: null, endDay: null, nights: 0, kills: 0, posts: {}, named: true, memory: 100, was: 'stubborn',
    });
    say(s, `You take your own place in the ${m.name}, and a new keeper takes up the keep. The Keeper is Loyal, named and Anchored, and weighs ${T.keeperDread} shades' Dread at every rite.`, 'rite', true);
    cue(s, 'wake');
  },
  tune(s, { key, value, build }) {
    // Today's keep is the same for everyone, so only a new version's own numbers change it.
    if (s.daily && !build) return "Today's keep plays by the rules everyone has, so its numbers are locked.";
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return 'Needs a number.';
    if (typeof s.tuning[key] !== 'number') return 'No such setting.';
    if ((key === 'daySecs' || key === 'nightSecs') && v < 10) return 'At least 10 seconds.';
    s.tuning[key] = v;
  },
  debug(s, a) {
    if (a.what === 'give') {
      if (!(a.res in s.res)) return 'No such resource.';
      s.res[a.res] += Number(a.n) || 0;
      return undefined;
    }
    if (a.what === 'kill') {
      const p = byId(s.living, a.id);
      if (!p) return 'No one living by that name.';
      if (!CAUSES[a.cause] || !CAUSES[a.cause].kind || a.cause === 'raider') return 'No such cause.';
      kill(s, p, a.cause, a.cause === 'yours' ? 'was put to death on your order' : undefined);
      return undefined;
    }
    if (a.what === 'dread') {
      s.dread = clamp(Number(a.n) || 0, 0, s.tuning.dreadMax);
      return undefined;
    }
    if (a.what === 'skip') {
      if (s.phase === 'day') s.t = dayTicks(s) - 1;
      else if (s.phase === 'night') s.t = nightTicks(s) - 1;
      else return 'Nothing to skip.';
      return undefined;
    }
    return 'Unknown debug action.';
  },
};

export function act(s, a) {
  if (s.phase === 'over' && a.type !== 'answer') return { ok: false, error: 'This keep is lost. Start a new season.' };
  const f = ACTIONS[a.type];
  if (!f) return { ok: false, error: `Unknown action: ${a.type}` };
  const at = { season: s.season, day: s.day, phase: s.phase, t: s.t };
  const error = f(s, a);
  if (error) return { ok: false, error };
  s.actions.push({ a, at });
  s.rev++;
  return { ok: true };
}

// The numbers the player set with the tune action: the last value given for each. The build's own tunes
// (below) are left out.
export const playerTuning = (s) => Object.fromEntries(s.actions.filter(({ a }) => a.type === 'tune' && !a.build).map(({ a }) => [a.key, Number(a.value)]));

// Moves every number the player never set to the given defaults (a newer build's), so an older save plays
// the current tuning. Each change is a tune action marked as the build's, so the save still replays.
// Returns how many numbers changed.
export function retune(s, defaults) {
  const mine = playerTuning(s);
  let n = 0;
  for (const [k, v] of Object.entries(defaults)) {
    if (KINDS_OF_KEEP.includes(k)) continue; // what kind of keep it is, not a number to follow
    if (typeof v === 'number' && s.tuning[k] !== v && !(k in mine) && act(s, { type: 'tune', key: k, value: v, build: true }).ok) n++;
  }
  return n;
}
const KINDS_OF_KEEP = ['tutorial'];
// A keep's own defaults: the build's numbers, with the ones it was made with (a difficulty preset, or the
// player's own from the keep before) standing in for them, so a newer build doesn't move those.
export const keepDefaults = (s) => ({ ...TUNING, ...(s.defaults || {}) });

// A save from an older build, brought up to this one: what it predates gets what it would have had. Saves
// from before seasons started from two rooms had the whole original keep.
export function upgrade(g) {
  g.keep ??= { floors: FULL_KEEP.floors.map((fl) => fl.map((r) => ({ ...r }))) };
  for (const t of [g.tuning, g.tuning0]) if (t && !('startFloors' in t)) t.startFloors = FULL_KEEP.floors.length;
  // A keep from before traits played without them (its tuning says so, so its actions still replay); loaded
  // into this build, its numbers move to the build's, which turns them on. Everyone gets the trait their name
  // would have drawn.
  for (const t of [g.tuning, g.tuning0]) if (t && !('traits' in t)) t.traits = 0;
  // Likewise a keep from before the Unlit went around lights, or before fire.
  for (const t of [g.tuning, g.tuning0]) if (t && !('goAround' in t)) t.goAround = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('fire' in t)) t.fire = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('dreamwell' in t)) t.dreamwell = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('whispers' in t)) t.whispers = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('year' in t)) t.year = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('raidFight' in t)) t.raidFight = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('plague' in t)) t.plague = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('requests' in t)) t.requests = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('siege' in t)) t.siege = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('weather' in t)) t.weather = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('deep' in t)) t.deep = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('generations' in t)) t.generations = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('yearHardness' in t)) t.yearHardness = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('church' in t)) t.church = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('crusade' in t)) t.crusade = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('acts' in t)) t.acts = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('lanterns' in t)) t.lanterns = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('errands' in t)) t.errands = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('omens' in t)) t.omens = 0;
  for (const t of [g.tuning, g.tuning0]) if (t && !('ownStreams' in t)) t.ownStreams = 0;
  for (const p of g.living || []) p.trait ??= traitFor(g, p.name);
  for (const b of g.bodies || []) if (b.was === undefined) b.was = b.from === 'raider' ? null : traitFor(g, b.name);
  for (const d of g.shades || []) {
    if (d.was !== undefined) continue;
    d.was = d.from === 'raider' ? null : traitFor(g, d.name);
    d.trait = d.was ? TRAITS[d.was].dead : null;
  }
  for (const t of [g.tuning, g.tuning0]) if (t) for (const [k, v] of Object.entries(TUNING)) if (!(k in t)) t[k] = v;
  g.res.stone ??= 0;
  g.haunted ??= [];
  g.badLuck ??= 0;
  g.fires ??= [];
  g.scorched ??= [];
  if (g.night) g.night.broken ??= [];
  return g;
}

export function replay(seed, tuning, actions) {
  const s = newSeason(seed, tuning);
  for (const { a, at } of actions) {
    let guard = 1e7;
    while (!(s.season === at.season && s.day === at.day && s.phase === at.phase && s.t === at.t)) {
      if (s.phase !== 'day' && s.phase !== 'night') throw new Error(`Replay stuck: season ${s.season} day ${s.day} ${s.phase}, waiting for ${JSON.stringify(at)}`);
      if (!guard--) throw new Error('Replay ran away');
      step(s);
    }
    const r = act(s, a);
    if (!r.ok) throw new Error(`Replay action ${a.type} failed: ${r.error}`);
  }
  return s;
}
