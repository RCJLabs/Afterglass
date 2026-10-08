import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Round seven, phase 19: the page in modules of a size a person can hold in their head.
const dir = new URL('../src/page/', import.meta.url);
const read = (u) => readFileSync(u, 'utf8');

test('no page module is over 800 lines, and slice-ui.js only puts them in order', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10, 'the page is in modules');
  for (const f of files) {
    const n = read(new URL(f, dir)).split('\n').length;
    assert.ok(n <= 800, `src/page/${f} is ${n} lines`);
  }
  const entry = read(new URL('../src/slice-ui.js', import.meta.url));
  const code = entry.split('\n').filter((l) => l.trim() && !l.startsWith('//'));
  assert.ok(code.every((l) => /^import '\.\/page\/[a-z]+\.js';$/.test(l)), 'slice-ui.js does nothing but import the page');
  assert.equal(code.length, files.length, 'slice-ui.js imports every page module');
  assert.match(code[0], /state\.js/, 'state first');
});

test('the state module imports none of the others, so every module can use it as it loads', () => {
  const state = read(new URL('state.js', dir));
  assert.ok(!/from '\.\/[a-z]+\.js'/.test(state), 'state.js imports another page module');
});

test('every button the page draws has something to do', () => {
  const src = readdirSync(dir).map((f) => read(new URL(f, dir))).join('\n');
  const drawn = new Set([...src.matchAll(/data-act="([a-z0-9-]+)"/g)].map((m) => m[1]));
  const acts = read(new URL('acts.js', dir));
  const table = acts.slice(acts.indexOf('const ACTS = {'));
  const known = new Set([...table.matchAll(/^ {2}(?:'([a-z0-9-]+)'|([a-z][a-zA-Z0-9]*))(?:\(|:)/gm)].map((m) => m[1] || m[2]));
  // Handled where they happen, not by a click: inputs and pickers the page reads as they change.
  const elsewhere = [...drawn].filter((a) => !known.has(a));
  for (const a of elsewhere) assert.ok(new RegExp(`'${a}'`).test(src.replace(table, '')), `data-act="${a}" is drawn but nothing handles it`);
});
