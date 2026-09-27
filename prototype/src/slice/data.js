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
  dreadPerBroken: 1, // each room a Maw broke in the night haunts the keep: Dread at dawn
  // One Dread borne per this many living. 4 was tried, to make the rite bite: it made every plan finish a few
  // points fewer second seasons and showed no gain from reading traits (README, problem 8).
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
  // Maws, the round-three brutes: they walk through light to whatever is worth most for the least fight,
  // the candle holding the way up or a room where the living or the dead work, hitting any shade in their
  // way. A candle they tear down; a room they break. One lone Loyal shade can just about stop one.
  mawFrom: 3,
  mawsPerNight: 1,
  mawHp: 6,
  mawSpeed: 6,
  mawSmash: 20, // wax a second torn from a candle a Maw has reached
  mawHit: 2, // memory a second from each shade standing where a Maw is
  mawRise: 8, // seconds a Maw takes to haul itself out of its rift, when it can be hit but does nothing
  mawBreak: 12, // seconds a Maw needs in a twin room to break it: no work there tonight, the day room haunted tomorrow
  mawLine: 3, // what the candle barring the way up is worth to a Maw, against a room's workers
  // The share of their work the living manage the day after in a room a Maw broke. Below 1 it decided
  // seasons through one room, the Chandlery broken the night before the new moon, so haunting costs
  // Dread (dreadPerBroken) and the work stands.
  hauntWork: 1,
  // An experiment, off: at 1, a shade in the light at the foot of a stair up to the Veil guards the line and
  // keeps the Watch, but does no other work. It made every autopilot plan worse and the doubled line no weaker
  // (README, problem 1).
  lineGuard: 0,
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

  // Building. A season starts with startFloors floors of the original keep, counted from the ground: at 1,
  // only the Hearth and the Crypt stand, and whoever has no room to work in quarries stone in the Yard.
  // A room costs roomStone and goes on top of the keep. Each room holds roomCap workers, so a job needs
  // another room of its kind to grow. Grave-steel from the Cold Forge makes every shade fight steelFight
  // times harder the next night.
  startFloors: 1,
  startStone: 8,
  roomStone: 6,
  roomCap: 3,
  steelFight: 1.25,

  // Traits (1 on, 0 off): everyone has one, and death turns it over (TRAITS below).
  traits: 1,

  // The Unlit take any dark way up, however long, and gnaw only a light that bars every way (1 on, 0 off).
  // Off, they gnaw the first light on their shortest way, so a room lit below the line took a whole tide.
  goAround: 1,

  // Breaking a mirror, an emergency open at any time: everyone in it is freed at once, Dread falls by
  // breakDread for each, and the next badLuckDays days are unlucky: sickness comes badLuck times as often.
  breakDread: 1,
  badLuckDays: 7,
  badLuck: 2, // also makes fire that much likelier

  // Fire by day (1 on, 0 off; keeps from before it play on without it). On fireChance of days a Hearth or a
  // Forge catches fire at some hour, at fireStart heat. The heat grows fireGrow a second and everyone in the
  // room fights it, fireFight each; masons sent from the Yard join them, or everyone, when the bell rings.
  // Each fighter may die, fireDeath a second times the heat squared; at full heat, every fireSpread seconds it
  // catches a room beside it. A fire still burning at dusk scorches its room: nobody works there the next day.
  fire: 1,
  fireChance: 0.3,
  fireStart: 0.25,
  fireGrow: 0.1,
  fireFight: 0.04,
  fireDeath: 0.02,
  fireSpread: 10,

  // Quarters, the Dreamwell and Weepers (1 on, 0 off; keeps from before them play on without crowding or
  // Weepers). The keep sleeps baseBeds and each Quarters quartersBeds more; with more living than beds,
  // sickness comes crowdSick times as often. A shade who dreams in the Dreamwell through half the night rests
  // the living: dreamWork better the next day. The night after a death, a Weeper for each of the day's dead
  // (up to weepersMax) seeps into the sleepers' twin (the Dreamwell, or the Cold Hearth in a keep without
  // Quarters) wherever it's dark. A Weeper that weeps nightmareSecs there gives one of the living a
  // nightmare (they work at nightmareMult the next day) and sinks away. Light keeps Weepers out and burns
  // them, and a Keening shade on their floor sings them quiet.
  dreamwell: 1,
  baseBeds: 8,
  quartersBeds: 4,
  crowdSick: 1.5,
  dreamWork: 1.1,
  weepersMax: 3,
  weeperHp: 1.5,
  weeperSpeed: 5,
  nightmareSecs: 15,
  nightmareMult: 0.6,

  // Whispers and the great glass (round three: a bound shade behind an uncovered mirror coaches whoever works
  // that room, and a great glass's shades can step through by day and help in person). By day a shade can
  // whisper its old trade to whoever works it now: they work whisperMult better. A shade in a great glass
  // can instead step through and work a room in person, as one worker at its night strength (perf) times
  // stepWork. Either tires it: at dusk it loses whisperFade or stepFade memory, on top of the night's
  // fading (halved for the named, and as its trait fades), and a whisper costs nothing on a day nobody
  // worked its trade.
  whispers: 1,
  whisperMult: 1.25,
  whisperFade: 8,
  stepWork: 1,
  stepFade: 8,
};

// Traits, from round three: each of the living has one, which helps or hinders at a job, and death turns it
// over into what the shade does at night. Some change what keeping the shade costs at the rite. Costs that
// fell on the gate or the larder cost too many raids (held 75% against 92% without traits), so Gentle's and
// Greedy's are elsewhere.
export const TRAITS = {
  brave: { name: 'Brave', dead: 'reckless', short: 'guards ×1.5; falls at the gate twice as often', guard: 1.5, fall: 2 },
  coward: { name: 'Coward', dead: 'lurker', short: 'guards ×0.5; never falls at the gate', guard: 0.5, fall: 0 },
  devout: { name: 'Devout', dead: 'bitter', short: '×1.5 in the Chapel, ×0.8 anywhere else', jobs: { chapel: 1.5 }, other: 0.8 },
  diligent: { name: 'Diligent', dead: 'tireless', short: '×1.15 at any job', any: 1.15 },
  gentle: { name: 'Gentle', dead: 'keening', short: '×1.5 healing in the Infirmary; grieves harder (×0.6 while grieving)', jobs: { infirmary: 1.5 }, grief: 0.6 },
  greedy: { name: 'Greedy', dead: 'hoarding', short: '×1.25 at the Glazier or the Chandlery, ×0.8 anywhere else', jobs: { glazier: 1.25, chandlery: 1.25 }, other: 0.8 },
  stubborn: { name: 'Stubborn', dead: 'anchored', short: 'sickness kills them half as fast', sick: 2 },
  cheerful: { name: 'Cheerful', dead: 'wistful', short: 'never grieves', grieves: false },
};
export const TRAIT_KEYS = Object.keys(TRAITS);
export const SHADE_TRAITS = {
  reckless: { name: 'Reckless', short: 'lunges further and fights ×2, but loses memory twice as fast', fight: 2, reach: 5, fade: 2, drain: 2 },
  lurker: { name: 'Lurker', short: 'unseen by Creepers and Wraiths, so never caught; fights ×0.25', fight: 0.25, unseen: true },
  bitter: { name: 'Bitter', short: 'costs 3 Dread to keep; while it stays, wards cost a fifth', dread: 3, wards: 0.2 },
  tireless: { name: 'Tireless', short: 'works ×1.6, but never rests and never works as a twin', work: 1.6, rests: false, twins: false },
  keening: { name: 'Keening', short: 'sings wherever it stands: calms two Restless shades a night, and Weepers on its floor fall quiet', calms: 2, hushes: true },
  hoarding: { name: 'Hoarding', short: '×2 essence in the Choir, but pockets 2 candles every dusk while the store holds more than 4', essence: 2, pockets: 2, spares: 4 },
  anchored: { name: 'Anchored', short: 'fades half as fast', fade: 0.5 },
  wistful: { name: 'Wistful', short: 'resting the night through in the Cold Hearth, or dreaming in the Dreamwell, it sends good dreams: the living work ×1.15 the next day', dreams: 1.15 },
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
  // Built rooms and the Yard.
  forge: { name: 'Forge', out: 'defense', rate: 1, role: 'smith', job: (R) => `Smiths: ${R.rate} defense each, arming the guards.` },
  cellar: { name: 'Cellar', out: null, job: () => 'Stores. Raiders who break in take half as many candles and half as much glass.' },
  quarters: { name: 'Quarters', out: null, beds: 4, job: () => 'Beds for four. With too few beds the living sleep crowded, and sickness comes more often.' },
  empty: { name: 'Bare hall', out: null, job: () => 'Unfinished stone. The next room built goes here.' },
  yard: { name: 'Yard', out: 'stone', rate: 2, role: 'mason', outdoors: true, job: (R) => `Masons: ${R.rate} stone a day each, to build with. The Yard holds any number.` },
};
// What can be built on top of the keep, in the order the build list shows them.
export const BUILDABLE = ['barracks', 'chandlery', 'hearth', 'forge', 'cellar', 'chapel', 'glazier', 'infirmary', 'granary', 'quarters'];
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
  forge: { name: 'Cold Forge', job: 'steel', note: 'Grave-steel: a shade who forges through half the night arms every shade the next night.' },
  cellar: { name: 'Hollow Cellar', job: null, note: 'Empty and dark: a weak spot.' },
  quarters: { name: 'Dreamwell', job: 'dreams', note: 'Dreams: a shade who dreams here through half the night rests the living for the day after. Weepers come here for the sleepers above.' },
  empty: { name: 'Hollow Hall', job: null, note: 'Bare and dark: a weak spot until something is built.' },
};

// The original keep, top to bottom in its upright (day) layout. The Tain is the same rooms reflected under
// the Veil, so floor 0 (Chapel and Glazier by day) is the Tain's deepest floor, where the rifts open, and
// the last floor (Hearth and Crypt) sits right under the Veil, where the mirrors hang. A season starts
// with the lowest startFloors of these; building adds floors on top (geo.js builds each keep's geometry).
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

// The living. Anyone whose room isn't built yet starts in the Yard. Between them they have each trait once.
export const CAST = [
  { name: 'Ada', age: 'adult', job: 'barracks', trait: 'brave' },
  { name: 'Wil', age: 'adult', job: 'barracks', trait: 'coward' },
  { name: 'Tam', age: 'old', job: 'chapel', trait: 'devout' },
  { name: 'Bran', age: 'adult', job: 'hearth', trait: 'stubborn' },
  { name: 'Mira', age: 'adult', job: 'hearth', trait: 'cheerful' },
  { name: 'Sabe', age: 'young', job: 'glazier', trait: 'diligent' },
  { name: 'Osk', age: 'young', job: 'chandlery', trait: 'greedy' },
  { name: 'Nell', age: 'old', job: 'infirmary', trait: 'gentle' },
];
export const BONDS = [
  ['Ada', 'Wil', 'sibling'],
  ['Bran', 'Mira', 'spouse'],
  ['Tam', 'Nell', 'friend'],
];
// The last keeper's dead, already in the Chapel glass when the season opens, posted on the line (the feet of
// the two stairs up to the Veil, or between rift and mirror in a keep with no stairs). Garrick is Osk's
// father: posted in the Wick Room he and Osk both work x1.25.
export const START_SHADES = [
  { name: 'Garrick', age: 'adult', job: 'barracks', kind: 'loyal', cause: 'duty', memory: 80, named: false, bond: ['Osk', 'parent'], was: 'brave' },
  { name: 'Hesper', age: 'old', job: 'chapel', kind: 'serene', cause: 'oldage', memory: 60, named: true, bond: null, was: 'stubborn' },
];
// What each side of a bond is to the other: Garrick is Osk's parent, so Osk is Garrick's child.
export const BOND_OTHER = { parent: 'child', child: 'parent', sibling: 'sibling', spouse: 'spouse', friend: 'friend' };
