import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, kill, addCreeper, livingMult, eatRate, ritePreview, wardCost, upgrade, traitFor, dayTicks, isTwinnedShade } from '../src/slice/sim.js';
import { TRAITS, SHADE_TRAITS, TRAIT_KEYS, TUNING } from '../src/slice/data.js';
import { geoOf, roomSpan } from '../src/slice/geo.js';
import { epitaph } from '../src/slice/book.js';

const G0 = geoOf();
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// The original four-floor keep, with no sickness, old age or raids unless a test asks for them.
const FULL = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0 };
const person = (s, name) => s.living.find((p) => p.name === name);
const near = (a, b) => Math.abs(a - b) < 1e-9;
function toDusk(s) {
  while (s.phase === 'day') step(s);
}
function toNight(s) {
  toDusk(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
}
function toDawn(s) {
  while (s.phase === 'night') step(s);
}
// A dusk where one of the dead is posted, under a candle, in a room's twin, then the night with no Unlit.
function nightIn(s, d, room, x) {
  const { f } = roomSpan(G0, room);
  ok(s, { type: 'move', id: d.id, f, x });
  ok(s, { type: 'candle', f, x });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  toDawn(s);
}

test('the cast has each trait once; a newcomer\'s comes from name and seed, not the random stream', () => {
  const s = newSeason(1);
  assert.deepEqual(s.living.map((p) => p.trait).sort(), [...TRAIT_KEYS].sort());
  assert.deepEqual(s.shades.map((d) => [d.name, d.was, d.trait]), [['Garrick', 'brave', 'reckless'], ['Hesper', 'stubborn', 'anchored']]);
  const rng = s.rng;
  const a = traitFor(s, 'Wynn');
  assert.equal(s.rng, rng, 'no draw from the random stream');
  assert.equal(traitFor(s, 'Wynn'), a);
  assert.ok(TRAIT_KEYS.includes(a));
  for (const k of TRAIT_KEYS) assert.ok(SHADE_TRAITS[TRAITS[k].dead], `${k} turns into a shade trait`);
});

test('death turns a trait over, and the Book tells it', () => {
  const s = newSeason(2, FULL);
  kill(s, person(s, 'Ada'), 'duty');
  assert.equal(s.bodies[0].was, 'brave');
  toDusk(s);
  ok(s, { type: 'wake' });
  assert.equal(s.shades.find((d) => d.name === 'Ada').trait, 'reckless');
  const e = s.ledger.find((x) => x.name === 'Ada');
  assert.match(epitaph(e, { traits: true }), /Brave in life, Reckless in death\./);
  assert.doesNotMatch(epitaph(e), /Brave/, 'with traits off the Book leaves them out');
});

test('by day each trait helps or hinders at a job', () => {
  const s = newSeason(3, FULL);
  const at = (name, job) => {
    const p = person(s, name);
    p.job = job;
    return livingMult(s, p);
  };
  assert.ok(near(at('Ada', 'barracks'), 1.5), 'Brave');
  assert.ok(near(at('Wil', 'barracks'), 0.5), 'Coward');
  assert.ok(near(at('Tam', 'chapel'), 1.5), 'Devout, praying');
  assert.ok(near(at('Tam', 'hearth'), 0.8), 'Devout, anywhere else');
  assert.ok(near(at('Sabe', 'hearth'), 1.15), 'Diligent');
  assert.ok(near(at('Nell', 'infirmary'), 1.5), 'Gentle, healing');
  assert.ok(near(at('Nell', 'barracks'), 1), 'Gentle, on the gate');
  assert.ok(near(at('Osk', 'glazier'), 1.25), 'Greedy, at a trade');
  assert.ok(near(at('Osk', 'hearth'), 0.8), 'Greedy, anywhere else');
  assert.ok(near(at('Bran', 'hearth'), 1), 'Stubborn: nothing at work');
  assert.ok(near(eatRate(s), 8 * TUNING.eatPerDay));
  s.tuning.traits = 0;
  assert.ok(near(at('Ada', 'barracks'), 1));
  assert.ok(near(at('Osk', 'hearth'), 1));
});

test('at the gate the Brave fall more often and a Coward never does', () => {
  let ada = 0;
  let wil = 0;
  for (let seed = 1; seed <= 60; seed++) {
    // A raid on day 1, against Ada (Brave) and Wil (Coward) in the Barracks.
    const s = newSeason(seed, { ...FULL, raidDays: { 1: 3 } });
    toDusk(s);
    const how = (n) => s.ledger.find((e) => e.name === n)?.how;
    if (how('Ada') === 'died holding the gate') ada++;
    if (how('Wil') === 'died holding the gate') wil++;
  }
  assert.equal(wil, 0);
  assert.ok(ada >= 8, `Ada fell ${ada} times in 60`);
});

test('sickness kills the Stubborn half as fast; the Cheerful never grieve, the Gentle grieve harder', () => {
  const s = newSeason(5, { ...FULL, sickChance: 1 });
  for (const p of s.living) if (p.name !== 'Bran') p.sick = 1e6; // so the day's sickness falls on Bran
  while (s.phase === 'day' && !(person(s, 'Bran').sick > 0)) step(s);
  assert.ok(Math.abs(person(s, 'Bran').sick - TUNING.sickDays * 2 * dayTicks(s)) <= 1);
  assert.ok(s.log.some((l) => new RegExp(`kills within ${TUNING.sickDays * 2} days`).test(l.text)));

  const t = newSeason(6, FULL);
  kill(t, person(t, 'Bran'), 'duty');
  assert.equal(person(t, 'Mira').grief, null, 'Mira is Cheerful');
  const u = newSeason(6, FULL);
  kill(u, person(u, 'Mira'), 'duty');
  assert.equal(person(u, 'Bran').grief.mult, TUNING.griefMult, 'Bran grieves');
  const v = newSeason(6, FULL);
  kill(v, person(v, 'Tam'), 'duty');
  assert.equal(person(v, 'Nell').grief.mult, 0.6, 'Nell is Gentle: she grieves harder');
});

test('the Reckless fight harder and fade twice as fast; the Anchored half as fast; the Tireless never rest', () => {
  const s = newSeason(7, FULL);
  toNight(s);
  toDawn(s);
  const fade = (x, name) => x.today.night.fading.find((f) => f.name === name);
  assert.equal(fade(s, 'Garrick').fade, TUNING.fadePerNight * 2, 'Reckless');
  assert.equal(fade(s, 'Hesper').fade, TUNING.fadePerNight * 0.25, 'Anchored and named');

  const t = newSeason(7, FULL);
  toDusk(t);
  t.shades[0].trait = 'tireless';
  nightIn(t, t.shades[0], 'hearth', 20);
  assert.equal(fade(t, 'Garrick').rested, false, 'the Cold Hearth does nothing for the Tireless');
  assert.equal(fade(t, 'Garrick').fade, TUNING.fadePerNight);

  const time = (trait) => {
    const u = newSeason(15, FULL);
    toNight(u);
    const g = u.shades[0];
    g.trait = trait;
    ok(u, { type: 'candle', f: g.f, x: g.x });
    const c = addCreeper(u, g.f, g.x + 3);
    let n = 0;
    while (c.hp > 0 && n < 300) {
      step(u);
      n++;
    }
    return n;
  };
  assert.ok(time('reckless') < time(null), 'a Reckless shade cuts a Creeper down sooner');
});

test('a Lurker is never caught in the dark', () => {
  const caught = (trait) => {
    const s = newSeason(8, FULL);
    toNight(s);
    for (const d of s.shades) d.trait = trait;
    const g = s.shades[0];
    for (let i = 0; i < 3; i++) addCreeper(s, g.f, g.x + 10 + i);
    for (let i = 0; i < 100; i++) step(s);
    return s.night.stats.grabbed;
  };
  assert.ok(caught(null) > 0, 'an ordinary shade in the dark is caught');
  assert.equal(caught('lurker'), 0);
});

test('a Keening shade calms two Restless shades a night', () => {
  const restless = (trait) => {
    const s = newSeason(9, FULL);
    toNight(s);
    s.shades[1].trait = trait;
    for (const i of [1, 2]) s.shades.push({ ...s.shades[0], id: `ghost${i}`, name: `Ghost ${i}`, kind: 'restless', mirror: null, restless: 0, trait: null });
    toDawn(s);
    return s.shades.filter((d) => d.kind === 'restless').map((d) => d.restless);
  };
  assert.deepEqual(restless(null), [1, 1]);
  assert.deepEqual(restless('keening'), [0, 0]);
});

test('a Hoarding shade pockets two candles at dusk, never the last four, and sings twice the essence', () => {
  const s = newSeason(10, FULL);
  const noChandlers = (x) => x.living.forEach((p) => p.job === 'chandlery' && (p.job = null)); // so the day makes no candles
  noChandlers(s);
  s.shades[0].trait = 'hoarding';
  s.res.candles = 7;
  toDusk(s);
  assert.equal(s.res.candles, 5);
  assert.ok(s.log.some((l) => /Garrick pockets 2 candles/.test(l.text)));
  const t = newSeason(10, FULL);
  noChandlers(t);
  t.shades[0].trait = 'hoarding';
  t.res.candles = 5;
  toDusk(t);
  assert.equal(t.res.candles, 5, 'the store keeps its last four');

  const sing = (trait) => {
    const u = newSeason(11, FULL);
    toDusk(u);
    u.shades[0].trait = trait;
    const e0 = u.res.essence;
    nightIn(u, u.shades[0], 'chapel', 40);
    return u.res.essence - e0;
  };
  const plain = sing(null);
  assert.ok(plain > 1);
  assert.ok(Math.abs(sing('hoarding') - 2 * plain) < 1e-6);
  assert.ok(Math.abs(sing('tireless') - 1.6 * plain) < 1e-6, 'the Tireless work ×1.6');
});

test('a Tireless shade never works as a twin', () => {
  const s = newSeason(12, FULL);
  toDusk(s);
  person(s, 'Osk').job = 'chapel'; // Garrick's son, so Garrick in the Choir is his twin
  const g = s.shades[0];
  ok(s, { type: 'move', id: g.id, f: roomSpan(G0, 'chapel').f, x: 40 });
  assert.equal(isTwinnedShade(s, g), true);
  g.trait = 'tireless';
  assert.equal(isTwinnedShade(s, g), false);
});

test('a Bitter shade costs three Dread to keep, and while it stays wards cost a fifth', () => {
  const s = newSeason(13, FULL);
  toNight(s);
  s.shades[0].trait = 'bitter';
  assert.ok(near(wardCost(s), TUNING.wardCost * 0.2));
  toDawn(s);
  assert.equal(ritePreview(s).dread.keep, 4 * TUNING.dreadPerKeep, 'Bitter Garrick 3, Hesper 1');
  ok(s, { type: 'rite', id: s.shades[0].id, choice: 'cover' });
  assert.equal(ritePreview(s).dread.keep, TUNING.dreadPerKeep);
  s.tuning.traits = 0;
  ok(s, { type: 'rite', id: s.shades[0].id, choice: 'keep' });
  assert.equal(ritePreview(s).dread.keep, 2 * TUNING.dreadPerKeep, 'with traits off, one each');
  assert.equal(wardCost(s), TUNING.wardCost);
});

test('a Wistful shade resting the night through sends good dreams: the living work ×1.15 until dusk', () => {
  const s = newSeason(14, FULL);
  toDusk(s);
  s.shades[0].trait = 'wistful';
  nightIn(s, s.shades[0], 'hearth', 20);
  assert.equal(s.dreamt, SHADE_TRAITS.wistful.dreams);
  ok(s, { type: 'beginDay' });
  assert.ok(near(livingMult(s, person(s, 'Bran')), 1.15), 'Bran, a cook');
  toDusk(s);
  assert.equal(s.dreamt, 0);
});

test('an older save gains traits: everyone gets the one their name draws, and it plays on without them until it loads', () => {
  const s = newSeason(16, FULL);
  const old = JSON.parse(JSON.stringify(s));
  delete old.tuning.traits;
  delete old.tuning0.traits;
  delete old.tuning.goAround;
  delete old.tuning0.goAround;
  for (const p of old.living) delete p.trait;
  for (const d of old.shades) {
    delete d.was;
    delete d.trait;
  }
  const g = upgrade(old);
  assert.equal(g.tuning.traits, 0);
  assert.equal(g.tuning0.traits, 0, 'so an old export still replays without them');
  assert.equal(g.tuning0.goAround, 0, 'nor with the Unlit going around lights');
  assert.ok(g.living.every((p) => p.trait === traitFor(g, p.name)));
  assert.ok(g.shades.every((d) => TRAITS[d.was].dead === d.trait));
});
