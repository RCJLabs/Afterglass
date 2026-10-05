// Alert kinds (round seven, phase 6): the page decides what stops the clock, opens a panel or flashes the Veil
// by an alert's kind. Over a year of play these do what the words used to, except where the words missed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSeasonAuto, autoStep } from '../src/slice/autopilot.js';
import { newTutorial } from '../src/slice/tutorial.js';
import { ALERT_KINDS, STOPS, OPENS, FLASHES, momentOf } from '../src/slice/alerts.js';

// The page's patterns before kinds, kept here only to check the kinds against (and phase 7's ruined room, which
// stops the clock as a Maw breaking one does, and phase 8's great tide, as the Hollow rising does).
const OLD_STOPS = /^The eclipse\.|has caught|The Hollow rises|Raiders on the road|^At the gate:|The camp outside stirs|has made camp|The Host is at the gate|inspector|has turned Wraith|A Maw is tearing|A Maw is breaking|^Left alone, the Maw has ruined|^The last great tide rises|^Fire in the|The fire spreads|^Plague/;
const OLD_OPENS = /^The eclipse\.|^Midsummer\.|Raiders on the road|The camp outside stirs|has made camp|The Host is at the gate|The gate gave way|inspector|fallen sick|larder is empty|arrives at the gate|^At the gate:|^Fire in the/;
const OLD_FLASH = /slipped through the Veil|tore through the Veil/;
// Where the words missed: the crusade on the road and at the gate is a raid, and now pauses and opens as one.
const CRUSADE = /^The crusade (is on the road|is at the gate|comes today)/;
// New since the words: a Maw coming through a mirror into the keep (round seven, phase 13) cracks the Veil, and
// flashes it as the Unlit slipping through it do.
const THROUGH = /^The Maw came through the /;
// And happenings inside the keep (round seven, phase 14: cruelty) stop the clock and open the Day panel as a
// visitor at the gate does.
const INSIDE = /^In the keep:/;

function alertsOf(keeps) {
  return keeps.flatMap((s) => s.alerts);
}

test('every alert kind is a known one, and the kinds do what the words did', () => {
  const keeps = [];
  for (let seed = 1; seed <= 12; seed++) keeps.push(runSeasonAuto(seed, { plan: 'balanced', seasons: 4 }));
  for (let seed = 1; seed <= 4; seed++) keeps.push(runSeasonAuto(seed, { plan: 'idle', seasons: 1 }));
  const all = alertsOf(keeps);
  const seen = new Set();
  for (const a of all) {
    if (a.kind) {
      assert.ok(a.kind in ALERT_KINDS, `unknown kind ${a.kind}`);
      seen.add(a.kind);
    }
    if (CRUSADE.test(a.text)) continue;
    if (THROUGH.test(a.text)) {
      assert.ok(FLASHES.has(a.kind) && !STOPS.has(a.kind), `through: ${a.kind} "${a.text}"`);
      continue;
    }
    if (INSIDE.test(a.text)) {
      assert.ok(a.kind === 'visitor' && STOPS.has(a.kind) && OPENS.has(a.kind), `inside: ${a.kind} "${a.text}"`);
      continue;
    }
    assert.equal(STOPS.has(a.kind), OLD_STOPS.test(a.text), `stops: ${a.kind} "${a.text}"`);
    assert.equal(OPENS.has(a.kind), OLD_OPENS.test(a.text), `opens: ${a.kind} "${a.text}"`);
    assert.equal(FLASHES.has(a.kind), OLD_FLASH.test(a.text), `flash: ${a.kind} "${a.text}"`);
  }
  // A year of play meets most of them.
  for (const k of ['road', 'gate', 'fire', 'caught', 'crack', 'maw', 'hollow', 'church-word', 'church', 'arrival', 'visitor', 'eclipse', 'midsummer', 'siege']) assert.ok(seen.has(k), `no ${k} alert in a year`);
});

test("the tutorial's word from the Church, which a lesson waits on, carries its kind", () => {
  const s = newTutorial({});
  for (let i = 0; i < 2e6 && !(s.day >= 4 || s.phase === 'over'); i++) autoStep(s, 'balanced');
  assert.ok(s.log.some((l) => l.season === 1 && l.day === 3 && l.kind === 'church-word'), 'no church-word line on day 3');
});

test('the viewer marks cracks and catches by kind', () => {
  assert.equal(momentOf({ kind: 'crack', tone: 'bad', text: 'anything' }), 'crack');
  assert.equal(momentOf({ kind: 'caught', tone: 'bad', text: 'anything' }), 'caught');
  assert.equal(momentOf({ tone: 'bad', text: 'slipped through the Veil' }), 'bad');
  assert.equal(momentOf({ tone: 'death', text: 'x' }), 'death');
});
