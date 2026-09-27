// Today's keep: everyone who plays on the same date gets the same keep, from a seed made of the date, on the
// rules as they ship. The date is the player's own, so the keep turns over at their midnight, and players in
// different time zones reach each day's keep at different hours. Pure.

import { newSeason } from './sim.js';

// The day as YYYY-MM-DD, by the player's own clock and calendar.
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
