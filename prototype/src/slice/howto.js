// How to play: every lesson of the tutorial and the guide, as a short manual the Menu keeps. Its numbers come
// from the keep's own rules, so it stays true when they're changed in Settings. Pure. Round seven, phase 11
// cut it by a quarter (tools/words.mjs counts it): what the panels say as you play, it leaves to them.

import { DAY_ROOMS, TWINS, KINDS, MIRRORS, TRAITS, SHADE_TRAITS, OMENS, STUDIES, DECREES, decreeDoes, decreesOf, CHAPTERS, ENDINGS, TROUBLES, mirrorsOf } from './data.js';
import { actText } from './sim.js';

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
const and = (xs) => xs.join(', ').replace(/, ([^,]+)$/, ' and $1');
const or = (xs) => xs.join(', ').replace(/, ([^,]+)$/, ' or $1');
const nth = (k) => ['', 'first', 'second', 'third', 'fourth'][k] || `${k}th`;
// A share of the day as the clock shows it, from 06:00 to 18:00.
const hour = (x) => {
  const h = 6 + 12 * x;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
};
// The same for a share of the night, from 18:00.
const nightHour = (x) => {
  const h = (18 + 12 * x) % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
};

// The weather (round five), in the keep's numbers.
function weather(T) {
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const odds = T.year
    ? `Rain comes on about ${and(SEASONS.map((k, i) => `${pct(T.rainChance[i])} of ${k} days`))}, and fog on ${and(SEASONS.map((k, i) => pct(T.fogChance[i])))} of them.`
    : `Rain comes on about ${pct(T.rainChance[0])} of days and fog on ${pct(T.fogChance[0])}.`;
  const half = (x) => (x === 0.5 ? 'half' : `${mult(x)} times`);
  return {
    id: 'weather',
    title: 'Weather',
    items: [
      `Each day and its night are clear, rainy or foggy, and the Sky in the HUD shows tomorrow's. ${odds}`,
      `Rain slows the Yard to ${pct(T.rainYard)} and damps fire: ${half(T.rainFire)} as likely, and ${half(T.rainFire)} as fast.`,
      `On a rainy night the Drowned come up out of the moat's twin at one end of the floor under the Veil, behind the line (the Dusk panel says which end). They never take a stair, making for that floor's mirrors, and one that reaches a mirror cracks the Veil. ${T.drownedBase === 1 ? 'One comes' : `${T.drownedBase} come`}, one more every ${T.drownedEvery} nights, none on the new moon${T.year ? ' (the Long Night has them)' : ''}. Light bars them, though they gnaw it ${times(T.drownedGnaw)} as fast as Creepers, and a shade in the light cuts them down. A shade they catch in the dark is dragged under: gone.`,
      `A ward on the moat (${n1(T.wardCost)} essence) keeps them under all night; or light the mirror on their side and post a fighter there.`,
      'Fog clouds the black mirror: it shows how many come and when, but not their ways.',
    ],
  };
}

// [{ id, title, items: [text] }], in the order a season meets them.
export function howTo(T) {
  const R = DAY_ROOMS;
  const rooms = [
    `cooks in the Hearth, ${R.hearth.rate} food a day each`,
    `chandlers in a Chandlery, ${R.chandlery.rate} candles`,
    `glaziers in a Glazier, ${R.glazier.rate} glass`,
    `priests in a Chapel, ${R.chapel.rate} remembrance and a funeral a day`,
    `healers in an Infirmary, each curing ${R.infirmary.rate} sick a day`,
    `guards in a Barracks, ${R.barracks.rate} defense`,
  ];
  const twins = [
    `the ${TWINS.chandlery.name} (Chandlery) saves wax`,
    `the ${TWINS.chapel.name} (Chapel) makes essence and calms the Restless`,
    `the ${TWINS.barracks.name} (Barracks) adds to tomorrow's defense`,
    `the ${TWINS.glazier.name} (Glazier) makes glass`,
    `the ${TWINS.infirmary.name} (Infirmary) makes tomorrow's sick wake one kind better`,
    `resting in the ${TWINS.hearth.name}${T.dreamRest ? ` or the ${TWINS.quarters.name} (Quarters)` : ''} halves fading`,
    `forging in the ${TWINS.forge.name} through half the night makes every shade fight ×${mult(T.steelFight)} the next`,
    ...(T.dreamRest ? [] : [`dreaming in the ${TWINS.quarters.name} (Quarters) through half the night makes the living work ×${mult(T.dreamWork)} the next day`]),
  ];
  const weepers = T.dreamwell && T.weepersMax;
  const chapters = [1, 2, 3, 4, 5].map((k) => CHAPTERS[k]);
  const campaign = T.campaign && T.year
    ? [
        {
          id: 'campaign',
          title: 'The campaign',
          items: [
            `A campaign is five years, each a chapter: ${chapters.map((C, i) => `year ${i + 1}, ${C.name}`).join('; ')}. It's chosen for a new keep, beside the open year, and if you keep the watch after its fifth year, it plays on without chapters.`,
            'Each chapter brings its pressure. From year 2 the Host lays siege in autumn and brings ladders to the gate, and a Gatehouse can be raised against it; from year 3 a censure brings the embargo, then the Inquisition, then the crusade (before, it covers a mirror); from year 4 the Hollow is half again as hard to drive back and eats the light as fast again, and the new moon brings half again as many Creepers.',
            `Each chapter has a goal, worth ${T.goalReward} remembrance, shown in the Day panel: ${chapters.map((C) => `to ${C.goal.text}`).join('; ')}.`,
            `Years 1 to 4 close on a choice of two, goods now or a help for the next year: ${[1, 2, 3, 4].map((k) => `${CHAPTERS[k].close.map((c) => `${c.name.charAt(0).toLowerCase()}${c.name.slice(1)} (${c.text})`).join(' or ')}`).join('; ')}.`,
            `The fifth year ends in one of three endings: ${Object.values(ENDINGS).map((E) => `${E.name}: ${E.text.charAt(0).toLowerCase()}${E.text.slice(1)}`).join(' ')}`,
            `A campaign's years harden ×${mult(T.campaignHardness)} each, not the open year's ×${mult(T.yearHardness)}, and as the open year's after its ending. A chapter whose keep is lost can be begun again from its first dawn.`,
          ],
        },
      ]
    : [];
  return [
    ...campaign,
    {
      id: 'keep',
      title: 'The keep',
      items: [
        `A season is ${T.seasonDays} days and nights, ending on the new moon. By day the living work the keep, and whoever dies inside the walls wakes at dusk as a shade. By night the shades hold the Tain, the keep's reflection, against the Unlit. At dawn you choose which of the dead stay.`,
        'The bar at the bottom holds the tools of the moment and opens the panels: this phase, People, Records and the Menu. Pause when you like; the clock runs at 1×, 2× or 4×.',
        'A new keep is Gentle, Standard or Hard, chosen under New game; Settings shows every number it sets.',
      ],
    },
    {
      id: 'day',
      title: 'The day',
      items: [
        `Everyone has a job, and a job needs its room: ${rooms.join('; ')}. A room holds ${T.roomCap}; for more, build another.`,
        `Whoever has no room quarries stone in the Yard, ${R.yard.rate} a day each. Build raises a room for ${T.roomStone} stone, on top of the keep or in a bare hall. By night the keep hangs upside down: the top floor is the Tain's deepest, by the rifts, so a room below the line is in the Unlit's way, and every floor added makes them climb farther. The floor above the ground floor is the line's, worked by the shades holding it, so it's the place for a Chapel: they sing in its Choir. Tearing a room down gives back ${Math.floor(T.roomStone * T.teardownBack)} stone; moving one, swapping it with another, costs ${T.moveStone}.`,
        `Everyone eats ${n1(T.eatPerDay)} food a day. With the larder empty they work at ${pct(T.hungryMult)}, and the weakest starve.`,
        `Someone new comes to the gate every ${T.newcomerEvery === 2 ? 'second' : `${T.newcomerEvery}th`} day while there are fewer than ${T.bedsHold ? `the keep has beds for, ${T.maxLiving} at least (${T.baseBeds}, and ${T.quartersBeds} more for each Quarters)` : T.maxLiving}.`,
        `Sickness comes on about ${pct(T.sickChance)} of days and kills in ${days(T.sickDays)} days unless a healer cures it. The old can die in their sleep. Grief makes the living work at ${pct(T.griefMult)} until their dead rest, then at ${pct(T.peaceMult)} for ${T.peaceDays} days.`,
        `Everyone has a trait, shown under their name, and death turns it over: ${Object.values(TRAITS).map((t) => `${t.name} → ${SHADE_TRAITS[t.dead].name}`).join(', ')}.`,
      ],
    },
    {
      id: 'raids',
      title: 'Raids',
      items: [
        `The Ashen Host comes on days ${and(Object.keys(T.raidDays))}, stronger each time and ×${mult(T.hardness)} each season. It's sighted on the road in the morning, about three and a half hours before it reaches the gate. Your defense is ${R.barracks.rate} for each guard in the Barracks (a Brave one ×1.5, a Coward ×0.5)${T.forgeArms ? '' : `, and ${R.forge.rate} for each smith in a Forge`}.${T.muster ? ` A guard counts in full only after ${n1(T.musterHours)} hours at the post, and for that share before, starting again if moved: post guards while the Host is on the road, at the cost of their work.` : ''}`,
        ...(T.forgeArms ? [`By day a Forge's smiths make arms, ${n1(R.forge.rate)} a day each, up to one per guard's post; each makes a guard ${n1(T.armDefense)} stronger at the gate, as far as mustered, and each raid there breaks ${pct(T.armsBreak)} of those in use.${T.coldForge ? " A Forge nobody works can't catch fire." : ''}`] : []),
        `Before it arrives you can ward the gate (+${T.wardGateDefense} for ${T.wardGateCost} essence); pay it off, ${n1(T.raidTributeFood)} food and ${T.raidTributeCandles === 0.5 ? 'half a candle' : `${n1(T.raidTributeCandles)} candles`} for each point of its strength, and the season's later raids come ×${mult(T.raidEmbolden)} as strong${T.emboldenCarries ? " (next season's, after its last)" : ''}; or bar the stores, stopping the Hearth, Chandlery and Glazier while the Host is at the gate, so a breach carries off half as much.`,
        `At the gate, each second the Host is stronger than your defense the gate gives; held ${T.raidAssaultSecs} seconds, they fall back. Pitch (${T.raidPitchCost} candles) takes ${n1(T.raidPitch)} off their strength, stone (${T.raidShoreCost}) shores the gate up by ${pct(T.raidShore)}, and the bell brings everyone well onto the walls at ${n1(T.raidBellDefense)} defense each, stopping their work. Those on the walls can fall, the fewer the likelier, the bell's hands more than guards.`,
        `Breaking in, they can cut someone down and carry off food, candles and glass (half the food with a Granary, half the rest with a Cellar). Guards can go after them for ${T.guardsGoOut ? "a share as great as their strength against the Host's" : `${pct(T.raidRecover)} of it`}, each with a ${pct(T.raidPursueRisk)} chance of not coming back. Raiders who die inside wake as Strangers.`,
      ],
    },
    {
      id: 'fire',
      title: 'Fire',
      items: [
        `On about ${pct(T.fireChance)} of days a Hearth or a ${T.coldForge ? 'worked ' : ''}Forge catches fire. It grows ${pct(T.fireGrow)} a second, and everyone in the room fights it, ${pct(T.fireFight)} each, which usually loses: send the Yard's masons, or ring the bell. Fighting it can kill, the hotter the likelier, and at full heat it spreads next door every ${T.fireSpread} seconds. A room still burning at dusk is scorched: nobody works there the next day.`,
      ],
    },
    ...(T.visitors
      ? [
          {
            id: 'visitors',
            title: 'Visitors at the gate',
            items: [
              `On about ${pct(T.visitorChance)} of days${T.visitFrom > 1 ? `, from the keep's ${nth(T.visitFrom)} day,` : ''} someone comes to the gate, now and then two. The Day panel shows who, what each answer costs and gives, and how long they wait; left waiting, they take the last answer.`,
              'Each of the twenty comes only when there is a reason to: a trader with what you lack, pilgrims ahead of a raid, a physician when someone is sick, a necromancer when a shade is Restless.',
              ...(T.payInKind ? ["A trader who wants food also takes glass, and the Church's almoner prayers, paid in remembrance."] : []),
              'Turning away those who ask shelter costs Dread. What an answer leaves behind, such as riders promised, shows in the Day panel until it comes.',
              ...(T.cruelty
                ? [`Some days bring a hard answer inside the keep: a traitor signalling the Host, a plague-bearer in a crowded summer, the Hollow's price on a new moon, a witch-hunter before the Church's inspector. One answer kills one of your own on your order, and they wake at dusk a Wraith, which hunts the Tain every night until banished at the rite (${T.banishCost} essence) and costs ${T.dreadPerWraith} Dread a dawn.`]
                : []),
              ...(T.yearVisitors ? ["From the keep's third year to its tenth, each year from its summer brings someone who has never come before, once."] : []),
            ],
          },
        ]
      : []),
    ...(T.library || T.hall || T.gatehouse
      ? [
          {
            id: 'rooms6',
            title: 'The Library, the Hall and the Gatehouse',
            items: [
              ...((T.library || T.hall) && T.lateRoomsFrom > 1 ? [`${T.library && T.hall ? 'The Library and the Hall' : T.library ? 'The Library' : 'The Hall'} can be built from the keep's ${T.year && T.lateRoomsFrom === 2 ? 'first summer' : `season ${T.lateRoomsFrom}`}.`] : []),
              ...(T.library ? [`The Library: its scholars make ${DAY_ROOMS.library.rate} lore a day each toward one study at a time, begun with remembrance, and a lit shade in its twin, the Archive of the Dead, adds to it by night. A study finished is the keep's for good: ${Object.values(STUDIES).map((x) => `${x.name}, ${x.text}`).join('; ')}.`] : []),
              ...(T.hall ? [`The Hall: one decree a season, standing until it ends. ${decreesOf(T).map((id) => `${DECREES[id].name}: ${decreeDoes(T, DECREES[id])}; but ${DECREES[id].price}`).join('. ')}. A shade seated, lit, in its twin, the Court of Shades, through half the night has one of the dead's requests heard at the next rite: granted or refused, it costs nothing.`] : []),
              ...(T.gatehouse ? [`The Gatehouse stands at the gate, on the ground floor (move a room up to make way), one to a keep; its gate guards give ${DAY_ROOMS.gatehouse.rate} defense each. From the keep's ${nth(T.laddersFrom)} season the Host brings a ladder every ${n1(T.ladderEvery)} seconds at the gate, each one standing adding ${n1(T.ladderHost)} to its strength; a gate guard on the Gatehouse's walls throws them down.`, `From the keep's ${nth(T.undergateFrom)} season its twin, the Undergate, behind the line, stirs on about ${pct(T.undergateChance)} of nights (the Dusk panel says so), and ${T.undergatePerTide === 1 ? 'one Creeper' : `${T.undergatePerTide} Creepers`} of each tide ${T.undergatePerTide === 1 ? 'comes' : 'come'} up there instead of at a rift. A candle at its mouth, the room's outer end, or a ward shuts it.`] : []),
            ],
          },
        ]
      : []),
    ...(T.repairs || T.standingWard || T.studyTiers > 1 || T.lampworks || T.troubles
      ? [
          {
            id: 'growth',
            title: 'A keep that grows',
            items: [
              ...(T.repairs ? [`From the keep's ${nth(T.repairsFrom)} year it wears. A room a Maw broke stays haunted ${T.hauntDays} dawns, ${T.dreadPerBroken} Dread at each, and one a fire burned out stays dead ${T.burnDays} days, unless masons mend it (${n1(T.mendStone)} stone, from the Day panel). The gate keeps what an assault took off it, ${pct(T.gateBreached)} after a breach, and mends ${pct(T.gateMend)} of itself a day; masons mend ${pct(T.raidShore)} for ${n1(T.raidShoreCost)} stone.`] : []),
              ...(T.lampworks ? [`From floor ${T.highFrom} up a room costs ${n1(T.highStone)} stone more for each floor above floor ${T.highFrom - 1}, and the Lampworks can be raised: its lampwrights turn ${n1(T.lampGlass)} glass a day into ${DAY_ROOMS.lampworks.rate} candles each, and its twin, the Lamp Gallery, is lit every night without a candle.`] : []),
              ...(T.standingWard ? [`By day essence can set a standing ward on a rift, the moat or the Undergate: it holds every night left in the season, for ${pct(T.standingWard)} of a night's ward each, paid at once.${T.veilWard ? ` A ward on the Veil itself holds one crack more until the season ends, for ${n1(T.veilWard)} essence, and each more as much again as the one before.` : ''}`] : []),
              ...(T.studyTiers > 1 && T.library ? [`Each study has a second rank, begun once the first is learned, for ${times(T.studyTwoCost)} its remembrance and lore.`] : []),
              ...(T.troubles ? [`From the ${nth(T.troublesFrom)} year of the open year each year brings a trouble, none twice until each has come: ${and(Object.values(TROUBLES).map((x) => x.name.charAt(0).toLowerCase() + x.name.slice(1)))}. The Day panel says which, and what it does.${T.troubleRite ? ` Once a season a rite in the Chapel (${n1(T.troubleRite)} remembrance) halves it until the season ends.` : ''}`] : []),
            ],
          },
        ]
      : []),
    {
      id: 'dusk',
      title: 'Dusk',
      items: [
        `The day's dead lie in the crypt. A priest can give one a funeral a day: they rest, and you gain 1 remembrance. The rest wake as shades of a kind set by how they died: ${KINDS.loyal.name} from duty (they fight hardest), ${KINDS.serene.name} from old age (they work best), ${KINDS.pale.name} from sickness (weak at everything), ${KINDS.stranger.name}s from raiders who fell inside (no bonds). Each needs a place in a mirror, or wakes Restless.`,
        'Then the camera goes down into the Tain. The Unlit climb from the red rifts in the Deep to the mirrors under the Veil, and can’t cross candlelight. The line is the light between: in a small keep, a candle between each rift and its mirror; in a taller one, candles at the feet of the stairs up to the Veil, a shade in each.',
        `A candle burns ${n1(T.candleWax / 60)} minutes, and unset candles carry over. A shade posted in a room's twin works its night job, in the light: ${twins.join('; ')}.`,
        `A bonded pair split across the Veil both work ×${mult(T.twinMult)} when the shade is posted in the twin of the living one's room.`,
        `The Dusk panel's black mirror reads tonight's threats: how many come, when, from which rift, and where each tide gets past your candles, drawn on the Tain as red chevrons. A ward (${n1(T.wardCost)} essence) seals a rift or holds a stair.`,
        'Dusk opens on Move: tap a shade, then where it should stand. Candle sets candles and Ward wards; until the night begins, a tap on one you set takes it back.',
        'As last night, in the Dusk panel, puts the shades back where the last night began and lights its candles again, as far as the store goes.',
      ],
    },
    {
      id: 'night',
      title: 'The night',
      items: [
        `Creepers come in tides, one more every ${T.tideEvery} nights. Stopped at a candle, they gnaw at the edge of its light, where a shade standing in the light cuts them down. About ${T.snuffShare === 0.5 ? 'half' : pct(T.snuffShare)} hunt candles instead of climbing; from night ${T.seepFrom} some seep up through any dark room.${T.thinStair ? ' A tide rises on the side whose stair up to the Veil has less fight at its foot, so a thin stair draws it.' : ''}`,
        'A shade caught in the dark is drained of memory: drop a candle on it to free it. Move sends a shade to a new post. Hush makes the Unlit pass the shades by, but stops all work.',
        T.crackPerTide
          ? `A tide that reaches a mirror cracks the Veil, once at each mirror: 1 Dread at dawn. The rest of that tide spill into the keep above as nightmares, each leaving someone at ${pct(T.nightmareMult)} the next day. ${T.cracksMax} cracks break the Veil and lose the keep${T.crackHeal ? `; ${T.crackHeal === 1 ? 'one mends' : `${T.crackHeal} mend`} each dawn` : '; none mend until a new season'}.`
          : `Each one that reaches a mirror cracks the Veil, for 1 Dread at dawn; one heals each dawn, and ${T.cracksMax} at once break it and lose the keep.`,
        ...(T.veilStrains ? ['The Veil strains, with a call-out, when a stair of the line will be dark as the next tide comes: relight it.'] : []),
        ...(T.wisp ? [`Out of candles, the Candle tool lights a wisp: ${n1(T.wispCost)} essence for a candle's light that lasts ${n1(T.wispSecs)} seconds, about a tide.`] : []),
        `From night ${T.mawFrom}, a Maw. It goes for whatever is worth most for the least fight, the candle holding the way up or a room where people work, counting every fighter on its way. A room it stands in for ${T.mawBreak} seconds breaks: no work there tonight, and ${T.dreadPerBroken} Dread at dawn.${T.mawRuin ? ` Left alone there ${T.mawRuin} seconds more (a bar fills), it ruins the room: the next day its workers manage ${pct(T.ruinWork)}, for ${T.dreadPerRuin} more Dread.` : ''}`,
        ...(weepers ? [`The night after a death, the Weepers: one for each of the day's dead, up to ${T.weepersMax}. They make for the dark of the sleepers' twin (the Dreamwell, or the Cold Hearth), and one that weeps there ${T.nightmareSecs} seconds gives someone a nightmare. Light burns them, and a Keening shade on their floor hushes them.`] : []),
        'A Wraith is one of your own dead gone wrong: it hunts the Tain every night until banished.',
        ...(T.autoRelight ? ['In these rules a candle that burns down at the line, or where a shade is posted, is lit again from the store, keeping the last candle back, unless the Unlit are at it.'] : []),
        ...(T.lanterns ? [`A shade can carry a lantern (${(T.lanternCost ?? 1) === 1 ? 'a candle' : (T.lanternCost ?? 1) === 0.5 ? 'half a candle' : `${n1(T.lanternCost)} candles`}): its own light for ${n1(T.lanternWax)} seconds wherever it goes, so the Unlit can't catch it; asked again, it sets it down as a candle. Pick the shade, then Lantern (T).${T.hollowLure ? ' On the new moon the Hollow hunts a carried lantern first: a shade that keeps ahead of it leads it away.' : ''}`] : []),
        ...(T.errands ? [`From night ${T.errandFrom}, an echo (+${n1(T.echoMemory)} memory) or a relic (${n1(T.relicGlass)} glass) turns up in a dark room below the line, shown in the black mirror, for the shade that reaches it. From night ${T.sleepFrom}, on some nights one of the living sleepwalks into the Tain toward the Deep: a shade that reaches them, or light, sends them back to bed. Held by the Unlit in the dark ${n1(T.sleepHold)} seconds, or reaching a rift, they die and wake Pale.`] : []),
        ...(T.omens ? [`From night ${T.omenFrom}, about ${pct(T.omenChance)} of nights have an omen, shown at dusk, that changes the night's shape: ${and(Object.values(OMENS).filter((o) => !o.more || T.moreOmens).map((o) => `${o.name.charAt(0).toLowerCase()}${o.name.slice(1)}`))}. The Dusk panel says how, and on some dusks offers a choice of two.`] : []),
        'The tide clock under the top bar marks the night’s tides, Maws, Hollow, Drowned, sleepwalkers and dawn. Skip (N) runs to just before the next mark, and stops if anything calls out.',
        ...(T.acts ? [`Each shade has one act a night, paid in memory (half for the named). A Loyal one Stands: ${actText(T, 'stand')} (${T.actCost.stand}). A Serene one Kindles: it ${actText(T, 'kindle')} (${T.actCost.kindle}). A Pale one Passes unseen: ${actText(T, 'pass')} (${T.actCost.pass}). A Stranger Lures: ${actText(T, 'lure')} (${T.actCost.lure}). Pick the shade, and its act is on the bar (A).`] : []),
        'With a keyboard, the arrows move a cursor over the Tain and Enter taps there (C candles, M move, W ward); [ and ] pick shades.',
      ],
    },
    ...(T.weather ? [weather(T)] : []),
    {
      id: 'dawn',
      title: 'Dawn: the rite',
      items: [
        `Keep a shade and it works again tonight, for ${T.dreadPerKeep} Dread (a Bitter one ${SHADE_TRAITS.bitter.dread}). Cover its mirror and it rests: +1 remembrance, and peace for its kin. The living bear 1 Dread for every ${T.dreadLivingPer} of them, and each priest 1 more; Dread rises only on what's left over.`,
        `Every shade fades ${T.fadePerNight} memory a night, half that resting; at 0 it's gone. Naming one (${T.nameCost} remembrance) halves its fading for good, and remembering (${T.rememberCost}) gives back ${T.rememberGain}. Memory is a shade's strength.`,
        `A Restless shade does nothing and costs ${T.dreadPerRestless} Dread a dawn: release it, for remembrance, or bind it into a free mirror (${T.bindCost} essence) to settle it as what it would have been. After ${T.restlessNights} nights it turns Wraith unless the Choir calms it; a Wraith costs ${T.dreadPerWraith} a dawn, and ${T.banishCost} essence to banish.`,
        `A vigil lowers Dread by 1 for ${T.vigilCost} remembrance, at the rite or by day.`,
        ...(T.requests ? [`The dead ask for things. From its ${T.askAfter === 2 ? 'second' : `${T.askAfter}th`} night a shade asks one thing at the rite: a Loyal one to stand the gate by day (at its night strength, for ${T.gateFade} memory), a Stranger a name, a Pale one to be remembered, a Serene one with under ${T.askFade} memory to be let go. Granted, it asks no more; refused ${T.refusals === 2 ? 'twice' : `${T.refusals} times`}, it turns Restless and leaves its mirror.`] : []),
      ],
    },
    {
      id: 'church',
      title: 'The Lantern Church',
      items: [
        `It inspects on day ${T.firstInspection}, announced the day before, and whenever Dread reaches ${T.dreadMax}.${T.churchLedger ? " It judges the Dread of every day since it last looked, at each dusk and at noon on the day, averaged, so Dread held low only on the eve doesn't fool it." : ''} At 0–1 it blesses the keep (3 candles, 2 remembrance), at 2–3 warns and takes a tithe, and at 4–5 censures it, carrying off the fullest mirror, shades and all.`,
        ...(T.church ? [`A censure brings a silver embargo for ${T.embargoDays} days: no glass, and no mirror built or upgraded. A blessing lifts it, or a donation of ${T.donation} remembrance. Censured again under it, the keep is given to the Inquisition: an inquisitor inspects every noon for ${T.inquisitionDays} days and takes no gifts. A blessing sends it away sooner; ${T.crusade ? 'a censure under it brings a crusade.' : 'another censure starts its days over.'}`] : []),
        ...(T.church && T.crusade ? [`The crusade comes to the gate a little after noon ${T.crusadeDays} days later; until then the inquisitor inspects each noon, and a blessing calls it off. It's fought as a raid, wanting no tribute or stores. Held, the Church gives up, and the embargo and the Inquisition end. Broken in, the crusaders smash every mirror they find, freeing its shades. A mirror hidden beforehand can't be found, but its shades sit out until it's over.`] : []),
      ],
    },
    {
      id: 'mirrors',
      title: 'Mirrors',
      items: [
        `Glass makes mirrors, from the Day panel: ${mirrorsOf(T).map((k) => MIRRORS[k]).map((m) => `a ${m.name} for ${m.glass} glass holds ${m.cap}`).join(', ')}.${T.glassHalls ? ` The newly dead are bound into a great-glass hall first, and fade there ${T.hallFade === 0.5 ? 'half' : `${mult(T.hallFade)} times`} as fast.` : ''}`,
        `Breaking a mirror in an emergency frees everyone in it: +1 remembrance and Dread −${n1(T.breakDread)} for each. The mirror is lost, and ${T.badLuckDays} days of bad luck follow: sickness ${times(T.badLuck)} as often, and fire likelier.`,
        ...(T.mirrorRooms
          ? [
              'Each mirror hangs in a room, one to a room: a new one where the Maws come least, a room nobody works by day or night (the Crypt, a Granary, a Cellar, a bare hall), the nearest the Veil of those. Hang it elsewhere by day, from its row in the Day panel; the newly dead wake in the safest one with room.',
              `By day a shade can whisper through its mirror to whoever works that room (×${mult(T.whisperMult)}, for ${n1(T.whisperFade)} of its memory at dusk), or step out of a great glass to work that room in person; both are set in People.`,
              `A mirror with a shade in it is a door between its room and the room's twin. Maws come for work, by day or by night; from the keep's ${T.doorsFrom === 2 ? 'second' : `${T.doorsFrom}th`} season, one that breaks the twin of a room where a door hangs comes through it, and the Veil cracks${T.doorCracks === 1 ? '' : ` ${T.doorCracks} times`}. The black mirror says when tonight's Maw is headed for one. Turned to the wall, by day or at dusk, a mirror lets nothing through, but its shades sit out until it's turned back, and nobody new wakes in it.`,
            ]
          : [`By day a shade can whisper its old trade to whoever works it now (×${mult(T.whisperMult)}, for ${n1(T.whisperFade)} of its memory at dusk), or step out of a great glass to work a room in person; both are set in People.`]),
        ...(T.deep ? [`At dusk a shade can go down into the Deep instead of taking a post: not far, deep or deepest. It's gone until dawn, and brings back ${or(T.deepSilver.map(String))} quicksilver by depth, unless something catches it (${or(T.deepCatch.map(pct))} of the time, half as often for a Lurker): then it comes back empty-handed, ${n1(T.deepDrain)} memory poorer, or not at all. Never on the new moon.`, `Quicksilver upgrades a mirror where it hangs, shades and all: a hand mirror into a pier glass for ${T.upgradeSilver.pier} quicksilver and ${T.upgradeGlass.pier} glass, a pier glass into a great glass for ${T.upgradeSilver.great} and ${T.upgradeGlass.great}.`] : []),
      ],
    },
    {
      id: 'moon',
      title: 'The new moon and the year',
      items: [
        `On the new moon the Hollow rises and walks to the mirrors whatever the light, eating the light around it. ${T.wardDraw ? `A ward on a stair holds it while it draws on the essence, ${T.wardDraw < 1 ? T.wardDraw.toFixed(2).replace(/0$/, '') : n1(T.wardDraw)} a second at first and more as the Hollow grows, and ${T.wardHold} seconds more once the store is empty; the Dusk panel says what holding it until dawn takes.${T.essenceCap ? ` The store holds ${T.essenceCap} essence at most.` : ''}` : `A ward on a stair holds it ${T.wardHold} seconds.`}${T.hollowWardOnly ? ' On its nights a ward holds only the Hollow, so the line must still be held.' : ''}${T.hollowPinned ? ' Held at a ward, it eats no light and drains no one: then send fighters, who drive it back.' : ' Fighters drive it back.'} If it reaches the Veil, it takes one of the living.${T.hollowRewardYear ? ` Driving it back is worth ${T.hollowReward} remembrance, and ${T.hollowRewardYear} more each year.` : ''}`,
        `The seasons turn from spring. Summer's days are ×${mult(T.seasonDay[1])} as long and its nights ×${mult(T.seasonNight[1])}; winter's the other way, ×${mult(T.seasonDay[3])} and ×${mult(T.seasonNight[3])}, and a day's work with them. Winter's seventh night, the Long Night, is ${n1(T.longNight)} nights long, with the Hollow, a Maw${T.greatTide ? `, and at about ${nightHour(T.greatTideAt)} a last great tide of ${pct(T.greatTide)} of its Creepers at both rifts` : ''}; with it the year ends.${T.winterNeed ? ' From autumn the Day panel says how many candles winter will want.' : ''}${(T.campaign ? T.campaignHardness : T.yearHardness) ? ` Each season is ×${mult(T.hardness)} harder than the last, and each year starts ×${mult(T.campaign ? T.campaignHardness : T.yearHardness)} harder than the last did${T.campaign && T.yearHardness ? ` (×${mult(T.yearHardness)} after the campaign)` : ''}.` : ''}`,
        `When a year ends you choose: keep the watch into a harder year; take your own place in the glass, as a Loyal, named, Anchored shade weighing ${T.keeperDread} shades' Dread, while a new keeper goes on; or seal the Veil, freeing every shade, and end the story.`,
        ...(T.eclipse && T.year ? [`Once a year, at ${T.eclipseAt === 0.5 ? 'noon' : hour(T.eclipseAt)} on midsummer (summer's day ${T.eclipseDay}), the sun goes dark for ${n1(T.eclipseSecs)} seconds and the Tain wakes with the day: ${pct(T.eclipseCreepers)} of a night's Creepers climb in one tide while the living work. Set candles and move shades below the Veil as at night. A living person and their dead, posted in the twin of their room, work and fight ×${mult(T.eclipseTwin)} while it lasts; the living one, beside them through half of it, is at peace after. Whoever dies in the dark wakes at once. When the sun returns the Unlit burn away, and half-whole candles go back to the store.`] : []),
        ...(T.plague ? [`Summer brings plague: in a crowded keep, sickness takes one more for every ${T.plagueCrowd} living beyond the beds. Beds in Quarters, and healers, answer it.`] : []),
        ...(T.generations ? [`From the second year the keep has generations. Each spring children come of age, the young grow up, an adult grows old ${pct(T.oldChance)} of the time, and the unwed pair off; each season a couple has a child ${pct(T.birthChance)} of the time while there's room. Children don't work, and starve first. The old die in their sleep and wake Serene.`] : []),
        ...(T.siege ? [`Autumn brings a siege: unless its day-2 raid is paid off, the Host camps outside for ${T.siegeDays} days, shutting the gate (no quarrying, no one new), and on day 3 comes at it. The guards can sally out to break the camp: ${T.guardsGoOut ? 'the stronger those who go out, mustered and armed, the better the odds' : 'the better your defense against the camp, the better the odds'}, each risking ${pct(T.raidPursueRisk)}.`] : []),
      ],
    },
  ];
}
