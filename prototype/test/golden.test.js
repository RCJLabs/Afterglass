// Golden replays (round seven, phase 6): keeps saved and exported by older builds, from the season slice's first
// days on, each played back on today's rules. Every action must still apply, and every number each day recorded
// must come out the same, to the last digit: a rule changed for keeps that predate it, without a switch in
// RULES_SINCE to keep their old play, shows up here first. Each file holds only what a replay needs (the seed,
// the numbers the keep began with, every action and each day's record) and says when it was saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readExport, cursorOf, advance } from '../src/slice/watch.js';

const DIR = new URL('./golden/', import.meta.url);
// The first place what was recorded (a) and today's replay (b) differ, over what the record holds; a field
// added to the day's record since is on b only, and not compared.
function diff(a, b, path) {
  if (a === b) return null;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return { path, was: a, now: b };
  for (const k of Object.keys(a)) {
    const d = diff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
  const x = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  test(`golden: ${x.golden.what} (saved ${x.golden.saved})`, () => {
    const r = readExport(x);
    assert.ok(!r.error, r.error);
    const c = cursorOf(r.x);
    for (let i = 0; i < 5e6 && !c.done; i++) {
      const q = advance(c, r.x, 1);
      if (!q.used && !q.acts.length && !c.done) break;
    }
    assert.equal(c.off, null, `stopped matching: ${JSON.stringify(c.off)}`);
    assert.ok(c.s.days.length >= x.days.length, `replayed ${c.s.days.length} days of ${x.days.length}`);
    for (let i = 0; i < x.days.length; i++) {
      const d = diff(x.days[i], c.s.days[i], `day ${i + 1}`);
      assert.equal(d, null, `${f}: ${JSON.stringify(d)}`);
    }
    // A saved keep also holds where it stood when it was saved: the stores to the last digit, the random
    // stream's place, Dread, the Veil and who was there. (A playtest export has only its days.)
    if (x.end) {
      const s = c.s;
      assert.deepEqual({ season: s.season, day: s.day, phase: s.phase, t: s.t }, x.now, 'where it ended');
      const now = { res: Object.fromEntries(Object.keys(x.end.res).map((k) => [k, s.res[k]])), rng: s.rng, dread: s.dread, cracks: s.cracks, living: s.living.map((p) => p.id), shades: s.shades.map((d) => d.id) };
      assert.equal(diff(x.end, now, 'end'), null, `${f}: ${JSON.stringify(diff(x.end, now, 'end'))}`);
    }
  });
}
