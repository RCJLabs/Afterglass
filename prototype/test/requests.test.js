import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, asksNow, ritePreview, defense, gateGuard, upgrade, replay } from '../src/slice/sim.js';
import { REQUESTS } from '../src/slice/data.js';

// Quiet days and empty nights: the rite is what's tested.
// moreOmens 0: no drowned bell to bring the Drowned on an empty night.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, fire: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, creepersBase: 0, creepersPerNight: 0, mawFrom: 99, dreadMax: 99, moreOmens: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Runs days and nights, keeping everyone at each rite, to the dawn after the given night.
function toDawn(s, night) {
  for (let i = 0; i < 1e6 && !(s.phase === 'dawn' && s.day === night); i++) {
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
    } else if (s.phase === 'dawn') ok(s, { type: 'beginDay' });
    else step(s);
  }
  assert.equal(s.phase, 'dawn');
}

// Hesper, Serene, asks to go only once her memory is failing.
const failing = (s) => {
  s.shades.find((d) => d.name === 'Hesper').memory = 30;
};

test('from its second night a shade asks one thing at the rite, by its kind; a Serene one only as its memory fails', () => {
  const s = newSeason(3, quiet);
  toDawn(s, 1);
  assert.deepEqual(s.rite.asks, {}, 'nobody asks after one night');
  const t = JSON.parse(JSON.stringify(s));
  ok(s, { type: 'beginDay' });
  toDawn(s, 2);
  assert.equal(s.rite.asks[s.shades.find((d) => d.name === 'Hesper').id], undefined, 'Hesper still remembers');
  failing(t);
  ok(t, { type: 'beginDay' });
  toDawn(t, 2);
  assert.equal(t.rite.asks[t.shades.find((d) => d.name === 'Hesper').id], REQUESTS.serene.kind);
  ok(t, { type: 'beginDay' });
  const garrick = s.shades.find((d) => d.name === 'Garrick');
  assert.equal(s.rite.asks[garrick.id], REQUESTS.loyal.kind);
  assert.match(act(s, { type: 'request', id: 'nobody', grant: true }).error, /asks nothing/);
});

test('granted: a Serene shade is let go, a Loyal one stands the gate by day and tires at dusk; neither asks again', () => {
  const s = newSeason(3, quiet);
  toDawn(s, 1);
  failing(s);
  ok(s, { type: 'beginDay' });
  toDawn(s, 2);
  const g = s.shades.find((d) => d.name === 'Garrick');
  const h = s.shades.find((d) => d.name === 'Hesper');
  ok(s, { type: 'request', id: h.id, grant: true });
  assert.equal(s.rite.choice[h.id], 'cover', 'granting a Serene request covers its mirror');
  ok(s, { type: 'request', id: g.id, grant: true });
  const before = defense(s);
  ok(s, { type: 'beginDay' });
  assert.ok(!s.shades.includes(h), 'Hesper was let go');
  assert.ok(g.granted);
  assert.equal(g.byDay?.how, 'gate');
  assert.ok(gateGuard(s) > 0 && defense(s) > before - 1e-9);
  const mem = g.memory;
  while (s.phase === 'day') step(s);
  assert.ok(!g.byDay, 'back in the glass');
  assert.equal(g.memory, mem - s.tuning.gateFade * (g.named ? 0.5 : 1) * 2, 'Reckless fades twice as fast');
  assert.equal(asksNow(s, g), null);
});

test('refused, a shade asks again after askEvery nights; refused twice, it turns Restless and leaves its mirror', () => {
  const s = newSeason(3, quiet);
  toDawn(s, 1);
  failing(s);
  ok(s, { type: 'beginDay' });
  toDawn(s, 2);
  const h = s.shades.find((d) => d.name === 'Hesper');
  ok(s, { type: 'beginDay' });
  assert.equal(h.refused, 1);
  assert.ok(h.mirror);
  toDawn(s, 5);
  assert.equal(s.rite.asks[h.id], 'release', 'asks again three nights on');
  ok(s, { type: 'beginDay' });
  assert.equal(h.kind, 'restless');
  assert.equal(h.trueKind, 'serene');
  assert.equal(h.mirror, null);
  assert.ok(s.log.some((l) => /Hesper, refused twice, turns Restless/.test(l.text)));
  // Bound back into a mirror, it settles and asks no more.
  toDawn(s, 6);
  s.res.essence = 10;
  ok(s, { type: 'rite', id: h.id, choice: 'bind' });
  ok(s, { type: 'beginDay' });
  assert.equal(h.kind, 'serene');
  assert.ok(h.granted && h.mirror);
});

test('a name or a remembering costs remembrance at the rite; older saves have no requests; requests replay', () => {
  const s = newSeason(3, quiet);
  toDawn(s, 2);
  const h = s.shades.find((d) => d.name === 'Hesper');
  h.kind = 'stranger'; // a Stranger asks a name
  s.rite.asks[h.id] = 'name';
  h.named = false;
  const base = ritePreview(s).remCost;
  ok(s, { type: 'request', id: h.id, grant: true });
  assert.equal(ritePreview(s).remCost, base + s.tuning.nameCost);
  const old = JSON.parse(JSON.stringify(newSeason(3)));
  for (const t of [old.tuning, old.tuning0]) delete t.requests;
  assert.equal(upgrade(old).tuning.requests, 0);
  const r0 = newSeason(5, quiet);
  toDawn(r0, 2);
  ok(r0, { type: 'request', id: r0.shades.find((d) => d.name === 'Garrick').id, grant: true });
  ok(r0, { type: 'beginDay' });
  for (let i = 0; i < 300; i++) step(r0);
  const r = replay(r0.seed, r0.tuning0, r0.actions);
  while (r.t < r0.t) step(r);
  assert.deepEqual(r.shades.map((d) => [d.id, d.memory, d.byDay]), r0.shades.map((d) => [d.id, d.memory, d.byDay]));
});
