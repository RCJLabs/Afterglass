// Old keeps (round seven, phase 6): upgrade() gives a keep from before a rule the value it played with, from one
// dated table, and a key added to the numbers can't slip past it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSeason, upgrade, RULES_SINCE } from '../src/slice/sim.js';
import { TUNING } from '../src/slice/data.js';

// Every key the numbers had when this test was written (round seven, phase 6), each already decided: a rule in
// RULES_SINCE, or a number whose default plays as keeps before it did.
const KNOWN = new Set(JSON.parse(readFileSync(new URL('./tuning-keys.json', import.meta.url), 'utf8')));
// Keys added since whose default plays as before in an old keep (say, a number only a switched-off rule reads),
// each with why.
const DEFAULT_OK = {
  mawDoor: 'read only for a door, a mirror hung in a room, and mirrorRooms is 0 for keeps before it',
  doorCracks: 'read only when a Maw comes through a door, and mirrorRooms is 0 for keeps before it',
  doorsFrom: 'read only when a Maw would come through a door, and mirrorRooms is 0 for keeps before it',
  traitorChance: 'read only for cruelty, and an old keep has cruelty 0',
  traitorHang: 'read only for cruelty, and an old keep has cruelty 0',
  traitorLet: 'read only for cruelty, and an old keep has cruelty 0',
  bearerChance: 'read only for cruelty, and an old keep has cruelty 0',
  priceChance: 'read only for cruelty, and an old keep has cruelty 0',
  hunterChance: 'read only for cruelty, and an old keep has cruelty 0',
  hunterDread: 'read only for cruelty, and an old keep has cruelty 0',
  hunterDays: 'read only for cruelty, and an old keep has cruelty 0',
  starGlass: 'read only for the four more omens, and an old keep has moreOmens 0',
  coldSpeed: 'read only for the four more omens, and an old keep has moreOmens 0',
  coldBurn: 'read only for the four more omens, and an old keep has moreOmens 0',
  lullStay: 'read only for the four more omens, and an old keep has moreOmens 0',
  moreOmenChance: 'read only for the four more omens, and an old keep has moreOmens 0',
  sallyPort: "read only for a campaign's sally-port close, and an old keep has chapterCloses 0",
  shrineDread: "read only for a campaign's honouring-the-dead close, and an old keep has chapterCloses 0",
  chartCatch: "read only for a campaign's charting-the-Deep close, and an old keep has chapterCloses 0",
  tallowBurn: "read only for a campaign's laying-by close, and an old keep has chapterCloses 0",
  lullChoir: 'read only for the four more omens, and an old keep has moreOmens 0',
  kinFight: 'read only for the four more omens, and an old keep has moreOmens 0',
  kinFade: 'read only for the four more omens, and an old keep has moreOmens 0',
  mawRuin: 'off (0) by default, as keeps before it played',
  hollowLure: 'off (0) by default, as keeps before it played',
  dreadPerRuin: 'read only for a ruined room, and mawRuin is 0 unless a keep sets it, so none is ruined',
  ruinWork: 'read only for a ruined room, as dreadPerRuin',
  autoRelight: 'off by default, as every keep before it played; on only in a new Gentle keep, or by Custom rules',
  ruinLight: 'read only while a Maw ruins a room, as dreadPerRuin',
  greatTideAt: 'read only for the great tide, and an old keep has greatTide 0',
  wispCost: 'read only for a wisp, and an old keep has wisp 0',
  wispSecs: 'read only for a wisp, as wispCost',
  veilStrains: 'a warning in the log only: the Veil strains; it plays the same',
  strainLead: 'read only for the Veil straining, a warning',
  strainGrace: 'read only for the Veil straining, a warning',
  winterNeed: "what the page shows in autumn about winter's candles; it plays the same",
  musterHours: 'read only while guards muster, and an old keep has muster 0',
  armDefense: 'read only for the Forge\'s arms, and an old keep has forgeArms 0',
  armsBreak: 'read only for the Forge\'s arms, as armDefense',
  curseBurn: "read only for the hedge-witch's curse where there are no Weepers, and a keep from before has weepersMax 3 (where the Dreamwell's rules are off, she never comes)",
  mendStone: 'read only for mending, and an old keep has repairs 0',
  gateBreached: 'read only for the gate a breach leaves, as mendStone',
  hauntDays: 'read only with repairs, as mendStone',
  repairsFrom: 'read only with repairs, as mendStone',
  burnDays: 'read only with repairs, as mendStone',
  gateMend: 'read only with repairs, as mendStone',
  studyTwoCost: "read only for a study's second rank, and an old keep has studyTiers 1",
  hallFade: 'read only for a great-glass hall, and an old keep has glassHalls 0',
  lampGlass: 'read only for the Lampworks, and an old keep has lampworks 0',
  highFrom: 'read only for the Lampworks, as lampGlass',
  troublesFrom: 'read only for the troubles, and an old keep has troubles 0',
};

test('every key in the numbers is decided for old keeps', () => {
  const rules = new Set(RULES_SINCE.map((r) => r.key));
  const undecided = Object.keys(TUNING).filter((k) => !KNOWN.has(k) && !rules.has(k) && !(k in DEFAULT_OK));
  assert.deepEqual(undecided, [], `New tuning keys: ${undecided.join(', ')}. For each, either add it to RULES_SINCE in sim.js with the value that plays as keeps before it did, or to DEFAULT_OK here, saying why its default is safe for them.`);
});

test('the table names real keys once each, in the order they came', () => {
  const keys = RULES_SINCE.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of RULES_SINCE) {
    assert.ok(r.key in TUNING, `${r.key} is not a tuning key`);
    assert.match(r.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.what);
  }
  const dates = RULES_SINCE.map((r) => r.since);
  assert.deepEqual([...dates].sort(), dates);
});

test('a keep from before every rule gets each old value, and the rest of today’s numbers', () => {
  const g = JSON.parse(JSON.stringify(newSeason(7)));
  for (const t of [g.tuning, g.tuning0]) for (const r of RULES_SINCE) delete t[r.key];
  delete g.tuning.lightMax;
  upgrade(g);
  for (const t of [g.tuning, g.tuning0]) for (const r of RULES_SINCE) assert.equal(t[r.key], r.old, r.key);
  assert.equal(g.tuning.lightMax, TUNING.lightMax);
});

test('a keep from this build is left as it is', () => {
  const g = JSON.parse(JSON.stringify(newSeason(7)));
  const before = JSON.stringify(g.tuning) + JSON.stringify(g.tuning0);
  upgrade(g);
  assert.equal(JSON.stringify(g.tuning) + JSON.stringify(g.tuning0), before);
});
