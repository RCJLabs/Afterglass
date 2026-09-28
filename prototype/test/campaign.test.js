import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, upgrade, replay, chapterOf, campaignOn, laddersDue, hollowRisen, boonNow, defense, addFoe, hard, yearsEnd, chapterAgain, isNewMoon, embargoed } from '../src/slice/sim.js';
import { runSeasonAuto, autoStep, closeYear } from '../src/slice/autopilot.js';
import { CHAPTERS, TUNING, MAP } from '../src/slice/data.js';
import { epitaph } from '../src/slice/book.js';

// Nothing by day to get in the way, and no inspection but the ones a test sends for.
const quiet = { sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, weather: 0, eclipse: 0, firstInspection: 99, startFood: 999 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const said = (s, re) => s.log.some((l) => re.test(l.text));
// A fresh campaign keep put on the morning of a season (the first day of it).
function at(season, over = {}) {
  const s = newSeason(5, { campaign: 1, ...quiet, ...over });
  s.season = season;
  return s;
}
// The inspector at noon, today, finding the keep at the given Dread.
function judge(s, dread) {
  if (!s.inspection || s.inspection.done) s.inspection = { day: s.day, reason: 'dread', done: false };
  s.events.unshift({ at: s.t + 1, type: 'inspect' });
  s.dread = dread;
  while (!s.inspection.done) step(s);
  return s.inspection.verdict;
}
// From a winter's last morning through its Long Night, with no Unlit, to the year's end.
function throughLongNight(s) {
  s.day = s.tuning.seasonDays;
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  assert.ok(yearsEnd(s), 'at the year\'s end');
  return s;
}

test('a campaign is five chapters beside the open year, each told at its year\'s start; the open year and older keeps have none', () => {
  const s = newSeason(1, { campaign: 1 });
  assert.ok(campaignOn(s));
  assert.equal(chapterOf(s), 1);
  assert.deepEqual(s.campaign, { goals: {}, closed: {}, boons: {}, ending: null });
  assert.ok(said(s, /^Year 1 of the campaign: The First Winter\. .* The goal: go into winter with 20 candles put by\.$/));
  for (const [season, k] of [[4, 1], [5, 2], [9, 3], [13, 4], [17, 5], [20, 5]]) {
    s.season = season;
    assert.equal(chapterOf(s), k, `season ${season}`);
  }
  const open = newSeason(1);
  assert.equal(open.campaign, null);
  assert.equal(chapterOf(open), 0);
  assert.ok(!said(open, /campaign/));
  assert.equal(campaignOn(newSeason(1, { campaign: 1, year: 0 })), false);
  const old = JSON.parse(JSON.stringify(newSeason(4)));
  for (const t of [old.tuning, old.tuning0]) delete t.campaign;
  delete old.campaign;
  const g = upgrade(old);
  assert.equal(g.tuning.campaign, 0);
  assert.equal(g.campaign, null);
  // Its years harden by campaignHardness, not yearHardness.
  const c = at(9);
  const o = newSeason(5, { ...quiet });
  o.season = 9;
  assert.ok(Math.abs(hard(c) / hard(o) - (TUNING.campaignHardness / TUNING.yearHardness) ** 2) < 1e-9);
});

test('each chapter brings its pressure: the Host\'s ladders, siege and Gatehouse from year 2, the Church\'s escalation from year 3, the Hollow grown from year 4', () => {
  // Ladders: the keep's second season in the open year, the campaign's second year.
  assert.equal(laddersDue(at(2)), false);
  assert.equal(laddersDue(at(5)), true);
  const o = newSeason(5, quiet);
  o.season = 2;
  assert.equal(laddersDue(o), true);
  // The Gatehouse can't be raised in the first year.
  const y1 = at(1, { startStone: 99 });
  assert.match(act(y1, { type: 'raise', room: 'gatehouse' }).error, /comes with the Ashen Host/);
  assert.doesNotMatch(act(at(5, { startStone: 99 }), { type: 'raise', room: 'gatehouse' }).error || '', /Ashen Host/);
  // The Church censures in the first two years, but lays no embargo; from the third it does.
  const c2 = at(8);
  assert.equal(judge(c2, 5), 'censured');
  assert.ok(!embargoed(c2) && !c2.church);
  const c3 = at(9);
  assert.equal(judge(c3, 5), 'censured');
  assert.ok(embargoed(c3));
  // The Hollow: half again as hard to drive back from the fourth year, and its nights bring more.
  const h3 = at(9);
  const h4 = at(13);
  assert.ok(!hollowRisen(h3) && hollowRisen(h4));
  const hp = (s) => {
    s.night = { foes: [] };
    return addFoe(s, 'hollow', 0, MAP.rifts[0].x).max;
  };
  assert.ok(Math.abs(hp(h4) / hp(h3) - TUNING.hollowRises * TUNING.campaignHardness) < 1e-9);
  // No siege in the first autumn, one in the second.
  const siege = (season) => {
    const s = at(season, { raidDays: { 2: 4, 4: 0, 6: 0 } });
    while (!(s.day === 3 && s.phase === 'day')) {
      if (s.phase === 'day') {
        if (s.raid && !s.raid.warned) s.raid.strength = 0.5;
        step(s);
      } else if (s.phase === 'dusk') {
        if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
        ok(s, { type: 'startNight' });
        s.night.spawns = [];
      } else if (s.phase === 'night') step(s);
      else ok(s, { type: 'beginDay' });
    }
    return !!s.siege;
  };
  assert.equal(siege(3), false);
  assert.equal(siege(7), true);
});

test("each chapter's goal is looked at when it's due, and met, it's worth remembrance", () => {
  // The First Winter's candles, as winter begins.
  const ready = (candles) => {
    const s = at(3);
    s.day = s.tuning.seasonDays;
    s.phase = 'end';
    s.seasons.push({ season: 3, day: 7, lost: null, cracks: 0, answer: null, note: '', summary: {} });
    s.res.candles = candles;
    s.res.remembrance = 0;
    ok(s, { type: 'nextSeason' });
    return s;
  };
  const met = ready(20);
  assert.equal(met.campaign.goals[1], true);
  assert.equal(met.res.remembrance, TUNING.goalReward);
  assert.ok(said(met, /^The First Winter: the goal is met, to go into winter with 20 candles put by\. The keep will tell of it: \+3 remembrance\.$/));
  const missed = ready(19);
  assert.equal(missed.campaign.goals[1], false);
  assert.equal(missed.res.remembrance, 0);
  // The Ashen Host's, at its year's end: every raid held, or not.
  const gate = (held) => {
    const s = at(8);
    s.days.push({ season: 5, day: 2, raid: { held: true } }, { season: 7, day: 4, raid: { held } }, { season: 7, day: 6, raid: { held: false, paid: true } });
    return throughLongNight(s).campaign.goals[2];
  };
  assert.equal(gate(true), true, 'a raid paid off is no raid lost');
  assert.equal(gate(false), false);
  // The Lantern Church's: no censure this year.
  const church = at(12);
  church.inspections.push({ season: 10, day: 5, verdict: 'blessed' }, { season: 11, day: 5, verdict: 'censured' });
  assert.equal(throughLongNight(church).campaign.goals[3], false);
  // The Deep Rises': the Hollow driven back on one of its nights.
  const deep = at(16);
  deep.days.push({ season: 14, day: 7, night: { hollow: 'driven back' } });
  assert.equal(throughLongNight(deep).campaign.goals[4], true);
  // The last: coming through the last Long Night.
  assert.equal(throughLongNight(at(20)).campaign.goals[5], true);
});

test('a chapter closes on a choice of two: goods now, or a help that lasts the next year', () => {
  const end = (season) => throughLongNight(at(season));
  // Nothing else will do at a chapter's end.
  const s = end(4);
  assert.match(act(s, { type: 'nextSeason' }).error, /Choose how the chapter closes/);
  assert.match(act(s, { type: 'sealVeil' }).error, /fifth year/);
  assert.match(act(s, { type: 'takeGlass' }).error, /fifth year/);
  assert.match(act(s, { type: 'openVeil' }).error, /campaign ends/);
  assert.match(act(s, { type: 'closeChapter', id: 'tithe' }).error, /Not a choice/);
  // Goods now.
  const food = s.res.food;
  const candles = s.res.candles;
  ok(s, { type: 'closeChapter', id: 'stores' });
  assert.equal(s.season, 5);
  assert.equal(s.phase, 'dawn');
  assert.equal(chapterOf(s), 2);
  assert.deepEqual([s.res.food - food, s.res.candles - candles], [20, 10]);
  assert.ok(said(s, /^Year 2 of the campaign: The Ashen Host\./));
  // The walls: 2 more defense against the Host, the year after only.
  const w = end(4);
  ok(w, { type: 'closeChapter', id: 'walls' });
  assert.ok(boonNow(w, 'walls'));
  w.raid = { state: 'coming', strength: 5, crusade: false };
  const d = defense(w);
  w.season = 9;
  assert.ok(!boonNow(w, 'walls'));
  assert.equal(d - defense(w), 2);
  // The tithe: Dread −2, and the Church forgives the first censure of the next year.
  const t = end(8);
  t.dread = 4;
  ok(t, { type: 'closeChapter', id: 'tithe' });
  assert.equal(t.dread, 2);
  ok(t, { type: 'beginDay' });
  assert.equal(judge(t, 5), 'warned');
  assert.ok(said(t, /remembers the keep's tithe, and only warns it/));
  assert.equal(judge(t, 5), 'censured', 'the second is not forgiven');
  // Arming the dead: grave-steel on the next year's new moons.
  const a = end(12);
  ok(a, { type: 'closeChapter', id: 'steel' });
  ok(a, { type: 'beginDay' });
  a.day = a.tuning.seasonDays;
  while (a.phase === 'day') step(a);
  assert.ok(isNewMoon(a) && a.night.steel);
  // Binding the household: everyone at peace, their grief over.
  const b = end(16);
  b.living[0].grief = { for: 'x', mult: 0.8 };
  ok(b, { type: 'closeChapter', id: 'kin' });
  assert.ok(b.living.every((p) => p.peace > 0 && !p.grief));
  for (const k of [1, 2, 3, 4]) assert.equal(CHAPTERS[k].close.length, 2);
});

test("the fifth year ends in one of round three's three endings: seal the Veil, open it, or keep the watch and play on", () => {
  const end = () => throughLongNight(at(20));
  assert.match(act(end(), { type: 'closeChapter', id: 'walls' }).error, /closes at the end of its year/);
  assert.match(act(end(), { type: 'nextSeason' }).error, /Choose how the keep's story ends/);
  // Sealed: every shade goes free.
  const sealed = end();
  ok(sealed, { type: 'sealVeil' });
  assert.equal(sealed.campaign.ending, 'seal');
  assert.equal(sealed.shades.length, 0);
  // Opened: the shades walk into the keep, and the story ends there.
  const opened = end();
  const n = opened.shades.length;
  assert.ok(n > 0);
  ok(opened, { type: 'openVeil' });
  assert.equal(opened.campaign.ending, 'open');
  assert.deepEqual([opened.opened.shades, opened.shades.length], [n, n]);
  assert.ok(!yearsEnd(opened));
  assert.match(act(opened, { type: 'nextSeason' }).error, /Veil is open/);
  assert.match(epitaph(opened.ledger.find((e) => e.id === opened.shades[0].id)), /Walked out of the glass into the keep when the Veil was opened/);
  // Keeping the watch: the keeper takes the glass, and the keep plays on with no more chapters.
  const watch = end();
  ok(watch, { type: 'takeGlass' });
  assert.equal(watch.campaign.ending, 'watch');
  assert.equal(chapterOf(watch), 0);
  assert.ok(watch.shades.some((d) => d.keeper));
  assert.equal(watch.season, 21);
});

test('a lost chapter can be begun again, from its first dawn, as it stood', () => {
  // The first campaign keep from seed 1 the autopilot loses after its first year.
  let lost = null;
  for (let seed = 1; seed < 60 && !lost; seed++) {
    const s = runSeasonAuto(seed, { seasons: 20, tuning: { campaign: 1 } });
    if (s.phase === 'over' && s.season > 4) lost = s;
  }
  assert.ok(lost, 'a campaign lost after its first year');
  const k = chapterOf(lost);
  const g = chapterAgain(lost);
  assert.ok(g);
  assert.equal(g.season, 4 * (k - 1) + 1);
  assert.equal(g.phase, 'dawn');
  assert.equal(chapterOf(g), k);
  assert.equal(g.campaign.again, 1);
  assert.equal(g.campaign.closed[k - 1], lost.campaign.closed[k - 1]);
  // It's the keep as the autopilot had it then: played on the same, it's lost the same.
  const r = replay(g.seed, g.tuning0, g.actions);
  assert.deepEqual([r.res, r.living.length, r.shades.length], [g.res, g.living.length, g.shades.length]);
  for (let i = 0; i < 5e6 && g.phase !== 'over'; i++) {
    if (g.phase === 'end') {
      if (!act(g, { type: 'nextSeason' }).ok && !closeYear(g)) break;
    } else autoStep(g);
  }
  assert.deepEqual([g.phase, g.season, g.day], [lost.phase, lost.season, lost.day]);
  // A first chapter begins again at the keep's first morning.
  const first = newSeason(2, { campaign: 1 });
  first.phase = 'over';
  const f = chapterAgain(first);
  assert.deepEqual([f.season, f.day, f.phase, f.t], [1, 1, 'day', 0]);
  // Not in the open year, nor before the keep is lost.
  assert.equal(chapterAgain(newSeason(2)), null);
  assert.equal(chapterAgain(newSeason(2, { campaign: 1 })), null);
});
