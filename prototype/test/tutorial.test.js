import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, retune, replay, upgrade, ritePreview, veilKept, tutorialDay, tutorialNight } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { newTutorial, isTutorial } from '../src/slice/tutorial.js';
import { howTo } from '../src/slice/howto.js';
import { TUNING, TUTORIAL } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Plays the tutorial with the autopilot until cond holds (or the keep reaches the given day).
function playUntil(s, cond, guard = 400000) {
  while (!cond() && s.phase !== 'over' && guard-- > 0) autoStep(s, 'balanced');
  assert.ok(guard > 0, 'ran away');
}
const nextPhase = (s, phase) => {
  for (let i = 0; i < 20000 && s.phase !== phase; i++) step(s);
};

test('day 1: an old servant joins the cast, and her death at noon is the only thing that happens', () => {
  const s = newTutorial();
  assert.ok(isTutorial(s));
  assert.equal(s.seed, TUTORIAL.seed);
  const maud = s.living.find((p) => p.name === TUTORIAL.servant.name);
  assert.ok(maud && maud.age === 'old' && maud.trait === TUTORIAL.servant.trait);
  assert.deepEqual(s.events, [{ at: Math.round(0.5 * 600), type: 'oldage', id: maud.id }]);
  assert.equal(s.raid, null);
  nextPhase(s, 'dusk');
  assert.deepEqual(s.bodies.map((b) => [b.name, b.kind]), [[TUTORIAL.servant.name, 'serene']]);
  assert.equal(s.living.length, 8);
  assert.ok(!s.living.some((p) => p.sick > 0), 'nobody fell sick');
  // An ordinary keep has no servant and rolls its day.
  const o = newSeason(TUTORIAL.seed);
  assert.ok(!isTutorial(o) && !o.living.some((p) => p.name === TUTORIAL.servant.name));
});

test("night 1 is one small tide from both rifts, with no Weeper for the day's death", () => {
  const s = newTutorial();
  playUntil(s, () => s.phase === 'night');
  const sp = s.night.spawns;
  assert.equal(sp.length, TUTORIAL.nights[1].creepers);
  assert.ok(sp.every((x) => x.type === 'creeper' && !x.snuff && !x.seep));
  assert.deepEqual([...new Set(sp.map((x) => x.rift))].sort(), ['r1', 'r2']);
  assert.equal(s.night.tides.length, 1);
});

test("day 2: the raid comes at its exact strength, kills no one and leaves one raider inside; the fire kills no one", () => {
  const s = newTutorial({ fireDeath: 1, raidRiskHeld: 1, raidRiskBreach: 1, raidRiskMax: 1 });
  playUntil(s, () => s.day === 2 && s.phase === 'day');
  assert.equal(s.raid.strength, TUTORIAL.days[2].raid);
  assert.ok(s.raid.safe);
  const fire = s.events.find((e) => e.type === 'fire');
  assert.ok(fire && fire.safe && fire.room.startsWith('hearth'));
  assert.ok(!s.events.some((e) => e.type === 'sick' || e.type === 'oldage'));
  // Nobody fights the fire or holds the gate: the fire burns at full heat, and the gate breaks.
  const deaths = s.ledger.filter((e) => e.from === 'living').length;
  for (const p of s.living) if (p.job === 'barracks') ok(s, { type: 'assign', id: p.id, room: 'yard' });
  s.watchBonus = 0;
  nextPhase(s, 'dusk');
  assert.equal(s.ledger.filter((e) => e.from === 'living').length, deaths, 'no one died');
  assert.equal(s.bodies.filter((b) => b.from === 'raider').length, 1);
  assert.ok(s.log.some((l) => /^The gate gave way/.test(l.text)));
  assert.ok(s.log.some((l) => /^Word comes|^Fire in the Hearth/.test(l.text)));
});

test('night 3 brings a Maw at half strength; the Church sends word on day 3', () => {
  const s = newTutorial();
  playUntil(s, () => s.day === 3 && s.phase === 'night' && s.t > 0);
  assert.ok(s.log.some((l) => l.day === 3 && /^Word comes from the Lantern Church: its inspector will visit on day 5/.test(l.text)));
  const maws = s.night.spawns.filter((x) => x.type === 'maw');
  assert.equal(maws.length, 1);
  assert.equal(maws[0].weak, TUTORIAL.nights[3].maw);
  playUntil(s, () => s.night?.foes.some((f) => f.type === 'maw'));
  const m = s.night.foes.find((f) => f.type === 'maw');
  assert.equal(m.max, TUNING.mawHp * TUTORIAL.nights[3].maw);
});

test("before night 4 the Veil holds at one crack short and Dread stops at 4; from night 4 it's an ordinary keep", () => {
  const s = newTutorial();
  playUntil(s, () => s.phase === 'night' && s.t > 0);
  s.cracks = s.tuning.cracksMax - 1;
  // A Creeper through the Veil: it holds.
  const c = s.night.spawns.shift();
  s.night.spawns.unshift({ ...c, at: s.t + 1 });
  s.night.candles = [];
  for (const d of s.shades) d.post = { ...d.post, f: 1 }; // nobody on the line
  playUntil(s, () => s.phase !== 'night');
  assert.notEqual(s.phase, 'over');
  assert.ok(s.log.some((l) => /The Veil holds by a thread/.test(l.text)));
  // At the rite, Dread stops one short.
  s.dread = 4;
  assert.equal(ritePreview(s).dread.to, 4);
  assert.equal(ritePreview(s).inspector, false);
  // Day 4 rolls as any day: a raid with its spread, and the Veil and Dread as they are.
  assert.ok(veilKept(s));
  playUntil(s, () => s.day === 4 && s.phase === 'day');
  assert.ok(s.raid && !s.raid.safe);
  assert.ok(!veilKept(s) && !tutorialDay(s) && !tutorialNight(s));
});

test('a tutorial keep replays exactly, keeps its flag through a new build, and a new keep after it is ordinary', () => {
  const s = newTutorial();
  playUntil(s, () => s.day === 4 && s.phase === 'day');
  const r = replay(s.seed, s.tuning0, s.actions);
  while (r.t < s.t) step(r);
  assert.deepEqual(r.living.map((p) => p.id), s.living.map((p) => p.id));
  assert.deepEqual(r.shades.map((d) => [d.id, d.memory]), s.shades.map((d) => [d.id, d.memory]));
  assert.equal(r.log.length, s.log.length);
  // A newer build's numbers don't turn it into an ordinary keep, and an old save has no tutorial.
  retune(s, { ...TUNING, tutorial: 0 });
  assert.equal(s.tuning.tutorial, 1);
  const old = JSON.parse(JSON.stringify(newSeason(4)));
  assert.ok(!isTutorial(upgrade(old)));
});

test('How to play covers every part of a season, in the keep\'s own numbers', () => {
  const secs = howTo(TUNING);
  assert.deepEqual(secs.map((x) => x.id), ['keep', 'day', 'raids', 'fire', 'dusk', 'night', 'weather', 'dawn', 'church', 'mirrors', 'moon']);
  const all = secs.flatMap((x) => x.items).join(' ');
  assert.match(all, new RegExp(`for ${TUNING.roomStone} stone`));
  assert.match(all, /days 2, 4 and 6/);
  assert.match(all, /kills in 1¼ days/);
  assert.ok(!/undefined|NaN/.test(all));
  const more = howTo({ ...TUNING, roomStone: 9, raidDays: { 3: 5, 5: 9 } }).flatMap((x) => x.items).join(' ');
  assert.match(more, /for 9 stone/);
  assert.match(more, /days 3 and 5/);
});
