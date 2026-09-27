import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, retune, roomPower, weatherOf, forecastOf, drownedCount } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { threats } from '../src/slice/threats.js';
import { newTutorial } from '../src/slice/tutorial.js';
import { howTo } from '../src/slice/howto.js';
import { epitaph } from '../src/slice/book.js';
import { geo, roomsOf } from '../src/slice/geo.js';
import { MAP, TUNING } from '../src/slice/data.js';

// The original four-floor keep, nothing by day to get in the way.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, errands: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const secs = (s, n) => {
  for (let i = 0; i < n * 10 && s.phase === 'night'; i++) step(s);
};
// Through dusk, a night with no Unlit, and the rite, to the next morning (across a season's end).
function nextDay(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  ok(s, { type: 'beginDay' });
}
// Dusk of a rainy day 2 (day 1's forecast set to rain), the dead woken, candles still to set.
function rainyDusk(seed, over = {}) {
  const s = newSeason(seed, { ...quiet, ...over });
  s.forecast = 'rain';
  nextDay(s);
  assert.equal(weatherOf(s), 'rain');
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  return s;
}
// Tonight's Drowned only, the first up on the next tick: which end of the moat, and the mirror nearest it.
function drownedOnly(s) {
  const dr = s.night.spawns.filter((sp) => sp.type === 'drowned');
  s.night.spawns = dr.map((sp, i) => ({ ...sp, at: 1 + i * 400 }));
  const end = MAP.moat.find((w) => w.id === dr[0].rift);
  const mirror = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - end.x) < Math.abs(a.x - end.x) ? b : a));
  return { dr, end, mirror };
}

test("the weather: a keep's first day is clear, each day is the day before's forecast, and the tutorial's days are clear", () => {
  const s = newSeason(5, quiet);
  assert.equal(weatherOf(s), 'clear');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const f = forecastOf(s);
    assert.ok(['clear', 'rain', 'fog'].includes(f));
    nextDay(s);
    assert.equal(weatherOf(s), f, `day ${s.day} of season ${s.season}`);
    seen.add(f);
  }
  assert.deepEqual([...seen].sort(), ['clear', 'fog', 'rain']);
  // Rain on a day brings a warning at its dawn, and on the day before.
  assert.ok(s.log.some((l) => /^Rain is coming tomorrow\./.test(l.text)));
  assert.ok(s.log.some((l) => /^Rain\. The Yard quarries at 75%/.test(l.text)));
  const t = newTutorial();
  for (let day = 1; day <= 3; day++) {
    assert.equal(weatherOf(t), 'clear');
    if (day < 3) assert.equal(forecastOf(t), 'clear');
    nextDay(t);
  }
  const off = newSeason(5, { ...quiet, weather: 0 });
  assert.equal(off.weather, undefined);
  assert.equal(weatherOf(off), 'clear');
  assert.equal(forecastOf(off), null);
});

test('rain slows the Yard and damps fire', () => {
  const s = newSeason(5, { ...quiet, fire: 1 });
  for (const p of s.living) p.job = 'yard';
  const dry = roomPower(s).yard;
  assert.ok(dry > 0);
  s.weather = 'rain';
  assert.equal(roomPower(s).yard, dry * TUNING.rainYard);
  // Unfought, a fire's heat grows half as fast in the rain.
  const heat = (weather) => {
    const k = newSeason(5, { ...quiet, fire: 1 });
    k.weather = weather;
    for (const p of k.living) p.job = 'yard';
    const room = roomsOf(geo(k), 'hearth')[0].id;
    k.events.unshift({ at: k.t + 1, type: 'fire', room });
    step(k);
    const f = k.fires.find((x) => x.room === room);
    const h0 = f.heat;
    for (let i = 0; i < 20; i++) step(k);
    return f.heat - h0;
  };
  assert.ok(Math.abs(heat('rain') - heat('clear') * TUNING.rainFire) < 1e-9);
});

test("on a rainy night the Drowned come up at one end of the moat's twin, never take a stair, and crack the Veil at a mirror", () => {
  const s = rainyDusk(7);
  const G = geo(s);
  const { dr, end } = drownedOnly(s);
  assert.equal(dr.length, drownedCount(s));
  assert.equal(new Set(dr.map((x) => x.rift)).size, 1, 'all at one end');
  ok(s, { type: 'startNight' });
  step(s);
  const f = s.night.foes.find((x) => x.type === 'drowned');
  assert.equal(f.f, G.veil);
  assert.ok(Math.abs(f.x - end.x) <= 1, `up at ${f.x}, by the end at ${end.x}`);
  assert.ok(s.alerts.some((a) => /^One of the Drowned comes up out of the moat's twin/.test(a.text)));
  const floors = new Set();
  const cracks = s.cracks;
  while (s.night.foes.includes(f)) {
    floors.add(f.f);
    step(s);
  }
  assert.deepEqual([...floors], [G.veil]);
  assert.equal(s.cracks, cracks + 1);
  assert.ok(s.log.some((l) => /^One of the Drowned slipped through the Veil at the mirror in the/.test(l.text)));
  // Clear nights bring none.
  const c = newSeason(7, quiet);
  c.forecast = 'clear';
  nextDay(c);
  while (c.phase === 'day') step(c);
  assert.ok(!c.night.spawns.some((sp) => sp.type === 'drowned'));
});

test('the new moon belongs to the Hollow: no Drowned on a rainy one, except the Long Night', () => {
  // To the dusk of the seventh day, rained on.
  const rainyNewMoon = (s) => {
    while (!(s.day === s.tuning.seasonDays - 1 && s.phase === 'day')) nextDay(s);
    s.forecast = 'rain';
    assert.ok(!s.log.some((l) => l.day === s.day && /^Rain is coming tomorrow\. Tomorrow night the Drowned/.test(l.text)));
    nextDay(s);
    assert.equal(weatherOf(s), 'rain');
    while (s.phase === 'day') step(s);
    return s;
  };
  const s = rainyNewMoon(newSeason(7, quiet));
  assert.ok(!s.night.spawns.some((sp) => sp.type === 'drowned'));
  assert.ok(s.log.some((l) => /^Rain\. .*The Drowned stay under tonight: the new moon belongs to the Hollow\./.test(l.text)));
  // Winter's seventh night, the Long Night, has them, as it has a Maw.
  const w = newSeason(7, { ...quiet, startFood: 9999 }); // nobody runs this keep, so it lives on its stores
  while (w.season < 4) nextDay(w);
  rainyNewMoon(w);
  assert.ok(w.night.spawns.some((sp) => sp.type === 'drowned'));
});

test('light bars them, and they gnaw it twice as fast as a Creeper; a shade in the light cuts them down', () => {
  const s = rainyDusk(7);
  const G = geo(s);
  const { mirror } = drownedOnly(s);
  ok(s, { type: 'candle', f: G.veil, x: mirror.x });
  ok(s, { type: 'startNight' });
  secs(s, 6);
  const f = s.night.foes.find((x) => x.type === 'drowned');
  const k = s.night.candles.find((c) => c.f === G.veil);
  assert.equal(f.mode, 'gnaw');
  const w0 = k.wax;
  secs(s, 1);
  assert.ok(Math.abs(w0 - k.wax - (1 + TUNING.gnawRate * TUNING.drownedGnaw)) < 1e-6, `lost ${w0 - k.wax} wax in a second`);
  assert.equal(s.cracks, 0);
  // With a shade posted in that light, it's cut down and nothing gets through.
  const g = rainyDusk(7);
  drownedOnly(g);
  ok(g, { type: 'candle', f: geo(g).veil, x: mirror.x });
  ok(g, { type: 'move', id: g.shades[0].id, f: geo(g).veil, x: mirror.x });
  ok(g, { type: 'startNight' });
  secs(g, 20);
  assert.ok(!g.night.foes.some((x) => x.type === 'drowned'));
  assert.equal(g.night.stats.killed, 1);
  assert.equal(g.cracks, 0);
});

test('a shade caught in the dark is dragged to the moat and pulled under; a candle on it makes the Drowned let go', () => {
  const setup = () => {
    const s = rainyDusk(7, { traits: 0 }); // no Reckless shade striking from further out
    const { end } = drownedOnly(s);
    const d = s.shades[0];
    const x = end.x + (end.x < MAP.W / 2 ? 12 : -12);
    ok(s, { type: 'move', id: d.id, f: geo(s).veil, x });
    d.memory = 100;
    ok(s, { type: 'startNight' });
    let guard = 2000;
    while (!d.grabbedBy && guard--) step(s);
    assert.ok(d.grabbedBy, 'caught');
    return { s, d, end, x };
  };
  const { s, d, end, x } = setup();
  assert.ok(s.log.some((l) => /^One of the Drowned has caught .* and is dragging them to the moat\./.test(l.text)));
  secs(s, 1);
  assert.ok(Math.abs(d.x - end.x) < Math.abs(x - end.x), 'dragged toward the moat');
  let guard = 2000;
  while (s.shades.includes(d) && guard--) step(s);
  const e = s.ledger.find((l) => l.id === d.id);
  assert.equal(e.end, 'drowned');
  assert.match(epitaph(e), /Dragged down into the moat's twin by the Drowned/);
  assert.ok(!s.night.foes.some((f) => f.type === 'drowned'), 'it goes under with them');
  assert.equal(s.night.stats.pulled, 1);
  // A candle dropped on the caught shade: it's let go, and walks back to its post.
  const b = setup();
  secs(b.s, 1);
  ok(b.s, { type: 'candle', f: b.d.f, x: b.d.x });
  step(b.s);
  step(b.s);
  assert.equal(b.d.grabbedBy, null);
  secs(b.s, 6);
  assert.ok(b.s.shades.includes(b.d));
  assert.ok(Math.abs(b.d.x - b.x) < 1.5, `back at its post: ${b.d.x} for ${b.x}`);
});

test("a ward on the moat keeps them under; there's nothing to ward on a clear night", () => {
  const s = rainyDusk(7);
  const { dr } = drownedOnly(s);
  ok(s, { type: 'debug', what: 'give', res: 'essence', n: 10 });
  ok(s, { type: 'ward', target: 'moat' });
  ok(s, { type: 'startNight' });
  while (s.night.spawns.length) step(s);
  step(s);
  assert.ok(!s.night.foes.some((f) => f.type === 'drowned'));
  assert.equal(s.night.stats.under, dr.length);
  const c = newSeason(7, quiet);
  c.forecast = 'clear';
  nextDay(c);
  while (c.phase === 'day') step(c);
  if (c.dusk.step === 'crypt') ok(c, { type: 'wake' });
  ok(c, { type: 'debug', what: 'give', res: 'essence', n: 10 });
  assert.match(act(c, { type: 'ward', target: 'moat' }).error, /still tonight/);
});

test('the black mirror shows how many of the Drowned come, when, from which end and their way; fog clouds it', () => {
  const s = rainyDusk(7);
  const G = geo(s);
  const { dr, end, mirror } = drownedOnly(s);
  let th = threats(s);
  assert.equal(th.drowned.count, dr.length);
  assert.equal(th.drowned.end, end.id);
  assert.equal(th.drowned.way.end, 'veil');
  assert.equal(th.fog, false);
  ok(s, { type: 'candle', f: G.veil, x: mirror.x });
  th = threats(s);
  assert.equal(th.drowned.way.end, 'gnaw');
  ok(s, { type: 'debug', what: 'give', res: 'essence', n: 10 });
  ok(s, { type: 'ward', target: 'moat' });
  th = threats(s);
  assert.ok(th.drowned.warded && !th.drowned.way);
  s.weather = 'fog';
  assert.equal(threats(s).fog, true);
});

test('a keep with weather replays exactly; an old save plays on without it; How to play covers it', () => {
  const s = runSeasonAuto(3, { seasons: 2 });
  assert.ok(s.log.some((l) => /^Rain\./.test(l.text)), 'it rained');
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t || r.phase !== s.phase) step(r);
  assert.equal(r.log.length, s.log.length);
  assert.deepEqual([r.weather, r.forecast, r.cracks], [s.weather, s.forecast, s.cracks]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { weather: 0 })));
  delete old.tuning.weather;
  delete old.tuning0.weather;
  assert.equal(upgrade(old).tuning.weather, 0);
  // Loaded into this build, it follows the build's numbers: the day it's loaded and the next are clear, and
  // the forecast starts at the next dawn.
  retune(old, TUNING);
  assert.equal(old.tuning.weather, 1);
  assert.deepEqual([weatherOf(old), forecastOf(old)], ['clear', null]);
  nextDay(old);
  assert.equal(weatherOf(old), 'clear');
  assert.ok(['clear', 'rain', 'fog'].includes(forecastOf(old)));
  assert.ok(howTo(TUNING).some((x) => x.id === 'weather'));
  assert.ok(!howTo({ ...TUNING, weather: 0 }).some((x) => x.id === 'weather'));
});
