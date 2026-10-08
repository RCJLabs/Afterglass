// The playtest kit: the trail, the tester link and the glass test.

import { drawMoment } from '../slice/draw.js';
import { quizKeep, quizPlan, quizScene, tappedIn, isRight, stillToKeep, quizSummary, QUIZ_ASK, COUNT_CHOICES } from '../slice/quiz.js';
import { SLOTS } from '../slice/saves.js';
import { newTutorial } from '../slice/tutorial.js';
import { prefs, savePrefs, saves, retuned, dirty, saveGame, s, ui, bump, running, setRetuned, setDirty } from './state.js';
import { esc, plural } from './hud.js';
import { exportJSON } from './records.js';
import { openSheet } from './screen.js';
import { playKeep, untouched, saveFile } from './keeps.js';

/* ---------------------------------------------------------------- the playtest kit: the trail */

// The trail (round six's playtest kit): what the player did on the page besides act, kept in the keep and
// sent with its playtest export, so the replay viewer can mark it: pauses (whose, and why), speeds and
// skips, panels and tabs opened, tools picked, lessons shown, actions the game refused, and stretches with
// no input while the clock stood still, or away from the page. Each has where in the game it happened (as
// an action's at) and when on the clock (w, ms). Nothing leaves the device but in an export the player makes.
const TRAIL_MAX = 4000;
const IDLE_MS = 20000;
export const gameAt = () => ({ season: s.season, day: s.day, phase: s.phase, t: s.t });
const sameAt = (a, b) => a.season === b.season && a.day === b.day && a.phase === b.phase && a.t === b.t;
export function trail(k, more = {}) {
  if (ui.watch) return;
  if (k !== 'load' && more.by !== 'game') setDirty(true);
  s.trail ||= [];
  s.trail.push({ k, at: gameAt(), w: Date.now(), ...more });
  if (s.trail.length > TRAIL_MAX) s.trail.splice(0, s.trail.length - TRAIL_MAX);
}
// Idle: a stretch of IDLE_MS or more with no input and the game where it was at the start (paused, or a
// panel waiting on a choice), kept when the next input comes. Watching the night go by isn't idle.
let lastInput = { w: Date.now(), at: null };
function onInput() {
  const now = Date.now();
  if (lastInput.at && now - lastInput.w >= IDLE_MS && sameAt(lastInput.at, gameAt())) trail('idle', { at: lastInput.at, w: lastInput.w, ms: now - lastInput.w });
  lastInput = { w: now, at: gameAt() };
}
for (const type of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(type, onInput, { capture: true, passive: true });
const hideSave = () => {
  if (dirty || (running() && !ui.paused)) saveGame();
};
window.addEventListener('pagehide', hideSave);
let awayFrom = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    awayFrom = { at: gameAt(), w: Date.now() };
    hideSave(); // a tab closed, or an app switched away from, keeps everything to here
  } else if (awayFrom) {
    const ms = Date.now() - awayFrom.w;
    if (ms >= 2000) trail('away', { at: awayFrom.at, w: awayFrom.w, ms });
    awayFrom = null;
    lastInput = { w: Date.now(), at: gameAt() };
  }
});
// Which tab a panel opened on, for the trail.
export const tabOf = (name) => (name === 'records' ? { tab: prefs.tab } : name === 'menu' ? { tab: ui.menuTab || 'settings' } : {});
// The screen the game is played on, for the trail: its size and whether it's touched or pointed at.
export const deviceNow = () => ({ vw: window.innerWidth, vh: window.innerHeight, touch: !!window.matchMedia?.('(pointer: coarse)').matches });

/* ---------------------------------------------------------------- the playtest kit: the tester link */

// The tester link (season.html?test, or ?test=name to put a name on the file): the tutorial in a keep of
// its own, with a note on what the test is. When the tutorial ends the tester is asked to play on to the
// season's end (round seven, phase 5), and the questions come there, when the keep falls, or whenever the
// tester says they're done; then one button to send the session back: shared as a file where the device
// can, saved as one where it can't, or copied as text. There's no server: sessions come back by hand, so
// the answers are kept as they're typed, and a tester who comes back to an unsent session is asked to send it.
export const QUESTIONS = [
  ['night', 'In a sentence or two: what are you trying to do at night?'],
  ['chore', 'Did the nights ever feel like a chore? When?'],
  ['loss', 'When someone died, did it feel more like losing a person, or like gaining a hand for the night? Or both?'],
  ['grief', 'How did the grief in the game feel to you: warm, heavy, or something else?'],
  ['stuck', 'Where were you confused, or stuck?'],
];
export const answered = () => !!s.test && Object.values(s.test.answers || {}).some((v) => v && String(v).trim());
// A keep for the test: this one if nothing has been done in it yet, else the first empty slot.
export const freeSlot = () => (untouched() ? saves.current : Array.from({ length: SLOTS }, (_, i) => i + 1).find((n) => n !== saves.current && !saves.slots[n]));
export function startTest(label) {
  prefs.introDone = true;
  savePrefs();
  if (s.test) {
    ui.testNote = true;
    return openSheet('test', 'game');
  }
  const n = freeSlot();
  if (!n) {
    ui.testAsk = { label };
    return openSheet('test', 'game');
  }
  return beginTest(n, label);
}
export function beginTest(n, label) {
  setRetuned(0);
  ui.testAsk = null;
  prefs.guide = true;
  prefs.guideSeen = {};
  savePrefs();
  const g = newTutorial({});
  g.test = { label: label || null, started: Date.now(), answers: {}, sent: null };
  playKeep(n, g, '');
  ui.toasts = []; // the note says it all
  ui.toastRev++;
  trail('start', { label: label || null, ...deviceNow() });
  saveGame();
  ui.testNote = true;
  return openSheet('test', 'game');
}
export function testHTML() {
  const T = s.test;
  if (ui.testAsk || !T) {
    return `<div class="card test"><h2>Thank you for testing</h2>
      <p>The test needs a keep of its own, and all ${SLOTS} here are in use. It can go in keep ${saves.current}, in place of the one being played, which is lost unless you export it first (Menu, then Saves).</p>
      <div class="row"><button class="btn primary" id="test-here" data-act="test-here">Use keep ${saves.current}</button><button class="btn" id="test-cancel" data-act="sheet-close">Not now</button></div></div>`;
  }
  if (ui.testNote) {
    return `<div class="card test"><h2>Thank you for testing</h2>
      <p>This is Afterglass's tutorial: the first three days and nights of a keep, one thing at a time, about 20 minutes. Play it the way you'd play any game. There's nothing to get right, and you can stop whenever you like.</p>
      <p>When the tutorial ends you'll be asked to play on to the season's end, the new moon, about 20 minutes more with no lessons: that part matters most. Then a few short questions, an optional two-minute picture test, and a button to send your session back. If you stop sooner, Menu, then Done testing, takes you there.</p>
      <p class="hint">What you send: your answers, what you did in the game, when you paused, opened a panel or sat idle, and your screen's size. Nothing leaves this device unless you send it.</p>
      <div class="row"><button class="btn primary" id="test-begin" data-act="test-begin">${started() ? 'Carry on' : 'Begin'}</button>${started() ? '<button class="btn" id="test-stop-note" data-act="test-open">Stop here: the questions</button>' : ''}</div></div>`;
  }
  if (ui.testPlayOn) {
    return `<div class="card test"><h2>That's the tutorial</h2>
      <p>Thank you. The season ends at the new moon, ${plural(Math.max(1, s.tuning.seasonDays - s.day), 'more day')} and nights from here, with no more lessons. Will you play on to it? It's the part of the test that matters most: the game without a guide.</p>
      <p class="hint">Your keep is saved as you go. If you stop part way, Menu, then Done testing, takes you to the questions.</p>
      <div class="row"><button class="btn primary" id="test-playon" data-act="test-playon">Play on to the new moon</button><button class="btn" id="test-stop" data-act="test-stop">Stop here</button></div></div>`;
  }
  if (ui.quiz && !ui.quiz.done) return quizHTML();
  const A = T.answers || {};
  const q = ([k, text]) => `<label for="test-${k}">${esc(text)}</label><textarea id="test-${k}" rows="3" data-test="${k}">${esc(A[k] || '')}</textarea>`;
  const lead = T.sent
    ? 'Sent: thank you. Play on if you like, and send it again at the end; the new one has everything.'
    : ui.testBack
      ? "Welcome back. Your answers are as you left them: send them when you're ready, or play on first."
      : s.phase === 'over' ? 'The keep has fallen: thank you for playing it this far. A few questions, then one button.' : s.phase === 'end' ? 'The season is over: thank you for playing it through. A few questions, then one button.' : 'Thank you for playing. A few questions, then one button. Answer as many as you like.';
  return `<div class="card test"><h2>Your playtest</h2>
    <p>${lead}</p>
    ${QUESTIONS.map(q).join('')}
    <p id="test-again-q"><b>Would you keep playing?</b></p>
    <div class="row" role="group" aria-labelledby="test-again-q">
      <button class="btn" id="test-yes" data-act="test-again" data-v="yes" aria-pressed="${A.again === 'yes'}">Yes</button>
      <button class="btn" id="test-no" data-act="test-again" data-v="no" aria-pressed="${A.again === 'no'}">No</button>
    </div>
    <label for="test-why">What would make you, or stop you?</label><textarea id="test-why" rows="2" data-test="why">${esc(A.why || '')}</textarea>
    ${quizCard()}
    <div class="row"><button class="btn primary" id="test-send" data-act="test-send">Send it back</button><button class="btn" id="test-copy" data-act="test-copy">Copy as text</button></div>
    ${ui.testMsg ? `<p class="note" role="status">${esc(ui.testMsg)}</p>` : ''}
    ${ui.testShow ? `<label for="test-text">Your session, as text</label><textarea id="test-text" rows="6" readonly>${esc(exportJSON())}</textarea>` : ''}
    <p class="hint">Send it back shares your session as a file where this device can, and saves the file where it can't: then send that file to whoever asked you to test. Copy as text puts the same thing on the clipboard, to paste into a message.</p>
    <div class="row"><button class="btn" id="test-on" data-act="sheet-close">Keep playing</button></div></div>`;
}
// Whether the tester has done anything in the keep yet.
const started = () => s.actions.length > 0 || s.day > 1 || s.phase !== 'day' || s.t > 0;

/* ---------------------------------------------------------------- the playtest kit: the glass test */

// The glass test (round seven, phase 5): eight stills of a small keep's Tain, half reflected and half upright,
// each asking one thing (quiz.js). Taken after the questions, if the tester likes. Each answer is kept in the
// session as it's given, with how long it took and which camera the tester played in.
export let quizBase = null;
export function startQuiz() {
  quizBase ||= quizKeep();
  const T = s.test;
  const seed = ((T.started || 1) % 4294967295) >>> 0 || 1;
  T.quiz = { seed, played: prefs.mode === 'flipped' ? 'flipped' : 'reflection', results: [], done: false };
  ui.quiz = { plan: quizPlan(seed), i: 0, shownAt: 0, img: null, feedback: null, done: false };
  trail('quiz', { start: true });
  saveGame();
  bump();
}
function quizCurrent() {
  const Q = ui.quiz;
  const q = Q.plan[Q.i];
  if (!Q.img || Q.img.i !== Q.i) {
    const scene = quizScene(quizBase, q);
    const cv = document.createElement('canvas');
    drawMoment(cv, quizBase, { f: scene.f, kind: 'tide', frame: scene.frame }, { flip: q.cam === 'flipped' }); // a tide: no ring
    Q.img = { i: Q.i, scene, url: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
    Q.shownAt = performance.now();
  }
  return Q.img;
}
function quizHTML() {
  const Q = ui.quiz;
  const q = Q.plan[Q.i];
  const im = quizCurrent();
  const fb = Q.feedback ? `<p class="quiz-fb ${Q.feedback.right ? 'good' : 'bad'}" role="status">${Q.feedback.right ? 'Right.' : 'Not that one.'}</p>` : '<p class="quiz-fb" role="status"></p>';
  const count = q.type === 'count' ? `<div class="row quiz-count" role="group" aria-label="How many">${COUNT_CHOICES.map((n) => `<button class="btn" id="quiz-n${n}" data-act="quiz-count" data-v="${n}"${Q.feedback ? ' disabled' : ''}>${n}</button>`).join('')}</div>` : '';
  return `<div class="card test quiz"><h2>The glass test <span class="count">${Q.i + 1} of ${Q.plan.length}</span></h2>
    <p class="quiz-cam">${q.cam === 'flipped' ? 'The Tain turned upright' : 'The Tain as the lake shows it, upside down'}</p>
    <p class="quiz-ask" id="quiz-ask">${esc(QUIZ_ASK[q.type])}</p>
    <div class="quiz-still"><img id="quiz-img" src="${im.url}" width="${im.w}" height="${im.h}" alt="The Tain at night" aria-describedby="quiz-ask"${q.type === 'count' ? '' : ' data-act="quiz-tap"'}></div>
    ${count}${fb}
    <div class="row"><button class="btn sm" id="quiz-stop" data-act="quiz-stop">Stop the test</button></div></div>`;
}
export function quizAnswer(given) {
  const Q = ui.quiz;
  if (!Q || Q.feedback) return;
  const q = Q.plan[Q.i];
  const right = isRight(Q.img.scene, given);
  const ms = Math.round(performance.now() - Q.shownAt);
  s.test.quiz.results.push({ type: q.type, cam: q.cam, right, ms, given: given ?? null });
  trail('quiz', { type: q.type, cam: q.cam, right, ms });
  Q.feedback = { right };
  saveGame();
  bump();
  setTimeout(() => {
    if (ui.quiz !== Q) return;
    Q.feedback = null;
    Q.i++;
    if (Q.i >= Q.plan.length) {
      Q.done = true;
      s.test.quiz.done = true;
      s.test.quiz.summary = quizSummary(s.test.quiz.results);
      saveGame();
    }
    bump();
  }, 700);
}
// A tap on the still: where it landed in the keep, and the figure nearest it.
export function quizTap(el, e) {
  const Q = ui.quiz;
  if (!Q || !e || !el.clientWidth) return;
  const r = el.getBoundingClientRect();
  const sx = ((e.clientX - r.left) * el.naturalWidth) / r.width;
  const sy = ((e.clientY - r.top) * el.naturalHeight) / r.height;
  const p = stillToKeep(quizBase, Q.img.scene, sx, sy, el.naturalHeight);
  quizAnswer(tappedIn(quizBase, Q.img.scene, p));
}
function quizCard() {
  const Z = s.test?.quiz;
  if (Z?.done) {
    const n = Z.results.filter((x) => x.right).length;
    return `<div class="card quiz-done"><h3>The glass test</h3><p>Done, thank you: ${n} of ${Z.results.length} right.</p></div>`;
  }
  return `<div class="card quiz-card"><h3>The glass test</h3>
    <p>Optional, about two minutes: eight pictures of the Tain at night, four upside down as the lake shows it and four turned upright. Each asks one thing. Tap as quickly as you can while getting it right.</p>
    <div class="row"><button class="btn" id="quiz-start" data-act="quiz-start">${Z?.results?.length ? 'Start it again' : 'Start the glass test'}</button></div></div>`;
}

// Where a test keep's Menu and Playtest tab point: the questions.
export function testCard() {
  const T = s.test;
  if (!T) return '';
  return `<div class="card test-menu"><p><b>You're testing.</b> ${T.sent ? 'Sent: thank you. It can be sent again after playing on.' : answered() ? 'Your answers are kept, not sent yet.' : 'Done? A few questions, and your session goes back.'}</p>
    <div class="row"><button class="btn sm primary" id="test-done" data-act="test-open">${T.sent ? 'Send it again' : 'Done testing'}</button></div></div>`;
}
const testFile = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const who = (s.test?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return `afterglass-playtest-${who ? `${who}-` : ''}${stamp}.json`;
};
function testSent(msg, show = false) {
  ui.testMsg = msg;
  ui.testShow = show;
  if (!show) {
    s.test.sent = Date.now();
    saveGame();
  }
  bump();
}
// One button: the device's share sheet with the file where it takes files, else the file saved. The share
// has to start inside the tap, so nothing is awaited before it.
export async function sendTest() {
  const name = testFile();
  const file = new File([exportJSON()], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Afterglass playtest', text: 'My Afterglass playtest session.' });
      return testSent('Sent: thank you!');
    }
  } catch (e) {
    if (e?.name === 'AbortError') return undefined; // the share sheet was closed: nothing went
  }
  saveFile(file, name);
  return testSent(`Saved as ${name}. Send that file to whoever asked you to test: thank you!`);
}
export function copyTest() {
  const blocked = () => testSent('Copying was blocked here. The session is below: select it all, copy it, and paste it into a message.', true);
  try {
    navigator.clipboard.writeText(exportJSON()).then(() => testSent('Copied. Paste it into a message to whoever asked you to test: thank you!'), blocked);
  } catch {
    blocked();
  }
}
