// A season's recap card: what it says, from the season's record and the Book of the Dead. Pure, so it can be
// tested in Node; card.js draws it.

import { KINDS, SEASONS } from './data.js';
import { dayText } from './daily.js';

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A season in words: 'Spring, year 1' with the year on, else 'Season 2'.
export function seasonTitle(tuning, season) {
  if (!tuning.year) return `Season ${season}`;
  return `${cap(SEASONS[(season - 1) % SEASONS.length])}, year ${Math.floor((season - 1) / SEASONS.length) + 1}`;
}

// How the season ended.
function outcome(s, e) {
  const yearEnd = !!s.tuning.year && (e.season - 1) % SEASONS.length === SEASONS.length - 1;
  if (e.lost === 'veil') return { stood: false, head: 'The keep fell', sub: `The Veil broke on night ${e.day}.` };
  if (e.lost) return { stood: false, head: 'The keep fell', sub: `No one living was left, on day ${e.day}.` };
  if (e.sealed !== undefined) return { stood: true, head: 'The Veil is sealed', sub: e.sealed ? `After a whole year, ${plural(e.sealed, 'shade')} went free.` : 'After a whole year, the glass stood empty.' };
  return { stood: true, head: 'The keep stands', sub: yearEnd ? 'It came through the Long Night, and a whole year.' : 'It came through the new moon.' };
}

// The season's dead worth remembering: those who died in it, and the shades who served in it, by what they
// did. At most three, with a line each.
function remembered(s, season) {
  const scored = [];
  for (const e of s.ledger) {
    const died = e.season === season && e.from === 'living'; // raiders only if they served
    const ended = e.end && (e.endSeason || e.season) === season;
    const serving = !e.end && e.nights > 0;
    if (!died && !ended && !serving) continue;
    const score = 2 * (e.kills || 0) + (e.nights || 0) + (died ? 3 : 0) + (e.named ? 1 : 0);
    scored.push({ e, died, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, 3).map(({ e, died }) => {
    const parts = [];
    if (died) parts.push(`${cap(e.how)} on day ${e.day}`);
    const kind = KINDS[e.woke]?.name;
    if (kind && e.woke !== 'wraith') parts.push(kind);
    if (e.nights) parts.push(plural(e.nights, 'night'));
    if (e.kills) parts.push(`${e.kills} cut down`);
    if (e.end === 'faded') parts.push('faded');
    else if (e.end === 'drained') parts.push('drained');
    else if (e.end === 'drowned') parts.push('dragged under');
    else if (e.end === 'covered' || e.end === 'freed' || e.end === 'released') parts.push('at rest');
    return { name: e.name, line: parts.join(' · ') };
  });
}

// Everything the card says about one season (the last one played, by default), or null if it isn't over.
export function recapOf(s, season = s.seasons[s.seasons.length - 1]?.season) {
  const e = s.seasons.find((x) => x.season === season);
  if (!e) return null;
  const S = e.summary;
  const held = S.raids.filter((r) => r.held).length;
  const church = S.inspections.map((i) => i.verdict).join(', ');
  const hollow = S.hollow === 'rose' ? 'withdrew' : S.hollow;
  const o = outcome(s, e);
  const title = seasonTitle(s.tuning, season);
  const stats = [
    ['Days held', `${e.day} of ${s.tuning.seasonDays}`],
    ['Deaths', String(S.deaths)],
    ['Shades in the glass', String(S.shades)],
    ['Raids held', S.raids.length ? `${held} of ${S.raids.length}${S.raids.some((x) => x.paid) ? `, ${S.raids.filter((x) => x.paid).length} paid off` : ''}` : 'none'],
    ['The Church', church || 'no visit'],
    ['The Hollow', S.taken.length ? `took ${S.taken[0]}` : hollow || '—'],
  ];
  const daily = s.daily ? dayText(s.daily) : null;
  const text = `Afterglass${daily ? `, the keep of ${daily}` : ''} · ${title}: ${o.head.toLowerCase()}. ${plural(e.day, 'day')}, ${plural(S.deaths, 'death')}, ${plural(S.shades, 'shade')} in the glass.`;
  return { season, title, ...o, stats, remembered: remembered(s, season), seed: s.seed, daily, text };
}
