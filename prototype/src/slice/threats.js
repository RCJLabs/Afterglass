// The black mirror: what the night holds, read at dusk from what's set so far. Tonight's spawns are rolled
// when the day ends, so their tides, rifts and tempers are known. Where the Unlit go depends on the candles,
// posts and wards as they stand, and comes from the Creepers' own planner (wayOf in sim.js). Once the night
// starts, candles burn down and shades move, so it can still turn out otherwise. Tomorrow's raid is rolled
// when the day begins, so the mirror shows its range.

import { wayOf, preyNear, mawPick, hard, defense, byId, nightTicks, isNewMoon, weeperRooms, weeperSpots } from './sim.js';
import { MAP } from './data.js';
import { geo, lightMap, darkRooms, DEEP_FLOOR, route, mirrorGoals } from './geo.js';

// A path as points to draw: where it starts, then each step; a step onto another floor is a climb.
function points(from, path) {
  return [{ f: from.f, x: from.x }, ...path.map((st) => ({ f: st.f, x: st.x }))];
}

// A Creeper's way from where it rises to where it stops: at a shade it finds in the dark on the way, at the
// light it will gnaw, or at a mirror. { end: 'catch' | 'gnaw' | 'veil' | 'none', pts, prey?, candle?, mirror? }
function follow(s, L, c) {
  const w = wayOf(s, L, c);
  const pts = [{ f: c.f, x: c.x }];
  if (w.mode === 'hunt') return { end: 'catch', prey: w.prey, pts: [...pts, ...w.path] };
  if (w.mode !== 'climb' && w.mode !== 'gnaw') return { end: 'none', pts };
  let { f, x } = c;
  for (const st of w.path) {
    if (st.f === f && !s.night.hush) {
      // Walking this floor: a shade in the dark within its sense is caught before anything else.
      const prey = preyNear(s, L, { ...c, f }, x, st.x);
      if (prey) {
        pts.push({ f, x: Math.max(Math.min(x, st.x), Math.min(Math.max(x, st.x), prey.x)) });
        return { end: 'catch', prey: prey.id, pts };
      }
    }
    pts.push({ f: st.f, x: st.x });
    f = st.f;
    x = st.x;
  }
  if (w.mode === 'gnaw') return { end: 'gnaw', candle: w.gnaw, pts };
  const mirror = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  return { end: 'veil', mirror: mirror.id, pts };
}

// Where a spawn rises: its own rift, or the first one open if that one is warded. Maws and the Hollow break
// up through their own rift whatever seals it; Creepers with nowhere open seep up instead.
function riftFor(n, sp) {
  const open = MAP.rifts.filter((r) => !n.wards.includes(r.id));
  return open.find((r) => r.id === sp.rift) || open[0] || (sp.type === 'creeper' ? null : byId(MAP.rifts, sp.rift));
}

export function threats(s) {
  const n = s.night;
  if (!n) return null;
  const T = s.tuning;
  const G = geo(s);
  const L = lightMap(G, T, n.candles);
  const N = nightTicks(s);
  const dark = darkRooms(G, L);

  // Tonight's Creepers: which rift, which temper, which tide.
  const rises = MAP.rifts.map((r) => ({ rift: r.id, x: r.x, climb: 0, snuff: 0 }));
  const tides = n.tides.map((at) => ({ at, count: 0 }));
  let seep = 0;
  let alone = 0;
  const window = (T.tideSpread * N) / 2 + 1;
  for (const sp of n.spawns) {
    if (sp.type !== 'creeper') continue;
    const tide = tides.find((t) => Math.abs(t.at - sp.at) <= window);
    if (tide) tide.count++;
    else alone++;
    const rift = riftFor(n, sp);
    if ((sp.seep && dark.length) || !rift) {
      seep++;
      continue;
    }
    rises.find((e) => e.rift === rift.id)[sp.snuff ? 'snuff' : 'climb']++;
  }
  for (const e of rises) {
    const at = { type: 'creeper', f: DEEP_FLOOR, x: e.x };
    e.way = e.climb ? follow(s, L, { ...at, temper: 'climb' }) : null;
    e.hunt = e.snuff ? follow(s, L, { ...at, temper: 'snuff' }) : null;
  }

  // The Maws: what each would make for if it rose now, and its way there.
  const maws = n.spawns
    .filter((sp) => sp.type === 'maw')
    .map((sp) => {
      const r = riftFor(n, sp);
      const m = { type: 'maw', f: DEEP_FLOOR, x: r.x, target: null };
      const to = mawPick(s, L, m);
      return { rift: r.id, x: r.x, at: sp.at, target: to && { kind: to.kind, id: to.id, f: to.f, x: to.x, guard: to.guard }, pts: to ? points(m, to.path) : [] };
    });

  // The Hollow walks to the nearest mirror whatever the light. A warded stair on its way holds it a while; if
  // there's a way round the wards it takes that.
  let hollow = null;
  const hs = n.spawns.find((sp) => sp.type === 'hollow');
  if (hs) {
    const r = riftFor(n, hs);
    const h = { f: DEEP_FLOOR, x: r.x };
    const way = route(G, L, h, mirrorGoals(G), { creeper: true, ignoreLight: true, wards: n.wards }) || route(G, L, h, mirrorGoals(G), { creeper: true, ignoreLight: true });
    hollow = { rift: r.id, x: r.x, at: hs.at, pts: way ? points(h, way.path) : [], held: way ? way.path.filter((st) => st.climb && n.wards.includes(st.climb)).map((st) => st.climb) : [] };
  }

  // Tomorrow's raid, rolled when the day begins: its range, against the gate as it's manned now (tonight's
  // Watch adds to it, and so do guards set tomorrow).
  const base = !isNewMoon(s) && T.raidDays[s.day + 1];
  const mid = base ? base * hard(s) : 0;
  const raid = base
    ? { day: s.day + 1, lo: Math.max(2, mid - T.raidSpread), hi: Math.max(2, mid + T.raidSpread), defense: defense(s) - (s.raid?.ward || 0) - (s.watchBonus || 0) }
    : null;

  // The Weepers, the night after a death: how many, the room they make for, and whether it has dark to weep in.
  const w = n.spawns.filter((sp) => sp.type === 'weeper').length;
  const weepers = w ? { count: w, rooms: weeperRooms(s).map((r) => r.id), dark: weeperSpots(s, L).length > 0 } : null;

  return { rises, tides, alone, seep, seepRooms: dark.map(([, id]) => id), maws, hollow, raid, weepers };
}
