import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newSeason, act } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { SOUNDS, BEDS, createSound } from '../src/slice/sound.js';
import { openIndex, saveSlot, slotKey } from '../src/slice/saves.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// Every name the sim can cue (the string literals in its cue() calls) and the page's own sfx() calls.
const simCues = [...src('../src/slice/sim.js').matchAll(/\bcue\(s, ([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]));
const pageSrc = readdirSync(new URL('../src/page/', import.meta.url)).map((f) => src(`../src/page/${f}`)).join('\n');
const pageCues = [...pageSrc.matchAll(/\bsfx\('([a-z-]+)'/g)].map((m) => m[1]);

function play(seed, listen) {
  const s = newSeason(seed);
  if (listen) s.cues = [];
  const heard = [];
  for (let g = 0; g < 1e6 && s.phase !== 'over' && s.phase !== 'end'; g++) {
    autoStep(s);
    if (listen) heard.push(...s.cues.splice(0));
  }
  return { s, heard };
}

test('every cue the sim or the page can raise has a sound, a label and a sane vibration', () => {
  assert.ok(simCues.length >= 40, `found ${simCues.length} cues in the sim`);
  for (const name of new Set([...simCues, ...pageCues])) {
    const S = SOUNDS[name];
    assert.ok(S, `no sound for the cue '${name}'`);
    assert.ok(S.label && typeof S.play === 'function', `'${name}' has no label or no sound`);
    assert.ok(['alarm', 'event', 'small'].includes(S.group), `'${name}' is in no group`);
    assert.ok(Number.isFinite(S.gain) && S.gain > 0 && S.gain <= 3, `'${name}' has a bad trim ${S.gain}`);
    if (S.haptic) {
      assert.ok(S.haptic.every((ms) => Number.isInteger(ms) && ms > 0), `'${name}' has a bad vibration`);
      assert.ok(S.haptic.reduce((a, b) => a + b, 0) <= 1000, `'${name}' vibrates for over a second`);
    }
  }
  assert.deepEqual(Object.keys(BEDS).sort(), ['day', 'dusk', 'night', 'rite']);
});

test('listening for cues changes nothing in the game', () => {
  for (const seed of [3, 4]) {
    const quiet = play(seed, false).s;
    const { s: heard, heard: cues } = play(seed, true);
    assert.ok(cues.length > 50, `seed ${seed}: only ${cues.length} cues`);
    assert.equal(JSON.stringify({ ...heard, cues: undefined }), JSON.stringify(quiet));
  }
});

test('a season sounds its phases, candles, posts, the Unlit falling and its raids', () => {
  const names = new Set();
  for (const seed of [5, 6, 7]) for (const c of play(seed, true).heard) names.add(c.name);
  for (const want of ['day', 'dusk', 'night', 'dawn', 'end', 'light', 'post', 'foe-down', 'snuff', 'horn', 'build']) assert.ok(names.has(want), `no '${want}' in three seasons`);
  assert.ok(names.has('held') || names.has('breached'), 'no raid outcome');
  // Night cues carry where they happened, for panning.
  const { heard } = play(8, true);
  for (const c of heard.filter((x) => x.name === 'light' || x.name === 'foe-down')) assert.ok(Number.isFinite(c.x) && Number.isInteger(c.f), `${c.name} without a place`);
});

test('an undrained channel stops at 64 cues', () => {
  const s = newSeason(9);
  s.cues = [];
  for (let i = 0; i < 100; i++) act(s, { type: 'tune', key: 'sickChance', value: 0 }); // no cue
  assert.equal(s.cues.length, 0);
  for (let g = 0; g < 1e5 && s.phase !== 'end' && s.phase !== 'over'; g++) autoStep(s);
  assert.equal(s.cues.length, 64);
});

test('saves never carry cues', () => {
  const m = new Map();
  const store = { get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => (m.set(k, JSON.stringify(v)), true), remove: (k) => m.delete(k) };
  const index = openIndex(store, 0);
  const { s } = play(10, true);
  s.cues.push({ name: 'crack' });
  assert.ok(saveSlot(store, index, 1, s, 1));
  assert.ok(!m.get(slotKey(1)).includes('"cues"'));
});

test('with no Web Audio (Node, an old browser) the engine stays silent and never throws', () => {
  const sound = createSound({ AudioContext: undefined });
  sound.unlock();
  sound.set({ on: true, fx: 1, amb: 1 });
  assert.equal(sound.play('horn'), false);
  assert.equal(sound.mood({ bed: 'night', hollow: 0.5, danger: 1 }), undefined);
  assert.equal(sound.state, 'none');
});
