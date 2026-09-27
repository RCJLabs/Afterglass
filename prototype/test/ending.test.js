import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, yearsEnd, ritePreview, seasonIndex, yearOf } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { recapOf } from '../src/slice/recap.js';
import { epitaph } from '../src/slice/book.js';

// A keep the autopilot brings through a whole year (seed 4 does), at the year's end.
const yearDone = (() => {
  const s = runSeasonAuto(4, { seasons: 4 });
  return () => JSON.parse(JSON.stringify(s));
})();

test("the year's end comes after the Long Night only; the endings wait for it", () => {
  const s = yearDone();
  assert.ok(yearsEnd(s));
  assert.equal(seasonIndex(s), 3);
  const spring = runSeasonAuto(4, { seasons: 1 });
  assert.equal(spring.phase, 'end');
  assert.ok(!yearsEnd(spring));
  assert.match(act(spring, { type: 'sealVeil' }).error, /only when a year ends/);
  assert.match(act(spring, { type: 'takeGlass' }).error, /end of a year/);
});

test('sealing the Veil frees every shade, closes the Book and ends the keep', () => {
  const s = yearDone();
  const ids = s.shades.map((d) => d.id);
  assert.ok(ids.length > 0);
  assert.ok(act(s, { type: 'sealVeil' }).ok);
  assert.equal(s.shades.length, 0);
  assert.deepEqual(s.sealed, { season: 4, year: 1, freed: ids.length });
  for (const id of ids) {
    const e = s.ledger.find((x) => x.id === id);
    assert.equal(e.end, 'sealed');
    assert.match(epitaph(e, true), /Went free when the Veil was sealed/);
  }
  const r = recapOf(s);
  assert.equal(r.head, 'The Veil is sealed');
  assert.match(r.sub, /After a whole year, \d+ shades? went free\./);
  assert.match(act(s, { type: 'nextSeason' }).error, /sealed/);
  assert.ok(!yearsEnd(s));
});

test('taking your place in the glass: the Keeper wakes Loyal, named and Anchored, weighs two shades, and the year goes on', () => {
  const s = yearDone();
  const before = s.shades.length;
  assert.ok(act(s, { type: 'takeGlass' }).ok);
  assert.equal(s.phase, 'dawn');
  assert.equal(seasonIndex(s), 0);
  assert.equal(yearOf(s), 2);
  const k = s.shades.find((d) => d.keeper);
  assert.ok(k && k.name === 'The Keeper');
  assert.equal(s.shades.length, before + 1);
  assert.equal(k.kind, 'loyal');
  assert.ok(k.named && k.trait === 'anchored' && k.memory === 100 && k.mirror);
  const P = ritePreview(s);
  assert.ok(P.keep.includes(k));
  const cover = JSON.parse(JSON.stringify(s));
  act(cover, { type: 'rite', id: k.id, choice: 'cover' });
  assert.equal(P.dread.keep - ritePreview(cover).dread.keep, s.tuning.dreadPerKeep * s.tuning.keeperDread);
  assert.ok(s.ledger.some((e) => e.id === k.id && e.from === 'keeper'));
});
