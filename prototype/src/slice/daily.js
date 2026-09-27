// Today's keep: everyone who plays on the same day gets the same keep, from a seed made of the date, on the
// rules as they ship. The day turns at midnight UTC, so it's the same keep everywhere at once. Pure.

import { newSeason } from './sim.js';

// The day as YYYY-MM-DD, in UTC.
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// A seed from the day: 32-bit FNV-1a over the key.
export function dailySeed(key) {
  let h = 0x811c9dc5;
  for (const ch of `afterglass/daily/${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h || 1;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The day in words: '27 September 2026'.
export function dayText(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Today's keep (or any day's): the day's seed, the default rules, and the day it belongs to.
export function newDaily(key = dayKey()) {
  const s = newSeason(dailySeed(key));
  s.daily = key;
  return s;
}
