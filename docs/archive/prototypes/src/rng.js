// Seeded RNG (mulberry32). The state lives on the game state so saves and replays stay deterministic.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (s, n) => Math.floor(rand(s) * n);
export const pick = (s, arr) => arr[randInt(s, arr.length)];
export const chance = (s, p) => rand(s) < p;
export function pickWeighted(s, items, weight) {
  const total = items.reduce((a, x) => a + weight(x), 0);
  let r = rand(s) * total;
  for (const x of items) { r -= weight(x); if (r < 0) return x; }
  return items[items.length - 1];
}
