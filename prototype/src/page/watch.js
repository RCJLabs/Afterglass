// The playtest kit: the replay viewer.

import { TICKS_PER_SEC } from '../slice/data.js';
import { quizSummary } from '../slice/quiz.js';
import { newSeason, dayTicks, nightTicks } from '../slice/sim.js';
import { readExport, indexOf, advance, seek, cloneCursor } from '../slice/watch.js';
import { saves, loadGame, saveGame, s, ui, bump, running, toast } from './state.js';
import { esc, plural, upper, hhmm, phaseLabel, SHEET_NAME } from './hud.js';
import { gameAt, QUESTIONS } from './playtest.js';
import { wide } from './stage.js';
import { openSheet, closeSheet } from './screen.js';
import { showCoach } from './guide.js';
import { waiting, freshKeep } from './keeps.js';

/* ---------------------------------------------------------------- the playtest kit: the replay viewer */

// The replay viewer (round six's playtest kit): a playtest export played back in this page at 1× to 16×,
// with the moments that mattered (deaths, cracks, catches, a fall) and the tester's own pauses, panels, idle
// stretches and lessons marked on a timeline in the bar (src/slice/watch.js). The keep being played is saved
// first and comes back after; while watching nothing is saved, and nothing in the session can be changed.
const WATCH_SPEEDS = [1, 2, 4, 8, 16];
const ACT_HOLD = 0.35; // seconds at 1× on each of the tester's actions while the clock runs
const MARK_HOLD = 1.2; // and on a pause of theirs, an idle stretch or a time away
const HOLDS = { pause: 1, idle: 1, away: 1 };
// The marks Next and Back stop at, and the session's list shows: all but the lesser alerts.
const STOPS_AT = { death: 1, crack: 1, caught: 1, fell: 1, visit: 1, pause: 1, idle: 1, away: 1, refused: 1, lesson: 1, panel: 1, skip: 1 };
export const LEAD = 20; // Next and Back land this many units (2 s at 1×) before a mark, to see it come
// Where in the game a moment was, in words: "Night 2, 21:40", "Season 2, dawn, day 3".
function whenText(at) {
  if (!at) return '';
  const g = { ...s, season: at.season, day: at.day, phase: at.phase };
  const clock = at.phase === 'day' ? hhmm(6 + (12 * at.t) / dayTicks(g)) : at.phase === 'night' ? hhmm(18 + (12 * at.t) / nightTicks(g)) : '';
  const where = at.phase === 'day' ? `Day ${at.day}` : at.phase === 'night' ? `Night ${at.day}` : at.phase === 'over' ? `Day ${at.day}, the fall` : `${upper(at.phase)}, day ${at.day}`;
  return `${at.season > 1 ? `Season ${at.season}, ` : ''}${where}${clock ? `, ${clock}` : ''}`;
}
export function watchText(text, name) {
  const r = readExport(text);
  if (r.error) {
    ui.watchMsg = r.error;
    return bump();
  }
  ui.watchMsg = 'Getting the session ready…';
  bump();
  // A frame for the message first: a whole year takes a second or two to play through once.
  setTimeout(() => startWatch(r.x, name), 40);
  return undefined;
}
function startWatch(x, name) {
  let idx;
  try {
    idx = indexOf(x);
  } catch (e) {
    ui.watchMsg = `That session didn't replay: ${e.message}`;
    return bump();
  }
  saveGame();
  const c = cloneCursor(idx.snaps[0].c);
  ui.watchMsg = '';
  ui.watch = { x, idx, c, name, playing: false, speed: 1, acc: 0, hold: 0, mi: 0, caption: '', line: timelineHTML(idx) };
  freshKeep(c.s);
  ui.toasts = []; // what the keep in play was saying isn't the session's
  ui.toastRev++;
  showCoach(null);
  openSheet('watch', 'game');
  return bump();
}
export function stopWatching() {
  ui.watch = null;
  freshKeep(loadGame(saves.current) || newSeason());
  ui.toasts = [];
  ui.toastRev++;
  closeSheet();
  toast(`Back to keep ${saves.current}. Season ${s.season}: ${phaseLabel()}.`, 'rite');
  if (waiting()) openSheet('phase', 'game');
  return bump();
}
export function watchPlay() {
  const w = ui.watch;
  if (w.c.done && !w.playing) watchSeek(0);
  w.playing = !w.playing;
  if (w.playing && ui.sheet && !wide()) closeSheet();
  return bump();
}
export function watchSpeed(v) {
  ui.watch.speed = v;
  return bump();
}
// A mark's words, for the caption over the castle and the list.
const markLine = (m) => `${whenText(m.at)}. ${m.lane === 'you' ? 'The tester: ' : ''}${m.text}`;
export function watchFrame(dt) {
  const w = ui.watch;
  if (!w.playing) return;
  if (w.hold > 0) {
    w.hold -= dt;
    return;
  }
  w.acc += dt * w.speed * TICKS_PER_SEC;
  const n = Math.floor(w.acc);
  if (n < 1) return;
  w.acc -= n;
  const r = advance(w.c, w.x, n, true);
  // What was passed on the way: the latest mark's words over the castle, and a moment on the tester's
  // own waits and on each thing they did while the clock ran.
  const M = w.idx.marks;
  let said = null;
  while (w.mi < M.length && M[w.mi].u <= w.c.u) {
    const m = M[w.mi++];
    if (STOPS_AT[m.kind]) said = m;
    if (HOLDS[m.kind]) w.hold = Math.max(w.hold, MARK_HOLD / w.speed);
  }
  if (said) w.caption = markLine(said);
  if (r.acts.length && running()) w.hold = Math.max(w.hold, ACT_HOLD / w.speed);
  if (w.c.done) {
    w.playing = false;
    w.caption = w.idx.off ? offText(w.idx.off) : 'The end of the session.';
  }
  if (said || r.acts.length || w.c.done) bump();
}
export function watchSeek(u) {
  const w = ui.watch;
  w.c = seek(w.idx, w.x, u);
  freshKeep(w.c.s);
  w.acc = 0;
  w.hold = 0;
  w.mi = w.idx.marks.findIndex((m) => m.u >= w.c.u);
  if (w.mi < 0) w.mi = w.idx.marks.length;
  return bump();
}
const stopsOf = (w) => w.idx.marks.filter((m) => STOPS_AT[m.kind]);
export function watchNext() {
  const w = ui.watch;
  const m = stopsOf(w).find((x) => x.u > w.c.u + LEAD);
  if (!m) return toast('No more marks after this.');
  watchSeek(m.u - LEAD);
  w.caption = markLine(m);
  return bump();
}
export function watchPrev() {
  const w = ui.watch;
  const m = stopsOf(w).filter((x) => x.u < w.c.u - LEAD - 1).at(-1);
  watchSeek(m ? m.u - LEAD : 0);
  w.caption = m ? markLine(m) : 'The start of the session.';
  return bump();
}
const offText = (off) => `${whenText(off.at)}: this build stops replaying the session here (${off.why}). Its rules have changed since the tester played.`;
// The timeline: each phase as a band (day, night, and the waits between), the game's moments above and the
// tester's below, and how far the replay has got.
function timelineHTML(idx) {
  const pc = (u) => ((100 * u) / Math.max(1, idx.total)).toFixed(3);
  const segs = idx.segs.filter((g) => g.u1 > g.u0).map((g) => `<i class="wseg ws-${g.phase}" style="left:${pc(g.u0)}%;width:${pc(g.u1 - g.u0)}%"></i>`).join('');
  const marks = idx.marks.map((m) => `<b class="wm wm-${m.kind} wl-${m.lane}" style="left:${pc(m.u)}%"></b>`).join('');
  return `<span class="wsegs" aria-hidden="true">${segs}</span><span class="wmarks" aria-hidden="true">${marks}</span>`;
}
export function watchBarHTML() {
  const w = ui.watch;
  const menu = [['watch', 'Session'], ['phase', SHEET_NAME()], ['people', 'People'], ['records', 'Records'], ['menu', 'Menu']]
    .map(([k, label]) => `<button class="btn sm gm" id="open-${k}" data-act="sheet" data-sheet="${k}" aria-pressed="${ui.sheet === k}" aria-controls="sheet">${label}</button>`)
    .join('');
  return `<div class="wbar">
    <div class="wline" id="wline" role="slider" tabindex="0" aria-label="The session: tap or drag to go there" aria-valuemin="0" aria-valuemax="${w.idx.total}" aria-valuenow="${w.c.u}" aria-valuetext="${esc(whenText(gameAt()))}">${w.line}<i class="wfill" data-bar="wfill"></i></div>
    <div class="wrow">
      <div class="wctl">
        <button class="btn sm" id="w-prev" data-act="w-prev" aria-label="Back to the last mark" title="Back to the last mark ([)">◀</button>
        <button class="btn sm primary" id="w-play" data-act="w-play">${w.playing ? 'Pause' : w.c.done ? 'Again' : 'Play'}</button>
        <button class="btn sm" id="w-next" data-act="w-next" aria-label="On to the next mark" title="On to the next mark (])">▶</button>
        <div class="seg" role="group" aria-label="Speed">${WATCH_SPEEDS.map((v) => `<button class="btn sm" id="w-speed-${v}" data-act="w-speed" data-v="${v}" aria-pressed="${w.speed === v}">${v}×</button>`).join('')}</div>
      </div>
      <div class="gmenu">${menu}</div>
    </div>
  </div>`;
}
// The session: who, where and when; their answers; whether this build still replays it; and every mark,
// to go to.
export function watchHTML() {
  const w = ui.watch;
  if (!w) return '<p>No session is being watched.</p>';
  const x = w.x;
  const T = x.test;
  const tr = x.trail || [];
  const first = tr.find((e) => e.k === 'start') || tr.find((e) => e.k === 'load');
  const span = tr.length ? Math.round((tr.at(-1).w - tr[0].w) / 60000) : null;
  const who = T?.label || w.name || 'A playtest';
  const when = first ? new Date(first.w).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const screen = first?.vw ? `, on a ${first.vw}×${first.vh} ${first.touch ? 'touch screen' : 'screen with a pointer'}` : '';
  const facts = `${esc(who)}${when ? `, ${esc(when)}` : ''}${span != null ? `, over ${plural(span, 'minute')}` : ''}${esc(screen)}. ${x.tuning0?.tutorial ? 'The tutorial keep.' : ''}`;
  const off = w.idx.off
    ? `<p class="note bad">${esc(offText(w.idx.off))} What shows after that isn't what the tester saw.</p>`
    : w.idx.differs
      ? `<p class="note bad">From day ${esc(String(w.idx.differs.day))} this replay differs from the session (${esc(w.idx.differs.what)}: ${esc(String(w.idx.differs.was))} then, ${esc(String(w.idx.differs.now))} here): this build's rules have changed since the tester played.</p>`
      : '';
  const A = T?.answers || {};
  const answers = T
    ? `<div class="card"><h3>Their answers</h3><dl class="wans">${QUESTIONS.map(([k, q]) => `<dt>${esc(q)}</dt><dd>${esc(A[k] || '—')}</dd>`).join('')}<dt>Would you keep playing?</dt><dd>${A.again === 'yes' ? 'Yes' : A.again === 'no' ? 'No' : '—'}${A.why ? `. ${esc(A.why)}` : ''}</dd></dl><p class="note">${T.playOn === true ? 'After the tutorial they chose to play on to the new moon.' : T.playOn === false ? 'After the tutorial they chose to stop.' : 'They never reached the end of the tutorial.'}</p>${T.sent ? '' : '<p class="hint">They never pressed Send: this came some other way.</p>'}</div>${quizSeen(T.quiz)}`
    : '';
  const asked = (x.seasons || []).filter((e) => e.answer || e.note);
  const seasonQ = asked.length ? `<div class="card"><h3>The season's question</h3><ul>${asked.map((e) => `<li>Season ${esc(String(e.season))}: ${e.answer === 'again' ? 'would play another' : e.answer === 'stop' ? "would stop" : 'no answer'}${e.note ? `. ${esc(e.note)}` : ''}</li>`).join('')}</ul></div>` : '';
  const stops = stopsOf(w);
  // The list is the same all session long: made once.
  w.list ??= stops.slice(0, 400).map((m) => `<li class="wl-${m.lane}"><button class="linkish" data-act="w-go" data-u="${m.u}">${esc(whenText(m.at))}</button> <span class="wk wk-${m.kind}"></span>${m.lane === 'you' ? 'The tester: ' : ''}${esc(m.text)}</li>`).join('');
  const list = w.list;
  return `<section class="watch">
    <div class="card"><h2>Watching a session</h2><p>${facts}</p>${off}
      <div class="row"><button class="btn sm primary" id="w-play-2" data-act="w-play">${w.playing ? 'Pause' : 'Play'}</button><button class="btn sm" id="w-exit" data-act="w-exit">Stop watching</button></div></div>
    ${answers}${seasonQ}
    <div class="card"><h3>What happened</h3><p class="hint">On the timeline, the game's moments are above (deaths, cracks and catches in red) and the tester's below (pauses in blue, idle stretches and time away in violet). Tap one here to go to it; ◀ and ▶ (or [ and ]) step between them.</p>
      ${list ? `<ol class="wlist">${list}</ol>${stops.length > 400 ? `<p class="hint">And ${stops.length - 400} more.</p>` : ''}` : '<p>Nothing marked.</p>'}</div>
  </section>`;
}
// The glass test's results, per camera, for the viewer (round seven, phase 5).
function quizSeen(Z) {
  if (!Z?.results?.length) return '';
  const sum = quizSummary(Z.results);
  const row = (cam, name) => {
    const c = sum.byCam[cam];
    return c.n ? `<li>${name}: ${c.right} of ${c.n} right, ${c.ms != null ? `${(c.ms / 1000).toFixed(1)} s` : '—'} each (the median)</li>` : '';
  };
  const each = Z.results.map((x) => `${x.cam === 'flipped' ? 'upright' : 'reflected'}, ${x.type}: ${x.right ? 'right' : 'wrong'} in ${(x.ms / 1000).toFixed(1)} s`).join('; ');
  return `<div class="card"><h3>The glass test</h3><p class="note">They played with the Tain ${Z.played === 'flipped' ? 'turned upright' : 'reflected'}${Z.done ? '' : `, and stopped after ${Z.results.length} of 8`}.</p><ul>${row('reflection', 'Reflected')}${row('flipped', 'Upright')}</ul><p class="hint">${esc(each)}.</p></div>`;
}
// In Saves: a tester's session to watch, from their file or as pasted text.
export function watchCard() {
  return `<div class="card watch-load" id="watch-load"><h3>Watch a playtest</h3>
    <p class="note">A tester's session, from the file they sent or the text they pasted, played back here at up to 16×, with what happened and when they paused, opened a panel or sat idle marked on a timeline. ${ui.watch ? '' : 'Your keep is saved first, and comes back when you stop watching.'}</p>
    <div class="row"><input type="file" id="watch-file" class="visually-hidden" data-act="w-file" accept=".json,application/json,text/plain"><label class="btn sm primary" for="watch-file">Load a session</label></div>
    <details class="wpaste" data-keep="wpaste"${ui.open.wpaste ? ' open' : ''}><summary>Or paste it</summary><label for="watch-text">The session, as text</label><textarea id="watch-text" rows="4"></textarea><div class="row"><button class="btn sm" id="watch-paste" data-act="w-paste">Watch it</button></div></details>
    ${ui.watchMsg ? `<p class="note${ui.watchMsg.startsWith('Getting') ? '' : ' bad'}" role="status">${esc(ui.watchMsg)}</p>` : ''}
  </div>`;
}
