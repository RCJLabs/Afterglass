// What each button does.

import { ENDINGS } from '../slice/data.js';
import { nextSlot, crossingPreview, lastSeason, chapterOf } from '../slice/sim.js';
import { prefs, savePrefs, applyMotion, sound, buzz, sfx, saves, saveGame, s, ui, bump, running, toast } from './state.js';
import { stripOpen, openHowto } from './hud.js';
import { wardName } from './dusk.js';
import { makeCard, saveCard, shareCard } from './dawn.js';
import { startTutorial, startDaily } from './records.js';
import { trail, beginTest, startQuiz, quizAnswer, quizTap, sendTest, copyTest } from './playtest.js';
import { LEAD, watchText, stopWatching, watchPlay, watchSpeed, watchSeek, watchNext, watchPrev } from './watch.js';
import { wide, view, zoomBy, fitView, drawnLabels, takeBack, showSpot, setDrawnLabels } from './stage.js';
import { installPrompt, openTitle, titleContinue, titleView, titleStart, startIn, openSheet, closeSheet, setInstallPrompt } from './screen.js';
import { guideStep, markSeen, showCoach } from './guide.js';
import { startSouls, skipAhead } from './clock.js';
import { game, togglePlay, setSpeed, copyExport, chapterAgainNow, noteHall, playSlot, newKeep, confirmSlot, exportSlot, importSlot, toStage } from './keeps.js';

// What each button does, by its data-act: given the button (el), the event (ev), the button's data-id (id) and
// the name itself. A name not here does nothing.
const ACTS = {
  // A newer build is ready (screen.js, checkVersion): save, then load it.
  update() {
    saveGame();
    location.reload();
  },
  play: () => togglePlay(),
  speed: (el) => setSpeed(Number(el.dataset.v)),
  'strip-open': (el) => stripOpen(el.dataset.card),
  howto: (el) => openHowto(el.dataset.sec),
  'way-spot': (el) => showSpot(Number(el.dataset.f), Number(el.dataset.x)),
  'hud-more'() {
    prefs.hudAll = !prefs.hudAll;
    savePrefs();
    return bump();
  },
  rush() {
    ui.rush = !ui.rush;
    trail('rush', { on: ui.rush });
    if (ui.rush) ui.paused = false;
    return bump();
  },
  tool(el) {
    ui.tool = el.dataset.tool;
    trail('tool', { tool: ui.tool });
    return bump();
  },
  flip() {
    prefs.mode = prefs.mode === 'flipped' ? 'reflection' : 'flipped';
    savePrefs();
    view.panX = 0;
    view.panY = 0;
    view.snap = true;
    return bump();
  },
  'zoom-in': () => zoomBy(1),
  'zoom-out': () => zoomBy(-1),
  'zoom-fit': () => fitView(),
  ways(el) {
    prefs.ways = typeof el?.checked === 'boolean' ? el.checked : prefs.ways === false;
    savePrefs();
    return bump();
  },
  labels() {
    prefs.labels = !prefs.labels;
    savePrefs();
    setDrawnLabels('');
    return bump();
  },
  camera(el) {
    if (el.value === prefs.mode) return undefined;
    return onAct('flip', el);
  },
  sound(el) {
    prefs.sound = typeof el.checked === 'boolean' ? el.checked : !prefs.sound;
    savePrefs();
    sound.set({ on: prefs.sound });
    if (prefs.sound) {
      sound.unlock();
      setTimeout(() => sfx('good'), 120);
    }
    if (typeof el.checked !== 'boolean') toast(prefs.sound ? 'Sound on.' : 'Sound off. S turns it back on.');
    return bump();
  },
  volume(el) {
    prefs[el.dataset.key] = Number(el.value) / 100;
    savePrefs();
    sound.set({ fx: prefs.sfx, amb: prefs.amb });
    if (el.dataset.key === 'sfx') sfx('good');
    return undefined;
  },
  haptics(el) {
    prefs.haptics = el.checked;
    savePrefs();
    buzz([30]);
    return bump();
  },
  hear(el) {
    sound.unlock();
    sfx(el.dataset.cue);
    return undefined;
  },
  motion(el) {
    prefs.motion = el.value;
    savePrefs();
    applyMotion();
    view.snap = true;
    return bump();
  },
  'menu-tab'(el, ev, id, name) {
    ui.menuTab = el.dataset.tab;
    trail('panel', { name: 'menu', tab: ui.menuTab });
    ui.confirmSlot = null;
    ui.slotMsg = '';
    return bump();
  },
  'slot-play': (el) => playSlot(Number(el.dataset.n)),
  'slot-new': (el) => newKeep(Number(el.dataset.n)),
  daily: (el) => startDaily(Number(el.dataset.n)),
  'daily-ask'() {
    ui.confirmSlot = { n: saves.current, kind: 'daily' };
    return bump();
  },
  tutorial: (el) => startTutorial(Number(el.dataset.n)),
  'tutorial-ask'() {
    ui.confirmSlot = { n: saves.current, kind: 'tutorial' };
    return bump();
  },
  'slot-over'(el, ev, id, name) {
    ui.confirmSlot = { n: Number(el.dataset.n), kind: name === 'slot-over' ? 'over' : 'delete' };
    return bump();
  },
  'slot-delete': (...a) => ACTS['slot-over'](...a),
  'slot-no'() {
    ui.confirmSlot = null;
    return bump();
  },
  'slot-yes': (el) => confirmSlot(Number(el.dataset.n)),
  'slot-export': (el) => exportSlot(Number(el.dataset.n)),
  import: (el) => importSlot(Number(el.dataset.n), el),
  sheet: (el) => ui.sheet === el.dataset.sheet ? closeSheet() : openSheet(el.dataset.sheet),
  'sheet-close': () => closeSheet(),
  hush: () => game({ type: 'hush', on: !s.night?.hush }),
  person(el, ev, id) {
    ui.person = ui.person === id ? null : id;
    if (ui.person) toStage();
    return bump();
  },
  assign: (el, ev, id) => game({ type: 'assign', id, room: el.value || null }),
  hang: (el, ev, id) => game({ type: 'hang', id, room: el.value }),
  turn: (el, ev, id) => game({ type: 'turn', id, on: !!el.dataset.on }),
  'by-day'(el, ev, id) {
    const [how, room] = (el.value || '').split(':');
    return game({ type: 'byDay', id, how: how || null, room: room || undefined });
  },
  raise(el, ev, id) {
    const at = ui.buildAt;
    const r = game({ type: 'raise', room: el.dataset.room, ...(at && at !== (nextSlot(s)?.newFloor ? 'top' : nextSlot(s)?.id) ? { at } : {}) });
    ui.buildAt = null;
    return r;
  },
  'build-at'(el) {
    ui.buildAt = el.dataset.at;
    return bump();
  },
  tear(el, ev, id) {
    ui.tearAsk = el.dataset.id;
    ui.moving = null;
    return bump();
  },
  'tear-no'() {
    ui.tearAsk = null;
    return bump();
  },
  'tear-yes'(el, ev, id) {
    ui.tearAsk = null;
    return game({ type: 'teardown', id: el.dataset.id });
  },
  move(el, ev, id) {
    ui.moving = el.dataset.id;
    ui.tearAsk = null;
    return bump();
  },
  'move-cancel'() {
    ui.moving = null;
    return bump();
  },
  'move-to'(el, ev, id) {
    const from = ui.moving;
    ui.moving = null;
    return game({ type: 'moveRoom', id: from, to: el.dataset.id });
  },
  wardgate: () => game({ type: 'wardGate' }),
  payoff: () => game({ type: 'payOff' }),
  'bar-stores': () => game({ type: 'barStores' }),
  pitch: () => game({ type: 'pitch' }),
  shore: () => game({ type: 'shore' }),
  'raid-bell': () => game({ type: 'raidBell' }),
  pursue: () => game({ type: 'pursue' }),
  'take-glass'() {
    const campaignEnd = chapterOf(s) === 5; // round seven, phase 15: the campaign's last ending, told
    if (game({ type: 'takeGlass' })) {
      saveGame();
      noteHall();
      if (campaignEnd) toast(ENDINGS.watch.epilogue, 'rite');
    }
    return undefined;
  },
  'close-chapter'(el, ev, id) {
    if (game({ type: 'closeChapter', id: el.dataset.id })) saveGame();
    return undefined;
  },
  'end-ask'(el, ev, id) {
    ui.endAsk = el.dataset.id;
    return bump();
  },
  'end-no'() {
    ui.endAsk = null;
    return bump();
  },
  'end-yes'() {
    const k = ui.endAsk;
    ui.endAsk = null;
    if (game({ type: k === 'seal' ? 'sealVeil' : 'openVeil' })) {
      saveGame();
      noteHall();
    }
    return undefined;
  },
  'chapter-again': () => chapterAgainNow(),
  'seal-ask'() {
    ui.sealAsk = true;
    return bump();
  },
  'seal-no'() {
    ui.sealAsk = false;
    return bump();
  },
  'seal-yes'() {
    ui.sealAsk = false;
    if (game({ type: 'sealVeil' })) {
      saveGame();
      noteHall();
    }
    return undefined;
  },
  request: (el, ev, id) => game({ type: 'request', id: el.dataset.id, grant: !!el.dataset.grant }),
  sally: () => game({ type: 'sally' }),
  donate: () => game({ type: 'donate' }),
  visitor: (el, ev, id) => game({ type: 'visitor', id: el.dataset.id, answer: el.dataset.answer }),
  'rite-kind'(el) {
    ui.riteKind = el.value;
    return bump();
  },
  study: (el, ev, id) => game({ type: 'study', id: el.dataset.id, ...(el.dataset.id === 'rites' ? { kind: document.getElementById('rite-kind')?.value } : {}) }),
  decree: (el, ev, id) => game({ type: 'decree', id: el.dataset.id }),
  'ward-undergate': () => game({ type: 'ward', target: 'undergate' }),
  unward: (el) => takeBack({ type: 'unward', target: el.dataset.target }, `The ward on ${wardName(el.dataset.target)} is lifted, and its essence back.`),
  'shade-act': (el, ev, id) => game({ type: 'shadeAct', id: el.dataset.id }),
  lantern: (el, ev, id) => game({ type: 'lantern', id: el.dataset.id }),
  omen: (el) => game({ type: 'omen', i: Number(el.dataset.i) }),
  skip: () => skipAhead(),
  hide: (el, ev, id) => game({ type: 'hide', id: el.dataset.id, on: !!el.dataset.on }),
  vigil: () => game({ type: 'vigil' }),
  build: (el) => game({ type: 'build', mirror: el.dataset.mirror }),
  descend: (el, ev, id) => game({ type: 'descend', id: el.dataset.id, depth: Number(el.dataset.depth) }),
  'upgrade-mirror': (el, ev, id) => game({ type: 'upgradeMirror', id: el.dataset.id }),
  'fight-fire': (el) => game({ type: 'fightFire', room: el.dataset.room, bell: !!el.dataset.bell }),
  mend: (el, ev, id) => game({ type: 'mend', id: el.dataset.id }),
  'stand-ward': (el) => game({ type: 'standWard', target: el.dataset.target }),
  'ward-veil': () => game({ type: 'wardVeil' }),
  'ease-trouble': () => game({ type: 'easeTrouble' }),
  'break-ask'(el, ev, id) {
    ui.breakAsk = el.dataset.id;
    return bump();
  },
  'break-no'() {
    ui.breakAsk = null;
    return bump();
  },
  break(el, ev, id) {
    ui.breakAsk = null;
    if (game({ type: 'break', id: el.dataset.id })) saveGame();
    return undefined;
  },
  funeral: (el, ev, id) => game({ type: 'funeral', id, on: el.getAttribute('aria-pressed') !== 'true' }),
  wake() {
    const plan = crossingPreview(s);
    if (game({ type: 'wake' })) {
      ui.tool = 'move';
      closeSheet();
      startSouls(plan);
    }
    return undefined;
  },
  'as-last-night': () => game({ type: 'asLastNight' }),
  start() {
    if (game({ type: 'startNight' })) {
      ui.paused = false;
      ui.selected = null;
      if (ui.sheet === 'phase' || !wide()) closeSheet();
    }
    return undefined;
  },
  select(el, ev, id) {
    ui.selected = ui.selected === id ? null : id;
    ui.tool = 'move';
    if (ui.selected) toStage();
    return bump();
  },
  rite: (el, ev, id) => game({ type: 'rite', id, choice: el.dataset.choice }),
  name: (el, ev, id, name) => game({ type: name, id }),
  remember: (...a) => ACTS['name'](...a),
  vigils: (el) => game({ type: 'vigils', n: Number(el.dataset.n) }),
  'begin-day'() {
    if (game({ type: 'beginDay' })) {
      ui.paused = false;
      saveGame();
    }
    return undefined;
  },
  answer(el) {
    const e = lastSeason(s);
    game({ type: 'answer', answer: e?.answer === el.dataset.v ? null : el.dataset.v });
    return saveGame();
  },
  'card-make': () => makeCard(),
  'card-save': () => ui.card?.url && saveCard(),
  'card-share': () => ui.card?.url && shareCard(),
  'next-season'() {
    if (game({ type: 'nextSeason' })) saveGame();
    return undefined;
  },
  tune: (el) => game({ type: 'tune', key: el.dataset.key, value: el.value }),
  tab(el, ev, id, name) {
    prefs.tab = el.dataset.tab;
    savePrefs();
    trail('panel', { name: 'records', tab: prefs.tab });
    return bump();
  },
  book() {
    prefs.tab = 'book';
    savePrefs();
    return openSheet('records');
  },
  autopause(el) {
    prefs.autoPause = el.checked;
    savePrefs();
    return bump();
  },
  preset(el) {
    prefs.preset = el.value;
    savePrefs();
    return bump();
  },
  'keep-kind'(el) {
    prefs.campaign = el.value === 'campaign';
    savePrefs();
    return bump();
  },
  'custom-num'(el) {
    prefs.custom = { ...(prefs.custom || {}), [el.dataset.key]: Math.round(Number(el.value) * 100) / 100 };
    savePrefs();
    return bump();
  },
  'custom-part'(el) {
    prefs.custom = { ...(prefs.custom || {}), [el.dataset.key]: el.checked ? 1 : 0 };
    savePrefs();
    return bump();
  },
  'custom-reset'() {
    prefs.custom = {};
    savePrefs();
    return bump();
  },
  'tut-end'() {
    ui.tutEndAsk = true;
    return showCoach(guideStep(), true);
  },
  'tut-end-no'() {
    ui.tutEndAsk = false;
    return showCoach(guideStep(), true);
  },
  'tut-end-yes'() {
    ui.tutEndAsk = false;
    s.tut = { ...(s.tut || {}), off: true };
    saveGame();
    showCoach(null);
    toast('The tutorial is over, and the keep plays on. Every lesson is in the Menu, under How to play.', 'rite');
    if (s.test) {
      ui.testNote = false;
      openSheet('test');
    }
    return bump();
  },
  'guide-ok'(el, ev, id) {
    markSeen(el.dataset.id);
    // Read: the clock the card stopped runs again (round seven: it stayed stopped, without a word).
    if (ui.coachPaused === el.dataset.id && ui.paused && running() && !ui.title) {
      ui.paused = false;
      trail('play', { by: 'lesson' });
    }
    ui.coachPaused = null;
    return undefined;
  },
  'guide-off'() {
    prefs.guide = false;
    savePrefs();
    showCoach(null);
    return bump();
  },
  'title-open': () => openTitle(),
  'title-continue': () => titleContinue(),
  'title-view': (el) => titleView(el.dataset.view),
  'title-back'() {
    ui.titleFor = null;
    return titleView(null);
  },
  'title-start': (el) => titleStart(el.dataset.what),
  'title-replace'(el) {
    ui.titleAsk = Number(el.dataset.n);
    return bump();
  },
  'title-replace-no'() {
    ui.titleAsk = null;
    return bump();
  },
  'title-replace-yes': (el) => startIn(ui.titleFor || 'new', Number(el.dataset.n)),
  'hall-open'(el, ev, id) {
    ui.hallOpen = ui.hallOpen === el.dataset.id ? null : el.dataset.id;
    return bump();
  },
  'title-tab'(el) {
    ui.menuTab = el.dataset.tab;
    ui.confirmSlot = null;
    ui.slotMsg = '';
    return openSheet('menu');
  },
  'install-help'() {
    ui.installHelp = true;
    bump();
    return requestAnimationFrame(() => document.getElementById('install-help-title')?.scrollIntoView({ block: 'nearest' }));
  },
  install() {
    const p = installPrompt;
    if (!p) return undefined;
    setInstallPrompt(null);
    try {
      Promise.resolve(p.prompt()).catch(() => {});
    } catch {
      // Already shown, or the browser refused it; Chrome offers the event again on a later visit.
    }
    return bump();
  },
  'guide-toggle'(el) {
    prefs.guide = el.checked;
    if (prefs.guide) prefs.guideSeen = {};
    savePrefs();
    return bump();
  },
  new() {
    ui.confirmNew = true;
    return bump();
  },
  'new-no'() {
    ui.confirmNew = false;
    return bump();
  },
  'new-yes': () => newKeep(saves.current),
  copy: () => copyExport(),
  'test-begin'() {
    ui.testNote = false;
    return closeSheet();
  },
  'test-open'() {
    ui.testNote = false;
    ui.testPlayOn = false;
    ui.quiz = null;
    ui.testMsg = '';
    ui.testShow = false;
    return openSheet('test');
  },
  'test-playon'() {
    s.test.playOn = true;
    ui.testPlayOn = false;
    trail('test', { playOn: true });
    saveGame();
    return closeSheet();
  },
  'test-stop'() {
    s.test.playOn = false;
    ui.testPlayOn = false;
    trail('test', { playOn: false });
    saveGame();
    return bump();
  },
  'quiz-start': () => startQuiz(),
  'quiz-tap': (el, ev) => quizTap(el, ev),
  'quiz-count': (el) => quizAnswer(Number(el.dataset.v)),
  'quiz-stop'() {
    ui.quiz = null;
    trail('quiz', { stop: true });
    return bump();
  },
  'test-here': () => beginTest(saves.current, ui.testAsk?.label),
  'test-again'(el) {
    s.test.answers = { ...(s.test.answers || {}), again: s.test.answers?.again === el.dataset.v ? null : el.dataset.v };
    saveGame();
    return bump();
  },
  'test-send'() {
    sendTest();
    return undefined;
  },
  'test-copy': () => copyTest(),
  'w-play': () => watchPlay(),
  'w-speed': (el) => watchSpeed(Number(el.dataset.v)),
  'w-exit': () => stopWatching(),
  'w-prev': () => watchPrev(),
  'w-next': () => watchNext(),
  'w-go'(el) {
    watchSeek(Number(el.dataset.u) - LEAD);
    if (!wide()) closeSheet();
    return bump();
  },
  'w-file'(el, ev, id, name) {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return undefined;
    file.text().then((text) => watchText(text, file.name), () => {
      ui.watchMsg = "That file couldn't be read.";
      bump();
    });
    return undefined;
  },
  'w-paste': () => watchText(document.getElementById('watch-text')?.value || '', null),
  'show-export'() {
    ui.showExport = !ui.showExport;
    return bump();
  },
  'toast-open'(el, ev, id) {
    const t = ui.toasts.find((x) => x.id === Number(id));
    ui.toasts = ui.toasts.filter((x) => x.id !== Number(id));
    ui.toastRev++;
    if (t?.open) openSheet(t.open);
    return undefined;
  },
  'toast-close'(el, ev, id) {
    ui.toasts = ui.toasts.filter((t) => t.id !== Number(id));
    ui.toastRev++;
    return undefined;
  },
};
export function onAct(name, el, ev) {
  return Object.hasOwn(ACTS, name) ? ACTS[name](el, ev, el.dataset.id, name) : undefined;
}
