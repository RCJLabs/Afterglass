// Content and tuning for the weeks 3–4 greybox: the night on its own.
// Distances are in tiles (a floor is W tiles wide), times in seconds at 1x.

export const NIGHT_TUNING = {
  nightSecs: 150,
  candles: 6, // handed out each dusk
  capacity: 6, // most shades the mirrors hold

  candleWax: 150, // seconds a candle burns untouched: one night
  lightMax: 3.5, // light radius of a fresh candle
  lightMin: 2, // ... and of one about to gutter
  riftGap: 1, // rifts drink light this close to them

  creeperHp: 2,
  creeperSpeed: 2.6,
  creeperClimb: 0.5,
  senseRange: 7, // Creepers notice shades in the dark this close, on their own floor
  gnawRate: 2, // extra wax burned per second by each Creeper gnawing at a light's edge
  snuffShare: 0.5, // share of Creepers that hunt candles; the rest climb for the Veil and gnaw only what blocks them
  burnDps: 3, // damage a Creeper takes each second inside light

  shadeSpeed: 2.2,
  shadeClimb: 1,
  reach: 1.5,
  fightDps: 1,
  drainPerSec: 4, // memory lost each second while a Creeper holds a shade
  essencePerSec: 0.06, // per shade working the Choir in light
  wardCost: 5,

  creepersBase: 3,
  creepersPerNight: 2,
  seepFrom: 2, // from this night on, some Creepers seep up in rooms left fully dark
  seepShare: 0.3,

  cracksMax: 5,
  fadePerNight: 10,
  restShare: 0.5, // a shade that spends this much of the night resting in a lit Cold Hearth fades at half

  nameCost: 3,
  rememberCost: 1,
  rememberGain: 15,
  releaseGain: 2,
  remembrancePerDawn: 1,
  arrivals: [0.2, 0.6, 0.2], // chance of 0, 1 or 2 new shades arriving from the day at each dawn
};

export const W = 30;

// Top to bottom: the Tain is the keep flipped, so the crypt's twin sits under the Veil and the
// library's twin sits over the Deep. [id, name, from x, to x]
export const FLOORS = [
  [['waking', 'Waking Room', 0, 12], ['cellar', 'Hollow Cellar', 12, 20], ['maw', 'The Maw', 20, 30]],
  [['coldhearth', 'Cold Hearth', 0, 10], ['granary', 'Hollow Granary', 10, 18], ['coldforge', 'Cold Forge', 18, 30]],
  [['threshold', 'Threshold', 0, 9], ['court', 'Court of Shades', 9, 20], ['watch', 'Watch of the Dead', 20, 30]],
  [['choir', 'Choir of Echoes', 0, 13], ['dreamwell', 'Dreamwell', 13, 30]],
  [['archive', 'Archive of the Dead', 0, 10], ['silvering', 'Silvering', 10, 20], ['wick', 'Wick Room', 20, 30]],
];
export const BOTTOM = FLOORS.length - 1;

// Each stair joins floor f to floor f + 1 at x.
export const STAIRS = [
  { id: 's1', f: 0, x: 3 },
  { id: 's2', f: 0, x: 27 },
  { id: 's3', f: 1, x: 8 },
  { id: 's4', f: 1, x: 22 },
  { id: 's5', f: 2, x: 5 },
  { id: 's6', f: 2, x: 24 },
  { id: 's7', f: 3, x: 10 },
  { id: 's8', f: 3, x: 20 },
];
export const RIFTS = [
  { id: 'r1', x: 4 },
  { id: 'r2', x: 15 },
  { id: 'r3', x: 26 },
];
// The mirrors hang in the Veil above the top floor. A Creeper that reaches one cracks the Veil.
export const VEIL_MIRRORS = [
  { id: 'm1', x: 7 },
  { id: 'm2', x: 16 },
  { id: 'm3', x: 24 },
];

// The one twin-room job this greybox tests, and the one resting place.
export const WORK_ROOM = 'choir';
export const REST_ROOM = 'coldhearth';

export const NIGHT_KINDS = {
  loyal: { name: 'Loyal', work: 1, fight: 1.5, speed: 1 },
  serene: { name: 'Serene', work: 1.5, fight: 0.8, speed: 0.9 },
  pale: { name: 'Pale', work: 0.6, fight: 0.6, speed: 0.9 },
  stranger: { name: 'Stranger', work: 0.8, fight: 1.2, speed: 1.1 },
};
export const ARRIVAL_KINDS = [
  ['loyal', 0.35],
  ['serene', 0.25],
  ['pale', 0.25],
  ['stranger', 0.15],
];

// The weeks 1–2 cast, a few nights after they died.
export const START_SHADES = [
  ['Ada', 'loyal'],
  ['Tam', 'serene'],
  ['Bran', 'pale'],
  ['Hesk', 'stranger'],
];
