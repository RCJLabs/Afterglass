import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LINES, lineText } from '../src/slice/lines.js';
import { newSeason } from '../src/slice/sim.js';

// Round seven, phase 19: the log's lines as keys and what they need, the groundwork for translation.
const sim = readFileSync(new URL('../src/slice/sim.js', import.meta.url), 'utf8');

test('every line the sim says is in the table, and every line in the table is said', () => {
  const said = [...sim.matchAll(/\bsay\(\s*s,\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(said.length > 150);
  assert.ok(!/(?<!function )\bsay\(\s*s,\s*[^'\s]/.test(sim), 'a say() with its words written where it is said');
  for (const k of said) assert.ok(k in LINES, `${k} is said but not in lines.js`);
  for (const k of Object.keys(LINES)) assert.ok(said.includes(k), `${k} is in lines.js but never said`);
  assert.equal(new Set(said).size, said.length, 'a key said in two places');
});

test('a log entry keeps its key with its words, and a key not in the table is an error', () => {
  const s = newSeason(5);
  assert.equal(s.log[0].key, 'newSeason.1');
  assert.equal(s.log[0].text, lineText('newSeason.1', { seasonDays: s.tuning.seasonDays }));
  assert.match(s.log[0].text, /^Season 1, day 1\. The new moon is 7 days off\./);
  assert.throws(() => lineText('no.such.line'), /no line/);
  assert.equal(lineText('eat.1'), 'There is food in the larder again.');
});
