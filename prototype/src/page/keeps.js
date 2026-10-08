// Acting on the keep, and the keeps themselves: playing, starting, the Hall, export and import.

import { BUILD } from '../build.js';
import { drawCard, cardFonts } from '../slice/card.js';
import { TUNING, PRESETS, CHAPTERS } from '../slice/data.js';
import { saveHall, noteKeep, lastKeep, heirsOf, againstOf, keepId, slotKeepId } from '../slice/hall.js';
import { recapOf } from '../slice/recap.js';
import { slotKey, loadSlot, useSlot, deleteSlot, keepFromFile } from '../slice/saves.js';
import { newSeason, act, retune, playerTuning, keepDefaults, chapterOf, chapterAgain } from '../slice/sim.js';
import { store, prefs, savePrefs, sfx, listen, saves, hall, retuned, loadGame, saveWarned, dirty, crashed, saveGame, s, ui, bump, running, toast, setRetuned, setSaveWarned, setDirty, setS } from './state.js';
import { esc, plural, phaseLabel } from './hud.js';
import { mult } from './dusk.js';
import { exportJSON, SLOT_NUMS, startTutorial, startDaily } from './records.js';
import { trail } from './playtest.js';
import { watchPlay, watchSpeed } from './watch.js';
import { wide, view } from './stage.js';
import { closeTitle, titleContinue, openSheet, closeSheet } from './screen.js';
import { takeAlerts, acc, seenPhase, seenPhaseWas, setAcc, setSeenPhase, setSeenPhaseWas } from './clock.js';

/* ---------------------------------------------------------------- the keeps */

export function game(a) {
  if (ui.watch) {
    toast('Watching a session: nothing in it can be changed.', 'bad');
    return false;
  }
  const r = act(s, a);
  setDirty(true);
  if (!r.ok) {
    trail('refused', { type: a.type, error: r.error });
    toast(r.error, 'bad');
    sfx('nope');
  }
  takeAlerts(false);
  bump();
  return r.ok;
}
export function togglePlay() {
  if (ui.watch) return watchPlay();
  if (!running()) return;
  ui.paused = !ui.paused;
  trail(ui.paused ? 'pause' : 'play', { by: 'you' });
  ui.resume = false; // played or paused by hand: closing the Menu leaves it so
  if (ui.paused) {
    ui.rush = false;
    ui.skip = null;
  }
  bump();
}
export function setSpeed(v) {
  if (ui.watch) return watchSpeed(v);
  trail('speed', { v });
  prefs.speed = v;
  ui.skip = null;
  savePrefs();
  bump();
}
export function copyExport() {
  const done = (msg, show) => {
    ui.copied = msg;
    if (show) ui.showExport = true;
    bump();
  };
  const blocked = 'Copying was blocked here. The export is shown below: select it all and copy.';
  try {
    navigator.clipboard.writeText(exportJSON()).then(() => done('Copied.', false), () => done(blocked, true));
  } catch {
    done(blocked, true);
  }
}
// The keeps in the slots. Whatever is being played is saved before another is put in play.
export const waiting = () => s.phase === 'dawn' || s.phase === 'end' || s.phase === 'over' || (s.phase === 'dusk' && s.dusk.step === 'crypt');
export function freshKeep(g) {
  ui.reading.clear();
  setS(listen(g));
  setSeenPhase(s.phase);
  setSeenPhaseWas(s.phase);
  setAcc(0);
  Object.assign(ui, { paused: true, resume: false, confirmNew: false, selected: null, person: null, hover: null, tool: 'move', showExport: false, copied: '', rush: false, skip: null, cross: null });
  view.panX = 0;
  view.panY = 0;
  view.snap = true;
}
// A lost campaign's chapter begun again from its first dawn (round six): the keep rebuilt by replaying what
// came before it.
export function chapterAgainNow() {
  const g = chapterAgain(s);
  if (!g) return toast("This chapter can't be begun again: the keep was begun on an older build, and its record no longer replays.", 'bad');
  g.alerts = []; // the replay's news is old news, as for a keep loaded
  freshKeep(g);
  saveGame();
  closeSheet();
  if (waiting()) openSheet('phase', 'game');
  toast(`${CHAPTERS[chapterOf(s)].name}, begun again from ${chapterOf(s) === 1 ? 'the keep\'s first morning' : 'its first dawn'}.`, 'rite');
  return bump();
}
// The Hall of Keepers (round seven, phase 16): a keep is written in when a season of it ends, when it ends, and
// when its slot goes to another; a deed done for the first time is told.
export const SLOT_IDS = () => SLOT_NUMS().map((n) => (n === saves.current ? keepId(s) : slotKeepId(saves.slots[n]))).filter(Boolean);
export function noteHall(g = s, left = false) {
  if (ui.watch || crashed) return null;
  const { entry, deeds } = noteKeep(hall, g, Date.now(), { left });
  if (!entry) return null;
  saveHall(store, hall, SLOT_IDS());
  for (const D of deeds) toast(`A deed: ${D.name}. ${D.text}`, 'rite');
  return entry;
}
// A season's end: the keep written in, and a small copy of its card drawn for the Hall a moment later.
export function noteSeason() {
  const k = noteHall();
  const r = k?.card;
  if (!r) return;
  const g = s;
  setTimeout(async () => {
    try {
      const full = recapOf(g, r.season, againstOf(hall, g, r.season));
      if (!full || g !== s) return;
      await cardFonts();
      const cv = document.createElement('canvas');
      drawCard(cv, g, full);
      const small = document.createElement('canvas');
      small.width = 360;
      small.height = 450;
      const c = small.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(cv, 0, 0, small.width, small.height);
      const now = hall.keeps.find((x) => x.id === k.id);
      if (!now?.card || now.card.season !== r.season) return;
      now.card.img = small.toDataURL('image/jpeg', 0.8);
      saveHall(store, hall, SLOT_IDS());
    } catch {
      // A card the browser can't draw is only a card: the Hall keeps its words.
    }
  }, 800);
}
// A slot about to hold another keep (or none): the keep in it goes into the Hall as left, unless it is that keep.
export function leaveSlot(n, next = null) {
  try {
    const g = n === saves.current ? s : saves.slots[n] ? loadSlot(store, n) : null;
    if (!g || (next && keepId(g) === keepId(next))) return null;
    return noteHall(g, true);
  } catch {
    return null; // a keep that can't be read can't be remembered, but it never stops a new one
  }
}
// A new keep's first dead: from the last keep finished or left, leaving out keeps still in a slot (slot n's is
// being replaced, so it counts as left).
export function heirsNow(n) {
  const here = n === saves.current ? keepId(s) : slotKeepId(saves.slots[n]);
  return heirsOf(lastKeep(hall, SLOT_IDS().filter((id) => id !== here)));
}
export function playKeep(n, g, lead) {
  if (ui.watch) {
    // Never let the session being watched stand in for a keep: the one in play comes back first.
    ui.watch = null;
    freshKeep(loadGame(saves.current) || newSeason());
  }
  closeTitle();
  if (n !== saves.current) saveGame();
  useSlot(store, saves, n);
  freshKeep(g);
  setSaveWarned(false);
  saveGame();
  closeSheet();
  if (waiting()) openSheet('phase', 'game');
  toast(`${lead} Season ${s.season}: ${phaseLabel()}.`, 'rite');
  if (retuned) toast(`This version changed ${retuned} of the keep's numbers; yours from Settings are kept.`, 'rite');
  setRetuned(0);
  return bump();
}
export function playSlot(n) {
  if (n === saves.current) {
    closeTitle();
    closeSheet();
    return titleContinue();
  }
  const g = loadGame(n);
  if (g) return playKeep(n, g, `Keep ${n}.`);
  ui.slotMsg = `Keep ${n} couldn't be read.`;
  return bump();
}
export function newKeep(n) {
  leaveSlot(n);
  setRetuned(0);
  const p = presetNow();
  const heirs = heirsNow(n);
  const theirs = heirs.length ? ` ${heirs.map((x) => x.name).join(' and ')}, of ${heirs[0].keep}, ${heirs.length === 1 ? 'is' : 'are'} in its glass.` : '';
  return playKeep(n, keepWith(p, heirs), `Keep ${n}: a new ${prefs.campaign ? 'campaign' : 'keep'}${p === 'standard' ? '' : `, ${PRESETS[p].name.toLowerCase()}`}.${theirs}`);
}
// Difficulty (round five): the preset chosen for a new keep, and a new keep made on it, with the player's own
// numbers from the keep before where the preset has none. The keep keeps them as its own defaults.
const presetNow = () => (PRESETS[prefs.preset] ? prefs.preset : 'standard');
function keepWith(p, heirs = []) {
  const custom = customNow(p);
  const defaults = { ...playerTuning(s), ...PRESETS[p].tuning, ...custom, campaign: prefs.campaign ? 1 : 0 };
  // Its first dead from the player's last keep (round seven, phase 16): in its rules, so it replays, but not in
  // its defaults, which the next keep takes from it.
  const k = newSeason(Date.now() >>> 0, heirs.length ? { ...defaults, firstDead: heirs } : defaults);
  k.defaults = defaults;
  if (p !== 'standard') k.preset = p;
  if (Object.keys(custom).length) k.custom = true;
  return k;
}
// Custom rules (round seven, phase 2), beside the difficulty: a few of its numbers, and which parts of the game
// are in it. A new keep keeps them as its own, as it keeps its preset's; the tutorial and today's keep don't take them.
export const CUSTOM_NUMBERS = [
  ['cracksMax', 'Cracks that break the Veil', 2, 8, 1, (v) => String(v)],
  ['creepersPerNight', 'Creepers added each night of a season', 1, 3.4, 0.2, (v) => mult(v)],
  ['raidFightStrength', "The Host's strength", 0.6, 1.4, 0.05, (v) => `×${mult(v)}`],
  ['startFood', 'Food to start with', 6, 30, 2, (v) => String(v)],
  ['startCandles', 'Candles to start with', 4, 20, 2, (v) => String(v)],
  ['yearHardness', 'Each year starts harder than the last by', 1, 1.2, 0.02, (v) => `×${mult(v)}`],
];
const CUSTOM_PARTS = [
  ['visitors', 'Visitors at the gate'],
  ['fire', 'Fire by day'],
  ['weather', 'Weather: rain, fog and the Drowned'],
  ['omens', 'Omens at dusk'],
  ['errands', 'Errands in the dark: echoes, relics and sleepwalkers'],
  ['eclipse', "Midsummer's eclipse"],
  ['generations', 'Generations: growing old, couples and children'],
  ['church', "The Church's embargo, Inquisition and crusade"],
  ['deep', 'Down into the Deep'],
];
// Help, on or off by the difficulty's rules (round seven, phase 7): auto-relight is on in Gentle.
const CUSTOM_HELPS = [['autoRelight', 'A candle that burns down at the line or a post is lit again from the store']];
const presetValue = (p, k) => PRESETS[p].tuning[k] ?? TUNING[k];
// What the player has changed from the difficulty's rules, as the new keep's own numbers.
function customNow(p = presetNow()) {
  const c = prefs.custom || {};
  const out = {};
  for (const [k] of CUSTOM_NUMBERS) {
    if (k === 'yearHardness' && prefs.campaign) continue; // a campaign's years harden by its own rate
    if (typeof c[k] === 'number' && Math.abs(c[k] - presetValue(p, k)) > 1e-9) out[k] = c[k];
  }
  for (const [k] of CUSTOM_PARTS) if (c[k] === 0) out[k] = 0;
  for (const [k] of CUSTOM_HELPS) if (typeof c[k] === 'number' && c[k] !== presetValue(p, k)) out[k] = c[k];
  return out;
}
export function customPicker(where) {
  const p = presetNow();
  const c = prefs.custom || {};
  const n = Object.keys(customNow(p)).length;
  const nums = CUSTOM_NUMBERS.filter(([k]) => k !== 'yearHardness' || !prefs.campaign).map(([k, label, min, max, step, fmt]) => {
    const v = typeof c[k] === 'number' ? c[k] : presetValue(p, k);
    return `<label class="slider custom-num" for="custom-${where}-${k}"><span>${esc(label)}: <b id="custom-${where}-${k}-v">${esc(fmt(v))}</b></span><input type="range" id="custom-${where}-${k}" data-act="custom-num" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  }).join('');
  const parts = CUSTOM_PARTS.map(([k, label]) => `<label class="row" for="custom-${where}-${k}"><input type="checkbox" id="custom-${where}-${k}" data-act="custom-part" data-key="${k}"${c[k] === 0 ? '' : ' checked'}><span>${esc(label)}</span></label>`).join('');
  const helps = CUSTOM_HELPS.map(([k, label]) => `<label class="row" for="custom-${where}-${k}"><input type="checkbox" id="custom-${where}-${k}" data-act="custom-part" data-key="${k}"${(typeof c[k] === 'number' ? c[k] : presetValue(p, k)) ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('');
  return `<details class="custom" id="custom-${where}" data-keep="custom-${where}"${ui.open[`custom-${where}`] ? ' open' : ''}><summary>Custom rules${n ? `: ${plural(n, 'change')}` : ''}</summary>
    <p class="hint">${esc(PRESETS[p].name)}'s rules, changed as you like. A new keep keeps them.</p>
    ${nums}
    <fieldset class="custom-parts"><legend>In the game</legend>${parts}</fieldset>
    <fieldset class="custom-parts"><legend>Help</legend>${helps}</fieldset>
    <div class="row"><button class="btn sm" id="custom-${where}-reset" data-act="custom-reset"${n ? '' : ' disabled'}>Back to ${esc(PRESETS[p].name)}'s rules</button></div>
  </details>`;
}
// A campaign (round six) or the open year, for a new keep.
export function campaignPicker(where) {
  const radio = (v, label) => `<input type="radio" class="visually-hidden" name="kind-${where}" id="kind-${where}-${v}" data-act="keep-kind" value="${v}"${(v === 'campaign') === !!prefs.campaign ? ' checked' : ''}><label class="btn sm" for="kind-${where}-${v}">${label}</label>`;
  return `<fieldset class="presets" id="kinds-${where}"><legend>What kind of keep${where === 'saves' ? ', for a new one' : ''}</legend>
      <div class="seg">${radio('open', 'The open year')}${radio('campaign', 'Campaign')}</div>
      <p class="hint">${prefs.campaign ? 'Five years, five chapters: each brings a new pressure and a goal, and closes on a choice; the fifth ends in one of three endings. The Host\'s sieges, the Church\'s wrath and the Hollow\'s growth come a year at a time, and a lost chapter can be begun again.' : 'Every year the same, a little harder, and a choice at each year\'s end: keep the watch, take your place in the glass, or seal the Veil.'}</p></fieldset>`;
}
export function presetPicker(where) {
  const cur = presetNow();
  return `<fieldset class="presets" id="presets-${where}"><legend>Difficulty${where === 'saves' ? ' for a new keep' : ''}</legend>
      <div class="seg">${Object.entries(PRESETS).map(([k, P]) => `<input type="radio" class="visually-hidden" name="preset-${where}" id="preset-${where}-${k}" data-act="preset" value="${k}"${cur === k ? ' checked' : ''}><label class="btn sm" for="preset-${where}-${k}">${P.name}</label>`).join('')}</div>
      <p class="hint">${esc(PRESETS[cur].text)}</p></fieldset>`;
}
// A keep nothing has been done in yet, which a new one can take the place of.
export const untouched = () => !s.actions.length && s.season === 1 && s.day === 1 && s.phase === 'day' && s.t === 0 && !s.daily && !s.tuning.tutorial;
export function confirmSlot(n) {
  const ask = ui.confirmSlot;
  ui.confirmSlot = null;
  if (!ask || ask.n !== n) return bump();
  if (ask.kind === 'over') return newKeep(n);
  if (ask.kind === 'daily') return startDaily(n);
  if (ask.kind === 'tutorial') return startTutorial(n);
  if (ask.kind === 'import') {
    leaveSlot(n, ask.g);
    setRetuned(retune(ask.g, keepDefaults(ask.g)));
    return playKeep(n, ask.g, `Keep ${n}, from ${ask.name}.`);
  }
  if (ask.kind !== 'delete' || n === saves.current) return bump(); // the keep being played is never deleted
  const kept = leaveSlot(n);
  deleteSlot(store, saves, n);
  toast(`Keep ${n} is deleted.${kept ? ' Its Book and its card are kept in the Hall of Keepers.' : ''}`);
  return bump();
}
// A file from the page: the browser's download of it.
export function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
// A keep as a file: the save itself, which Load a file (here or on another device) takes back exactly.
export function exportSlot(n) {
  const g = n === saves.current ? { ...s, alerts: [], cues: undefined, build: BUILD } : store.get(slotKey(n));
  if (!g) return undefined;
  const name = `afterglass-keep-${n}-season-${g.season}-day-${g.day}.json`;
  saveFile(new Blob([JSON.stringify(g)], { type: 'application/json' }), name);
  toast(`Keep ${n} is saved as ${name}.`);
  return undefined;
}
export function importSlot(n, el) {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return undefined;
  ui.slotMsg = '';
  file.text().then(
    (text) => {
      const r = keepFromFile(text);
      if (r.error) {
        ui.slotMsg = r.error;
        return bump();
      }
      if (n === saves.current || saves.slots[n]) {
        ui.confirmSlot = { n, kind: 'import', g: r.s, name: file.name };
        return bump();
      }
      setRetuned(retune(r.s, keepDefaults(r.s)));
      return playKeep(n, r.s, `Keep ${n}, from ${file.name}.`);
    },
    () => {
      ui.slotMsg = "That file couldn't be read.";
      bump();
    },
  );
  return undefined;
}

// On a phone the panels cover the castle: close them when the next tap belongs on the castle.
export const toStage = () => {
  if (!wide()) closeSheet();
};
