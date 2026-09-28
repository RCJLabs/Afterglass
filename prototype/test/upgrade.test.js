// Old keeps (round seven, phase 6): upgrade() gives a keep from before a rule the value it played with, from one
// dated table, and a key added to the numbers can't slip past it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSeason, upgrade, RULES_SINCE } from '../src/slice/sim.js';
import { TUNING } from '../src/slice/data.js';

// Every key the numbers had when this test was written (round seven, phase 6), each already decided: a rule in
// RULES_SINCE, or a number whose default plays as keeps before it did.
const KNOWN = new Set(JSON.parse(readFileSync(new URL('./tuning-keys.json', import.meta.url), 'utf8')));
// Keys added since whose default plays as before in an old keep (say, a number only a switched-off rule reads),
// each with why. Empty until one is added.
const DEFAULT_OK = {};

test('every key in the numbers is decided for old keeps', () => {
  const rules = new Set(RULES_SINCE.map((r) => r.key));
  const undecided = Object.keys(TUNING).filter((k) => !KNOWN.has(k) && !rules.has(k) && !(k in DEFAULT_OK));
  assert.deepEqual(undecided, [], `New tuning keys: ${undecided.join(', ')}. For each, either add it to RULES_SINCE in sim.js with the value that plays as keeps before it did, or to DEFAULT_OK here, saying why its default is safe for them.`);
});

test('the table names real keys once each, in the order they came', () => {
  const keys = RULES_SINCE.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of RULES_SINCE) {
    assert.ok(r.key in TUNING, `${r.key} is not a tuning key`);
    assert.match(r.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.what);
  }
  const dates = RULES_SINCE.map((r) => r.since);
  assert.deepEqual([...dates].sort(), dates);
});

test('a keep from before every rule gets each old value, and the rest of today’s numbers', () => {
  const g = JSON.parse(JSON.stringify(newSeason(7)));
  for (const t of [g.tuning, g.tuning0]) for (const r of RULES_SINCE) delete t[r.key];
  delete g.tuning.lightMax;
  upgrade(g);
  for (const t of [g.tuning, g.tuning0]) for (const r of RULES_SINCE) assert.equal(t[r.key], r.old, r.key);
  assert.equal(g.tuning.lightMax, TUNING.lightMax);
});

test('a keep from this build is left as it is', () => {
  const g = JSON.parse(JSON.stringify(newSeason(7)));
  const before = JSON.stringify(g.tuning) + JSON.stringify(g.tuning0);
  upgrade(g);
  assert.equal(JSON.stringify(g.tuning) + JSON.stringify(g.tuning0), before);
});
