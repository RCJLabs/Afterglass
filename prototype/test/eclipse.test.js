import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, replay, eclipseDue, eclipseSpan, eclipsing, livingMult, isTwinnedLiving, bondedShade, canWork, byId, dayTicks, ledgerOf, addFoe, hard } from '../src/slice/sim.js';
import { runSeasonAuto, autoStep } from '../src/slice/autopilot.js';
import { MAP } from '../src/slice/data.js';
import { epitaph } from '../src/slice/book.js';
import { geo, roomAt, roomSpan, DEEP_FLOOR } from '../src/slice/geo.js';

// Nothing by day to get in the way: no sickness, deaths of age, raids, fire, visitors or weather.
const quiet = { sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, weather: 0, startFood: 999 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
  return r;
};
// A fresh keep put on the morning of summer's day 4.
function midsummer(seed, over = {}) {
  const s = newSeason(seed, { ...quiet, ...over });
  s.season = 2;
  s.day = 4;
  return s;
}
const toEclipse = (s) => {
  while (!s.eclipse && s.phase === 'day') step(s);
  assert.ok(eclipsing(s), 'the eclipse began');
  return s;
};
// Through dusk, a night with no Unlit, and the rite, to the next morning.
function nextDay(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  ok(s, { type: 'beginDay' });
}
// A spot in the same room as a shade's post, away from it.
function across(s, d) {
  const G = geo(s);
  const r = roomSpan(G, roomAt(G, d.post.f, d.post.x));
  return { f: d.post.f, x: d.post.x > (r.x0 + r.x1) / 2 ? r.x0 + 5 : r.x1 - 5 };
}

test('the eclipse comes once a year, at noon on midsummer, foretold that morning; not with the year off, nor in a keep from before', () => {
  const s = newSeason(1, quiet);
  s.season = 2;
  s.day = 3;
  nextDay(s);
  assert.equal(s.day, 4);
  assert.ok(s.log.some((l) => l.day === 4 && /^Midsummer\. At 12:00 the sun goes dark for 30 seconds, and the Tain wakes with the keep/.test(l.text)));
  const [from, to] = eclipseSpan(s);
  assert.equal(from, Math.round(0.5 * dayTicks(s)));
  assert.equal(to - from, 300);
  while (s.t < from - 1) step(s);
  assert.equal(s.eclipse, null);
  assert.equal(s.night, null);
  step(s);
  assert.ok(eclipsing(s));
  assert.equal(s.phase, 'day');
  assert.ok(s.night.eclipse);
  assert.match(s.log.at(-1).text, /^The eclipse\. The sun goes dark and the Tain wakes with the keep/);
  // Summer's day 4 only, every year.
  const t = newSeason(1, quiet);
  for (const [season, day, want] of [[2, 4, true], [2, 3, false], [2, 5, false], [1, 4, false], [3, 4, false], [4, 4, false], [6, 4, true]]) {
    t.season = season;
    t.day = day;
    assert.equal(eclipseDue(t), want, `season ${season}, day ${day}`);
  }
  assert.equal(eclipseDue(midsummer(1, { year: 0 })), false);
  assert.equal(eclipseDue(midsummer(1, { eclipse: 0 })), false);
  const old = JSON.parse(JSON.stringify(newSeason(4)));
  for (const k of [old.tuning, old.tuning0]) delete k.eclipse;
  delete old.eclipse;
  const g = upgrade(old);
  assert.equal(g.tuning.eclipse, 0);
  assert.equal(g.eclipse, null);
});

test('while it lasts the day goes on and the Tain wakes: work and day orders, and candles, moves, wards and acts as at night; one tide up the rifts', () => {
  const s = toEclipse(midsummer(2));
  const { from, to } = s.eclipse;
  const T = s.tuning;
  const n = s.night;
  // Half a night's Creepers in one tide, up the rifts, inside the eclipse by the day's clock.
  assert.equal(n.spawns.length, Math.round(T.eclipseCreepers * (T.creepersBase + T.creepersPerNight * 4) * hard(s)));
  assert.ok(n.spawns.every((sp) => sp.type === 'creeper' && sp.at > from && sp.at < to && MAP.rifts.some((r) => r.id === sp.rift)));
  assert.deepEqual(n.marks.map((m) => m.kind), ['tide', 'sun']);
  // The dead stand at their posts, as when a night begins.
  const ds = s.shades.filter(canWork);
  assert.ok(ds.length >= 2);
  for (const d of ds) assert.deepEqual([d.f, d.x], [d.post.f, d.post.x]);
  // Night orders: a candle, a move that walks rather than jumps, a ward on a rift but not the moat, an act.
  const d = ds[0];
  ok(s, { type: 'candle', f: d.post.f, x: d.post.x });
  const to2 = across(s, d);
  ok(s, { type: 'move', id: d.id, ...to2 });
  assert.ok(d.path.length > 0 && d.x !== to2.x, 'it walks there');
  assert.deepEqual(d.post, to2);
  s.res.essence = 20;
  ok(s, { type: 'ward', target: MAP.rifts[0].id });
  assert.match(act(s, { type: 'ward', target: 'moat' }).error, /rifts only/);
  assert.match(act(s, { type: 'startNight' }).error, /dusk/);
  ok(s, { type: 'shadeAct', id: ds.find((x) => x.kind === 'serene' || x.kind === 'loyal').id });
  // Day orders, and the day's work goes on.
  ok(s, { type: 'assign', id: s.living.find((p) => p.age !== 'child').id, room: 'yard' });
  const stone = s.res.stone;
  for (let i = 0; i < 30; i++) step(s);
  assert.ok(s.res.stone > stone, 'the Yard works through the eclipse');
  assert.ok(eclipsing(s));
});

test('anyone who dies in the dark wakes at once, with no funeral, and a Wraith rises where it wakes; after it the dead wait for dusk again', () => {
  const s = toEclipse(midsummer(3));
  s.night.spawns = [];
  s.guidance = 0;
  const [p, q, r] = s.living.filter((x) => x.age !== 'child');
  ok(s, { type: 'debug', what: 'kill', id: p.id, cause: 'duty' });
  assert.ok(!s.bodies.some((b) => b.id === p.id), 'no body in the crypt');
  const d = byId(s.shades, p.id);
  assert.equal(d.kind, 'loyal');
  assert.ok(canWork(d), 'in a mirror, and at work in the Tain at once');
  assert.equal(ledgerOf(s, p.id).eclipse, true);
  assert.match(epitaph(ledgerOf(s, p.id)), /Woke Loyal in the glass, at once, in the eclipse\./);
  assert.match(s.log.at(-1).text, new RegExp(`^${p.name} wakes Loyal in the .*In the eclipse the dead don't wait for dusk\\.$`));
  ok(s, { type: 'debug', what: 'kill', id: q.id, cause: 'yours' });
  assert.equal(byId(s.shades, q.id).kind, 'wraith');
  assert.ok(s.night.foes.some((f) => f.type === 'wraith' && f.shade === q.id), 'its Wraith rises in the Tain');
  while (s.eclipse && s.phase === 'day') step(s);
  assert.deepEqual(s.today.eclipse.woke, [p.id, q.id]);
  ok(s, { type: 'debug', what: 'kill', id: r.id, cause: 'duty' });
  assert.ok(s.bodies.some((b) => b.id === r.id), 'after the eclipse, the crypt again');
});

test('side by side: a living person and their dead in a room and its twin work and fight twice over in the eclipse, and one who stood by their dead through half of it is at peace', () => {
  const s = midsummer(4);
  const osk = s.living.find((p) => p.name === 'Osk');
  const garrick = bondedShade(s, osk);
  assert.equal(garrick?.name, 'Garrick');
  osk.job = 'hearth';
  const h = roomSpan(geo(s), 'hearth');
  ok(s, { type: 'move', id: garrick.id, f: h.f, x: h.x0 + 12 });
  osk.grief = { for: 'x', mult: 0.8 };
  assert.ok(isTwinnedLiving(s, osk));
  const before = livingMult(s, osk);
  toEclipse(s);
  s.night.spawns = []; // nothing to come between them
  const T = s.tuning;
  assert.ok(Math.abs(livingMult(s, osk) / before - T.eclipseTwin / T.twinMult) < 1e-9, 'Osk works twice over, not ×1.25');
  // Garrick strikes a Creeper beside him twice as hard as he would with Osk elsewhere.
  const apart = JSON.parse(JSON.stringify(s));
  apart.living.find((p) => p.name === 'Osk').job = 'yard';
  const hit = (k) => {
    const g = byId(k.shades, garrick.id);
    const c = addFoe(k, 'creeper', g.f, g.x + 2);
    step(k);
    return c.max - c.hp;
  };
  const side = hit(s);
  const alone = hit(apart);
  assert.ok(alone > 0 && Math.abs(side / alone - T.eclipseTwin) < 1e-9, `${side} against ${alone}`);
  s.night.foes = [];
  while (s.eclipse && s.phase === 'day') step(s);
  assert.ok(osk.peace > 0 && !osk.grief, 'at peace, the grief over');
  assert.deepEqual(s.today.eclipse.side, ['Osk (with Garrick)']);
  assert.ok(s.log.some((l) => /Osk \(with Garrick\) stood beside their dead through the dark, and is at peace\./.test(l.text)));
  // Apart, no peace.
  while (apart.eclipse && apart.phase === 'day') step(apart);
  assert.ok(apart.living.find((p) => p.name === 'Osk').grief);
});

test('when the sun comes back the Unlit left burn away, candles still half whole go back to the store, and its cracks count at the next rite', () => {
  const s = toEclipse(midsummer(5));
  s.night.spawns = [];
  const d = s.shades.find(canWork);
  ok(s, { type: 'candle', f: d.post.f, x: d.post.x });
  ok(s, { type: 'candle', f: d.post.f, x: across(s, d).x });
  s.night.candles.at(-1).wax = 10; // burnt low: it stays out
  const candles = s.res.candles;
  while (s.t < s.eclipse.to - 3) step(s);
  addFoe(s, 'creeper', DEEP_FLOOR, MAP.rifts[0].x); // still climbing when the sun comes back
  while (s.eclipse && s.phase === 'day') step(s);
  const e = s.today.eclipse;
  assert.equal(s.night, null);
  assert.equal(s.eclipse, null);
  assert.equal(e.back, 1);
  assert.equal(s.res.candles, candles + 1 + e.wick);
  assert.equal(e.burned, 1, 'the late one burned away');
  assert.match(s.log.at(-1).text, /^The sun comes back\. One of the Unlit left in the Tain burns away, and a candle still half whole goes back to the store\./);
  // Nobody in the Tain: the tide climbs to the Veil and cracks it. The rite that dawn counts those cracks with
  // the night's, of which there are none.
  const k = toEclipse(midsummer(6, { cracksMax: 99 }));
  for (const x of k.shades) x.hidden = true;
  while (k.eclipse && k.phase === 'day') step(k);
  const cracks = k.today.eclipse.cracks;
  assert.ok(cracks > 0, 'the Veil cracked');
  for (const x of k.shades) x.hidden = false;
  while (k.phase === 'day') step(k);
  if (k.dusk.step === 'crypt') ok(k, { type: 'wake' });
  ok(k, { type: 'startNight' });
  k.night.spawns = [];
  while (k.phase === 'night') step(k);
  assert.equal(k.phase, 'dawn');
  assert.equal(k.rite.cracks, cracks);
});

test('an eclipse replays exactly, and its Unlit come from a stream of their own', () => {
  // The autopilot through midsummer, candles and moves in the eclipse and all.
  const s = newSeason(7);
  for (let i = 0; i < 3e6 && !(s.season === 2 && s.day === 5) && s.phase !== 'over'; i++) {
    if (s.phase === 'end') ok(s, { type: 'nextSeason' });
    else autoStep(s);
  }
  assert.ok(s.days.some((d) => d.season === 2 && d.day === 4 && d.eclipse), 'it met the eclipse');
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.log.length, r.res, r.shades.map((d) => [d.id, d.memory])], [s.log.length, s.res, s.shades.map((d) => [d.id, d.memory])]);
  // With it or without, the same keep up to the moment the sun goes dark, and the same stream after.
  const a = midsummer(8);
  const b = midsummer(8, { eclipse: 0 });
  toEclipse(a);
  while (b.t < a.t) step(b);
  assert.equal(a.rng, b.rng);
  // The whole year runs either way.
  assert.ok(runSeasonAuto(9, { seasons: 4 }).days.some((d) => d.eclipse));
});
