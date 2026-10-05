// The weeks 7–10 slice: one season in one keep. Pure and deterministic like the greyboxes: one JSON
// state, step() is one fixed tick, act() one player action, replay() rebuilds a session.
//
// The day runs the weeks 1–2 rules (the living, deaths by cause, the crypt, raids). The night runs the
// weeks 3–4 engine on the same keep's Tain (candles, Creepers, holding the light), with a job in each
// twin room. Dawn joins the weeks 1–2 rite to the weeks 3–4 fading. On top: a seven-day season with
// escalating raids, the Lantern Church's inspections, and the Hollow on the night of the new moon.

import {
  TICKS_PER_SEC, TUNING, DAY_ROOMS, WORK_ROOMS, TWINS, MAP, KINDS, WORKING, CAUSES, GUIDE_UP,
  MIRRORS, mirrorsOf, START_MIRRORS, MIRROR_PLACES, CAST, BONDS, START_SHADES, BOND_OTHER, NAMES, RAIDER_NAMES, BUILDABLE, TRAITS, TRAIT_KEYS, SHADE_TRAITS, SEASONS,
  TUTORIAL, REQUESTS, ACTS, OMENS, VISITORS, STUDIES, DECREES, decreeDoes, decreesOf, twinJob, CHAPTERS, PRESETS, TROUBLES,
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
// How much harder year y starts than the one before: yearHardness in the open year, campaignHardness through
// a campaign's five chapters, and yearHardness again in the years after its ending (README, problem 43).
const CAMPAIGN_YEARS = 5;
const rateOfYear = (T, y) => (T.campaign && (y <= CAMPAIGN_YEARS || !T.yearHardness) ? T.campaignHardness : T.yearHardness);
// The next year's, for the year's end.
export const yearRate = (s) => rateOfYear(s.tuning, yearOf(s) + 1);
export const hard = (s, k = 'hardness') => {
  const T = s.tuning;
  // With the year on, a season's place in its year, and the year: each year harder by its rate (Maws aside).
  if (T.year && rateOfYear(T, 2)) {
    if (k !== 'hardness') return Math.pow(T[k], seasonIndex(s));
    const years = yearOf(s) - 1;
    const chapters = !T.campaign ? 0 : T.yearHardness ? Math.min(years, CAMPAIGN_YEARS - 1) : years; // years hardened at the campaign's rate
    return Math.pow(T[k], seasonIndex(s)) * Math.pow(T.campaignHardness, chapters) * Math.pow(T.yearHardness, years - chapters);
  }
  return Math.pow(T[k], s.season - 1);
};
// The tutorial keep's script for today and tonight, while it lasts (its first three days), and whether the
// Veil is still kept from breaking.
export const tutorialDay = (s) => (s.tuning.tutorial && s.season === 1 ? TUTORIAL.days[s.day] || null : null);
export const tutorialNight = (s) => (s.tuning.tutorial && s.season === 1 ? TUTORIAL.nights[s.day] || null : null);
export const veilKept = (s) => !!s.tuning.tutorial && s.season === 1 && s.day < TUTORIAL.safeUntil;
// The campaign (round six): five years as five chapters, then the open year. The chapter a keep is in: its
// year, until the fifth year's ending; 0 in the open year, and after the campaign.
export const campaignOn = (s) => !!s.tuning.campaign && !!s.tuning.year;
export const chapterOf = (s) => (campaignOn(s) && !s.campaign?.ending ? Math.min(5, yearOf(s)) : 0);
// Whether a pressure a chapter brings has come yet: from its year in a campaign, always in the open year.
export const arrived = (s, year) => !campaignOn(s) || yearOf(s) >= year;
// A chapter's goal and its closing choices, as this keep's rules have them: round seven's phase 15 (chapterGoals,
// chapterCloses), or round six's for a keep from before.
export const goalOf = (s, k) => (s.tuning.chapterGoals || !CHAPTERS[k].oldGoal ? CHAPTERS[k].goal : CHAPTERS[k].oldGoal);
export const closeOf = (s, k) => (s.tuning.chapterCloses || !CHAPTERS[k].oldClose ? CHAPTERS[k].close : CHAPTERS[k].oldClose);
// Round seven, phase 15 (chapterSystems): what each of a campaign's chapters brings besides its pressure, by its
// year. Before it, a keep in a campaign doesn't meet it: no visitor comes to the gate, no omen at dusk, and so on.
export const CHAPTER_BRINGS = { visitors: 2, traitor: 2, bearer: 2, library: 3, hall: 3, hunter: 3, deep: 4, errands: 4, omens: 4, price: 4, eclipse: 5 };
export const brought = (s, what) => !s.tuning.chapterSystems || !campaignOn(s) || !(what in CHAPTER_BRINGS) || yearOf(s) >= CHAPTER_BRINGS[what];
// The Library and the Hall wait for the keep's season lateRoomsFrom (round seven, phase 4), and in a campaign for
// The Lantern Church (phase 15).
export const LATE_ROOMS = ['library', 'hall'];
export const roomReady = (s, type) => !LATE_ROOMS.includes(type) || (s.season >= (s.tuning.lateRoomsFrom || 1) && brought(s, type));
// From the fourth year of a campaign the Hollow grows, and so do its nights.
// The year's trouble (round seven, phase 12), and what it makes of k (or dflt in a year without one).
export const troubleOf = (s) => (s.tuning.troubles && s.trouble?.year === yearOf(s) ? s.trouble.id : null);
// A rite against it (troubleRite) halves it until the season ends.
export const eased = (s) => !!troubleOf(s) && s.eased === s.season;
export const troubled = (s, k, dflt) => {
  const v = TROUBLES[troubleOf(s)]?.[k];
  return v === undefined ? dflt : eased(s) ? dflt + (v - dflt) / 2 : v;
};
export const hollowRisen = (s) => (campaignOn(s) && yearOf(s) >= 4) || (troubleOf(s) === 'deep' && !eased(s));
// The cracks that break the Veil: cracksMax, and one more for each ward on the Veil this season (veilWard).
export const cracksOf = (s) => s.tuning.cracksMax + (s.tuning.veilWard ? s.veilHeld || 0 : 0);
export const veilWardCost = (s) => s.tuning.veilWard * ((s.veilHeld || 0) + 1);
// Whether repairs have begun (round seven, phase 12): from the keep's year repairsFrom (its season, with the year
// off). In its first year what breaks is put right as before.
export const repairing = (s) => !!s.tuning.repairs && (s.tuning.year ? yearOf(s) : s.season) >= (s.tuning.repairsFrom || 1);
const yearOfSeason = (season) => Math.floor((season - 1) / SEASONS.length) + 1;
// A lasting help chosen at a chapter's close, for the year it's for.
export const boonNow = (s, id) => s.campaign?.boons?.[id] === yearOf(s);
// Each season its own trouble: summer's plague and autumn's siege, with the year on.
// The year's end: after the Long Night, before the next season, unless the Veil was sealed.
export const yearsEnd = (s) => s.phase === 'end' && !!s.tuning.year && seasonIndex(s) === 3 && !s.sealed && !s.opened;
export const plagueSeason = (s) => !!s.tuning.plague && !!s.tuning.year && seasonIndex(s) === 1;
export const besieged = (s) => !!s.siege && !s.siege.broken && s.day >= s.siege.from && s.day <= s.siege.until;
export const sallyOdds = (s) => (s.siege ? clamp(((s.tuning.guardsGoOut ? guardStrength(s) : defense(s)) * (boonNow(s, 'sallyport') ? s.tuning.sallyPort : 1)) / (s.tuning.sallyOdds * s.siege.strength), 0.1, 0.9) : 0);
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
    eclipse: null, // while the sun is dark on midsummer's day: { from, to, side, woke }
    campaign: null, // a campaign's record: { goals, closed, boons, ending }, or null in the open year
    rev: 0,
    res: { food: tuning.startFood, candles: tuning.startCandles, glass: tuning.startGlass, essence: 0, remembrance: 0, stone: tuning.startStone },
    // The keep's layout, top floor first. Never changed in place: building replaces it.
    keep: { floors: startKeep(tuning.startFloors).floors.map((fl) => fl.map((r) => ({ ...r }))) },
    steel: false,
    haunted: [], // rooms (ids) a Maw broke last night, haunted until dusk
    lastDusk: null, // the posts and candles the last night began with, for As last night: { posts: [[id, f, x]], candles: [[f, x]] }
    badLuck: 0, // unlucky days to come, from a broken mirror
    fires: [], // rooms burning today: { room, heat, full }
    scorched: [], // rooms (ids) burned out yesterday, dead until dusk
    dreamt: 0, // a Wistful shade's good dreams: what the living work at the day after, or 0
    learned: [], // the Library's studies finished (ids of STUDIES)
    study: null, // the one it's on: { id, lore, kind (for the old rites) }
    decree: null, // the Hall's standing decree: { id, season }
    court: false, // a shade sat in the Court of Shades last night: one request is heard free at this rite
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
    if (tuning.muster && isGuard(p)) p.muster = 1; // the keep's guards have stood their posts
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
  hangAll(s); // round seven, phase 13: the first two mirrors hang in the first two rooms, the first dead's first
  rollDay(s);
  say(s, `Season 1, day 1. The new moon is ${tuning.seasonDays} days off. Anyone who dies inside the walls wakes at dusk as a shade.`, 'day');
  if (campaignOn(s)) {
    s.campaign = { goals: {}, closed: {}, boons: {}, ending: null };
    chapterNews(s);
  }
  weatherNews(s);
  return s;
}
// A chapter's opening: its name, what it brings and its goal.
function chapterNews(s) {
  const k = chapterOf(s);
  const C = CHAPTERS[k];
  if (!C) return;
  say(s, `Year ${k} of the campaign: ${C.name}. ${C.text} The goal: ${goalOf(s, k).text}.`, 'rite', true);
}
// A chapter's goal, looked at when it's due: whether it was met, and its reward.
function chapterGoal(s, k) {
  const C = CHAPTERS[k];
  if (!C || s.campaign.goals[k] !== undefined) return;
  const g = goalOf(s, k);
  const days = [...s.days.filter((d) => yearOfSeason(d.season) === k), s.today];
  const looked = s.inspections.filter((i) => yearOfSeason(i.season) === k);
  let met = true;
  if (g.id === 'candles') met = s.res.candles + EPS >= g.n;
  // Round seven, phase 15 (chapterGoals): a sally that broke the siege; every inspection blessed with g.n of the
  // dead or more in the glass; a mirror raised with quicksilver.
  else if (g.id === 'sally') met = days.some((d) => d.sallies?.includes(1));
  else if (g.id === 'kept') met = looked.length > 0 && looked.every((i) => i.verdict === 'blessed' && (i.shades ?? 0) >= g.n);
  else if (g.id === 'silver') met = days.some((d) => d.upgraded);
  else if (g.id === 'gate') {
    const raids = days.map((d) => d.raid).filter((r) => r && !r.crusade && !r.paid);
    met = raids.length > 0 && raids.every((r) => r.held);
  } else if (g.id === 'church') met = !s.inspections.some((i) => yearOfSeason(i.season) === k && i.verdict === 'censured');
  else if (g.id === 'hollow') met = days.filter((d) => d.night?.hollow === 'driven back').length >= g.n;
  s.campaign.goals[k] = met;
  if (met) gain(s, 'remembrance', s.tuning.goalReward);
  say(s, met ? `${C.name}: the goal is met, to ${g.text}. The keep will tell of it: +${s.tuning.goalReward} remembrance.` : `${C.name}: the goal, to ${g.text}, was not met.`, met ? 'good' : '', true);
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
// A line for the log. alert: true calls it out to the page, or the alert's kind (alerts.js), by which the page
// decides whether it stops the clock or opens a panel, and the replay viewer what it marks: never by the words
// (round seven, phase 6), so a line can be reworded freely.
function say(s, text, tone = '', alert = false) {
  const kind = typeof alert === 'string' ? alert : null;
  s.log.push({ season: s.season, day: s.day, phase: s.phase, t: s.t, text, tone, ...(kind ? { kind } : {}) });
  if (s.log.length > 800) s.log.splice(0, s.log.length - 800);
  if (alert) s.alerts.push({ text, tone, ...(kind ? { kind } : {}) });
  s.rev++;
}
// Round seven, phase 14: what the keep has met, each kind of happening the first time it comes (s.met[kind], the
// season and day), for the measurement and the page. It rolls nothing and changes nothing the rules read.
export function meet(s, kind) {
  if (!s.met) s.met = {};
  if (!s.met[kind]) s.met[kind] = { season: s.season, day: s.day };
}
// Sounds and vibration: a side channel for the page, never read by the rules. It exists only while a page
// listens (the page sets s.cues to an array and empties it each frame), so replays, tests and the autopilot
// never fill it. A cue with a place (floor and x) can be panned to where it happened.
function cue(s, name, f, x) {
  if (s.cues && s.cues.length < 64) s.cues.push(f === undefined ? { name } : { name, f, x });
}
function gain(s, res, n) {
  s.res[res] = (s.res[res] || 0) + n; // quicksilver has no store until a shade first brings some back
  // The store holds essenceCap at most: what the Choir sings beyond it is lost.
  const cap = res === 'essence' && s.tuning.essenceCap;
  if (cap) s.res.essence = Math.min(s.res.essence, Math.max(cap, s.res.essence - n));
  s.today.made[res] = (s.today.made[res] || 0) + n;
}

/* ---------------------------------------------------------------- derived values */

export const mirrorCap = (m) => MIRRORS[m.type].cap;
export const mirrorUse = (s, m) => s.shades.filter((d) => d.mirror === m.id).length;
export function capacity(s) {
  let cap = 0;
  let used = 0;
  for (const m of s.mirrors) {
    cap += m.hidden || m.turned ? mirrorUse(s, m) : mirrorCap(m); // nobody new is bound into a hidden mirror, or one turned to the wall
    used += mirrorUse(s, m);
  }
  return { cap, used, free: cap - used };
}
const freeMirror = (s) => {
  const order = s.tuning.mirrorRooms ? safestFirst(s) : s.mirrors;
  return order.find((m) => m.type === 'hall' && !m.hidden && !m.turned && mirrorUse(s, m) < mirrorCap(m)) || order.find((m) => !m.hidden && !m.turned && mirrorUse(s, m) < mirrorCap(m)) || null;
};
// Round seven, phase 13 (mirrorRooms): the room a mirror hangs in, the mirror hung in a room, and the doors. A
// door is a mirror with a shade in it, neither turned to the wall nor hidden: the way between a room and its
// twin, both ways.
export const hangsIn = (s, m) => (s.tuning.mirrorRooms && m.room && geo(s).rooms[m.room] ? m.room : null);
export const mirrorIn = (s, id) => (s.tuning.mirrorRooms ? s.mirrors.find((m) => m.room === id) || null : null);
export const isDoor = (s, m) => !!hangsIn(s, m) && !m.turned && !m.hidden && mirrorUse(s, m) > 0;
// Whether a Maw comes through a door yet: from the keep's doorsFrom-th season.
export const doorsOpen = (s) => !!s.tuning.mirrorRooms && s.season >= (s.tuning.doorsFrom || 1);
export const doorAt = (s, id) => {
  const m = mirrorIn(s, id);
  return m && isDoor(s, m) ? m : null;
};
// How many floors below the Veil a mirror hangs by night (0 under it), or far for one hung nowhere.
export const veilDistance = (s, m) => {
  const id = hangsIn(s, m);
  return id ? geo(s).veil - geo(s).rooms[id].f : 99;
};
// How much a room's kind draws the Maws, who come for work: 0 for a room nobody works by day or night (the
// Crypt, a Granary, a Cellar), 1 for a bare hall (something may yet be raised in it), 2 for one worked only by
// night, 3 for one worked by day.
export const mawLure = (type) => (DAY_ROOMS[type]?.out ? 3 : TWINS[type]?.job ? 2 : type === 'empty' ? 1 : 0);
// The mirrors, the safest door first: hung where the Maws come least, then nearest the Veil (round seven, phase 13).
const safestFirst = (s) => {
  const lure = (m) => (hangsIn(s, m) ? mawLure(geo(s).rooms[m.room].type) : 9);
  return [...s.mirrors].sort((a, b) => lure(a) - lure(b) || veilDistance(s, a) - veilDistance(s, b));
};
// Where a new mirror hangs unless told: the free room that draws the Maws least, the nearest the Veil of those,
// the left one first.
export function hangSpot(s) {
  const taken = new Set(s.mirrors.map((m) => hangsIn(s, m)).filter(Boolean));
  const free = Object.values(geo(s).rooms).filter((r) => !taken.has(r.id));
  return free.sort((a, b) => mawLure(a.type) - mawLure(b.type) || b.f - a.f || a.x0 - b.x0)[0]?.id ?? null;
}
// A mirror's name says where it hangs: the Hearth pier glass.
function hangMirror(s, m, id) {
  m.room = id;
  m.name = `${DAY_ROOMS[typeOf(geo(s), id)]?.name || 'Hall'} ${MIRRORS[m.type].name}`;
  // Whispers and steps go where the mirror hangs: in a room nobody works, they stop.
  if (!DAY_ROOMS[typeOf(geo(s), id)]?.out) for (const d of s.shades) if (d.mirror === m.id && (d.byDay?.how === 'whisper' || d.byDay?.how === 'step')) d.byDay = null;
}
// Mirrors with nowhere to hang (a keep that takes up mirrorRooms, or one whose room is gone) go to the free
// rooms nearest the Veil, the fullest first.
export function hangAll(s) {
  if (!s.tuning.mirrorRooms) return;
  for (const m of [...s.mirrors].sort((a, b) => mirrorUse(s, b) - mirrorUse(s, a))) {
    if (hangsIn(s, m)) continue;
    const id = hangSpot(s);
    if (id) hangMirror(s, m, id);
    else m.room = null;
  }
}
// Whether a shade's mirror is a great-glass hall, where the dead fade hallFade as fast (round seven, phase 12).
export const inHall = (s, d) => byId(s.mirrors, d.mirror)?.type === 'hall';
// A shade down in the Deep (from dusk to dawn) is out of the Tain for the night, and one in a mirror hidden
// from a crusade is out of everything until it's brought out.
export const canWork = (d) => !!d.mirror && WORKING.includes(d.kind) && !d.deep && !d.hidden && !d.turned;
// A shade's act (round six): which it has, whether it's at it now, and what it costs.
export const actOf = (d) => Object.keys(ACTS).find((k) => ACTS[k].kind === d.kind) || null;
export const acting = (s, d, what) => !!d.act && d.act.what === what && tainAwake(s) && s.t < d.act.until;
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
export const canAct = (s, d) => !!s.tuning.acts && tainAwake(s) && canWork(d) && !!actOf(d) && (d.acted || 0) < actsFor(s, d) && !d.climb && d.memory > actCost(s, d) + EPS;
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
  if (isTwinnedLiving(s, p)) m *= twinMultOf(s);
  const L = livingTrait(s, p);
  if (L) m *= (L.any ?? 1) * (L.jobs?.[p.job] ?? L.other ?? 1) * (isGuard(p) ? (L.guard ?? 1) : 1);
  if (s.dreamt) m *= s.dreamt; // good dreams, the day after
  if (decreeOf(s) === 'curfew') m *= DECREES.curfew.work;
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
  for (const p of s.living) if (p.job && !p.fighting && !p.walls) (by[p.job] ||= []).push(livingMult(s, p) * (coached.has(p.job) ? s.tuning.whisperMult : 1) * musterOf(s, p));
  for (const d of s.shades) if (stepsThrough(s, d) && stepRoom(s, d)) (by[stepRoom(s, d)] ||= []).push(perf(d) * s.tuning.stepWork);
  if (storesBarred(s)) for (const k of BARRED) delete by[k];
  if (besieged(s)) delete by.yard; // the gate is shut: nobody quarries outside
  if (embargoed(s)) delete by.glazier; // no silver to be had
  for (const [job, ms] of Object.entries(by)) {
    const free = workCap(s, job);
    const all = jobCap(s, job) - (DAY_ROOMS[job]?.outdoors ? 0 : roomsOf(geo(s), job).filter((r) => isAblaze(s, r.id)).length * s.tuning.roomCap);
    if (ms.length > free) ms.sort((a, b) => b - a);
    // A ruined room (round seven, phase 7) is haunted too, and its places come last, at ruinWork.
    const ruinedCap = DAY_ROOMS[job]?.outdoors ? 0 : roomsOf(geo(s), job).filter((r) => s.ruined?.includes(r.id) && !isAblaze(s, r.id)).length * s.tuning.roomCap;
    for (let i = 0; i < ms.length && i < all; i++) out[job] += i < free ? ms[i] : ms[i] * (i >= all - ruinedCap ? s.tuning.ruinWork : s.tuning.hauntWork);
  }
  if (raining(s)) out.yard *= s.tuning.rainYard; // the Yard is outdoors
  return out;
}
export const defense = (s) => {
  const pw = roomPower(s);
  const raiding = s.raid && (s.raid.state === 'coming' || s.raid.state === 'assault');
  const riders = raiding && !s.raid.crusade ? s.riders || 0 : 0; // the lord's, against the Host only
  const levy = raiding && decreeOf(s) === 'levy' ? DECREES.levy.defense : 0;
  const walls = raiding && !s.raid.crusade && boonNow(s, 'walls') ? 2 : 0; // raised at the First Winter's close
  const smiths = s.tuning.forgeArms ? armedDefense(s) : pw.forge * DAY_ROOMS.forge.rate; // arms the smiths made, or the smiths themselves
  return walls + pw.barracks * DAY_ROOMS.barracks.rate + smiths + (pw.gatehouse || 0) * DAY_ROOMS.gatehouse.rate + (s.raid?.ward || 0) + (s.watchBonus || 0) + onWalls(s).length * s.tuning.raidBellDefense + gateGuard(s) + (s.gateHelp || 0) + riders + levy;
};
// The dead at the gate: Loyal shades granted their request stand guard by day at their night strength.
export const atGate = (s, d) => !!s.tuning.requests && canWork(d) && d.byDay?.how === 'gate';
// Round six's three rooms. Guards stand in a Barracks or a Gatehouse; the Library's studies, once finished,
// are the keep's for good; the Hall's decree stands for the season it was proclaimed in, while a Hall stands.
export const GUARD_JOBS = ['barracks', 'gatehouse'];
export const isGuard = (p) => GUARD_JOBS.includes(p.job);
// Round seven, phase 10: how far a guard has mustered, 0 to 1, by their time at the post (muster).
export const musterOf = (s, p) => (s.tuning.muster && isGuard(p) ? clamp(p.muster || 0, 0, 1) : 1);
// The defense still to come as the guards posted finish mustering.
export function musterGain(s) {
  if (!s.tuning.muster) return 0;
  let g = 0;
  for (const p of s.living) if (isGuard(p) && !p.fighting && !p.walls) g += DAY_ROOMS[p.job].rate * livingMult(s, p) * (1 - musterOf(s, p));
  return g;
}
// What the raid messages add while guards are still taking their posts.
const musterNote = (s) => (musterGain(s) > 0.05 ? `, and ${fmt(musterGain(s))} more as the guards posted take their places` : '');
// The Forge's arms (forgeArms): how many it can store (one for each guard's post), and what they add at the
// gate, an arm to each guard, the most mustered first, as far as each has mustered.
export const armsCap = (s) => jobCap(s, 'barracks') + jobCap(s, 'gatehouse');
const guardsOnPost = (s) => s.living.filter((p) => isGuard(p) && !p.fighting && !p.walls);
export function armedDefense(s) {
  const n = Math.floor((s.arms || 0) + EPS);
  if (!s.tuning.forgeArms || n <= 0) return 0;
  const ms = guardsOnPost(s).map((p) => musterOf(s, p)).sort((a, b) => b - a).slice(0, n);
  return ms.reduce((a, m) => a + m, 0) * s.tuning.armDefense;
}
const armedCount = (s) => (s.tuning.forgeArms ? Math.min(Math.floor((s.arms || 0) + EPS), guardsOnPost(s).length) : 0);
// The guards' own strength, the ones who'd go out of the gate: their posts' worth as far as they've mustered,
// and their arms (guardsGoOut).
export const guardStrength = (s) => s.living.filter((p) => isGuard(p) && !(p.sick > 0) && !p.fighting).reduce((a, p) => a + DAY_ROOMS[p.job].rate * livingMult(s, p) * musterOf(s, p), 0) + armedDefense(s);
// What a pursuit takes back, as a share of what was carried off.
export const pursueShare = (s) => (s.tuning.guardsGoOut && s.raid ? clamp(guardStrength(s) / Math.max(1, s.raid.strength), 0.1, 0.9) : s.tuning.raidRecover);
export const learned = (s, id) => !!s.tuning.library && !!s.learned?.includes(id);
// Round seven, phase 12: a study's rank (0, 1, or 2 for its second, learned as id + '2'), and what it gives at
// that rank: its field k, or null where it isn't learned.
export const rankOf = (s, id) => (!s.tuning.library ? 0 : s.learned?.includes(`${id}2`) ? 2 : s.learned?.includes(id) ? 1 : 0);
export const studied = (s, id, k) => {
  const r = rankOf(s, id);
  return r === 2 ? STUDIES[id].two?.[k] ?? STUDIES[id][k] : r === 1 ? STUDIES[id][k] : null;
};
export const decreeOf = (s) => (s.decree && s.tuning.hall && s.decree.season === s.season && roomsOf(geo(s), 'hall').length ? s.decree.id : null);
export const gatehouseOf = (s) => (s.tuning.gatehouse ? roomsOf(geo(s), 'gatehouse')[0] || null : null);
// From summer the Host brings ladders to the gate, and the Gatehouse's twin opens a way up from the Deep.
export const laddersDue = (s) => !!s.tuning.gatehouse && !!s.tuning.raidFight && s.season >= s.tuning.laddersFrom && arrived(s, 2);
export const undergateOpen = (s) => s.season >= s.tuning.undergateFrom && !!gatehouseOf(s) && arrived(s, 2);
// Where the Undergate opens: at its room's outer end, away from the mirror hanging there, as the Drowned come
// up at the ends of the moat's twin.
export const undergateMouth = (g) => ({ f: g.f, x: g.x0 < MAP.W / 2 ? g.x0 + 4 : g.x1 - 4 });
// The eclipse (round six): once a year, on midsummer's day, the sun goes dark for a stretch of the day and the
// Tain wakes while the day goes on. eclipseSpan is that stretch, in the day's ticks; s.eclipse stands while
// it lasts, and the Tain is awake then as it is by night.
export const eclipseDue = (s) => !!s.tuning.eclipse && !!s.tuning.year && seasonIndex(s) === 1 && s.day === s.tuning.eclipseDay && brought(s, 'eclipse');
export function eclipseSpan(s) {
  const D = dayTicks(s);
  const a = Math.round(s.tuning.eclipseAt * D);
  return [a, Math.min(D - 1, a + Math.round(s.tuning.eclipseSecs * TICKS_PER_SEC))];
}
export const eclipsing = (s) => s.phase === 'day' && !!s.eclipse;
export const tainAwake = (s) => s.phase === 'night' || eclipsing(s);
// What a living person and their dead, the shade posted in the twin of the living one's room, each work at;
// in the eclipse they fight side by side, and fight at it too.
export const twinMultOf = (s) => (eclipsing(s) ? s.tuning.eclipseTwin : s.tuning.twinMult);
// How long a ward holds the Hollow once the store has no essence to draw on.
export const wardHoldOf = (s) => s.tuning.wardHold * (studied(s, 'hollow', 'hold') ?? 1);
// How much the Hollow has grown, a year at a time: the year's hardness without the season's part, so a year's
// Long Night draws no faster than its spring (it's longer, and dearer for that); and the campaign's Deep.
export const hollowGrowth = (s) => (s.tuning.year ? hard(s) / Math.pow(s.tuning.hardness, seasonIndex(s)) : hard(s)) * (hollowRisen(s) ? s.tuning.hollowRises : 1);
// The essence a second a ward on a stair draws to hold the Hollow while it batters it: wardDraw at first,
// times its growth, Hollow-lore halving it. 0 where wards don't draw (keeps from before).
export const wardDrawOf = (s) => ((s.tuning.wardDraw || 0) * hollowGrowth(s) * s.tuning.wardHold) / wardHoldOf(s);
// What holding it off until dawn on this season's new moon takes: its time there, drawn at that rate, and a
// ward on each of the two ways up from its floor.
// What driving the Hollow back is worth: remembrance, the more the later the year (round seven, phase 8), for the
// studies, vigils and names the years after it spend.
export const hollowRewardOf = (s) => s.tuning.hollowReward + (s.tuning.hollowRewardYear || 0) * ((s.tuning.year ? yearOf(s) : 1) - 1);
export function hollowNeed(s) {
  const T = s.tuning;
  const winter = T.year && seasonIndex(s) === 3;
  const secs = T.nightSecs * (T.year ? T.seasonNight[seasonIndex(s)] * (winter ? T.longNight : 1) : 1) * (1 - T.hollowAt);
  return { secs, rate: wardDrawOf(s), essence: 2 * wardCost(s) + secs * wardDrawOf(s) };
}
// What a pour of pitch takes off the Host.
export const pitchOf = (s) => s.tuning.raidPitch * (studied(s, 'pitch', 'mult') ?? 1);
// Round six's rooms, each with its own switch in the tuning (a keep from before has none of them).
export const NEW_ROOMS = ['library', 'hall', 'gatehouse', 'lampworks'];
// Rooms raised only from floor highFrom up (round seven, phase 12).
export const HIGH_ROOMS = ['lampworks'];
// The floor a building spot is on, counted from the ground: a new floor on top is one more than the keep has.
export const spotFloor = (G, at) => (at.newFloor ? G.n + 1 : G.n - at.f);
// Where the Gatehouse may stand: at the gate, on the ground floor (floor f of G). Its twin, the Undergate, is
// then under the Veil, behind the line.
export const atTheGate = (G, f) => f === G.veil;
// How many acts a night a shade has: two for the kind the old rites were learned for.
export const actsFor = (s, d) => (s.riteKind === d.kind ? studied(s, 'rites', 'acts') ?? 1 : 1);
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
// What mending a room, or tearing it down, clears: its haunting, its ruin, its burning out (round seven, phase 12).
function clearDamage(s, id) {
  s.haunted = (s.haunted || []).filter((x) => x !== id);
  s.ruined = (s.ruined || []).filter((x) => x !== id);
  s.scorched = (s.scorched || []).filter((x) => x !== id);
  if (s.hauntLeft) delete s.hauntLeft[id];
  if (s.burnLeft) delete s.burnLeft[id];
}
// Days left of a room's haunting (with repairs), counting today's.
export const hauntLeftOf = (s, id) => (repairing(s) ? s.hauntLeft?.[id] || 0 : isHaunted(s, id) ? 1 : 0);
// Beds: the keep sleeps baseBeds, and each Quarters more. More living than that sleep crowded.
export const beds = (s) => s.tuning.baseBeds + roomsOf(geo(s), 'quarters').length * s.tuning.quartersBeds;
// How many living the keep holds: maxLiving, or as many as it has beds once that's more (bedsHold).
export const livingCap = (s) => (s.tuning.bedsHold ? Math.max(s.tuning.maxLiving, beds(s)) : s.tuning.maxLiving);
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
export const whisperedTrades = (s) => new Set(s.shades.filter((d) => whispers(s, d)).map((d) => coaches(s, d)));
// The room a shade's mirror hangs in, by type (round seven, phase 13), or null.
const mirrorRoomType = (s, d) => {
  const m = byId(s.mirrors, d.mirror);
  const id = m && hangsIn(s, m);
  return id ? typeOf(geo(s), id) : null;
};
// Whom a shade's whisper coaches: since round seven's phase 13 (mirrorRooms) whoever works the room its mirror
// hangs in; before, its old trade. And the room a great glass's shade steps into: since phase 13 the one the
// glass hangs in; before, the one chosen.
export const coaches = (s, d) => (s.tuning.mirrorRooms ? mirrorRoomType(s, d) : tradeOf(s, d));
export const stepRoom = (s, d) => (s.tuning.mirrorRooms ? mirrorRoomType(s, d) : d.byDay?.room ?? null);
// A shade's trade: the job it had in life (the keep's first dead have theirs in the ledger).
export const tradeOf = (s, d) => d.job || ledgerOf(s, d.id)?.job || null;
// Everyone at a job today, the living and the dead who stepped through.
export const handsAt = (s, type) => jobCount(s, type) + s.shades.filter((d) => stepsThrough(s, d) && stepRoom(s, d) === type).length;
// A ward's price tonight: half while a Bitter shade stays in the glass.
export const wardCost = (s) => Math.max(1, s.tuning.wardCost - (studied(s, 'wards', 'less') ?? 0)) * (s.shades.some((d) => canWork(d) && shadeTrait(s, d)?.wards) ? SHADE_TRAITS.bitter.wards : 1);
// Round seven, phase 12: the standing wards set by day this season (standingWard), and what one costs today:
// standingWard of a night's ward for each night left in the season, tonight's too.
export const standingOf = (s) => (s.tuning.standingWard ? s.standing || [] : []);
// A ward's place, in words: a stair by its room's twin, a rift by the twin it opens in.
export function wardPlace(s, id) {
  if (id === 'moat') return "the moat's twin";
  if (id === 'undergate') return 'the Undergate';
  const G = geo(s);
  const st = G.stairs.find((x) => x.id === id);
  if (st) return `the ${TWINS[typeAt(G, st.f, st.x)].name} stair`;
  const rf = MAP.rifts.find((x) => x.id === id);
  return rf ? `the rift in the ${TWINS[typeAt(G, DEEP_FLOOR, rf.x)].name}` : id;
}
export const nightsLeft = (s) => Math.max(1, s.tuning.seasonDays - s.day + 1);
export const standingCost = (s) => Math.max(1, Math.round(s.tuning.standingWard * wardCost(s) * nightsLeft(s)));
// Where the next room goes: the top floor's bare hall if it has one, else a new floor on top.
export function nextSlot(s) {
  const keep = s.keep || FULL_KEEP;
  const i = keep.floors[0].findIndex((r) => r.type === 'empty');
  if (i >= 0) return { newFloor: false, f: 0, slot: i, id: keep.floors[0][i].id };
  return keep.floors.length >= MAX_FLOORS ? null : { newFloor: true, f: 0, slot: 0 };
}
// Every bare hall in the keep, top floor first: where a room can be built besides a new floor on top.
export const bareHalls = (s) => (s.keep || FULL_KEEP).floors.flatMap((fl, f) => fl.map((r, slot) => ({ ...r, f, slot })).filter((r) => r.type === 'empty'));
// What a room costs where it goes: a new floor takes floorStone more than a bare hall, and since round seven's
// phase 12 a room above the seventh floor highStone more for each floor it stands above it.
export const raiseCost = (s, spot) => {
  const T = s.tuning;
  const floor = spot && (spot.newFloor || spot.f != null) ? spotFloor(geo(s), spot) : 0;
  const high = T.highStone ? T.highStone * Math.max(0, floor - (T.highFrom - 1)) : 0;
  return T.roomStone - (studied(s, 'masonry', 'less') ?? 0) + (spot?.newFloor ? T.floorStone || 0 : 0) + high;
};
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
export const funeralCap = (s) => priests(s) + (s.today?.priest || 0);
export const eatRate = (s) => {
  const d = decreeOf(s);
  return s.living.reduce((a, p) => a + (livingTrait(s, p)?.eats ?? 1), 0) * s.tuning.eatPerDay * (d === 'rationing' ? DECREES.rationing.eat : 1) + (d === 'levy' ? DECREES.levy.food : 0);
};
export const bear = (s) => Math.floor(s.living.length / s.tuning.dreadLivingPer) + priests(s);

/* ---------------------------------------------------------------- the clock */

export function step(s) {
  if (s.phase === 'day') dayTick(s);
  else if (s.phase === 'night') nightTick(s);
}

function dayTick(s) {
  const D = dayTicks(s);
  s.t++;
  if (s.tuning.muster) {
    const gain = 12 / (s.tuning.musterHours * D); // a tick's share of musterHours: a day is twelve hours long
    for (const p of s.living) if (isGuard(p) && (p.muster || 0) < 1) p.muster = Math.min(1, (p.muster || 0) + gain);
  }
  if (!s.eclipse && eclipseDue(s) && s.t === eclipseSpan(s)[0]) beginEclipse(s);
  const pw = roomPower(s);
  const len = dayLength(s); // a long summer day makes more, a short winter one less
  for (const r of WORK_ROOMS) {
    const R = DAY_ROOMS[r];
    if (!(R.out in s.res)) continue;
    // A room that works one store into another (the Lampworks: glass into candles) makes what its store allows.
    if (R.from) {
      const use = (pw[r] * s.tuning.lampGlass * len) / D;
      const k = use > 0 ? Math.min(1, (s.res[R.from] || 0) / use) : 0;
      if (k <= 0) continue;
      s.res[R.from] -= use * k;
      gain(s, R.out, (pw[r] * R.rate * len * k) / D);
      continue;
    }
    gain(s, R.out, ((pw[r] * R.rate * len) / D) * (R.out === 'food' ? troubled(s, 'food', 1) : 1));
  }
  if (s.tuning.forgeArms && pw.forge > 0) {
    const room = Math.max(0, armsCap(s) - (s.arms || 0));
    const add = Math.min(room, (pw.forge * DAY_ROOMS.forge.rate * len) / D);
    if (add > 0) {
      s.arms = (s.arms || 0) + add;
      s.today.made.arms = (s.today.made.arms || 0) + add;
    }
  }
  heal(s, (pw.infirmary * DAY_ROOMS.infirmary.rate * len * (studied(s, 'herbs', 'heal') ?? 1)) / D);
  if (pw.library && s.study) study(s, (pw.library * DAY_ROOMS.library.rate * len) / D);
  eat(s, D);
  if (s.fires?.length) burn(s);
  if (s.raid?.state === 'assault') assaultTick(s);
  if (s.phase !== 'day') return;
  if (s.eclipse) {
    eclipseTick(s);
    if (s.phase !== 'day') return;
  }
  for (const p of [...s.living]) {
    if (s.phase !== 'day') return;
    if (p.peace > 0 && --p.peace === 0) s.rev++;
    if (p.sick > 0 && --p.sick <= 0) {
      p.sick = 0;
      kill(s, p, 'sickness');
    }
  }
  while (s.phase === 'day' && s.events.length && s.events[0].at <= s.t) fire(s, s.events.shift());
  if (s.phase === 'day' && s.visitors?.length) visitorTick(s);
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
    say(s, 'The larder is empty. Everyone works hungry, and the weakest will starve.', 'bad', 'larder');
    meet(s, 'hunger');
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
  s.visitors = [];
  s.raid = null;
  if (T.weather) rollWeather(s);
  const tut = tutorialDay(s);
  const base = tut ? tut.raid : s.truce === s.season ? 0 : T.raidDays[s.day]; // the Host's envoy's truce: none this season
  if (base) {
    // A visitor's doing (a knight gone to the Host, a deserter come from it) moves the next raid's strength.
    s.raid = newRaid(s, raidStrength(s, base) * (s.raidEdge || 1), Math.round(T.raidWarnAt * D), Math.round(T.raidHitAt * D), !!tut);
    s.raidEdge = null;
  }
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
  if (chance(s, Math.min(1, T.sickChance * troubled(s, 'sick', 1) * luck * (crowded(s) ? T.crowdSick : 1) * (decreeOf(s) === 'rationing' ? DECREES.rationing.sick : 1)))) {
    const at = Math.round((0.1 + rand(s) * 0.5) * D);
    if (s.walled !== s.season) s.events.push({ at, type: 'sick' }); // the plague-bearer walled in: no one else this season
  }
  for (const p of s.living) {
    if (p.age === 'old' && chance(s, T.oldAgeChance)) s.events.push({ at: Math.round((0.15 + rand(s) * 0.8) * D), type: 'oldage', id: p.id });
  }
  if (T.fire) {
    // A Forge nobody works is cold (coldForge), and can't catch.
    const hot = [...roomsOf(geo(s), 'hearth'), ...roomsOf(geo(s), 'forge').filter((r) => !T.coldForge || peopleIn(s, r.id).length)];
    if (chance(s, Math.min(1, T.fireChance * troubled(s, 'fire', 1) * luck * (raining(s) ? T.rainFire : 1) * (s.barrels ? 0.5 : 1))) && hot.length) s.events.push({ at: Math.round((0.1 + 0.6 * rand(s)) * D), type: 'fire', room: pick(s, hot).id });
  }
  if (s.inspection && !s.inspection.done && s.inspection.day === s.day) s.events.push({ at: Math.round(T.inspectAt * D), type: 'inspect' });
  s.events.sort((a, b) => a.at - b.at);
  rollVisitors(s);
  rollCruelty(s);
  rollYearVisitor(s);
}

/* ---------------------------------------------------------------- the Library, the Hall and the Gatehouse */

// The Library (round six): lore from its scholars by day and the Archive's readers by night goes to the one
// study begun; finished, it's the keep's for good.
// The lore a study takes, and what beginning it takes in remembrance: its second rank, studyTwoCost times its first's.
export const studyLore = (s, id, rank = 1) => STUDIES[id].lore * (rank === 2 ? s.tuning.studyTwoCost : 1);
export const studyRem = (s, id, rank = 1) => STUDIES[id].rem * (rank === 2 ? s.tuning.studyTwoCost : 1);
// The rank a study would be begun at next: 1, 2 once the first is learned (studyTiers), or 0 when there's none.
export const nextRank = (s, id) => (!s.learned?.includes(id) ? 1 : s.tuning.studyTiers >= 2 && !s.learned.includes(`${id}2`) ? 2 : 0);
function study(s, lore) {
  const S = s.study;
  S.lore += lore;
  const two = S.rank === 2;
  if (S.lore + EPS < studyLore(s, S.id, S.rank)) return;
  s.learned.push(two ? `${S.id}2` : S.id);
  if (S.id === 'rites' && !two) s.riteKind = S.kind;
  s.study = null;
  const what = S.id === 'rites' ? `the ${KINDS[s.riteKind].name} can act ${two ? 'three times' : 'twice'} a night` : two ? STUDIES[S.id].two.text : STUDIES[S.id].text;
  say(s, `The Library has finished ${STUDIES[S.id].name}${two ? ' II' : ''}: ${what}.`, 'good', true);
  cue(s, 'good');
}
// A mirror's glass, and a room's stone, after what the Library has learned.
export const mirrorGlass = (s, n) => (rankOf(s, 'silvering') ? Math.ceil(n * studied(s, 'silvering', 'glass') - EPS) : n);
// The Hall's decree for the season, and the Court's hearing: which of the rite's requests it hears. The one
// that would turn a shade Restless if refused again goes first, then the costliest.
function heardAt(s, asks) {
  const T = s.tuning;
  const ids = Object.keys(asks);
  if (!ids.length) return null;
  const cost = (k) => (k === 'name' ? T.nameCost : k === 'remember' ? T.rememberCost : 0);
  const score = (id) => ((byId(s.shades, id)?.refused || 0) >= T.refusals - 1 ? 100 : 0) + cost(asks[id]);
  return ids.reduce((a, b) => (score(b) > score(a) ? b : a));
}

/* ---------------------------------------------------------------- visitors at the gate */

// Visitors at the gate (round six): on some days one comes, or two, rolled at dawn from their own stream, so
// a keep with them meets the same raids, sickness and Unlit as one without until an answer changes
// something. Each arrives at its hour and waits visitorWait of the day; left waiting, or still waiting at
// dusk, it takes the last of its answers. The words and numbers are VISITORS in data.js.
const VISIT_TAG = 0x715;
// When in the day each can come: pilgrims ahead of the Host, a grave-robber late, when the crypt has the day's dead.
const WINDOW = { pilgrims: [0.05, 0.3], graverobber: [0.5, 0.7] };
const raidsLeft = (s) => s.raid?.state === 'coming' || Object.entries(s.tuning.raidDays).some(([d, b]) => Number(d) > s.day && b);
const strangerOf = (s) => s.shades.find((d) => d.kind === 'stranger' && d.mirror && !d.deep) || null;
const restlessOf = (s) => s.shades.find((d) => d.kind === 'restless' && !d.mirror) || null;
function coupleOf(s) {
  const free = s.living.filter((p) => !p.bond && (p.age === 'young' || p.age === 'adult') && !(p.sick > 0));
  return free.length >= 2 ? free.slice(0, 2) : null;
}
const theDead = (s) => s.bodies.filter((b) => b.from === 'living' && !b.funeral);
// Whether a visitor can come: at dawn, when the day's are chosen, and again when it reaches the gate (some,
// like the grave-robber, need what the day brings).
function visitorCan(s, k, now) {
  const room = livingCap(s) - s.living.length;
  switch (k) {
    case 'pilgrims': return room >= 2 && s.raid?.state === 'coming' && !s.raid.crusade && !s.raid.camp;
    case 'refugees': return room >= 3;
    case 'plague': return room >= 2;
    case 'deserter': return room >= 1 && raidsLeft(s);
    case 'graverobber': return !now || theDead(s).length > 0;
    case 'priest': return !now || s.bodies.length > funeralCap(s);
    case 'knight': return !!strangerOf(s);
    case 'wedding': return !!coupleOf(s);
    case 'almoner': return s.dread >= 1;
    case 'physician': return s.living.some((p) => p.sick > 0);
    case 'reeve': return raidsLeft(s) && !s.riders;
    case 'necromancer': return !!restlessOf(s) && !!freeMirror(s);
    case 'cooper': return !!s.tuning.fire && !s.barrels && roomsOf(geo(s), 'hearth').length + roomsOf(geo(s), 'forge').length > 0;
    case 'witch': return !!s.tuning.dreamwell || !s.tuning.weepersMax; // her curse is a Weeper, or the candles
    // Round seven, phase 14: cruelty, and the years' visitors.
    case 'traitor': return !now || s.raid?.state === 'coming';
    case 'bearer': return !now || plagueSeason(s);
    case 'hunter': return !now || (!!s.inspection && !s.inspection.done);
    case 'levy': return s.living.filter((p) => p.age !== 'child').length >= 5;
    case 'wanderer': return !!freeMirror(s);
    default: return true;
  }
}
function rollVisitors(s) {
  const T = s.tuning;
  if (!T.visitors || !brought(s, 'visitors') || besieged(s) || crusadeDue(s) || (s.season === 1 && s.day < (T.visitFrom || 1))) return;
  const r = sideStream(s, VISIT_TAG);
  const D = dayTicks(s);
  const n = chance(r, T.visitorChance) ? (chance(r, T.visitorSecond) ? 2 : 1) : 0;
  for (let i = 0; i < n; i++) {
    const can = Object.keys(VISITORS).filter((k) => !VISITORS[k].by && (!T.visitorOnly || k === T.visitorOnly) && !s.visitors.some((v) => v.kind === k) && visitorCan(s, k, false));
    if (!can.length) break;
    const kind = pick(r, can);
    const [a, b] = WINDOW[kind] || [0.08, 0.55];
    const at = Math.round((a + (b - a) * rand(r)) * D);
    s.visitors.push({ id: `v${s.season}.${s.day}.${i}`, kind, at, until: at + Math.round(T.visitorWait * D), here: false, done: null });
  }
  s.visitors.sort((x, y) => x.at - y.at);
}
// Cruelty (round seven, phase 14): on a day its trouble is there, one of four happenings inside the keep, at most
// one a day, from a stream of its own, so a keep meets the same raids, sickness and Unlit with them or without
// until an answer changes something. Each is about one of the living, and one answer kills them on your order.
const CRUEL_TAG = 0xc4e;
const CRUEL = {
  traitor: 'was hanged from the wall on your order',
  bearer: 'was walled in the Crypt on your order',
  price: 'walked into the glass, given to the Hollow on your order',
  hunter: 'was burned as a witch on your order',
};
export function rollCruelty(s) {
  const T = s.tuning;
  if (!T.cruelty) return;
  const r = sideStream(s, CRUEL_TAG);
  const D = dayTicks(s);
  const grown = s.living.filter((p) => p.age !== 'child');
  const R = s.raid;
  const due = [
    ['traitor', T.traitorChance, R && R.state === 'coming' && !R.crusade && !R.camp && !R.safe, () => grown.filter((p) => !isGuard(p))],
    ['price', T.priceChance, isNewMoon(s) && !isLongNight(s) && yearOf(s) >= 2, () => (grown.some((p) => p.age === 'old') ? grown.filter((p) => p.age === 'old') : grown)],
    ['hunter', T.hunterChance, s.inspection && !s.inspection.done && !s.inspection.hunted && s.inspection.day >= s.day && s.inspection.day - s.day <= T.hunterDays && s.dread >= T.hunterDread, () => grown],
    ['bearer', T.bearerChance, plagueSeason(s) && s.living.length > beds(s), () => s.living.filter((p) => p.sick > 0)],
  ];
  for (const [kind, p, now, who] of due) {
    if (!chance(r, p) || !now || !brought(s, kind)) continue;
    const ps = who();
    if (!ps.length) continue;
    const named = pick(r, ps).id;
    const [a, b] = kind === 'traitor' ? [R.warnAt / D + 0.02, R.warnAt / D + 0.06] : kind === 'price' ? [0.4, 0.6] : [0.1, 0.35];
    const at = Math.round((a + (b - a) * rand(r)) * D);
    const cap = kind === 'traitor' ? R.hitAt - 1 : kind === 'hunter' && s.inspection.day === s.day ? Math.round(T.inspectAt * D) - 1 : D - 1;
    s.visitors.push({ id: `v${s.season}.${s.day}.${s.visitors.length}`, kind, at, until: Math.min(cap, at + Math.round(T.visitorWait * D)), here: false, done: null, named });
    s.visitors.sort((x, y) => x.at - y.at);
    if (kind === 'hunter') s.inspection.hunted = true; // once an inspection
    return;
  }
}
// The years' visitors (round seven, phase 14): from the third year to the tenth, each brings one who has never come,
// from its summer's third day, on the first day the gate is open and it can come.
export function rollYearVisitor(s) {
  const T = s.tuning;
  if (!T.yearVisitors || !T.year || chapterOf(s) || s.yearVisit === yearOf(s) || seasonIndex(s) < 1 || (seasonIndex(s) === 1 && s.day < 3)) return;
  if (besieged(s) || crusadeDue(s)) return;
  const kind = Object.keys(VISITORS).find((k) => VISITORS[k].year === yearOf(s));
  if (!kind || !visitorCan(s, kind, false) || s.visitors.some((v) => v.kind === kind)) return;
  const r = sideStream(s, CRUEL_TAG + 1);
  const D = dayTicks(s);
  const at = Math.round((0.1 + 0.3 * rand(r)) * D);
  s.visitors.push({ id: `v${s.season}.${s.day}.${s.visitors.length}`, kind, at, until: at + Math.round(T.visitorWait * D), here: false, done: null });
  s.visitors.sort((x, y) => x.at - y.at);
}
// One of the living leaves the keep for good, alive: a spouse is left unwed.
function leaveKeep(s, p) {
  const i = s.living.indexOf(p);
  if (i < 0) return;
  s.living.splice(i, 1);
  for (const q of s.living) if (q.bond?.with === p.id && q.bond.rel === 'spouse') q.bond = null;
}
// Each tick of the day: who reaches the gate, and who has waited long enough.
function visitorTick(s) {
  for (const v of s.visitors) {
    if (v.done || v.gone) continue;
    if (!v.here && s.t >= v.at) {
      if (!visitorCan(s, v.kind, true) || (v.named && !byId(s.living, v.named))) {
        v.gone = true; // the day didn't bring what it came for
        continue;
      }
      v.here = true;
      meet(s, `visitor:${v.kind}`);
      const V = VISITORS[v.kind];
      if (v.kind === 'wedding') v.who = coupleOf(s).map((p) => p.id);
      if (v.kind === 'knight') v.shade = strangerOf(s).id;
      if (v.kind === 'necromancer') v.shade = restlessOf(s).id;
      if (v.kind === 'graverobber') v.body = theDead(s).at(-1).id;
      const who = v.who ? ` ${listNames(v.who.map((id) => byId(s.living, id).name))} ask to be wed.` : v.shade && v.kind === 'knight' ? ` He asks after ${byId(s.shades, v.shade).name}.` : v.named ? ` ${V.who(byId(s.living, v.named).name)}` : '';
      if (V.year) s.yearVisit = yearOf(s);
      say(s, `${V.inside ? 'In the keep' : 'At the gate'}: ${V.name.toLowerCase()}.${who} ${cap(V.answers.at(-1).text)} unless you answer by ${hourOf(s, v.until)}.`, 'visit', 'visitor');
      cue(s, 'arrive');
    }
    if (v.here && !v.done && s.t >= v.until) answerVisitor(s, v, VISITORS[v.kind].answers.at(-1).id, true);
  }
}
// The Host's next raid made harder or easier: today's, while it is still coming, or else the next one rolled.
// Returns whether it was today's.
function edgeRaid(s, m) {
  const r = s.raid;
  if (r && r.state === 'coming' && !r.crusade && !r.safe) {
    r.strength = r1(r.strength * m);
    r.count = Math.max(2, Math.round(r.strength / 2));
    return true;
  }
  s.raidEdge = (s.raidEdge || 1) * m;
  return false;
}
// The hour of a tick of the day, as the page's clock shows it.
function hourOf(s, t) {
  const h = 6 + (12 * t) / dayTicks(s);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
}
// Why an answer can't be given now, if it can't: what it costs, or what it needs that's gone since.
export function visitorBlock(s, v, id) {
  const A = VISITORS[v.kind].answers.find((a) => a.id === id);
  if (!A || (A.rule && !s.tuning[A.rule])) return 'No such answer.';
  for (const [k, n] of Object.entries(A.cost || {})) if ((s.res[k] || 0) + EPS < n) return `That takes ${n} ${k}, and the keep has ${fmt(s.res[k] || 0)}.`;
  if (v.kind === 'wedding' && id === 'feast' && v.who.some((pid) => !byId(s.living, pid))) return 'One of them is dead.';
  if (v.kind === 'knight' && id === 'free' && !byId(s.shades, v.shade)) return 'His brother is gone from the glass.';
  if (v.kind === 'necromancer' && id === 'bind' && (!byId(s.shades, v.shade) || !freeMirror(s))) return 'There is nothing for him to bind, or no mirror with room.';
  if (v.named && !byId(s.living, v.named)) return 'They are dead already.';
  if (v.kind === 'wanderer' && id === 'take' && !freeMirror(s)) return 'No mirror has room for it.';
  if (v.kind === 'levy' && id === 'send' && s.living.filter((p) => p.age !== 'child').length < 3) return 'The keep has too few grown to send two.';
  return null;
}
function joins(s, age, trait = null, r = s) {
  const p = newPerson(s, freshName(s, NAMES, r), age, null, trait);
  s.living.push(p);
  s.today.arrivals.push(p.id);
  return p;
}
function answerVisitor(s, v, id, late = false) {
  const T = s.tuning;
  const V = VISITORS[v.kind];
  const A = V.answers.find((a) => a.id === id);
  const r = sideStream(s, VISIT_TAG + 1 + Number(v.id.split('.')[2]));
  for (const [k, n] of Object.entries(A.cost || {})) s.res[k] = Math.max(0, (s.res[k] || 0) - n);
  for (const [k, n] of Object.entries(A.gain || {})) gain(s, k, n);
  if (A.dread) s.dread = clamp(s.dread + A.dread, 0, T.dreadMax);
  let what = '';
  const D = dayTicks(s);
  const key = `${v.kind}:${A.as || id}`; // a second price does what the first does
  if (key === 'mirrors:buy') {
    const m = addMirror(s, 'hand', nextPlace(s));
    what = `The ${m.name} hangs with the others.`;
  } else if (key === 'pilgrims:take') {
    const ps = [joins(s, 'adult', null, r), joins(s, 'young', null, r)];
    s.gateHelp = (s.gateHelp || 0) + A.help;
    what = `${listNames(ps.map((p) => p.name))} stay, and stand the gate with you today (+${A.help} defense). Give them jobs.`;
  } else if (key === 'refugees:take') {
    const ps = [joins(s, 'adult', null, r), joins(s, 'old', null, r), joins(s, 'child', null, r)];
    what = `${listNames(ps.map((p) => p.name))} stay. Give the grown ones jobs.`;
  } else if (key === 'graverobber:hang') {
    const b = { id: 'x' + s.nextId++, name: freshName(s, RAIDER_NAMES, r), age: 'adult', job: null, bond: null, cause: 'hanged', kind: 'restless', guided: false, how: CAUSES.hanged.text, day: s.day, funeral: false, from: 'visitor', was: null };
    s.bodies.push(b);
    addLedger(s, b);
    what = `${b.name} hangs at the gate. At dusk he wakes with the rest of the day's dead, Restless.`;
  } else if (key === 'graverobber:go') {
    const b = byId(s.bodies, v.body);
    if (b && !b.funeral) {
      s.bodies = s.bodies.filter((x) => x !== b);
      const e = ledgerOf(s, b.id);
      if (e) e.woke = 'stolen';
      endLedger(s, b.id, 'stolen');
      restFor(s, b.id, false);
      what = `He takes ${b.name}'s body with him. It won't wake at dusk.`;
    } else what = 'He goes, empty-handed.';
  } else if (key === 'knight:free') {
    const d = byId(s.shades, v.shade);
    if (d) release(s, d, 'released', `${d.name} is released to his brother.`);
    what = 'The knight leaves glass for the keep, and goes.';
  } else if (key === 'knight:keep') {
    const today = edgeRaid(s, A.edge);
    what = today ? `He rides round to join the Host at your gate: today's raid comes ×${fmt(A.edge)} harder.` : `He rides to join the Host: its next raid comes ×${fmt(A.edge)} harder.`;
  } else if (key === 'plague:take') {
    const ps = [joins(s, 'adult', null, r), joins(s, 'adult', null, r)];
    for (const p of ps) p.sick = Math.round(T.sickDays * (livingTrait(s, p)?.sick ?? 1) * D);
    what = `${listNames(ps.map((p) => p.name))} come in, sick. Untreated, the sickness kills within ${fmt(T.sickDays)} days.`;
    if (chance(r, A.risk)) {
      const well = s.living.filter((p) => !(p.sick > 0) && !ps.includes(p));
      const q = well.length ? pick(r, well) : null;
      if (q) {
        q.sick = Math.round(T.sickDays * (livingTrait(s, q)?.sick ?? 1) * D);
        what += ` ${q.name} catches it.`;
      }
    }
  } else if (key === 'wedding:feast') {
    const [a, b] = v.who.map((pid) => byId(s.living, pid));
    bond(a, b, 'spouse');
    for (const p of s.living) p.peace = Math.max(p.peace || 0, D - s.t);
    what = `${a.name} and ${b.name} are wed, and the keep feasts. Everyone is at peace until dusk.`;
  } else if (key === 'bard:sing') {
    const sad = s.living.filter((p) => p.grief);
    for (const p of sad) {
      p.grief = null;
      p.peace = Math.round(T.peaceDays * D);
    }
    what = sad.length ? `He sings the dead home. ${listNames(sad.map((p) => p.name))} ${sad.length === 1 ? 'is' : 'are'} at peace.` : 'He sings of the dead, and the keep listens.';
  } else if (key === 'deserter:take') {
    const p = joins(s, 'adult', 'brave', r);
    const today = edgeRaid(s, A.edge);
    what = `${p.name} stays. The Host will come for him: ${today ? "today's raid" : 'its next raid'} comes ×${fmt(A.edge)} harder.`;
  } else if (key === 'witch:charm') {
    s.charm = true;
    what = 'Tonight the candles will burn a quarter slower.';
  } else if (key === 'witch:church') {
    s.curse = true;
    what = `The Church thanks you. As she is taken away she curses the keep: ${s.tuning.dreamwell && s.tuning.weepersMax ? 'a Weeper will come tonight' : `tonight the candles will burn ×${Math.round(100 * s.tuning.curseBurn) / 100} as fast`}.`;
  } else if (key === 'physician:pay') {
    const sick = s.living.filter((p) => p.sick > 0);
    for (const p of sick) p.sick = 0;
    what = `He cures ${listNames(sick.map((p) => p.name))}.`;
  } else if (key === 'priest:feed') {
    s.today.priest = (s.today.priest || 0) + 1;
    what = 'He will say the rites for one of the dead at dusk.';
  } else if (key === 'reeve:pay') {
    s.riders = (s.riders || 0) + A.help;
    what = `The lord's riders will stand with you when the Host next comes (+${A.help} defense).`;
  } else if (key === 'necromancer:bind') {
    const d = byId(s.shades, v.shade);
    const m = freeMirror(s);
    Object.assign(d, { mirror: m.id, kind: 'loyal', trueKind: null, restless: 0, post: wakingSpot(s), granted: true });
    const e = ledgerOf(s, d.id);
    if (e) e.bound = { season: s.season, day: s.day, kind: 'loyal' };
    what = `${d.name} is bound into the ${m.name}, Loyal. Word of it gets about.`;
  } else if (key === 'cooper:buy') {
    s.barrels = true;
    what = 'Until the season ends, fire comes half as often.';
  } else if (key === 'traitor:hang' || key === 'bearer:wall' || key === 'price:give' || key === 'hunter:burn') {
    // Cruelty (round seven, phase 14): one of your own, killed on your order, wakes at dusk a Wraith.
    const p = byId(s.living, v.named);
    kill(s, p, 'yours', CRUEL[v.kind]);
    if (v.kind === 'traitor') what = edgeRaid(s, T.traitorHang) ? `The Host has lost its eyes: today's raid comes ×${fmt(T.traitorHang)} as hard.` : '';
    if (v.kind === 'bearer') {
      s.walled = s.season;
      what = 'No one else falls sick this season.';
    }
    if (v.kind === 'price') {
      s.priced = `${s.season}/${s.day}`;
      what = 'Tonight the Hollow stays in the Deep.';
    }
    what = `${what} At dusk ${p.name} wakes a Wraith.`.trim();
  } else if (key === 'traitor:lock') {
    const p = byId(s.living, v.named);
    p.job = null;
    p.locked = `${s.season}/${s.day}`;
    what = `${p.name} is locked in the cellar until dusk.`;
  } else if (key === 'traitor:no') {
    what = edgeRaid(s, T.traitorLet) ? `The postern is opened to the Host: today's raid comes ×${fmt(T.traitorLet)} as hard.` : '';
  } else if (key === 'levy:send') {
    const two = s.living.filter((p) => p.age !== 'child').slice(-2);
    for (const p of two) leaveKeep(s, p);
    s.riders = (s.riders || 0) + A.help;
    what = `${listNames(two.map((p) => p.name))} go with the sergeant. The lord's riders will stand with you when the Host next comes (+${A.help} defense).`;
  } else if (key === 'levy:no') {
    const today = edgeRaid(s, A.edge);
    what = `The lord's men ride with the Host: ${today ? "today's raid" : 'its next raid'} comes ×${fmt(A.edge)} harder.`;
  } else if (key === 'shrine:pray') {
    for (const d of s.shades) d.memory = Math.max(0, d.memory - 10);
    what = `+${costText(A.gain)}. Every shade loses 10 memory to their prayers.`;
  } else if (key === 'envoy:pay') {
    s.truce = s.season;
    what = 'The Host takes its tribute: no raid comes for the rest of this season.';
  } else if (key === 'bishop:bless') {
    s.consecrated = yearOf(s);
    what = 'The mirrors are consecrated: for the rest of the year the Church judges the keep a Dread kinder.';
  } else if (key === 'claimant:no') {
    const rooms = Object.values(geo(s).rooms).filter((x) => x.type !== 'empty' && x.type !== 'yard' && !s.fires.some((f) => f.room === x.id));
    const at = rooms.length ? pick(r, rooms) : null;
    what = at ? 'His men set fire to a room as they go.' : 'He goes, cursing.';
    if (at) ignite(s, at.id);
  } else if (key === 'wanderer:take') {
    const m = freeMirror(s);
    const d = newShade(s, { id: 'p' + s.nextId++, name: freshName(s, NAMES, r), kind: 'loyal', cause: 'duty', from: 'visitor', day: s.day, memory: 100 });
    d.mirror = m.id;
    s.shades.push(d);
    s.ledger.push({
      id: d.id, name: d.name, from: 'visitor', season: s.season, day: s.day, cause: 'duty', how: 'kept a fallen keep, and came to yours in a stranger\'s glass', kind: 'loyal', guided: false, job: null,
      age: 'adult', bond: null, woke: 'loyal', end: null, endDay: null, nights: 0, kills: 0, posts: {}, named: false, memory: 100,
    });
    what = `${d.name} wakes Loyal in the ${m.name}.`;
  } else if (key === 'founding:feast') {
    for (const d of s.shades) d.memory = Math.min(100, d.memory + 25);
    for (const p of s.living) p.peace = Math.max(p.peace || 0, D - s.t);
    what = 'The keep feasts with its dead: every shade gains 25 memory, and everyone is at peace until dusk.';
  } else if (A.cost || A.gain) what = [A.cost && `−${costText(A.cost)}`, A.gain && `+${costText(A.gain)}`].filter(Boolean).join(', ') + '.';
  if (A.dread) what = `${what} Dread ${A.dread > 0 ? '+' : '−'}${Math.abs(A.dread)}.`.trim();
  v.done = id;
  v.late = late;
  s.today.visitors = [...(s.today.visitors || []), { kind: v.kind, answer: id, late }];
  say(s, `${V.name}: ${late ? `left waiting, ${A.text.toLowerCase()}` : A.text.toLowerCase()}. ${what}`.trim(), A.dread > 0 ? 'bad' : 'visit', !late || A.dread > 0);
  if (A.dread > 0) cue(s, 'warn');
  else if (!late) cue(s, 'good');
}
const costText = (o) => Object.entries(o).map(([k, n]) => `${n} ${k}`).join(', ');

// A random stream of a feature's own, from the seed, the season, the day and a tag: a feature rolled from one
// (the weather, the Drowned, errands, omens, generations) leaves every other roll where it was, on or off.
// ownStreams 0, a keep from before the weather and generations had theirs, rolls those from its own.
const ownStream = (s, tag) => (s.tuning.ownStreams ? sideStream(s, tag) : s);
// Each of seed, season, day and tag is mixed in whole (streamHash 1): the first hash XORed the seed and the
// season together before mixing, so keep 1's second season drew what keep 2's first did, and seeds 1-500
// over four seasons had only a quarter as many streams as days. It never touched one keep's play, only how
// independent the autopilot's seeds were. A keep made before keeps the old hash, so its export replays.
const fmix = (h) => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
export function sideStream(s, tag) {
  if (s.tuning.streamHash) {
    let h = fmix((2166136261 ^ s.seed) >>> 0);
    for (const v of [s.season, s.day, tag]) h = fmix((h ^ v) >>> 0);
    return { rng: h };
  }
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
  const rain = T.rainChance[si] * troubled(s, 'rain', 1);
  s.forecast = r < rain ? 'rain' : r < rain + T.fogChance[si] ? 'fog' : 'clear';
}
// What the day's weather means, said at its dawn; and a warning a day ahead of rain.
function weatherNews(s) {
  if (!s.tuning.weather) return;
  const behind = geo(s).n > 1 ? ', behind the line' : ''; // a keep one floor high has its moat outside the line
  const under = 'the new moon belongs to the Hollow';
  if (raining(s)) say(s, `Rain. The Yard quarries at ${Math.round(100 * s.tuning.rainYard)}%, and fire catches and spreads less. ${drownedDue(s) ? `Tonight the Drowned come up out of the moat's twin${behind}.` : `The Drowned stay under tonight: ${under}.`}`, 'bad');
  else if (foggy(s)) say(s, 'Fog. Tonight the black mirror will show how many come and when, but not their ways.');
  if (raining(s)) meet(s, 'rain');
  else if (foggy(s)) meet(s, 'fog');
  if (forecastOf(s) === 'rain' && drownedDue(s, true)) {
    say(s, `Rain is coming tomorrow. Tomorrow night the Drowned come up out of the moat's twin, under the Veil, for the mirrors${behind ? ', behind the line' : ''}.`, 'bad', true);
    cue(s, 'warn');
  } else if (forecastOf(s) === 'rain') say(s, `Rain is coming tomorrow. The Drowned will stay under: ${under}.`);
}

// A raid's strength before the spread: the day's, harder each season, stronger for one you paid off before, and
// for a Host you can fight back if raidFightStrength says so.
// The share of the raiders' take of food that a breach carries off: half with a Granary. A keep from before
// granaryGuards had every keep's halved, Granary or not.
export const granaryShare = (s) => (!s.tuning.granaryGuards || roomsOf(geo(s), 'granary').length ? 0.5 : 1);
// Whether the Host comes again this season after today: a raid day still ahead of it.
export const raidsAhead = (s) => Object.entries(s.tuning.raidDays || {}).some(([d, v]) => Number(d) > s.day && v > 0);
export const raidStrength = (s, base) => base * hard(s) * (s.embolden || 1) * (s.tuning.raidFight ? s.tuning.raidFightStrength : 1) * troubled(s, 'raid', 1);

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
    if (n > 1) say(s, `Plague: ${listNames(taken.map((p) => p.name))} have fallen sick. In a crowded keep it spreads; untreated, it kills within ${fmt(days)} days.`, 'bad', 'plague');
    else say(s, `${taken[0].name} has fallen sick. Untreated, the sickness kills within ${fmt(days * (livingTrait(s, taken[0])?.sick ?? 1))} days.`, 'bad', 'sick');
    meet(s, n > 1 ? 'plague' : 'sickness');
    cue(s, 'warn');
  } else if (e.type === 'oldage') {
    const p = byId(s.living, e.id);
    if (p) kill(s, p, 'oldage');
    if (p) meet(s, 'oldage');
  } else if (e.type === 'raidWarn') {
    const r = s.raid;
    if (!r || r.state !== 'coming') return;
    r.warned = true;
    meet(s, r.crusade ? 'crusade' : r.camp ? 'siegeCamp' : 'raid');
    if (r.crusade) say(s, `The crusade is on the road: ${r.count} knights of the Lantern, strength ${fmt(r.strength)}, at the gate a little after noon. Your defense is ${fmt(defense(s))}${musterNote(s)}. They take no tribute; if they break in, they will smash every mirror they can find.`, 'bad', 'road');
    else if (r.camp) say(s, `The camp outside stirs: ${r.count} of the Ashen Host will come at the gate, strength ${fmt(r.strength)}. Your defense is ${fmt(defense(s))}${musterNote(s)}.`, 'bad', 'siege-camp');
    else say(s, `Raiders on the road: ${r.count} of the Ashen Host, strength ${fmt(r.strength)}. Your defense is ${fmt(defense(s))}${musterNote(s)}.`, 'bad', 'road');
    cue(s, 'horn');
  } else if (e.type === 'raidHit') {
    if (s.tuning.raidFight) startAssault(s);
    else resolveRaid(s);
  } else if (e.type === 'fire') {
    // A Forge its smiths have left since dawn is cold by now, and doesn't catch (coldForge).
    if (s.tuning.coldForge && typeOf(geo(s), e.room) === 'forge' && !peopleIn(s, e.room).length) return;
    ignite(s, e.room, !!e.safe);
  } else if (e.type === 'inspect') {
    inspect(s);
  } else if (e.type === 'notice') {
    const T = s.tuning;
    say(s, `Word comes from the Lantern Church: its inspector will visit on day ${T.firstInspection}, at noon, to judge how the keep keeps its dead. The less Dread, the better it goes.`, 'rite', 'church-word');
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
  for (const g of s.living.filter(isGuard)) {
    // The Brave fall twice as often; a Coward never does, though the dice are still thrown, so the random
    // stream doesn't shift with traits.
    const fall = livingTrait(s, g)?.fall ?? 1;
    if (chance(s, clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio * fall, 0.02, T.raidRiskMax)) && fall > 0 && !r.safe) fallen.push({ p: g, how: 'died holding the gate' });
  }
  const raiders = r.safe ? 1 : held ? (chance(s, T.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => !isGuard(p) && p.age !== 'child'); // children shelter inside
    if (civ.length && !r.safe) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
  }
  if (!held && !r.crusade) {
    const food = Math.floor(s.res.food * T.raidLoot * granaryShare(s)); // a Granary keeps half the food out of their hands
    const kept = roomsOf(geo(s), 'cellar').length ? 0.5 : 1; // a Cellar keeps half the candles and glass out of their hands
    const glass = Math.floor(s.res.glass * T.raidLoot * kept);
    const candles = Math.floor(s.res.candles * T.raidLoot * kept);
    s.res.food -= food;
    s.res.glass -= glass;
    s.res.candles -= candles;
    loot = ` They carried off ${food} food, ${glass} glass and ${candles} candles.`;
  }
  r.state = held ? 'held' : 'breached';
  if (!r.crusade) s.riders = 0;
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
  const one = who.slice(0, -1);
  const crypt = eclipsing(s) ? '' : raiders === 1 ? ' The body lies in the crypt.' : ' The bodies lie in the crypt.'; // in the eclipse they wake at once
  if (raiders) say(s, held ? `One ${one} fell inside the gatehouse.${crypt}` : `${raiders} ${one}${raiders === 1 ? ' was' : 's were'} cut down inside the walls.${crypt}`);
  for (let i = 0; i < raiders; i++) raiderBody(s);
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
  r.gate = repairing(s) ? s.gate ?? 1 : 1; // with repairs, the gate as the last assault left it
  r.left = Math.round(s.tuning.raidAssaultSecs * TICKS_PER_SEC);
  r.warned = true;
  meet(s, r.crusade ? 'crusade' : r.camp ? 'siegeCamp' : 'raid');
  if (laddersDue(s)) r.ladders = { up: 0, down: 0, next: Math.round(s.tuning.ladderEvery * TICKS_PER_SEC) };
  const def = defense(s);
  const who = r.crusade ? `The crusade is at the gate: ${r.count} knights of the Lantern` : `The Host is at the gate: ${r.count} raiders`;
  const more = musterGain(s);
  say(s, `${who}, strength ${fmt(r.strength)}, against your defense of ${fmt(def)}${more > 0.05 ? `, rising to ${fmt(def + more)} as the guards posted take their places` : ''}. ${def + EPS >= r.strength ? 'The gate should hold.' : def + more + EPS >= r.strength ? 'The gate is giving until they do.' : 'The gate is giving.'} Pitch, stone and the bell can turn it.`, 'bad', 'gate');
  cue(s, 'ram');
}
function assaultTick(s) {
  const r = s.raid;
  if (r.ladders && --r.ladders.next <= 0) ladder(s, r);
  const def = defense(s);
  r.gate -= ((s.tuning.raidBreak * Math.max(0, r.host - def)) / r.strength) * DT;
  r.left--;
  if (r.left % 20 === 0 && r.host > def + EPS) cue(s, 'ram');
  if (r.gate <= 0) endAssault(s, false);
  else if (r.host <= EPS || r.left <= 0) endAssault(s, true);
}
// From summer a ladder goes up against the wall every ladderEvery seconds of the assault. A Gatehouse with a
// gate guard on its walls throws every one down; without, they stand, and the raiders coming over them add to
// the Host.
export const gateManned = (s) => !!gatehouseOf(s) && s.living.some((p) => p.job === 'gatehouse' && !(p.sick > 0) && !p.fighting);
function ladder(s, r) {
  const T = s.tuning;
  r.ladders.next = Math.round(T.ladderEvery * TICKS_PER_SEC);
  if (gateManned(s)) {
    r.ladders.down++;
    say(s, 'A ladder goes up against the wall, and a gate guard throws it down.', 'good');
    meet(s, 'ladder');
  } else {
    r.ladders.up++;
    r.host += T.ladderHost;
    say(s, `A ladder goes up against the wall and stands. Raiders come over it: the Host +${fmt(T.ladderHost)}.`, 'bad', r.ladders.up === 1);
    meet(s, 'ladder');
  }
  cue(s, 'ram');
}
function endAssault(s, held) {
  const r = s.raid;
  const T = s.tuning;
  const def = defense(s);
  const ratio = r.host / Math.max(def, 0.5);
  const fallen = [];
  // Everyone on the walls stands a chance of falling, the guards and whoever the bell brought, and the more
  // of them there are, the more the Host's blows are shared.
  const walls = s.living.filter((p) => isGuard(p) || p.walls);
  const share = Math.min(1, T.raidShare / Math.max(1, walls.length));
  for (const g of walls) {
    const fall = (livingTrait(s, g)?.fall ?? 1) * (g.walls ? T.raidBellRisk : 1) * share;
    if (chance(s, clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio * fall, 0.02, T.raidRiskMax)) && fall > 0 && !r.safe) fallen.push({ p: g, how: isGuard(g) ? 'died holding the gate' : 'died on the walls' });
  }
  const raiders = r.safe ? 1 : held ? (chance(s, T.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  // The arms in use at the gate: armsBreak of them break (forgeArms).
  const used = armedCount(s);
  const broke = used ? Math.min(Math.floor(s.arms + EPS), Math.max(1, Math.round(used * T.armsBreak))) : 0;
  if (broke) s.arms = Math.max(0, s.arms - broke);
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => !isGuard(p) && !p.walls && p.age !== 'child'); // children shelter inside
    if (civ.length && !r.safe) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
  }
  if (!held && !r.crusade) {
    const barred = r.barred ? 0.5 : 1;
    const food = Math.floor(s.res.food * T.raidLoot * granaryShare(s) * barred);
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
  if (repairing(s)) s.gate = held ? clamp(r.gate, 0, 1) : T.gateBreached; // what's left of the gate, till mended
  if (!r.crusade) s.riders = 0;
  for (const p of s.living) if (p.walls) delete p.walls;
  s.today.raid = { strength: r.strength, defense: r1(def), held, ...(r.crusade ? { crusade: true } : {}) };
  cue(s, held ? 'held' : 'breached');
  const host = r.crusade ? 'the crusade' : 'the Host';
  const arms = broke ? ` ${broke === 1 ? 'An arm' : `${broke} arms`} broke at the gate.` : '';
  say(s, held ? `${cap(host)} fell back from the gate${r.pitched ? `, burned by ${r.pitched} ${r.pitched === 1 ? 'pour' : 'pours'} of pitch` : ''}.${arms}` : `The gate gave way, and ${host} broke in.${loot}${arms}`, held ? 'good' : 'bad', held ? true : 'breach');
  for (const f of fallen) kill(s, f.p, 'duty', f.how);
  const who = r.crusade ? 'crusader' : 'raider';
  const crypt = eclipsing(s) ? '' : raiders === 1 ? ' The body lies in the crypt.' : ' The bodies lie in the crypt.'; // in the eclipse they wake at once
  if (raiders) say(s, held ? `One ${who} fell inside the gatehouse.${crypt}` : `${raiders} ${who}${raiders === 1 ? ' was' : 's were'} cut down inside the walls.${crypt}`);
  for (let i = 0; i < raiders; i++) raiderBody(s);
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

// The Lantern Church's ledger (churchLedger): the Dread of each day since it last looked, at dusk, and today's
// now, averaged; and the Dread it judges by, that average rounded, or else the Dread at noon.
export const ledgerDread = (s) => {
  const xs = [...(s.churchLog || []), s.dread];
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};
export const judgedDread = (s) => Math.max(0, (s.tuning.churchLedger ? Math.round(ledgerDread(s)) : s.dread) + troubled(s, 'judge', 0) - (s.consecrated === yearOf(s) ? 1 : 0));
// The Lantern Church judges the keep by its Dread at noon, or by its ledger.
function inspect(s) {
  const I = s.inspection;
  if (!I || I.done) return;
  const d = judgedDread(s);
  const now = s.dread;
  const days = (s.churchLog || []).length + 1;
  const read = s.tuning.churchLedger && days > 1 ? `The inspector reads the keep's ledger: Dread ${fmt(ledgerDread(s))} on average over ${days} days. ` : '';
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
  } else if (d <= 3 || (boonNow(s, 'tithe') && !s.campaign.forgiven)) {
    verdict = 'warned';
    const forgiven = d > 3;
    if (forgiven) s.campaign.forgiven = true;
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
    s.dread = Math.max(0, now - 1);
    text = `${forgiven ? 'The Lantern Church inspector remembers the keep\'s tithe, and only warns it' : 'The Lantern Church inspector warns you'} and takes a tithe of ${tithe}. Dread ${now} → ${s.dread}.`;
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
      ? `The Lantern Church inspector censures the keep, covers the ${g.m.name}${g.ds.length ? ` and takes ${listNames(g.ds.map((x) => x.name))}` : ''}, and carries the mirror away. Dread ${now} → 2.`
      : `The Lantern Church inspector censures the keep. Dread ${now} → 2.`;
    text += escalate(s);
  }
  I.done = true;
  I.verdict = verdict;
  I.dread = d;
  s.inspections.push({ season: s.season, day: s.day, reason: I.reason, verdict, dread: d, ...(s.tuning.churchLedger ? { now } : {}), shades: s.shades.filter((x) => x.mirror).length });
  s.today.inspection = { verdict, dread: d };
  meet(s, 'inspection');
  if (verdict === 'censured') meet(s, 'censure');
  if (s.tuning.churchLedger) s.churchLog = []; // the ledger starts again from the inspection
  say(s, read + text, verdict === 'blessed' ? 'good' : 'bad', 'church');
  cue(s, verdict === 'blessed' ? 'blessed' : 'censured');
}

// A censure with the Church's escalation on: a silver embargo, or, under one already, the Inquisition.
function escalate(s) {
  const T = s.tuning;
  if (!T.church || !arrived(s, 3)) return '';
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
    meet(s, 'inquisition');
    s.church = { embargo: Math.max(s.church.embargo, until), inquisition: until };
    if (again) return ` The Inquisition stays: the inquisitor will inspect the keep every day at noon for ${T.inquisitionDays} more days.`;
    return ` Censured under its embargo, the keep is given to the Inquisition: an inquisitor will inspect it every day at noon for ${T.inquisitionDays} days, unless it finds the keep at peace first.`;
  }
  s.church = { embargo: dayNo(s) + T.embargoDays, inquisition: 0 };
  meet(s, 'embargo');
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
  else if (eclipsing(s)) wakeNow(s, b);
  return b;
}
function raiderBody(s) {
  const b = {
    id: 'r' + s.nextId++, name: freshName(s, RAIDER_NAMES), age: 'adult', job: null, bond: null, cause: 'raider', kind: 'stranger',
    guided: false, how: CAUSES.raider.text, day: s.day, funeral: false, from: 'raider',
  };
  s.bodies.push(b);
  addLedger(s, b);
  if (eclipsing(s)) wakeNow(s, b);
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
  say(s, `Fire in the ${DAY_ROOMS[R.type].name}! Everyone in it fights it; send the Yard to help, or it will spread and kill.`, 'bad', 'fire');
  meet(s, 'fire');
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
        say(s, `The fire spreads from the ${name} to the ${DAY_ROOMS[o.type].name}.`, 'bad', 'fire-spread');
        ignite(s, o.id);
      }
    }
  }
}

function endDay(s) {
  if (s.eclipse) endEclipse(s);
  if (s.raid?.state === 'assault') {
    endAssault(s, s.raid.gate > 0); // the Host falls back at nightfall if the gate still stands
    if (s.phase === 'over') return;
  }
  for (const v of s.visitors || []) {
    if (v.here && !v.done) answerVisitor(s, v, VISITORS[v.kind].answers.at(-1).id, true);
    else if (!v.here) v.gone = true;
  }
  s.gateHelp = 0;
  if (s.tuning.churchLedger) (s.churchLog ||= []).push(s.dread); // the Church's ledger: each day's Dread at dusk
  s.phase = 'dusk';
  s.t = 0;
  s.events = [];
  s.watchBonus = 0;
  // With repairs (round seven, phase 12) what a Maw broke stays haunted, and what burned stays dead, a while.
  const T0 = s.tuning;
  const rep = repairing(s);
  if (!rep) {
    s.haunted = [];
    s.ruined = [];
  }
  // A fire still burning at dusk burns the night through: its room is dead tomorrow (with repairs, burnDays days
  // unless it's mended).
  const burnt = (s.fires || []).map((f) => f.room);
  if (rep) {
    const left = (s.burnLeft ||= {});
    for (const id of Object.keys(left)) if (--left[id] <= 0) delete left[id];
    for (const id of burnt) left[id] = T0.burnDays;
    s.scorched = Object.keys(left);
  } else s.scorched = burnt;
  for (const id of burnt) say(s, `The fire in the ${DAY_ROOMS[typeOf(geo(s), id)].name} burns into the night. Nobody can work there ${rep && T0.burnDays > 1 ? `for ${T0.burnDays} days, unless masons mend it (${fmt(T0.mendStone)} stone)` : 'tomorrow'}.`, 'bad', true);
  s.fires = [];
  for (const p of s.living) {
    if (p.fighting) p.fighting = null;
    if (p.nightmare) delete p.nightmare;
  }
  s.dusk = { step: s.bodies.length ? 'crypt' : 'place' };
  s.night = newNight(s);
  lightLamps(s);
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
    if (!step && !jobCount(s, coaches(s, d))) continue;
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
    // A great-glass hall with room first (round seven, phase 12): the dead fade slower there. Since phase 13
    // (mirrorRooms) none wakes in a mirror turned to the wall, or one hidden from a crusade, as was meant, and
    // the rest wake in the safest door with room: hung where the Maws come least, the nearest the Veil of those.
    const open = (x) => !s.tuning.mirrorRooms || (!x.turned && !x.hidden);
    const order = s.tuning.mirrorRooms ? safestFirst(s) : s.mirrors;
    const m = order.find((x) => x.type === 'hall' && open(x) && use[x.id] < mirrorCap(x)) || order.find((x) => open(x) && use[x.id] < mirrorCap(x));
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

function rise(s, b, x, now = false) {
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
  if (e && now) e.eclipse = true;
  s.shades.push(d);
  say(s, now ? `${text} In the eclipse the dead don't wait for dusk.` : text, d.mirror ? 'wake' : 'bad', now);
  cue(s, d.mirror ? 'wake' : d.kind === 'wraith' ? 'wraith' : 'restless');
}

/* ---------------------------------------------------------------- the night */

// Round seven, phase 12: the Lamp Gallery is lit at dusk by the lamps its lampwrights filled by day, a light in its
// middle that burns until dawn unless the Unlit put it out.
function lightLamps(s) {
  if (!s.tuning.lampworks) return;
  const G = geo(s);
  const secs = (2 * nightTicks(s)) / TICKS_PER_SEC;
  for (const r of roomsOf(G, 'lampworks')) {
    const { f, x0, x1 } = roomSpan(G, r.id);
    s.night.candles.push({ id: 'k' + s.nextId++, f, x: Math.round((x0 + x1) / 2), wax: secs, max: secs, lamp: true });
  }
}
function newNight(s) {
  const T = s.tuning;
  const N = nightTicks(s);
  const long = isLongNight(s);
  const tut = tutorialNight(s); // the tutorial's first nights: its numbers
  const moon = isNewMoon(s) ? T.newMoonCreepers * (hollowRisen(s) ? T.hollowRises : 1) : 1; // the Deep rising, in a campaign
  const count = tut ? tut.creepers : Math.round((T.creepersBase + T.creepersPerNight * Math.min(s.day, T.seasonDays - 1)) * (long ? T.longNightCreepers : moon) * hard(s));
  // The Unlit come in tides: a few stragglers, and the rest in waves that can swamp one candle. The Long
  // Night has one tide more, and since round seven's phase 8 the new moon newMoonTides more.
  const waves = tut ? tut.tides : 1 + Math.floor(s.day / T.tideEvery) + (long ? 1 : isNewMoon(s) ? T.newMoonTides || 0 : 0);
  // Round seven, phase 8: the Long Night ends in a last great tide, greatTide of its Creepers at greatTideAt of the
  // night, called out when it rises; the rest come in its tides as on any night, all of them before it.
  const great = long && !tut ? Math.round(count * (T.greatTide || 0)) : 0;
  const span = great ? Math.min(0.7, T.greatTideAt - T.tideSpread - 0.12) : 0.7;
  const tides = Array.from({ length: waves }, (_, w) => 0.12 + (span * (w + 0.2 + 0.6 * rand(s))) / waves);
  const spawns = [];
  for (let i = 0; i < count - great; i++) {
    const straggler = chance(s, tut?.stragglers ?? T.stragglers);
    const at = straggler ? 0.05 + 0.85 * rand(s) : tides[i % waves] + (rand(s) - 0.5) * T.tideSpread;
    spawns.push({
      at: Math.round(clamp(at, 0.02, 0.92) * N), type: 'creeper', seep: s.day >= T.seepFrom && chance(s, tut?.seep ?? T.seepShare),
      snuff: chance(s, tut?.snuff ?? T.snuffShare), rift: tut ? MAP.rifts[i % MAP.rifts.length].id : pick(s, MAP.rifts).id,
    });
  }
  for (let i = 0; i < great; i++) spawns.push({ at: Math.round(clamp(T.greatTideAt + (rand(s) - 0.5) * T.tideSpread, 0.02, 0.95) * N), type: 'creeper', seep: false, snuff: false, great: true, rift: pick(s, MAP.rifts).id });
  // Maws rise just ahead of the last tide, to open a way for the Creepers behind them, from night mawFrom.
  // The new moon belongs to the Hollow, except the Long Night, which has both.
  if (s.day >= Math.round(troubled(s, 'mawFrom', T.mawFrom)) && (!isNewMoon(s) || long)) {
    const maws = Math.round(T.mawsPerNight);
    const order = [...tides].sort((a, b) => b - a);
    for (let i = 0; i < maws; i++) spawns.push({ at: Math.round(clamp(order[i % order.length] - 0.03, 0.02, 0.9) * N), type: 'maw', seep: false, snuff: false, rift: pick(s, MAP.rifts).id, ...(tut?.maw ? { weak: tut.maw } : {}) });
  }
  if (isNewMoon(s)) {
    const hollow = { at: Math.round(T.hollowAt * N), type: 'hollow', seep: false, snuff: false, rift: pick(s, MAP.rifts).id };
    if (s.priced !== `${s.season}/${s.day}`) spawns.push(hollow); // the Hollow's price, paid
  }
  // The night after a death, the Weepers: one for each of the day's dead (up to weepersMax, 0 since round seven,
  // phase 11).
  const weepers = T.dreamwell && T.weepersMax;
  if (T.dreamwell) {
    for (let i = 0; i < Math.min(tut?.weepers ?? T.weepersMax, s.today.deaths.length); i++) spawns.push({ at: Math.round((0.1 + 0.6 * rand(s)) * N), type: 'weeper', seep: true, snuff: false, rift: pick(s, MAP.rifts).id });
    if (s.curse && weepers) {
      // The hedge-witch's curse (a visitor): one more, drawn from the visitors' own stream.
      const r = sideStream(s, VISIT_TAG + 9);
      spawns.push({ at: Math.round((0.1 + 0.6 * rand(r)) * N), type: 'weeper', seep: true, snuff: false, rift: pick(r, MAP.rifts).id, curse: true });
    }
  }
  // With no Weepers, the hedge-witch's curse is her charm turned round: tonight's candles burn at curseBurn.
  const cursed = !!s.curse && !weepers;
  s.curse = false;
  // A rainy night: the Drowned come up out of the moat's twin at any hour, all at one end of it (the
  // spawn's rift is its end of the moat). Not on the new moon, which belongs to the Hollow, as for the Maws.
  if (raining(s) && drownedDue(s)) {
    const r = ownStream(s, 0xd20);
    const end = pick(r, MAP.moat).id;
    for (let i = 0; i < drownedCount(s); i++) spawns.push({ at: Math.round((0.08 + 0.8 * rand(r)) * N), type: 'drowned', seep: false, snuff: false, rift: end });
  }
  // From summer the Gatehouse's twin, the Undergate, stirs on some nights (undergateChance), and then one
  // Creeper of each tide (undergatePerTide) comes up it, picked from a stream of its own (never a seeper, who
  // comes up in the dark wherever it is).
  const ur = sideStream(s, 0x9a7);
  if (undergateOpen(s) && !tut && chance(ur, T.undergateChance)) {
    const r = ur;
    const w = (T.tideSpread * N) / 2 + 1;
    for (const at of tides.map((x) => x * N)) {
      const near = spawns.filter((sp) => sp.type === 'creeper' && !sp.seep && sp.rift !== 'undergate' && Math.abs(sp.at - at) <= w);
      for (let i = 0; i < T.undergatePerTide && near.length; i++) {
        const sp = near.splice(randInt(r, near.length), 1)[0];
        Object.assign(sp, { from: sp.rift, rift: 'undergate' }); // its own rift, should the Undergate be shut
      }
    }
  }
  spawns.sort((a, b) => a.at - b.at);
  const night = {
    ...(T.errands && !tut && brought(s, 'errands') ? { errands: rollErrands(s, N) } : {}),
    candles: [], foes: [], spawns, tides: [...tides, ...(great ? [T.greatTideAt] : [])].map((x) => Math.round(x * N)).sort((a, b) => a - b), ...(great ? { great: Math.round(T.greatTideAt * N) } : {}), wards: [...standingOf(s)], wardHold: Object.fromEntries(standingOf(s).filter((w) => geo(s).stairs.some((x) => x.id === w)).map((w) => [w, wardHoldOf(s)])), hush: false, steel: !!s.steel || (boonNow(s, 'steel') && isNewMoon(s)),
    broken: [], // twin rooms (ids) a Maw has broken tonight
    stats: nightStats(),
    ...(cursed ? { curse: true } : {}),
  };
  // Tonight's omen, or two to choose between: the night as rolled is kept, so a choice can be changed at dusk.
  const offered = T.omens && !tut && !long && !isNewMoon(s) && s.day >= T.omenFrom && brought(s, 'omens') ? rollOmens(s, N, night) : [];
  if (offered.length === 1) applyOmen(s, night, offered[0]);
  else if (offered.length === 2) Object.assign(night, { omens: offered, base: { spawns: spawns.map((x) => ({ ...x })), tides: [...night.tides] } });
  return night;
}

const nightStats = () => ({ spawned: 0, killed: 0, crossed: 0, cracks: 0, grabbed: 0, drained: 0, essence: 0, glass: 0, wick: 0, guidance: 0, candles: 0, wards: 0, lost: [], hollow: null, taken: null, wraiths: 0, maws: 0, smashed: 0, broken: [], drowned: 0, under: 0, pulled: 0, deep: [] });

/* ---------------------------------------------------------------- the eclipse */

// The eclipse's Tain (round six): one tide of Creepers up the rifts, eclipseTide of the way in, from a stream of
// its own, so a keep meets the same raids, sickness and Unlit with it or without until it changes something.
// No Maws, no Hollow, no Weepers, no Drowned, nothing up the Undergate, no omens and no errands. Its spawns
// and marks are timed by the day's clock.
function eclipseNight(s, from, to) {
  const T = s.tuning;
  const r = sideStream(s, 0xec1);
  const count = Math.round(T.eclipseCreepers * (T.creepersBase + T.creepersPerNight * Math.min(s.day, T.seasonDays - 1)) * hard(s));
  const tide = from + Math.round(T.eclipseTide * (to - from));
  const spread = T.tideSpread * nightTicks(s);
  const spawns = [];
  for (let i = 0; i < count; i++) {
    const at = Math.round(clamp(tide + (rand(r) - 0.5) * spread, from + 1, to - 1));
    spawns.push({ at, type: 'creeper', seep: s.day >= T.seepFrom && chance(r, T.seepShare), snuff: chance(r, T.snuffShare), rift: pick(r, MAP.rifts).id });
  }
  spawns.sort((a, b) => a.at - b.at);
  const marks = [...(count ? [{ at: spawns[0].at, kind: 'tide', count }] : []), { at: to, kind: 'sun' }];
  return { eclipse: true, candles: [], foes: [], spawns, tides: [tide], wards: [], wardHold: {}, hush: false, steel: !!s.steel, broken: [], stats: nightStats(), marks };
}
// The sun goes dark: the dead stand at their posts, as at the night's start, each with its act to spend, and a
// Wraith rises in the Waking Room.
function beginEclipse(s) {
  const [from, to] = eclipseSpan(s);
  s.eclipse = { from, to, side: {}, woke: [] };
  s.night = eclipseNight(s, from, to);
  for (const d of s.shades) {
    Object.assign(d, { path: [], climb: 0, grabbedBy: null });
    if (s.tuning.acts) Object.assign(d, { acted: false, act: null });
    if (canWork(d)) Object.assign(d, { f: d.post.f, x: d.post.x, ox: d.post.x, of: d.post.f });
  }
  const { f, x0 } = roomSpan(geo(s), 'crypt');
  for (const [i, w] of s.shades.filter((d) => d.kind === 'wraith').entries()) {
    addFoe(s, 'wraith', f, x0 + 10 + i * 9, { shade: w.id, temper: 'snuff' });
    s.night.stats.wraiths++;
  }
  const k = s.night.spawns.length;
  const host = s.raid && (s.raid.state === 'coming' || s.raid.state === 'assault') && !s.raid.crusade;
  say(s, `The eclipse. The sun goes dark and the Tain wakes with the keep: the dead stand at their posts while the living work${host ? ', and the Host is at the gate' : ''}. ${k === 1 ? 'One Creeper climbs' : `${k} Creepers climb`} before the sun comes back, in ${fmt(s.tuning.eclipseSecs)} seconds. Anyone who dies in the dark wakes at once.`, 'night', 'eclipse');
  meet(s, 'eclipse');
  cue(s, 'eclipse');
}
// While it lasts: who stands beside their dead, and the Tain's tick; then the sun comes back.
function eclipseTick(s) {
  for (const p of s.living) if (isTwinnedLiving(s, p)) s.eclipse.side[p.id] = (s.eclipse.side[p.id] || 0) + 1;
  tainTick(s);
  if (s.phase === 'day' && s.t >= s.eclipse.to) endEclipse(s);
}
// The sun comes back. The Unlit left in the Tain burn away; the candles are put out, and those still half whole
// go back to the store; the shades' work is credited as at dawn; whoever stood beside their dead through half
// of it is at peace, their grief over. The Veil's cracks count at the next rite, as the night's do.
function endEclipse(s) {
  const T = s.tuning;
  const n = s.night;
  const e = s.eclipse;
  const burned = n.foes.filter((f) => f.type !== 'wraith').length;
  const back = n.candles.filter((c) => !c.wisp && !c.lamp && c.wax + EPS >= c.max / 2).length;
  s.res.candles += back;
  const wick = Math.floor(n.stats.wick + EPS);
  if (wick) s.res.candles += wick;
  const g = Math.floor(n.stats.guidance + EPS);
  if (g) s.guidance = Math.min(T.guidanceMax, s.guidance + g);
  if (n.stats.lore && s.study) study(s, n.stats.lore);
  for (const d of s.shades) {
    Object.assign(d, { path: [], climb: 0, grabbedBy: null });
    if (d.act) d.act = null;
  }
  const side = [];
  for (const p of s.living) {
    if ((e.side[p.id] || 0) < (e.to - e.from) / 2) continue;
    const d = bondedShade(s, p);
    p.grief = null;
    p.peace = Math.round(T.peaceDays * dayTicks(s));
    side.push(d ? `${p.name} (with ${d.name})` : p.name);
  }
  s.today.eclipse = { spawned: n.stats.spawned, killed: n.stats.killed, cracks: n.stats.cracks, lost: n.stats.lost.length, burned, back, wick, woke: [...e.woke], side };
  s.night = null;
  s.eclipse = null;
  say(s, `The sun comes back. ${burned ? `${burned === 1 ? 'One of the Unlit' : `${burned} of the Unlit`} left in the Tain ${burned === 1 ? 'burns' : 'burn'} away` : 'None of the Unlit are left in the Tain'}${back ? `, and ${back === 1 ? 'a candle' : `${back} candles`} still half whole ${back === 1 ? 'goes' : 'go'} back to the store` : ''}.${side.length ? ` ${listNames(side)} stood beside their dead through the dark, and ${side.length === 1 ? 'is' : 'are'} at peace.` : ''}`, 'good', true);
  cue(s, 'dawn');
}
// In the eclipse the dead don't wait for dusk: one who dies in the dark wakes at once, where the crypt would
// have woken them, with no funeral, and a Wraith rises where it wakes.
function wakeNow(s, b) {
  s.bodies = s.bodies.filter((x) => x !== b);
  const m = b.kind === 'wraith' || b.kind === 'restless' ? null : freeMirror(s);
  rise(s, b, b.kind === 'wraith' || b.kind === 'restless' ? { to: b.kind } : m ? { to: 'mirror', mirror: m } : { to: 'overflow' }, true);
  const d = s.shades.at(-1);
  s.eclipse.woke.push(d.id);
  if (d.kind === 'wraith') {
    addFoe(s, 'wraith', d.f, d.x, { shade: d.id, temper: 'snuff' });
    s.night.stats.wraiths++;
  }
}

// Omens (round six) come from their own stream, from the seed and the night, like errands, so a seed brings
// the same raids, sickness and Unlit whether omens are on or off. Everything an omen adds is rolled here, so
// choosing between two needs nothing new from the stream.
function rollOmens(s, N, n) {
  const T = s.tuning;
  const r = sideStream(s, 0x0e1);
  const first = chance(r, T.omenChance);
  const can = (more) => Object.keys(OMENS).filter((id) => (T.omenOnly ? id === T.omenOnly : !OMENS[id].more === !more) && (id !== 'hunt' || s.day >= T.mawFrom) && (!OMENS[id].more || (T.moreOmens && omenCan(s, id))));
  // Round seven, phase 14 (moreOmens): the four more come only on a night that would have had none, at
  // moreOmenChance and alone, so the six before them come as often as they did and the black mirror offers its
  // two from those six.
  const more = !first && !T.omenOnly && T.moreOmens && chance(r, T.moreOmenChance);
  if (!first && !more) return [];
  const from = can(more);
  if (!from.length) return [];
  const ids = [pick(r, from)];
  if (first && !T.omenOnly && from.length > 1 && chance(r, T.omenChoice)) ids.push(pick(r, from.filter((x) => x !== ids[0])));
  const tides = n.tides.map((x) => x / N);
  const creepers = n.spawns.filter((sp) => sp.type === 'creeper').length;
  return ids.map((id) => {
    const o = { id };
    if (id === 'sealed') o.rift = pick(r, MAP.rifts).id; // the one left open
    if (id === 'hunt') o.adds = [{ at: Math.round(clamp(Math.max(...tides) - 0.03, 0.02, 0.9) * N), type: 'maw', seep: false, snuff: false, rift: pick(r, MAP.rifts).id }];
    if (id === 'star') {
      // In a room of the deepest floor below the line.
      const G = geo(s);
      const f = G.floors.findIndex((fl, i) => i < G.veil - 1 && fl.rooms.length);
      const { x0, x1 } = roomSpan(G, pick(r, G.floors[f].rooms)[0]);
      o.at = { f, x: Math.round((x0 + x1) / 2) };
    }
    if (id === 'blood') {
      o.adds = Array.from({ length: Math.round(T.bloodMore * creepers) }, (_, i) => {
        const at = chance(r, T.stragglers) ? 0.05 + 0.85 * rand(r) : tides[i % tides.length] + (rand(r) - 0.5) * T.tideSpread;
        return { at: Math.round(clamp(at, 0.02, 0.92) * N), type: 'creeper', seep: s.day >= T.seepFrom && chance(r, T.seepShare), snuff: chance(r, T.snuffShare), rift: pick(r, MAP.rifts).id };
      });
    }
    return o;
  });
}
// Round seven, phase 14 (moreOmens): whether one of the four more omens can come tonight. A falling star needs a
// room below the line to fall in.
function omenCan(s, id) {
  if (id === 'star') {
    const G = geo(s);
    return G.floors.some((fl, i) => i < G.veil - 1 && fl.rooms.length);
  }
  return true;
}
// Grave-cold: the Unlit move at coldSpeed tonight.
const chill = (s) => (s.night?.omen?.id === 'cold' ? s.tuning.coldSpeed : 1);
// An omen on the night as rolled: where the Unlit come up, which seep, more of them, or the tides split.
function applyOmen(s, n, o) {
  const T = s.tuning;
  const N = nightTicks(s);
  const w = (T.tideSpread * N) / 2 + 1;
  if (n.base) {
    n.spawns = n.base.spawns.map((x) => ({ ...x }));
    n.tides = [...n.base.tides];
  }
  if (o.id === 'sealed') for (const sp of n.spawns) if ((sp.type === 'creeper' || sp.type === 'maw') && sp.rift !== 'undergate') sp.rift = o.rift;
  if (o.id === 'thin') for (const sp of n.spawns) if (sp.type === 'creeper' && Math.abs(sp.at - n.tides[0]) <= w) sp.seep = true;
  if (o.id === 'lull') {
    // A lull in the Deep (round seven, phase 14): every so many of the night's Creepers, lullStay of them, stay down.
    const every = Math.max(2, Math.round(1 / s.tuning.lullStay));
    let k = 0;
    n.spawns = n.spawns.filter((sp) => !(sp.type === 'creeper' && !sp.great && ++k % every === 0));
  }
  if (o.adds) n.spawns.push(...o.adds.map((x) => ({ ...x })));
  if (o.id === 'restless') {
    // Every other Creeper of each tide comes halfway to the next one, or to the night's end.
    const ends = [...n.tides.slice(1), Math.round(0.92 * N)];
    const halves = n.tides.map((at, i) => Math.round((at + ends[i]) / 2));
    n.tides.forEach((at, i) => n.spawns.filter((sp) => sp.type === 'creeper' && !sp.great && Math.abs(sp.at - at) <= w).forEach((sp, k) => k % 2 && (sp.at = Math.min(Math.round(0.92 * N), sp.at + halves[i] - at))));
    n.tides = [...n.tides, ...halves].sort((a, b) => a - b);
  }
  // A falling star lies in the dark tonight, for the first shade to reach it.
  if (o.id === 'star' || n.errands?.some((e) => e.kind === 'star')) {
    n.errands = (n.errands || []).filter((e) => e.kind !== 'star');
    if (o.id === 'star') n.errands.push({ id: `e${s.season}.${s.day}.star`, kind: 'star', f: o.at.f, x: o.at.x, done: null });
  }
  n.spawns.sort((a, b) => a.at - b.at);
  n.omen = o;
  meet(s, `omen:${o.id}`);
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
    star: () => `a star has fallen into the deepest dark below the line: the first shade to reach it brings back ${fmt(T.starGlass)} glass`,
    cold: () => `the Unlit move ${T.coldSpeed === 0.8 ? 'a fifth slower' : `${fmt(T.coldSpeed)} times as fast`}, and candles burn ${Math.round(100 * (T.coldBurn - 1))}% faster`,
    lull: () => `${T.lullStay === 0.25 ? 'a quarter' : `${Math.round(100 * T.lullStay)}%`} of the Creepers stay in the Deep tonight, and the Choir sings ${T.lullChoir === 0.5 ? 'half as loud' : `${fmt(T.lullChoir)} times as loud`}`,
    kin: () => `every shade fights ${T.kinFight === 1.25 ? 'a quarter harder' : `${fmt(T.kinFight)} times as hard`}, and fades ${T.kinFade === 1.25 ? 'a quarter faster' : T.kinFade === 1.5 ? 'half again as fast' : `${fmt(T.kinFade)} times as fast`}`,
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
  // The Long Night's last great tide (round seven, phase 8) is marked as what it is.
  for (const m of tides) if (m.count) marks.push({ at: m.from, kind: n.great && m.at === n.great ? 'great' : 'tide', count: m.count });
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
  if (s.day >= T.sleepFrom && !isNewMoon(s) && sleepers.length && chance(r, T.sleepChance) && decreeOf(s) !== 'curfew') {
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
  s.lastDusk = {
    posts: s.shades.filter(canWork).map((d) => [d.id, d.post.f, d.post.x]),
    candles: s.night.candles.filter((c) => !c.carrier).map((c) => [c.f, c.x]),
  };
  for (const d of s.shades) {
    Object.assign(d, { path: [], climb: 0, grabbedBy: null, rest: 0, sang: 0, watch: 0, drained: 0, forged: 0, court: 0 });
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
  if (isLongNight(s)) meet(s, 'longNight');
  if (n.omen) say(s, `The omen: ${OMENS[n.omen.id].name}. ${cap(omenText(s.tuning, n.omen))}.`, 'night');
  n.marks = nightMarks(s);
  if (isLongNight(s)) cue(s, 'long-night');
  cue(s, 'night');
  if (s.night.stats.wraiths) say(s, `${listNames(s.shades.filter((d) => d.kind === 'wraith').map((d) => d.name))} ${s.night.stats.wraiths === 1 ? 'rises' : 'rise'} as a Wraith in the Waking Room.`, 'bad', true);
  if (s.night.stats.wraiths) cue(s, 'wraith');
}

export function addFoe(s, type, f, x, extra = {}) {
  const T = s.tuning;
  meet(s, `unlit:${type}`);
  const hp = type === 'hollow' ? T.hollowHp * hard(s) * (hollowRisen(s) ? T.hollowRises : 1) : type === 'maw' ? T.mawHp * hard(s, 'mawHardness') : type === 'wraith' ? T.wraithHp : type === 'weeper' ? T.weeperHp : type === 'drowned' ? T.drownedHp : T.creeperHp;
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
  s.t++;
  tainTick(s);
  if (s.phase === 'night' && s.t >= nightTicks(s)) endNight(s);
}
// One tick of the Tain: by night, and by day in the eclipse.
function tainTick(s) {
  const n = s.night;
  const T = s.tuning;
  carryLanterns(s);
  const L = lightMap(geo(s), T, n.candles);
  L.stood = stood(s, L);
  spawnFoes(s, L);
  biggestTide(s);
  const burn = (n.omen?.id === 'still' ? T.stillBurn : 1) * (n.omen?.id === 'cold' ? T.coldBurn : 1) * (s.charm ? T.charmBurn : 1) * (n.curse ? T.curseBurn : 1) * (boonNow(s, 'tallow') && seasonIndex(s) === 3 ? T.tallowBurn : 1) * DT;
  for (const c of n.candles) c.wax -= burn;
  if (T.veilStrains && s.phase === 'night' && s.t % TICKS_PER_SEC === 0) strainCheck(s, burn / DT);
  for (const h of n.foes) {
    if (h.type !== 'hollow' || h.hp <= 0 || h.climb || pinned(s, h)) continue;
    for (const c of n.candles) if (c.f === h.f && Math.abs(c.x - h.x) <= T.hollowReach && !L.stood.has(c.id)) c.wax -= T.hollowEat * (hollowRisen(s) ? T.hollowRises : 1) * DT;
  }
  for (const d of [...s.shades]) if (canWork(d) && s.shades.includes(d)) shadeTick(s, L, d);
  for (const f of [...n.foes]) foeTick(s, L, f);
  if (n.errands?.length) errandTick(s, L);
  if (!tainAwake(s)) return;
  for (const f of n.foes) if (f.hp <= 0) foeDown(s, f);
  n.foes = n.foes.filter((f) => f.hp > 0);
  for (const c of n.candles) if (c.wax <= 0) cue(s, 'snuff', c.f, c.x);
  const out = n.candles.filter((c) => c.wax <= 0 && !c.carrier);
  n.candles = n.candles.filter((c) => c.wax > 0);
  // Round seven, phase 7: with autoRelight (help a player turns on), a candle that goes out at the line, or in a
  // room where a shade is posted, is lit again where it stood, from the store, keeping the last candle back to free
  // a caught shade, and not while the Unlit are at it: a Maw's smash or a Creeper's gnawing isn't undone for
  // nothing. Relighting every candle anywhere spent the store on rooms nobody stood in (problem 50).
  if (T.autoRelight) {
    const G = geo(s);
    const line = lineSpots(G);
    for (const c of out) {
      if (s.res.candles < 2 || n.foes.some((u) => u.f === c.f && Math.abs(u.x - c.x) <= 12)) continue;
      const room = roomAt(G, c.f, c.x);
      const atLine = line.some((p) => p.f === c.f && Math.abs(p.x - c.x) <= 6);
      const posted = s.shades.some((d) => canWork(d) && d.post.f === c.f && roomAt(G, d.post.f, d.post.x) === room);
      const lit = n.candles.some((k) => k.f === c.f && (atLine ? Math.abs(k.x - c.x) <= 6 : roomAt(G, k.f, k.x) === room));
      if ((atLine || posted) && !lit) lightCandle(s, c.f, c.x);
    }
  }
}

function lightCandle(s, f, x) {
  s.res.candles--;
  const wax = s.tuning.candleWax * (studied(s, 'tallow', 'wax') ?? 1);
  s.night.candles.push({ id: 'k' + s.nextId++, f, x, wax, max: wax });
  s.night.stats.candles++;
  cue(s, 'light', f, x);
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
        meet(s, 'sleepwalker');
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
        say(s, `A ${holder.type === 'wraith' ? 'Wraith' : 'Creeper'} has caught ${e.name}, sleepwalking in the dark of the ${where}. Light them or reach them within ${fmt(Math.max(0, T.sleepHold - (e.heldFor || 0)))} seconds.`, 'bad', 'caught');
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
      meet(s, 'echo');
    } else if (e.kind === 'star') {
      gain(s, 'glass', T.starGlass);
      say(s, `${d.name} brings back the fallen star from the dark of the ${twinAt(G, e.f, e.x).name}: ${fmt(T.starGlass)} glass.`, 'good', true);
    } else {
      gain(s, 'glass', T.relicGlass);
      say(s, `${d.name} brings back a relic from the dark of the ${twinAt(G, e.f, e.x).name}: ${fmt(T.relicGlass)} glass.`, 'good', true);
      meet(s, 'relic');
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

// A tide goes for the thinner stair (round seven, phase 7, thinStair): the fight standing in the light of each
// stair of the line, and the rift a climbing Creeper rises at: the one on the side of the thinner stair, or its
// own on a tie. Pure: the black mirror (threats.js) reads the same.
export function lineFight(s, L, spot) {
  const span = spanAt(L, spot.f, spot.x);
  if (!span) return 0;
  return s.shades
    .filter((d) => canWork(d) && !d.climb && !d.grabbedBy && !d.deep && d.f === spot.f && d.x >= span[0] - EPS && d.x <= span[1] + EPS)
    .reduce((a, d) => a + KINDS[d.kind].fight * perf(d), 0);
}
export function thinRift(s, L, open, own) {
  // Not in the tutorial's scripted nights, which teach the plain line; from its fourth night, as in any keep.
  if (!s.tuning.thinStair || tutorialNight(s) || open.length < 2 || !own) return own;
  const mid = MAP.W / 2;
  const LINE = lineSpots(geo(s));
  const side = (left) => {
    const spots = LINE.filter((p) => p.x < mid === left);
    return spots.length ? Math.min(...spots.map((p) => lineFight(s, L, p))) : null;
  };
  const [lf, rf] = [side(true), side(false)];
  if (lf === null || rf === null || Math.abs(lf - rf) < 1e-6) return own;
  return open.find((r) => r.x < mid === lf < rf) || own;
}
function spawnFoes(s, L) {
  const n = s.night;
  while (n.spawns.length && n.spawns[0].at <= s.t) {
    const sp = n.spawns.shift();
    if (sp.great && !n.greatRose) {
      n.greatRose = true;
      say(s, `The last great tide rises: ${n.spawns.filter((x) => x.great).length + 1} Creepers at once, at both rifts. Hold the line until dawn.`, 'bad', 'great-tide');
      meet(s, 'greatTide');
      cue(s, 'warn');
    }
    if (sp.type === 'drowned') {
      riseDrowned(s, sp);
      continue;
    }
    const open = MAP.rifts.filter((r) => !n.wards.includes(r.id));
    let rift = open.find((r) => r.id === (sp.rift === 'undergate' ? sp.from : sp.rift)) || open[0] || null;
    // The great tide rises at both rifts, each Creeper at its own: the whole of it at one stair was a funnel, not a set piece.
    if (sp.type === 'creeper' && !sp.snuff && !sp.seep && !sp.great && sp.rift !== 'undergate') {
      const own = rift;
      rift = thinRift(s, L, open, rift);
      // The first Creeper of a tide (none for 10 seconds): which rift, and whether the line's fight chose it.
      if (s.tuning.thinStair && !tutorialNight(s) && rift && s.t - (n.lastRise ?? -1e9) > 10 * TICKS_PER_SEC) {
        const side = rift.x < MAP.W / 2 ? 'left' : 'right';
        say(s, `A tide rises at the ${side} rift${rift !== own || thinRift(s, L, open, open.find((r) => r !== rift)) === rift ? `, for the thinner stair on the ${side}` : ''}.`, 'night');
      }
      n.lastRise = s.t;
    }
    // Up the Undergate, unless it's warded or its mouth is lit (then at a rift like the rest), or the Gatehouse
    // is gone.
    const gh = sp.rift === 'undergate' && !n.wards.includes('undergate') ? gatehouseOf(s) : null;
    const g = gh && !isLit(L, gh.f, undergateMouth(gh).x) ? gh : null;
    let at = null;
    let seeped = null;
    if (g) {
      at = undergateMouth(g);
      if (!n.stats.undergate) say(s, `The Unlit are coming up through the Undergate, ${tainPlace(geo(s), g.f, true)}.`, 'bad', true);
      n.stats.undergate = (n.stats.undergate || 0) + 1;
      cue(s, 'seep', at.f, at.x);
    } else if (sp.type === 'creeper' && (sp.seep || !rift)) {
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
      say(s, `A Weeper rises ${sp.curse ? "on the hedge-witch's curse" : "for the day's dead"}${at ? ` in the ${twinAt(geo(s), at.f, at.x).name}` : ''}. In the dark there it gives the sleepers nightmares.`, 'bad', true);
      cue(s, 'weep', at?.f, at?.x);
    }
    // Wards can't hold the new moon or a Maw: they break up through their rift whatever seals it.
    if (!at) at = { f: DEEP_FLOOR, x: (rift || byId(MAP.rifts, sp.from || sp.rift) || MAP.rifts[0]).x };
    const foe = addFoe(s, sp.type, at.f, at.x, { temper: sp.snuff ? 'snuff' : 'climb' });
    if (sp.type === 'creeper') foe.tide = tideOf(s, sp.at);
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
      say(s, 'The Hollow rises out of the Deep. It eats the light around it and makes for the mirrors.', 'bad', 'hollow');
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
    const side = n.eclipse && isTwinnedShade(s, d) ? T.eclipseTwin : 1; // side by side with its living one, in the eclipse
    foe.hp -= T.fightDps * K.fight * p * side * (n.steel ? T.steelFight : 1) * (S?.fight ?? 1) * (acting(s, d, 'stand') ? T.standFight : 1) * (n.omen?.id === 'kin' ? T.kinFight : 1) * DT;
    foe.lastHit = d.id;
    return;
  }
  if (d.path.length || d.post.f !== d.f || Math.abs(d.post.x - d.x) > 1.5 || !isLit(L, d.f, d.x)) return;
  const id = roomAt(geo(s), d.f, d.x);
  if (n.broken.includes(id)) return;
  const room = typeOf(geo(s), id);
  const job = room && twinJob(T, room);
  // Guarding the line is keeping watch: in the guard light the Watch's is the only work a shade does.
  if (T.lineGuard && job !== 'watch' && guardLit(geo(s), L, d.f, d.x)) return;
  const w = K.work * p * (isTwinnedShade(s, d) ? twinMultOf(s) : 1) * (S?.work ?? 1) * DT;
  if (job === 'essence') {
    const sung = T.essencePerSec * w * (S?.essence ?? 1) * (n.omen?.id === 'thin' ? T.thinChoir : 1) * (n.omen?.id === 'lull' ? T.lullChoir : 1);
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
  else if (job === 'lore') n.stats.lore = (n.stats.lore || 0) + T.lorePerSec * w;
  else if (job === 'court') d.court = (d.court || 0) + 1;
}

function foeTick(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  if (c.hp <= 0 || !tainAwake(s)) return;
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
  advance(c, (c.type === 'wraith' ? T.wraithSpeed : T.creeperSpeed) * chill(s), Math.round(T.creeperClimb * TICKS_PER_SEC));
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
      say(s, caught, 'bad', 'caught');
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
// Round seven, phase 8 (hollowWardOnly): on a night the Hollow walks (the new moon, and the Long Night), a ward on
// a stair is set against it and holds it alone; the rest of the Unlit climb past. A rift, the moat and the
// Undergate stay sealed to them all, as ever.
export const unlitWards = (s) => (s.tuning.hollowWardOnly && isNewMoon(s) ? s.night.wards.filter((w) => !geo(s).stairs.some((st) => st.id === w)) : s.night.wards);
export function wayOf(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  if (isLit(L, c.f, c.x)) return { mode: 'flee', path: fleePath(L, c) };
  // A Stranger's Lure: everything on its floor within reach comes for it, into its light if it stands in one.
  const lure = !n.hush && tainAwake(s) && s.shades.find((d) => acting(s, d, 'lure') && canWork(d) && !d.climb && d.f === c.f && Math.abs(d.x - c.x) <= T.lureReach);
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
    const to = edges.length && route(geo(s), L, c, edges, { creeper: true, wards: unlitWards(s) });
    if (to) return { mode: 'gnaw', gnaw: to.goal.candle, path: to.path };
  }
  if (c.type === 'wraith') return { mode: 'idle', path: [] };
  const r = route(geo(s), L, c, mirrorGoals(geo(s)), { creeper: true, wards: unlitWards(s) });
  if (r) return { mode: 'climb', path: r.path };
  // Cut off: gnaw the light that bars the way. With goAround, the way that crosses the fewest lights, so a
  // light with a dark way around it is passed by; without, whatever light the shortest way meets first.
  const open = route(geo(s), L, c, mirrorGoals(geo(s)), { creeper: true, ignoreLight: true, wards: unlitWards(s), litCost: T.goAround ? LIT_COST : 0 });
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
  advance(c, T.drownedSpeed * chill(s), 1);
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
      say(s, `${caught} Light the spot to make it let go.`, 'bad', 'caught');
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
    const r = spots.length && route(geo(s), L, c, spots, { creeper: true, wards: unlitWards(s) });
    c.mode = r ? 'drift' : 'idle';
    c.path = r ? r.path : [];
  }
  advance(c, T.weeperSpeed * chill(s), Math.round(T.creeperClimb * TICKS_PER_SEC));
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
  const open = route(G, L, m, mirrorGoals(G), { creeper: true, ignoreLight: true, wards: unlitWards(s), litCost: s.tuning.goAround ? LIT_COST : 0 });
  const cut = open && firstLight(L, m, open.path);
  const candles = [cut && byId(n.candles, cut.candle), m.target?.kind === 'candle' && byId(n.candles, m.target.id)];
  for (const k of candles) if (k && !out.some((t) => t.id === k.id)) out.push({ kind: 'candle', id: k.id, f: k.f, x: k.x, worth: s.tuning.mawLine });
  for (const r of Object.values(G.rooms)) {
    if (n.broken.includes(r.id)) continue;
    // Round seven, phase 13 (mirrorRooms): an open mirror in the room above is a way through, worth mawDoor.
    const worth = roomWorth(s, r) + (doorsOpen(s) && doorAt(s, r.id) ? s.tuning.mawDoor : 0);
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
    const r = route(G, L, m, [{ f: t.f, x: t.x }], { creeper: true, ignoreLight: true, wards: unlitWards(s) });
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
  if (repairing(s) && T.hauntDays > 1) return `${T.dreadPerBroken} Dread at each of the next ${T.hauntDays} dawns, unless masons mend it (${fmt(T.mendStone)} stone)${work}`;
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
  m.breaking = 0;
  const door = doorsOpen(s) && doorAt(s, id);
  if (door) {
    comeThrough(s, m, door);
    return;
  }
  // Round seven, phase 7: it stays on to ruin the room, until met (mawRuin); as before, it moves on.
  if (s.tuning.mawRuin > 0) {
    m.ruining = id;
    m.ruin = 0;
    return;
  }
  m.target = null;
  m.replan = 0;
}
// Round seven, phase 13 (mirrorRooms): a Maw that breaks a twin where a mirror stands open comes through it into
// the keep above. The Veil cracks (doorCracks), as when the Unlit cross at the Veil, and the Maw is gone from
// the Tain.
function comeThrough(s, maw, m) {
  const n = s.night;
  const k = s.tuning.doorCracks;
  const where = DAY_ROOMS[typeOf(geo(s), m.room)]?.name || 'keep';
  n.foes = n.foes.filter((x) => x !== maw);
  n.stats.crossed++;
  n.stats.through = (n.stats.through || 0) + 1;
  if (!veilKept(s) && s.cracks + k >= cracksOf(s)) keepMoment(s, 'broke', maw, `A Maw came through the ${m.name} and broke the Veil.`);
  else keepMoment(s, 'crack', maw, `A Maw came through the ${m.name} into the ${where}.`);
  s.cracks += k;
  n.stats.cracks += k;
  if (veilKept(s) && s.cracks >= cracksOf(s)) {
    s.cracks = cracksOf(s) - 1;
    say(s, `The Maw came through the ${m.name} into the ${where}. The Veil holds by a thread; from night ${TUTORIAL.safeUntil}, that would break it and lose the keep.`, 'bad', 'crack');
  } else say(s, `The Maw came through the ${m.name} into the ${where}: the Veil cracks, ${s.cracks} of ${cracksOf(s)}. A mirror turned to the wall lets nothing through.`, 'bad', 'crack');
  cue(s, 'crack', maw.f, maw.x);
  if (tainAwake(s) && s.cracks >= cracksOf(s)) {
    if (veilKept(s)) s.cracks = cracksOf(s) - 1;
    else lose(s, 'veil', 'The Veil has broken. The Unlit are loose in the keep above.');
  }
}
// A room a Maw was left alone in: tomorrow's work there is ruinWork, and the rite pays dreadPerRuin more.
function ruinRoom(s, m, id) {
  const n = s.night;
  const T = s.tuning;
  const type = typeOf(geo(s), id);
  n.ruined = [...(n.ruined || []), id];
  keepMoment(s, 'ruined', m, `A Maw was left to ruin the ${TWINS[type].name}.`);
  say(s, `Left alone, the Maw has ruined the ${TWINS[type].name}: tomorrow the ${DAY_ROOMS[type].name}'s workers manage ${Math.round(100 * T.ruinWork)}%, and it costs ${T.dreadPerRuin} more Dread at dawn.`, 'bad', 'maw');
  cue(s, 'broken', m.f, m.x);
  m.ruining = null;
  m.target = null;
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
  // Ruining a room it broke: while no shade stands against it, the ruin grows; met, it stops. With ruinLight,
  // a candle in the room holds it too, while the Maw tears the candle down.
  if (m.ruining) {
    const met = s.shades.some((d) => canWork(d) && !d.climb && !d.grabbedBy && d.f === m.f && Math.abs(d.x - m.x) <= T.reach + 1);
    const k = !met && T.ruinLight ? n.candles.find((c) => c.f === m.f && !c.carrier && c.wax > 0 && roomAt(G, c.f, c.x) === m.ruining) : null;
    if (k) {
      if (!m.smashing) {
        m.smashing = true;
        say(s, `The Maw tears at the candle in the ${twinAt(G, k.f, k.x).name}: the room holds while it burns.`, 'bad');
        cue(s, 'smash', k.f, k.x);
      }
      if (!L.stood?.has(k.id)) k.wax -= T.mawSmash * DT;
    } else {
      m.smashing = false;
      if (!met && ++m.ruin >= Math.round(T.mawRuin * TICKS_PER_SEC)) ruinRoom(s, m, m.ruining);
    }
    m.gnawing = true;
    if (m.ruining) return;
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
        say(s, `A Maw is tearing down the ${k.carrier ? 'lantern' : 'candle'} in the ${twinAt(G, k.f, k.x).name}.`, 'bad', 'maw');
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
        say(s, `A Maw is breaking the ${TWINS[type].name}. Cut it down, or the ${DAY_ROOMS[type].name} is haunted: ${hauntCost(s)}.`, 'bad', 'maw');
        cue(s, 'breaking', m.f, m.x);
      }
      m.breaking = (m.breaking || 0) + 1;
      m.gnawing = true;
      if (m.breaking >= Math.round(T.mawBreak * TICKS_PER_SEC)) breakRoom(s, m, tg.id);
      return;
    }
  }
  advance(m, T.mawSpeed * chill(s), Math.round(T.creeperClimb * 2 * TICKS_PER_SEC));
}

// The Hollow makes for the mirrors whatever the light, eating candles and draining shades as it goes.
// A ward on a stair only holds it a while; only shades standing and fighting drive it back.
// Round seven, phase 8 (hollowPinned): the Hollow held at a ward spends itself on the ward, eating no light and
// draining no one while it batters; shades that come to it there strike it freely.
export const pinned = (s, h) => !!(s.tuning.hollowPinned && h.batter && !h.path?.length);
function hollowTick(s, L, h) {
  const T = s.tuning;
  const n = s.night;
  if (!n.hush && !pinned(s, h)) {
    for (const d of s.shades) {
      if (canWork(d) && s.shades.includes(d) && !d.climb && d.f === h.f && Math.abs(d.x - h.x) <= 5) drainShade(s, d, T.hollowDrain * DT);
    }
  }
  if (!h.climb && --h.replan <= 0) {
    h.replan = 10;
    h.batter = null;
    // Round seven, phase 7 (hollowLure): a lantern draws it. While a shade carries one it can reach, the nearest
    // bearer is where it goes, and it drains whoever it comes up with; with none, the mirrors, as before.
    const bearers = T.hollowLure ? n.candles.filter((k) => k.carrier).map((k) => byId(s.shades, k.carrier)).filter((d) => d && canWork(d) && !d.climb && !d.deep) : [];
    let r = bearers.length ? route(geo(s), L, h, bearers.map((d) => ({ f: d.f, x: d.x })), { creeper: true, ignoreLight: true, wards: n.wards }) : null;
    if (r && !h.lured) {
      say(s, 'The Hollow turns from the mirrors toward the lantern.', 'night', true);
      cue(s, 'warn', h.f, h.x);
    }
    h.lured = !!r;
    if (!r) r = route(geo(s), L, h, mirrorGoals(geo(s)), { creeper: true, ignoreLight: true, wards: n.wards });
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
    // While there's essence to draw on, the ward holds; with the store empty it gives way in wardHold seconds.
    const draw = wardDrawOf(s) * DT;
    if (draw > 0 && s.res.essence + EPS >= draw) {
      s.res.essence = Math.max(0, s.res.essence - draw);
      n.stats.drawn = (n.stats.drawn || 0) + draw;
      if (!n.drawing) {
        n.drawing = true;
        say(s, `The ward on the stair draws on the essence to hold the Hollow back: ${wardDrawOf(s) < 1 ? wardDrawOf(s).toFixed(2).replace(/0$/, '') : fmt(wardDrawOf(s))} a second.`);
      }
    } else {
      if (draw > 0 && !n.dry) {
        n.dry = true;
        say(s, `The essence is spent. The ward holds the Hollow ${fmt(wardHoldOf(s))} seconds more at most.`, 'bad', true);
      }
      n.wardHold[h.batter] = (n.wardHold[h.batter] ?? wardHoldOf(s)) - DT;
    }
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
  advance(h, T.hollowSpeed * chill(s), Math.round(T.creeperClimb * 2 * TICKS_PER_SEC));
  if (h.climb || h.f !== geo(s).veil) return;
  const m = MAP.mirrors.find((x) => Math.abs(x.x - h.x) < 2);
  if (m) cross(s, h, m, T.hollowCracks);
}

// Round seven, phase 9: what winter will take in candles, by the keep's own last seven days: what its nights lit
// and its days (and the Wick Room at night) made, scaled to winter's longer nights and shorter days, over
// winter's seven nights, the Long Night counting longNight of them. What it gives is the shortfall: candles
// winter will burn beyond what the keep makes in it. From autumn, with the year on and three days to go by.
export function winterNeed(s) {
  const T = s.tuning;
  if (!T.year || !T.winterNeed || seasonIndex(s) !== 2) return null;
  const days = s.days.filter((d) => d.night).slice(-7);
  if (days.length < 3) return null;
  // Each day scaled from its own season's lengths, so summer's last days count as winter's would.
  const kOf = (d) => (d.season - 1) % SEASONS.length;
  const avg = (f) => days.reduce((a, d) => a + f(d), 0) / days.length;
  const nightF = (d) => T.seasonNight[3] / T.seasonNight[kOf(d)];
  const lit = avg((d) => (d.night.candles || 0) * nightF(d));
  const made = avg((d) => (d.made?.candles || 0) * (T.seasonDay[3] / T.seasonDay[kOf(d)]));
  const wick = avg((d) => (d.night.wick || 0) * nightF(d));
  const nights = T.seasonDays - 1 + T.longNight;
  const burn = lit * nights;
  const make = made * T.seasonDays + wick * nights;
  return { need: Math.max(0, Math.round(burn - make)), burn: Math.round(burn), make: Math.round(make), have: Math.floor(s.res.candles + EPS) };
}
// The hour of a tick of the night, as the page's clock shows it.
function nightHourOf(s, t) {
  const h = (18 + (12 * t) / nightTicks(s)) % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
}
// Round seven, phase 9 (veilStrains): the Veil strains when a stair of the line will be dark as the next tide
// comes up it: its candle out before then (by its wax alone; gnawing only makes it sooner), or no candle at all.
// Said once a stair and a tide, from strainLead seconds before the tide rises. Its Creepers take a while to climb,
// so a candle that lasts strainGrace seconds past the tide's mark is let be.
function strainCheck(s, perSec) {
  const n = s.night;
  const T = s.tuning;
  const next = n.tides.find((t) => t > s.t);
  if (next === undefined || next - s.t > T.strainLead * TICKS_PER_SEC) return;
  const G = geo(s);
  for (const st of lineSpots(G)) {
    const key = `${st.f}:${st.x}:${next}`;
    if (n.strained?.includes(key)) continue;
    const c = n.candles.filter((k) => k.f === st.f && Math.abs(k.x - st.x) <= 6 && !k.carrier).sort((a, b) => b.wax - a.wax)[0];
    const outAt = c ? s.t + (c.wax / perSec) * TICKS_PER_SEC : s.t;
    if (outAt >= next + T.strainGrace * TICKS_PER_SEC) continue;
    (n.strained ||= []).push(key);
    const side = st.x < MAP.W / 2 ? 'left' : 'right';
    say(s, c ? `The Veil strains: the candle at the ${side} stair will be out before the tide at ${nightHourOf(s, next)} is up it.` : `The Veil strains: the ${side} stair is dark, and a tide comes at ${nightHourOf(s, next)}.`, 'bad', 'strain');
  }
}
// Which tide a Creeper rose with (round seven, phase 9): the tide on the clock it rose within, or none, a
// straggler being a tide of its own.
function tideOf(s, at) {
  const n = s.night;
  const w = (s.tuning.tideSpread * nightTicks(s)) / 2 + 1;
  const i = n.tides.findIndex((t) => Math.abs(t - at) <= w);
  return i >= 0 ? i : null;
}
function cross(s, c, m, cracks) {
  const n = s.night;
  const where = twinAt(geo(s), geo(s).veil, m.x).name;
  const who = c.type === 'drowned' ? 'One of the Drowned' : 'A Creeper';
  // Round seven, phase 9 (crackPerTide): a mirror cracks once for each tide that reaches it. The rest of that
  // tide through the same mirror spill into the keep above: each gives one of the living a nightmare tomorrow.
  if (s.tuning.crackPerTide && c.type === 'creeper') {
    const key = `${m.id}:${c.tide ?? c.id}`;
    n.cracked ||= [];
    if (n.cracked.includes(key)) {
      n.foes = n.foes.filter((x) => x !== c);
      n.stats.crossed++;
      n.stats.spill = (n.stats.spill || 0) + 1;
      n.spilt ||= [];
      if (!n.spilt.includes(key)) {
        n.spilt.push(key);
        say(s, `More of the tide pours through the mirror in the ${where}. The Veil holds, but the sleepers above will pay for it.`, 'bad', true);
      }
      cue(s, 'seep', c.f, m.x);
      return;
    }
    n.cracked.push(key);
  }
  if (!veilKept(s) && s.cracks + cracks >= cracksOf(s)) keepMoment(s, 'broke', { f: c.f, x: m.x }, `${c.type === 'hollow' ? 'The Hollow' : who} broke the Veil at the mirror in the ${where}.`);
  else keepMoment(s, c.type === 'hollow' ? 'torn' : 'crack', { f: c.f, x: m.x }, c.type === 'hollow' ? `The Hollow reached the mirror in the ${where}.` : `${who} slipped through the Veil at the mirror in the ${where}.`);
  n.foes = n.foes.filter((x) => x !== c);
  s.cracks += cracks;
  n.stats.crossed++;
  n.stats.cracks += cracks;
  if (c.type === 'hollow') {
    n.stats.hollow = 'crossed';
    say(s, `The Hollow reached the mirror in the ${where} and tore through the Veil: ${cracks} cracks.`, 'bad', 'crack');
    cue(s, 'torn', c.f, m.x);
    if (s.cracks < cracksOf(s) && s.living.length) takeLiving(s, pick(s, s.living));
  } else if (veilKept(s) && s.cracks >= cracksOf(s)) {
    // The tutorial's first nights: the Veil holds by a thread.
    s.cracks = cracksOf(s) - 1;
    say(s, `${who} slipped through the Veil at the mirror in the ${where}. The Veil holds by a thread; from night ${TUTORIAL.safeUntil}, that would break it and lose the keep.`, 'bad', 'crack');
    cue(s, 'crack', c.f, m.x);
  } else {
    say(s, `${who} slipped through the Veil at the mirror in the ${where}. The Veil cracks: ${s.cracks} of ${cracksOf(s)}.`, 'bad', 'crack');
    cue(s, 'crack', c.f, m.x);
  }
  if (tainAwake(s) && s.cracks >= cracksOf(s)) {
    if (veilKept(s)) s.cracks = cracksOf(s) - 1;
    else lose(s, 'veil', 'The Veil has broken. The Unlit are loose in the keep above.');
  }
}

/* ---------------------------------------------------------------- the night in moments */

// The night review at dawn (round five): the three moments that most decided the night, each with the Tain
// as it stood, for the page to draw. A record like the log; the rules never read it. Each kind has a weight,
// the Veil breaking the most and the biggest tide the least. A kind is kept once, at its
// first, except a shade lost (each one) and the biggest tide, which moves to each new height.
const MOMENTS = { broke: 11, torn: 10, lost: 9, crack: 8, ruined: 7.5, broken: 7, 'hollow-down': 6, smash: 6, caught: 5, 'maw-down': 4, seep: 3, tide: 2 };
const SHADE_KEYS = ['id', 'name', 'kind', 'climb', 'climbTotal', 'grabbedBy', 'named', 'memory', 'mirror'];
const FOE_KEYS = ['id', 'type', 'climb', 'climbTotal', 'gnawing', 'temper', 'mode', 'quiet', 'rising', 'smashing', 'target', 'grab', 'hp', 'max', 'ruining', 'ruin'];
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
    const reward = hollowRewardOf(s);
    gain(s, 'remembrance', reward);
    say(s, `The Hollow is driven back into the Deep. The keep will tell of it: +${reward} remembrance.`, 'good', true);
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
    if (chance(s, T.deepCatch[k] * (S?.unseen ? 0.5 : 1) * (boonNow(s, 'chart') ? T.chartCatch : 1))) {
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
  // The Archive's reading goes to what the Library studies; a shade sat in the Court through half the night
  // has one of this rite's requests heard free.
  if (n.stats.lore && s.study) study(s, n.stats.lore);
  s.court = !!T.hall && s.shades.some((d) => canWork(d) && (d.court || 0) >= N / 2);
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
      say(s, `${d.name} has turned Wraith.`, 'bad', 'wraith');
      meet(s, 'turnedWraith');
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
    const loss = T.fadePerNight * (d.named ? 0.5 : 1) * (rested ? 0.5 : 1) * (S?.fade ?? 1) * (inHall(s, d) ? T.hallFade : 1) * (s.night?.omen?.id === 'kin' ? T.kinFade : 1);
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
  if (repairing(s)) {
    // A haunting already standing has a dawn less to run; what the Maws broke tonight, hauntDays.
    const left = (s.hauntLeft ||= {});
    for (const id of Object.keys(left)) if (--left[id] <= 0) delete left[id];
    for (const id of n.broken) left[id] = s.tuning.hauntDays;
    s.haunted = Object.keys(left);
    s.ruined = [...new Set([...(s.ruined || []), ...(n.ruined || [])])].filter((id) => left[id]);
  } else {
    s.haunted = [...n.broken];
    s.ruined = [...(n.ruined || [])];
  }
  s.dreamt = dreams || 0;
  // Barred in, they sleep through the Weepers; not through the Unlit that came through the Veil (phase 9).
  const bad = Math.min(s.living.length, (decreeOf(s) === 'curfew' ? 0 : n.nightmares || 0) + (n.stats.spill || 0));
  const dreamers = [];
  for (let i = 0; i < bad; i++) {
    const p = pick(s, s.living.filter((x) => !x.nightmare));
    p.nightmare = true;
    dreamers.push(p.name);
  }
  if (bad) {
    const where = roomsOf(geo(s), 'quarters').length ? 'Quarters' : 'Hearth';
    say(s, `Nightmares: ${bad}, in the ${where}${n.stats.spill ? ', from the Unlit that came through the Veil' : ''}. ${listNames(dreamers)} ${bad === 1 ? 'works' : 'work'} at ${Math.round(100 * T.nightmareMult)}% today.`, 'bad', true);
  }
  n.stats.nightmares = bad;
  s.today.night = { ...n.stats, broken: [...n.broken], ...(n.ruined?.length ? { ruined: [...n.ruined] } : {}), fading, withdrew, wick, guidance: g, watch: s.watchBonus, ...(n.errands ? { errands: n.errands.map(({ kind, name, by, done }) => ({ kind, name, by, done })) } : {}), ...(n.omen ? { omen: n.omen.id } : {}) };
  const cracks = n.stats.cracks + (s.today.eclipse?.cracks || 0); // the eclipse's count with the night's
  review(s);
  s.night = null;
  s.cracks = Math.max(0, s.cracks - (s.tuning.crackHeal ?? 1)); // the Veil mends a little by day
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
  for (const k of Object.values(asks)) meet(s, `ask:${k}`);
  for (const id of Object.keys(asks)) byId(s.shades, id).askedAt = byId(s.shades, id).nights;
  const heard = s.court ? heardAt(s, asks) : null; // the Court of Shades hears one, free
  s.court = false;
  s.rite = { choice: Object.fromEntries(s.shades.map((d) => [d.id, defaultChoice(d)])), vigils: 0, cracks, broken: (s.haunted || []).length, ruined: (s.ruined || []).length, asks, grant: {}, ...(heard ? { heard } : {}) };
  say(s, 'Dawn. The shades go back into the glass: decide who stays.', 'rite', true);
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
  const brokenD = (R.broken || 0) * T.dreadPerBroken + (R.ruined || 0) * (T.dreadPerRuin || 0); // the living saw what the Maws broke walk their rooms
  const bears = bear(s);
  // Round seven, phase 15: honouring the dead, a campaign's close, halves what the kept weigh the year after.
  if (boonNow(s, 'shrine')) keepD = Math.ceil(keepD * T.shrineDread);
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
    if (id === R.heard) continue; // heard in the Court of Shades: granted free
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
  if (repairing(s) && s.gate < 1) s.gate = Math.min(1, s.gate + T.gateMend); // the keep's own hands mend the gate a little each day
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
  s.charm = false;
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
    say(s, 'Dread has reached its height. The Lantern Church sends an inspector; it arrives at noon.', 'bad', 'church');
    cue(s, 'warn');
  } else if (s.day === T.firstInspection - 1 && (!s.inspection || s.inspection.done) && !crusadeDay(s)) {
    s.inspection = { day: T.firstInspection, reason: 'season', done: false };
    say(s, 'Word comes from the Lantern Church: an inspector will visit tomorrow at noon and judge how the keep keeps its dead.', 'rite', 'church-word');
  }
  if (s.day % T.newcomerEvery === 0 && s.living.length < livingCap(s)) {
    if (besieged(s)) say(s, 'No one new can reach the gate through the siege.', 'bad');
    else newcomer(s);
  }
  rollDay(s);
  const when = s.tuning.year ? `${cap(seasonName(s))} of year ${yearOf(s)}` : `Season ${s.season}`;
  say(s, `${when}, day ${s.day}${isLongNight(s) ? ': tonight is the Long Night' : isNewMoon(s) ? ': tonight is the new moon' : ''}.`, 'day');
  cue(s, 'day');
  if (eclipseDue(s)) say(s, `Midsummer. At ${hourOf(s, eclipseSpan(s)[0])} the sun goes dark for ${fmt(T.eclipseSecs)} seconds, and the Tain wakes with the keep: the dead at their posts and the Unlit climbing, while the living work and the Host comes to the gate.`, 'night', 'midsummer');
  weatherNews(s);
  const haunted = (s.haunted || []).filter((id) => !s.ruined?.includes(id)).map((id) => DAY_ROOMS[typeOf(geo(s), id)].name);
  const half = T.hauntWork < 1 ? ` Whoever works there manages ${Math.round(100 * T.hauntWork)}% until dusk.` : '';
  // In the log, not called out (round seven, phase 11): the night called it out as the Maw broke the room, and
  // the Day panel says it all day.
  const till = repairing(s) && T.hauntDays > 1 ? `: ${T.dreadPerBroken} Dread at each dawn while it lasts, unless masons mend it (${fmt(T.mendStone)} stone)` : ' today';
  if (haunted.length) say(s, `The ${listNames(haunted)} ${haunted.length === 1 ? 'is' : 'are'} haunted${till}.${half}`, 'bad');
  const ruined = (s.ruined || []).map((id) => DAY_ROOMS[typeOf(geo(s), id)].name);
  if (ruined.length) say(s, `The ${listNames(ruined)} ${ruined.length === 1 ? 'was' : 'were'} ruined in the night: whoever works there manages ${Math.round(100 * T.ruinWork)}% until dusk.`, 'bad');
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
      say(s, `The crusade comes today: ${Math.max(2, Math.round(C.strength / 2))} knights of the Lantern, strength ${fmt(C.strength)}, at the gate a little after noon.`, 'bad', 'road');
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
  if (!T.siege || !T.year || seasonIndex(s) !== 2 || s.day !== 3 || s.siege || !arrived(s, 2)) return;
  const raid = yesterday?.raid;
  if (!raid || raid.paid) return;
  const strength = r1(raidStrength(s, (T.raidDays[2] || 4) * T.siegeStrength));
  s.siege = { from: s.day, until: s.day + T.siegeDays - 1, strength, broken: false };
  say(s, `The Ashen Host has made camp outside the walls. For ${T.siegeDays} days the gate is shut: nobody quarries in the Yard, and no one new can come. The guards can sally out to break the camp.`, 'bad', 'siege');
  meet(s, 'siege');
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
    if (id === R.heard) {
      say(s, `${d.name}'s request was heard in the Court of Shades. It will wait.`, 'rite');
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
  say(s, `${p.name} (${p.age}) arrives at the gate and asks to stay. Assign a job.`, 'good', 'arrival');
  meet(s, 'arrival');
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
  if (chapterOf(s) && seasonIndex(s) === 3) {
    chapterGoal(s, chapterOf(s));
    const C = CHAPTERS[chapterOf(s)];
    say(s, C.close ? `${C.name} is over. Choose how the chapter closes: ${closeOf(s, chapterOf(s)).map((c) => low(c.name)).join(', or ')}.` : 'The campaign is over. Choose how the keep\'s story ends: seal the Veil, open it, or keep the watch.', 'rite', true);
  }
  cue(s, 'end');
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);
const low = (w) => w[0].toLowerCase() + w.slice(1);
const SEASON_TEXT = ['', 'the days are long and the nights short. Summer builds.', 'day and night are even again, and the year turns toward winter.', 'the days are short and the nights long. Winter lives on what was put by, and it ends with the Long Night.'];

function nextSeason(s) {
  const { cracks } = lastSeason(s);
  s.days.push({ season: s.season, day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  s.today = blankToday();
  s.season++;
  s.day = 0;
  s.inspection = null;
  s.churchLog = [];
  // A Host paid off at the season's last raid comes back harder.
  s.embolden = s.tuning.emboldenCarries ? s.grudge || 1 : 1;
  s.grudge = null;
  s.siege = null;
  s.standing = []; // a standing ward holds for the season it was set in
  s.veilHeld = 0; // and so does a ward on the Veil
  s.barrels = false; // the cooper's, for the season
  // Nothing the player does mends the Veil, so cracks don't follow the keep into a new season.
  const mended = s.cracks > 0;
  s.cracks = 0;
  if (!repairing(s)) {
    s.haunted = [];
    s.ruined = [];
  }
  toRite(s, cracks);
  const T = s.tuning;
  const turn = !T.year ? '' : seasonIndex(s) === 0 ? ` A new year begins: year ${yearOf(s)}.` : ` ${cap(seasonName(s))}: ${SEASON_TEXT[seasonIndex(s)]}`;
  say(s, `Season ${s.season} begins with the dawn.${turn}${mended ? ' The Veil has knit whole again.' : ''} The Host will come harder, and so will the Unlit.`, 'rite', true);
  cue(s, 'dawn');
  if (chapterOf(s) && seasonIndex(s) === 0) chapterNews(s);
  if (seasonIndex(s) === 0) yearsTrouble(s);
  if (chapterOf(s) && seasonIndex(s) === 3 && goalOf(s, chapterOf(s)).id === 'candles') chapterGoal(s, chapterOf(s));
  generations(s);
}

// The year's trouble (round seven, phase 12): drawn at its first dawn, from year troublesFrom of a keep with no
// chapter, among those that haven't come since each last did.
export function yearsTrouble(s) {
  const T = s.tuning;
  if (!T.troubles || !T.year || chapterOf(s) || yearOf(s) < T.troublesFrom) return;
  const ids = Object.keys(TROUBLES);
  const seen = (s.troublesSeen || []).filter((id) => ids.includes(id));
  const left = ids.filter((id) => !seen.includes(id));
  const id = pick(sideStream(s, 0x7b1), left.length ? left : ids);
  s.troublesSeen = left.length > 1 ? [...seen, id] : [];
  s.trouble = { id, year: yearOf(s) };
  meet(s, `trouble:${id}`);
  const X = TROUBLES[id];
  say(s, `${X.name}: ${X.text}.`, 'bad', true);
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
        meet(s, 'comesOfAge');
      } else if (p.age === 'young') {
        p.age = 'adult';
        news.push(`${p.name} is grown`);
        meet(s, 'grown');
      } else if (p.age === 'adult' && chance(r, T.oldChance)) {
        p.age = 'old';
        news.push(`${p.name} grows old`);
        meet(s, 'growsOld');
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
      meet(s, 'wed');
    }
  }
  // Births: once for each pair of living spouses, neither old, while the keep has room.
  const seen = new Set();
  for (const p of [...s.living]) {
    const q = p.bond?.rel === 'spouse' ? byId(s.living, p.bond.with) : null;
    if (!q || seen.has(p.id) || p.age === 'old' || q.age === 'old' || p.age === 'child' || q.age === 'child') continue;
    seen.add(p.id);
    seen.add(q.id);
    if (s.living.length >= livingCap(s) || !chance(r, T.birthChance)) continue;
    const c = newPerson(s, freshName(s, NAMES, r), 'child', null);
    Object.assign(c, { bond: { with: p.id, rel: 'parent' }, born: true, joined: { season: s.season, day: 1 } });
    s.living.push(c);
    news.push(`${p.name} and ${q.name} have a child, ${c.name}`);
    meet(s, 'birth');
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
    if (p.locked === `${s.season}/${s.day}` && room !== null) return `${p.name} is locked up until dusk.`; // a traitor's lantern (phase 14)
    if (p.age === 'child' && room !== null) return `${p.name} is a child: too young to work.`;
    if (room !== null && !(DAY_ROOMS[room] && DAY_ROOMS[room].out)) return 'No one works there.';
    if (room !== null && room !== p.job) {
      const cap = jobCap(s, room);
      const name = DAY_ROOMS[room].name;
      if (!cap) return `There is no ${name} yet. Build one first.`;
      if (handsAt(s, room) >= cap) return `The ${name} is full: ${cap} work there. Build another ${name}.`;
    }
    if (!GUARD_JOBS.includes(room)) delete p.muster; // off the post: they muster again from nothing
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
    const rooms = !!s.tuning.mirrorRooms; // round seven, phase 13: both go to the room the mirror hangs in
    if (how === 'whisper') {
      const trade = coaches(s, d);
      const R = trade && DAY_ROOMS[trade];
      if (!R?.out) return rooms ? `Nobody works where the ${byId(s.mirrors, d.mirror).name} hangs: hang it in a room someone works.` : `${d.name} had no trade in the keep to whisper.`;
      if (!jobCap(s, trade)) return `There is no ${R.name} for ${d.name} to whisper to.`;
      const other = s.shades.find((x) => x !== d && whispers(s, x) && coaches(s, x) === trade);
      if (other) return `${other.name} already whispers to the ${R.name}.`;
      d.byDay = { how };
      say(s, rooms ? `${d.name} will whisper through the ${byId(s.mirrors, d.mirror).name} to whoever works the ${R.name}.` : `${d.name} will whisper to whoever works the ${R.name}, as they did in life.`);
    } else if (how === 'step') {
      if (!inGreatGlass(s, d)) return 'Only the shades of a great glass can step through by day.';
      if (rooms) room = stepRoom(s, d);
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
    if (NEW_ROOMS.includes(room) && !T[room]) return `There is no ${DAY_ROOMS[room].name} in this keep.`;
    if (!brought(s, room)) return `The ${DAY_ROOMS[room].name} comes with The Lantern Church, in the campaign's third year.`;
    if (!roomReady(s, room)) return `The ${DAY_ROOMS[room].name} can be built from ${T.year && T.lateRoomsFrom === 2 ? 'summer' : `the keep's season ${T.lateRoomsFrom}`}.`;
    const at = buildSpot(s, where);
    if (!at) return where && where !== 'top' ? 'There is no bare hall there.' : 'The keep can rise no higher.';
    if (HIGH_ROOMS.includes(room) && spotFloor(geo(s), at) < T.highFrom) return `The ${DAY_ROOMS[room].name} is raised only from floor ${T.highFrom} up${at.newFloor ? `, and the keep stands ${geo(s).n} high` : ''}.`;
    if (room === 'gatehouse') {
      if (!arrived(s, 2)) return 'The Gatehouse comes with the Ashen Host, in the campaign\'s second year.';
      if (gatehouseOf(s)) return 'The keep has its Gatehouse.';
      if (at.newFloor || !atTheGate(geo(s), at.f)) return 'A Gatehouse stands at the gate, on the ground floor: move a room up to make it room.';
    }
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
      const bare = keep.floors[at.f][at.slot].id;
      s.keep = { floors: keep.floors.map((fl, f) => (f === at.f ? fl.map((r, i) => (i === at.slot ? made : r)) : fl)) };
      const m = mirrorIn(s, bare); // a mirror hung in the bare hall hangs on in the room raised there
      if (m) hangMirror(s, m, made.id);
    }
    const G = geo(s);
    const an = `${/^[AEIOU]/.test(DAY_ROOMS[room].name) ? 'An' : 'A'} ${DAY_ROOMS[room].name}`;
    if (at.f === 0) say(s, `${an} rises on top of the keep. By night its twin, the ${TWINS[room].name}, is the Tain's deepest room.`, 'good', true);
    else say(s, `${an} rises in the bare hall on floor ${G.n - at.f}. By night its twin, the ${TWINS[room].name}, is ${tainPlace(G, at.f, true)}.`, 'good', true);
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
    const m = mirrorIn(s, id); // its mirror hangs on in the bare hall
    if (m) hangMirror(s, m, `empty${k}`);
    s.res.stone = (s.res.stone || 0) + back;
    clearDamage(s, id);
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
    if ((a.type === 'gatehouse' && !atTheGate(G, b.f)) || (b.type === 'gatehouse' && !atTheGate(G, a.f))) return 'A Gatehouse stands at the gate, on the ground floor.';
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
    if (!(tainAwake(s) || (s.phase === 'dusk' && s.dusk.step === 'place'))) return 'Lanterns are for the night.';
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
    const cost = T.lanternCost ?? 1;
    if (s.res.candles + EPS < cost) return `A lantern takes ${cost === 1 ? 'a candle' : cost === 0.5 ? 'half a candle' : `${fmt(cost)} candles`}, and the store hasn't that.`;
    s.res.candles -= cost;
    const wax = T.lanternWax * (studied(s, 'tallow', 'wax') ?? 1);
    n.candles.push({ id: 'k' + s.nextId++, f: d.f, x: d.x, wax, max: wax, carrier: d.id, ...(cost !== 1 ? { paid: cost } : {}) });
    n.stats.candles++;
    say(s, `${d.name} takes up a lantern: its own light for ${fmt(T.lanternWax)} seconds, wherever it goes.`);
    cue(s, 'light', d.f, d.x);
    return undefined;
  },
  // Beginning one of the Library's studies (round six), for its remembrance. One at a time; the old rites
  // name the kind of shade they're for.
  study(s, { id, kind }) {
    const T = s.tuning;
    if (!T.library) return 'This keep has no Library.';
    if (s.phase !== 'day') return 'The Library works by day.';
    if (!roomsOf(geo(s), 'library').length) return 'Build a Library first.';
    const S = STUDIES[id];
    if (!S) return 'No such study.';
    const rank = nextRank(s, id);
    if (!rank) return `The Library has learned ${S.name} already.`;
    if (s.study) return `The Library is studying ${STUDIES[s.study.id].name}${s.study.rank === 2 ? ' II' : ''}.`;
    if (rank === 1 && id === 'rites' && !(WORKING.includes(kind) && Object.values(ACTS).some((a) => a.kind === kind))) return 'Choose the kind of shade the old rites are for.';
    const name = `${S.name}${rank === 2 ? ' II' : ''}`;
    const rem = studyRem(s, id, rank);
    if (s.res.remembrance + EPS < rem) return `Beginning ${name} takes ${rem} remembrance.`;
    s.res.remembrance -= rem;
    s.study = { id, lore: 0, ...(rank === 2 ? { rank } : {}), ...(id === 'rites' && rank === 1 ? { kind } : {}) };
    say(s, `The Library begins ${name}${id === 'rites' && rank === 1 ? `, for the ${KINDS[kind].name}` : ''}: ${studyLore(s, id, rank)} lore to go.`, 'good');
    return undefined;
  },
  // The Hall's decree for the season (round six): one, standing until the season ends.
  decree(s, { id }) {
    const T = s.tuning;
    if (!T.hall) return 'This keep has no Hall.';
    if (s.phase !== 'day') return 'Decrees are proclaimed by day.';
    if (!roomsOf(geo(s), 'hall').length) return 'Build a Hall first.';
    const D = DECREES[id];
    if (!D || !decreesOf(T).includes(id)) return 'No such decree.';
    if (s.decree?.season === s.season) return `${DECREES[s.decree.id].name} stands until the season ends.`;
    s.decree = { id, season: s.season };
    say(s, `${D.name} is proclaimed from the Hall, until the season ends: ${decreeDoes(s.tuning, D)}. The price: ${D.price}.`, 'good', true);
    cue(s, 'bell');
    return undefined;
  },
  // An answer to a visitor at the gate (round six).
  visitor(s, { id, answer }) {
    const v = (s.visitors || []).find((x) => x.id === id);
    if (!s.tuning.visitors && !(v && VISITORS[v.kind].by)) return 'No visitors come to this keep.';
    if (s.phase !== 'day') return 'Visitors come by day.';
    if (!v || !v.here) return 'No one is waiting at the gate.';
    if (v.done) return `${VISITORS[v.kind].name} has had an answer.`;
    const why = visitorBlock(s, v, answer);
    if (why) return why;
    answerVisitor(s, v, answer);
    return undefined;
  },
  // A shade's one act a night (round six), paid in its memory. Stand, Pass unseen and Lure last their
  // seconds; Kindle is done at once.
  shadeAct(s, { id }) {
    const T = s.tuning;
    if (!T.acts) return 'The dead have no acts in this keep.';
    if (!tainAwake(s)) return 'The dead act at night.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'That shade can do nothing tonight.';
    const what = actOf(d);
    if (!what) return `${d.name} has no act.`;
    if ((d.acted || 0) >= actsFor(s, d)) return actsFor(s, d) > 1 ? `${d.name} has acted twice tonight already.` : `${d.name} has acted once tonight already.`;
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
    d.acted = (d.acted || 0) + 1;
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
    if (!brought(s, 'deep')) return "The way down into the Deep opens with The Deep Rises, in the campaign's fourth year.";
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
    const next = { hand: 'pier', pier: 'great', ...(T.glassHalls ? { great: 'hall' } : {}) }[m.type];
    if (!next) return `The ${m.name} is as great as a glass can be.`;
    const qs = T.upgradeSilver[next];
    const gl = mirrorGlass(s, T.upgradeGlass[next]);
    if ((s.res.quicksilver || 0) + EPS < qs || s.res.glass + EPS < gl) return `Upgrading the ${m.name} takes ${qs} quicksilver and ${gl} glass.`;
    s.res.quicksilver -= qs;
    s.res.glass = Math.max(0, s.res.glass - gl);
    const was = m.name;
    m.type = next;
    m.name = `${was.split(' ')[0]} ${MIRRORS[next].name}`;
    s.today.upgraded = (s.today.upgraded || 0) + 1; // for a campaign's goal (round seven, phase 15)
    say(s, `The ${was} is silvered anew as the ${m.name}: room for ${MIRRORS[next].cap}.`, 'good');
    cue(s, 'mirror');
  },
  build(s, { mirror, room }) {
    const M = MIRRORS[mirror];
    if (!M || !mirrorsOf(s.tuning).includes(mirror)) return 'No such mirror.';
    if (embargoed(s)) return "Under the Church's embargo there's no silver to be had for a mirror.";
    const glass = mirrorGlass(s, M.glass);
    if (s.res.glass + EPS < glass) return `A ${M.name} needs ${glass} glass.`;
    // Round seven, phase 13 (mirrorRooms): it hangs in a room with no mirror, the one asked for or the hang spot.
    const at = s.tuning.mirrorRooms ? room ?? hangSpot(s) : null;
    if (s.tuning.mirrorRooms) {
      if (!at) return 'Every room has its mirror: there is nowhere to hang another.';
      if (!geo(s).rooms[at]) return 'There is no such room.';
      if (mirrorIn(s, at)) return `The ${mirrorIn(s, at).name} hangs there already.`;
    }
    s.res.glass = Math.max(0, s.res.glass - glass);
    const m = addMirror(s, mirror, nextPlace(s));
    if (at) hangMirror(s, m, at);
    say(s, `The ${m.name} is finished: room for ${M.cap} more ${M.cap === 1 ? 'shade' : 'shades'}.${at ? ` By night it opens on the ${TWINS[typeOf(geo(s), at)]?.name || 'bare hall'}, ${tainPlace(geo(s), geo(s).rooms[at].f, true)}.` : ''}`, 'good');
    cue(s, 'mirror');
  },
  // Round seven, phase 13 (mirrorRooms): hang a mirror in another room, by day, its shades and all. Into a room
  // that has a mirror, the two change places.
  hang(s, { id, room }) {
    if (!s.tuning.mirrorRooms) return 'Mirrors hang where they hang.';
    if (s.phase !== 'day') return 'Mirrors are moved by day.';
    const m = byId(s.mirrors, id);
    if (!m) return 'No such mirror.';
    const G = geo(s);
    if (!G.rooms[room]) return 'There is no such room.';
    if (hangsIn(s, m) === room) return `The ${m.name} hangs there already.`;
    const was = hangsIn(s, m);
    const other = mirrorIn(s, room);
    const before = m.name;
    hangMirror(s, m, room);
    if (other) {
      if (was) hangMirror(s, other, was);
      else other.room = null;
    }
    const twin = `by night it opens on the ${TWINS[typeOf(G, room)]?.name || 'bare hall'}, ${tainPlace(G, G.rooms[room].f, true)}`;
    say(s, `The ${before} is hung in the ${DAY_ROOMS[typeOf(G, room)].name}: ${twin}.${other ? ` The ${MIRRORS[other.type].name} that hung there goes where it was${was ? `, as the ${other.name}` : ''}.` : ''}`);
    cue(s, 'mirror');
  },
  // Round seven, phase 13 (mirrorRooms): turn a mirror to the wall, by day or at dusk, or back. Turned, it is no
  // door, and nobody whispers or steps through it; its shades sit out every day and night until it's turned
  // back, and nobody new wakes in it.
  turn(s, { id, on }) {
    if (!s.tuning.mirrorRooms) return 'Mirrors are not turned in this keep.';
    if (s.phase !== 'day' && s.phase !== 'dusk') return 'Mirrors are turned by day or at dusk.';
    const m = byId(s.mirrors, id);
    if (!m) return 'No such mirror.';
    const ds = s.shades.filter((d) => d.mirror === m.id);
    if (!on) {
      if (!m.turned) return `The ${m.name} faces the room.`;
      m.turned = false;
      for (const d of ds) d.turned = false;
      say(s, `The ${m.name} is turned back to face the room.${ds.length ? ` ${listNames(ds.map((d) => d.name))} ${ds.length === 1 ? 'is' : 'are'} back.` : ''}`);
      cue(s, 'mirror');
      return undefined;
    }
    if (m.turned) return `The ${m.name} is already turned to the wall.`;
    m.turned = true;
    for (const d of ds) {
      d.turned = true;
      if (d.byDay) d.byDay = null;
    }
    say(s, `The ${m.name} is turned to the wall: nothing comes through it.${ds.length ? ` ${listNames(ds.map((d) => d.name))} sit${ds.length === 1 ? 's' : ''} out until it's turned back.` : ''}`);
    cue(s, 'post');
    return undefined;
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
    // They'll remember: the rest of the season's raids come harder, or, if this was its last, the next season's.
    const later = raidsAhead(s) || !s.tuning.emboldenCarries;
    if (later) s.embolden = (s.embolden || 1) * s.tuning.raidEmbolden;
    else s.grudge = (s.grudge || 1) * s.tuning.raidEmbolden;
    s.today.raid = { strength: r.strength, defense: r1(defense(s)), held: false, paid: true };
    s.events = s.events.filter((e) => e.type !== 'raidHit');
    say(s, `You pay the Host ${food} food and ${candles} candles, and they turn back. They'll remember: ${later ? "the season's raids after this one come harder" : "next season's raids come harder"}.`, 'bad', true);
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
    r.host = Math.max(0, r.host - pitchOf(s));
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
  // Round seven, phase 12: by day masons mend a room a Maw broke or a fire burned out, for mendStone stone,
  // or the gate, raidShore of it for raidShoreCost, as they shore it while the Host is at it.
  mend(s, { id }) {
    const T = s.tuning;
    if (!T.repairs) return 'Nothing is mended in these rules.';
    if (!repairing(s)) return 'In its first year the keep puts right what breaks without masons.';
    if (s.phase !== 'day') return 'Masons mend by day.';
    if (id === 'gate') {
      if (s.raid?.state === 'assault') return 'The Host is at the gate: shore it.';
      if ((s.gate ?? 1) >= 1 - EPS) return 'The gate is whole.';
      if ((s.res.stone || 0) + EPS < T.raidShoreCost) return `Mending the gate takes ${fmt(T.raidShoreCost)} stone.`;
      s.res.stone -= T.raidShoreCost;
      s.gate = Math.min(1, (s.gate ?? 1) + T.raidShore);
      say(s, `Masons mend the gate: it's ${Math.round(100 * s.gate)}% whole.`, 'good');
      cue(s, 'build');
      return undefined;
    }
    const r = geo(s).rooms[id];
    if (!r) return 'No such room.';
    const broken = !!s.haunted?.includes(id);
    const burnt = !!s.scorched?.includes(id);
    if (!broken && !burnt) return `The ${DAY_ROOMS[r.type].name} needs no mending.`;
    if (s.fires.some((f) => f.room === id)) return 'Not while it burns.';
    if ((s.res.stone || 0) + EPS < T.mendStone) return `Mending a room takes ${fmt(T.mendStone)} stone.`;
    s.res.stone -= T.mendStone;
    clearDamage(s, id);
    say(s, `Masons mend the ${DAY_ROOMS[r.type].name}: ${broken ? 'the haunting lifts' : 'it can be worked again'}.`, 'good');
    cue(s, 'build');
    return undefined;
  },
  raidBell(s) {
    const r = s.raid;
    if (s.phase !== 'day' || r?.state !== 'assault') return 'The bell calls everyone to the walls only while the Host is at the gate.';
    const hands = s.living.filter((p) => !isGuard(p) && !p.fighting && !p.walls && !(p.sick > 0) && p.age !== 'child');
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
    const guards = s.living.filter((p) => isGuard(p) && !(p.sick > 0));
    if (!guards.length) return 'There are no guards to send after them.';
    r.pursued = true;
    const share = pursueShare(s);
    const back = Object.fromEntries(Object.entries(r.loot).map(([k, v]) => [k, Math.floor(v * share)]));
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
    const guards = s.living.filter((p) => isGuard(p) && !(p.sick > 0));
    if (!guards.length) return 'There are no guards to send out.';
    const T = s.tuning;
    const won = chance(s, sallyOdds(s));
    const fallen = guards.filter(() => chance(s, T.raidPursueRisk));
    s.today.sallies = [...(s.today.sallies || []), won ? 1 : 0];
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
    if (!(tainAwake(s) || (s.phase === 'dusk' && s.dusk.step === 'place'))) return 'Candles are set at dusk, once the dead have woken, or during the night.';
    if (!onFloor(s, f, x)) return 'That is not a place in the Tain.';
    if (!roomAt(geo(s), f, x)) return 'That is inside a wall.';
    if (s.res.candles < 1) return 'No candles left. The Chandlery makes them by day.';
    lightCandle(s, f, x);
  },
  // Round seven, phase 9: a wisp, essence burned as a pale light where a candle would go, for about a tide
  // (wispSecs), once the store is out of candles: a way back for a keep whose candles ran out before its essence
  // did. It's light like any candle's: gnawed, eaten and smashed as one, and nothing comes back of it.
  wisp(s, { f, x }) {
    const T = s.tuning;
    if (!T.wisp) return 'There are no wisps in these rules.';
    if (!tainAwake(s)) return 'A wisp is lit in the night.';
    if (!onFloor(s, f, x)) return 'That is not a place in the Tain.';
    if (!roomAt(geo(s), f, x)) return 'That is inside a wall.';
    if (s.res.candles >= 1) return 'A wisp is for when the store is out of candles. Set a candle.';
    if (s.res.essence + EPS < T.wispCost) return `A wisp takes ${T.wispCost} essence.`;
    s.res.essence -= T.wispCost;
    s.night.candles.push({ id: 'k' + s.nextId++, f, x, wax: T.wispSecs, max: T.wispSecs, wisp: true });
    s.night.stats.wisps = (s.night.stats.wisps || 0) + 1;
    cue(s, 'light', f, x);
  },
  // Round seven, phase 7: at dusk, the shades back at the posts the last night began with, and its candles lit
  // again where they stood, as far as the store goes. Wards aren't set again: they cost essence, and each night's
  // tides are its own.
  asLastNight(s) {
    if (!(s.phase === 'dusk' && s.dusk.step === 'place')) return 'As last night is for dusk, once the dead have woken.';
    const was = s.lastDusk;
    if (!was) return 'There is no last night to go by yet.';
    const G = geo(s);
    let moved = 0;
    for (const [id, f, x] of was.posts) {
      const d = byId(s.shades, id);
      if (!d || !canWork(d) || !onFloor(s, f, x) || !roomAt(G, f, x) || (d.post.f === f && d.post.x === x)) continue;
      Object.assign(d, { post: { f, x }, f, x, ox: x, of: f, path: [], climb: 0 });
      moved++;
    }
    let lit = 0;
    let short = 0;
    for (const [f, x] of was.candles) {
      if (!onFloor(s, f, x) || !roomAt(G, f, x) || s.night.candles.some((c) => c.f === f && Math.abs(c.x - x) <= 3)) continue;
      if (s.res.candles < 1) short++;
      else {
        lightCandle(s, f, x);
        lit++;
      }
    }
    if (!moved && !lit && !short) return 'Everyone and every candle is already as they were last night.';
    const unposted = s.shades.filter((d) => canWork(d) && !was.posts.some(([id]) => id === d.id));
    say(s, `As last night: ${moved === 1 ? 'one shade' : `${moved} shades`} back at their posts, ${lit === 1 ? 'one candle' : `${lit} candles`} lit${short ? `, and ${short === 1 ? 'one' : short} more wanted, but the store is out` : ''}.${unposted.length ? ` ${listNames(unposted.map((d) => d.name))} ${unposted.length === 1 ? 'has' : 'have'} no post from last night.` : ''}`, short ? 'bad' : '');
    cue(s, 'post');
  },
  move(s, { id, f, x }) {
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!canWork(d)) return `${d.name} can't be posted.`;
    if (!onFloor(s, f, x) || !roomAt(geo(s), f, x)) return 'That is not a place in the Tain.';
    if (!tainAwake(s) && (s.phase === 'dusk' || s.phase === 'dawn' || s.phase === 'day')) {
      Object.assign(d, { post: { f, x }, f, x, ox: x, of: f, path: [], climb: 0 });
      cue(s, 'post', f, x);
      return undefined;
    }
    if (!tainAwake(s)) return 'Not now.';
    if (d.grabbedBy) return `${d.name} is held. Light the spot to free it.`;
    if (d.climb) return `${d.name} is on the stairs.`;
    const r = route(geo(s), lightMap(geo(s), s.tuning, s.night.candles), d, [{ f, x }]);
    if (!r) return 'No way there.';
    d.path = r.path;
    d.post = { f, x };
    cue(s, 'post', f, x);
  },
  ward(s, { target }) {
    if (!tainAwake(s) && s.phase !== 'dusk') return 'Wards are set at dusk or during the night.';
    if (eclipsing(s) && (target === 'moat' || target === 'undergate')) return 'In the eclipse the Unlit come up the rifts only.';
    if (target === 'moat' && !raining(s)) return "The moat's twin is still tonight: nothing will come up it.";
    if (target === 'undergate' && !undergateOpen(s)) return 'Nothing comes up the Undergate yet.';
    if (!geo(s).stairs.some((x) => x.id === target) && !MAP.rifts.some((x) => x.id === target) && target !== 'moat' && target !== 'undergate') return 'Wards seal a stair, a rift, the moat or the Undergate.';
    if (s.night.wards.includes(target)) return 'Already warded tonight.';
    const cost = wardCost(s);
    if (s.res.essence + EPS < cost) return `A ward costs ${fmt(cost)} essence.`;
    s.res.essence -= cost;
    s.night.wards.push(target);
    (s.night.wardPaid ||= {})[target] = cost;
    if (geo(s).stairs.some((x) => x.id === target)) s.night.wardHold[target] = wardHoldOf(s);
    s.night.stats.wards++;
    for (const c of s.night.foes) c.replan = 0;
    cue(s, 'ward');
  },
  // Round seven, phase 12: a standing ward, set by day, seals a stair, a rift, the moat or the Undergate every
  // night left in the season, paid for at once.
  standWard(s, { target }) {
    const T = s.tuning;
    if (!T.standingWard) return 'There are no standing wards in these rules.';
    if (s.phase !== 'day') return 'A standing ward is set by day.';
    if (target === 'undergate' && !undergateOpen(s)) return 'Nothing comes up the Undergate yet.';
    if (!geo(s).stairs.some((x) => x.id === target) && !MAP.rifts.some((x) => x.id === target) && target !== 'moat' && target !== 'undergate') return 'Wards seal a stair, a rift, the moat or the Undergate.';
    if (standingOf(s).includes(target)) return 'That stands warded until the season ends.';
    const cost = standingCost(s);
    if (s.res.essence + EPS < cost) return `A standing ward takes ${fmt(cost)} essence.`;
    s.res.essence -= cost;
    s.standing = [...standingOf(s), target];
    const n = nightsLeft(s);
    say(s, `A standing ward on ${wardPlace(s, target)}, for ${fmt(cost)} essence: it holds ${n === 1 ? 'tonight' : `every night left this season, ${n} of them`}.`, 'good');
    cue(s, 'ward');
    return undefined;
  },
  // Round seven, phase 12: a standing ward on the Veil, set by day: it holds one crack more until the season ends,
  // and each more this season costs as much again as the one before.
  wardVeil(s) {
    const T = s.tuning;
    if (!T.veilWard) return 'There is no ward on the Veil in these rules.';
    if (s.phase !== 'day') return 'The Veil is warded by day.';
    const cost = veilWardCost(s);
    if (s.res.essence + EPS < cost) return `Warding the Veil takes ${fmt(cost)} essence.`;
    s.res.essence -= cost;
    s.veilHeld = (s.veilHeld || 0) + 1;
    say(s, `The Veil is warded: until the season ends it breaks at ${cracksOf(s)} cracks, not ${cracksOf(s) - 1}.`, 'good');
    cue(s, 'ward');
    return undefined;
  },
  // A rite in the Chapel against the year's trouble, once a season: until the season ends it does half what it would.
  easeTrouble(s) {
    const T = s.tuning;
    const id = troubleOf(s);
    if (!T.troubleRite) return 'There is no rite against a trouble in these rules.';
    if (!id) return 'No trouble weighs on this year.';
    if (s.phase !== 'day') return 'The rite is held by day.';
    if (!roomsOf(geo(s), 'chapel').length) return 'The rite is held in a Chapel.';
    if (eased(s)) return 'The rite has been held this season.';
    if (s.res.remembrance + EPS < T.troubleRite) return `The rite takes ${fmt(T.troubleRite)} remembrance.`;
    s.res.remembrance -= T.troubleRite;
    s.eased = s.season;
    say(s, `A rite in the Chapel against ${TROUBLES[id].name.charAt(0).toLowerCase()}${TROUBLES[id].name.slice(1)}: until the season ends it does half what it would.`, 'good');
    cue(s, 'vigil');
    return undefined;
  },
  // Round seven: a candle or a ward set at dusk can be taken back, whole, until the night begins: the candle
  // goes back to the store and the ward's essence to the keep. Once the night is under way, what's lit burns
  // and what's sealed holds.
  uncandle(s, { id }) {
    if (!(s.phase === 'dusk' && s.dusk.step === 'place')) return 'A candle can be taken back only at dusk, before the night begins.';
    const k = s.night.candles.find((c) => c.id === id);
    if (!k) return 'No such candle.';
    if (k.carrier) return 'That candle is a lantern: set it down first.';
    if (k.lamp) return "The Lamp Gallery's lamp isn't the store's to take back.";
    s.night.candles.splice(s.night.candles.indexOf(k), 1);
    s.res.candles += k.paid ?? 1; // a lantern set down gives back what it cost (phase 7: half a candle)
    s.night.stats.candles--;
    cue(s, 'snuff', k.f, k.x);
  },
  unward(s, { target }) {
    if (!(s.phase === 'dusk' && s.dusk.step === 'place')) return 'A ward can be taken back only at dusk, before the night begins.';
    if (!s.night.wards.includes(target)) return 'Nothing is warded there.';
    if (standingOf(s).includes(target)) return 'A standing ward holds until the season ends.';
    s.night.wards.splice(s.night.wards.indexOf(target), 1);
    s.res.essence += s.night.wardPaid?.[target] ?? wardCost(s);
    delete s.night.wardPaid?.[target];
    delete s.night.wardHold[target];
    s.night.stats.wards--;
    cue(s, 'snuff');
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
    if (!tainAwake(s)) return 'Hush is for the night.';
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
    if (s.opened) return "The Veil is open. This keep's story is over.";
    if (yearsEnd(s) && chapterOf(s)) return chapterOf(s) < 5 ? 'Choose how the chapter closes first.' : "Choose how the keep's story ends.";
    nextSeason(s);
  },
  // A campaign's chapter closes (years 1 to 4): a choice for the next year, then the next chapter begins.
  closeChapter(s, { id }) {
    const k = chapterOf(s);
    if (!yearsEnd(s) || !k || k >= 5) return 'A chapter closes at the end of its year.';
    const c = closeOf(s, k).find((x) => x.id === id);
    if (!c) return 'Not a choice for this chapter.';
    s.campaign.closed[k] = id;
    say(s, `${CHAPTERS[k].name} closes: ${low(c.name)}, ${c.text}.`, 'rite', true);
    if (c.gain) for (const [r, n] of Object.entries(c.gain)) gain(s, r, n);
    // A help that lasts the next year (the household's peace is at once).
    if (!c.gain && id !== 'kin') s.campaign.boons[id] = k + 1;
    if (id === 'tithe') s.dread = Math.max(0, s.dread - 2);
    nextSeason(s);
    if (id === 'kin') {
      for (const p of s.living) {
        p.grief = null;
        p.peace = 7 * dayTicks(s);
      }
    }
  },
  // The year's end: seal the Veil, and the keep's story ends with every shade free.
  sealVeil(s) {
    if (!yearsEnd(s)) return 'The Veil can be sealed only when a year ends.';
    if (chapterOf(s) && chapterOf(s) < 5) return 'In a campaign the Veil is sealed, or opened, only when its fifth year ends.';
    if (s.campaign && chapterOf(s) === 5) s.campaign.ending = 'seal';
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
  // Round three's cut ending, at a campaign's end: the Veil opened. The living and the dead share both realms,
  // and the keep's story ends there, every shade with the living.
  openVeil(s) {
    if (!yearsEnd(s) || chapterOf(s) !== 5) return 'The Veil can be opened only when a campaign ends.';
    const n = s.shades.length;
    for (const d of s.shades) endLedger(s, d.id, 'opened');
    s.opened = { season: s.season, year: yearOf(s), shades: n, living: s.living.length };
    s.campaign.ending = 'open';
    const e = lastSeason(s);
    if (e) e.opened = n;
    say(s, `The Veil is opened. ${n ? `${n === 1 ? 'The last shade walks' : `${n} shades walk`} out of the glass and into the keep,` : 'The glass is empty, but'} the living go down into the Tain, and the keep becomes a crossing between the two. The keep's story ends here.`, 'good', true);
    cue(s, 'blessed');
  },
  // The year's end: the keeper takes their own place in the glass, and a new keeper inherits the keep.
  takeGlass(s) {
    if (!yearsEnd(s)) return 'That is for the end of a year.';
    if (chapterOf(s) && chapterOf(s) < 5) return 'In a campaign that is for when its fifth year ends.';
    if (s.campaign && chapterOf(s) === 5) s.campaign.ending = 'watch';
    const T = s.tuning;
    nextSeason(s);
    const m = freeMirror(s) || addMirror(s, 'hand', nextPlace(s));
    hangAll(s); // a hand mirror made for the Keeper hangs where one would
    // Each keeper who takes the glass after the first is named in turn: The Keeper, then The Second Keeper.
    const before = s.ledger.filter((e) => e.from === 'keeper').length;
    const name = before ? `The ${KEEPER_ORDINALS[before] || `${before + 1}th`} Keeper` : 'The Keeper';
    const d = newShade(s, { id: 'p' + s.nextId++, name, kind: 'loyal', cause: 'duty', from: 'keeper', day: 0, memory: 100, named: true, was: 'stubborn' });
    d.mirror = m.id;
    d.keeper = true;
    s.shades.push(d);
    s.rite.choice[d.id] = 'keep';
    s.ledger.push({
      id: d.id, name: d.name, from: 'keeper', season: s.season, day: 0, cause: 'duty', how: 'kept the keep a whole year, and took their place in the glass', kind: 'loyal', guided: false, job: null,
      age: 'adult', bond: null, woke: 'loyal', end: null, endDay: null, nights: 0, kills: 0, posts: {}, named: true, memory: 100, was: 'stubborn',
    });
    say(s, `You take your own place in the ${m.name}, and a new keeper takes up the keep. ${name} is Loyal, named and Anchored, and weighs ${T.keeperDread} shades' Dread at every rite.`, 'rite', true);
    cue(s, 'wake');
  },
  tune(s, { key, value, build }) {
    // Today's keep is the same for everyone, so only a new version's own numbers change it.
    if (s.daily && !build) return "Today's keep plays by the rules everyone has, so its numbers are locked.";
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return 'Needs a number.';
    if (typeof s.tuning[key] !== 'number') return 'No such setting.';
    if (KINDS_OF_KEEP.includes(key)) return 'That is what kind of keep this is, chosen when it was made.';
    if ((key === 'daySecs' || key === 'nightSecs') && v < 10) return 'At least 10 seconds.';
    s.tuning[key] = v;
    if (key === 'mirrorRooms') {
      // Round seven, phase 13: a keep taking up mirrors in rooms hangs the ones it has; one giving it up turns
      // its turned mirrors back.
      if (v) hangAll(s);
      else {
        for (const m of s.mirrors) delete m.turned;
        for (const d of s.shades) delete d.turned;
      }
    }
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
const KINDS_OF_KEEP = ['tutorial', 'campaign'];
// A keep's own defaults: the build's numbers, with the ones it was made with (a difficulty preset, or the
// player's own from the keep before) standing in for them, so a newer build doesn't move those.
export const keepDefaults = (s) => ({ ...TUNING, ...(s.defaults || {}) });

// A save from an older build, brought up to this one: what it predates gets what it would have had. Saves
// from before seasons started from two rooms had the whole original keep.
const OLD_YEAR_RATES = { gentle: 1.15, hard: 1.2 };
const KEEPER_ORDINALS = ['', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
// The rules a keep from before them played without (round seven, phase 6), in the order they came: a keep whose
// numbers lack a rule's key predates it, and gets the value it played with, so its actions still replay. Any
// other key it lacks gets today's value (the end of upgrade()), so a key added to TUNING either goes here, with
// the value that plays as keeps before it did, or plays the same at its default: test/upgrade.test.js makes
// every new key take one side or the other.
export const RULES_SINCE = [
  { key: 'startFloors', old: FULL_KEEP.floors.length, since: '2026-09-26', what: 'seasons start from two rooms, not the whole keep' },
  { key: 'traits', old: 0, since: '2026-09-26', what: 'traits' },
  { key: 'goAround', old: 0, since: '2026-09-26', what: 'the Unlit go around lights' },
  { key: 'fire', old: 0, since: '2026-09-27', what: 'fire by day' },
  { key: 'dreamwell', old: 0, since: '2026-09-27', what: 'Quarters, the Dreamwell and the Weepers' },
  { key: 'whispers', old: 0, since: '2026-09-27', what: 'whispers and the great glass' },
  { key: 'year', old: 0, since: '2026-09-27', what: 'a full year and the Long Night' },
  { key: 'raidFight', old: 0, since: '2026-09-27', what: 'raids you fight' },
  { key: 'plague', old: 0, since: '2026-09-27', what: 'summer\'s plague' },
  { key: 'siege', old: 0, since: '2026-09-27', what: 'autumn\'s siege' },
  { key: 'requests', old: 0, since: '2026-09-27', what: 'the dead ask for things' },
  { key: 'weather', old: 0, since: '2026-09-27', what: 'rain and the Drowned' },
  { key: 'deep', old: 0, since: '2026-09-27', what: 'the Deep and quicksilver' },
  { key: 'generations', old: 0, since: '2026-09-27', what: 'generations' },
  { key: 'yearHardness', old: 0, since: '2026-09-27', what: 'each year harder than the last' },
  { key: 'church', old: 0, since: '2026-09-27', what: 'the Church\'s embargo and Inquisition' },
  { key: 'crusade', old: 0, since: '2026-09-27', what: 'the Church\'s crusade' },
  { key: 'acts', old: 0, since: '2026-09-27', what: 'shade acts' },
  { key: 'lanterns', old: 0, since: '2026-09-27', what: 'lanterns' },
  { key: 'errands', old: 0, since: '2026-09-27', what: 'echoes, relics and sleepwalkers' },
  { key: 'omens', old: 0, since: '2026-09-27', what: 'omens' },
  { key: 'ownStreams', old: 0, since: '2026-09-27', what: 'weather and events on their own random streams' },
  { key: 'visitors', old: 0, since: '2026-09-27', what: 'visitors at the gate' },
  { key: 'streamHash', old: 0, since: '2026-09-27', what: 'side streams hashed apart' },
  { key: 'library', old: 0, since: '2026-09-27', what: 'the Library' },
  { key: 'hall', old: 0, since: '2026-09-27', what: 'the Hall' },
  { key: 'gatehouse', old: 0, since: '2026-09-27', what: 'the Gatehouse and the ladders' },
  { key: 'eclipse', old: 0, since: '2026-09-28', what: 'the eclipse' },
  { key: 'wardDraw', old: 0, since: '2026-09-28', what: 'wards draw essence to hold the Hollow' },
  { key: 'essenceCap', old: 0, since: '2026-09-28', what: 'the essence store holds only so much' },
  { key: 'granaryGuards', old: 0, since: '2026-09-28', what: 'a breach halves the food only with a Granary (round seven, phase 1)' },
  { key: 'emboldenCarries', old: 0, since: '2026-09-28', what: 'a Host paid off at the season\'s last raid remembers it next season (phase 1)' },
  { key: 'visitFrom', old: 1, since: '2026-09-28', what: 'no visitors before day 3 (phase 4)' },
  { key: 'lateRoomsFrom', old: 1, since: '2026-09-28', what: 'the Library and the Hall from summer (phase 4)' },
  { key: 'thinStair', old: 0, since: '2026-09-29', what: 'a tide goes for the thinner stair (phase 7)' },
  { key: 'lanternCost', old: 1, since: '2026-09-29', what: 'a lantern takes half a candle (phase 7)' },
  { key: 'longNightCreepers', old: 1, since: '2026-09-29', what: 'the Long Night brings four in ten of a night\'s Creepers, now they climb past the Hollow\'s wards (phase 8)' },
  { key: 'greatTide', old: 0, since: '2026-09-29', what: 'the Long Night ends in a last great tide (phase 8)' },
  { key: 'hollowRewardYear', old: 0, since: '2026-09-29', what: 'driving the Hollow back is worth more each year (phase 8)' },
  { key: 'hollowPinned', old: 0, since: '2026-09-29', what: 'the Hollow held at a ward eats no light and drains no one (phase 8)' },
  { key: 'hollowWardOnly', old: 0, since: '2026-09-29', what: 'on the Hollow\'s nights a stair\'s ward holds only the Hollow (phase 8)' },
  { key: 'newMoonTides', old: 0, since: '2026-09-29', what: 'the new moon\'s Creepers come in one tide more (phase 8)' },
  { key: 'crackPerTide', old: 0, since: '2026-09-29', what: 'a mirror cracks once a tide, the rest spilling into nightmares (phase 9)' },
  { key: 'cracksMax', old: 5, since: '2026-09-29', what: 'three cracks break the Veil, now each is a tide (phase 9)' },
  { key: 'crackHeal', old: 1, since: '2026-09-29', what: 'the Veil mends no crack by day (phase 9)' },
  { key: 'wisp', old: 0, since: '2026-09-29', what: 'a wisp of essence where a candle would go, once the store is out (phase 9)' },
  { key: 'muster', old: 0, since: '2026-10-01', what: 'a guard counts in full only after time at the post (phase 10)' },
  { key: 'guardsGoOut', old: 0, since: '2026-10-01', what: 'a sally or a pursuit counts the guards who go out (phase 10)' },
  { key: 'forgeArms', old: 0, since: '2026-10-01', what: 'the Forge makes arms by day for the guards (phase 10)' },
  { key: 'coldForge', old: 0, since: '2026-10-01', what: 'a Forge nobody works can\'t catch fire (phase 10)' },
  { key: 'payInKind', old: 0, since: '2026-10-01', what: 'visitors who want food for wares take glass or remembrance too (phase 10)' },
  { key: 'churchLedger', old: 0, since: '2026-10-01', what: 'the Church judges the Dread of every day since it last looked (phase 10)' },
  { key: 'curfew', old: 1, since: '2026-10-02', what: 'the Hall offers no curfew (phase 11)' },
  { key: 'dreamRest', old: 0, since: '2026-10-02', what: 'the Dreamwell is a place to rest, not to dream (phase 11)' },
  { key: 'repairs', old: 0, since: '2026-10-04', what: 'what a Maw broke, a fire burned or a breach left of the gate stays until mended (phase 12)' },
  { key: 'bedsHold', old: 0, since: '2026-10-04', what: 'the keep holds as many living as it has beds, 12 at least (phase 12)' },
  { key: 'studyTiers', old: 1, since: '2026-10-04', what: 'a second rank of each study (phase 12)' },
  { key: 'standingWard', old: 0, since: '2026-10-04', what: 'standing wards, set by day for the season (phase 12)' },
  { key: 'glassHalls', old: 0, since: '2026-10-04', what: 'the great-glass hall (phase 12)' },
  { key: 'lampworks', old: 0, since: '2026-10-04', what: 'the Lampworks, from floor 8 up (phase 12)' },
  { key: 'troubles', old: 0, since: '2026-10-04', what: "each year from the second brings a trouble (phase 12)" },
  { key: 'highStone', old: 0, since: '2026-10-04', what: 'a room above the seventh floor costs more stone (phase 12)' },
  { key: 'veilWard', old: 0, since: '2026-10-04', what: 'a ward on the Veil for the season (phase 12)' },
  { key: 'troubleRite', old: 0, since: '2026-10-04', what: "a rite against the year's trouble (phase 12)" },
  { key: 'mirrorRooms', old: 0, since: '2026-10-04', what: 'mirrors hang in rooms (phase 13)' },
  { key: 'cruelty', old: 0, since: '2026-10-05', what: 'cruelty: four happenings with an answer that kills one of your own (phase 14)' },
  { key: 'moreOmens', old: 0, since: '2026-10-05', what: 'four more omens (phase 14)' },
  { key: 'yearVisitors', old: 0, since: '2026-10-05', what: "the years' visitors, one a year from the third to the tenth (phase 14)" },
  { key: 'chapterSystems', old: 0, since: '2026-10-06', what: "a campaign's visitors, rooms, the Deep, errands, omens and eclipse come with its chapters (phase 15)" },
  { key: 'chapterGoals', old: 0, since: '2026-10-06', what: "a campaign's goals that ask more than good play gives of itself (phase 15)" },
  { key: 'chapterCloses', old: 0, since: '2026-10-06', what: "a campaign's chapters close on two helps for the next year (phase 15)" },
];
export function upgrade(g) {
  g.keep ??= { floors: FULL_KEEP.floors.map((fl) => fl.map((r) => ({ ...r }))) };
  // A keep from before traits (say) played without them, and its numbers say so; loaded into this build, its
  // other numbers move to the build's. Everyone gets the trait their name would have drawn (below).
  for (const t of [g.tuning, g.tuning0]) if (t) for (const r of RULES_SINCE) if (!(r.key in t)) t[r.key] = r.old;
  g.visitors ??= [];
  g.learned ??= [];
  g.study ??= null;
  g.decree ??= null;
  g.court ??= false;
  g.eclipse ??= null;
  g.campaign ??= null;
  // A Gentle or Hard keep made while its years hardened ×1.15 or ×1.2 (Standard's ×1.3) grows as Standard's does
  // now (README, problem 43): kept, its old rate would harden it faster than a Standard keep, year after year.
  for (const [p, rate] of Object.entries(OLD_YEAR_RATES)) if (g.preset === p && g.defaults?.yearHardness === rate && !('yearHardness' in PRESETS[p].tuning)) delete g.defaults.yearHardness;
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
  g.ruined ??= [];
  g.badLuck ??= 0;
  g.fires ??= [];
  g.scorched ??= [];
  if (g.night) g.night.broken ??= [];
  return g;
}

// A lost campaign's chapter begun again (round six): the keep as it stood at the chapter's first dawn (the
// keep's first morning, for the first), rebuilt by replaying what was done before it. What the page keeps
// beside the game (its defaults and preset) comes along. Null if it can't be rebuilt: a keep begun on an older
// build may not replay.
export function chapterAgain(s) {
  if (!campaignOn(s) || !s.campaign || s.phase !== 'over' || s.campaign.ending) return null;
  const k = Math.min(5, yearOf(s));
  const i = k === 1 ? -1 : s.actions.findIndex((x) => x.a.type === 'closeChapter' && yearOfSeason(x.at.season) === k - 1);
  if (k > 1 && i < 0) return null;
  const before = k === 1 ? s.actions.filter((x) => x.at.season === 1 && x.at.day === 1 && x.at.phase === 'day' && x.at.t === 0) : s.actions.slice(0, i + 1);
  try {
    const g = replay(s.seed, s.tuning0, before);
    for (const key of ['defaults', 'preset']) if (s[key] !== undefined) g[key] = s[key];
    g.campaign.again = (s.campaign.again || 0) + 1;
    return g;
  } catch {
    return null;
  }
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
