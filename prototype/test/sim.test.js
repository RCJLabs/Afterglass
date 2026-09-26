import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, step, act, capacity, livingMult, shadeMult, ritePreview, crossingPreview, replay, byId, bear, ledgerOf, defense,
} from '../src/sim.js';
import { runAuto, POLICIES } from '../src/autopilot.js';
import { NIGHT_ROOMS, DAY_ROOMS, WORKING_KINDS } from '../src/data.js';

// No random deaths, raids or arrivals: tests cause every death themselves.
const QUIET = { sickChance: 0, oldAgeChance: 0, raidFirstDay: 999, newcomerEvery: 999 };
const quiet = (extra = {}) => newGame(1, { ...QUIET, ...extra });
const who = (s, name) => s.living.find((p) => p.name === name) || s.shades.find((d) => d.name === name) || s.bodies.find((b) => b.name === name);
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type} failed: ${r.error}`);
};
const killAs = (s, name, cause) => ok(s, { type: 'debug', what: 'kill', id: who(s, name).id, cause });
const toDusk = (s) => {
  while (s.phase === 'day') step(s);
  assert.equal(s.phase, 'dusk');
};
const wake = (s) => {
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
};
const toRite = (s) => {
  if (s.phase === 'day') toDusk(s);
  wake(s);
  ok(s, { type: 'beginNight' });
  while (s.phase === 'night') step(s);
  assert.equal(s.phase, 'rite');
};

test('the keep starts with eight living, three bonds and room for three shades', () => {
  const s = quiet();
  assert.equal(s.living.length, 8);
  assert.equal(s.living.filter((p) => p.bond).length, 6);
  for (const p of s.living.filter((x) => x.bond)) assert.equal(byId(s.living, p.bond.with).bond.with, p.id);
  assert.deepEqual(capacity(s), { cap: 3, used: 0, free: 3 });
  assert.equal(s.phase, 'day');
});

test('how someone dies decides what wakes', () => {
  const s = quiet();
  const expect = { Ada: ['duty', 'loyal'], Tam: ['oldage', 'serene'], Sabe: ['sickness', 'pale'], Bran: ['neglect', 'restless'], Osk: ['yours', 'wraith'] };
  for (const [name, [cause]] of Object.entries(expect)) killAs(s, name, cause);
  for (const [name, [, kind]] of Object.entries(expect)) assert.equal(who(s, name).kind, kind, name);
});

test('the Threshold softens sickness and neglect, never a killing you ordered', () => {
  const s = quiet();
  s.guidance = 2;
  killAs(s, 'Sabe', 'sickness');
  assert.equal(who(s, 'Sabe').kind, 'serene');
  killAs(s, 'Osk', 'yours');
  assert.equal(who(s, 'Osk').kind, 'wraith');
  assert.equal(s.guidance, 1);
  killAs(s, 'Bran', 'neglect');
  assert.equal(who(s, 'Bran').kind, 'pale');
  assert.equal(s.guidance, 0);
});

test('mirror capacity caps the night roster; the overflow wakes Restless', () => {
  const s = quiet();
  for (const n of ['Ada', 'Bran', 'Sabe', 'Osk']) killAs(s, n, 'duty');
  toDusk(s);
  assert.deepEqual(crossingPreview(s).map((x) => x.to), ['mirror', 'mirror', 'mirror', 'overflow']);
  wake(s);
  assert.equal(s.bodies.length, 0);
  assert.equal(s.shades.filter((d) => d.mirror).length, 3);
  const osk = who(s, 'Osk');
  assert.equal(osk.kind, 'restless');
  assert.equal(osk.trueKind, 'loyal');
  assert.equal(osk.mirror, null);
  assert.equal(ledgerOf(s, osk.id).woke, 'overflow');
});

test('funerals need a priest each and bring the bonded peace', () => {
  const s = quiet();
  killAs(s, 'Ada', 'duty');
  killAs(s, 'Bran', 'duty');
  const wil = who(s, 'Wil');
  assert.equal(wil.grief.for, who(s, 'Ada').id);
  ok(s, { type: 'funeral', id: who(s, 'Ada').id, on: true });
  assert.equal(act(s, { type: 'funeral', id: who(s, 'Bran').id, on: true }).ok, false, 'one priest, one funeral');
  const rem = s.res.remembrance;
  toDusk(s);
  wake(s);
  assert.equal(who(s, 'Ada'), undefined, 'buried, not woken');
  assert.ok(who(s, 'Bran').mirror, 'Bran wakes');
  assert.equal(wil.grief, null);
  assert.ok(wil.peace > 0);
  assert.ok(s.res.remembrance >= rem + 1);
  assert.equal(ledgerOf(s, 'p1').end, 'funeral');

  const t = quiet();
  killAs(t, 'Ada', 'duty');
  ok(t, { type: 'assign', id: who(t, 'Tam').id, room: 'hearth' });
  assert.equal(act(t, { type: 'funeral', id: who(t, 'Ada').id, on: true }).ok, false, 'no priest, no funeral');
});

test('grief costs 20% until the bond is twinned across the Veil', () => {
  const s = quiet();
  killAs(s, 'Ada', 'duty');
  const wil = who(s, 'Wil');
  assert.equal(livingMult(s, wil), 0.8);
  toDusk(s);
  wake(s);
  const ada = who(s, 'Ada');
  assert.equal(ada.trait, 'reckless', 'Brave inverts to Reckless');
  ok(s, { type: 'post', id: ada.id, room: 'watch' });
  assert.equal(livingMult(s, wil), 0.8 * 1.25);
  assert.equal(shadeMult(s, ada), 1.5 * 2 * 1.25, 'Loyal on the Watch, Reckless, twinned');
  ok(s, { type: 'post', id: ada.id, room: 'choir' });
  assert.equal(livingMult(s, wil), 0.8);
  assert.equal(shadeMult(s, ada), 0.7);
});

test('keeping raises Dread; covering releases, gives remembrance and brings peace', () => {
  const s = quiet({ dread: { livingPer: 99 } }); // the living bear only one shade per priest
  killAs(s, 'Ada', 'duty');
  killAs(s, 'Tam', 'oldage'); // the only priest; Devout inverts to Bitter
  toRite(s);
  assert.equal(bear(s), 0);
  let P = ritePreview(s);
  assert.equal(P.dread.keep, 1 + 2, 'Ada 1, Bitter Tam 2');
  assert.equal(P.dread.to, 3);
  ok(s, { type: 'rite', id: who(s, 'Ada').id, choice: 'cover' });
  P = ritePreview(s);
  assert.equal(P.dread.to, 2);
  assert.deepEqual(P.peace.map((p) => p.name), ['Wil']);
  const rem = s.res.remembrance;
  ok(s, { type: 'beginDay' });
  assert.equal(s.dread, 2);
  assert.equal(who(s, 'Ada'), undefined);
  assert.ok(who(s, 'Wil').peace > 0);
  assert.equal(s.res.remembrance, rem + 1);
  assert.equal(ledgerOf(s, 'p1').end, 'covered');
  assert.equal(s.phase, 'day');
  assert.equal(s.day, 2);
});

test('vigils spend remembrance to lower Dread', () => {
  const s = quiet({ dread: { livingPer: 99 } });
  killAs(s, 'Ada', 'duty');
  toRite(s);
  s.dread = 3;
  s.res.remembrance = 5;
  ok(s, { type: 'vigil', n: 1 });
  let P = ritePreview(s);
  assert.equal(P.dread.to, 3 + 1 - 1 - 1, 'keep +1, one priest bears 1, vigil −1');
  ok(s, { type: 'vigil', n: 2 });
  assert.ok(ritePreview(s).errors.length, 'two vigils need 6 remembrance');
  assert.equal(act(s, { type: 'beginDay' }).ok, false);
  ok(s, { type: 'vigil', n: 1 });
  ok(s, { type: 'beginDay' });
  assert.equal(s.res.remembrance, 2);
});

test('at Dread 5 the inspector takes the fullest mirror, except Anchored shades', () => {
  const s = quiet({ dread: { livingPer: 99 } });
  killAs(s, 'Ada', 'duty');
  killAs(s, 'Wil', 'duty'); // Stubborn inverts to Anchored
  killAs(s, 'Bran', 'duty');
  toDusk(s);
  wake(s); // Ada and Wil share the Chapel pier glass, Bran takes the Hall hand mirror
  assert.equal(who(s, 'Ada').mirror, who(s, 'Wil').mirror);
  ok(s, { type: 'beginNight' });
  while (s.phase === 'night') step(s);
  s.dread = 3;
  assert.equal(ritePreview(s).dread.to, 5);
  ok(s, { type: 'beginDay' });
  assert.equal(who(s, 'Ada'), undefined, 'taken');
  assert.ok(who(s, 'Wil'), 'Anchored stays');
  assert.ok(who(s, 'Bran'), 'other mirror untouched');
  assert.equal(ledgerOf(s, who(s, 'Wil').id).end, null);
  assert.equal(s.dread, 2);
});

test('Restless shades turn Wraith after three nights unless the Choir calms them', () => {
  const s = quiet();
  killAs(s, 'Bran', 'neglect');
  for (let night = 1; night <= 3; night++) {
    toRite(s);
    if (night < 3) {
      assert.equal(who(s, 'Bran').kind, 'restless');
      ok(s, { type: 'rite', id: who(s, 'Bran').id, choice: 'leave' });
      ok(s, { type: 'beginDay' });
    }
  }
  assert.equal(who(s, 'Bran').kind, 'wraith');
  assert.equal(ledgerOf(s, who(s, 'Bran').id).turned, 3);

  const c = quiet();
  killAs(c, 'Bran', 'neglect');
  killAs(c, 'Tam', 'oldage');
  toDusk(c);
  wake(c);
  ok(c, { type: 'post', id: who(c, 'Tam').id, room: 'choir' });
  for (let night = 1; night <= 3; night++) {
    toRite(c);
    ok(c, { type: 'rite', id: who(c, 'Bran').id, choice: 'leave' });
    ok(c, { type: 'beginDay' });
  }
  assert.equal(who(c, 'Bran').kind, 'restless');
  assert.equal(who(c, 'Bran').restless, 0);
});

test('an overflow shade can be bound later for essence and wakes as its true kind', () => {
  const s = quiet();
  for (const n of ['Ada', 'Bran', 'Sabe', 'Osk']) killAs(s, n, 'duty');
  toRite(s);
  const osk = who(s, 'Osk');
  ok(s, { type: 'rite', id: osk.id, choice: 'bind' });
  assert.ok(ritePreview(s).errors.length, 'no free mirror yet');
  ok(s, { type: 'rite', id: who(s, 'Ada').id, choice: 'cover' });
  s.res.essence = 2;
  assert.ok(ritePreview(s).errors.some((e) => /essence/.test(e)));
  s.res.essence = 3;
  assert.deepEqual(ritePreview(s).errors, []);
  ok(s, { type: 'beginDay' });
  assert.equal(osk.kind, 'loyal');
  assert.ok(osk.mirror);
  assert.equal(s.res.essence, 0);
});

test('a Wraith haunts a post unless the Watch holds it', () => {
  const s = quiet();
  killAs(s, 'Osk', 'yours');
  killAs(s, 'Sabe', 'oldage');
  toDusk(s);
  wake(s);
  ok(s, { type: 'post', id: who(s, 'Sabe').id, room: 'silvering' });
  ok(s, { type: 'beginNight' });
  assert.deepEqual(s.haunt.night, ['silvering']);
  assert.equal(shadeMult(s, who(s, 'Sabe')), 0);
  while (s.phase === 'night') step(s);
  assert.deepEqual(s.haunt.day, ['glazier']);
  ok(s, { type: 'rite', id: who(s, 'Osk').id, choice: 'leave' });
  ok(s, { type: 'beginDay' });
  assert.equal(livingMult(s, who(s, 'Wil')), 1);
  assert.equal(livingMult(s, s.living.find((p) => p.job === 'glazier') || { job: null }), 0, 'no glaziers left alive');

  const w = quiet();
  killAs(w, 'Osk', 'yours');
  killAs(w, 'Ada', 'duty');
  toDusk(w);
  wake(w);
  ok(w, { type: 'post', id: who(w, 'Ada').id, room: 'watch' });
  ok(w, { type: 'beginNight' });
  assert.deepEqual(w.haunt.night, []);
});

test('with no Wraith to hold, the Watch adds its strength to the next day\'s defense', () => {
  const s = quiet();
  killAs(s, 'Ada', 'duty');
  const before = { Wil: 2, Osk: 0 }; // Wil stays on the walls alone after Ada dies
  toDusk(s);
  wake(s);
  assert.equal(who(s, 'Ada').post, 'watch', 'the dead go back to the twin of their old room');
  ok(s, { type: 'beginNight' });
  const ada = shadeMult(s, who(s, 'Ada'));
  assert.equal(s.watchBonus, ada);
  while (s.phase === 'night') step(s);
  ok(s, { type: 'beginDay' });
  const guards = s.living.filter((p) => p.job === 'barracks').reduce((a, p) => a + livingMult(s, p) * 2, 0);
  assert.equal(guards, before.Wil * 1.25 * 0.8, 'Wil: grieving, but twinned with Ada');
  assert.ok(Math.abs(defense(s) - (guards + ada)) < 1e-9);
  while (s.phase === 'day') step(s);
  assert.equal(s.watchBonus, 0, 'the bonus lasts one day');
});

test('the same seed and actions give the same game, and replay rebuilds it', () => {
  const strip = (s) => JSON.stringify({ ...s, alerts: [] });
  const a = runAuto(newGame(7), { days: 12, policy: 'bear' });
  const b = runAuto(newGame(7), { days: 12, policy: 'bear' });
  assert.equal(strip(a), strip(b));
  const r = replay(a.seed, a.tuning0, a.actions);
  while (r.phase !== a.phase || r.t !== a.t || r.day !== a.day) step(r);
  assert.equal(strip(r), strip(a));
});

test('a saved game continues exactly like one that never stopped', () => {
  const s = runAuto(newGame(11), { days: 5 });
  const copy = JSON.parse(JSON.stringify(s));
  runAuto(s, { days: 10 });
  runAuto(copy, { days: 10 });
  assert.equal(JSON.stringify(copy), JSON.stringify(s));
});

function invariants(s) {
  const where = `day ${s.day} ${s.phase}`;
  for (const [k, v] of Object.entries(s.res)) assert.ok(v >= -1e-9, `${k} negative ${where}`);
  for (const m of s.mirrors) assert.ok(s.shades.filter((d) => d.mirror === m.id).length <= { hand: 1, pier: 2, great: 4 }[m.type], `mirror over capacity ${where}`);
  const ids = [...s.living, ...s.bodies, ...s.shades].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate id ${where}`);
  for (const d of s.shades) {
    if (d.kind === 'restless' || d.kind === 'wraith') assert.equal(d.mirror, null, `${d.name} unbound ${where}`);
    else assert.ok(WORKING_KINDS.includes(d.kind) && d.mirror, `${d.name} bound ${where}`);
    if (d.post) assert.ok(NIGHT_ROOMS[d.post].out && d.mirror, `${d.name} post ${where}`);
    assert.ok(ledgerOf(s, d.id), `${d.name} in ledger`);
  }
  for (const p of s.living) {
    if (p.job) assert.ok(DAY_ROOMS[p.job]);
    if (p.grief) assert.ok(byId(s.bodies, p.grief.for) || byId(s.shades, p.grief.for), `${p.name} grieves someone at rest ${where}`);
  }
  assert.ok(s.dread >= 0 && s.dread <= s.tuning.dread.max);
  assert.ok(s.guidance <= s.tuning.guidanceMax);
}

test('soak: the rules hold across policies and seeds', () => {
  const causes = new Set();
  for (const policy of Object.keys(POLICIES)) {
    for (let seed = 1; seed <= 6; seed++) {
      const s = runAuto(newGame(seed), { days: 25, policy, onPhase: invariants });
      invariants(s);
      for (const e of s.ledger) causes.add(e.cause);
    }
  }
  for (const c of ['duty', 'oldage', 'sickness', 'raider']) assert.ok(causes.has(c), `no ${c} deaths in the soak`);
});
