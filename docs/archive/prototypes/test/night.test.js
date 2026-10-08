import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newNightGame, stepNight, actNight, lightMap, isLit, route, radius, nightTicks, replayNight, byId, addCreeper, perf,
} from '../src/night.js';
import { runNightAuto } from '../src/night-autopilot.js';
import { W, FLOORS, STAIRS } from '../src/night-data.js';

// No scheduled Creepers: each test brings its own.
const QUIET = { creepersBase: 0, creepersPerNight: 0 };
const game = (o = {}) => newNightGame(1, { ...QUIET, ...o });
const ok = (s, a) => {
  const r = actNight(s, a);
  assert.ok(r.ok, `${a.type} failed: ${r.error}`);
};
const shade = (s, name) => s.shades.find((d) => d.name === name);
const ticks = (s, n) => {
  for (let i = 0; i < n && s.phase === 'night'; i++) stepNight(s);
};
const spans = (s, f) => lightMap(s).merged[f].map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
// Park the starting shades out of harm's way (a lit Waking Room) unless a test moves them.
function night(s) {
  ok(s, { type: 'candle', f: 0, x: 6 });
  for (const d of s.shades) ok(s, { type: 'move', id: d.id, f: 0, x: 6 });
  ok(s, { type: 'start' });
}

test('a fresh candle lights 3.5 tiles each way, but only inside its own room', () => {
  const s = game();
  ok(s, { type: 'candle', f: 2, x: 15 }); // Court of Shades, 9 to 20
  ok(s, { type: 'candle', f: 2, x: 10 });
  assert.deepEqual(spans(s, 2), [[9, 18.5]]);
  const t = game();
  ok(t, { type: 'candle', f: 2, x: 10 });
  assert.deepEqual(spans(t, 2), [[9, 13.5]], 'clipped at the Threshold wall');
});

test('rifts drink the light around them, and candles shrink as they burn', () => {
  const s = game({ lightMin: 1.5, lightMax: 3.5 });
  ok(s, { type: 'candle', f: 4, x: 13 }); // Silvering, with a rift at 15
  assert.deepEqual(spans(s, 4), [[10, 14], [16, 16.5]]);
  s.candles[0].wax = s.candles[0].max / 2;
  assert.equal(radius(s, s.candles[0]), 2.5);
});

test('shades take the stairs anywhere; Creepers refuse lit stairs and warded ones', () => {
  const s = game();
  const r = route(s, lightMap(s), { f: 4, x: 2 }, [{ f: 0, x: 7 }]);
  assert.ok(r.path.filter((p) => p.climb).length === 4, 'four climbs from the bottom floor to the top');
  const mirrors = [{ f: 0, x: 7 }, { f: 0, x: 16 }, { f: 0, x: 24 }];
  assert.ok(route(s, lightMap(s), { f: 4, x: 17 }, mirrors, { creeper: true }));
  ok(s, { type: 'candle', f: 4, x: 10 });
  ok(s, { type: 'candle', f: 4, x: 20 });
  const L = lightMap(s);
  assert.equal(route(s, L, { f: 4, x: 17 }, mirrors, { creeper: true }), null, 'both stairs up from the Deep are lit');
  assert.ok(route(s, L, { f: 4, x: 17 }, mirrors, { creeper: true, ignoreLight: true }));
  const w = game();
  w.essence = 10;
  ok(w, { type: 'ward', target: 's7' });
  ok(w, { type: 'ward', target: 's8' });
  assert.equal(route(w, lightMap(w), { f: 4, x: 17 }, mirrors, { creeper: true, ignoreLight: true }), null);
  assert.equal(w.essence, 0);
});

test('a Creeper blocked by light gnaws the candle in its way', () => {
  const s = game();
  ok(s, { type: 'candle', f: 4, x: 10 });
  ok(s, { type: 'candle', f: 4, x: 20 });
  night(s);
  const c = addCreeper(s, 4, 17);
  ticks(s, 40);
  assert.equal(c.mode, 'gnaw');
  assert.ok(c.gnawing);
  const [a, b] = s.candles.filter((k) => k.f === 4);
  const gnawed = byId(s.candles, c.gnaw);
  const other = gnawed === a ? b : a;
  assert.ok(gnawed.wax < other.wax - 5, `gnawed ${gnawed.wax} vs ${other.wax}`);
  assert.ok(!isLit(lightMap(s), c.f, c.x), 'it stays in the dark');
});

test('a Creeper catches a shade in the dark, and a candle dropped on the spot frees it', () => {
  const s = game();
  night(s);
  const tam = shade(s, 'Tam');
  ok(s, { type: 'move', id: tam.id, f: 0, x: 6 }); // already there
  Object.assign(tam, { f: 2, x: 15, ox: 15, of: 2, post: { f: 2, x: 15 }, path: [] });
  const c = addCreeper(s, 2, 11);
  ticks(s, 40);
  assert.equal(tam.grabbedBy, c.id);
  const held = tam.memory;
  ticks(s, 20);
  assert.ok(Math.abs(held - tam.memory - 2 * s.tuning.drainPerSec) < 0.01, 'memory drains while held');
  ok(s, { type: 'candle', f: 2, x: tam.x });
  ticks(s, 2);
  assert.equal(tam.grabbedBy, null);
  assert.equal(c.grab, null);
  assert.ok(c.hp < s.tuning.creeperHp || !byId(s.creepers, c.id), 'the light burns it');
});

test('shades standing in light cut down Creepers gnawing at its edge', () => {
  const s = game();
  ok(s, { type: 'candle', f: 4, x: 10 });
  ok(s, { type: 'candle', f: 4, x: 20 });
  night(s);
  const ada = shade(s, 'Ada');
  Object.assign(ada, { f: 4, x: 10.7, ox: 10.7, of: 4, post: { f: 4, x: 10.7 } });
  addCreeper(s, 4, 6);
  ticks(s, 60);
  assert.equal(s.tonight.killed, 1);
  assert.equal(s.creepers.length, 0);
  assert.equal(ada.memory, 100, 'untouched');
});

test('a Creeper that reaches a mirror cracks the Veil; enough cracks lose the keep', () => {
  const s = game();
  night(s);
  for (const d of s.shades) Object.assign(d, { f: 1, x: 5, ox: 5, of: 1, post: { f: 1, x: 5 } }); // out of its way
  s.candles = [];
  addCreeper(s, 0, 20);
  ticks(s, 30);
  assert.equal(s.cracks, 1);
  assert.equal(s.tonight.crossed, 1);
  s.cracks = s.tuning.cracksMax - 1;
  addCreeper(s, 0, 20);
  ticks(s, 30);
  assert.equal(s.phase, 'over');
  assert.equal(s.over.reason, 'veil');
});

test('singing in a lit Choir makes essence, but not in the dark or under a hush', () => {
  const s = game();
  ok(s, { type: 'candle', f: 3, x: 5 });
  ok(s, { type: 'move', id: shade(s, 'Tam').id, f: 3, x: 5 });
  ok(s, { type: 'move', id: shade(s, 'Bran').id, f: 3, x: 11 }); // Choir, but outside the light
  for (const n of ['Ada', 'Hesk']) ok(s, { type: 'move', id: shade(s, n).id, f: 0, x: 1 });
  ok(s, { type: 'start' });
  ticks(s, 100);
  const tam = shade(s, 'Tam');
  assert.ok(Math.abs(tam.worked - s.tuning.essencePerSec * 1.5 * 10) < 0.05, `Serene sings at 1.5: ${tam.worked}`);
  assert.equal(shade(s, 'Bran').worked, 0);
  ok(s, { type: 'hush', on: true });
  const before = s.essence;
  ticks(s, 50);
  assert.equal(s.essence, before);
});

test('dawn fades every shade; named and rested shades fade at half', () => {
  const s = game({ nightSecs: 10 });
  ok(s, { type: 'candle', f: 1, x: 5 }); // Cold Hearth
  ok(s, { type: 'move', id: shade(s, 'Tam').id, f: 1, x: 5 });
  shade(s, 'Ada').named = true;
  ok(s, { type: 'start' });
  ticks(s, nightTicks(s));
  assert.equal(s.phase, 'dawn');
  assert.equal(shade(s, 'Ada').memory, 95);
  assert.equal(shade(s, 'Tam').memory, 95);
  assert.equal(shade(s, 'Bran').memory, 90);
  assert.equal(s.remembrance, s.tuning.remembrancePerDawn);
  assert.equal(s.nights.length, 1);
});

test('memory weakens a shade, and a shade at zero fades away', () => {
  const s = game({ nightSecs: 10 });
  const bran = shade(s, 'Bran');
  assert.equal(perf(bran), 1);
  bran.memory = 50;
  assert.equal(perf(bran), 0.7);
  bran.memory = 5;
  ok(s, { type: 'start' });
  ticks(s, nightTicks(s));
  assert.equal(shade(s, 'Bran'), undefined);
  assert.deepEqual(s.nights[0].lost, ['Bran']);
});

test('remembrance buys names and memories; releasing a shade earns it', () => {
  const s = game({ nightSecs: 10, arrivals: [1, 0, 0] });
  ok(s, { type: 'start' });
  ticks(s, nightTicks(s));
  assert.equal(s.remembrance, 1);
  assert.equal(actNight(s, { type: 'name', id: shade(s, 'Ada').id }).ok, false, 'naming costs 3');
  ok(s, { type: 'release', id: shade(s, 'Hesk').id });
  assert.equal(s.remembrance, 3);
  ok(s, { type: 'name', id: shade(s, 'Ada').id });
  assert.ok(shade(s, 'Ada').named);
  s.remembrance = 1;
  ok(s, { type: 'remember', id: shade(s, 'Tam').id });
  assert.equal(shade(s, 'Tam').memory, 100, 'capped at 100');
  ok(s, { type: 'rate', score: 4 });
  assert.equal(s.nights[0].rating, 4);
  ok(s, { type: 'next' });
  assert.equal(s.phase, 'dusk');
  assert.equal(s.night, 2);
  assert.equal(s.candlesLeft, s.tuning.candles);
});

test('candles are counted: six a night unless the tuning says otherwise', () => {
  const s = game();
  for (let i = 0; i < 6; i++) ok(s, { type: 'candle', f: 2, x: 2 + i * 4 });
  assert.equal(actNight(s, { type: 'candle', f: 2, x: 27 }).ok, false);
  assert.equal(actNight(s, { type: 'candle', f: 9, x: 2 }).ok, false, 'no floor 9');
});

test('from night 2, some Creepers seep up in rooms left fully dark', () => {
  const s = newNightGame(3, { creepersBase: 6, creepersPerNight: 0, seepFrom: 1, seepShare: 1, nightSecs: 30 });
  for (let f = 1; f < FLOORS.length; f++) for (const room of FLOORS[f]) if (room[0] !== 'dreamwell') ok(s, { type: 'debug', what: 'candles', n: 1 }), ok(s, { type: 'candle', f, x: (room[2] + room[3]) / 2 });
  night(s);
  ticks(s, nightTicks(s) - 1);
  const seeps = s.log.filter((l) => /seep up/.test(l.text));
  assert.ok(seeps.length >= 1);
  assert.ok(seeps.every((l) => /Dreamwell/.test(l.text)), 'only the room with no candle');
});

test('the same seed and actions give the same nights, and replay rebuilds them', () => {
  const strip = (s) => JSON.stringify({ ...s, alerts: [] });
  const a = runNightAuto(newNightGame(5), { nights: 3 });
  const b = runNightAuto(newNightGame(5), { nights: 3 });
  assert.equal(strip(a), strip(b));
  const r = replayNight(a.seed, a.tuning0, a.actions);
  while (r.phase === 'night' && (r.night !== a.night || r.t !== a.t)) stepNight(r);
  assert.equal(strip(r), strip(a));
});

function invariants(s) {
  const ids = [...s.shades, ...s.creepers, ...s.candles].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const u of [...s.shades, ...s.creepers]) {
    assert.ok(Number.isFinite(u.x) && u.x >= -1e-6 && u.x <= W + 1e-6, `x in range: ${u.x}`);
    assert.ok(u.f >= 0 && u.f < FLOORS.length);
  }
  for (const d of s.shades) {
    assert.ok(d.memory > 0 && d.memory <= 100, `${d.name} memory ${d.memory}`);
    if (d.grabbedBy) assert.equal(byId(s.creepers, d.grabbedBy)?.grab, d.id, 'grabs are mutual');
  }
  for (const c of s.candles) assert.ok(c.wax > -1 && c.wax <= c.max);
  assert.ok(s.cracks >= 0 && s.cracks <= s.tuning.cracksMax);
  assert.ok(s.essence >= -1e-9 && s.remembrance >= -1e-9);
  for (const w of s.wards) assert.ok(STAIRS.some((x) => x.id === w) || /^r\d$/.test(w));
}

test('soak: the night rules hold across seeds', () => {
  let crossed = 0;
  let killed = 0;
  let grabbed = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = runNightAuto(newNightGame(seed), { nights: 5, onTick: (x) => x.t % 25 === 0 && invariants(x) });
    for (const n of s.nights) {
      crossed += n.crossed;
      killed += n.killed;
      grabbed += n.grabbed;
    }
  }
  assert.ok(killed > 0 && grabbed >= 0 && crossed >= 0);
});
