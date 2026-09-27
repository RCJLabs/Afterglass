import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, roomPower, ritePreview, embargoed, inquisition, churchDaysLeft, crusadeDaysLeft, canWork, capacity, mirrorCap } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { howTo } from '../src/slice/howto.js';
import { epitaph } from '../src/slice/book.js';
import { TUNING } from '../src/slice/data.js';

// The original four-floor keep with nothing by day to get in the way, and no inspection but the ones a test
// sends for.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0, firstInspection: 99 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Through dusk, a night with no Unlit, and the rite, to the next morning, with Dread held low (by default) so
// no inspector comes of it.
function nextDay(s, dread = 0) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  s.dread = dread;
  ok(s, { type: 'beginDay' });
}
// The inspector at noon, today, finding the keep at the given Dread.
function judge(s, dread) {
  if (!s.inspection || s.inspection.done) s.inspection = { day: s.day, reason: 'dread', done: false };
  s.events.unshift({ at: s.t + 1, type: 'inspect' });
  s.dread = dread;
  while (!s.inspection.done) step(s);
  return s.inspection.verdict;
}
const said = (s, re) => s.log.some((l) => re.test(l.text));

test("a censure lays a silver embargo: no glass and no mirrors, until it runs out, a donation or a blessing", () => {
  const s = newSeason(3, quiet);
  s.res.glass = 60;
  s.res.remembrance = 30;
  s.res.quicksilver = 10;
  const glazier = s.living.find((p) => p.job !== 'glazier');
  ok(s, { type: 'assign', id: glazier.id, room: 'glazier' });
  assert.ok(roomPower(s).glazier > 0);
  assert.equal(judge(s, 5), 'censured');
  assert.ok(embargoed(s) && !inquisition(s));
  assert.equal(churchDaysLeft(s), TUNING.embargoDays);
  assert.ok(said(s, /lays a silver embargo on the keep for 5 days/));
  assert.equal(roomPower(s).glazier, 0, 'the Glazier makes no glass');
  assert.match(act(s, { type: 'build', mirror: 'hand' }).error, /embargo/);
  assert.match(act(s, { type: 'upgradeMirror', id: s.mirrors[0].id }).error, /embargo/);
  // A donation lifts it.
  const rem = s.res.remembrance;
  ok(s, { type: 'donate' });
  assert.equal(s.res.remembrance, rem - TUNING.donation);
  assert.ok(!embargoed(s) && s.church === null);
  assert.match(act(s, { type: 'donate' }).error, /no embargo/);
  ok(s, { type: 'build', mirror: 'hand' });
  // Left alone, it runs out after its days.
  nextDay(s);
  assert.equal(judge(s, 5), 'censured');
  const from = s.day;
  while (s.day < from + TUNING.embargoDays) nextDay(s);
  assert.ok(embargoed(s), 'the last day of it');
  assert.equal(churchDaysLeft(s), 0);
  nextDay(s);
  assert.ok(!embargoed(s) && s.church === null);
  assert.ok(said(s, /^The Lantern Church lifts its embargo\.$/));
  // And a blessing lifts it at once.
  assert.equal(judge(s, 5), 'censured');
  nextDay(s);
  s.inspection = null;
  assert.equal(judge(s, 1), 'blessed');
  assert.ok(!embargoed(s) && s.church === null);
  assert.ok(said(s, /blesses it: 3 candles and 2 remembrance\. The embargo is lifted\./));
});

test('censured again under the embargo, the keep is given to the Inquisition: an inspection every noon, no gifts (the crusade off)', () => {
  const s = newSeason(3, { ...quiet, crusade: 0 });
  s.res.remembrance = 40;
  s.res.essence = 20;
  s.res.glass = 60;
  for (let i = 0; i < 3; i++) ok(s, { type: 'build', mirror: 'hand' }); // mirrors enough for three censures
  assert.equal(judge(s, 5), 'censured');
  nextDay(s);
  s.inspection = null;
  assert.equal(judge(s, 4), 'censured');
  assert.ok(inquisition(s) && embargoed(s));
  assert.equal(churchDaysLeft(s, 'inquisition'), TUNING.inquisitionDays);
  assert.ok(said(s, /given to the Inquisition/));
  assert.match(act(s, { type: 'donate' }).error, /takes no gifts/);
  // The rite warns of tomorrow's inspection, and the morning brings the inquisitor again.
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  assert.equal(ritePreview(s).inquisition, true);
  s.dread = 0;
  ok(s, { type: 'beginDay' });
  assert.deepEqual([s.inspection.reason, s.inspection.day, s.inspection.done], ['inquisition', s.day, false]);
  assert.ok(said(s, /The inquisitor will inspect the keep again at noon\./));
  // Warned: a tithe, and the inquisitor stays. Censured again: another mirror, and its days start over.
  assert.equal(judge(s, 3), 'warned');
  assert.ok(inquisition(s));
  nextDay(s);
  const mirrors = s.mirrors.length;
  assert.equal(judge(s, 5), 'censured');
  assert.equal(s.mirrors.length, mirrors - 1);
  assert.equal(churchDaysLeft(s, 'inquisition'), TUNING.inquisitionDays);
  assert.ok(said(s, /The Inquisition stays/));
  // A blessing sends it away, and lifts the embargo.
  nextDay(s);
  assert.equal(judge(s, 1), 'blessed');
  assert.ok(!inquisition(s) && !embargoed(s) && s.church === null);
  assert.ok(said(s, /The inquisitor leaves, and the embargo is lifted\./));
});

test("the Inquisition's days run out; the embargo may outlast it", () => {
  const s = newSeason(3, quiet);
  s.res.essence = 50;
  assert.equal(judge(s, 5), 'censured'); // day 1: the embargo through day 6
  nextDay(s);
  s.inspection = null;
  assert.equal(judge(s, 5), 'censured'); // day 2: the Inquisition through day 5, the embargo through 6
  for (let i = 0; i < TUNING.inquisitionDays; i++) {
    nextDay(s);
    assert.equal(judge(s, 2), 'warned');
  }
  nextDay(s); // day 6
  assert.ok(!inquisition(s) && embargoed(s));
  assert.ok(said(s, /^The inquisitor leaves\. The silver embargo stands through today\.$/));
  assert.ok(!s.inspection || s.inspection.done, 'no inquisitor today');
  nextDay(s);
  assert.ok(s.church === null && said(s, /^The Lantern Church lifts its embargo\.$/));
});

test('a keep under the Church replays exactly; an old save plays on without it; How to play covers it', () => {
  // The keeper plan holds Dread high, so the Church censures it.
  let s;
  let seed = 1;
  for (; seed < 40; seed++) {
    s = newSeason(seed, { startFloors: 4 });
    while (s.phase !== 'end' && s.phase !== 'over' && !s.church?.inquisition) autoStep(s, 'keeper');
    if (s.church?.inquisition) break;
  }
  assert.ok(s.church?.inquisition, 'some keeper keep came under the Inquisition');
  // The replay stops at the last action; the keep went on a little past it.
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.phase, r.day, r.log.length, r.church, r.mirrors.length], [s.phase, s.day, s.log.length, s.church, s.mirrors.length]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { ...quiet, church: 0 })));
  for (const t of [old.tuning, old.tuning0]) {
    delete t.church;
    delete t.crusade;
  }
  const g = upgrade(old);
  assert.equal(g.tuning.church, 0);
  assert.equal(g.tuning.crusade, 0);
  assert.equal(judge(g, 5), 'censured');
  assert.ok(g.church == null && !embargoed(g));
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /silver embargo/);
  assert.ok(!/silver embargo/.test(all({ ...TUNING, church: 0 })));
});

// Three censures in a morning: the embargo, the Inquisition, and under it the crusade. The shades are set
// aside while the Church takes three mirrors, then put back one to a hand mirror, with one left empty.
function toCrusade(s) {
  s.res.glass = 99;
  s.res.essence = 60;
  while (s.mirrors.filter((m) => m.type === 'hand').length < s.shades.length + 4) ok(s, { type: 'build', mirror: 'hand' });
  const set = s.shades.filter((d) => d.mirror);
  for (const d of set) d.mirror = null;
  for (let i = 0; i < 3; i++) assert.equal(judge(s, 5), 'censured');
  const hands = s.mirrors.filter((m) => m.type === 'hand');
  set.forEach((d, i) => (d.mirror = hands[i].id));
  assert.ok(hands.length > set.length);
}

test('censured under the Inquisition, the keep is given up to a crusade; a blessing before it comes calls it off', () => {
  const s = newSeason(3, quiet);
  toCrusade(s);
  assert.equal(crusadeDaysLeft(s), TUNING.crusadeDays);
  assert.ok(s.church.strength >= 2);
  assert.ok(said(s, /given up to a crusade: \d+ knights of the Lantern will come to the gate a little after noon in 2 days/));
  assert.ok(embargoed(s) && inquisition(s), 'the embargo and the Inquisition stand until it comes');
  // The next morning the inquisitor comes again, and a blessing calls the crusade off.
  nextDay(s, 3);
  assert.equal(s.inspection.reason, 'inquisition');
  assert.ok(said(s, /The crusade comes tomorrow; a blessing calls it off\./));
  assert.equal(judge(s, 1), 'blessed');
  assert.ok(said(s, /The crusade is called off, the inquisitor leaves, and the embargo is lifted\./));
  assert.equal(s.church, null);
  nextDay(s, 3);
  assert.ok(!s.raid, 'nobody comes');
});

test('a mirror hidden from the crusade: only before its day; its shades sit out; no censure can find it', () => {
  const s = newSeason(3, quiet);
  toCrusade(s);
  const m = s.mirrors.find((x) => s.shades.some((d) => d.mirror === x.id));
  const inIt = s.shades.filter((d) => d.mirror === m.id);
  ok(s, { type: 'hide', id: m.id, on: true });
  assert.ok(m.hidden && inIt.length && inIt.every((d) => d.hidden && !canWork(d)));
  // No one new is bound into a hidden mirror: its spare room isn't free.
  const empty = s.mirrors.find((x) => !s.shades.some((d) => d.mirror === x.id));
  const free = capacity(s).free;
  ok(s, { type: 'hide', id: empty.id, on: true });
  assert.equal(capacity(s).free, free - mirrorCap(empty));
  ok(s, { type: 'hide', id: empty.id, on: false });
  assert.match(act(s, { type: 'hide', id: m.id, on: true }).error, /already hidden/);
  ok(s, { type: 'hide', id: m.id, on: false });
  assert.ok(!m.hidden && inIt.every((d) => canWork(d)));
  ok(s, { type: 'hide', id: m.id, on: true });
  // The inquisitor censures again tomorrow, and takes another mirror, not the hidden one.
  nextDay(s, 3);
  const others = s.mirrors.filter((x) => x !== m).length;
  assert.equal(judge(s, 5), 'censured');
  assert.ok(s.mirrors.includes(m) && s.mirrors.length === others);
  assert.ok(said(s, /The crusade is still coming\./));
  // By night there's no hiding, and on the day it comes it's too late.
  while (s.phase === 'day') step(s);
  assert.match(act(s, { type: 'hide', id: s.mirrors.find((x) => x !== m)?.id || m.id, on: true }).error, /by day/);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  s.dread = 3;
  ok(s, { type: 'beginDay' });
  assert.equal(crusadeDaysLeft(s), 0);
  const other = s.mirrors.find((x) => !x.hidden);
  if (other) assert.match(act(s, { type: 'hide', id: other.id, on: true }).error, /Too late/);
});

test('the crusade at the gate: no tribute and no stores; held, the Church gives up; broken in, it smashes every mirror it can find', () => {
  for (const held of [true, false]) {
    const s = newSeason(3, quiet);
    toCrusade(s);
    const hidden = s.mirrors.find((x) => s.shades.some((d) => d.mirror === x.id));
    ok(s, { type: 'hide', id: hidden.id, on: true });
    const keep = s.shades.filter((d) => d.mirror === hidden.id).map((d) => d.id);
    const doomed = s.shades.filter((d) => d.mirror && d.mirror !== hidden.id).map((d) => d.id);
    nextDay(s, 3);
    assert.equal(judge(s, 3), 'warned');
    nextDay(s, 3);
    assert.ok(s.raid?.crusade, 'the crusade takes the day');
    assert.ok(!s.inspection || s.inspection.done, 'and no inspector comes with it');
    assert.ok(said(s, /The crusade comes today/));
    while (!s.raid.warned) step(s);
    assert.match(act(s, { type: 'payOff' }).error, /takes no tribute/);
    assert.match(act(s, { type: 'barStores' }).error, /the mirrors, not the stores/);
    s.raid.strength = held ? 1 : 60;
    s.raid.ward = held ? 30 : 0;
    const food = s.res.food;
    while (s.raid.state === 'coming' || s.raid.state === 'assault') step(s);
    assert.equal(s.raid.state, held ? 'held' : 'breached');
    assert.equal(s.church, null);
    assert.ok(!hidden.hidden && s.mirrors.includes(hidden), 'the hidden mirror comes back out');
    assert.ok(keep.every((id) => s.shades.some((d) => d.id === id && canWork(d))));
    if (held) {
      assert.ok(said(s, /The crusade breaks on your walls and turns for home/));
      assert.ok(doomed.every((id) => s.shades.some((d) => d.id === id)));
    } else {
      assert.ok(said(s, /The crusaders smash the .* go(es)? free\. Satisfied, the Lantern Church leaves the keep purged/));
      assert.equal(s.dread, 0);
      assert.deepEqual(s.mirrors, [hidden]);
      assert.ok(doomed.every((id) => !s.shades.some((d) => d.id === id)));
      const e = s.ledger.find((x) => x.id === doomed[0]);
      assert.equal(e.end, 'purged');
      assert.match(epitaph(e), /Freed when the Lantern Church's crusaders smashed their mirror/);
      assert.ok(s.res.food >= food - 1, 'the stores are left alone');
    }
  }
});

test('a crusade replays exactly, and How to play covers it', () => {
  // The keeper plan never lowers Dread for the Church, so it comes to a crusade.
  let s;
  for (let seed = 1; seed < 80 && !s?.church?.crusade; seed++) {
    s = newSeason(seed, { startFloors: 4 });
    while (s.phase !== 'over' && !s.church?.crusade && s.season < 4) {
      if (s.phase === 'end') ok(s, { type: 'nextSeason' });
      else autoStep(s, 'keeper');
    }
  }
  assert.ok(s.church?.crusade, 'some keeper keep came to a crusade');
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.season, r.day, r.log.length, r.church, r.mirrors.length], [s.season, s.day, s.log.length, s.church, s.mirrors.length]);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /The crusade comes to the gate/);
  assert.ok(!/The crusade comes to the gate/.test(all({ ...TUNING, crusade: 0 })));
});
