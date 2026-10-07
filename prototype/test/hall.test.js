import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, act, replay, startShades } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { START_SHADES, CAST } from '../src/slice/data.js';
import { epitaph } from '../src/slice/book.js';
import { recapOf } from '../src/slice/recap.js';
import { newDaily } from '../src/slice/daily.js';
import { summary, keepFromFile, BAD_FILE } from '../src/slice/saves.js';
import {
  openHall, saveHall, shrinkHall, noteKeep, leaveKeep, lastKeep, heirsOf, againstOf, dailyHistory, keepId, slotKeepId, keepLabel, worthKeeping,
  DEEDS, HALL_KEY, MAX_BOOK,
} from '../src/slice/hall.js';

// A store like the page's (saves.js), with room for only so many characters when cap is set.
function memStore(cap = Infinity) {
  const m = new Map();
  return {
    m,
    get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    set(k, v) {
      const text = JSON.stringify(v);
      if (text.length > cap) return false;
      m.set(k, text);
      return true;
    },
    remove: (k) => m.delete(k),
  };
}
const ADA = { name: 'Ada', age: 'adult', job: 'barracks', kind: 'loyal', cause: 'raid', how: 'cut down at the gate', named: true, was: 'brave', keep: 'your first keep', story: 'An adult soldier of the keep. Served 9 nights.' };
const TAM = { name: 'Tam', age: 'old', job: 'chapel', kind: 'serene', cause: 'oldage', how: 'died of old age', named: false, was: 'devout', keep: 'your first keep', story: 'An old priest of the keep.' };
const emptyHall = () => ({ v: 1, count: 0, keeps: [], deeds: {} });
// A keep with one season played and its record set by hand.
function played(seed, seasons, over = {}) {
  const s = newSeason(seed, over);
  for (const [i, x] of seasons.entries()) {
    s.seasons.push({ season: i + 1, day: x.day ?? 7, lost: x.lost || null, cracks: 0, summary: { deaths: x.deaths ?? 2, shades: 2, raids: [], inspections: [], hollow: null, taken: [], lost: [], byCause: {} } });
  }
  s.season = seasons.length;
  return s;
}

test('a new keep with no first dead given begins with Garrick and Hesper, as every keep did', () => {
  const s = newSeason(5);
  assert.deepEqual(s.shades.map((d) => d.name), START_SHADES.map((x) => x.name));
  assert.deepEqual(s.living.map((p) => p.name), CAST.map((c) => c.name));
  assert.equal(s.tuning.firstDead, null);
  assert.deepEqual(startShades(s.tuning), START_SHADES);
});

test('the last keep\'s dead take Garrick and Hesper\'s places, with their memory and posts but no bond', () => {
  const a = newSeason(5);
  const b = newSeason(5, { firstDead: [ADA, TAM] });
  assert.deepEqual(b.shades.map((d) => [d.name, d.kind, d.memory, d.named]), [['Ada', 'loyal', 80, true], ['Tam', 'serene', 60, false]]);
  assert.deepEqual(b.shades.map((d) => [d.post.f, d.post.x]), a.shades.map((d) => [d.post.f, d.post.x]));
  assert.ok(b.shades.every((d) => !d.bond));
  assert.ok(!b.living.some((p) => p.bond?.rel === 'child'), "Osk has no father in the glass");
  // The living Ada and Tam go by other names; everyone else is as they were, and the keep draws the same luck.
  assert.ok(!b.living.some((p) => p.name === 'Ada' || p.name === 'Tam'));
  assert.equal(b.living.length, a.living.length);
  assert.deepEqual(b.living.map((p) => p.trait), a.living.map((p) => p.trait));
  assert.equal(b.rng, a.rng);
  // The Book has them from the keep before, and the log says so.
  const e = b.ledger.find((x) => x.name === 'Ada');
  assert.equal(e.keep, 'your first keep');
  assert.match(epitaph(e), /^Of your first keep\. An adult soldier of the keep\. Served 9 nights\. Came with you to this keep\. Still in the glass\.$/);
  assert.ok(b.log.some((l) => /Ada and Tam, of your first keep, are in the Chapel glass/.test(l.text)));
  // In the keep's own rules, so it replays.
  const r = replay(b.seed, b.tuning0, []);
  assert.deepEqual(r.shades.map((d) => d.name), ['Ada', 'Tam']);
});

test('what can\'t come as it was comes as the place\'s own: a Wraith, a bad trait, a name twice', () => {
  const [one, two] = startShades({ firstDead: [{ ...ADA, kind: 'wraith', was: 'nonsense', job: 'nowhere' }, { ...TAM, name: 'Ada' }] });
  assert.equal(one.kind, 'loyal'); // Garrick's place
  assert.equal(one.was, null);
  assert.equal(one.job, null);
  assert.equal(two, START_SHADES[1], 'a second Ada is left out, and Hesper keeps her place');
  const [only, hesper] = startShades({ firstDead: [ADA] });
  assert.equal(only.name, 'Ada');
  assert.equal(hesper, START_SHADES[1]);
  // A carried Hesper in Garrick's place would meet Hesper herself in the second: Garrick keeps his place.
  assert.equal(startShades({ firstDead: [{ ...TAM, name: 'Hesper' }] })[0], START_SHADES[0]);
});

test('a Keeper who came from the last keep counts, so the next to take the glass is the Second Keeper', () => {
  const s = runSeasonAuto(2, { seasons: 4, tuning: { firstDead: [{ ...ADA, name: 'The Keeper', keeper: true }] } });
  assert.equal(s.phase, 'end', 'seed 2 holds its first year');
  assert.ok(act(s, { type: 'takeGlass' }).ok);
  assert.ok(s.shades.some((d) => d.name === 'The Second Keeper'));
  assert.match(epitaph(s.ledger.find((e) => e.name === 'The Keeper')), /Came with you to this keep, the Keeper no longer\./);
});

test('the Hall writes in a keep only once there is something to remember, and once, however often', () => {
  const hall = emptyHall();
  assert.equal(noteKeep(hall, newSeason(5), 1).entry, null);
  assert.ok(!worthKeeping({ ...played(5, [{}]), test: true }));
  const s = played(5, [{ deaths: 3 }]);
  const { entry } = noteKeep(hall, s, 10);
  assert.equal(entry.n, 1);
  assert.equal(entry.status, 'kept');
  assert.deepEqual(entry.seasons.map((x) => [x.season, x.stood, x.deaths]), [[1, true, 3]]);
  assert.equal(entry.card.season, 1);
  noteKeep(hall, s, 20);
  assert.equal(hall.keeps.length, 1);
  assert.equal(hall.keeps[0].first, 10);
  assert.equal(hall.keeps[0].last, 20);
  leaveKeep(hall, s, 30);
  assert.equal(hall.keeps[0].status, 'left');
  // A keep that fell stays fallen when its slot goes.
  const f = played(6, [{ lost: 'veil', day: 4 }]);
  f.phase = 'over';
  assert.equal(leaveKeep(hall, f, 40).entry.status, 'fell');
  assert.equal(keepLabel(hall.keeps[1]), 'your second keep');
  // Today's keep is one keep a date, however often it's begun.
  const d = played(1, [{}]);
  d.daily = '2026-10-06';
  assert.equal(keepId(d), 'daily:2026-10-06');
  assert.equal(keepLabel(noteKeep(hall, d, 50).entry), 'the keep of 6 October 2026');
  assert.equal(slotKeepId(summary(d, 1)), 'daily:2026-10-06');
  assert.equal(slotKeepId(summary(s, 1)), keepId(s));
});

test('the dead that go on: two still in the glass, a Keeper first; none from a keep whose Veil was sealed', () => {
  const s = played(5, [{}]);
  const add = (e) => s.ledger.push({ season: 1, day: 2, from: 'living', cause: 'raid', how: 'cut down at the gate', woke: 'loyal', end: null, nights: 0, kills: 0, posts: {}, ...e });
  add({ name: 'Wil', nights: 6, kills: 2 });
  add({ name: 'Mira', woke: 'pale', nights: 1 });
  add({ name: 'Bran', nights: 9, end: 'faded' });
  add({ name: 'Raider', from: 'raider', woke: 'stranger', nights: 30 });
  add({ name: 'Nell', woke: 'overflow', bound: { kind: 'serene', season: 1, day: 3 }, nights: 3 });
  add({ name: 'Ghost', woke: 'wraith', nights: 40 });
  const hall = emptyHall();
  const k = leaveKeep(hall, s, 1).entry;
  // Garrick and Hesper are still in its glass, but Wil (6 nights, 2 cut down) served most.
  assert.deepEqual(heirsOf(k).map((x) => [x.name, x.kind]), [['Wil', 'loyal'], ['Nell', 'serene']]);
  assert.ok(!heirsOf(k, 9).some((x) => ['Bran', 'Raider', 'Ghost'].includes(x.name)));
  assert.ok(heirsOf(k, 9).some((x) => x.name === 'Nell' && x.kind === 'serene'), 'bound after waking Restless, as what she was bound as');
  assert.equal(heirsOf(k)[0].keep, 'your first keep');
  assert.ok(!/Still in the glass\.$/.test(heirsOf(k)[0].story));
  add({ name: 'The Keeper', from: 'keeper', nights: 0 });
  assert.equal(heirsOf(leaveKeep(hall, s, 2).entry)[0].name, 'The Keeper');
  assert.ok(heirsOf(leaveKeep(hall, s, 2).entry)[0].keeper);
  s.sealed = { season: 1, year: 1, freed: 3 };
  assert.deepEqual(heirsOf(leaveKeep(hall, s, 3).entry), []);
  assert.deepEqual(heirsOf(null), []);
});

test('the last keep is the last one finished or left, never one still in a slot', () => {
  const hall = emptyHall();
  const a = played(1, [{}]);
  const b = played(2, [{}]);
  leaveKeep(hall, a, 1);
  noteKeep(hall, b, 2);
  assert.equal(lastKeep(hall, [keepId(b)]).id, keepId(a));
  assert.equal(lastKeep(hall, []).id, keepId(b));
  assert.equal(lastKeep(hall, [keepId(a), keepId(b)]), null);
});

test('the card sets a season against the same season of the last keep: deaths if both stood, else days', () => {
  const hall = emptyHall();
  const a = played(1, [{ deaths: 5 }, { deaths: 1 }]);
  noteKeep(hall, a, 1);
  const b = played(2, [{ deaths: 3 }, { lost: 'veil', day: 4 }, { deaths: 0 }]);
  noteKeep(hall, b, 2);
  assert.deepEqual([againstOf(hall, b, 1).label, againstOf(hall, b, 1).value, againstOf(hall, b, 1).page], ['Than my last keep', '2 deaths fewer', 'your first keep']);
  assert.equal(againstOf(hall, b, 2).value, '3 days fewer');
  assert.equal(againstOf(hall, b, 3), null, 'the last keep never played a third season');
  assert.equal(againstOf(hall, a, 1), null, 'nothing before the first keep');
  const r = recapOf(b, 1, againstOf(hall, b, 1));
  assert.deepEqual(r.stats[0], ['Than my last keep', '2 deaths fewer']);
  assert.equal(recapOf(b, 1).stats[0][0], 'Days held');
  // Today's keep is set against the last day's keep before it, and never against an ordinary keep.
  const d1 = played(3, [{ deaths: 1 }]);
  d1.daily = '2026-10-05';
  const d2 = played(4, [{ deaths: 2 }]);
  d2.daily = '2026-10-06';
  noteKeep(hall, d1, 3);
  noteKeep(hall, d2, 4);
  assert.deepEqual([againstOf(hall, d2, 1).label, againstOf(hall, d2, 1).value], ['Than 5 October 2026', '1 death more']);
  assert.equal(againstOf(hall, d1, 1), null);
  assert.deepEqual(dailyHistory(hall).map((x) => [x.date, x.seasons, x.deaths]), [['6 October 2026', 1, 2], ['5 October 2026', 1, 1]]);
});

test('deeds are done once, by the first keep to do them, and today\'s keep counts its days', () => {
  const hall = emptyHall();
  const year = played(1, [{}, {}, {}, { deaths: 0 }]);
  const { deeds } = noteKeep(hall, year, 1);
  assert.deepEqual(deeds.map((D) => D.id).sort(), ['spotless', 'year']);
  assert.equal(hall.deeds.year.label, 'your first keep');
  assert.deepEqual(noteKeep(hall, played(2, [{}, {}, {}, { deaths: 0 }]), 2).deeds, []);
  const heirs = played(3, [{}], { firstDead: [ADA] });
  assert.deepEqual(noteKeep(hall, heirs, 3).deeds.map((D) => D.id), ['heirs']);
  for (const [i, key] of ['2026-10-01', '2026-10-02', '2026-10-03'].entries()) {
    const d = played(10 + i, [{ lost: 'veil', day: 2 }]);
    d.daily = key;
    const got = noteKeep(hall, d, 10 + i).deeds.map((D) => D.id);
    assert.deepEqual(got, i === 2 ? ['mornings'] : []);
  }
  const sealed = played(20, [{}]);
  sealed.sealed = { season: 1, year: 1, freed: 0 };
  assert.ok(noteKeep(hall, sealed, 20).deeds.some((D) => D.id === 'sealed'));
  assert.equal(new Set(DEEDS.map((D) => D.id)).size, DEEDS.length);
  assert.ok(DEEDS.length <= 12, 'a short list');
});

test('a long Book keeps everyone from before and the dead it remembers best', () => {
  const s = played(5, [{}]);
  for (let i = 0; i < MAX_BOOK + 40; i++) s.ledger.push({ name: `N${i}`, season: 1, day: 3, from: 'living', cause: 'raid', how: 'cut down', woke: 'loyal', nights: i % 7, kills: 0, posts: {} });
  const k = noteKeep(emptyHall(), s, 1).entry;
  assert.equal(k.book.length, MAX_BOOK);
  assert.ok(k.book.filter((e) => e.from === 'before').length === 2);
  assert.ok(!k.book.some((e) => 'memory' in e));
});

test('the Hall gives up card images, then the oldest keeps no slot holds, before it fails to save', () => {
  const big = 'x'.repeat(3000);
  const hall = emptyHall();
  for (let i = 1; i <= 4; i++) {
    const k = noteKeep(hall, played(i, [{}]), i).entry;
    k.card.img = big;
  }
  const loose = memStore();
  assert.ok(saveHall(loose, hall));
  assert.equal(openHall(loose).keeps.length, 4);
  // Room for the words but not the pictures.
  const size = JSON.stringify({ ...hall, keeps: hall.keeps.map((k) => ({ ...k, card: { ...k.card, img: undefined } })) }).length;
  const tight = memStore(size + 3500);
  assert.ok(saveHall(tight, hall, [hall.keeps[0].id]));
  assert.equal(openHall(tight).keeps.filter((k) => k.card.img).length, 1, 'the newest image kept');
  // Room for less than every keep: the oldest not in a slot goes, and the one in a slot stays.
  const tighter = memStore(size * 0.6);
  assert.ok(saveHall(tighter, hall, [hall.keeps[0].id]));
  const left = openHall(tighter).keeps.map((k) => k.n);
  assert.ok(left.includes(1));
  assert.ok(left.length < 4);
  // Shrinking for a keep's own save drops every image.
  const h2 = emptyHall();
  noteKeep(h2, played(9, [{}]), 1).entry.card.img = big;
  const st = memStore();
  saveHall(st, h2);
  assert.ok(shrinkHall(st, h2));
  assert.ok(!openHall(st).keeps[0].card.img);
  assert.ok(!shrinkHall(st, h2));
  assert.equal(st.get(HALL_KEY).v, 1);
});

test('today\'s keep never carries anyone\'s dead: it is the same keep for everyone', () => {
  const d = newDaily('2026-10-07');
  assert.equal(d.tuning.firstDead, null);
  assert.deepEqual(d.shades.map((x) => x.name), ['Garrick', 'Hesper']);
});

test('a keep begun with its last keep\'s dead loads from a file; first dead that are more than a few words are refused', () => {
  const g = newSeason(5, { firstDead: [ADA, TAM] });
  assert.deepEqual(keepFromFile(JSON.stringify(g)).s.shades.map((d) => d.name), ['Ada', 'Tam']);
  const nested = structuredClone(g);
  nested.tuning.firstDead = [{ name: { evil: 1 } }];
  assert.equal(keepFromFile(JSON.stringify(nested)).error, BAD_FILE);
  const three = structuredClone(g);
  three.tuning0.firstDead = [ADA, TAM, ADA];
  assert.equal(keepFromFile(JSON.stringify(three)).error, BAD_FILE);
  const elsewhere = structuredClone(g);
  elsewhere.tuning.cracksMax = [ADA];
  assert.equal(keepFromFile(JSON.stringify(elsewhere)).error, BAD_FILE, 'only firstDead may hold words');
});
