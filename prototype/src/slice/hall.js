// The Hall of Keepers (round seven, phase 16): every keep the player has played, kept when its slot is reused.
// Each keeps its Book of the Dead, how it ended, a few numbers from each season and its last recap card. The
// Hall also holds the deeds done across all of them, and gives the next keep its first dead, from the last keep
// finished or left. It's pure apart from a store { get, set → bool, remove }, as saves.js is.

import { epitaph, ordinal } from './book.js';
import { recapOf, seasonTitle } from './recap.js';
import { dayText } from './daily.js';
import { WORKING, SEASONS } from './data.js';
import { KEY } from './keys.js';

export const HALL_KEY = `${KEY}/hall/v1`;
export const MAX_KEEPS = 40; // the oldest keep no slot holds goes first
export const MAX_BOOK = 160; // a longer Book keeps the dead it remembers best
const ENDED = ['fell', 'sealed', 'opened', 'left'];

// One keep, whichever slot it's in: today's keep by its date, any other by its seed.
export const keepId = (s) => (s.daily ? `daily:${s.daily}` : `seed:${s.seed >>> 0}`);
// The same for a slot's line in the index (saves.js summary).
export const slotKeepId = (m) => (m ? (m.daily ? `daily:${m.daily}` : m.seed !== undefined ? `seed:${m.seed >>> 0}` : null) : null);

export function openHall(store) {
  const h = store.get(HALL_KEY);
  if (h && h.v === 1 && Array.isArray(h.keeps)) return { v: 1, count: h.count || h.keeps.length, keeps: h.keeps, deeds: h.deeds || {} };
  return { v: 1, count: 0, keeps: [], deeds: {} };
}

// Writes the Hall. If the browser won't hold it, the oldest cards' images go first, then the oldest keeps no
// slot holds, until it fits. False if even an empty Hall won't.
export function saveHall(store, hall, held = []) {
  if (store.set(HALL_KEY, hall)) return true;
  const byAge = () => [...hall.keeps].sort((a, b) => a.last - b.last);
  for (const k of byAge()) {
    if (!k.card?.img) continue;
    delete k.card.img;
    if (store.set(HALL_KEY, hall)) return true;
  }
  for (const k of byAge()) {
    if (held.includes(k.id)) continue;
    hall.keeps = hall.keeps.filter((x) => x !== k);
    if (store.set(HALL_KEY, hall)) return true;
  }
  return false;
}
// Frees room for the keeps themselves: the Hall gives up its card images. True if it gave anything up.
export function shrinkHall(store, hall) {
  let n = 0;
  for (const k of hall.keeps) if (k.card?.img) {
    delete k.card.img;
    n++;
  }
  if (n) store.set(HALL_KEY, hall);
  return n > 0;
}

// What a keep is called in the Hall and in the stories of the dead it hands on.
export function keepLabel(k) {
  if (k.daily) return `the keep of ${dayText(k.daily)}`;
  if (k.tutorial) return 'the tutorial keep';
  return `your ${ordinal(k.n)} keep`;
}

// How a keep stands: fell, sealed, opened, left (its slot reused) or kept (still played).
function statusOf(s, left) {
  if (s.opened) return 'opened';
  if (s.sealed) return 'sealed';
  if (s.phase === 'over') return 'fell';
  return left ? 'left' : 'kept';
}

const score = (e) => 2 * (e.kills || 0) + (e.nights || 0) + (e.named ? 1 : 0);
// The Book as the Hall keeps it: each entry as the ledger has it, but the longest Books keep only the dead they
// remember best (and everyone from before), in the order they died.
function bookOf(s) {
  const book = s.ledger.map(({ memory, guided, ...e }) => e);
  if (book.length <= MAX_BOOK) return book;
  const keep = new Set([...book].sort((a, b) => (b.from === 'before') - (a.from === 'before') || score(b) - score(a)).slice(0, MAX_BOOK));
  return book.filter((e) => keep.has(e));
}
// Whether there's anything to remember: a season played out, or someone dead since the keep began.
export const worthKeeping = (s) => !s.test && (s.seasons.length > 0 || s.ledger.some((e) => e.season > 0));

// The keep written into the Hall, or brought up to date: when a season ends, when the keep ends, and when its
// slot is given to another (left). Returns its entry, and the deeds it did for the first time.
export function noteKeep(hall, s, now, { left = false } = {}) {
  if (!worthKeeping(s)) return { entry: null, deeds: [] };
  const id = keepId(s);
  let k = hall.keeps.find((x) => x.id === id);
  if (!k) {
    hall.count = (hall.count || 0) + 1;
    k = { id, n: hall.count, first: now };
    hall.keeps.push(k);
  }
  const seasons = new Map((k.seasons || []).map((x) => [x.season, x]));
  for (const e of s.seasons) {
    seasons.set(e.season, { season: e.season, title: seasonTitle(s.tuning, e.season), stood: !e.lost, day: e.day, deaths: e.summary?.deaths || 0, shades: e.summary?.shades || 0 });
  }
  const r = recapOf(s);
  Object.assign(k, {
    last: now,
    seed: s.seed >>> 0,
    daily: s.daily || null,
    tutorial: !!s.tuning.tutorial,
    campaign: !!s.tuning.campaign,
    traits: !!s.tuning.traits,
    preset: s.preset || null,
    status: statusOf(s, left),
    where: seasonTitle(s.tuning, s.season),
    years: s.tuning.year ? Math.floor((s.season - 1) / SEASONS.length) + 1 : 0,
    ending: s.campaign?.ending || null,
    seasons: [...seasons.values()].sort((a, b) => a.season - b.season),
    book: bookOf(s),
    heirs: (Array.isArray(s.tuning.firstDead) ? s.tuning.firstDead : []).map((x) => x?.name).filter(Boolean),
    card: r ? { season: r.season, title: r.title, head: r.head, sub: r.sub, stood: r.stood, stats: r.stats, remembered: r.remembered, img: k.card?.season === r.season ? k.card.img : undefined } : k.card || null,
  });
  // A keep played again on the same date, or a file loaded back in, is the same keep: it's only ever kept once.
  if (hall.keeps.length > MAX_KEEPS) {
    const old = hall.keeps.filter((x) => x !== k && ENDED.includes(x.status)).sort((a, b) => a.last - b.last)[0];
    if (old) hall.keeps = hall.keeps.filter((x) => x !== old);
  }
  const deeds = [];
  for (const D of DEEDS) {
    if (hall.deeds[D.id] || !D.test(s, hall)) continue;
    hall.deeds[D.id] = { at: now, keep: k.n, label: keepLabel(k) };
    deeds.push(D);
  }
  return { entry: k, deeds };
}
// Marks a keep left when its slot goes to another, writing it in first if it isn't yet.
export const leaveKeep = (hall, s, now) => noteKeep(hall, s, now, { left: true });

// The last keep finished or left, most recent first: the one whose dead go on into the next keep. Keeps still
// in a slot (held) are still being played, and their dead are still theirs.
export function lastKeep(hall, held = []) {
  return [...hall.keeps].filter((k) => !held.includes(k.id) && (ENDED.includes(k.status) || k.status === 'kept')).sort((a, b) => b.last - a.last)[0] || null;
}
// What a shade in the Book is: the kind it woke, or was bound as after waking Restless.
const kindOf = (e) => e.bound?.kind || e.woke;
// The first dead a new keep takes from a keep in the Hall (TUNING.firstDead): up to two still in its glass when
// it ended, a Keeper who took their place there first, the Pale last, and otherwise those who served most. A
// sealed or opened keep's dead went free, so none come.
export function heirsOf(k, max = 2) {
  if (!k || k.status === 'sealed' || k.status === 'opened') return [];
  const label = keepLabel(k);
  return (k.book || [])
    .filter((e) => !e.end && !e.turned && e.from !== 'raider' && WORKING.includes(kindOf(e)))
    .sort((a, b) => (b.from === 'keeper' || !!b.keeper) - (a.from === 'keeper' || !!a.keeper) || (kindOf(a) === 'pale') - (kindOf(b) === 'pale') || score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((e) => ({
      name: e.name, age: e.age, job: e.job, kind: kindOf(e), cause: e.cause, how: e.how, named: !!e.named, was: e.was || null, keep: label,
      story: epitaph(e, { traits: !!k.traits }).replace(/ Still in the glass\.$/, ''), keeper: e.from === 'keeper' || !!e.keeper,
    }));
}

// One season against the same season of the player's last keep (today's keep against the last day's keep before
// it): fewer or more deaths if both stood, else days held. null if there's nothing to set it against.
export function againstOf(hall, s, season = s.seasons[s.seasons.length - 1]?.season) {
  const now = s.seasons.find((e) => e.season === season);
  if (!now) return null;
  const id = keepId(s);
  const mine = hall.keeps.find((k) => k.id === id);
  const then = hall.keeps
    .filter((k) => k.id !== id && !!k.daily === !!s.daily && !k.tutorial && (!mine || k.first < mine.first) && k.seasons?.some((x) => x.season === season))
    .sort((a, b) => b.first - a.first)[0];
  if (!then) return null;
  const t = then.seasons.find((x) => x.season === season);
  const n = { stood: !now.lost, day: now.day, deaths: now.summary?.deaths || 0 };
  const label = then.daily ? `Than ${dayText(then.daily)}` : 'Than my last keep';
  const page = keepLabel(then);
  const many = (k, one, more) => `${k} ${k === 1 ? one : more}`;
  if (n.stood && t.stood) {
    const d = t.deaths - n.deaths;
    return { label, page, value: d > 0 ? `${many(d, 'death', 'deaths')} fewer` : d < 0 ? `${many(-d, 'death', 'deaths')} more` : 'as many deaths', then: t };
  }
  const d = n.day - t.day;
  return { label, page, value: d > 0 ? `${many(d, 'day', 'days')} more` : d < 0 ? `${many(-d, 'day', 'days')} fewer` : 'as many days', then: t };
}

// Today's keep, as the player has played it: one line a date, newest first.
export function dailyHistory(hall) {
  return hall.keeps
    .filter((k) => k.daily)
    .sort((a, b) => (a.daily < b.daily ? 1 : -1))
    .map((k) => {
      const seasons = k.seasons || [];
      const fell = seasons.find((x) => !x.stood);
      const deaths = seasons.reduce((a, x) => a + x.deaths, 0);
      return { key: k.daily, date: dayText(k.daily), seasons: seasons.length, fell: fell ? fell.title : null, deaths, status: k.status };
    });
}

// The deeds: a short list, each done once, in whichever keep does it first.
const days = (s) => [...s.days, s.today];
export const DEEDS = [
  { id: 'year', name: 'Through the Long Night', text: 'Hold a keep through its first whole year.', test: (s) => !!s.tuning.year && s.seasons.some((e) => !e.lost && e.season >= SEASONS.length) },
  { id: 'spotless', name: 'Not one lost', text: 'Hold a season in which no one dies.', test: (s) => s.seasons.some((e) => !e.lost && e.summary?.deaths === 0) },
  { id: 'sally', name: 'Out of the gate', text: 'Break a raid with a sally.', test: (s) => days(s).some((d) => d.sallies?.includes(1)) },
  { id: 'silver', name: 'Quicksilver', text: 'Raise a mirror with quicksilver from the Deep.', test: (s) => days(s).some((d) => d.upgraded) },
  { id: 'glass', name: 'Your place in the glass', text: 'Take your own place in the glass at a year’s end.', test: (s) => s.ledger.some((e) => e.from === 'keeper') },
  { id: 'heirs', name: 'The dead go on', text: 'Begin a keep with your last keep’s dead in its glass.', test: (s) => Array.isArray(s.tuning.firstDead) && s.tuning.firstDead.length > 0 },
  { id: 'sealed', name: 'The Veil sealed', text: 'Seal the Veil, and set the dead free.', test: (s) => !!s.sealed },
  { id: 'opened', name: 'The Veil opened', text: 'Open the Veil at the end of a campaign.', test: (s) => !!s.opened },
  { id: 'campaign', name: 'Five years told', text: 'See a campaign to its ending.', test: (s) => !!s.campaign?.ending },
  { id: 'mornings', name: 'Three mornings', text: 'Play today’s keep on three different days.', test: (s, hall) => hall.keeps.filter((k) => k.daily).length >= 3 },
  { id: 'decade', name: 'Ten winters', text: 'Hold one keep for ten years.', test: (s) => !!s.tuning.year && s.seasons.some((e) => !e.lost && e.season >= 10 * SEASONS.length) },
];
