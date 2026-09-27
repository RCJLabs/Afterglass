// How to play: every lesson of the tutorial and the guide, as a short manual the Menu keeps. Its numbers come
// from the keep's own rules, so it stays true when they're changed in Settings. Pure.

import { DAY_ROOMS, TWINS, KINDS, MIRRORS, TRAITS, SHADE_TRAITS, OMENS } from './data.js';
import { actText, omenText } from './sim.js';

const n1 = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const times = (x) => (x === 2 ? 'twice' : `${n1(x)} times`);
// Days to the nearest quarter: 1.25 → '1¼'.
const days = (x) => {
  const q = Math.round(x * 4) / 4;
  const whole = Math.floor(q);
  return `${whole || ''}${['', '¼', '½', '¾'][Math.round((q - whole) * 4)]}` || '0';
};
const pct = (x) => `${Math.round(x * 100)}%`;
const mult = (x) => String(Math.round(x * 100) / 100);

// The weather (round five), in the keep's numbers.
function weather(T) {
  const odds = T.year
    ? `rain comes on about ${['spring', 'summer', 'autumn', 'winter'].map((k, i) => `${pct(T.rainChance[i])} of ${k} days`).join(', ').replace(/, ([^,]+)$/, ' and $1')}, and fog on ${['spring', 'summer', 'autumn', 'winter'].map((k, i) => `${pct(T.fogChance[i])}`).join(', ').replace(/, ([^,]+)$/, ' and $1')} of them`
    : `rain comes on about ${pct(T.rainChance[0])} of days and fog on ${pct(T.fogChance[0])}`;
  const half = (x) => (x === 0.5 ? 'half' : `${mult(x)} times`);
  return {
    id: 'weather',
    title: 'Weather',
    items: [
      `Each day and the night after it are clear, rainy or foggy, and the Sky in the HUD shows tomorrow's a day ahead: ${odds}.`,
      `Rain slows the Yard to ${pct(T.rainYard)} and damps fire: a fire is ${half(T.rainFire)} as likely, and grows ${half(T.rainFire)} as fast.`,
      `On a rainy night the Drowned come up out of the moat's twin, at one end of the floor under the Veil: behind the line. The Dusk panel says which end. They never take a stair: they make for the mirrors on that floor, and one that reaches a mirror cracks the Veil. ${T.drownedBase === 1 ? 'One comes' : `${T.drownedBase} come`}, and one more every ${T.drownedEvery} nights, but none on the new moon, which belongs to the Hollow${T.year ? ' (the Long Night has them too)' : ''}. Light bars them, and they gnaw it ${times(T.drownedGnaw)} as fast as a Creeper; a shade in the light cuts them down. A shade they catch in the dark is drained and dragged to the moat, and pulled under there: gone.`,
      `A ward on the moat (${n1(T.wardCost)} essence) keeps them under all night. Or light the mirror on their side and post a fighter by it.`,
      'Fog clouds the black mirror: at dusk it shows how many come and when, but not their ways.',
    ],
  };
}

// [{ id, title, items: [text] }], in the order a season meets them.
export function howTo(T) {
  const R = DAY_ROOMS;
  const rooms = [
    `cooks in the Hearth, ${R.hearth.rate} food a day each`,
    `chandlers in a Chandlery, ${R.chandlery.rate} candles each`,
    `glaziers in a Glazier, ${R.glazier.rate} glass each`,
    `priests in a Chapel, ${R.chapel.rate} remembrance each and a funeral a day`,
    `healers in an Infirmary, each curing ${R.infirmary.rate} of the sick a day`,
    `guards in a Barracks, ${R.barracks.rate} defense each`,
  ];
  const twins = [
    `the ${TWINS.chandlery.name} (the Chandlery) saves wax for the next dusk's candles`,
    `the ${TWINS.chapel.name} (the Chapel) makes essence, and its singing calms a Restless shade`,
    `the ${TWINS.barracks.name} (the Barracks) adds to tomorrow's defense`,
    `the ${TWINS.glazier.name} (the Glazier) makes glass`,
    `the ${TWINS.infirmary.name} (the Infirmary) makes tomorrow's sick wake one kind better`,
    `resting in the ${TWINS.hearth.name} halves a shade's fading`,
    `a shade who forges in the ${TWINS.forge.name} through half the night makes every shade fight ×${mult(T.steelFight)} the next`,
    `one who dreams in the ${TWINS.quarters.name} (the Quarters) rests the living: ×${mult(T.dreamWork)} the next day`,
  ];
  return [
    {
      id: 'keep',
      title: 'The keep',
      items: [
        `A season is ${T.seasonDays} days and nights, and it ends on the night of the new moon. By day the living work the keep; anyone who dies inside the walls wakes at dusk as a shade. By night the shades hold the Tain, the keep's reflection, against the Unlit. At dawn you decide which of the dead stay.`,
        'The castle is the screen. The bar at the bottom holds the tools for the moment and opens the panels: this phase, People, Records and the Menu. Pause whenever you like; the clock runs at 1×, 2× or 4×.',
        'A new keep can be Gentle, Standard or Hard, chosen at the start or in the Menu under Saves. Every number any of them sets is in Settings.',
      ],
    },
    {
      id: 'day',
      title: 'The day',
      items: [
        `Everyone has a job, and a job needs its room: ${rooms.join('; ')}. A room holds ${T.roomCap} workers; for more, build another of its kind.`,
        `Whoever has no room quarries stone in the Yard, ${R.yard.rate} a day each. Build raises a room for ${T.roomStone} stone, on top of the keep as a new floor or in any bare hall. By night the keep hangs upside down under the Veil: the top floor is the Tain's deepest, next to the rifts, and a room below the line is in the Unlit's way. The line's floor, the one above the ground floor, is worked by the shades holding the line as they hold it, so it's the place for a Chapel: they sing in its Choir. Each floor raised on top makes the Unlit climb farther. A room can be torn down for ${Math.floor(T.roomStone * T.teardownBack)} stone back, leaving a bare hall, or moved, swapping places with another room or hall, for ${T.moveStone}.`,
        `Everyone eats ${n1(T.eatPerDay)} food a day. With the larder empty they work at ${pct(T.hungryMult)}, and the weakest starve.`,
        `Someone new arrives at the gate every ${T.newcomerEvery === 2 ? 'second' : `${T.newcomerEvery}th`} day while there are fewer than ${T.maxLiving}. Give them a job.`,
        `Sickness comes on about ${pct(T.sickChance)} of days and kills in ${days(T.sickDays)} days unless a healer cures it first. The old can die in their sleep. Grief makes the living work at ${pct(T.griefMult)} until their dead are at rest; then they work at ${pct(T.peaceMult)} for ${T.peaceDays} days.`,
        `Everyone has a trait, shown under their name, and death turns it over: ${Object.values(TRAITS).map((t) => `${t.name} becomes ${SHADE_TRAITS[t.dead].name}`).join(', ')}.`,
      ],
    },
    {
      id: 'raids',
      title: 'Raids',
      items: [
        `The Ashen Host comes on days ${Object.keys(T.raidDays).join(', ').replace(/, (\d+)$/, ' and $1')}, stronger each time and ×${mult(T.hardness)} each season. You'll see it on the road in the morning; it reaches the gate a little after noon. Your defense is ${R.barracks.rate} for each guard in the Barracks (a Brave one ×1.5, a Coward ×0.5), and ${R.forge.rate} for each smith in a Forge.`,
        `Before it arrives you can ward the gate (+${T.wardGateDefense} for ${T.wardGateCost} essence). You can also pay the Host off: ${n1(T.raidTributeFood)} food and ${T.raidTributeCandles === 0.5 ? 'half a candle' : `${n1(T.raidTributeCandles)} candles`} for each point of its strength, and the season's next raid comes ×${mult(T.raidEmbolden)} as strong. Or bar the stores: the Hearth, the Chandlery and the Glazier stop while the Host is at the gate, and a breach carries off half as much.`,
        `At the gate, each second the Host is stronger than your defense, the gate gives; if it still stands after ${T.raidAssaultSecs} seconds, they fall back. Pitch (${T.raidPitchCost} candles) takes ${n1(T.raidPitch)} off their strength. Stone (${T.raidShoreCost}) shores the gate up by ${pct(T.raidShore)}. The bell brings everyone well onto the walls, ${n1(T.raidBellDefense)} defense each, and stops their work. Whoever is on the walls can fall, the more of them the safer each, and the bell's hands more easily than guards.`,
        `If they break in they can cut someone down in the yard, and they carry off food, candles and glass: half the food with a Granary, half the candles and glass with a Cellar. Your guards can go after them for ${pct(T.raidRecover)} of it, each with a ${pct(T.raidPursueRisk)} chance of not coming back. Raiders who die inside the walls wake as Strangers.`,
      ],
    },
    {
      id: 'fire',
      title: 'Fire',
      items: [
        `On about ${pct(T.fireChance)} of days a Hearth or a Forge catches fire. Its heat grows ${pct(T.fireGrow)} a second and everyone in the room fights it, ${pct(T.fireFight)} each, so a room's own hands usually lose. Send the Yard's masons, or ring the bell for everyone. Fighting it can kill, the hotter the likelier; at full heat it catches a room beside it every ${T.fireSpread} seconds. A room still burning at dusk is scorched: nobody works there the next day.`,
      ],
    },
    {
      id: 'dusk',
      title: 'Dusk',
      items: [
        `The day's dead lie in the crypt. A priest can give one a funeral a day: they rest, and you gain 1 remembrance. The rest wake as shades, and how they died decides the kind: ${KINDS.loyal.name} from dying on duty (they fight hardest), ${KINDS.serene.name} from old age (they work best), ${KINDS.pale.name} from sickness (weak at everything), and ${KINDS.stranger.name}s from raiders who fell inside (no bonds). Each needs a place in a mirror; with no room, it wakes Restless.`,
        'Then the camera goes down into the Tain. The Unlit climb from the red rifts in the Deep to the mirrors under the Veil, and they can’t cross candlelight. The line is the light between them: in a small keep, a candle between each rift and its mirror; in a taller one, candles at the feet of the stairs up to the Veil, with a shade in each.',
        `A candle burns ${n1(T.candleWax / 60)} minutes of the night, and candles you don't set carry over. Each room's twin in the Tain has a night job, which a shade posted there works only in the light: ${twins.join('; ')}.`,
        `A bonded pair split across the Veil both work ×${mult(T.twinMult)} when the shade is posted in the twin of the living one's room.`,
        `The Dusk panel's black mirror reads tonight's threats: how many will come and when, from which rift, and where each tide will get past your candles. The red chevrons on the Tain are their ways. A ward (${n1(T.wardCost)} essence) seals a rift, or holds a stair.`,
      ],
    },
    {
      id: 'night',
      title: 'The night',
      items: [
        `Creepers come in tides, one more every ${T.tideEvery} nights. Stopped at a candle, they gnaw at the edge of its light, and a shade standing in the light cuts them down. About ${T.snuffShare === 0.5 ? 'half' : pct(T.snuffShare)} of them hunt candles instead of climbing. From night ${T.seepFrom}, some seep up through any dark room.`,
        'A shade caught in the dark is drained of memory: drop a candle on it to free it. Move sends a shade to a new post. Hush makes the Unlit pass the shades by, but stops all work.',
        `Each one that reaches a mirror cracks the Veil: 1 Dread at dawn for each crack, one heals each dawn, and ${T.cracksMax} at once break it and lose the keep.`,
        `From night ${T.mawFrom}, a Maw. It goes for whatever is worth most for the least fight: the candle holding the way up, or a room where people work. It counts every fighter on its way. A room it stands in for ${T.mawBreak} seconds breaks: no work there tonight, and ${T.dreadPerBroken} Dread at dawn.`,
        `The night after a death, the Weepers: one for each of the day's dead, up to ${T.weepersMax}. They make for the dark of the sleepers' twin (the Dreamwell, or the Cold Hearth), and one that weeps there ${T.nightmareSecs} seconds gives someone a nightmare: they work at ${pct(T.nightmareMult)} the next day. Light burns them, and a Keening shade on their floor hushes them.`,
        'A Wraith is one of your own dead gone wrong. It hunts inside the Tain every night until it is banished.',
        ...(T.lanterns ? [`A shade can carry a lantern, for a candle from the store: its own light for ${n1(T.lanternWax)} seconds, wherever it goes, so the Unlit can't catch it while it burns. Asked again, it sets the lantern down where it stands, as a candle. Pick the shade and press Lantern on the bar, or T.`] : []),
        ...(T.errands ? [`From night ${T.errandFrom}, one or two things turn up in the dark rooms below the line each night, and the black mirror shows them at dusk: an echo, a memory come loose (+${n1(T.echoMemory)} memory to the shade that reaches it), or a relic (${n1(T.relicGlass)} glass). From night ${T.sleepFrom}, some nights one of the living sleepwalks into the Tain at some hour and makes for the Deep. A shade that reaches them walks them back to bed, and light wakes them: a candle where they are, or in their way. The Unlit that catch them in the dark hold them; light them or reach them within ${n1(T.sleepHold)} seconds, or they die in their sleep and wake Pale, as they do if they reach a rift.`] : []),
        ...(T.omens ? [`From night ${T.omenFrom}, about ${pct(T.omenChance)} of nights (never the new moon) have an omen, shown at dusk, and it changes the night's shape. On some dusks the black mirror shows two, and you choose one before the night begins (unchosen, the first comes). ${Object.keys(OMENS).map((id) => `${OMENS[id].name}: ${id === 'sealed' ? 'one rift is sealed, and every Creeper and Maw comes up the other' : omenText(T, { id })}.`).join(' ')}`] : []),
        'The tide clock under the top bar marks the night: each tide (red), each Maw (orange, taller), the Hollow (violet, taller), each of the Drowned (blue), a sleepwalker\'s hour (pale) and dawn (gold). Skip, or N, runs the clock fast to just before the next mark, and stops the moment anything calls out.',
        ...(T.acts ? [`Each shade has one act a night, paid in its memory, and memory is its strength (half the price for the named). A Loyal one Stands: ${actText(T, 'stand')} (${T.actCost.stand} memory). A Serene one Kindles: it ${actText(T, 'kindle')} (${T.actCost.kindle}). A Pale one Passes unseen: ${actText(T, 'pass')} (${T.actCost.pass}). A Stranger Lures: ${actText(T, 'lure')} (${T.actCost.lure}). Pick the shade, and its act is on the bar, or press A.`] : []),
        'With a keyboard, from dusk to dawn: the arrows move a cursor over the Tain, and Enter does there what a tap would with the tool in hand (C for candles, M to move, W to ward). [ and ] pick the shades in turn. Shift and the arrows pan; Esc puts the cursor away.',
      ],
    },
    ...(T.weather ? [weather(T)] : []),
    {
      id: 'dawn',
      title: 'Dawn: the rite',
      items: [
        `Keep a shade and it works again tonight, for ${T.dreadPerKeep} Dread (a Bitter one ${SHADE_TRAITS.bitter.dread}). Cover its mirror and it rests: +1 remembrance, and peace for its kin. The living bear 1 Dread for every ${T.dreadLivingPer} of them, and each priest 1 more. Dread only rises on what's left over.`,
        `Every shade fades ${T.fadePerNight} memory a night, half as much resting in the Cold Hearth; at 0 it's gone. Naming one (${T.nameCost} remembrance) halves its fading for good, and remembering (${T.rememberCost}) gives back ${T.rememberGain}. Loyal shades fight hardest, Serene ones work best, and memory weakens both.`,
        `A Restless shade does nothing and costs ${T.dreadPerRestless} Dread each dawn you leave it. Release it, for remembrance, or bind it into a free mirror for ${T.bindCost} essence, and it settles as what it would have been. After ${T.restlessNights} nights it turns Wraith, unless the Choir calms it. A Wraith left costs ${T.dreadPerWraith} a dawn; banishing it takes ${T.banishCost} essence.`,
        `A vigil lowers Dread by 1 for ${T.vigilCost} remembrance, at the rite or by day.`,
        ...(T.requests ? [`The dead ask for things. From its ${T.askAfter === 2 ? 'second' : `${T.askAfter}th`} night a shade asks one thing at the rite: a Loyal one to stand the gate by day (at its night strength, for ${T.gateFade} memory at dusk), a Stranger a name, a Pale one to be remembered, and a Serene one, once its memory falls below ${T.askFade}, to be let go. Granted, it asks no more; refused, it asks again ${T.askEvery} nights later, and refused ${T.refusals === 2 ? 'twice' : `${T.refusals} times`} it turns Restless and leaves its mirror.`] : []),
      ],
    },
    {
      id: 'church',
      title: 'The Lantern Church',
      items: [
        `It inspects on day ${T.firstInspection}, announced the day before, and again whenever Dread reaches ${T.dreadMax}. At Dread 0–1 it blesses the keep: 3 candles and 2 remembrance. At 2–3 it warns you and takes a tithe. At 4–5 it censures the keep and carries off the fullest mirror with the shades in it.`,
        ...(T.church ? [`A censure brings a silver embargo for ${T.embargoDays} days: the Glazier makes no glass, and no mirror can be built or upgraded. A blessing lifts it, or a donation of ${T.donation} remembrance. Censured again while it stands, the keep is given to the Inquisition: an inquisitor inspects every day at noon for ${T.inquisitionDays} days, the embargo standing with it, and takes no gifts. A blessing sends it away sooner; ${T.crusade ? 'censured under it, the keep is given up to a crusade.' : 'another censure starts its days over.'}`] : []),
        ...(T.church && T.crusade ? [`The crusade comes to the gate a little after noon ${T.crusadeDays} days later, and the inquisitor inspects each noon until then: a blessing calls it off. It's fought as a raid, but takes no tribute and wants none of the stores. Held, the Church gives up, and the embargo and the Inquisition end. Broken in, the crusaders smash every mirror they can find, and the shades in them go free. A mirror hidden before the day it comes can't be found, but its shades sit out every day and night until the crusade is over.`] : []),
      ],
    },
    {
      id: 'mirrors',
      title: 'Mirrors',
      items: [
        `Glass makes mirrors, from the Day panel: ${Object.values(MIRRORS).map((m) => `a ${m.name} for ${m.glass} glass holds ${m.cap}`).join(', ')}.`,
        `Breaking a mirror, in an emergency, frees everyone in it at once: +1 remembrance and Dread −${n1(T.breakDread)} for each. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness comes ${times(T.badLuck)} as often, and fire is likelier.`,
        `By day a shade can whisper its old trade to whoever works it now: they work ×${mult(T.whisperMult)}, and the shade loses ${n1(T.whisperFade)} memory at dusk. A shade in a great glass can step through and work a room in person instead. Set both in People.`,
        ...(T.deep ? [`At dusk a shade can go down into the Deep instead of taking a post (the Dusk panel), not far, deep or deepest. It's gone until dawn: no light, no fighting, no work. It comes back with ${T.deepSilver.join(', ').replace(/, (\d+)$/, ' or $1')} quicksilver for the depth, unless something down there catches it (${T.deepCatch.map(pct).join(', ').replace(/, ([^,]+)$/, ' or $1')} of the time, half as often for a Lurker): then it comes back empty-handed, ${n1(T.deepDrain)} memory the poorer, or not at all. Never on the new moon: the Hollow is down there.`, `Quicksilver upgrades a mirror where it hangs, its shades and all: a hand mirror into a pier glass for ${T.upgradeSilver.pier} quicksilver and ${T.upgradeGlass.pier} glass, a pier glass into a great glass for ${T.upgradeSilver.great} and ${T.upgradeGlass.great}.`] : []),
      ],
    },
    {
      id: 'moon',
      title: 'The new moon and the year',
      items: [
        `On the night of the new moon the Hollow rises. It walks to the mirrors whatever the light, eating the light around it. A ward on a stair holds it ${T.wardHold} seconds; shades fighting it drive it back. If it reaches the Veil, it tears through and takes one of the living.`,
        `The seasons turn from spring. Summer's days are ×${mult(T.seasonDay[1])} as long and its nights ×${mult(T.seasonNight[1])}; winter's the other way, ×${mult(T.seasonDay[3])} and ×${mult(T.seasonNight[3])}, and a day's work grows and shrinks with it. Winter's seventh night is the Long Night, ${n1(T.longNight)} winter nights long, with the Hollow and a Maw; at its end the year ends.`,
        `When a year ends you choose how: keep the watch into a harder year; take your own place in the glass, as a Loyal, named, Anchored shade who weighs ${T.keeperDread} shades' Dread at every rite, while a new keeper goes on; or seal the Veil, and every shade goes free and the keep's story ends.`,
        ...(T.plague ? [`Summer brings plague: in a crowded keep, sickness takes one more for every ${T.plagueCrowd} living beyond the beds at once. Beds in Quarters, and healers, are what answer it.`] : []),
        ...(T.generations ? [`From the second year the keep has generations. Each spring the living age: a child comes of age and can work, the young grow up, and an adult grows old ${pct(T.oldChance)} of the time; the unwed pair off. Each season a couple, neither old, has a child ${pct(T.birthChance)} of the time while there's room. Children don't work and shelter inside from the Host, but they starve first. The old die in their sleep and wake Serene, so in time everyone you started with works nights.`] : []),
        ...(T.siege ? [`Autumn brings a siege: unless its day-2 raid is paid off, the Host makes camp outside for ${T.siegeDays} days. The gate is shut, so nobody quarries in the Yard and no one new comes, and on day 3 the camp comes at the gate. The guards can sally out to break it: the better your defense against the camp, the better the odds, and each guard risks ${pct(T.raidPursueRisk)}.`] : []),
      ],
    },
  ];
}
