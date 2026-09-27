import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { recapOf, seasonTitle } from '../src/slice/recap.js';
import { TUNING } from '../src/slice/data.js';

test('a season that stood: its title, how it went, six numbers and a line to share', () => {
  const s = runSeasonAuto(2, { seasons: 1 });
  assert.equal(s.phase, 'end');
  const r = recapOf(s);
  assert.equal(r.title, 'Spring, year 1');
  assert.equal(r.stood, true);
  assert.equal(r.head, 'The keep stands');
  assert.equal(r.sub, 'It came through the new moon.');
  assert.deepEqual(r.stats.map(([k]) => k), ['Days held', 'Deaths', 'Shades in the glass', 'Raids held', 'The Church', 'The Hollow']);
  const S = s.seasons[0].summary;
  assert.equal(r.stats[0][1], `7 of ${TUNING.seasonDays}`);
  assert.equal(r.stats[1][1], String(S.deaths));
  assert.equal(r.stats[3][1], `${S.raids.filter((x) => x.held).length} of ${S.raids.length}`);
  assert.equal(r.seed, 2);
  assert.match(r.text, /^Afterglass · Spring, year 1: the keep stands\. 7 days, \d+ deaths?, \d+ shades? in the glass\.$/);
});

test('a fallen keep, a keep that saw the year out, and a season not yet over', () => {
  const s = runSeasonAuto(1, { seasons: 1 });
  assert.equal(s.phase, 'over');
  const r = recapOf(s);
  assert.equal(r.stood, false);
  assert.equal(r.head, 'The keep fell');
  assert.match(r.sub, /^The Veil broke on night \d\.$/);
  const e = s.seasons[0];
  e.lost = 'fallen';
  assert.match(recapOf(s).sub, /^No one living was left, on day \d\.$/);
  // Winter, stood: the year is over.
  e.lost = null;
  e.season = 4;
  assert.equal(recapOf(s, 4).sub, 'It came through the Long Night, and a whole year.');
  assert.equal(recapOf(s, 4).title, 'Winter, year 1');
  assert.equal(recapOf(newSeason(3)), null, 'nothing to recap on day 1');
});

test('who is remembered: the season\'s dead and the shades who served, by what they did, at most three', () => {
  const s = runSeasonAuto(2, { seasons: 1 });
  const r = recapOf(s);
  assert.ok(r.remembered.length >= 1 && r.remembered.length <= 3);
  const score = (e) => 2 * (e.kills || 0) + (e.nights || 0) + (e.season === 1 && e.from === 'living' ? 3 : 0) + (e.named ? 1 : 0);
  const byName = Object.fromEntries(s.ledger.map((e) => [e.name, e]));
  const scores = r.remembered.map((m) => score(byName[m.name]));
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'most first');
  for (const m of r.remembered) {
    const e = byName[m.name];
    if (e.nights) assert.match(m.line, new RegExp(`${e.nights} nights?`));
    if (e.kills) assert.match(m.line, new RegExp(`${e.kills} cut down`));
  }
  // A raider who died but never served isn't remembered.
  s.ledger.push({ id: 'rx', name: 'Zzyx', from: 'raider', season: 1, day: 2, how: 'fell raiding the keep', kills: 0, nights: 0, woke: null });
  s.ledger.push({ id: 'ry', name: 'Aaron', from: 'living', season: 1, day: 3, how: 'died of sickness', kills: 99, nights: 9, woke: 'loyal' });
  const again = recapOf(s);
  assert.ok(!again.remembered.some((m) => m.name === 'Zzyx'));
  assert.equal(again.remembered[0].name, 'Aaron');
  assert.equal(again.remembered[0].line, 'Died of sickness on day 3 · Loyal · 9 nights · 99 cut down');
});

test('season titles with the year on and off', () => {
  assert.equal(seasonTitle({ year: 1 }, 1), 'Spring, year 1');
  assert.equal(seasonTitle({ year: 1 }, 7), 'Autumn, year 2');
  assert.equal(seasonTitle({ year: 0 }, 7), 'Season 7');
});
