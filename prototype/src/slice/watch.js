// The replay viewer's model (round six's playtest kit): a playtest export played back from its seed and
// actions, on a timeline the page can play and scrub. The sim already replays exactly; this paces it. Pure:
// the page draws the keep it holds.
//
// The timeline counts ticks of the running clock, day and night. A phase that waits on the player (dusk, the
// rite, a season's end) takes WAIT units before its first choice and CHOICE before each one after, so the
// choices made there are seen one at a time. Page events from the export's trail (pauses, panels, idle
// stretches, lessons) are placed on the same timeline by where in the game they happened.

import { newSeason, step, act } from './sim.js';
import { exportTuning0, isExport, isSave, replays, CANT_REPLAY, saneExport, BAD_FILE } from './saves.js';
import { momentOf } from './alerts.js';

export const WAIT = 20;
export const CHOICE = 10;
const RUN = { day: true, night: true };
const ORDER = { day: 0, dusk: 1, night: 2, dawn: 3, end: 4, over: 5 };
const posOf = (s) => ({ season: s.season, day: s.day, phase: s.phase, t: s.t });
const same = (s, at) => s.season === at.season && s.day === at.day && s.phase === at.phase && s.t === at.t;
// Where the keep is against a moment of the game: negative before it, 0 at it, positive after. A moment
// without a time (an older export's end) counts as the whole of its phase.
function cmp(s, at) {
  const d = s.season - at.season || s.day - at.day || ORDER[s.phase] - ORDER[at.phase];
  return d || (at.t == null ? 0 : s.t - at.t);
}
// The end of the session: where the export says the tester stopped (the whole of that phase, if it doesn't
// say when in it), or else the first phase after the last action that waits on the player.
function finished(c, x) {
  const n = x.now;
  if (!n) return !RUN[c.s.phase];
  const d = cmp(c.s, n);
  return n.t == null && RUN[n.phase] ? d > 0 : d >= 0;
}

// A playtest export from a file's text (or the object already parsed), or an error to show.
export function readExport(text) {
  let x = text;
  if (typeof text === 'string') {
    try {
      x = JSON.parse(text);
    } catch {
      return { error: "That isn't a playtest export: it isn't JSON." };
    }
  }
  if (!isExport(x)) return { error: isSave(x) ? "That's a saved keep, not a playtest export: load it into a slot in Saves to play it. An export comes from the Playtest tab in Records, or a tester's Send button." : "That isn't a playtest export." };
  if (!saneExport(x)) return { error: BAD_FILE };
  if (!replays(x)) return { error: CANT_REPLAY };
  return { x };
}

// The start of the export's session: its keep on day 1, nothing done yet.
export function cursorOf(x) {
  const s = newSeason(x.seed >>> 0, exportTuning0(x));
  return { s, i: 0, u: 0, wait: RUN[s.phase] ? 0 : WAIT, done: false, off: null };
}
// A copy of a cursor, to play on from without touching the one it came from.
export const cloneCursor = (c) => structuredClone(c);

// Moves the cursor on by up to `budget` timeline units, doing each of the tester's actions when its moment
// comes. Returns what happened on the way: the units used, the actions done, and the alerts the keep raised
// (each with the unit it came at). With once, it stops after the first action, so the page can dwell on it.
// A cursor is done at the end of the session, or where the keep stops matching it (c.off says why: a newer
// build's rules, most likely).
export function advance(c, x, budget, once = false) {
  const out = { used: 0, acts: [], alerts: [] };
  const acts = x.actions;
  const take = () => {
    for (const a of c.s.alerts.splice(0)) out.alerts.push({ ...a, u: c.u, at: posOf(c.s) });
  };
  while (!c.done) {
    const a = acts[c.i];
    if (a && same(c.s, a.at)) {
      if (c.wait > 0) {
        const k = Math.min(c.wait, budget - out.used);
        c.wait -= k;
        c.u += k;
        out.used += k;
        if (c.wait > 0) break;
      }
      const ph = c.s.phase;
      const r = act(c.s, a.a);
      if (!r.ok) {
        c.off = { at: a.at, why: r.error, type: a.a.type };
        c.done = true;
        break;
      }
      c.i++;
      c.wait = RUN[c.s.phase] ? 0 : c.s.phase !== ph ? WAIT : CHOICE;
      take();
      out.acts.push({ a: a.a, u: c.u });
      if (once) break;
      continue;
    }
    if (a && cmp(c.s, a.at) > 0) {
      c.off = { at: a.at, why: 'The keep went past the moment of the next action.', type: a.a.type };
      c.done = true;
      break;
    }
    if (!a && finished(c, x)) {
      // The end of the session: a waiting phase still shows for its dwell.
      if (!RUN[c.s.phase] && c.wait > 0 && out.used < budget) {
        const k = Math.min(c.wait, budget - out.used);
        c.wait -= k;
        c.u += k;
        out.used += k;
        if (c.wait > 0) break;
      }
      if (c.wait <= 0 || RUN[c.s.phase]) c.done = true;
      break;
    }
    if (out.used >= budget) break;
    if (RUN[c.s.phase]) {
      const ph = c.s.phase;
      step(c.s);
      c.u++;
      out.used++;
      if (c.s.phase !== ph) c.wait = RUN[c.s.phase] ? 0 : WAIT;
      take();
      continue;
    }
    // A waiting phase with its next action somewhere later: the keep has drifted from the session.
    c.off = { at: a.at, why: 'The keep stopped where the next action should come.', type: a.a.type };
    c.done = true;
  }
  return out;
}

// What the viewer marks: the moments that mattered, from the keep's own alerts (deaths, cracks, catches,
// and the rest that called out), by their kinds (alerts.js), and the tester's own page events.
export const BIG = { death: 1, crack: 1, caught: 1, fell: 1 };

// The whole session played through once: its segments (each phase of each day, where it starts on the
// timeline), its moments, the tester's page events placed on the timeline, copies of the keep at the start
// of each day and night to seek from, and where (if anywhere) the replay stopped matching the session.
export function indexOf(x) {
  const c = cursorOf(x);
  const segs = [];
  const marks = [];
  const snaps = [];
  let seg = null;
  const open = () => {
    seg = { season: c.s.season, day: c.s.day, phase: c.s.phase, t0: c.s.t, u0: c.u, u1: c.u };
    segs.push(seg);
    if (RUN[c.s.phase] || !snaps.length) snaps.push({ u: c.u, c: cloneCursor(c) });
  };
  open();
  let checked = 0;
  let differs = null;
  for (let guard = 0; guard < 5e6 && !c.done; guard++) {
    const was = c.s.phase;
    const r = advance(c, x, 1);
    // The keep's fall is marked by the phase it leaves the keep in; what it says is the last alert.
    const fell = was !== 'over' && c.s.phase === 'over';
    for (const al of r.alerts) {
      const kind = fell && al === r.alerts.at(-1) ? 'fell' : momentOf(al);
      if (kind) marks.push({ u: al.u, kind, text: al.text, at: al.at, lane: 'game' });
    }
    if (c.s.season !== seg.season || c.s.day !== seg.day || c.s.phase !== seg.phase) {
      seg.u1 = c.u;
      open();
    }
    // Each day the replay ends is checked against the day the tester played.
    while (!differs && checked < c.s.days.length && checked < (x.days?.length ?? 0)) {
      const [a, b] = [c.s.days[checked], x.days[checked]];
      const k = ['season', 'day', 'living', 'shades', 'dread'].find((f) => a[f] !== b[f]);
      if (k) differs = { season: b.season, day: b.day, what: k, was: b[k], now: a[k] };
      checked++;
    }
    if (!r.used && !r.acts.length && !c.done) break; // nothing moved: nothing will
  }
  seg.u1 = c.u;
  const total = c.u;
  const you = trailMarks(x, segs, total);
  return { segs, marks: [...marks, ...you].sort((a, b) => a.u - b.u), snaps, total, off: c.off, differs, end: posOf(c.s) };
}

// Where a moment of the game is on the timeline.
function unitOf(segs, at, total) {
  const g = segs.find((q) => q.season === at.season && q.day === at.day && q.phase === at.phase);
  if (!g) return null;
  return RUN[at.phase] ? Math.min(g.u1, g.u0 + Math.max(0, (at.t ?? 0) - g.t0)) : Math.min(total, g.u0);
}
const secs = (ms) => Math.max(1, Math.round(ms / 1000));
const PANELS = { phase: 'the phase panel', people: 'People', records: 'Records', menu: 'the Menu', build: 'Build', title: 'the main screen', intro: 'About', test: 'the playtest', watch: 'the session' };
// The tester's trail, as marks: a pause with how long it lasted, a panel opened, an idle stretch or a time
// away from the page, a lesson shown, an action the game refused.
function trailMarks(x, segs, total) {
  const out = [];
  const T = x.trail || [];
  for (let i = 0; i < T.length; i++) {
    const e = T[i];
    const u = e.at ? unitOf(segs, e.at, total) : null;
    if (u == null) continue;
    const m = { u, at: e.at, lane: 'you', w: e.w };
    if (e.k === 'pause' && e.by === 'you') {
      // Until the clock ran again: Play, Skip or Hurry (a pause or a phase first means it isn't known).
      const back = T.slice(i + 1).find((f) => ['play', 'skip', 'rush', 'pause', 'phase'].includes(f.k));
      const ms = back && ['play', 'skip', 'rush'].includes(back.k) ? back.w - e.w : null;
      out.push({ ...m, kind: 'pause', ms, text: `Paused${ms ? ` for ${secs(ms)} s` : ''}.` });
    } else if (e.k === 'panel') out.push({ ...m, kind: 'panel', text: `Opened ${PANELS[e.name] || e.name}${e.tab ? `, ${e.tab}` : ''}.` });
    else if (e.k === 'idle') out.push({ ...m, kind: 'idle', ms: e.ms, text: `Sat idle for ${secs(e.ms)} s.` });
    else if (e.k === 'away') out.push({ ...m, kind: 'away', ms: e.ms, text: `Left the page for ${secs(e.ms)} s.` });
    else if (e.k === 'lesson') out.push({ ...m, kind: 'lesson', text: `Lesson: ${e.text || e.id}` });
    else if (e.k === 'test') out.push({ ...m, kind: 'lesson', text: e.playOn ? 'Chose to play on to the new moon.' : 'Chose to stop after the tutorial.' });
    else if (e.k === 'refused') out.push({ ...m, kind: 'refused', text: `Refused (${e.type}): ${e.error}` });
    else if (e.k === 'skip' || e.k === 'rush') out.push({ ...m, kind: 'skip', text: e.k === 'skip' ? 'Skipped ahead.' : 'Hurried to dusk.' });
  }
  return out;
}

// A cursor at a unit of the timeline: the copy of the keep taken at or before it, played on to it.
export function seek(idx, x, u) {
  const target = Math.max(0, Math.min(idx.total, u));
  let from = idx.snaps[0];
  for (const sn of idx.snaps) if (sn.u <= target) from = sn;
  const c = cloneCursor(from.c);
  for (let guard = 0; guard < 5e6 && c.u < target && !c.done; guard++) {
    const r = advance(c, x, target - c.u);
    if (!r.used && !r.acts.length) break;
  }
  for (const k of c.s.alerts.splice(0)) void k; // what was said before the seek has been said
  return c;
}
