// A crude night player for soak tests and balance runs: lights both stair feet over the Deep and the
// Choir, holds the stairs with fighters, sings with the rest, and patches whatever gutters.

import { actNight, stepNight } from './night.js';

// Just inside both edges of the two stair-foot lights.
const FIGHT_POSTS = [[4, 10.6], [4, 20.6], [4, 12.4], [4, 22.4]];

// Two crude plans. 'stairs' holds the way up from the Deep; 'veil' lights the three mirrors instead,
// so whatever gets past (or seeps up) still meets light at the top.
const PLANS = {
  stairs: { candles: [[4, 10], [4, 20], [3, 6.5]], posts: FIGHT_POSTS },
  veil: { candles: [[0, 7], [0, 16], [0, 24], [3, 6.5]], posts: [[0, 4.2], [0, 18.6], [0, 26.6], [0, 9.8], [0, 13.4], [0, 21.4]] },
  // Every way to the Veil runs through the two stairs up to the top floor: light them and hold them.
  chokes: { candles: [[0, 4], [0, 26], [3, 6.5]], posts: [[0, 4.4], [0, 25.6], [0, 5.8], [0, 24.2]] },
};

export function nightPilot(s, policy = 'stairs') {
  const acts = [];
  const T = s.tuning;
  const P = PLANS[policy];
  if (s.phase === 'dusk') {
    for (const [f, x] of P.candles) acts.push({ type: 'candle', f, x });
    const fighters = s.shades.filter((d) => d.kind === 'loyal' || d.kind === 'stranger');
    const singers = s.shades.filter((d) => d.kind === 'serene' || d.kind === 'pale');
    fighters.forEach((d, i) => {
      const [f, x] = P.posts[i % P.posts.length];
      acts.push({ type: 'move', id: d.id, f, x });
    });
    singers.forEach((d, i) => acts.push({ type: 'move', id: d.id, f: 3, x: 5.5 + (i % 3) * 0.9 }));
    acts.push({ type: 'start' });
  } else if (s.phase === 'night') {
    const caught = s.shades.find((d) => d.grabbedBy);
    if (caught && s.candlesLeft > 0) acts.push({ type: 'candle', f: caught.f, x: caught.x });
    const low = s.candles.find((c) => c.wax < c.max * 0.25 && !s.candles.some((o) => o !== c && o.f === c.f && Math.abs(o.x - c.x) < 0.5 && o.wax > o.max * 0.5));
    if (low && s.candlesLeft > 1) acts.push({ type: 'candle', f: low.f, x: low.x }); // keep one to free a shade
    const rift = ['r2', 'r1', 'r3'].find((id) => !s.wards.includes(id));
    if (rift && s.essence >= T.wardCost) acts.push({ type: 'ward', target: rift });
  } else if (s.phase === 'dawn') {
    let rem = s.remembrance;
    for (const d of s.shades.filter((x) => x.memory < 12)) {
      acts.push({ type: 'release', id: d.id });
      rem += T.releaseGain;
    }
    const keep = s.shades.filter((x) => x.memory >= 12).sort((a, b) => b.memory - a.memory);
    const unnamed = keep.find((d) => !d.named);
    if (unnamed && rem >= T.nameCost) {
      acts.push({ type: 'name', id: unnamed.id });
      rem -= T.nameCost;
    }
    for (const d of [...keep].reverse()) {
      if (rem < T.rememberCost || d.memory > 70) break;
      acts.push({ type: 'remember', id: d.id });
      rem -= T.rememberCost;
    }
    acts.push({ type: 'rate', score: 3 }, { type: 'next' });
  }
  return acts;
}

// Plays until the given night ends or the keep is lost. onTick sees the state every tick.
export function runNightAuto(s, { nights = 5, onTick, policy = 'stairs' } = {}) {
  let stuck = 0;
  while (s.phase !== 'over' && s.night <= nights) {
    for (const a of nightPilot(s, policy)) actNight(s, a);
    s.alerts.length = 0;
    if (s.phase === 'night') {
      stepNight(s);
      onTick?.(s);
      stuck = 0;
    } else if (++stuck > 3) {
      throw new Error(`night autopilot stuck in ${s.phase} on night ${s.night}`);
    }
  }
  return s;
}
