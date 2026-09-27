import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, roomPower, ritePreview, embargoed, inquisition, churchDaysLeft } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { howTo } from '../src/slice/howto.js';
import { TUNING } from '../src/slice/data.js';

// The original four-floor keep with nothing by day to get in the way, and no inspection but the ones a test
// sends for.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0, firstInspection: 99 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Through dusk, a night with no Unlit, and the rite, to the next morning, with Dread held low so no
// inspector comes of it.
function nextDay(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  s.dread = 0;
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

test('censured again under the embargo, the keep is given to the Inquisition: an inspection every noon, no gifts', () => {
  const s = newSeason(3, quiet);
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
  delete old.tuning.church;
  delete old.tuning0.church;
  const g = upgrade(old);
  assert.equal(g.tuning.church, 0);
  assert.equal(judge(g, 5), 'censured');
  assert.ok(g.church == null && !embargoed(g));
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /silver embargo/);
  assert.ok(!/silver embargo/.test(all({ ...TUNING, church: 0 })));
});
