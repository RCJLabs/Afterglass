// Content and tuning for the weeks 7–10 slice: one season, day and night, in one keep.
// Distances are pixels of the keep (the pixel pass's units); times are seconds at 1x.

import { NAMES as ALL_NAMES, RAIDER_NAMES as ALL_RAIDERS } from '../data.js';

export const TICKS_PER_SEC = 10;
export const NAMES = ALL_NAMES;
export const RAIDER_NAMES = ALL_RAIDERS;

export const TUNING = {
  seasonDays: 7,
  daySecs: 60,
  nightSecs: 120,
  startFood: 12,
  startCandles: 8,
  startGlass: 4,

  // The day, from the weeks 1–2 greybox.
  eatPerDay: 1,
  hungryMult: 0.7,
  starveDays: 0.5,
  sickChance: 0.3,
  sickDays: 1.25,
  sickMult: 0.5,
  oldAgeChance: 0.06,
  newcomerEvery: 2,
  maxLiving: 12,
  griefMult: 0.8,
  peaceMult: 1.1,
  peaceDays: 3,
  twinMult: 1.25,

  // Raids escalate through the season: day → strength (before the spread).
  raidDays: { 2: 4, 4: 7, 6: 11 },
  raidSpread: 1.5,
  raidWarnAt: 0.3,
  raidHitAt: 0.6,
  raidRiskHeld: 0.18,
  raidRiskBreach: 0.3,
  raidRiskMax: 0.6,
  raidLoot: 0.3,
  raidInsideHeld: 0.25,
  wardGateCost: 4,
  wardGateDefense: 4,

  // The Lantern Church: a first visit on this day, announced the dawn before, then whenever Dread reaches 5.
  firstInspection: 5,
  inspectAt: 0.5,

  // Dread moves each dawn by what you hold back minus what the living bear.
  dreadPerKeep: 1,
  dreadPerRestless: 1,
  dreadPerWraith: 2,
  dreadPerCrack: 1,
  dreadLivingPer: 3,
  dreadMax: 5,
  vigilCost: 3,
  bindCost: 3,
  banishCost: 5,
  restlessNights: 3,
  guidanceMax: 3,

  // The night, from the weeks 3–4 greybox, in pixels.
  candleWax: 120,
  lightMax: 20,
  lightMin: 11,
  riftGap: 4,
  creeperHp: 2,
  creeperSpeed: 10,
  creeperClimb: 0.5,
  senseRange: 28,
  gnawRate: 2,
  snuffShare: 0.5,
  burnDps: 3,
  wraithHp: 6,
  wraithSpeed: 8,
  wraithDrain: 6,
  // The new moon, tuned so a first season usually survives it: the Hollow rises later, eats less light and
  // can be driven back by two good fighters, but left alone it still reaches the Veil and takes someone.
  hollowHp: 14,
  hollowSpeed: 3,
  hollowReach: 10, // candles this close to the Hollow on its floor lose their wax fast
  hollowEat: 8,
  hollowDrain: 4,
  hollowCracks: 1,
  hollowAt: 0.3,
  hollowReward: 3,
  wardHold: 20, // seconds a ward on a stair holds the Hollow back
  // Maws, the round-three brutes: they walk through light to the candle holding the way up and tear it
  // down, hitting any shade in their way. One lone Loyal shade can just about stop one; a Serene can't.
  mawFrom: 3,
  mawsPerNight: 1,
  mawHp: 6,
  mawSpeed: 6,
  mawSmash: 20, // wax a second torn from a candle a Maw has reached
  mawHit: 2, // memory a second from each shade standing where a Maw is
  shadeSpeed: 9,
  shadeClimb: 1,
  reach: 6,
  fightDps: 1,
  drainPerSec: 4,
  creepersBase: 4,
  creepersPerNight: 2.2,
  newMoonCreepers: 0.6, // the new moon brings the Hollow and fewer Creepers than the night before
  stragglers: 0.3, // the share that come alone; the rest come in tides
  tideEvery: 3, // one more tide every this many nights
  tideSpread: 0.08, // how long a tide takes to rise, as a share of the night
  seepFrom: 3,
  seepShare: 0.3,
  cracksMax: 5,
  wardCost: 5,
  // Night jobs, per second, for a lit shade standing at its post.
  essencePerSec: 0.06,
  glassPerSec: 0.03,
  wickPerSec: 0.012,
  guidePerSec: 0.012,
  fadePerNight: 10,
  restShare: 0.5,
  nameCost: 3,
  rememberCost: 1,
  rememberGain: 15,

  // A second season is harder: raid strength, Creeper counts and the Hollow's strength multiply by this per
  // season, and a Maw's strength by mawHardness. At 1.35 the autopilot finished about a third of its second
  // seasons; at 1.2 it finishes about two thirds. Maws stay as they were: a stronger Maw hurts a player who
  // answers it more than one who stacks the line, which is backwards.
  hardness: 1.2,
  mawHardness: 1,
};

// Day rooms. out is what a worker makes each day at full strength.
export const DAY_ROOMS = {
  chapel: { name: 'Chapel', out: 'remembrance', rate: 1, role: 'priest', job: (R) => `Priests: ${R.rate} remembrance a day and one funeral a day each.` },
  glazier: { name: 'Glazier', out: 'glass', rate: 2, role: 'glazier', job: (R) => `Glaziers: ${R.rate} glass a day each. Glass builds mirrors.` },
  chandlery: { name: 'Chandlery', out: 'candles', rate: 3, role: 'chandler', job: (R) => `Chandlers: ${R.rate} candles a day each, for the night.` },
  infirmary: { name: 'Infirmary', out: 'healing', rate: 1, role: 'healer', job: (R) => `Healers: each cures ${R.rate} sick person a day.` },
  barracks: { name: 'Barracks', out: 'defense', rate: 2, role: 'guard', job: (R) => `Guards: ${R.rate} defense each against raids.` },
  granary: { name: 'Granary', out: null, job: () => 'Stores. Raiders who break in take half as much food.' },
  hearth: { name: 'Hearth', out: 'food', rate: 4, role: 'cook', job: (R) => `Cooks: ${R.rate} food a day each.` },
  crypt: { name: 'Crypt', out: null, job: () => "The day's dead wait here for dusk." },
};
export const WORK_ROOMS = Object.keys(DAY_ROOMS).filter((k) => DAY_ROOMS[k].out);

// Each room's twin in the Tain, and what a lit shade standing there does.
export const TWINS = {
  chapel: { name: 'Choir of Echoes', job: 'essence', note: 'Singing makes essence and calms one Restless shade.' },
  glazier: { name: 'Silvering', job: 'glass', note: 'Quicksilver: glass for mirrors.' },
  chandlery: { name: 'Wick Room', job: 'wick', note: 'Saves wax: candles for the next dusk.' },
  infirmary: { name: 'Threshold', job: 'guidance', note: "Readies guided deaths: tomorrow's sick wake one kind better." },
  barracks: { name: 'Watch of the Dead', job: 'watch', note: "Its strength adds to tomorrow's defense." },
  granary: { name: 'Hollow Granary', job: null, note: 'Empty and dark: a weak spot.' },
  hearth: { name: 'Cold Hearth', job: 'rest', note: 'Resting here halves the night’s fading.' },
  crypt: { name: 'Waking Room', job: null, note: 'Where the dead wake.' },
};

// The keep a season starts with, top to bottom in its upright (day) layout. The Tain is the same rooms
// reflected under the Veil, so floor 0 (Chapel and Glazier by day) is the Tain's deepest floor, where the
// rifts open, and the last floor (Hearth and Crypt) sits right under the Veil, where the mirrors hang.
// Building adds floors on top (geo.js builds each keep's geometry); these are the starting four.
export const MAP = {
  W: 112,
  VEIL: 114,
  ROOM_H: 20,
  LEFT: 6,
  RIGHT: 106,
  floors: [
    { y: 24, rooms: [['chapel', 6, 54], ['glazier', 58, 106]] },
    { y: 46, rooms: [['chandlery', 6, 54], ['infirmary', 58, 106]] },
    { y: 68, rooms: [['barracks', 6, 54], ['granary', 58, 106]] },
    { y: 90, rooms: [['hearth', 6, 54], ['crypt', 58, 106]] },
  ],
  // Each stair joins floor f to floor f + 1 at x: two per pair of floors, so no single choke holds.
  stairs: [
    { id: 's1', f: 0, x: 24 },
    { id: 's2', f: 0, x: 88 },
    { id: 's3', f: 1, x: 40 },
    { id: 's4', f: 1, x: 72 },
    { id: 's5', f: 2, x: 16 },
    { id: 's6', f: 2, x: 96 },
  ],
  rifts: [
    { id: 'r1', x: 12 },
    { id: 'r2', x: 100 },
  ],
  mirrors: [
    { id: 'm1', x: 30 },
    { id: 'm2', x: 82 },
  ],
};

export const KINDS = {
  loyal: { name: 'Loyal', work: 1, fight: 1.5, speed: 1, desc: 'Died on duty. Fights hardest.' },
  serene: { name: 'Serene', work: 1.5, fight: 0.8, speed: 0.9, desc: 'Died of old age. Works best.' },
  pale: { name: 'Pale', work: 0.6, fight: 0.6, speed: 0.9, desc: 'Died of sickness. Weak at everything.' },
  stranger: { name: 'Stranger', work: 0.8, fight: 1.2, speed: 1.1, desc: 'A raider who fell inside the walls. No bonds.' },
  restless: { name: 'Restless', work: 0, fight: 0, speed: 0, desc: 'No mirror to hold it. Turns Wraith after three nights unless released.' },
  wraith: { name: 'Wraith', work: 0, fight: 0, speed: 0, desc: 'Your own dead gone wrong. Hunts inside the Tain every night until banished.' },
};
export const WORKING = ['loyal', 'serene', 'pale', 'stranger'];

export const CAUSES = {
  duty: { name: 'Duty', kind: 'loyal', text: 'died on duty' },
  oldage: { name: 'Old age', kind: 'serene', text: 'died of old age' },
  sickness: { name: 'Sickness', kind: 'pale', text: 'died of sickness' },
  neglect: { name: 'Neglect', kind: 'restless', text: 'died of neglect' },
  yours: { name: 'Your order', kind: 'wraith', text: 'was killed on your order' },
  raider: { name: 'Raider', kind: 'stranger', text: 'fell raiding the keep' },
  hollow: { name: 'The Hollow', kind: null, text: 'was taken by the Hollow' },
};
export const GUIDE_UP = { pale: 'serene', restless: 'pale' };

export const MIRRORS = {
  hand: { name: 'hand mirror', cap: 1, glass: 6 },
  pier: { name: 'pier glass', cap: 2, glass: 14 },
  great: { name: 'great glass', cap: 4, glass: 30 },
};
export const START_MIRRORS = [['pier', 'Chapel'], ['hand', 'Hall']];
export const MIRROR_PLACES = ['Stair', 'Solar', 'Well', 'Tower', 'Kitchen', 'Gate', 'Library', 'Cellar', 'Loft', 'Cloister'];

export const CAST = [
  { name: 'Ada', age: 'adult', job: 'barracks' },
  { name: 'Wil', age: 'adult', job: 'barracks' },
  { name: 'Tam', age: 'old', job: 'chapel' },
  { name: 'Bran', age: 'adult', job: 'hearth' },
  { name: 'Mira', age: 'adult', job: 'hearth' },
  { name: 'Sabe', age: 'young', job: 'glazier' },
  { name: 'Osk', age: 'young', job: 'chandlery' },
  { name: 'Nell', age: 'old', job: 'infirmary' },
];
export const BONDS = [
  ['Ada', 'Wil', 'sibling'],
  ['Bran', 'Mira', 'spouse'],
  ['Tam', 'Nell', 'friend'],
];
// The last keeper's dead, already in the Chapel glass when the season opens, posted at the feet of the
// two stairs up to the Veil. Garrick is Osk's father: posted in the Wick Room he and Osk both work x1.25.
export const START_SHADES = [
  { name: 'Garrick', age: 'adult', job: 'barracks', kind: 'loyal', cause: 'duty', memory: 80, named: false, bond: ['Osk', 'parent'], post: [2, 18] },
  { name: 'Hesper', age: 'old', job: 'chapel', kind: 'serene', cause: 'oldage', memory: 60, named: true, bond: null, post: [2, 94] },
];
// What each side of a bond is to the other: Garrick is Osk's parent, so Osk is Garrick's child.
export const BOND_OTHER = { parent: 'child', child: 'parent', sibling: 'sibling', spouse: 'spouse', friend: 'friend' };
