// The Book of the Dead: each of the dead as a short story, told from what the ledger kept about them.
// Pure, so the stories can be tested in Node.

import { KINDS, TWINS, DAY_ROOMS, TRAITS, SHADE_TRAITS } from './data.js';

// What each job made someone: a priest, a smith, a mason.
const ROLE = Object.fromEntries(Object.entries(DAY_ROOMS).filter(([, R]) => R.role).map(([k, R]) => [k, R.role]));
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export const ordinal = (n) => ORD[n] || `${n}th`;
const capital = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const article = (w) => (/^[aeiou]/i.test(w) ? 'An' : 'A');
function whenText(season, day, sameSeason) {
  return sameSeason === season ? `on day ${day}` : `on day ${day} of the ${ordinal(season)} season`;
}
export function epitaph(e, { traits = false } = {}) {
  const out = [];
  if (e.from === 'raider') out.push('One of the Ashen Host, who came over the wall and never left.');
  else {
    const desc = [e.age === 'young' || e.age === 'old' ? e.age : '', ROLE[e.job] || ''].filter(Boolean).join(' ');
    let who = e.from === 'before' ? `Of the last keeper's household${ROLE[e.job] ? `, ${article(ROLE[e.job]).toLowerCase()} ${ROLE[e.job]}` : ''}` : desc ? `${article(desc)} ${desc} of the keep` : 'One of the keep';
    if (e.bond) who += `, ${e.bond.rel} of ${e.bond.name}`;
    if (e.from === 'living' && e.joined && (e.joined.season > 1 || e.joined.day > 1)) who += `, who came to the gate ${whenText(e.joined.season, e.joined.day)}`;
    out.push(`${who}.`);
  }
  out.push(e.from === 'before' ? `${capital(e.how)} before you came.` : `${capital(e.how)} ${whenText(e.season, e.day)}.`);
  const woke = { funeral: 'Was given a funeral and laid to rest.', overflow: 'Woke Restless, for no mirror had room.', restless: 'Woke Restless at the edge of the Deep.', wraith: 'Woke as a Wraith.', taken: 'There was no body to wake.' }[e.woke];
  if (woke) out.push(woke);
  else if (e.woke && e.from !== 'before') out.push(`Woke ${KINDS[e.woke]?.name || e.woke} in the glass.`);
  else if (!e.woke) out.push('Lies in the crypt, waiting for dusk.');
  // Traits: what they were in life, and, if they woke in the glass, what death made of it.
  const T = traits && TRAITS[e.was];
  if (T) out.push(e.woke && KINDS[e.woke] && e.woke !== 'wraith' ? `${T.name} in life, ${SHADE_TRAITS[T.dead].name} in death.` : `${T.name} in life.`);
  if (e.bound) out.push(`Was bound into a mirror as ${KINDS[e.bound.kind]?.name || 'a shade'} ${whenText(e.bound.season, e.bound.day, e.season)}.`);
  if (e.turned) out.push(`Turned Wraith on day ${e.turned}.`);
  if (e.nights > 0) {
    const fav = Object.entries(e.posts || {}).sort((a, b) => b[1] - a[1])[0];
    let served = `Served ${e.nights} ${e.nights === 1 ? 'night' : 'nights'}`;
    if (fav) served += `, most often in the ${TWINS[fav[0]].name}`;
    if (e.kills) served += `, and cut down ${e.kills} of the Unlit`;
    out.push(`${served}.`);
  }
  if (e.whispered || e.stepped) {
    const d = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
    const trade = e.job && DAY_ROOMS[e.job] ? ` to the ${DAY_ROOMS[e.job].name}` : '';
    out.push(e.whispered && e.stepped ? `By day, whispered${trade} ${d(e.whispered)}, and stepped through the great glass to work ${d(e.stepped)}.` : e.whispered ? `By day, whispered${trade} ${d(e.whispered)}.` : `By day, stepped through the great glass to work ${d(e.stepped)}.`);
  }
  if (e.named) out.push('Written in the ledger by name.');
  const at = e.endDay ? ` ${whenText(e.endSeason || e.season, e.endDay, e.season)}` : '';
  const end = {
    covered: `Released when their mirror was covered${at}.`,
    freed: `Freed when their mirror was broken${at}.`,
    sealed: `Went free when the Veil was sealed${at}.`,
    released: `Released from the edge of the Deep${at}.`,
    faded: `Faded to nothing in the glass${at}.`,
    drained: `Drained to nothing by the Unlit${at}.`,
    drowned: `Dragged down into the moat's twin by the Drowned${at}.`,
    deep: `Went down into the Deep for quicksilver${at}, and never came back up.`,
    banished: `Banished into the Deep${at}.`,
    taken: e.cause === 'hollow' ? '' : `Carried off with their mirror by the Lantern Church${at}.`,
    funeral: '',
  }[e.end];
  if (end) out.push(end);
  else if (!e.end && e.woke && e.woke !== 'funeral' && e.woke !== 'taken') {
    out.push(e.woke === 'wraith' || e.turned ? 'Still hunts in the Tain.' : (e.woke === 'overflow' || e.woke === 'restless') && !e.bound ? 'Still waits at the edge of the Deep.' : 'Still in the glass.');
  }
  return out.join(' ');
}
export const RESTING = ['funeral', 'covered', 'released', 'freed', 'sealed'];
export const LOST = ['faded', 'drained', 'drowned', 'deep', 'banished', 'taken'];
