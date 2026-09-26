// Content and tuning for the weeks 1–2 greybox. Numbers a designer would tweak live here;
// the simulation copies TUNING into each new game so a save keeps the numbers it was played with.

export const TICKS_PER_SEC = 10;

export const TUNING = {
  daySecs: 60, // real seconds per day at 1x
  nightSecs: 30,
  startFood: 12,
  startGlass: 4,

  eatPerDay: 1,
  hungryMult: 0.7, // everyone works slower while the larder is empty
  starveDays: 0.5, // every half day with an empty larder, the weakest dies of neglect

  sickChance: 0.35, // chance per day that someone falls sick
  sickDays: 1.25, // untreated sickness kills after this long (day time only)
  sickMult: 0.5,
  oldAgeChance: 0.08, // per old person per day

  raidFirstDay: 2,
  raidGap: [2, 3], // days between raids, inclusive range
  raidBase: 3,
  raidPerDay: 0.3, // gentle on purpose: escalating raids are a weeks 7–10 test
  raidSpread: 2,
  raidWarnAt: 0.3, // fraction of the day
  raidHitAt: 0.6,
  raidRiskHeld: 0.18, // chance per guard to fall, scaled by strength / defense
  raidRiskBreach: 0.3,
  raidRiskMax: 0.6,
  raidLoot: 0.3, // share of food and glass stolen on a breach
  raidInsideHeld: 0.25, // chance one raider dies inside the gatehouse when the gate holds
  wardCost: 4, // essence
  wardDefense: 4,

  newcomerEvery: 2, // a newcomer arrives at the gate every N days
  maxLiving: 12,

  griefMult: 0.8,
  peaceMult: 1.1,
  peaceDays: 3,
  twinMult: 1.25,
  hauntMult: 0.5,

  guidanceMax: 3,
  restlessNights: 3,
  bindCost: 3, // essence
  banishCost: 5, // essence
  vigilCost: 3, // remembrance

  dread: {
    perKeep: 1, // each shade kept at the rite
    perRestless: 1, // each Restless shade left unreleased
    perWraith: 2,
    livingPer: 3, // the living bear one kept shade per this many living...
    // ...plus one per priest. Dread moves by (dead held) minus (what the living bear) each dawn.
    max: 5,
    inspectorAt: 5,
    afterInspector: 2,
  },
};

// job(R) is the line the UI shows in each room box.
export const DAY_ROOMS = {
  hearth: { name: 'Hearth', twin: 'coldhearth', out: 'food', rate: 4, role: 'cook', job: (R) => `Cooks: ${R.rate} food a day each.` },
  glazier: { name: 'Glazier', twin: 'silvering', out: 'glass', rate: 2, role: 'glazier', job: (R) => `Glaziers: ${R.rate} glass a day each. Glass builds mirrors.` },
  chapel: {
    name: 'Chapel', twin: 'choir', out: 'remembrance', rate: 1, role: 'priest',
    job: (R) => `Priests: ${R.rate} remembrance a day and one funeral a day each. Each priest helps the living bear one of the dead.`,
  },
  barracks: { name: 'Barracks', twin: 'watch', out: 'defense', rate: 2, role: 'guard', job: (R) => `Guards: ${R.rate} defense each against raids.` },
  infirmary: { name: 'Infirmary', twin: 'threshold', out: 'healing', rate: 1, role: 'healer', job: (R) => `Healers: each cures ${R.rate} sick person a day.` },
};

export const NIGHT_ROOMS = {
  coldhearth: { name: 'Cold Hearth', twin: 'hearth', out: null, job: () => 'Morale for the dead. Arrives with fading in the weeks 3–4 greybox.' },
  silvering: { name: 'Silvering', twin: 'glazier', out: 'glass', rate: 2, job: (R) => `Quicksilver: ${R.rate} glass a night per shade.` },
  choir: {
    name: 'Choir of Echoes', twin: 'chapel', out: 'essence', rate: 2,
    job: (R) => `${R.rate} essence a night per shade. Each shade here also calms one Restless shade.`,
  },
  watch: {
    name: 'Watch of the Dead', twin: 'barracks', out: 'hold', rate: 1,
    job: () => 'Each shade holds one Wraith for the night. Strength left over adds to tomorrow\'s defense.',
  },
  threshold: {
    name: 'Threshold', twin: 'infirmary', out: 'guidance', rate: 1,
    job: () => "Each shade readies one guided death for tomorrow: Pale becomes Serene, Restless becomes Pale.",
  },
};

export const CAUSES = {
  duty: { name: 'Duty', kind: 'loyal', text: 'died on duty' },
  oldage: { name: 'Old age', kind: 'serene', text: 'died of old age' },
  sickness: { name: 'Sickness', kind: 'pale', text: 'died of sickness' },
  neglect: { name: 'Neglect', kind: 'restless', text: 'died of neglect' },
  yours: { name: 'Your order', kind: 'wraith', text: 'was killed on your order' },
  raider: { name: 'Raider', kind: 'stranger', text: 'fell raiding the keep' },
};

// The Threshold upgrades a death one step. Duty and old age are already good deaths;
// killing your own is never softened.
export const GUIDE_UP = { pale: 'serene', restless: 'pale' };

export const KINDS = {
  loyal: { name: 'Loyal', mult: 1, best: 'watch', bestMult: 1.5, desc: 'Died on duty. Works any post, best on the Watch.' },
  serene: { name: 'Serene', mult: 1, best: 'choir', bestMult: 1.5, desc: 'Died of old age. Works any post, best in the Choir.' },
  pale: { name: 'Pale', mult: 0.6, desc: 'Died of sickness. Works at 60%.' },
  stranger: { name: 'Stranger', mult: 0.8, desc: 'A raider who fell at your walls. Works at 80%. No bonds.' },
  restless: { name: 'Restless', mult: 0, desc: "Can't work. Turns Wraith after three nights unless released." },
  wraith: { name: 'Wraith', mult: 0, desc: 'Haunts a post each night unless the Watch holds it. Banish it with essence.' },
};
export const WORKING_KINDS = ['loyal', 'serene', 'pale', 'stranger'];

// Living traits. day: work multipliers by room ('*' = any room). The inverted trait is what the shade wakes with.
export const TRAITS = {
  brave: { name: 'Brave', inv: 'reckless', day: { barracks: 1.5 }, raidRisk: 2, desc: 'Guard ×1.5. Twice as likely to fall in a raid.' },
  devout: { name: 'Devout', inv: 'bitter', day: { chapel: 1.5 }, desc: 'Chapel ×1.5.' },
  diligent: { name: 'Diligent', inv: 'tireless', day: { '*': 1.2 }, desc: 'All day work ×1.2.' },
  coward: { name: 'Coward', inv: 'lurker', day: { barracks: 0.5 }, raidRisk: 0.5, desc: 'Guard ×0.5. Half as likely to fall in a raid.' },
  gentle: { name: 'Gentle', inv: 'keening', day: { infirmary: 1.5 }, desc: 'Infirmary ×1.5.' },
  greedy: { name: 'Greedy', inv: 'hoarding', day: { '*': 1.2 }, eats: 2, desc: 'All day work ×1.2. Eats double.' },
  stubborn: { name: 'Stubborn', inv: 'anchored', sickRisk: 0.5, desc: 'Half as likely to fall sick.' },
  cheerful: { name: 'Cheerful', inv: 'wistful', bondGrief: 0.9, desc: 'A bonded partner grieves less (×0.9 instead of ×0.8).' },
};
export const TRAIT_IDS = Object.keys(TRAITS);

export const SHADE_TRAITS = {
  reckless: { name: 'Reckless', night: { watch: 2, '*': 0.7 }, desc: 'Watch ×2. Other posts ×0.7.' },
  bitter: { name: 'Bitter', keepDread: 1, desc: 'Keeping it costs one extra Dread.' },
  tireless: { name: 'Tireless', night: { '*': 1.3 }, desc: 'All night work ×1.3.' },
  lurker: { name: 'Lurker', night: { '*': 0.8 }, hauntImmune: true, desc: 'Night work ×0.8. Wraiths never haunt it.' },
  keening: { name: 'Keening', night: { choir: 1.5 }, wail: 0.9, desc: 'Choir ×1.5. The living in the room above work ×0.9.' },
  hoarding: { name: 'Hoarding', night: { silvering: 1.5, choir: 0.5 }, desc: 'Silvering ×1.5. Choir ×0.5.' },
  anchored: { name: 'Anchored', inspectorImmune: true, desc: "The Church's inspector can't take it." },
  wistful: { name: 'Wistful', soothes: true, desc: 'Bonded living are at peace even while it is kept.' },
};

export const MIRRORS = {
  hand: { name: 'hand mirror', cap: 1, glass: 6 },
  pier: { name: 'pier glass', cap: 2, glass: 14 },
  great: { name: 'great glass', cap: 4, glass: 30 },
};
export const MIRROR_PLACES = ['Stair', 'Solar', 'Well', 'Tower', 'Kitchen', 'Gate', 'Library', 'Cellar', 'Loft', 'Cloister', 'Postern', 'Undercroft'];

// A fixed starting cast so playtest notes compare like with like ("how did Ada's death feel?").
export const START_CAST = [
  { name: 'Ada', trait: 'brave', age: 'adult', job: 'barracks' },
  { name: 'Wil', trait: 'stubborn', age: 'adult', job: 'barracks' },
  { name: 'Tam', trait: 'devout', age: 'old', job: 'chapel' },
  { name: 'Bran', trait: 'greedy', age: 'adult', job: 'hearth' },
  { name: 'Mira', trait: 'cheerful', age: 'adult', job: 'hearth' },
  { name: 'Sabe', trait: 'diligent', age: 'young', job: 'glazier' },
  { name: 'Osk', trait: 'coward', age: 'young', job: 'glazier' },
  { name: 'Nell', trait: 'gentle', age: 'old', job: 'infirmary' },
];
export const START_BONDS = [
  ['Ada', 'Wil', 'sibling'],
  ['Bran', 'Mira', 'spouse'],
  ['Tam', 'Nell', 'friend'],
];
export const START_MIRRORS = [
  ['pier', 'Chapel'],
  ['hand', 'Hall'],
];

export const NAMES = [
  'Corra', 'Idris', 'Lune', 'Rhea', 'Teo', 'Ulla', 'Vesna', 'Yorin', 'Zell', 'Ansel', 'Brin', 'Cass', 'Dov', 'Elin',
  'Fenn', 'Gale', 'Hale', 'Isa', 'Jory', 'Kit', 'Lark', 'Maren', 'Orrin', 'Pim', 'Quill', 'Rook', 'Sef', 'Tully',
  'Vale', 'Wynn', 'Ebba', 'Hollis', 'Juno', 'Marlo', 'Perrin', 'Sorrel',
];
export const RAIDER_NAMES = [
  'Hesk', 'Grall', 'Vorn', 'Skaldi', 'Ruck', 'Oda', 'Brask', 'Kolt', 'Maggo', 'Jast', 'Ferro', 'Dunn', 'Kesk', 'Ulf',
  'Thrane', 'Varga', 'Sket', 'Borla', 'Nisk', 'Crote',
];
