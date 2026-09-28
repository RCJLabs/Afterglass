import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figure, livingLook, shadeLook, eyesAt, FIG_H, OUTFITS } from '../src/slice/people.js';

// A canvas stand-in that records every pixel drawn, by colour.
function canvas() {
  const px = new Map();
  const c = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px.set(`${x + i},${y + j}`, this.fillStyle);
    },
  };
  return { c, px };
}
const bounds = (px) => {
  const xs = [...px.keys()].map((k) => Number(k.split(',')[0]));
  const ys = [...px.keys()].map((k) => Number(k.split(',')[1]));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

const JOBS = [...Object.keys(OUTFITS).filter((k) => k !== 'none'), null];
const AGES = ['young', 'adult', 'old'];
const POSES = ['stand', 'walk', 'work'];

test('every living figure stands on its row inside its footprint, with a face, whatever its job, age and pose', () => {
  for (const job of JOBS) {
    for (const age of AGES) {
      for (const pose of POSES) {
        for (const name of ['Garrick', 'Hesper', 'Ada', 'Osk', 'Mira', 'Tam']) {
          const look = livingLook({ name, job, age, sick: 0 });
          const { c, px } = canvas();
          figure(c, 50, 40, { ...look, pose, face: 1 }, 0.3);
          const b = bounds(px);
          const what = `${job} ${age} ${pose} ${name}`;
          assert.equal(b.y1, 39, `${what}: feet on the row above y`);
          assert.ok(b.x0 >= 47 && b.x1 <= 54, `${what}: inside x-3..x+3 (and one for a prop): ${b.x0}..${b.x1}`);
          assert.ok(b.y0 >= 40 - FIG_H[look.age] - (OUTFITS[job]?.prop === 'spear' ? 4 : 3), `${what}: nothing far above the head: ${b.y0}`);
          assert.ok([...px.values()].includes(look.skin), `${what}: a face`);
          assert.ok([...px.values()].includes('#181425'), `${what}: an eye`);
        }
      }
    }
  }
});

test('facing left is facing right mirrored', () => {
  for (const job of JOBS) {
    const look = livingLook({ name: 'Ada', job, age: 'adult', sick: 0 });
    const r = canvas();
    const l = canvas();
    figure(r.c, 50, 40, { ...look, pose: 'stand', face: 1 }, 0);
    figure(l.c, 50, 40, { ...look, pose: 'stand', face: -1 }, 0);
    const mirrored = new Map([...r.px].map(([k, v]) => {
      const [x, y] = k.split(',').map(Number);
      return [`${100 - x},${y}`, v];
    }));
    assert.deepEqual(l.px, mirrored, `${job}`);
  }
});

test('a shade is its silhouette: no skin or clothes, no feet, eyes where its face is', () => {
  for (const kind of ['loyal', 'serene', 'pale', 'stranger']) {
    const look = shadeLook({ kind, age: 'adult' });
    const { c, px } = canvas();
    figure(c, 50, 40, { ...look, pose: 'stand', face: 1 }, 0);
    const colours = new Set(px.values());
    assert.deepEqual([...colours].sort(), [look.far, look.silhouette].sort(), `${kind}: only its two darks`);
    const bottom = [...px.keys()].filter((k) => k.endsWith(',39')).length;
    assert.ok(bottom <= 2, `${kind}: the bottom row is a thin wisp, not two shoes`);
    for (const e of eyesAt(50, 40, { ...look, face: 1 })) assert.ok(px.has(`${e.x},${e.y}`), `${kind}: its eyes sit on its head`);
  }
});
