// The glass test (round seven, phase 5): each scene is what its question says, and a tap is judged by the
// figure nearest it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quizKeep, quizPlan, quizScene, litIn, tappedIn, isRight, centre, stillToKeep, quizSummary, QUIZ_TYPES, QUIZ_CAMS } from '../src/slice/quiz.js';
import { geo } from '../src/slice/geo.js';

const base = quizKeep();
const G = geo(base);

test('the plan asks each kind once in each camera, in an order of its own per seed', () => {
  const a = quizPlan(1);
  assert.equal(a.length, 8);
  for (const type of QUIZ_TYPES) for (const cam of QUIZ_CAMS) assert.equal(a.filter((q) => q.type === type && q.cam === cam).length, 1);
  assert.deepEqual(quizPlan(1), a);
  assert.notDeepEqual(quizPlan(2).map((q) => q.type + q.cam), a.map((q) => q.type + q.cam));
});

test('every scene is what its question says, over 400 scenes', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (const q of quizPlan(seed)) {
      const sc = quizScene(base, q);
      const { shades, foes } = sc.frame;
      for (const u of [...shades, ...foes]) {
        const room = Object.values(G.rooms).find((m) => m.f === u.f && u.x >= m.x0 && u.x <= m.x1);
        assert.ok(room, `${q.type} ${seed}: ${u.id} stands in a room`);
      }
      const lit = shades.filter((d) => litIn(base, sc, d));
      if (q.type === 'creeper') {
        assert.equal(lit.length, shades.length, 'every shade lit');
        assert.ok(foes.length >= 1 && foes.length <= 2);
      } else if (q.type === 'dark') {
        assert.equal(shades.length - lit.length, 1, 'one shade in the dark');
        assert.ok(!litIn(base, sc, shades.find((d) => d.id === sc.answer[0])));
      } else if (q.type === 'caught') {
        assert.equal(shades.filter((d) => d.grabbedBy).length, 1, 'one shade caught');
        const d = shades.find((x) => x.id === sc.answer[0]);
        assert.equal(foes.find((u) => u.id === d.grabbedBy).grab, d.id);
      } else {
        assert.equal(lit.length, shades.length);
        assert.ok(sc.answer >= 1 && sc.answer <= 4);
        assert.equal(sc.answer, foes.length);
      }
      // A tap on each figure's middle finds it, and is right exactly when that figure is the answer.
      if (q.type !== 'count') {
        for (const u of [...shades.map((d) => ({ ...d, shade: true })), ...foes]) {
          assert.equal(tappedIn(base, sc, centre(G, u)), u.id, `${q.type} ${seed}: a tap on ${u.id}`);
          assert.equal(isRight(sc, u.id), sc.answer.includes(u.id));
        }
        assert.equal(tappedIn(base, sc, { x: -50, y: -50 }), null);
      }
    }
  }
});

test('a spot on the still maps back to the keep in either camera', () => {
  const sc = quizScene(base, { type: 'dark', cam: 'flipped', seed: 7 });
  const top = G.floors[0].y - 2;
  assert.deepEqual(stillToKeep(base, sc, 10, 5, 70), { x: 10, y: top + 5 });
  assert.deepEqual(stillToKeep(base, { ...sc, cam: 'reflection' }, 10, 5, 70), { x: 10, y: top + 64 });
});

test('the summary counts right answers and times per camera', () => {
  const s = quizSummary([
    { type: 'dark', cam: 'reflection', right: true, ms: 3000 },
    { type: 'dark', cam: 'flipped', right: false, ms: 5000 },
    { type: 'count', cam: 'reflection', right: false, ms: 1000 },
  ]);
  assert.deepEqual(s.byCam.reflection, { n: 2, right: 1, ms: 2000 });
  assert.deepEqual(s.byCam.flipped, { n: 1, right: 0, ms: 5000 });
  assert.deepEqual(s.byType.dark.flipped, { right: 0, n: 1, ms: 5000 });
  assert.equal(s.byType.creeper.reflection, null);
});
