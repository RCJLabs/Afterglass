// A crude player for soak tests and balance runs. It follows simple rules, not good play,
// so its numbers show how the rules behave, not how well a person would do.

import { DAY_ROOMS, MIRRORS } from './data.js';
import {
  act, step, roomPower, defense, eatRate, capacity, funeralCap, ritePreview, choicesFor, canWork, shadeMult,
  bear, byId,
} from './sim.js';

export const POLICIES = {
  keep: 'Keeps every shade it can.',
  cover: 'Covers every mirror at dawn.',
  bear: 'Keeps as many shades as the living can bear, covers the rest.',
};

function neediestRoom(s) {
  const pw = roomPower(s, 'day');
  if (pw.hearth * DAY_ROOMS.hearth.rate < eatRate(s) + 0.5) return 'hearth';
  if (s.living.some((p) => p.sick > 0) && pw.infirmary < 1) return 'infirmary';
  if (!pw.chapel) return 'chapel';
  if (pw.barracks * DAY_ROOMS.barracks.rate < s.tuning.raidBase + s.tuning.raidPerDay * (s.day + 1)) return 'barracks';
  return 'glazier';
}

function bestPost(s, d) {
  const pw = roomPower(s, 'night');
  const wraiths = s.shades.filter((x) => x.kind === 'wraith').length;
  const restless = s.shades.filter((x) => x.kind === 'restless').length;
  const inChoir = s.shades.filter((x) => x.post === 'choir' && canWork(x)).length;
  if (wraiths > pw.watch) return 'watch';
  if (restless > inChoir) return 'choir';
  if (s.guidance < 1 && pw.threshold < 0.5) return 'threshold';
  const p = d.bond ? byId(s.living, d.bond.with) : null;
  if (p?.job && DAY_ROOMS[p.job].twin !== 'coldhearth') return DAY_ROOMS[p.job].twin;
  return pw.choir <= pw.silvering ? 'choir' : 'silvering';
}

export function autopilot(s, policy = 'bear') {
  const acts = [];
  if (s.phase === 'fallen') return acts;
  for (const p of s.living) if (!p.job) acts.push({ type: 'assign', id: p.id, room: neediestRoom(s) });

  if (s.phase === 'day') {
    const r = s.raid;
    if (r?.state === 'coming' && r.warned && !r.ward && defense(s) < r.strength && s.res.essence >= s.tuning.wardCost) acts.push({ type: 'ward' });
    // A player pulls glaziers onto the walls when raiders are sighted, and finds a healer for the sick.
    if (r?.state === 'coming' && r.warned && defense(s) < r.strength) {
      const spare = s.living.find((p) => p.job === 'glazier');
      if (spare) acts.push({ type: 'assign', id: spare.id, room: 'barracks' });
    }
    if (s.living.some((p) => p.sick > 0) && !s.living.some((p) => p.job === 'infirmary' && !(p.sick > 0))) {
      const spare = s.living.find((p) => p.job === 'glazier' && !(p.sick > 0)) || s.living.find((p) => p.job === 'barracks' && !(p.sick > 0));
      if (spare) acts.push({ type: 'assign', id: spare.id, room: 'infirmary' });
    }
    if (capacity(s).free === 0 && policy !== 'cover') {
      if (s.res.glass >= MIRRORS.pier.glass) acts.push({ type: 'build', mirror: 'pier' });
      else if (s.res.glass >= MIRRORS.hand.glass) acts.push({ type: 'build', mirror: 'hand' });
    }
  }

  if (s.phase === 'dusk' && s.dusk.step === 'crypt') {
    // Bury whoever would wake badly (Wraith, Restless, overflow); everyone else wakes.
    let free = capacity(s).free;
    let left = funeralCap(s);
    for (const b of s.bodies) {
      const good = b.kind !== 'wraith' && b.kind !== 'restless';
      if (good && free > 0) {
        free--;
        continue;
      }
      if (left > 0) {
        acts.push({ type: 'funeral', id: b.id, on: true });
        left--;
      }
    }
    acts.push({ type: 'wake' });
  } else if (s.phase === 'dusk') {
    for (const d of s.shades) if (canWork(d) && !d.post) acts.push({ type: 'post', id: d.id, room: bestPost(s, d) });
    acts.push({ type: 'beginNight' });
  }

  if (s.phase === 'rite') {
    const working = s.shades.filter(canWork).sort((a, b) => shadeMult(s, b) - shadeMult(s, a));
    const keepN = policy === 'keep' ? working.length : policy === 'cover' ? 0 : Math.max(0, bear(s));
    working.forEach((d, i) => acts.push({ type: 'rite', id: d.id, choice: i < keepN ? 'keep' : 'cover' }));
    let essence = s.res.essence;
    for (const d of s.shades) {
      if (d.kind === 'wraith' && essence >= s.tuning.banishCost) {
        acts.push({ type: 'rite', id: d.id, choice: 'banish' });
        essence -= s.tuning.banishCost;
      } else if (d.kind === 'restless') {
        acts.push({ type: 'rite', id: d.id, choice: 'release' });
      }
    }
    acts.push({ type: 'vigil', n: 0 }, { type: 'beginDay' });
  }
  return acts;
}

// Vigils need the preview, which depends on the choices above, so they're settled just before dawn.
function settleVigils(s) {
  let n = 0;
  while (n < 10) {
    act(s, { type: 'vigil', n: n + 1 });
    const P = ritePreview(s);
    if (P.errors.length || P.dread.from + P.dread.delta < 0) {
      act(s, { type: 'vigil', n });
      return;
    }
    n++;
  }
  act(s, { type: 'vigil', n });
}

// Runs the autopilot until the given day ends or the keep falls. Returns the game state.
export function runAuto(s, { days = 20, policy = 'bear', onPhase } = {}) {
  let lastPhase = null;
  let stuck = 0;
  while (s.phase !== 'fallen' && s.day <= days) {
    if (s.phase !== lastPhase) {
      onPhase?.(s);
      lastPhase = s.phase;
    }
    for (const a of autopilot(s, policy)) {
      if (a.type === 'beginDay') settleVigils(s);
      const r = act(s, a);
      if (!r.ok && (a.type === 'beginDay' || a.type === 'wake' || a.type === 'beginNight')) {
        // Fall back to the safest dawn: cover everyone, release the Restless, leave Wraiths.
        if (a.type === 'beginDay') {
          for (const d of s.shades) act(s, { type: 'rite', id: d.id, choice: choicesFor(d).includes('cover') ? 'cover' : choicesFor(d).includes('release') ? 'release' : 'leave' });
          act(s, { type: 'vigil', n: 0 });
          const again = act(s, { type: 'beginDay' });
          if (!again.ok) throw new Error(`autopilot stuck at dawn: ${again.error}`);
        } else throw new Error(`autopilot: ${a.type} failed: ${r.error}`);
      }
    }
    s.alerts.length = 0;
    if (s.phase === 'day' || s.phase === 'night') {
      step(s);
      stuck = 0;
    } else if (++stuck > 3) {
      throw new Error(`autopilot stuck in ${s.phase} on day ${s.day}`);
    }
  }
  return s;
}
