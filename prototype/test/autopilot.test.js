// The autopilot's switches (round seven, phase 6): every one the file reads is documented in tools/AUTOPILOT.md,
// and the human plan is a fixed, lesser version of the balanced one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSeasonAuto, PLANS } from '../src/slice/autopilot.js';

const src = readFileSync(new URL('../src/slice/autopilot.js', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../tools/AUTOPILOT.md', import.meta.url), 'utf8');

test('every switch the autopilot reads is in tools/AUTOPILOT.md', () => {
  const read = new Set([...src.matchAll(/AP_[A-Z]+/g)].map((m) => m[0]).filter((k) => k !== 'AP_NO'));
  for (const m of src.matchAll(/NO\('([A-Z]+)'\)/g)) read.add(`AP_NO${m[1]}`);
  const missing = [...read].filter((k) => !doc.includes(`\`${k}`) && !doc.includes(`${k}=`));
  assert.deepEqual(missing, [], `document these in tools/AUTOPILOT.md: ${missing.join(', ')}`);
  for (const p of PLANS) assert.ok(doc.includes(`\`${p}\``), `plan ${p} is documented`);
});

test('the human plan is deterministic, and plays differently from the balanced plan it is built on', () => {
  const a = runSeasonAuto(5, { plan: 'human', seasons: 1 });
  const b = runSeasonAuto(5, { plan: 'human', seasons: 1 });
  assert.equal(JSON.stringify(a.actions), JSON.stringify(b.actions));
  const c = runSeasonAuto(5, { plan: 'balanced', seasons: 1 });
  assert.notEqual(JSON.stringify(a.actions), JSON.stringify(c.actions));
});
