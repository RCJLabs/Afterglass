// How to play: every lesson of the tutorial and the guide, as a short manual the Menu keeps. Its numbers come
// from the keep's own rules, so it stays true when they're changed in Settings. Pure.

import { DAY_ROOMS, TWINS, KINDS, MIRRORS, TRAITS, SHADE_TRAITS } from './data.js';

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
      ],
    },
    {
      id: 'day',
      title: 'The day',
      items: [
        `Everyone has a job, and a job needs its room: ${rooms.join('; ')}. A room holds ${T.roomCap} workers; for more, build another of its kind.`,
        `Whoever has no room quarries stone in the Yard, ${R.yard.rate} a day each. Build raises a room on top of the keep for ${T.roomStone} stone. What you build on top by day is the Tain's deepest room by night, next to the rifts.`,
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
      ],
    },
    {
      id: 'dawn',
      title: 'Dawn: the rite',
      items: [
        `Keep a shade and it works again tonight, for ${T.dreadPerKeep} Dread (a Bitter one ${SHADE_TRAITS.bitter.dread}). Cover its mirror and it rests: +1 remembrance, and peace for its kin. The living bear 1 Dread for every ${T.dreadLivingPer} of them, and each priest 1 more. Dread only rises on what's left over.`,
        `Every shade fades ${T.fadePerNight} memory a night, half as much resting in the Cold Hearth; at 0 it's gone. Naming one (${T.nameCost} remembrance) halves its fading for good, and remembering (${T.rememberCost}) gives back ${T.rememberGain}. Loyal shades fight hardest, Serene ones work best, and memory weakens both.`,
        `A Restless shade does nothing and costs ${T.dreadPerRestless} Dread each dawn you leave it. Release it, for remembrance, or bind it into a free mirror for ${T.bindCost} essence, and it settles as what it would have been. After ${T.restlessNights} nights it turns Wraith, unless the Choir calms it. A Wraith left costs ${T.dreadPerWraith} a dawn; banishing it takes ${T.banishCost} essence.`,
        `A vigil lowers Dread by 1 for ${T.vigilCost} remembrance, at the rite or by day.`,
      ],
    },
    {
      id: 'church',
      title: 'The Lantern Church',
      items: [
        `It inspects on day ${T.firstInspection}, announced the day before, and again whenever Dread reaches ${T.dreadMax}. At Dread 0–1 it blesses the keep: 3 candles and 2 remembrance. At 2–3 it warns you and takes a tithe. At 4–5 it censures the keep and carries off the fullest mirror with the shades in it.`,
      ],
    },
    {
      id: 'mirrors',
      title: 'Mirrors',
      items: [
        `Glass makes mirrors, from the Day panel: ${Object.values(MIRRORS).map((m) => `a ${m.name} for ${m.glass} glass holds ${m.cap}`).join(', ')}.`,
        `Breaking a mirror, in an emergency, frees everyone in it at once: +1 remembrance and Dread −${n1(T.breakDread)} for each. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness comes ${times(T.badLuck)} as often, and fire is likelier.`,
        `By day a shade can whisper its old trade to whoever works it now: they work ×${mult(T.whisperMult)}, and the shade loses ${n1(T.whisperFade)} memory at dusk. A shade in a great glass can step through and work a room in person instead. Set both in People.`,
      ],
    },
    {
      id: 'moon',
      title: 'The new moon and the year',
      items: [
        `On the night of the new moon the Hollow rises. It walks to the mirrors whatever the light, eating the light around it. A ward on a stair holds it ${T.wardHold} seconds; shades fighting it drive it back. If it reaches the Veil, it tears through and takes one of the living.`,
        `The seasons turn from spring. Summer's days are ×${mult(T.seasonDay[1])} as long and its nights ×${mult(T.seasonNight[1])}; winter's the other way, ×${mult(T.seasonDay[3])} and ×${mult(T.seasonNight[3])}, and a day's work grows and shrinks with it. Winter's seventh night is the Long Night, ${n1(T.longNight)} winter nights long, with the Hollow and a Maw; at its end the year ends.`,
      ],
    },
  ];
}
