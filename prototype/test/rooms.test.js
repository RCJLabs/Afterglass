import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSeason, step, act, replay, upgrade, defense, raiseCost, wardCost, pitchOf, wardHoldOf, mirrorGlass, eatRate, decreeOf, gatehouseOf, undergateOpen,
  laddersDue, actsFor, canAct, canWork, learned, dayTicks, nightTicks, ritePreview, musterOf,
} from '../src/slice/sim.js';
import { geo, roomsOf } from '../src/slice/geo.js';
import { threats } from '../src/slice/threats.js';
import { autoStep } from '../src/slice/autopilot.js';
import { TUNING, STUDIES, DECREES, DAY_ROOMS } from '../src/slice/data.js';
import { howTo } from '../src/slice/howto.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const no = (s, a) => act(s, a).error;
// Nothing by day or night to get in the way: no fire, sickness, weather, raids, Unlit or visitors.
// lateRoomsFrom 1: these test the rooms, not round seven's staging of them (test/staging.test.js).
const calm = {
  fire: 0, sickChance: 0, oldAgeChance: 0, weather: 0, dreamwell: 0, errands: 0, omens: 0, visitors: 0, firstInspection: 99, lateRoomsFrom: 1,
  raidDays: { 2: 0, 4: 0, 6: 0 }, creepersBase: 0, creepersPerNight: 0, mawFrom: 99,
};
// On through dusk, the night and the rite to the next day, doing nothing.
function nextDay(s) {
  const d = s.day;
  for (let i = 0; i < 1e6 && !(s.phase === 'day' && s.day > d); i++) {
    if (s.phase === 'dusk') {
      if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
      ok(s, { type: 'startNight' });
    } else if (s.phase === 'dawn') ok(s, { type: 'beginDay' });
    else step(s);
  }
}
const adults = (s) => s.living.filter((p) => p.age !== 'child');
// A Gatehouse on the ground floor: a Barracks raised on top, the Hearth moved up into the bare hall beside it,
// and the Gatehouse raised where the Hearth was.
function withGatehouse(s) {
  ok(s, { type: 'raise', room: 'barracks' });
  const G = geo(s);
  const bare = G.floors[0].rooms.find(([, , , t]) => t === 'empty')[0];
  ok(s, { type: 'moveRoom', id: roomsOf(G, 'hearth')[0].id, to: bare });
  const H = geo(s);
  ok(s, { type: 'raise', room: 'gatehouse', at: H.floors[H.veil].rooms.find(([, , , t]) => t === 'empty')[0] });
}

test('the Library: a study begun with remembrance is finished by its scholars, and then the keep has it', () => {
  const s = newSeason(3, calm);
  Object.assign(s.res, { stone: 30, remembrance: 20 });
  assert.match(no(s, { type: 'study', id: 'masonry' }), /Build a Library first/);
  ok(s, { type: 'raise', room: 'library' });
  for (const p of adults(s).slice(0, 3)) ok(s, { type: 'assign', id: p.id, room: 'library' });
  assert.match(no(s, { type: 'study', id: 'rites' }), /Choose the kind/);
  const rem = s.res.remembrance;
  ok(s, { type: 'study', id: 'masonry' });
  assert.equal(s.res.remembrance, rem - STUDIES.masonry.rem);
  assert.match(no(s, { type: 'study', id: 'pitch' }), /is studying Masonry/);
  const cost = raiseCost(s, { newFloor: false });
  // Three scholars make 3 lore a day; masonry needs 4: done on the second day.
  while (s.phase === 'day') step(s);
  assert.ok(!learned(s, 'masonry'));
  assert.ok(s.study.lore > 2 && s.study.lore < 3.5, `about 3 lore after a day, as the scholars' traits have it (${s.study.lore})`);
  nextDay(s);
  while (s.study && s.phase === 'day') step(s);
  assert.ok(learned(s, 'masonry'));
  assert.equal(raiseCost(s, { newFloor: false }), cost - STUDIES.masonry.less);
  assert.match(s.log.find((l) => /The Library has finished Masonry/.test(l.text)).text, /a room costs 2 stone less/);
  assert.match(no(s, { type: 'study', id: 'masonry' }), /learned Masonry already/);
});

test("each study does what it says", () => {
  const s = newSeason(3, calm);
  const before = { ward: wardCost(s), pitch: pitchOf(s), hold: wardHoldOf(s), pier: mirrorGlass(s, 14) };
  s.learned = ['wards', 'pitch', 'hollow', 'silvering', 'tallow', 'herbs'];
  assert.equal(wardCost(s), before.ward - STUDIES.wards.less);
  assert.equal(pitchOf(s), before.pitch * STUDIES.pitch.mult);
  assert.equal(wardHoldOf(s), before.hold * STUDIES.hollow.hold);
  assert.equal(mirrorGlass(s, 14), Math.ceil(14 * STUDIES.silvering.glass));
  // Tallow: a candle set burns longer.
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const d = s.shades.find(canWork);
  ok(s, { type: 'candle', f: d.post.f, x: d.post.x });
  assert.equal(s.night.candles.at(-1).max, TUNING.candleWax * STUDIES.tallow.wax);
  // The old rites: two acts a night for the kind they were learned for, one for the rest.
  s.learned.push('rites');
  s.riteKind = d.kind;
  assert.equal(actsFor(s, d), 2);
  const other = s.shades.find((x) => canWork(x) && x.kind !== d.kind);
  if (other) assert.equal(actsFor(s, other), 1);
  ok(s, { type: 'startNight' });
  d.memory = 100;
  ok(s, { type: 'shadeAct', id: d.id });
  assert.ok(canAct(s, d), 'a second act');
  ok(s, { type: 'shadeAct', id: d.id });
  assert.match(no(s, { type: 'shadeAct', id: d.id }), /acted twice tonight/);
});

test('the Hall: one decree a season, each with its price; none without a Hall', () => {
  const s = newSeason(3, { ...calm, raidDays: { 2: 6, 4: 0, 6: 0 } });
  s.res.stone = 30;
  assert.match(no(s, { type: 'decree', id: 'levy' }), /Build a Hall first/);
  ok(s, { type: 'raise', room: 'hall' });
  const eat = eatRate(s);
  ok(s, { type: 'decree', id: 'levy' });
  assert.equal(decreeOf(s), 'levy');
  assert.match(no(s, { type: 'decree', id: 'rationing' }), /stands until the season ends/);
  assert.equal(eatRate(s), eat + DECREES.levy.food);
  // The levy stands the gate at the raid.
  nextDay(s);
  while (!s.raid?.warned) step(s);
  const def = defense(s);
  s.decree = null;
  assert.ok(Math.abs(def - defense(s) - DECREES.levy.defense) < 1e-6);
  // Rationing: three-quarters the food (a newcomer may have come since the first day's count).
  const base = eatRate(s);
  s.decree = { id: 'rationing', season: s.season };
  assert.ok(Math.abs(eatRate(s) - base * DECREES.rationing.eat) < 1e-6);
  // A decree lapses with its season.
  s.season++;
  assert.equal(decreeOf(s), null);
});

test("the Court of Shades: a shade seated there through half the night has a request heard free", () => {
  const s = newSeason(3, { ...calm, askAfter: 0 });
  s.res.stone = 30;
  ok(s, { type: 'raise', room: 'hall' });
  const G = geo(s);
  const court = roomsOf(G, 'hall')[0];
  const x = Math.round((court.x0 + court.x1) / 2);
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const d = s.shades.find(canWork);
  ok(s, { type: 'move', id: d.id, f: court.f, x });
  ok(s, { type: 'candle', f: court.f, x });
  ok(s, { type: 'startNight' });
  for (const k of s.night.candles) k.wax = k.max = 1e6; // light enough for the whole night
  while (s.phase === 'night') step(s);
  assert.equal(s.phase, 'dawn');
  const asks = Object.keys(s.rite.asks);
  assert.ok(asks.length, 'someone asks');
  assert.ok(asks.includes(s.rite.heard), 'one is heard');
  const id = s.rite.heard;
  const k = s.rite.asks[id];
  // Granted: no remembrance for it.
  s.res.remembrance = 0;
  ok(s, { type: 'request', id, grant: true });
  assert.deepEqual(ritePreview(s).errors, []);
  // Refused: not held against the shade.
  ok(s, { type: 'request', id, grant: false });
  const shade = s.shades.find((x2) => x2.id === id);
  const refused = shade.refused || 0;
  ok(s, { type: 'beginDay' });
  assert.equal(shade.refused || 0, refused, `a heard ${k} request refused isn't counted`);
  assert.ok(s.log.some((l) => /was heard in the Court of Shades/.test(l.text)));
});

test('the Gatehouse stands at the gate, on the ground floor, one to a keep; its guards count for more', () => {
  const s = newSeason(3, calm);
  s.res.stone = 60;
  assert.match(no(s, { type: 'raise', room: 'gatehouse', at: 'top' }), /on the ground floor/);
  ok(s, { type: 'raise', room: 'barracks' }); // two floors now
  const G = geo(s);
  const hall = G.floors[0].rooms.find(([, , , type]) => type === 'empty')[0];
  assert.match(no(s, { type: 'raise', room: 'gatehouse', at: hall }), /on the ground floor/, 'not the floor above');
  ok(s, { type: 'moveRoom', id: roomsOf(G, 'hearth')[0].id, to: hall });
  const H = geo(s);
  ok(s, { type: 'raise', room: 'gatehouse', at: H.floors[H.veil].rooms.find(([, , , t]) => t === 'empty')[0] });
  assert.equal(gatehouseOf(s).f, geo(s).veil);
  assert.match(no(s, { type: 'raise', room: 'gatehouse', at: 'top' }), /has its Gatehouse/);
  ok(s, { type: 'raise', room: 'chapel', at: 'top' });
  // It can't be moved up and away from the gate.
  const up = roomsOf(geo(s), 'chapel')[0];
  assert.match(no(s, { type: 'moveRoom', id: gatehouseOf(s).id, to: up.id }), /stands at the gate/);
  const p = adults(s).find((x) => x.trait !== 'brave' && x.trait !== 'coward' && x.age === 'adult');
  const def = defense(s);
  ok(s, { type: 'assign', id: p.id, room: 'gatehouse' });
  while (musterOf(s, p) < 1) step(s); // a guard counts in full once mustered
  s.raid = { strength: 5, state: 'coming', warned: true };
  assert.ok(Math.abs(defense(s) - def - DAY_ROOMS.gatehouse.rate * (p.trait === 'diligent' ? 1.15 : 1)) < 0.05);
});

test('from the second season the Host brings ladders: a manned Gatehouse throws them down, else they stand', () => {
  const at = (manned) => {
    const s = newSeason(5, { ...calm, raidDays: { 1: 5, 2: 0, 4: 0, 6: 0 } });
    s.res.stone = 30;
    withGatehouse(s);
    // Guards in the Barracks either way, so the gate holds the whole assault.
    for (const p of adults(s).slice(2, 4)) ok(s, { type: 'assign', id: p.id, room: 'barracks' });
    if (manned) ok(s, { type: 'assign', id: adults(s)[1].id, room: 'gatehouse' });
    s.season = 2;
    assert.ok(laddersDue(s));
    while (s.raid.state !== 'assault') step(s);
    s.raid.host = 1; // a weak Host, so the assault runs its whole time
    const h = s.raid.host;
    while (s.raid.state === 'assault') step(s);
    return { s, h };
  };
  const a = at(true);
  assert.ok(a.s.raid.ladders.down >= 3 && a.s.raid.ladders.up === 0, JSON.stringify(a.s.raid.ladders));
  const b = at(false);
  assert.ok(b.s.raid.ladders.up >= 3 && b.s.raid.ladders.down === 0, JSON.stringify(b.s.raid.ladders));
  assert.ok(b.s.log.some((l) => /ladder goes up against the wall and stands/.test(l.text)));
  // Not in the first season.
  const c = newSeason(5, calm);
  assert.ok(!laddersDue(c));
});

test('from the second season one Creeper of each tide comes up the Undergate, under the Veil, unless it is warded', () => {
  const s = newSeason(5, { ...calm, creepersBase: 12, undergateChance: 1, cracksMax: 99 }); // it stirs tonight, and the Veil lasts to see it
  s.res.stone = 30;
  withGatehouse(s);
  s.season = 2;
  assert.ok(undergateOpen(s));
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  const up = s.night.spawns.filter((sp) => sp.rift === 'undergate').length;
  assert.equal(up, s.night.tides.length, 'one of each tide');
  const th = threats(s);
  assert.equal(th.rises.find((e) => e.rift === 'undergate')?.climb + th.rises.find((e) => e.rift === 'undergate')?.snuff, up);
  const g = gatehouseOf(s);
  // Warded, they come up at the rifts instead.
  const w = JSON.parse(JSON.stringify(s));
  w.res.essence = 50;
  ok(w, { type: 'ward', target: 'undergate' });
  ok(w, { type: 'startNight' });
  for (let i = 0; i < nightTicks(w) * 0.95 && w.phase === 'night'; i++) step(w);
  assert.ok(!w.log.some((l) => /coming up through the Undergate/.test(l.text)));
  ok(s, { type: 'startNight' });
  for (let i = 0; i < nightTicks(s) * 0.95 && s.phase === 'night'; i++) step(s);
  assert.ok(s.log.some((l) => /coming up through the Undergate/.test(l.text)));
  assert.equal(g.f, geo(s).veil, 'under the Veil, behind the line');
});

test('the rooms replay exactly; old saves have none of them; How to play covers them', () => {
  // A keep that builds all three and uses them, then plays on by the autopilot.
  const s = newSeason(2, { lateRoomsFrom: 1 });
  ok(s, { type: 'debug', what: 'give', res: 'stone', n: 40 });
  ok(s, { type: 'debug', what: 'give', res: 'remembrance', n: 10 });
  withGatehouse(s);
  ok(s, { type: 'raise', room: 'library', at: 'top' });
  ok(s, { type: 'raise', room: 'hall' });
  ok(s, { type: 'study', id: 'tallow' });
  ok(s, { type: 'decree', id: 'curfew' });
  for (const p of adults(s).slice(0, 2)) ok(s, { type: 'assign', id: p.id, room: 'library' });
  for (let i = 0; i < 4e4 && s.phase !== 'over' && s.day < 4; i++) autoStep(s);
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.log.length, r.res, r.learned, r.keep], [s.log.length, s.res, s.learned, s.keep]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { library: 0, hall: 0, gatehouse: 0 })));
  for (const t of [old.tuning, old.tuning0]) for (const k of ['library', 'hall', 'gatehouse']) delete t[k];
  for (const k of ['learned', 'study', 'decree', 'court']) delete old[k];
  const g = upgrade(old);
  assert.deepEqual([g.tuning.library, g.tuning.hall, g.tuning.gatehouse, g.learned, g.study, g.decree], [0, 0, 0, [], null, null]);
  g.res.stone = 30;
  assert.match(no(g, { type: 'raise', room: 'library' }), /There is no Library in this keep/);
  g.season = 3;
  assert.ok(!laddersDue(g));
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /The Library: its scholars make/);
  assert.match(all(TUNING), /The Hall: one decree a season/);
  assert.match(all(TUNING), /The Gatehouse stands at the gate/);
  assert.ok(!/The Library: its scholars/.test(all({ ...TUNING, library: 0, hall: 0, gatehouse: 0 })));
});
