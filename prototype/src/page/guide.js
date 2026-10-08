// The guide and the tutorial keep.

import { TWINS, MIRRORS, MAP, SHADE_TRAITS, TUTORIAL, VISITORS, TROUBLES } from '../slice/data.js';
import { typeOf, roomsOf, lightMap, isLit, DEEP_FLOOR, lineSpots as lineOf } from '../slice/geo.js';
import { jobCount, ritePreview, crossingPreview, canWork, defense, priests, dayTicks, isNewMoon, byId, fmt, isDoor, mawLure, doorsOpen, postRoom, wardCost, beds, coaches, besieged, plagueSeason, forecastOf, drownedDue, embargoed, inquisition, crusadeDaysLeft, canAct, decreeOf, gatehouseOf, undergateOpen, laddersDue, eclipseDue, eclipseSpan, brought, livingCap, repairing, troubleOf } from '../slice/sim.js';
import { isTutorial } from '../slice/tutorial.js';
import { prefs, savePrefs, saveGame, s, K, ui, bump, running, nightView, eclipseNow } from './state.js';
import { esc, traitsOn, floor1, hhmm } from './hud.js';
import { mult } from './dusk.js';
import { trail } from './playtest.js';
import { gameEl } from './stage.js';
import { openSheet } from './screen.js';

/* ---------------------------------------------------------------- the guide */

// One card at a time, the first time each thing happens in the first season. A card can point at a
// button (a pulsing outline) or at spots on the Tain (pulsing rings), and some pause the clock to be read.
const seen = (id) => !!prefs.guideSeen?.[id];
const first = () => s.season === 1;
export const lineSpots = () => lineOf(K());
export const litAt = (f, x) => !!s.night && isLit(lightMap(K(), s.tuning, s.night.candles), f, x);
const GUIDE = [
  {
    id: 'welcome', target: '#btn-play',
    when: () => first() && s.phase === 'day' && s.day === 1,
    done: () => running() && !ui.paused,
    text: () => `This is your keep on the Veil${K().n === 1 ? ': a Hearth and a Crypt, for now' : ''}. Press Play to start the day; pause whenever you like.`,
  },
  {
    id: 'jobs', target: '#open-people',
    when: () => first() && s.phase === 'day' && s.day === 1 && s.t > dayTicks(s) * 0.15,
    done: () => ui.sheet === 'people',
    text: "People holds everyone's jobs. A job needs its room; anyone without one quarries stone in the Yard to build with.",
  },
  {
    id: 'raid', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.raid?.warned && s.raid.state === 'coming',
    done: () => ui.sheet === 'phase',
    text: () => `Raiders on the road. Your defense (2 for each guard) should match their strength: the Day panel has the numbers${s.tuning.raidFight ? ', and can ward the gate, bar the stores or pay them off; at the gate you fight with pitch, stone and the bell' : ''}.${s.tuning.muster ? ` A guard takes ${fmt(s.tuning.musterHours)} hours at the post to count in full: post them now.` : ''}`,
  },
  {
    id: 'fire', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.fires?.length > 0,
    done: () => ui.sheet === 'phase',
    text: "Fire! A Hearth or Forge fire outgrows its own room's hands: send the Yard's masons from the Day panel, or it kills and spreads.",
  },
  {
    id: 'visitor', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && s.visitors?.some((v) => v.here && !v.done),
    done: () => ui.sheet === 'phase',
    text: 'Someone is at the gate: the Day panel shows what each answer costs and gives, and how long they will wait before taking the last.',
  },
  // Round seven, phase 12: the keep's second year, when it starts to wear, and its first trouble.
  {
    id: 'repairs', target: '#open-phase',
    when: () => s.phase === 'day' && repairing(s) && !!(s.haunted?.length || s.scorched?.length),
    done: () => ui.sheet === 'phase',
    text: () => `From its second year the keep wears: a room a Maw broke stays haunted ${s.tuning.hauntDays} dawns, a Dread at each, unless masons mend it. Repairs, in the Day panel: ${fmt(s.tuning.mendStone)} stone.`,
  },
  {
    // Round seven, phase 13: a Maw tonight, and a mirror hanging open in a room it comes for.
    id: 'doors', target: '#open-phase',
    when: () => s.phase === 'dusk' && doorsOpen(s) && !!s.night?.spawns?.some((x) => x.type === 'maw') && s.mirrors.some((m) => isDoor(s, m) && mawLure(typeOf(K(), m.room)) >= 2),
    done: () => ui.sheet === 'phase',
    text: () => {
      const m = s.mirrors.find((x) => isDoor(s, x) && mawLure(typeOf(K(), x.room)) >= 2);
      return `A Maw rises tonight, and the ${m.name} hangs open where people work, the kind of room Maws come for. If one breaks its twin, it comes through the mirror and the Veil cracks. Turn it to the wall in the Dusk panel (its shades sit the night out), or hang it where nobody works, by day.`;
    },
  },
  {
    // Round seven, phase 14: a hard answer inside the keep, the first time one waits.
    id: 'cruel', target: '#open-phase',
    when: () => s.phase === 'day' && !!s.visitors?.some((v) => v.here && !v.done && VISITORS[v.kind].inside && byId(s.living, v.named)),
    done: () => ui.sheet === 'phase',
    text: () => {
      const v = s.visitors.find((x) => x.here && !x.done && VISITORS[x.kind].inside);
      return `${VISITORS[v.kind].name} waits in the keep. One answer kills ${byId(s.living, v.named).name} on your order: they wake at dusk a Wraith, which hunts the Tain every night until banished at the rite (${s.tuning.banishCost} essence) and costs ${s.tuning.dreadPerWraith} Dread every dawn. The Day panel has the answers.`;
    },
  },
  {
    id: 'trouble', target: '#open-phase',
    when: () => s.phase === 'day' && !!troubleOf(s),
    done: () => ui.sheet === 'phase',
    text: () => `Each year from the second brings a trouble: this one, ${TROUBLES[troubleOf(s)].name.charAt(0).toLowerCase()}${TROUBLES[troubleOf(s)].name.slice(1)}. The Day panel says what it does${s.tuning.troubleRite ? ', and a rite in the Chapel halves it for a season' : ''}.`,
  },
  {
    id: 'library', target: '#open-phase',
    when: () => s.phase === 'day' && !!s.tuning.library && roomsOf(K(), 'library').length > 0 && !s.study && !s.learned.length,
    done: () => ui.sheet === 'phase',
    text: 'The Library studies one thing at a time, begun in the Day panel: scholars by day, and a shade in its twin by night, finish it.',
  },
  {
    id: 'hall', target: '#open-phase',
    when: () => s.phase === 'day' && !!s.tuning.hall && roomsOf(K(), 'hall').length > 0 && !decreeOf(s),
    done: () => ui.sheet === 'phase',
    text: 'The Hall proclaims one decree a season, in the Day panel. By night a shade seated in its twin, the Court of Shades, hears one of the dead’s requests for free.',
  },
  {
    id: 'ladders', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && laddersDue(s) && s.raid?.warned && s.raid.state === 'coming',
    done: () => ui.sheet === 'phase',
    text: () => `From this season the Host brings ladders, each one standing adding to its strength${gatehouseOf(s) ? ': a gate guard on the Gatehouse’s walls throws them down.' : ', and only a Gatehouse’s guards throw them down.'}`,
  },
  {
    id: 'midsummer', target: '#open-phase',
    when: () => s.phase === 'day' && eclipseDue(s) && !s.eclipse && !s.today.eclipse,
    done: () => ui.sheet === 'phase',
    text: () => `Midsummer: at ${hhmm(6 + (12 * eclipseSpan(s)[0]) / dayTicks(s))} the sun goes dark for ${fmt(s.tuning.eclipseSecs)} seconds and the Tain wakes while the day goes on. The Day panel says what it brings.`,
  },
  {
    id: 'eclipse', target: '#tool-candle', pause: true,
    when: () => eclipseNow(),
    done: () => !eclipseNow() || !!s.night?.candles.length,
    text: 'The eclipse: the Tain is awake below the Veil while the day goes on above. Set candles and move shades there, as at night. Whoever dies in the dark wakes at once.',
  },
  {
    id: 'undergate', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && undergateOpen(s) && s.night?.spawns.some((sp) => sp.rift === 'undergate'),
    done: () => ui.sheet === 'phase',
    text: 'From this season some Creepers come up the Undergate, your Gatehouse’s twin, instead of at the rifts. Light it and post a fighter, or ward it.',
  },
  {
    id: 'rain-coming', target: '#open-phase',
    when: () => !!s.tuning.weather && s.phase === 'day' && forecastOf(s) === 'rain' && drownedDue(s, true),
    done: () => ui.sheet === 'phase',
    text: "Rain tomorrow, says the Sky: the Yard slows, fire damps, and tomorrow night the Drowned come up behind your line for the mirrors. Keep essence to ward the moat, or a fighter and a candle by the mirror on their side.",
  },
  {
    id: 'drowned', target: '#tool-ward',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && nightView() && !!s.night?.spawns.some((sp) => sp.type === 'drowned') && !s.night.wards.includes('moat'),
    marks: () => {
      const end = MAP.moat.find((w) => w.id === s.night?.spawns.find((sp) => sp.type === 'drowned')?.rift) || MAP.moat[0];
      const m = MAP.mirrors.reduce((a, b) => (Math.abs(b.x - end.x) < Math.abs(a.x - end.x) ? b : a));
      return [{ f: K().veil, x: end.x }, { f: K().veil, x: m.x }];
    },
    done: () => !!s.night?.wards.includes('moat') || s.phase === 'night',
    text: () => `Rain: tonight the Drowned come up out of the moat's twin at the marked end, behind the line. Ward the moat (${fmt(wardCost(s))} essence: Ward, then tap that end), or light the mirror beside it and post a fighter.`,
  },
  {
    id: 'deep', target: '#open-phase',
    when: () => first() && !!s.tuning.deep && brought(s, 'deep') && s.phase === 'dusk' && s.dusk?.step === 'place' && s.day >= 3 && s.day < s.tuning.seasonDays && s.shades.filter(canWork).length >= 4,
    done: () => ui.sheet === 'phase',
    text: 'A shade you can spare can go down into the Deep tonight instead of taking a post (the Dusk panel), for quicksilver to upgrade a mirror, unless something down there catches it.',
  },
  {
    id: 'crypt', target: '#bar-wake',
    when: () => first() && s.phase === 'dusk' && s.dusk.step === 'crypt' && !ui.cross,
    text: 'Dusk. Whoever died today wakes as a shade, its kind set by how it died, unless a priest gives it a funeral, for remembrance.',
  },
  {
    id: 'tain',
    when: () => first() && s.phase === 'dusk' && s.dusk.step === 'place' && nightView(),
    marks: () => [...MAP.rifts.map((r) => ({ f: DEEP_FLOOR, x: r.x })), ...MAP.mirrors.map((m) => ({ f: K().veil, x: m.x }))],
    text: () => `This is the Tain, the keep's reflection. The Unlit climb from the red rifts up to the mirrors under the Veil, and can't cross candlelight.${prefs.ways !== false ? ' The red chevrons are their ways tonight: set a candle and watch them change.' : ''}`,
  },
  {
    id: 'line', target: '#tool-candle',
    when: () => first() && seen('tain') && s.phase === 'dusk' && s.dusk.step === 'place' && nightView(),
    marks: () => lineSpots().filter((p) => !litAt(p.f, p.x)),
    done: () => lineSpots().every((p) => litAt(p.f, p.x)),
    text: () => `${K().n === 1 ? 'Light the two marked spots between each rift and its mirror' : 'Light the feet of the two stairs up to the Veil'} (Candle, then tap), a shade at each: Creepers stopped there gnaw at the light's edge, and the shade cuts them down.${K().n > 1 && s.tuning.lineGuard ? ' A shade there guards the line, and does no other work but the Watch.' : ''}`,
  },
  {
    id: 'begin', target: '#bar-start',
    when: () => first() && seen('line') && s.phase === 'dusk' && s.dusk.step === 'place',
    done: () => s.phase === 'night',
    text: 'A shade works its room’s night job only in candlelight, and candles you keep carry over. Begin the night when you are ready.',
  },
  {
    id: 'night', target: '#btn-hush', pause: true,
    when: () => first() && s.phase === 'night' && s.t > 30,
    text: 'Watch the edges of the light: if a shade is caught in the dark, drop a candle on it. Hush makes the Unlit pass the shades by, but stops all work.',
  },
  {
    id: 'rite', target: '#bar-day',
    when: () => first() && s.phase === 'dawn',
    text: "Dawn: the Rite. Keep a shade to work again tonight, for Dread, or cover its mirror to let it rest. Shades fade each night; naming one halves that.",
  },
  {
    id: 'request', target: '.rite-list .is-asking',
    when: () => first() && s.phase === 'dawn' && Object.keys(s.rite?.asks || {}).length > 0,
    text: () => requestText(),
  },
  {
    id: 'traits', target: '.rite-list',
    when: () => first() && seen('rite') && s.phase === 'dawn' && traitsOn() && s.shades.some((d) => SHADE_TRAITS[d.trait]),
    text: () => `Death turns a trait over: the Brave wake Reckless, the Devout Bitter. Each shade's line says what it does now: a Bitter one costs ${s.tuning.dreadPerKeep * SHADE_TRAITS.bitter.dread} Dread to keep, but makes wards cheap.`,
  },
  {
    id: 'build', target: '#btn-build',
    when: () => first() && s.phase === 'day' && seen('jobs') && s.t > dayTicks(s) * 0.2,
    done: () => ui.sheet === 'build',
    text: () => `Build raises a room for ${s.tuning.roomStone} stone, on top of the keep or in a bare hall, ${s.tuning.roomCap} workers to a room. Raiders come on day 2: a Barracks first, and a Chandlery before the candles run out. The top floor by day is the Tain's deepest by night.`,
  },
  {
    id: 'whispers', target: '#open-people',
    when: () => first() && s.phase === 'day' && !!s.tuning.whispers && s.shades.some((d) => canWork(d) && jobCount(s, coaches(s, d)) > 0),
    done: () => s.shades.some((d) => d.byDay),
    text: () => s.tuning.mirrorRooms
      ? `The dead can help by day: in People, a shade can whisper through its mirror to whoever works the room it hangs in (×${mult(s.tuning.whisperMult)}, for ${fmt(s.tuning.whisperFade)} memory at dusk), or step out of a great glass to work that room in person.`
      : `The dead can help by day: in People, a shade can whisper its old trade to whoever works it (×${mult(s.tuning.whisperMult)}, for ${fmt(s.tuning.whisperFade)} memory at dusk), or step out of a great glass to work in person.`,
  },
  {
    id: 'church', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && s.inspection && !s.inspection.done,
    text: () => `The Lantern Church inspects at noon${s.tuning.churchLedger ? ', judging the Dread of the days since it last looked' : ''}: 0–1 is blessed; 4–5 costs your fullest mirror, shades and all. A vigil in the Day panel lowers Dread for ${s.tuning.vigilCost} remembrance.`,
  },
  {
    id: 'embargo', target: '#open-phase',
    when: () => first() && s.phase === 'day' && embargoed(s) && !inquisition(s),
    text: () => `The censure brought a silver embargo: for ${s.tuning.embargoDays} days no glass, and no mirror built. A blessing lifts it, or a donation of ${s.tuning.donation} remembrance. Censured again under it, the keep goes to the Inquisition.`,
  },
  {
    id: 'errands', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && !!s.night?.errands?.length,
    text: () => `Something has turned up in the dark tonight: the black mirror says what and where. A shade that reaches it takes it${s.tuning.lanterns ? ', and a lantern (T) carries its own light there' : ''}. A sleepwalker is saved by a shade that reaches them, or by light.`,
  },
  {
    id: 'omens', target: '#open-phase',
    when: () => s.phase === 'dusk' && s.dusk?.step === 'place' && !!(s.night?.omen || s.night?.omens),
    text: () => `Tonight has an omen: the Dusk panel says what it changes.${s.night?.omens ? ' There are two tonight: choose the one you would rather face.' : ''} The tide clock under the top bar marks what's coming; Skip (N) runs to just before the next mark.`,
  },
  {
    id: 'acts', target: '#tool-move', pause: true,
    when: () => first() && s.phase === 'night' && s.day >= 2 && !!s.tuning.acts && s.shades.some((d) => canAct(s, d)),
    text: 'Each shade has one act a night, paid in memory: a Loyal one Stands, its light ungnawed; a Serene one Kindles its candle; a Pale one Passes unseen; a Stranger Lures the Unlit. Pick a shade: its act is on the bar (A).',
  },
  {
    id: 'crusade', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && crusadeDaysLeft(s) > 0,
    text: () => `A crusade comes to the gate ${crusadeDaysLeft(s) === 1 ? 'tomorrow' : `in ${crusadeDaysLeft(s)} days`}, and if it breaks in it smashes every mirror it finds. A blessing before then calls it off, so bring Dread down; the Day panel can hide mirrors, shades and all, until it's over.`,
  },
  {
    id: 'maw', target: '#tool-move', pause: true,
    when: () => first() && s.phase === 'night' && s.night.foes.some((f) => f.type === 'maw'),
    text: 'A Maw goes for whatever is worth most for the least fight, the candle holding the stairs or a room where people work, so a thick line only sends it elsewhere. Watch where it heads and send a fighter there with a candle: a room it stands in 12 seconds breaks.',
  },
  // Round seven, phase 4: the troubles of the first year that came without a word, each the first time.
  {
    id: 'larder', target: '#open-people', pause: true,
    when: () => s.phase === 'day' && s.hungry,
    text: 'The larder is empty: everyone works hungry, and the weakest will starve. Put more cooks in the Hearth, in People.',
  },
  {
    id: 'siege', target: '#open-phase', pause: true,
    when: () => s.phase === 'day' && besieged(s),
    text: 'The Ashen Host has made camp outside: the gate stays shut, so no quarrying and no one new. Sally out with your guards to break the camp, or wait it out.',
  },
  {
    id: 'plague', target: '#btn-build',
    when: () => s.phase === 'day' && plagueSeason(s) && s.living.length > beds(s),
    text: () => `Summer is plague season: in a crowded keep sickness takes one more for every ${s.tuning.plagueCrowd} living beyond the beds. Quarters and healers answer it.`,
  },
  {
    id: 'sick', target: '#open-people',
    when: () => s.phase === 'day' && s.living.some((p) => p.sick > 0),
    text: () => `${s.living.find((p) => p.sick > 0).name} is sick. Untreated, sickness kills in about ${fmt(s.tuning.sickDays)} days; a healer in an Infirmary cures one a day.`,
  },
  {
    id: 'grief', target: '#open-people',
    when: () => s.phase === 'day' && s.living.some((p) => p.grief),
    text: () => `${s.living.find((p) => p.grief).name} grieves, and works at ${Math.round(100 * s.tuning.griefMult)}% until their dead finds rest: a funeral, or its mirror covered at the rite.`,
  },
  {
    id: 'crowd', target: '#btn-build',
    when: () => s.phase === 'day' && s.tuning.dreamwell && s.living.length > beds(s),
    text: () => `${s.living.length} living and beds for ${beds(s)}: the crowded fall sick ${fmt(s.tuning.crowdSick)} times as often. Quarters add ${s.tuning.quartersBeds} beds.`,
  },
  {
    id: 'cap', target: '#open-people',
    when: () => s.phase === 'day' && s.living.length >= livingCap(s),
    text: () => `The keep shelters ${livingCap(s)} at most${s.tuning.bedsHold ? `, as many as it has beds for: Quarters make room for ${s.tuning.quartersBeds} more` : ''}. While it's full, no one new comes to the gate, and no child is born.`,
  },
  {
    id: 'tides', target: '.tclock',
    when: () => s.phase === 'night' && s.t > 40 && seen('night') && !!s.night?.marks,
    text: 'The strip under the top bar is the night’s clock: each red mark a tide, orange a Maw. Skip runs fast to just before the next mark.',
  },
  {
    id: 'moon', target: '#open-phase', pause: true,
    when: () => first() && s.phase === 'day' && isNewMoon(s),
    get text() {
      return `Tonight is the new moon: the Hollow walks to the mirrors whatever the light. A ward on a stair holds it ${s.tuning.wardDraw ? 'while the essence lasts' : 'a while'}${s.tuning.hollowWardOnly ? ', but only it: the tides climb past' : ''}; fighters drive it back${s.tuning.hollowPinned ? ', best while a ward holds it' : ''}. If it reaches the Veil, it takes one of the living.`;
    },
  },
];

/* ---------------------------------------------------------------- the tutorial keep */

// The tutorial keep's lessons. Its first three days go by a script in the sim (TUTORIAL in data.js); these
// teach them, one at a time. A lesson with done() waits until you've done it, or skipped it; one without
// waits for Got it. The list's order is its priority: what's happening now (a death, a fire, the Host at the
// gate) comes before the day's next task. Progress is kept in the keep (s.tut), so a new tutorial keep
// teaches again. The guide holds its own cards back until the tutorial is over, and a lesson counts the
// guide's cards it covers as read.
const tutOn = () => isTutorial(s) && s.season === 1 && !s.tut?.off && !s.tut?.over;
const tutHas = (id) => !!s.tut?.done?.[id];
const onDay = (d, phase = 'day') => s.day === d && s.phase === phase;
const built = (type) => roomsOf(K(), type).length > 0;
const maud = () => s.shades.find((d) => d.name === TUTORIAL.servant.name && canWork(d)) || null;
const newcomer = () => s.today.arrivals.map((id) => byId(s.living, id)).find(Boolean) || null;
// A spot on the line is held when a shade stands in its light.
const guarded = (p) => litAt(p.f, p.x) && s.shades.some((d) => canWork(d) && d.post?.f === p.f && Math.abs(d.post.x - p.x) <= 8 && litAt(d.post.f, d.post.x));
// Keeps saved before alerts had kinds (round seven, phase 6) have only the words in their log.
const churchWord = () => s.log.some((l) => l.season === 1 && l.day === 3 && (l.kind === 'church-word' || (!l.kind && /^Word comes from the Lantern Church/.test(l.text))));
// The guide's words for the dead's requests, which the tutorial uses too.
const requestText = () => `The dead ask for things at the rite: a Loyal shade to stand the gate, a Stranger a name, a Pale one to be remembered, a Serene one, fading, to be let go. Refused ${s.tuning.refusals === 2 ? 'twice' : `${s.tuning.refusals} times`}, it turns Restless.`;
const TUT = [
  // What's happening now.
  {
    id: 't-maud', pause: true,
    when: () => onDay(1) && s.today.deaths.some((id) => s.ledger.find((e) => e.id === id)?.name === TUTORIAL.servant.name),
    text: () => `${TUTORIAL.servant.name}, the old servant, has died. At dusk she wakes as a shade: old age makes the Serene, who work best.`,
  },
  {
    id: 't-fire', covers: ['fire'], target: '#e-yard', pause: true,
    when: () => onDay(2) && s.fires.length > 0,
    done: () => !s.fires.length,
    text: "Fire in the Hearth! Two cooks can't beat it: send the Yard's masons, from the red strip under the top bar.",
  },
  {
    id: 't-assault', target: '#e-pitch', pause: true,
    when: () => onDay(2) && s.raid?.state === 'assault',
    done: () => s.raid?.state !== 'assault',
    text: () => `The Host is at the gate: while they outmatch you, the gate gives. Pitch (${s.tuning.raidPitchCost} candles) weakens them; the bell brings everyone to the walls.`,
  },
  {
    id: 't-raid', covers: ['raid'], target: '#open-phase', pause: true,
    when: () => onDay(2) && s.raid?.warned && s.raid.state === 'coming',
    text: () => `Raiders on the road: strength ${fmt(s.raid.strength)} against your defense of ${fmt(defense(s))}, at the gate by noon. Before then: more guards, a ward, or bars or a tribute (Day panel).`,
  },
  {
    id: 't-church', target: '#open-phase', pause: true,
    when: () => onDay(3) && churchWord(),
    text: () => `The Lantern Church judges the keep on day ${s.tuning.firstInspection}: Dread 0–1 is blessed, 4–5 loses your fullest mirror. Dread is ${s.dread}; a vigil lowers it for ${s.tuning.vigilCost} remembrance.`,
  },
  {
    id: 't-crack', pause: true,
    when: () => s.phase === 'night' && s.day < TUTORIAL.safeUntil && s.night.stats.cracks > 0,
    text: () => `The Unlit reached a mirror: the Veil cracked, for 1 Dread at dawn. ${s.tuning.cracksMax} cracks lose the keep (none before night ${TUTORIAL.safeUntil} here). Light the way they came.`,
  },
  {
    id: 't-maw', covers: ['maw'], target: '#tool-move', pause: true,
    when: () => s.phase === 'night' && s.day < TUTORIAL.safeUntil && s.night.foes.some((f) => f.type === 'maw'),
    text: () => 'A Maw, weakened for the tutorial. It goes for what’s worth most for the least fight: watch where it heads, and send a fighter.',
  },
  // Day 1: jobs, the Yard, building.
  {
    id: 't-play', covers: ['welcome'], target: '#btn-play',
    when: () => onDay(1),
    done: () => running() && !ui.paused,
    text: 'The tutorial keep: three days and nights, one thing at a time. Press Play to start.',
  },
  {
    id: 't-people', covers: ['jobs'], target: '#open-people',
    when: () => onDay(1) && tutHas('t-play'),
    done: () => ui.sheet === 'people',
    text: 'Open People. A job needs its room; anyone without one quarries stone in the Yard.',
  },
  {
    id: 't-build', covers: ['build'], target: '#btn-build',
    when: () => onDay(1) && tutHas('t-people'),
    done: () => built('barracks'),
    text: () => `Raiders come tomorrow. Tap Build and raise a Barracks: ${s.tuning.roomStone} stone, and you have ${floor1(s.res.stone)}.`,
  },
  {
    id: 't-guards', target: '#open-people',
    when: () => (onDay(1) || onDay(2)) && built('barracks') && tutHas('t-build'),
    done: () => jobCount(s, 'barracks') >= 2,
    text: 'Put two people in the Barracks, in People. Each guard is 2 defense, and Ada is Brave, ×1.5 at the gate.',
  },
  {
    id: 't-chandlery', target: '#btn-build',
    when: () => (onDay(1) || onDay(2)) && tutHas('t-guards'),
    done: () => built('chandlery') && jobCount(s, 'chandlery') >= 1,
    text: () => 'Next, a Chandlery with someone in it: candles are what the night runs on. Osk is Greedy, ×1.25 there.',
  },
  // Dusk 1: the Crossing, the Tain, candles, posts, the black mirror.
  {
    id: 't-crypt', covers: ['crypt'], target: '#bar-wake',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'crypt' && !ui.cross,
    done: () => s.dusk?.step !== 'crypt',
    text: () => `Dusk. ${TUTORIAL.servant.name} lies in the crypt${priests(s) ? '; a priest could give her a funeral' : ''}. Let her wake, as a shade in a mirror.`,
  },
  {
    id: 't-tain', covers: ['tain'],
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && nightView(),
    marks: () => [...MAP.rifts.map((r) => ({ f: DEEP_FLOOR, x: r.x })), ...MAP.mirrors.map((m) => ({ f: K().veil, x: m.x }))],
    text: 'This is the Tain, the keep’s reflection. The Unlit climb from the red rifts to the mirrors, and can’t cross candlelight.',
  },
  {
    id: 't-line', covers: ['line'], target: '#tool-candle',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-tain'),
    marks: () => lineSpots().filter((p) => !litAt(p.f, p.x)),
    done: () => lineSpots().every((p) => litAt(p.f, p.x)),
    text: () => `${K().n === 1 ? 'Light the two marks between the rifts and the mirrors' : 'Light the two marked stair feet'} (Candle, then tap): the line the Unlit must get past.`,
  },
  {
    id: 't-guard', target: '#tool-move',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-line'),
    marks: () => lineSpots().filter((p) => !guarded(p)),
    done: () => lineSpots().every(guarded),
    text: 'Now a shade in each light: with Move, tap a figure with glowing eyes, then the light. It cuts down what gnaws at the edge.',
  },
  {
    id: 't-post', target: '#tool-candle',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-guard') && !!maud(),
    done: () => {
      const d = maud();
      return !!d && !!TWINS[postRoom(s, d)]?.job && litAt(d.post.f, d.post.x);
    },
    text: () => `Now ${TUTORIAL.servant.name}: a shade works its room’s night job only in light. Set a candle in a room, then Move her into it.`,
  },
  {
    id: 't-mirror', target: '#open-phase',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && (tutHas('t-post') || !maud()) && tutHas('t-guard'),
    done: () => ui.sheet === 'phase',
    text: 'Open the Dusk panel. Its black mirror says what comes tonight, and where each tide gets past your candles.',
  },
  {
    id: 't-begin', covers: ['begin'], target: '#bar-start',
    when: () => onDay(1, 'dusk') && s.dusk.step === 'place' && tutHas('t-mirror'),
    text: 'Begin the night when you’re ready.',
  },
  {
    id: 't-night', covers: ['night', 'tides'], target: '.tclock', pause: true,
    when: () => onDay(1, 'night') && s.t > 30,
    text: 'One small tide tonight. If a shade is caught in the dark, drop a candle on it. The strip under the top bar is the night’s clock: red marks are tides.',
  },
  // Dawn 1: the rite.
  {
    id: 't-rite', covers: ['rite'],
    when: () => onDay(1, 'dawn'),
    text: () => {
      const P = ritePreview(s);
      return `Dawn: the rite. Each shade you keep works tonight for ${s.tuning.dreadPerKeep} Dread; cover its mirror and it rests. Dread goes ${P.dread.from} → ${P.dread.to}.`;
    },
  },
  {
    id: 't-traits', covers: ['traits'], target: '.rite-list',
    when: () => onDay(1, 'dawn') && tutHas('t-rite') && traitsOn() && s.shades.some((d) => SHADE_TRAITS[d.trait]),
    text: () => `Death turns a trait over: Garrick, Brave in life, is Reckless. Shades fade each night; naming one (${s.tuning.nameCost} remembrance) halves it.`,
  },
  {
    id: 't-day2', target: '#bar-day',
    when: () => onDay(1, 'dawn') && (tutHas('t-traits') || !traitsOn()) && tutHas('t-rite'),
    text: 'Begin day 2 when you’re ready.',
  },
  // Day 2: a newcomer, a fire, the raid.
  {
    id: 't-newcomer', target: '#open-people',
    when: () => onDay(2) && !!newcomer(),
    done: () => !!newcomer()?.job,
    text: () => `${newcomer().name} has come to the gate to stay. Give ${newcomer().name} a job in People.`,
  },
  {
    id: 't-after',
    when: () => onDay(2) && ['held', 'breached', 'paid'].includes(s.raid?.state),
    text: () => (s.raid.state === 'paid'
      ? 'They took the tribute; the next raid comes harder.'
      : `${s.raid.state === 'held' ? 'The gate held.' : 'The gate gave way: send guards after the loot, from the Day panel.'} A raider who fell inside wakes tonight as a Stranger.`),
  },
  // Dusk and dawn 2: full mirrors and the Restless.
  {
    id: 't-full', target: '#bar-wake',
    when: () => onDay(2, 'dusk') && s.dusk.step === 'crypt' && !ui.cross && s.bodies.length > 0,
    done: () => s.dusk?.step !== 'crypt',
    text: () => {
      const over = crossingPreview(s).some((x) => x.to === 'overflow');
      return `${over ? 'Every mirror is full, so the raider wakes Restless: Dread each dawn, a Wraith in three nights.' : 'There is room in the mirrors.'}${priests(s) ? ' Or give it a funeral.' : ''} Let them wake.`;
    },
  },
  ...[2, 3].map((d) => ({
    id: `t-relight${d}`, target: '#tool-candle',
    when: () => onDay(d, 'dusk') && s.dusk.step === 'place',
    marks: () => lineSpots().filter((p) => !guarded(p)),
    done: () => lineSpots().every(guarded),
    text: 'Last night’s candles are gone: set the line again with Candle. The shades stay where you posted them.',
  })),
  {
    id: 't-hunters',
    when: () => onDay(2, 'dusk') && s.dusk.step === 'place' && tutHas('t-relight2'),
    text: () => 'Tonight some Creepers hunt candles: relight what goes out. Essence from the Choir buys wards, each sealing a rift or holding a stair.',
  },
  {
    id: 't-ask', covers: ['request'], target: '.rite-list .is-asking',
    when: () => (onDay(2, 'dawn') || onDay(3, 'dawn')) && Object.keys(s.rite?.asks || {}).length > 0,
    text: () => requestText(),
  },
  {
    id: 't-release', target: '.rite-list',
    when: () => onDay(2, 'dawn') && s.shades.some((d) => d.kind === 'restless'),
    text: () => `Release the Restless shade, for 1 remembrance, or bind it into a free mirror for ${s.tuning.bindCost} essence; left alone it costs Dread every dawn.`,
  },
  // Day 3: glass and mirrors, the Chapel.
  {
    id: 't-glazier', target: '#btn-build',
    when: () => onDay(3),
    done: () => built('glazier') && jobCount(s, 'glazier') >= 1,
    text: () => `Mirrors hold the dead; a hand mirror takes ${MIRRORS.hand.glass} glass (Day panel). Build a Glazier and staff it: Sabe is Diligent, ×1.15 at anything.`,
  },
  {
    id: 't-chapel', target: '#btn-build',
    when: () => onDay(3) && tutHas('t-church'),
    done: () => built('chapel') && priests(s) >= 1,
    text: 'Build a Chapel and put Tam in it (Devout, ×1.5 there). A priest bears 1 Dread, buries the dead, and makes remembrance.',
  },
  // The end.
  {
    id: 't-done',
    when: () => onDay(3, 'dawn') || s.day >= TUTORIAL.safeUntil,
    text: () => `That's the tutorial. The season goes on: raids on days 4 and 6, the Church on day ${s.tuning.firstInspection}, the Hollow at the new moon. How to play, in the Menu, has the rest.`,
  },
];
function tutStep() {
  return TUT.find((g) => !tutHas(g.id) && g.when()) || null;
}
function tutMark(id) {
  s.tut = { ...(s.tut || {}), done: { ...(s.tut?.done || {}), [id]: true } };
  const g = TUT.find((x) => x.id === id);
  if (g?.covers) prefs.guideSeen = { ...(prefs.guideSeen || {}), ...Object.fromEntries(g.covers.map((c) => [c, true])) };
  if (id === 't-done') s.tut.over = true;
  savePrefs();
  saveGame();
}
let coachId = null;
const coachEl = document.getElementById('coach');
export function guideStep() {
  if (ui.title || ui.sheet === 'test') return null; // one thing at a time: the main screen or the note, then the lesson
  if (tutOn()) return tutStep();
  if (!prefs.guide) return null;
  return GUIDE.find((g) => !seen(g.id) && g.when()) || null;
}
const isTut = (id) => id?.startsWith('t-');
export function markSeen(id) {
  if (isTut(id)) tutMark(id);
  else {
    prefs.guideSeen = { ...(prefs.guideSeen || {}), [id]: true };
    savePrefs();
  }
  bump();
}
export function showCoach(step, force = false) {
  if (ui.watch) {
    // A session's lessons are the tester's, marked on the timeline; the watcher's own are left as they were.
    coachId = null;
    coachEl.hidden = true;
    coachEl.innerHTML = '';
    coachRoom();
    return;
  }
  const id = step?.id || null;
  if (id === coachId && !force) return;
  if (id !== coachId) ui.tutEndAsk = false;
  // A card the player has moved past (the moment it was about is over) counts as read.
  const was = [...TUT, ...GUIDE].find((g) => g.id === coachId);
  if (was && !was.when()) {
    if (isTut(was.id)) {
      if (isTutorial(s) && !tutHas(was.id)) tutMark(was.id);
    } else if (!seen(was.id)) prefs.guideSeen = { ...(prefs.guideSeen || {}), [was.id]: true };
  }
  coachId = id;
  if (step) trail('lesson', { id, text: String(typeof step.text === 'function' ? step.text() : step.text).slice(0, 100) });
  if (id === 't-done' && s.test && !s.test.asked) {
    s.test.asked = true;
    saveGame();
    ui.testNote = false;
    ui.testPlayOn = !s.test.sent;
    openSheet('test', 'game');
  }
  bump();
  coachEl.hidden = !step;
  const tut = isTut(id);
  coachEl.classList.toggle('is-tutorial', tut);
  if (!step) {
    coachEl.innerHTML = '';
    coachRoom();
    return;
  }
  // Round seven, phase 4: ending the tutorial asks first, since it can't be taken back.
  const buttons = tut && ui.tutEndAsk
    ? '<span class="coach-ask">End the tutorial for good? The keep plays on.</span><button class="btn sm primary" id="coach-end-yes" data-act="tut-end-yes">End it</button><button class="btn sm" id="coach-end-no" data-act="tut-end-no">Keep going</button>'
    : tut
      ? `<button class="btn sm${step.done ? '' : ' primary'}" id="coach-ok" data-act="guide-ok" data-id="${step.id}">${step.done ? 'Move on' : 'Got it'}</button>${step.id === 't-done' ? '' : '<button class="btn sm" id="coach-off" data-act="tut-end">End the tutorial</button>'}`
      : `<button class="btn sm primary" id="coach-ok" data-act="guide-ok" data-id="${step.id}">Got it</button><button class="btn sm" id="coach-off" data-act="guide-off">Turn the guide off</button>`;
  const label = step.id === 't-done' ? 'The tutorial is over' : `Tutorial, day ${s.phase === 'dawn' ? s.day + 1 : s.day}`; // as the HUD counts
  coachEl.innerHTML = `${tut ? `<span class="eyebrow">${label}</span>` : ''}<p>${esc(typeof step.text === 'function' ? step.text() : step.text)}</p><div class="row">${buttons}</div>`;
  coachRoom();
  if (step?.pause && running() && !ui.paused && id !== ui.coachPaused) {
    ui.paused = true;
    ui.coachPaused = id;
    trail('pause', { by: 'lesson', id });
    bump();
  }
}
// How much room the card needs above a phone's panel (season.css keeps the panel below it).
function coachRoom() {
  const h = coachEl.hidden ? '0px' : `${coachEl.offsetHeight + 10}px`;
  if (gameEl.style.getPropertyValue('--coach-h') !== h) gameEl.style.setProperty('--coach-h', h);
}
window.addEventListener('resize', coachRoom);
export function tickGuide() {
  if (ui.watch) return null;
  let step = guideStep();
  if (step?.done?.()) {
    markSeen(step.id);
    step = guideStep();
  }
  showCoach(step);
  for (const el of document.querySelectorAll('.is-coached')) if (!step?.target || !el.matches(step.target)) el.classList.remove('is-coached');
  if (step?.target) document.querySelector(step.target)?.classList.add('is-coached');
  return step;
}
