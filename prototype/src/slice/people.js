// The season's people, living and dead: small pixel figures drawn from templates, 6 pixels wide and 12
// tall for an adult (the rooms are 20 tall). Each has a head with hair and an eye, a neck, shoulders and
// arms with hands, a belt, and two legs with shoes, so a person reads as a person at 3×. Templates face
// right and are mirrored to face left. Jobs dress them; a seed from the name picks hair, beard and skin.
// The shades are the same bodies as dark silhouettes, trailing off into wisps, with glowing eyes.
// Browser only in use (canvas), but pure drawing: no state.

import { P, MF, D, glow } from '../px/kit.js';

// Codes: H hair, S skin, E eye, N neck, T tunic, t back arm, K front hand, k back hand, B belt,
// L front leg, l back leg, F front shoe, f back shoe. Column 6 is for a hand held out in front.
const UPPER = {
  adult: {
    stand: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTTT.', 'tTTTTT.', 'tTTTTT.', 'kBBBBK.'],
    reach: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTT..', 'tTTTTTK', 'tTTTT..', 'kBBBB..'],
    low: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTT..', 'tTTTTT.', 'tTTTT.K', 'kBBBB..'],
  },
  young: {
    stand: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTTT.', 'tTTTTT.', 'kBBBBK.'],
    reach: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTTTK', 'tTTTT..', 'kBBBB..'],
    low: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTTT.', 'tTTTT.K', 'kBBBB..'],
  },
  // A child (generations): the same head on a short body.
  child: {
    stand: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTT..', 'kBBBK..'],
    reach: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTTK.', 'kBBB...'],
    low: ['.HHHH..', '.HSSS..', '.HSES..', '..NN...', 'tTTTT..', 'kBBB.K.'],
  },
  // Stooped: the head sits a pixel forward of the shoulders.
  old: {
    stand: ['..HHHH.', '..HSSS.', '..HSES.', '...NN..', '.tTTTT.', 'tTTTTT.', 'kBBBBK.'],
    reach: ['..HHHH.', '..HSSS.', '..HSES.', '...NN..', '.tTTTT.', 'tTTTTTK', 'kBBBB..'],
    low: ['..HHHH.', '..HSSS.', '..HSES.', '...NN..', '.tTTTT.', 'tTTTTT.', 'kBBBB.K'],
  },
};
const LOWER = {
  adult: {
    stand: ['.llLL..', '.llLL..', '.llLL..', '.ffFF..'],
    stride: ['.llLL..', 'll..LL.', 'l....L.', 'f....F.'],
    pass: ['.llLL..', '..lL...', '..lL...', '..fFF..'],
    robe: ['.TTTT..', '.TTTT..', 'TTTTTT.', '.ff.FF.'],
  },
  young: {
    stand: ['.llLL..', '.llLL..', '.ffFF..'],
    stride: ['.llLL..', 'l....L.', 'f....F.'],
    pass: ['..lL...', '..lL...', '..fFF..'],
    robe: ['.TTTT..', 'TTTTTT.', '.ff.FF.'],
  },
  child: {
    stand: ['.lLL...', '.fFF...'],
    stride: ['l..L...', 'f..F...'],
    pass: ['.lL....', '.fF....'],
    robe: ['TTTTT..', '.f.F...'],
  },
  old: {
    stand: ['.llLL..', '.llLL..', '.llLL..', '.ffFF..'],
    stride: ['.llLL..', '.l..L..', 'l...L..', 'f...FF.'],
    pass: ['.llLL..', '..lL...', '..lL...', '..fFF..'],
    robe: ['.TTTT..', '.TTTT..', 'TTTTTT.', '.ff.FF.'],
  },
};
export const FIG_H = { adult: 12, young: 10, old: 11, child: 8 };
const ageOf = (a) => (a === 'young' || a === 'old' || a === 'child' ? a : 'adult');

const darker = new Map();
// A darker shade of a palette colour, for the back arm and the back leg.
export function dark(hex, k = 0.72) {
  const key = hex + k;
  if (!darker.has(key)) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0');
    darker.set(key, `#${ch(16)}${ch(8)}${ch(0)}`);
  }
  return darker.get(key);
}

// What each job wears and carries.
export const OUTFITS = {
  chapel: { tunic: P.bone, legs: P.bone, belt: P.plum, shoes: P.brown, robe: 1, hood: '#d4bf94', prop: 'book' },
  glazier: { tunic: P.navy, legs: P.brown, belt: P.bone, shoes: P.earth, apron: P.brown, prop: 'pane' },
  chandlery: { tunic: P.tan, legs: P.brown, belt: P.brown, shoes: P.earth, apron: P.bone, prop: 'candle' },
  infirmary: { tunic: P.white, legs: P.white, belt: P.red, shoes: P.brown, robe: 1, hood: P.silver, cross: P.red },
  barracks: { tunic: P.steel, legs: P.ink, belt: P.brown, shoes: P.night, tabard: P.crimson, helm: P.silver, prop: 'spear' },
  hearth: { tunic: P.clay, legs: P.brown, belt: P.brown, shoes: P.earth, apron: P.bone, cap: P.bone },
  forge: { tunic: P.ink, legs: P.brown, belt: P.brown, shoes: P.earth, apron: P.brown, prop: 'hammer' },
  yard: { tunic: P.ochre, legs: P.brown, belt: P.earth, shoes: P.earth, prop: 'hammer' },
  none: { tunic: P.slate, legs: P.brown, belt: P.earth, shoes: P.earth },
};

const SKINS = [P.peach, P.skin2, P.tan, '#9b6b4f', '#6b4630'];
const HAIRS = [P.brown, P.plum, '#5a3a26', P.earth, P.rust, P.night, '#d9b36a'];
const STYLES = ['short', 'short', 'long', 'bun', 'crop', 'bald'];
function seedOf(name) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// The look of a living person: their job's clothes, and hair, beard and skin from their name.
export function livingLook(p) {
  const n = seedOf(p.name);
  const age = ageOf(p.age);
  const style = age === 'old' && n % 3 === 0 ? 'bald' : STYLES[n % (age === 'young' || age === 'child' ? STYLES.length - 1 : STYLES.length)];
  return {
    ...(OUTFITS[p.job] || OUTFITS.none),
    age,
    skin: p.sick > 0 ? '#a9c79a' : SKINS[(n >>> 4) % SKINS.length],
    hair: age === 'old' ? ((n >>> 8) % 2 ? P.silver : P.white) : HAIRS[(n >>> 8) % HAIRS.length],
    style,
    beard: age !== 'young' && age !== 'child' && (n >>> 12) % 4 === 0,
    sick: p.sick > 0,
  };
}

// The look of a shade: its body as a silhouette, and its kind's shape and eyes.
const SHADE_EYES = { loyal: P.cyan, serene: '#cfe0ff', pale: P.white, stranger: P.green };
export function shadeLook(d) {
  const body = d.kind === 'pale' ? '#4a4466' : '#07060d';
  return {
    age: ageOf(d.age),
    silhouette: body,
    far: d.kind === 'pale' ? '#3a3552' : '#1a1530',
    helm: d.kind === 'loyal' ? body : null,
    hood: d.kind === 'serene' ? body : null,
    horns: d.kind === 'stranger',
    eyes: SHADE_EYES[d.kind] || P.cyan,
    wisp: true,
  };
}

// Draws one figure with its feet on row y - 1, centred on column x, facing face (1 right, -1 left).
// o: a look (livingLook, shadeLook or hand-made) plus pose: 'stand' | 'walk' | 'work', and a phase.
export function figure(c, x, y, o, t) {
  const age = o.age || 'adult';
  const h = FIG_H[age];
  const face = o.face || 1;
  const ph = o.ph || 0;
  let upper = 'stand';
  let lower = 'stand';
  // Shades don't walk: they drift, bobbing a pixel, on their wisp.
  const bob = o.wisp && o.pose === 'walk' ? MF(t * 3 + ph) % 2 : 0;
  if (o.pose === 'walk' && !o.wisp) {
    lower = MF(t * 4 + ph) % 2 ? 'stride' : 'pass';
  } else if (o.pose === 'work') {
    upper = MF(t * 2 + ph) % 2 ? 'reach' : 'low';
  }
  if (o.robe) lower = 'robe';
  const rows = [...UPPER[age][upper], ...LOWER[age][lower]];
  const top = y - h - bob;
  const px = (j, i, col) => D(c, face > 0 ? x + j - 3 : x + 3 - j, top + i, col);
  const sil = o.silhouette;
  // A silhouette keeps one faintly different dark for the far arm and leg, so its shape still shows.
  const far = sil && (o.far || '#1a1530');
  const tunic = sil || o.tunic;
  const col = {
    H: sil || o.hair,
    S: sil || o.skin,
    E: sil || P.night,
    N: sil || dark(o.skin, 0.85),
    T: tunic,
    t: far || dark(o.tunic),
    K: sil || o.skin,
    k: far || dark(o.skin, 0.85),
    B: sil || o.belt,
    L: sil || o.legs,
    l: far || dark(o.legs),
    F: sil || o.shoes,
    f: far || dark(o.shoes, 0.8),
  };
  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    for (let j = 0; j < row.length; j++) {
      // A shade has no feet: under its legs the bottom row is a wisp that stirs.
      if (o.wisp && last) {
        if (j >= 1 && j <= 4 && (j + MF(t * 3 + ph)) % 2 === 0) px(j, i, col.T);
        continue;
      }
      const ch = row[j];
      if (ch !== '.') px(j, i, col[ch]);
    }
  });
  // Hair styles (the living only).
  const hc = col.H;
  if (!sil && !o.helm && !o.hood && !o.cap) {
    if (o.style === 'bald') {
      for (let j = 2; j <= 4; j++) px(j + (age === 'old' ? 1 : 0), 0, o.skin);
    } else if (o.style === 'long') {
      const s = age === 'old' ? 1 : 0;
      px(0 + s, 1, hc);
      px(0 + s, 2, hc);
      px(1 + s, 3, hc);
    } else if (o.style === 'bun') {
      const s = age === 'old' ? 1 : 0;
      px(1 + s, -1, hc);
      px(2 + s, -1, hc);
    } else if (o.style === 'crop') {
      px(4 + (age === 'old' ? 1 : 0), 1, hc);
    }
  }
  if (o.beard && !sil) {
    const s = age === 'old' ? 1 : 0;
    px(4 + s, 2, hc);
    px(2 + s, 3, hc);
    px(3 + s, 3, hc);
  }
  // Clothes over the body.
  const s = age === 'old' ? 1 : 0;
  const torsoTop = 4;
  const beltRow = UPPER[age].stand.length - 1;
  if (!sil && o.apron) {
    for (let i = torsoTop + 1; i <= beltRow + 2; i++) for (let j = 2; j <= 4; j++) if (i !== beltRow) px(j, i, o.apron);
  }
  if (!sil && o.tabard) for (let i = torsoTop; i <= beltRow + 1; i++) if (i !== beltRow) for (let j = 2; j <= 3; j++) px(j, i, o.tabard);
  if (!sil && o.cross) {
    px(3, torsoTop, o.cross);
    px(2, torsoTop + 1, o.cross);
    px(3, torsoTop + 1, o.cross);
    px(4, torsoTop + 1, o.cross);
    px(3, torsoTop + 2, o.cross);
  }
  // Headgear.
  if (o.helm) {
    const m = o.helm;
    for (let j = 1; j <= 4; j++) px(j + s, 0, m);
    px(1 + s, 1, m);
    px(1 + s, 2, m);
    px(2 + s, -1, m);
    px(3 + s, -1, m);
    if (!sil) px(4 + s, 1, dark(m, 0.8));
  }
  if (o.hood) {
    const m = o.hood;
    for (let j = 1; j <= 4; j++) px(j + s, 0, m);
    px(2 + s, -1, m);
    px(3 + s, -1, m);
    px(1 + s, 1, m);
    px(1 + s, 2, m);
    px(1 + s, 3, m);
    px(0 + s, 3, m);
  }
  if (o.cap) {
    for (let j = 1; j <= 4; j++) px(j + s, 0, o.cap);
    for (let j = 1; j <= 3; j++) px(j + s, -1, o.cap);
    px(2 + s, -2, o.cap);
  }
  if (o.horns) {
    const m = sil || P.bone;
    px(1 + s, -1, m);
    px(4 + s, -1, m);
    px(0 + s, -2, m);
    px(5 + s, -2, m);
  }
  // Something held in the front hand.
  const hand = o.pose === 'work' && upper === 'reach' ? { j: 6, i: torsoTop + 1 } : o.pose === 'work' ? { j: 6, i: torsoTop + 2 } : { j: 5, i: beltRow };
  if (!sil && o.prop === 'spear') {
    for (let i = -4; i < h - 1; i++) px(6, i, i < -2 ? P.silver : P.clay);
  } else if (!sil && o.prop === 'book' && o.pose === 'work') {
    px(hand.j, hand.i + 1, P.crimson);
    px(hand.j + 1, hand.i + 1, P.crimson);
  } else if (!sil && o.prop === 'pane' && o.pose === 'work') {
    px(hand.j + 1, hand.i - 1, '#bfe3ef');
    px(hand.j + 1, hand.i, '#bfe3ef');
  } else if (!sil && o.prop === 'candle' && o.pose === 'work') {
    px(hand.j, hand.i - 1, P.bone);
    px(hand.j, hand.i - 2, MF(t * 6 + ph) % 2 ? P.amber : P.yellow);
  } else if (!sil && o.prop === 'hammer' && o.pose === 'work') {
    px(hand.j, hand.i - 1, P.brown);
    px(hand.j, hand.i - 2, P.steel);
    px(hand.j + 1, hand.i - 2, P.steel);
  } else if (!sil && o.prop === 'lantern') {
    px(hand.j, hand.i + 1, P.brown);
    px(hand.j, hand.i + 2, P.yellow);
    glow(c, face > 0 ? x + hand.j - 3 : x + 3 - hand.j, top + hand.i + 2, 4, P.yellow, 0.35);
  } else if (!sil && o.prop === 'torch') {
    for (let i = 2; i <= 6; i++) px(6, i, P.brown);
    px(6, 1, MF(t * 6 + ph) % 2 ? P.orange : P.yellow);
    px(6, 0, P.yellow);
  }
}

// Where a figure's eyes are, for drawing them after the light so they glow in the dark.
export function eyesAt(x, y, o) {
  const age = o.age || 'adult';
  const face = o.face || 1;
  const s = age === 'old' ? 1 : 0;
  const top = y - FIG_H[age];
  const at = (j) => (face > 0 ? x + j - 3 : x + 3 - j);
  return [
    { x: at(3 + s), y: top + 2 },
    { x: at(4 + s), y: top + 2 },
  ];
}
