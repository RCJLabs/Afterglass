import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, dayTicks, defense, sideStream, visitorBlock, funeralCap } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { TUNING, VISITORS } from '../src/slice/data.js';
import { epitaph } from '../src/slice/book.js';
import { howTo } from '../src/slice/howto.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Nothing else by day to get in the way: no fire, sickness, old age, weather, raids or inspector.
const calm = { fire: 0, sickChance: 0, oldAgeChance: 0, weather: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, firstInspection: 99 };
// A keep with the given visitor at the gate, just come: brought now if the day's own roll didn't bring one.
function atGate(kind, tuning = {}, prep = () => {}) {
  const s = newSeason(3, { ...calm, visitorOnly: kind, visitorChance: 1, visitorSecond: 0, ...tuning });
  prep(s);
  let v = s.visitors.find((x) => x.kind === kind);
  if (!v) {
    v = { id: `v${s.season}.${s.day}.0`, kind, at: s.t + 1, until: s.t + 1 + Math.round(s.tuning.visitorWait * dayTicks(s)), here: false, done: null };
    s.visitors = [v];
  }
  while (!v.here && !v.gone && s.phase === 'day') step(s);
  assert.ok(v.here, `the ${kind} came`);
  return { s, v };
}
const answer = (s, v, id) => ok(s, { type: 'visitor', id: v.id, answer: id });
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('visitors come from a stream of their own: with them or without, the keep rolls the same days', () => {
  let came = 0;
  for (let seed = 1; seed <= 40; seed++) {
    // visitFrom 1: day 1's roll, as before round seven's staging (test/staging.test.js).
    const a = newSeason(seed, { visitFrom: 1 });
    const b = newSeason(seed, { visitors: 0, visitFrom: 1 });
    assert.equal(a.rng, b.rng, 'the keep\'s own stream is untouched');
    assert.deepEqual(a.raid, b.raid);
    assert.deepEqual(b.visitors, []);
    assert.ok(a.visitors.length <= 2);
    for (const v of a.visitors) assert.ok(VISITORS[v.kind] && v.at > 0 && v.until > v.at && v.until < dayTicks(a));
    came += a.visitors.length > 0;
  }
  assert.ok(came >= 10 && came <= 30, `about half of days bring one (${came} of 40)`);
  // The same days in the same order: seed 1's second season and seed 2's first are streams apart. The first
  // hash XORed seed and season together, so they were one stream; a keep made with it keeps it.
  const at = (seed, season, streamHash) => sideStream({ seed, season, day: 3, tuning: { streamHash } }, 0x715).rng;
  assert.notEqual(at(1, 2, 1), at(2, 1, 1));
  assert.equal(at(1, 2, 0), at(2, 1, 0));
  const seen = new Set();
  for (let seed = 1; seed <= 100; seed++) for (let season = 1; season <= 4; season++) for (let day = 1; day <= 9; day++) seen.add(sideStream({ seed, season, day, tuning: { streamHash: 1 } }, 0x715).rng);
  assert.equal(seen.size, 3600, 'every keep-day its own stream');
});

test('an answer costs what the card says and gives what it says', () => {
  for (const [kind, id] of [['peddler', 'buy'], ['chandler', 'buy'], ['grain', 'buy'], ['mason', 'hire'], ['almoner', 'give'], ['bard', 'sing']]) {
    const { s, v } = atGate(kind, {}, (g) => {
      Object.assign(g.res, { food: 40, glass: 20, candles: 5, stone: 0, remembrance: 0 });
      g.dread = 2;
    });
    const A = VISITORS[kind].answers.find((a) => a.id === id);
    const before = { ...s.res };
    const dread = s.dread;
    answer(s, v, id);
    for (const k of Object.keys(before)) assert.ok(near(s.res[k], before[k] - (A.cost?.[k] || 0) + (A.gain?.[k] || 0)), `${kind} ${id}: ${k}`);
    assert.equal(s.dread, dread + (A.dread || 0));
    assert.equal(v.done, id);
    assert.ok(!v.late);
    assert.deepEqual(s.today.visitors.at(-1), { kind, answer: id, late: false });
  }
  // What the keep can't pay for it can't give, and it says why.
  const { s, v } = atGate('peddler', {}, (g) => (g.res.food = 2));
  assert.match(visitorBlock(s, v, 'buy'), /^That takes 6 food, and the keep has 2\./);
  assert.match(act(s, { type: 'visitor', id: v.id, answer: 'buy' }).error, /That takes/);
  assert.equal(visitorBlock(s, v, 'no'), null);
});

test("left waiting, a visitor takes the last answer at their hour; nobody's asked twice", () => {
  const { s, v } = atGate('refugees');
  const dread = s.dread;
  const log = s.log.length;
  while (!v.done) step(s);
  assert.equal(s.t, v.until);
  assert.deepEqual([v.done, v.late], ['no', true]);
  assert.equal(s.dread, dread + 1, 'turned away, they cost Dread');
  assert.ok(s.log.slice(log).some((l) => /^A burnt-out family: left waiting, send them on\. Dread \+1\./.test(l.text)));
  assert.match(act(s, { type: 'visitor', id: v.id, answer: 'take' }).error, /has had an answer/);
  // Still at the gate at dusk: the last answer then.
  const b = atGate('peddler');
  while (b.s.phase === 'day') step(b.s);
  assert.deepEqual([b.v.done, b.v.late], ['no', true]);
});

test('taken in, they join the living; the pilgrims stand the gate, the Host comes for the deserter', () => {
  const raid = { raidDays: { 1: 8, 2: 0, 4: 0, 6: 0 } };
  const { s, v } = atGate('pilgrims', raid);
  const n = s.living.length;
  const def = defense(s);
  answer(s, v, 'take');
  assert.equal(s.living.length, n + 2);
  assert.ok(s.living.slice(-2).every((p) => p.job === null && p.joined.day === s.day));
  assert.ok(near(defense(s), def + VISITORS.pilgrims.answers[0].help));
  while (s.phase === 'day') step(s);
  assert.equal(s.gateHelp, 0, 'only for the day');
  const d = atGate('deserter', raid);
  const strength = d.s.raid.strength;
  answer(d.s, d.v, 'take');
  assert.equal(d.s.living.at(-1).trait, 'brave');
  assert.ok(Math.abs(d.s.raid.strength - strength * VISITORS.deserter.answers[0].edge) < 0.051, "today's raid, still on the road");
  // With no raid today, the next one rolled.
  const k = atGate('knight', {}, (g) => (g.shades[0].kind = 'stranger'));
  answer(k.s, k.v, 'keep');
  assert.equal(k.s.raidEdge, VISITORS.knight.answers[1].edge);
  const r = atGate('refugees');
  answer(r.s, r.v, 'take');
  assert.deepEqual(r.s.living.slice(-3).map((p) => p.age), ['adult', 'old', 'child']);
  const p = atGate('plague');
  const sick = p.s.living.filter((x) => x.sick > 0).length;
  answer(p.s, p.v, 'take');
  assert.ok(p.s.living.slice(-2).every((x) => x.sick > 0));
  assert.ok(p.s.living.filter((x) => x.sick > 0).length >= sick + 2);
});

test('the grave-robber: hanged, he wakes Restless; let go, he takes a body; the Book tells both', () => {
  const dead = (g) => ok(g, { type: 'debug', what: 'kill', id: g.living.find((p) => p.age !== 'child').id, cause: 'duty' });
  const { s, v } = atGate('graverobber', {}, dead);
  const body = s.bodies.find((b) => b.id === v.body);
  assert.ok(body);
  answer(s, v, 'hang');
  const h = s.bodies.at(-1);
  assert.deepEqual([h.cause, h.kind, h.from], ['hanged', 'restless', 'visitor']);
  const e = s.ledger.find((x) => x.id === h.id);
  assert.match(epitaph(e), /^A grave robber, who came to the gate for the keep's dead\. Was hanged at the gate on day \d/);
  while (s.phase === 'day') step(s);
  ok(s, { type: 'wake' });
  assert.equal(s.shades.find((d) => d.id === h.id)?.kind, 'restless');
  const g = atGate('graverobber', {}, dead);
  const taken = g.s.bodies.find((b) => b.id === g.v.body);
  answer(g.s, g.v, 'go');
  assert.ok(!g.s.bodies.includes(taken));
  const t = g.s.ledger.find((x) => x.id === taken.id);
  assert.deepEqual([t.woke, t.end], ['stolen', 'stolen']);
  assert.match(epitaph(t), /A grave robber carried the body off before dusk, and it never woke\.$/);
});

test('the wedding, the bard, the physician, the priest, the reeve, the necromancer and the cooper do what they say', () => {
  // Sabe is the only one of the first household with no bond: a newcomer makes two.
  const w = atGate('wedding', {}, (g) => g.living.push({ ...g.living.find((p) => p.name === 'Sabe'), id: 'px1', name: 'Pell', trait: 'gentle' }));
  const [a, b] = w.v.who;
  answer(w.s, w.v, 'feast');
  const A = w.s.living.find((p) => p.id === a);
  assert.deepEqual(A.bond, { with: b, rel: 'spouse' });
  assert.ok(w.s.living.every((p) => p.peace > 0));
  const ph = atGate('physician', {}, (g) => (g.living[0].sick = 100));
  answer(ph.s, ph.v, 'pay');
  assert.ok(ph.s.living.every((p) => !(p.sick > 0)));
  const pr = atGate('priest', {}, (g) => {
    for (let i = 0; i <= funeralCap(g); i++) ok(g, { type: 'debug', what: 'kill', id: g.living.find((p) => p.age !== 'child').id, cause: 'duty' });
  });
  const cap = funeralCap(pr.s);
  answer(pr.s, pr.v, 'feed');
  assert.equal(funeralCap(pr.s), cap + 1);
  const rv = atGate('reeve', { raidDays: { 2: 8, 4: 0, 6: 0 } });
  answer(rv.s, rv.v, 'pay');
  assert.equal(rv.s.riders, VISITORS.reeve.answers[0].help);
  while (!(rv.s.day === 2 && rv.s.raid?.state === 'coming' && rv.s.phase === 'day')) {
    if (rv.s.phase === 'dusk') {
      if (rv.s.dusk.step === 'crypt') ok(rv.s, { type: 'wake' });
      ok(rv.s, { type: 'startNight' });
    } else if (rv.s.phase === 'dawn') ok(rv.s, { type: 'beginDay' });
    else step(rv.s);
  }
  const guardsOnly = defense(rv.s) - rv.s.riders;
  assert.ok(near(defense(rv.s), guardsOnly + VISITORS.reeve.answers[0].help), "against the Host, the riders count");
  while (rv.s.raid.state === 'coming' || rv.s.raid.state === 'assault') step(rv.s);
  assert.equal(rv.s.riders, 0, 'once');
  const nc = atGate('necromancer', {}, (g) => {
    const d = g.shades[0];
    d.kind = 'restless';
    d.mirror = null;
  });
  const shade = nc.s.shades.find((d) => d.id === nc.v.shade);
  answer(nc.s, nc.v, 'bind');
  assert.equal(shade.kind, 'loyal');
  assert.ok(shade.mirror);
  const co = atGate('cooper', { fire: 1 }, (g) => (g.res.glass = 10)); // no fire, no cooper
  answer(co.s, co.v, 'buy');
  assert.ok(co.s.barrels);
});

test("the hedge-witch: her charm slows tonight's candles; handed to the Church, her curse speeds them (a Weeper, before phase 11)", () => {
  const burn = (said, tuning = {}) => {
    const { s, v } = atGate('witch', tuning, (g) => (g.res.glass = 10));
    answer(s, v, said);
    while (s.phase === 'day') step(s);
    if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
    const at = s.night.candles.length;
    ok(s, { type: 'candle', f: s.shades[0].post?.f ?? 0, x: s.shades[0].post?.x ?? 50 });
    const k = s.night.candles[at];
    const wax = k.wax;
    ok(s, { type: 'startNight' });
    for (let i = 0; i < 50; i++) step(s);
    return { burnt: wax - k.wax, s };
  };
  const plain = burn('no').burnt;
  assert.ok(near(burn('charm').burnt, plain * TUNING.charmBurn));
  const cursed = burn('church');
  assert.ok(near(cursed.burnt, plain * TUNING.curseBurn), 'her curse: the candles burn faster');
  assert.equal(cursed.s.night.spawns.filter((sp) => sp.type === 'weeper').length, 0, 'and no Weeper');
  assert.ok(!cursed.s.curse, 'once');
  // As before: a Weeper, and the candles as they were.
  const { s, v } = atGate('witch', { weepersMax: 3 });
  const dread = s.dread;
  answer(s, v, 'church');
  assert.equal(s.dread, Math.max(0, dread - 1));
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  assert.equal(s.night.spawns.filter((sp) => sp.curse).length, 1);
  assert.ok(!s.night.curse);
  assert.ok(!s.curse, 'once');
  // Where her curse would be a Weeper and the keep has none, no hedge-witch at the gate; with no Weepers at all,
  // her curse is the candles, and she comes.
  const q = newSeason(3, { ...calm, dreamwell: 0, weepersMax: 3, visitorOnly: 'witch', visitorChance: 1, visitFrom: 1 });
  assert.equal(q.visitors.length, 0);
  const w = newSeason(3, { ...calm, dreamwell: 0, visitorOnly: 'witch', visitorChance: 1, visitFrom: 1 });
  assert.equal(w.visitors.length, 1);
});

test('visitors replay exactly; old saves have none; How to play covers them', () => {
  const s = runSeasonAuto(2, { plan: 'balanced', seasons: 1 });
  assert.ok(s.actions.some((a) => a.a.type === 'visitor'), 'the autopilot answered someone');
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.log.length, r.res, r.living.length, r.days.map((d) => d.visitors)], [s.log.length, s.res, s.living.length, s.days.map((d) => d.visitors)]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { visitors: 0 })));
  for (const t of [old.tuning, old.tuning0]) {
    delete t.visitors;
    delete t.streamHash;
  }
  delete old.visitors;
  const g = upgrade(old);
  assert.deepEqual([g.tuning.visitors, g.tuning.streamHash, g.visitors], [0, 0, []]);
  for (let i = 0; i < 3 && g.phase !== 'over'; i++) {
    while (g.phase === 'day' || g.phase === 'night') step(g);
    if (g.phase === 'dusk') {
      if (g.dusk.step === 'crypt') ok(g, { type: 'wake' });
      ok(g, { type: 'startNight' });
    } else if (g.phase === 'dawn') ok(g, { type: 'beginDay' });
  }
  assert.deepEqual(g.visitors, []);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /someone comes to the gate/);
  assert.ok(!/comes to the gate, and on some/.test(all({ ...TUNING, visitors: 0 })));
});
