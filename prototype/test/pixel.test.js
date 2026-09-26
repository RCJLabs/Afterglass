import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UMBRA, hex2rgb, luma, tainIndex, applyTain, band, applyLight, NIGHT } from '../src/px/lut.js';
import {
  WORLD, VIEW_H, ROOMS, MODES, QUESTION_TYPES, room, feet, roomAt, twinY, toView, fromView, lightAt, shadeLight, LIGHT,
  shadeBox, creeperBox, makeQuestion, isRight, makeQuiz, summarize, SHOWCASE,
} from '../src/px/scene.js';
import { P } from '../src/px/kit.js';

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

test('the palette lookup sends every day colour onto the Tain ramp, darker stays darker', () => {
  const cols = Object.values(P).map(hex2rgb);
  for (const c of cols) assert.ok(tainIndex(...c) >= 0 && tainIndex(...c) < UMBRA.length);
  assert.equal(tainIndex(...hex2rgb(P.amber)), UMBRA.length - 1, 'warm light becomes the brightest violet');
  assert.equal(tainIndex(...hex2rgb(P.yellow)), UMBRA.length - 1);
  const cool = cols.filter(([r, g, b]) => !(r > 200 && g > 150 && b < 120)).sort((a, b) => luma(...a) - luma(...b));
  for (let i = 1; i < cool.length; i++) assert.ok(tainIndex(...cool[i]) >= tainIndex(...cool[i - 1]), 'monotonic in brightness');
  const buf = new Uint8ClampedArray([255, 255, 255, 255, 10, 20, 30, 0]);
  applyTain(buf);
  assert.deepEqual([...buf.slice(0, 3)], hex2rgb(UMBRA[6]));
  assert.deepEqual([...buf.slice(4)], [10, 20, 30, 0], 'transparent pixels untouched');
});

test('candlelight dithers into four bands and darkens toward the night', () => {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      assert.equal(band(1, x, y), 3);
      assert.equal(band(0, x, y), 0);
    }
  }
  const mid = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) mid.add(band(0.5, x, y));
  assert.deepEqual([...mid].sort(), [1, 2], 'a half-lit wall mixes two bands');
  const buf = new Uint8ClampedArray([200, 200, 200, 255]);
  applyLight(buf, 1, 1, () => 0);
  assert.deepEqual([...buf.slice(0, 3)], [200 * 0.2 + NIGHT[0] * 0.8, 200 * 0.2 + NIGHT[1] * 0.8, 200 * 0.2 + NIGHT[2] * 0.8].map(Math.round));
});

test('four room pairs fit the keep above the Veil without overlapping', () => {
  assert.equal(ROOMS.length, 4);
  for (const r of ROOMS) {
    assert.ok(r.x >= 0 && r.x + r.w <= WORLD.W && r.y >= 0 && r.y + r.h <= WORLD.VEIL);
    for (const o of ROOMS) if (o !== r) assert.ok(r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y);
  }
  assert.equal(twinY(WORLD.VEIL - 1), WORLD.VEIL, 'the row above the Veil reflects to the row below it');
  assert.equal(twinY(0), 2 * WORLD.VEIL - 1);
});

test('both night cameras invert cleanly, and one is the other turned over', () => {
  for (const mode of MODES) {
    for (const [x, y] of [[0, 0], [30, 50], [111, 91]]) assert.deepEqual(fromView(mode, toView(mode, x, y).x, toView(mode, x, y).y), { x, y });
  }
  for (const y of [0, 10, 46, 91]) assert.equal(toView('flipped', 5, y).y, VIEW_H - 1 - toView('reflection', 5, y).y);
  assert.equal(toView('reflection', 0, WORLD.VEIL - 1).y, 8, 'reflection: the Tain starts right under the Veil');
  const chapel = room('chapel');
  const hearth = room('hearth');
  assert.ok(toView('reflection', 0, feet(chapel)).y > toView('reflection', 0, feet(hearth)).y, 'reflection: the upper rooms hang lowest');
  assert.ok(toView('flipped', 0, feet(chapel)).y < toView('flipped', 0, feet(hearth)).y, 'flipped: upright again');
});

test('a candle lights its own room and walls stop it', () => {
  const scene = { candles: [{ room: 'chapel', x: 50 }], shades: [], creepers: [] };
  const f = feet(room('chapel')) - 5;
  assert.equal(lightAt(scene, 50, f), 1);
  assert.ok(lightAt(scene, 44, f) > 0.6);
  assert.equal(lightAt(scene, 60, f), LIGHT.ambient, 'the Granary next door stays dark');
  assert.equal(roomAt(56, f), null, 'the wall between is no room');
});

test('every quiz question has exactly one right answer, in both cameras', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const type of QUESTION_TYPES) {
      const q = makeQuestion(seed * 7919, type);
      const { scene } = q;
      const lights = scene.shades.map((s) => shadeLight(scene, s));
      if (type === 'dark' || type === 'caught') {
        assert.equal(lights.filter((L) => L <= LIGHT.dark).length, 1, `${type} seed ${seed}: one shade in the dark`);
        assert.equal(lights.filter((L) => L > LIGHT.dark && L < LIGHT.lit).length, 0, 'no shade in between');
      } else {
        assert.ok(lights.every((L) => L >= LIGHT.lit), `${type} seed ${seed}: every shade lit`);
      }
      if (type === 'caught') assert.equal(scene.creepers[0].grab, q.answer.shade);
      else if (type === 'creeper') assert.equal(scene.creepers.length, 1);
      else assert.equal(scene.creepers.length, 0);
      if (type === 'unlit') {
        const dark = ROOMS.filter((r) => !scene.candles.some((c) => c.room === r.id));
        assert.deepEqual(dark.map((r) => r.id), [q.answer.room]);
        assert.ok(!scene.shades.some((s) => s.room === q.answer.room));
      }
      if (type === 'count') assert.equal(scene.shades.filter((s) => s.room === 'chapel').length, q.answer.count);
      for (const mode of MODES) {
        const target = q.answer.shade ? shadeBox(scene.shades.find((s) => s.id === q.answer.shade))
          : q.answer.creeper ? creeperBox(scene.creepers[0])
          : q.answer.room ? room(q.answer.room) : null;
        if (!target) continue;
        const c = center(target);
        const v = toView(mode, c.x, c.y);
        assert.ok(isRight(q, mode, v), `${type} ${mode}: tapping the target counts`);
        for (const s of scene.shades) {
          if (s.id === q.answer.shade || q.answer.room) continue;
          const o = center(shadeBox(s));
          assert.ok(!isRight(q, mode, toView(mode, o.x, o.y)), `${type} ${mode}: tapping another shade does not`);
        }
        if (q.answer.room) {
          const other = ROOMS.find((r) => r.id !== q.answer.room);
          const o = toView(mode, other.x + 10, other.y + 10);
          assert.ok(!isRight(q, mode, o));
        }
      }
    }
  }
});

test('a quiz asks each question type once in each camera, in a seeded order', () => {
  const a = makeQuiz(42);
  assert.equal(a.length, QUESTION_TYPES.length * MODES.length);
  for (const type of QUESTION_TYPES) for (const mode of MODES) assert.equal(a.filter((p) => p.type === type && p.mode === mode).length, 1);
  assert.deepEqual(makeQuiz(42), a);
  assert.notDeepEqual(makeQuiz(43).map((p) => p.type + p.mode), a.map((p) => p.type + p.mode));
  const s = summarize([
    { type: 'dark', mode: 'reflection', right: true, ms: 1000 },
    { type: 'room', mode: 'reflection', right: false, ms: 3000 },
    { type: 'dark', mode: 'flipped', right: true, ms: 800 },
  ]);
  assert.deepEqual(s.byMode.reflection, { n: 2, right: 1, medianMs: 2000 });
  assert.deepEqual(s.byMode.flipped, { n: 1, right: 1, medianMs: 800 });
  assert.equal(s.byType.room.flipped, null);
});

test('the showcase night keeps its promises: one dark room, everyone at a post', () => {
  const lit = ROOMS.filter((r) => SHOWCASE.candles.some((c) => c.room === r.id)).map((r) => r.id);
  assert.deepEqual(lit.sort(), ['chapel', 'crypt', 'hearth']);
  for (const s of SHOWCASE.shades) assert.ok(shadeLight(SHOWCASE, s) >= LIGHT.lit, `${s.name} stands in light`);
});
