import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSeason, step, act, replay, ritePreview, crossingPreview, capacity, canWork, defense, bear, dayTicks, nightTicks, addCreeper,
  lastSeason, kill, byId, addFoe, retune, playerTuning, jobCap, jobCount, nextSlot, roomPower, upgrade,
} from '../src/slice/sim.js';
import { runSeasonAuto, autoStep, PLANS } from '../src/slice/autopilot.js';
import { epitaph } from '../src/slice/book.js';
import { MAP, TUNING, START_SHADES, BUILDABLE } from '../src/slice/data.js';
import {
  geoOf, geo, typeAt, roomsOf, mirrorGoals, MAX_FLOORS, lightMap, isLit, roomAt, route, darkRooms, darkGaps, roomSpan, feet as feetG, MODES, toView, fromView, floorAtY as floorAtYG,
  unitAt as unitAtG, VIEW_H, DEEP_FLOOR, lineSpots, guardLit,
} from '../src/slice/geo.js';

// The starting keep's geometry, for the tests that check geometry on its own.
const G0 = geoOf();
const VEIL_FLOOR = G0.veil;
const feet = (f) => feetG(G0, f);
const floorAtY = (y) => floorAtYG(G0, y);
const unitAt = (u, a) => unitAtG(G0, u, a);

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Most of these tests are about the rules on the original four-floor keep; seasons now start from two rooms.
const FULL = { startFloors: 4 };
const quiet = { ...FULL, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } };
function toDusk(s) {
  while (s.phase === 'day') step(s);
  assert.equal(s.phase, 'dusk');
}
function toNight(s) {
  toDusk(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
}
function toDawn(s) {
  while (s.phase === 'night') step(s);
}
function stepFor(s, secs) {
  for (let i = 0; i < secs * 10 && (s.phase === 'night' || s.phase === 'day'); i++) step(s);
}
// A night with no Creepers, for testing one thing at a time.
function emptyNight(s) {
  toNight(s);
  s.night.spawns = [];
}

test('a season opens with the cast, the last keeper\'s dead and two mirrors', () => {
  const s = newSeason(1);
  assert.equal(s.living.length, 8);
  assert.equal(s.shades.length, START_SHADES.length);
  assert.ok(s.shades.every(canWork));
  const { cap, used } = capacity(s);
  assert.equal(cap, 3);
  assert.equal(used, 2);
  const osk = s.living.find((p) => p.name === 'Osk');
  const garrick = s.shades.find((d) => d.name === 'Garrick');
  assert.equal(osk.bond.with, garrick.id, 'Osk and his father are bonded across the Veil');
  assert.equal(s.phase, 'day');
  assert.equal(s.day, 1);
});

test('seeded runs are identical, and the action log replays to the same state', () => {
  for (const plan of ['balanced', 'keeper']) {
    const a = runSeasonAuto(7, { plan });
    const b = runSeasonAuto(7, { plan });
    assert.deepEqual(a, b);
    const r = replay(a.seed, a.tuning0, a.actions);
    while (r.phase === 'day' || r.phase === 'night') step(r); // the run ended between actions
    assert.equal(JSON.stringify(r), JSON.stringify(a), `${plan}: replay matches`);
  }
});

test('the day feeds, makes candles and glass, and raids escalate through the season', () => {
  const s = newSeason(2, { ...FULL, sickChance: 0, oldAgeChance: 0 });
  const food = s.res.food;
  const candles = s.res.candles;
  toDusk(s);
  assert.ok(Math.abs(s.res.food - (food + 2 * 4 - 8)) < 1e-6, 'two cooks feed eight');
  assert.ok(Math.abs(s.res.candles - (candles + 3)) < 1e-6, 'one chandler makes three candles');
  const t = TUNING.raidDays;
  assert.ok(t[2] < t[4] && t[4] < t[6], 'raid strength grows on days 2, 4 and 6');
  const later = newSeason(2, { sickChance: 0, oldAgeChance: 0 });
  later.season = 2;
  later.day = 2;
  assert.equal(later.raid, null);
});

test('the dead cross at dusk: a funeral, a mirror, and Restless when the mirrors are full', () => {
  const s = newSeason(3, quiet);
  stepFor(s, 5);
  const [a, b, c] = s.living.filter((p) => p.job !== 'chapel');
  kill(s, a, 'duty');
  kill(s, b, 'oldage');
  kill(s, c, 'neglect');
  toDusk(s);
  ok(s, { type: 'funeral', id: c.id, on: true });
  const plan = crossingPreview(s);
  assert.deepEqual(plan.map((x) => x.to), ['mirror', 'overflow', 'funeral'], 'one space left, one funeral a day for one priest');
  ok(s, { type: 'wake' });
  assert.equal(byId(s.shades, a.id).kind, 'loyal');
  assert.equal(byId(s.shades, b.id).kind, 'restless');
  assert.equal(byId(s.shades, b.id).trueKind, 'serene');
  assert.ok(!byId(s.shades, c.id), 'the one given a funeral is at rest');
  assert.ok(s.res.remembrance >= 1);
});

test('a candle lights only its own room, and rifts drink the light', () => {
  const T = TUNING;
  const L = lightMap(G0, T, [{ id: 'k', f: 1, x: 50, wax: T.candleWax, max: T.candleWax }]);
  assert.ok(isLit(L, 1, 45));
  assert.ok(!isLit(L, 1, 60), 'the wall stops it');
  const D = lightMap(G0, T, [{ id: 'k', f: DEEP_FLOOR, x: 14, wax: T.candleWax, max: T.candleWax }]);
  assert.ok(!isLit(D, DEEP_FLOOR, MAP.rifts[0].x));
  assert.ok(isLit(D, DEEP_FLOOR, 25));
  const dark = darkRooms(G0, D);
  assert.ok(!dark.some(([f, id]) => f === DEEP_FLOOR && id === 'chapel'));
  assert.ok(!dark.some(([f]) => f === VEIL_FLOOR), 'nothing seeps up under the Veil');
  assert.ok(darkGaps(G0, D).some(([f, a]) => f === DEEP_FLOOR && a >= 6), 'the unlit stretch by the rift is a gap');
});

test('Creepers climb to the mirrors in the dark, and a lit stair turns them aside', () => {
  const T = TUNING;
  const dark = lightMap(G0, T, []);
  const r = route(G0, dark, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }], { creeper: true });
  assert.ok(r && r.path.filter((p) => p.climb).length === 3, 'three climbs from the Deep to the Veil');
  const line = G0.stairs.filter((st) => st.f === VEIL_FLOOR - 1).map((st, i) => ({ id: 'k' + i, f: st.f, x: st.x, wax: T.candleWax, max: T.candleWax }));
  const lit = lightMap(G0, T, line);
  assert.equal(route(G0, lit, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }], { creeper: true }), null, 'no dark way past the line');
  assert.ok(route(G0, lit, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }]), 'shades walk through light');
});

test('a Creeper that reaches a mirror cracks the Veil, and five cracks lose the keep', () => {
  const s = newSeason(4, quiet);
  emptyNight(s);
  for (let i = 0; i < 5; i++) addCreeper(s, VEIL_FLOOR, 50 + i * 2);
  s.shades.forEach((d) => Object.assign(d, { f: 0, x: 80, post: { f: 0, x: 80 } }));
  stepFor(s, 20);
  assert.equal(s.phase, 'over');
  assert.equal(s.over.reason, 'veil');
  assert.equal(lastSeason(s).lost, 'veil');
  assert.equal(act(s, { type: 'candle', f: 1, x: 20 }).ok, false, 'a lost keep takes no actions');
  assert.ok(act(s, { type: 'answer', answer: 'again', note: 'one more try' }).ok, 'but the playtest question is still asked');
});

test('a shade in the light holds it: Creepers that gnaw its edge are cut down', () => {
  const s = newSeason(5, quiet);
  emptyNight(s);
  ok(s, { type: 'candle', f: 2, x: 16 });
  ok(s, { type: 'candle', f: 2, x: 96 });
  stepFor(s, 1);
  for (let i = 0; i < 3; i++) addCreeper(s, 2, 44 + i);
  stepFor(s, 25);
  assert.equal(s.night.foes.length, 0);
  assert.equal(s.night.stats.crossed, 0);
  assert.equal(s.night.stats.killed, 3);
  assert.ok(s.night.candles[0].wax > 0);
});

test('twin rooms work only for a lit shade at its post: Choir, Wick Room, Watch and Cold Hearth', () => {
  const s = newSeason(6, quiet);
  toDusk(s);
  const [g, h] = s.shades;
  const choir = roomSpan(G0, 'chapel');
  const hearth = roomSpan(G0, 'hearth');
  ok(s, { type: 'move', id: h.id, f: choir.f, x: 40 });
  ok(s, { type: 'move', id: g.id, f: hearth.f, x: 20 });
  ok(s, { type: 'candle', f: hearth.f, x: 20 });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const e0 = s.res.essence;
  toDawn(s);
  assert.equal(s.res.essence, e0, 'no candle in the Choir, no essence');
  const fading = s.today.night.fading;
  assert.equal(fading.find((x) => x.id === g.id).rested, true, 'the Cold Hearth halves fading');
  assert.equal(fading.find((x) => x.id === g.id).fade, TUNING.fadePerNight / 2);
  assert.equal(fading.find((x) => x.id === h.id).fade, TUNING.fadePerNight / 2, 'Hesper is named: half fading');

  const t = newSeason(6, quiet);
  toDusk(t);
  const [a, b] = t.shades;
  ok(t, { type: 'move', id: a.id, f: 2, x: 44 }); // the Watch, away from the stair up to the Veil
  ok(t, { type: 'candle', f: 2, x: 44 });
  ok(t, { type: 'move', id: b.id, f: choir.f, x: 40 });
  ok(t, { type: 'candle', f: choir.f, x: 40 });
  ok(t, { type: 'startNight' });
  t.night.spawns = [];
  toDawn(t);
  assert.ok(t.res.essence > 5, 'a Serene shade sings essence all night');
  assert.ok(t.watchBonus > 2, "the Watch adds to tomorrow's defense");
  ok(t, { type: 'beginDay' });
  assert.ok(defense(t) >= 4 + t.watchBonus - 1e-9);
});

test('with lineGuard on, a shade in the light at the foot of a stair up to the Veil guards the line: it fights and keeps the Watch, but does no other work', () => {
  // Two rooms built on the ground floor's keep, a Barracks and a Chapel: that floor is the line's, and the Choir is on it.
  const night = (x, over = {}) => {
    const s = newSeason(30, { sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, lineGuard: 1, ...over });
    s.res.stone = 2 * s.tuning.roomStone;
    ok(s, { type: 'raise', room: 'barracks' });
    ok(s, { type: 'raise', room: 'chapel' });
    toDusk(s);
    const [g, h] = s.shades;
    ok(s, { type: 'move', id: g.id, f: 0, x: 20 }); // the Watch, by the left stair
    ok(s, { type: 'candle', f: 0, x: 20 });
    ok(s, { type: 'move', id: h.id, f: 0, x }); // the Choir
    ok(s, { type: 'candle', f: 0, x });
    if (x < 76) ok(s, { type: 'candle', f: 0, x: 96 }); // the right stair lit too
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    const G = geo(s);
    const guarding = guardLit(G, lightMap(G, s.tuning, s.night.candles), 0, x);
    addCreeper(s, 0, 100);
    const e0 = s.res.essence;
    toDawn(s);
    return { guarding, essence: s.res.essence - e0, watch: s.watchBonus, killed: s.today.night.killed };
  };
  const by = night(92);
  assert.ok(by.guarding, 'the Choir by the stair is in guard light');
  assert.equal(by.essence, 0, 'guarding, not singing');
  assert.equal(by.killed, 1, 'but it fights');
  assert.ok(by.watch > 1, 'guarding the line is keeping the Watch');
  const away = night(64);
  assert.ok(!away.guarding);
  assert.ok(away.essence > 3, 'under its own candle, away from the stair, it sings');
  assert.ok(night(92, { lineGuard: 0 }).essence > 3, 'lineGuard 0, the default, turns the rule off');
  assert.equal(TUNING.lineGuard, 0);
});

test('the rite: keeping costs Dread, the living bear some, vigils and covering bring it down', () => {
  const s = newSeason(8, quiet);
  toNight(s);
  s.night.spawns = [];
  toDawn(s);
  assert.equal(s.phase, 'dawn');
  const P = ritePreview(s);
  assert.equal(P.dread.keep, 2);
  assert.equal(P.dread.bear, bear(s));
  assert.equal(P.dread.to, Math.max(0, 2 - bear(s)));
  s.dread = 4;
  s.res.remembrance = 3;
  ok(s, { type: 'vigils', n: 1 });
  ok(s, { type: 'rite', id: s.shades[0].id, choice: 'cover' });
  const Q = ritePreview(s);
  assert.equal(Q.dread.to, Math.max(0, 4 + 1 - bear(s) - 1));
  assert.equal(Q.rem, 1);
  ok(s, { type: 'vigils', n: 2 });
  assert.ok(ritePreview(s).errors.length, 'two vigils need six remembrance');
  assert.equal(act(s, { type: 'beginDay' }).ok, false);
  ok(s, { type: 'vigils', n: 1 });
  ok(s, { type: 'beginDay' });
  assert.equal(s.shades.length, 1);
  assert.equal(s.day, 2);
});

test('the Lantern Church: announced before day 5, verdict by Dread at noon', () => {
  for (const [dread, verdict] of [[0, 'blessed'], [3, 'warned'], [5, 'censured']]) {
    const s = newSeason(9, quiet);
    while (s.day < 5) {
      if (s.phase === 'dawn') {
        s.shades.forEach((d) => (s.rite.choice[d.id] = 'keep'));
        ok(s, { type: 'beginDay' });
      } else if (s.phase === 'dusk') {
        if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
        ok(s, { type: 'startNight' });
        s.night.spawns = [];
      } else step(s);
    }
    assert.equal(s.inspection.day, 5);
    assert.equal(s.inspection.reason, 'season');
    s.dread = dread;
    s.res.essence = 6;
    const shades = s.shades.length;
    stepFor(s, TUNING.daySecs * TUNING.inspectAt + 1);
    assert.equal(s.inspection.verdict, verdict);
    if (verdict === 'censured') {
      assert.equal(s.dread, 2);
      assert.ok(s.shades.length < shades, 'the fullest mirror is covered and taken');
      assert.equal(s.mirrors.length, 1);
    }
    if (verdict === 'warned') assert.equal(s.res.essence, 1, 'a tithe of five essence');
  }
});

test('Dread at its height brings an inspector the same day', () => {
  const s = newSeason(10, { ...quiet, dreadLivingPer: 100 });
  toNight(s);
  s.night.spawns = [];
  toDawn(s);
  s.dread = 5;
  assert.equal(ritePreview(s).dread.to, 5, 'two kept, one priest bears one');
  ok(s, { type: 'beginDay' });
  assert.equal(s.inspection.reason, 'dread');
  assert.equal(s.inspection.day, s.day);
});

// A night with the two stairs up to the Veil lit, and a Maw on the floor below them.
function mawNight(seed, posts) {
  const s = newSeason(seed, quiet);
  emptyNight(s);
  ok(s, { type: 'candle', f: 2, x: 16 });
  ok(s, { type: 'candle', f: 2, x: 96 });
  s.shades.forEach((d, i) => Object.assign(d, posts[i] ? { f: posts[i].f, x: posts[i].x, post: posts[i] } : { f: 3, x: 70 + i * 6, post: { f: 3, x: 70 + i * 6 } }));
  const maw = addFoe(s, 'maw', 1, 30);
  return { s, maw };
}

test('a Maw walks through the light to the candle barring the way up, and tears it down unopposed', () => {
  const { s, maw } = mawNight(21, []);
  const line = s.night.candles.find((k) => k.f === 2 && k.x === 16);
  stepFor(s, 4);
  assert.equal(maw.gnaw, line.id, 'it goes for the candle on the Creepers\' way up');
  stepFor(s, 20);
  assert.ok(!s.night.candles.includes(line), 'the candle is torn down');
  assert.equal(s.night.stats.smashed, 1);
  assert.ok(maw.hp > 0, 'light does not burn it');
});

test('a Loyal shade holding the light cuts a Maw down before it finishes', () => {
  const { s, maw } = mawNight(22, [{ f: 2, x: 16 }]);
  const line = s.night.candles.find((k) => k.f === 2 && k.x === 16);
  stepFor(s, 25);
  assert.ok(maw.hp <= 0 || !s.night.foes.includes(maw), 'the Maw is cut down');
  assert.ok(s.night.candles.includes(line) && line.wax > 0, 'the candle survives');
  assert.equal(s.night.stats.smashed, 0);
});

test('wards on the stairs keep a Maw below them', () => {
  const { s } = mawNight(23, []);
  s.res.essence = 20;
  ok(s, { type: 'ward', target: 's3' });
  ok(s, { type: 'ward', target: 's4' });
  stepFor(s, 25);
  assert.equal(s.night.stats.smashed, 0);
  assert.equal(s.night.candles.length, 2);
});

// A doubled line on the left stair up to the Veil, three chandlers by day, and a Maw at a rift.
function thickLine(seed) {
  const s = newSeason(seed, quiet);
  emptyNight(s);
  ok(s, { type: 'candle', f: 2, x: 16 });
  ok(s, { type: 'candle', f: 2, x: 96 });
  const [a, b] = s.shades;
  Object.assign(a, { f: 2, x: 16, post: { f: 2, x: 16 } });
  Object.assign(b, { f: 2, x: 18, post: { f: 2, x: 18 } });
  s.living.forEach((p, i) => (p.job = i < 3 ? 'chandlery' : null));
  const maw = addFoe(s, 'maw', DEEP_FLOOR, 12);
  return { s, maw, a, b, wick: roomAt(geo(s), 1, 30) };
}

test('a Maw passes a thick line for a room the line left bare, breaks it, and the keep pays in Dread', () => {
  const { s, maw, b, wick } = thickLine(25);
  stepFor(s, 2);
  assert.deepEqual([maw.target.kind, maw.target.id], ['room', wick], 'three chandlers\' room, and no one on the way');
  stepFor(s, 20);
  assert.deepEqual(s.night.broken, [wick]);
  assert.equal(s.night.stats.smashed, 0, 'the line is left alone');
  // A broken room: a lit shade at its post there does no work for the rest of the night.
  s.night.foes = [];
  Object.assign(b, { f: 1, x: 30, ox: 30, of: 1, post: { f: 1, x: 30 }, path: [] });
  ok(s, { type: 'candle', f: 1, x: 30 });
  stepFor(s, 10);
  assert.equal(s.night.stats.wick, 0);
  toDawn(s);
  assert.deepEqual(s.haunted, [wick]);
  assert.equal(ritePreview(s).dread.broken, TUNING.dreadPerBroken, 'Dread for the haunting at dawn');
  ok(s, { type: 'beginDay' });
  assert.ok(s.log.some((l) => /Chandlery is haunted/.test(l.text)));
  toDusk(s);
  assert.deepEqual(s.haunted, [], 'the haunting lifts at dusk');
});

test('once on its target\'s floor a Maw keeps to it, however many come to meet it', () => {
  const { s, maw, a, b, wick } = thickLine(26);
  for (let i = 0; i < 100 && maw.f !== 1; i++) step(s);
  assert.equal(maw.f, 1);
  // Everyone leaves the line for the Wick Room: the line is bare, but the Maw is committed.
  for (const [d, x] of [[a, 34], [b, 38]]) Object.assign(d, { f: 1, x, ox: x, of: 1, post: { f: 1, x }, path: [] });
  ok(s, { type: 'candle', f: 1, x: 36 });
  stepFor(s, 1);
  assert.equal(maw.target.id, wick);
  stepFor(s, 12);
  assert.ok(!s.night.foes.includes(maw), 'and they cut it down');
  assert.deepEqual(s.night.broken, []);
});

test('a room holds roomCap workers; in a haunted room they make hauntWork of their work', () => {
  const s = newSeason(27, quiet);
  s.living.forEach((p) => (p.job = 'hearth'));
  s.living[0].sick = 5; // the strongest work: the sick cook is the one left over
  assert.equal(roomPower(s).hearth, 3, 'three of eight cook; the rest stand idle');
  s.haunted = ['hearth'];
  assert.equal(roomPower(s).hearth, 3 * TUNING.hauntWork);
  s.tuning.hauntWork = 0;
  assert.equal(roomPower(s).hearth, 0);
});

test('Maws come one a night from night 3, but not on the new moon', () => {
  const count = (day) => {
    const s = newSeason(24, quiet);
    s.day = day;
    toDusk(s);
    return s.night.spawns.filter((x) => x.type === 'maw').length;
  };
  assert.equal(count(2), 0);
  assert.equal(count(3), TUNING.mawsPerNight);
  assert.equal(count(6), TUNING.mawsPerNight);
  assert.equal(count(7), 0);
});

test('the Hollow: wards hold it a while, it eats light, and at the Veil it takes one of the living', () => {
  const s = newSeason(11, quiet);
  s.day = 7;
  s.night = null;
  toNight(s);
  s.night.spawns = s.night.spawns.filter((x) => x.type === 'hollow').map((x) => ({ ...x, at: 1 }));
  s.shades.forEach((d) => Object.assign(d, { f: 0, x: 50, post: { f: 0, x: 50 } }));
  s.res.essence = 20;
  step(s);
  step(s);
  const h = s.night.foes.find((f) => f.type === 'hollow');
  assert.ok(h);
  for (const st of geo(s).stairs.filter((x) => x.f === h.f)) ok(s, { type: 'ward', target: st.id });
  ok(s, { type: 'candle', f: h.f, x: h.x + 8 < 54 ? h.x + 8 : h.x - 8 });
  stepFor(s, 5);
  assert.ok(s.night.candles.length === 0 || s.night.candles[0].wax < TUNING.candleWax - 40, 'it eats the candle');
  assert.equal(h.mode, 'batter');
  const living = s.living.length;
  stepFor(s, TUNING.wardHold + 60);
  assert.ok(s.log.some((l) => l.text.startsWith('The Hollow breaks the ward')));
  stepFor(s, 60);
  assert.equal(s.night?.stats.hollow ?? s.today.night.hollow, 'crossed');
  assert.equal(s.living.length, living - 1);
  assert.equal(s.phase, 'end');
});

test('driving the Hollow back pays remembrance', () => {
  const s = newSeason(12, quiet);
  s.day = 7;
  s.night = null;
  toNight(s);
  s.night.spawns = s.night.spawns.filter((x) => x.type === 'hollow').map((x) => ({ ...x, at: 1 }));
  step(s);
  step(s);
  const h = s.night.foes.find((f) => f.type === 'hollow');
  h.hp = 0.1;
  for (const d of s.shades) Object.assign(d, { f: h.f, x: h.x + 5.5, post: { f: h.f, x: h.x + 5.5 }, path: [] });
  const rem = s.res.remembrance;
  stepFor(s, 2);
  assert.equal(s.night.stats.hollow, 'driven back');
  assert.equal(s.res.remembrance, rem + TUNING.hollowReward);
});

test('after the new moon the season ends, takes the answer, and a second season is harder', () => {
  const s = runSeasonAuto(3, { plan: 'balanced' });
  assert.equal(s.phase, 'end', 'this seed survives the new moon');
  const e = lastSeason(s);
  assert.equal(e.season, 1);
  assert.ok(e.summary.raids.length === 3);
  ok(s, { type: 'answer', answer: 'again', note: 'wanted to try the Hollow again' });
  assert.equal(lastSeason(s).answer, 'again');
  s.cracks = 3; // however the new moon left it
  ok(s, { type: 'nextSeason' });
  assert.equal(s.phase, 'dawn');
  assert.equal(s.season, 2);
  assert.equal(s.cracks, 0, 'the Veil starts a new season whole');
  ok(s, { type: 'beginDay' });
  assert.equal(s.day, 1);
  while (s.day < 2) autoStep(s);
  assert.ok(s.raid.strength >= (TUNING.raidDays[2] - TUNING.raidSpread) * TUNING.hardness - 1e-9);
});

test('an older save takes the current defaults, keeps the player\'s own settings, and still replays', () => {
  // As an older build would have started it, before these numbers changed.
  const s = newSeason(9, { hardness: 1.35, creepersPerNight: 2.5 });
  ok(s, { type: 'tune', key: 'daySecs', value: 30 });
  ok(s, { type: 'tune', key: 'hardness', value: 1.5 });
  while (s.day < 2) autoStep(s);
  assert.equal(retune(s, TUNING), 1, 'only creepersPerNight: the player set hardness');
  assert.equal(s.tuning.creepersPerNight, TUNING.creepersPerNight);
  assert.equal(s.tuning.hardness, 1.5);
  assert.equal(s.tuning.daySecs, 30);
  assert.equal(retune(s, TUNING), 0, 'a second load changes nothing');
  while (s.day < 3) autoStep(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  for (const k of ['season', 'day', 'phase', 't', 'rng']) assert.equal(r[k], s[k], k);
  assert.deepEqual(r.res, s.res);
  assert.deepEqual(r.tuning, s.tuning);
  assert.deepEqual(playerTuning(s), { daySecs: 30, hardness: 1.5 });
  const fresh = newSeason(1, playerTuning(s));
  assert.equal(fresh.tuning.creepersPerNight, TUNING.creepersPerNight, 'a new keep starts from the current defaults');
  assert.equal(fresh.tuning.daySecs, 30, 'with the player\'s own settings');
});

test('a season starts from two rooms: whoever has no room quarries, and the dead hold the line between rift and mirror', () => {
  const s = newSeason(1);
  const G = geo(s);
  assert.equal(G.n, 1);
  assert.deepEqual(s.keep.floors[0].map((r) => r.type), ['hearth', 'crypt']);
  assert.equal(G.deep, G.veil, 'the rifts and the mirrors share the one floor');
  assert.equal(G.stairs.length, 0);
  assert.deepEqual(s.living.filter((p) => p.job !== 'yard').map((p) => p.job), ['hearth', 'hearth']);
  const pw = roomPower(s);
  assert.equal(pw.hearth, 2);
  assert.equal(pw.yard, 6);
  assert.equal(pw.barracks + pw.chapel + pw.chandlery, 0, 'no room, no work');
  assert.ok(s.res.stone >= s.tuning.roomStone, 'the first room can go up at once');
  const line = lineSpots(G);
  s.shades.forEach((d, i) => {
    assert.equal(d.post.f, 0);
    assert.ok(Math.abs(d.post.x - line[i].x) <= 2, `${d.name} on the line`);
  });
  ok(s, { type: 'assign', id: s.living[0].id, room: 'yard' });
  assert.match(act(s, { type: 'assign', id: s.living[0].id, room: 'barracks' }).error, /no Barracks yet/);
  ok(s, { type: 'raise', room: 'barracks' });
  ok(s, { type: 'assign', id: s.living[0].id, room: 'barracks' });
  assert.equal(geo(s).n, 2);
});

test('a one-floor Tain: a candle between each rift and its mirror, and a shade in its light, hold the night', () => {
  const run = (lit) => {
    const s = newSeason(9, { sickChance: 0, oldAgeChance: 0 });
    toNight(s);
    s.night.spawns = [];
    if (lit) for (const p of lineSpots(geo(s))) ok(s, { type: 'candle', f: p.f, x: p.x });
    for (const r of MAP.rifts) for (let i = 0; i < 2; i++) addCreeper(s, 0, r.x);
    stepFor(s, 40);
    return s.night.stats;
  };
  const held = run(true);
  assert.equal(held.crossed, 0);
  assert.equal(held.killed, 4);
  assert.ok(run(false).crossed > 0, 'in the dark they reach the mirrors in moments');
});

test('a Maw takes mawRise seconds to haul itself out of its rift, and does nothing until then', () => {
  const s = newSeason(28, quiet);
  toNight(s);
  s.night.spawns = [{ at: 1, type: 'maw', seep: false, snuff: false, rift: 'r1' }];
  step(s);
  const maw = s.night.foes.find((f) => f.type === 'maw');
  assert.ok(maw && maw.rising > 0);
  assert.ok(s.log.some((l) => /hauling itself out of the left rift/.test(l.text)));
  const x = maw.x;
  stepFor(s, TUNING.mawRise - 0.5);
  assert.equal(maw.x, x, 'still in its rift');
  stepFor(s, 3);
  assert.ok(maw.target, 'then it picks what to go for');
});

test('an older save keeps the four floors it started with, and still replays', () => {
  const s = newSeason(29, { ...quiet, creepersBase: 0, creepersPerNight: 0 });
  toNight(s);
  toDawn(s);
  ok(s, { type: 'beginDay' });
  const old = JSON.parse(JSON.stringify(s));
  delete old.keep;
  delete old.haunted;
  for (const t of [old.tuning, old.tuning0]) delete t.startFloors;
  const g = upgrade(old);
  assert.equal(geo(g).n, 4);
  assert.equal(g.tuning0.startFloors, 4);
  const r = replay(g.seed, g.tuning0, g.actions);
  while (r.t < s.t) step(r);
  assert.deepEqual(r.keep, s.keep);
  assert.deepEqual(r.res, s.res);
});

test('masons raise rooms on top of the keep: a floor with a bare hall, then the hall, and the shades keep their places', () => {
  const s = newSeason(4, quiet);
  const T = s.tuning;
  assert.equal(s.res.stone, T.startStone);
  s.res.stone = T.roomStone - 1;
  assert.equal(act(s, { type: 'raise', room: 'barracks' }).error, `A room takes ${T.roomStone} stone.`);
  s.res.stone = 3 * T.roomStone;
  assert.match(act(s, { type: 'raise', room: 'crypt' }).error, /cannot be built/);
  const before = s.shades.map((d) => typeAt(geo(s), d.post.f, d.post.x));
  ok(s, { type: 'raise', room: 'barracks' });
  let G = geo(s);
  assert.equal(G.n, 5);
  assert.deepEqual(s.keep.floors[0].map((r) => r.type), ['barracks', 'empty']);
  assert.equal(s.keep.floors[0][0].id, 'barracks2', 'a second Barracks gets its own id');
  assert.deepEqual(s.shades.map((d) => typeAt(G, d.post.f, d.post.x)), before, 'every post is still in the same room');
  assert.equal(s.res.stone, 2 * T.roomStone);
  ok(s, { type: 'raise', room: 'forge' });
  G = geo(s);
  assert.equal(G.n, 5, 'the bare hall is built into, not a new floor');
  assert.deepEqual(s.keep.floors[0].map((r) => r.id), ['barracks2', 'forge']);
  ok(s, { type: 'raise', room: 'cellar' });
  assert.equal(geo(s).n, 6);
  assert.deepEqual(nextSlot(s), { newFloor: false, slot: 1 });
  toDusk(s);
  assert.match(act(s, { type: 'raise', room: 'cellar' }).error, /by day/);
});

test('a built keep keeps its shape: rifts on the top floor, mirrors under the Veil, two stairs between every pair of floors', () => {
  const s = newSeason(4, quiet);
  s.res.stone = 99;
  for (let i = 0; i < 5; i++) ok(s, { type: 'raise', room: BUILDABLE[i % BUILDABLE.length] });
  const G = geo(s);
  assert.equal(G.n, 7);
  assert.equal(G.veil, G.n - 1);
  assert.equal(G.floors[G.veil].y, MAP.floors[3].y, 'the ground floor stays where it was');
  for (let f = 0; f < G.n - 1; f++) assert.equal(G.stairs.filter((st) => st.f === f).length, 2, `floor ${f}`);
  assert.equal(new Set(G.stairs.map((st) => st.id)).size, G.stairs.length);
  assert.equal(new Set(Object.keys(G.rooms)).size, 2 * G.n);
  // In the dark, a Creeper from the Deep finds a way to a mirror; with the line lit, no dark way remains.
  const dark = lightMap(G, s.tuning, []);
  assert.ok(route(G, dark, { f: 0, x: 12 }, mirrorGoals(G), { creeper: true }));
  const line = G.stairs.filter((st) => st.f === G.veil - 1).map((st, i) => ({ id: 'k' + i, f: st.f, x: st.x, wax: 120, max: 120 }));
  assert.equal(route(G, lightMap(G, s.tuning, line), { f: 0, x: 12 }, mirrorGoals(G), { creeper: true }), null);
  // Nothing past the top.
  while (nextSlot(s)) {
    s.res.stone = 99;
    ok(s, { type: 'raise', room: 'granary' });
  }
  assert.equal(geo(s).n, MAX_FLOORS);
  assert.match(act(s, { type: 'raise', room: 'granary' }).error, /no higher/);
});

test('each room holds three workers; building another lets the job grow, and the Yard takes anyone', () => {
  const s = newSeason(4, quiet);
  const T = s.tuning;
  const others = s.living.filter((p) => p.job !== 'barracks');
  let guards = jobCount(s, 'barracks');
  for (const p of others) {
    if (guards >= jobCap(s, 'barracks')) break;
    ok(s, { type: 'assign', id: p.id, room: 'barracks' });
    guards++;
  }
  assert.equal(jobCount(s, 'barracks'), T.roomCap);
  const extra = s.living.find((p) => p.job !== 'barracks');
  assert.match(act(s, { type: 'assign', id: extra.id, room: 'barracks' }).error, /Barracks is full: 3 work there/);
  assert.match(act(s, { type: 'assign', id: extra.id, room: 'forge' }).error, /no Forge yet/);
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'barracks' });
  ok(s, { type: 'assign', id: extra.id, room: 'barracks' });
  assert.equal(jobCap(s, 'barracks'), 2 * T.roomCap);
  for (const p of s.living) ok(s, { type: 'assign', id: p.id, room: 'yard' });
  assert.equal(jobCount(s, 'yard'), s.living.length);
  const stone = s.res.stone;
  while (s.phase === 'day') step(s);
  assert.ok(Math.abs(s.res.stone - (stone + s.living.length * 2)) < 0.01, 'masons quarry 2 stone a day each');
});

test('grave-steel: a shade who forges through half the night arms the dead for the next night', () => {
  const s = newSeason(4, { ...quiet, creepersBase: 0, creepersPerNight: 0, mawFrom: 99 });
  s.res.stone = 99;
  ok(s, { type: 'raise', room: 'forge' });
  const G = geo(s);
  const forge = roomsOf(G, 'forge')[0];
  toDusk(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const smith = s.shades.find((d) => d.mirror && d.kind === 'serene');
  ok(s, { type: 'move', id: smith.id, f: forge.f, x: forge.x0 + 30 });
  ok(s, { type: 'candle', f: forge.f, x: forge.x0 + 30 });
  ok(s, { type: 'startNight' });
  assert.equal(s.night.steel, false);
  toDawn(s);
  assert.equal(s.steel, true);
  assert.ok(s.log.some((l) => /Grave-steel/.test(l.text)));
  ok(s, { type: 'beginDay' });
  toNight(s);
  assert.equal(s.night.steel, true, 'this night the dead fight harder');
});

test('a Cellar keeps half the candles and glass from raiders who break in', () => {
  const loot = (cellar) => {
    const s = newSeason(9, { ...quiet, raidDays: { 2: 40, 4: 0, 6: 0 }, raidSpread: 0 });
    if (cellar) {
      s.res.stone = 99;
      ok(s, { type: 'raise', room: 'cellar' });
    }
    emptyNight(s);
    toDawn(s);
    ok(s, { type: 'beginDay' });
    assert.equal(s.day, 2);
    s.res.candles = 20;
    s.res.glass = 20;
    while (!s.today.raid && s.phase === 'day') step(s);
    assert.equal(s.today.raid.held, false);
    const [, glass, candles] = s.log.map((l) => l.text.match(/carried off \d+ food, (\d+) glass and (\d+) candles/)).find(Boolean);
    return [Number(candles), Number(glass)];
  };
  const [c0, g0] = loot(false);
  const [c1, g1] = loot(true);
  assert.ok(c0 > 0 && g0 > 0);
  assert.equal(c1, Math.floor(c0 / 2));
  assert.equal(g1, Math.floor(g0 / 2));
});

test('a season with building replays exactly', () => {
  const s = runSeasonAuto(12, { plan: 'balanced' });
  assert.ok(s.actions.some(({ a }) => a.type === 'raise'), 'the autopilot built something');
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.phase === 'day' || r.phase === 'night') step(r); // the season ran on after its last action
  assert.deepEqual(r.keep, s.keep);
  for (const k of ['season', 'day', 'phase', 't', 'rng', 'dread', 'cracks']) assert.equal(r[k], s[k], k);
  assert.deepEqual(r.res, s.res);
});

test('soak: every plan runs whole seasons without breaking the rules', () => {
  for (const plan of PLANS) {
    for (let seed = 1; seed <= 12; seed++) {
      const s = runSeasonAuto(seed * 101, { plan, seasons: 2 });
      assert.ok(['end', 'over'].includes(s.phase), `${plan} ${seed}: ${s.phase}`);
      for (const [k, v] of Object.entries(s.res)) assert.ok(v >= -1e-9, `${plan} ${seed}: ${k} ${v}`);
      assert.ok(capacity(s).used <= capacity(s).cap);
      assert.ok(s.dread >= 0 && s.dread <= TUNING.dreadMax);
      assert.ok(s.shades.every((d) => d.memory > 0));
      const ids = [...s.living, ...s.shades].map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, 'no one is both living and dead');
      for (const d of s.shades.filter(canWork)) assert.ok(roomAt(geo(s), d.post.f, d.post.x), 'posts are inside rooms');
      assert.equal(s.seasons.length, s.season);
    }
  }
});

test('both cameras map taps back to the right floor, and climbers slide between floors', () => {
  for (const mode of MODES) {
    for (let f = 0; f < 4; f++) {
      const v = toView(mode, 30, feet(f) - 5);
      assert.ok(v.y >= 0 && v.y < VIEW_H);
      assert.deepEqual(fromView(mode, v.x, v.y), { x: 30, y: feet(f) - 5 });
      assert.equal(floorAtY(fromView(mode, v.x, v.y).y), f);
    }
  }
  assert.ok(toView('reflection', 0, feet(VEIL_FLOOR)).y < toView('reflection', 0, feet(DEEP_FLOOR)).y, 'reflection: the Veil floor hangs nearest the Veil, at the top');
  assert.equal(floorAtY(MAP.VEIL - 1), -1, 'the foundation is no floor');
  const u = { f: 1, x: 40, ox: 40, of: 1, climb: 5, climbTotal: 10, path: [{ f: 2, x: 40, climb: 's3' }] };
  const mid = unitAt(u, 0);
  assert.ok(mid.y > feet(1) && mid.y < feet(2), 'halfway up the stair');
});

test('the Book of the Dead tells every death as a story', () => {
  for (const seed of [8, 9]) {
    const s = runSeasonAuto(seed, { plan: 'balanced', seasons: 2 });
    for (const e of s.ledger) {
      const text = epitaph(e);
      assert.ok(text.length > 30, text);
      assert.ok(!/undefined|null|NaN|\[object/.test(text), text);
      assert.ok(!/season of the \w+ season/.test(text), text);
    }
  }
  const s = newSeason(1, FULL);
  const garrick = s.ledger.find((e) => e.name === 'Garrick');
  assert.equal(epitaph(garrick), "Of the last keeper's household, a guard, parent of Osk. Died on duty before you came. Still in the glass.");
  const osk = s.living.find((p) => p.name === 'Osk');
  kill(s, osk, 'duty', 'died holding the gate');
  const e = s.ledger.find((x) => x.name === 'Osk');
  assert.equal(epitaph(e), 'A young chandler of the keep, child of Garrick. Died holding the gate on day 1 of the first season. Lies in the crypt, waiting for dusk.');
  e.woke = 'funeral';
  e.end = 'funeral';
  assert.match(epitaph(e), /Was given a funeral and laid to rest\.$/);
});

test('night and day ticks match the tuning', () => {
  const s = newSeason(1);
  assert.equal(dayTicks(s), TUNING.daySecs * 10);
  assert.equal(nightTicks(s), TUNING.nightSecs * 10);
});
