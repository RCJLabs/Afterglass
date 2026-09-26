import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSeason, step, act, replay, ritePreview, crossingPreview, capacity, canWork, defense, bear, dayTicks, nightTicks, addCreeper,
  lastSeason, kill, byId, addFoe, retune, playerTuning,
} from '../src/slice/sim.js';
import { runSeasonAuto, autoStep, PLANS } from '../src/slice/autopilot.js';
import { epitaph } from '../src/slice/book.js';
import { MAP, TUNING, DEEP_FLOOR, VEIL_FLOOR, START_SHADES } from '../src/slice/data.js';
import { lightMap, isLit, roomAt, route, darkRooms, darkGaps, roomSpan, feet, MODES, toView, fromView, floorAtY, unitAt, VIEW_H } from '../src/slice/geo.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } };
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
  const s = newSeason(2, { sickChance: 0, oldAgeChance: 0 });
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
  const L = lightMap(T, [{ id: 'k', f: 1, x: 50, wax: T.candleWax, max: T.candleWax }]);
  assert.ok(isLit(L, 1, 45));
  assert.ok(!isLit(L, 1, 60), 'the wall stops it');
  const D = lightMap(T, [{ id: 'k', f: DEEP_FLOOR, x: 14, wax: T.candleWax, max: T.candleWax }]);
  assert.ok(!isLit(D, DEEP_FLOOR, MAP.rifts[0].x));
  assert.ok(isLit(D, DEEP_FLOOR, 25));
  const dark = darkRooms(D);
  assert.ok(!dark.some(([f, id]) => f === DEEP_FLOOR && id === 'chapel'));
  assert.ok(!dark.some(([f]) => f === VEIL_FLOOR), 'nothing seeps up under the Veil');
  assert.ok(darkGaps(D).some(([f, a]) => f === DEEP_FLOOR && a >= 6), 'the unlit stretch by the rift is a gap');
});

test('Creepers climb to the mirrors in the dark, and a lit stair turns them aside', () => {
  const T = TUNING;
  const dark = lightMap(T, []);
  const r = route(dark, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }], { creeper: true });
  assert.ok(r && r.path.filter((p) => p.climb).length === 3, 'three climbs from the Deep to the Veil');
  const line = MAP.stairs.filter((st) => st.f === VEIL_FLOOR - 1).map((st, i) => ({ id: 'k' + i, f: st.f, x: st.x, wax: T.candleWax, max: T.candleWax }));
  const lit = lightMap(T, line);
  assert.equal(route(lit, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }], { creeper: true }), null, 'no dark way past the line');
  assert.ok(route(lit, { f: DEEP_FLOOR, x: 12 }, [{ f: VEIL_FLOOR, x: 30 }]), 'shades walk through light');
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
  const choir = roomSpan('chapel');
  const hearth = roomSpan('hearth');
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
  ok(t, { type: 'move', id: a.id, f: 2, x: 20 });
  ok(t, { type: 'candle', f: 2, x: 20 });
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
  for (const st of MAP.stairs.filter((x) => x.f === h.f)) ok(s, { type: 'ward', target: st.id });
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
      for (const d of s.shades.filter(canWork)) assert.ok(roomAt(d.post.f, d.post.x), 'posts are inside rooms');
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
  const s = newSeason(1);
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
