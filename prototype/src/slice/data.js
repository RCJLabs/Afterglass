// Content and tuning for the weeks 7–10 slice: one season, day and night, in one keep.
// Distances are pixels of the keep (the pixel pass's units); times are seconds at 1x.

import { NAMES as ALL_NAMES, RAIDER_NAMES as ALL_RAIDERS } from '../data.js';

export const TICKS_PER_SEC = 10;
export const NAMES = ALL_NAMES;
export const RAIDER_NAMES = ALL_RAIDERS;

export const TUNING = {
  seasonDays: 7,
  daySecs: 60,
  nightSecs: 120,
  startFood: 12,
  startCandles: 8,
  startGlass: 4,

  // The day, from the weeks 1–2 greybox.
  eatPerDay: 1,
  hungryMult: 0.7,
  starveDays: 0.5,
  sickChance: 0.3,
  sickDays: 1.25,
  sickMult: 0.5,
  oldAgeChance: 0.06,
  newcomerEvery: 2,
  maxLiving: 12,
  griefMult: 0.8,
  peaceMult: 1.1,
  peaceDays: 3,
  twinMult: 1.25,

  // Raids escalate through the season: day → strength (before the spread).
  raidDays: { 2: 4, 4: 7, 6: 11 },
  raidSpread: 1.5,
  raidWarnAt: 0.3,
  raidHitAt: 0.6,
  raidRiskHeld: 0.18,
  raidRiskBreach: 0.3,
  raidRiskMax: 0.6,
  raidLoot: 0.3,
  // A Granary keeps half the food out of raiders' hands (round seven's audit found it didn't: every keep's food
  // was halved, Granary or not). granaryGuards 0 is that old rule, for keeps from before.
  granaryGuards: 1,
  raidInsideHeld: 0.25,
  wardGateCost: 4,
  wardGateDefense: 4,
  // Raids you fight (round five). From the warning the Host can be paid off, raidTributeFood food and
  // raidTributeCandles candles for each point of its strength: that calls the raid off, but the season's next
  // one comes raidEmbolden times as strong. Or the stores can be barred: nobody works the Hearth, the Chandlery
  // or the Glazier while the Host is at the gate, and raiders who break in carry off half as much. At raidHitAt the Host
  // strikes the gate. Each second it's stronger than your defense, the gate gives raidBreak times its excess as
  // a share of its strength; if the gate still stands after raidAssaultSecs, it falls back. Meanwhile pitch
  // (raidPitchCost candles) takes raidPitch off its strength, stone (raidShoreCost) shores the gate up by
  // raidShore, and the bell brings everyone well onto the walls, raidBellDefense each, at the cost of their work
  // and the chance of falling. If they break in and carry things off, you can go after them for raidRecover of
  // it, each guard risking raidPursueRisk. raidFight 0 is the raid as it was: one throw at noon.
  raidFight: 1,
  raidFightStrength: 1, // a Host you can fight back can be made this much stronger (README, problem 20)
  raidTributeFood: 1.5,
  raidTributeCandles: 0.5,
  raidEmbolden: 1.25,
  // Paying off the season's last raid used to cost nothing, since the season's end forgot it. Now the Host
  // remembers into the next season. emboldenCarries 0 is the old rule, for keeps from before.
  emboldenCarries: 1,
  raidAssaultSecs: 15,
  raidBreak: 1,
  raidPitch: 1.5,
  raidPitchCost: 2,
  raidShore: 0.25,
  raidShoreCost: 2,
  raidBellDefense: 0.5,
  raidBellRisk: 1.5, // the bell's hands are untrained: this much likelier than a guard to fall
  raidShare: 3, // the Host's blows are shared: with more on the walls than this, each is that much safer
  raidRecover: 0.5,
  raidPursueRisk: 0.2,
  // Round seven, phase 10: guards muster. A guard counts in full only after musterHours of the day's clock at the
  // post (a Barracks or the Gatehouse; a day is 06:00 to 18:00, so 12.5 seconds at 1× in spring, 16 in summer and
  // 9 in winter), and for that share of it before, rising as they stand there, at the gate too; whoever leaves
  // the post starts again. The Host is sighted about 3½ hours before it reaches the gate, so the gate is manned
  // while it's on the road, at the cost of the guards' work, and not at the last moment for nothing. muster 0 is
  // the old rule: a guard counts the moment they're posted.
  muster: 1,
  musterHours: 2.5,
  // Sallies and pursuit go by who goes out (guardsGoOut): a sally's odds are the guards' own strength over
  // sallyOdds times the camp's, not the whole keep's defense with the ward and the levy in it, and a pursuit
  // takes back the guards' strength over the Host's as a share of what was carried off (a tenth to nine in
  // ten), where it took back raidRecover however many went. 0 is the old rule.
  guardsGoOut: 1,
  // The Forge's day job (forgeArms): smiths make arms, a Forge's rate a day each, stored up to one for each
  // guard's post. At the gate each arm makes a guard armDefense stronger, as far as the guard has mustered, and
  // each raid at the gate breaks armsBreak of the arms in use (one at least). Smiths no longer stand at the gate
  // themselves. 0 is the old rule: a smith is 1 defense at the gate and nothing on other days. A Forge nobody
  // works is cold (coldForge), and can't catch fire; before, half of year 2's fires broke out in empty Forges.
  forgeArms: 1,
  armDefense: 1,
  armsBreak: 0.25,
  coldForge: 1,

  // The Lantern Church: a first visit on this day, announced the dawn before, then whenever Dread reaches 5.
  // Round seven, phase 10 (churchLedger): the inspector judges the Dread of every day since the Church last
  // looked (as it stood at each dusk, and at noon on the day), averaged and rounded, not the Dread at noon
  // alone, so a keep can't cover its way to a blessing the night before. 0 is the old rule.
  churchLedger: 1,
  firstInspection: 5,
  inspectAt: 0.5,

  // Dread moves each dawn by what you hold back minus what the living bear.
  dreadPerKeep: 1,
  dreadPerRestless: 1,
  dreadPerWraith: 2,
  dreadPerCrack: 1,
  dreadPerBroken: 1, // each room a Maw broke in the night haunts the keep: Dread at dawn
  // One Dread borne per this many living. 4 was tried, to make the rite bite: it made every plan finish a few
  // points fewer second seasons and showed no gain from reading traits (README, problem 8).
  dreadLivingPer: 3,
  dreadMax: 5,
  vigilCost: 3,
  bindCost: 3,
  banishCost: 5,
  restlessNights: 3,
  guidanceMax: 3,

  // The night, from the weeks 3–4 greybox, in pixels.
  candleWax: 120,
  // Round seven, phase 9: a wisp is essence burned as a pale light where a candle would go, for wispSecs (about
  // a tide), at wispCost essence. For the keep whose candles have run out and whose essence hasn't. 0 is off.
  wisp: 1,
  wispCost: 6,
  wispSecs: 40,
  // A candle that burns down at the line or where a shade is posted is lit again where it stood, from the store,
  // keeping one back, unless the Unlit are at it (round seven, phase 7). On in Gentle; any keep can turn it on
  // or off in Custom rules.
  autoRelight: 0,
  lightMax: 20,
  lightMin: 11,
  riftGap: 4,
  creeperHp: 2,
  creeperSpeed: 10,
  creeperClimb: 0.5,
  senseRange: 28,
  gnawRate: 2,
  snuffShare: 0.5,
  burnDps: 3,
  wraithHp: 6,
  wraithSpeed: 8,
  wraithDrain: 6,
  // The new moon, tuned so a first season usually survives it: the Hollow rises later, eats less light and
  // can be driven back by two good fighters, but left alone it still reaches the Veil and takes someone.
  hollowHp: 14,
  hollowSpeed: 3,
  // Round seven, phase 7: the Hollow hunts lanterns. While a shade carries one it can reach, it goes for the
  // nearest bearer rather than the mirrors, so a lantern can lead it away from the Veil, at the bearer's risk.
  // Off: leading it away (AP_LUREHOLLOW) cost 23 keeps of 120 in the first year, and nothing else uses it.
  hollowLure: 0,
  hollowReach: 10, // candles this close to the Hollow on its floor lose their wax fast
  hollowEat: 8,
  hollowDrain: 4,
  hollowCracks: 1,
  hollowAt: 0.3,
  hollowReward: 3,
  hollowRewardYear: 3, // remembrance more for driving the Hollow back, for each year of the keep after the first (phase 8)
  wardHold: 20, // seconds a ward on a stair holds the Hollow back once the store has no essence to draw on
  // While the Hollow batters a ward on a stair, the ward draws wardDraw essence a second to hold it, times as
  // much as the Hollow has grown year on year (and the campaign's Deep); Hollow-lore halves it. With the store
  // empty it holds wardHold seconds. And the store holds essenceCap at most: the Choir's singing beyond it is
  // lost. Together, essence stops piling up past the first spring, and holding the Hollow off until dawn takes
  // a good part of a full store, most of it on the Long Night. 0.25 is what warding its stair again every
  // wardHold seconds cost before, so the first year costs what it did. 0 turns either off (as before).
  wardDraw: 0.25,
  // Round seven, phase 8: on a night the Hollow walks, a ward on a stair holds only the Hollow, and the rifts'
  // Creepers and Maws climb past it. 0 is as before: a stair's ward holds everything, so the Hollow's wards at the
  // foot of the keep shut out the whole new moon's tides.
  hollowWardOnly: 1,
  // Round seven, phase 8: the Hollow held at a ward spends itself on the ward: while it batters, it eats no light
  // and drains no shade, so shades can come to it and strike it. 0 is as before.
  hollowPinned: 1,
  essenceCap: 100,
  // Maws, the round-three brutes: they walk through light to whatever is worth most for the least fight,
  // the candle holding the way up or a room where the living or the dead work, hitting any shade in their
  // way. A candle they tear down; a room they break. One lone Loyal shade can just about stop one.
  mawFrom: 3,
  mawsPerNight: 1,
  mawHp: 6,
  mawSpeed: 6,
  mawSmash: 20, // wax a second torn from a candle a Maw has reached
  mawHit: 2, // memory a second from each shade standing where a Maw is
  mawRise: 8, // seconds a Maw takes to haul itself out of its rift, when it can be hit but does nothing
  mawBreak: 12, // seconds a Maw needs in a twin room to break it: no work there tonight, the day room haunted tomorrow
  mawLine: 3, // what the candle barring the way up is worth to a Maw, against a room's workers
  // The share of their work the living manage the day after in a room a Maw broke. Below 1 it decided
  // seasons through one room, the Chandlery broken the night before the new moon, so haunting costs
  // Dread (dreadPerBroken) and the work stands.
  hauntWork: 1,
  // Round seven, phase 7: a Maw left unmet costs more the longer it's left. Having broken a room it stays on in
  // it, and if no shade stands against it for mawRuin more seconds the room is ruined: dreadPerRuin more Dread at
  // dawn, and tomorrow its workers manage ruinWork of their work. Meeting it at any point stops the ruin.
  // 0, as before: it breaks the room and moves on. Off: at 12 it cost the human plan 14 keeps of 120 in the
  // first year, and every answer the autopilot tried (a lantern to it, a fighter from the line, candles in the
  // room) cost more than the ruin (problem 50).
  mawRuin: 0,
  ruinLight: 1, // a candle in the room holds a Maw's ruin while the Maw tears it down (phase 7)
  dreadPerRuin: 1,
  ruinWork: 0.5,
  // An experiment, off: at 1, a shade in the light at the foot of a stair up to the Veil guards the line and
  // keeps the Watch, but does no other work. It made every autopilot plan worse and the doubled line no weaker
  // (README, problem 1).
  lineGuard: 0,
  shadeSpeed: 9,
  shadeClimb: 1,
  reach: 6,
  fightDps: 1,
  drainPerSec: 4,
  creepersBase: 4,
  creepersPerNight: 2.2,
  // The new moon's Creepers, as a share of a night's. Since round seven's phase 8 they climb past the Hollow's wards;
  // a full night's worth (1) cost the balanced plan 11 first years of 200 for little more to do, so it stays 0.6,
  // and they come in newMoonTides tides more than the night before's: smaller tides, more moments to meet them.
  newMoonCreepers: 0.6,
  newMoonTides: 1,
  stragglers: 0.3, // the share that come alone; the rest come in tides
  tideEvery: 3, // one more tide every this many nights
  tideSpread: 0.08, // how long a tide takes to rise, as a share of the night
  seepFrom: 3,
  seepShare: 0.3,
  // Round seven, phase 9: with a crack a tide at each mirror (crackPerTide), three break the Veil, and it
  // mends none by day (crackHeal), so a season's lost tides add up. Before, five Creepers through broke it and a
  // crack mended each dawn: one open stair at one tide emptied the meter.
  cracksMax: 3,
  crackHeal: 0, // cracks the Veil mends each dawn
  // Round seven, phase 9: a mirror cracks once for each tide that reaches it, and the rest of that tide through
  // it give the living nightmares the next day (nightmareMult). 0 is as before: every Creeper through a crack.
  crackPerTide: 1,
  // Round seven, phase 9: the Veil strains, in the log and a toast, when a stair of the line will be dark as the
  // next tide comes up it, from strainLead seconds before it rises; a candle lasting strainGrace seconds past the
  // tide's mark is let be. 0 is off.
  veilStrains: 1,
  winterNeed: 1, // from autumn, what winter will take in candles beyond what the keep makes, in the Day panel
  strainLead: 20,
  strainGrace: 15,
  wardCost: 5,
  // Night jobs, per second, for a lit shade standing at its post.
  essencePerSec: 0.06,
  glassPerSec: 0.03,
  wickPerSec: 0.012,
  guidePerSec: 0.012,
  fadePerNight: 10,
  restShare: 0.5,
  nameCost: 3,
  rememberCost: 1,
  rememberGain: 15,

  // A second season is harder: raid strength, Creeper counts and the Hollow's strength multiply by this per
  // season, and a Maw's strength by mawHardness. At 1.35 the autopilot finished about a third of its second
  // seasons; at 1.2 it finishes about two thirds. Maws stay as they were: a stronger Maw hurts a player who
  // answers it more than one who stacks the line, which is backwards.
  hardness: 1.2,
  mawHardness: 1,
  // With the year on, hardness compounds through a year's seasons, and each year after the first starts
  // yearHardness times harder than the one before, rather than carrying on from its winter: compounding a
  // season at a time, the second winter came at 3.6 times the first spring and no autopilot plan won it
  // (README, problem 29). 0 compounds a season at a time into every year, as before. At 1.3 every keep
  // fell by the fifth winter; at 1.06 about half the balanced plan's keeps see a fifth year and a quarter a
  // tenth, falling a few a year from the third on, nearly all at a Long Night (problem 43).
  yearHardness: 1.06,

  // Building. A season starts with startFloors floors of the original keep, counted from the ground: at 1,
  // only the Hearth and the Crypt stand, and whoever has no room to work in quarries stone in the Yard.
  // A room costs roomStone and goes on top of the keep, or into any bare hall you choose (round five). Each
  // room holds roomCap workers, so a job needs another room of its kind to grow. Tearing one down leaves a
  // bare hall and gives back teardownBack of its stone; moving one swaps it with another room or hall, for
  // moveStone. Grave-steel from the Cold Forge makes every shade fight steelFight times harder the next night.
  startFloors: 1,
  startStone: 8,
  roomStone: 6,
  floorStone: 0, // a new floor on top costs this much more than a bare hall: its walls and its stair
  roomCap: 3,
  teardownBack: 0.5,
  moveStone: 2,
  steelFight: 1.25,

  // Traits (1 on, 0 off): everyone has one, and death turns it over (TRAITS below).
  traits: 1,

  // The Unlit take any dark way up, however long, and gnaw only a light that bars every way (1 on, 0 off).
  // Off, they gnaw the first light on their shortest way, so a room lit below the line took a whole tide.
  goAround: 1,
  // Round seven, phase 7: a tide goes for the thinner stair. A Creeper climbing with a tide rises at the rift on
  // the side whose stair of the line has the least fight standing in its light when it rises, so a line held
  // thick in one place draws the tide to the other, and a fighter sent after it has risen counts where it
  // stands. 0: each rises at its own rift.
  thinStair: 1,

  // Breaking a mirror, an emergency open at any time: everyone in it is freed at once, Dread falls by
  // breakDread for each, and the next badLuckDays days are unlucky: sickness comes badLuck times as often.
  breakDread: 1,
  badLuckDays: 7,
  badLuck: 2, // also makes fire that much likelier

  // Fire by day (1 on, 0 off; keeps from before it play on without it). On fireChance of days a Hearth or a
  // Forge catches fire at some hour, at fireStart heat. The heat grows fireGrow a second and everyone in the
  // room fights it, fireFight each; masons sent from the Yard join them, or everyone, when the bell rings.
  // Each fighter may die, fireDeath a second times the heat squared; at full heat, every fireSpread seconds it
  // catches a room beside it. A fire still burning at dusk scorches its room: nobody works there the next day.
  fire: 1,
  fireChance: 0.3,
  fireStart: 0.25,
  fireGrow: 0.1,
  fireFight: 0.04,
  fireDeath: 0.02,
  fireSpread: 10,

  // Quarters, the Dreamwell and Weepers (1 on, 0 off; keeps from before them play on without crowding or
  // Weepers). The keep sleeps baseBeds and each Quarters quartersBeds more; with more living than beds,
  // sickness comes crowdSick times as often. A shade who dreams in the Dreamwell through half the night rests
  // the living: dreamWork better the next day. The night after a death, a Weeper for each of the day's dead
  // (up to weepersMax) seeps into the sleepers' twin (the Dreamwell, or the Cold Hearth in a keep without
  // Quarters) wherever it's dark. A Weeper that weeps nightmareSecs there gives one of the living a
  // nightmare (they work at nightmareMult the next day) and sinks away. Light keeps Weepers out and burns
  // them, and a Keening shade on their floor sings them quiet.
  dreamwell: 1,
  baseBeds: 8,
  quartersBeds: 4,
  crowdSick: 1.5,
  dreamWork: 1.1,
  weepersMax: 3,
  weeperHp: 1.5,
  weeperSpeed: 5,
  nightmareSecs: 15,
  nightmareMult: 0.6,

  // Whispers and the great glass (round three: a bound shade behind an uncovered mirror coaches whoever works
  // that room, and a great glass's shades can step through by day and help in person). By day a shade can
  // whisper its old trade to whoever works it now: they work whisperMult better. A shade in a great glass
  // can instead step through and work a room in person, as one worker at its night strength (perf) times
  // stepWork. Either tires it: at dusk it loses whisperFade or stepFade memory, on top of the night's
  // fading (halved for the named, and as its trait fades), and a whisper costs nothing on a day nobody
  // worked its trade.
  whispers: 1,
  whisperMult: 1.25,
  whisperFade: 8,
  stepWork: 1,
  stepFade: 8,

  // A year (round three): four seasons of seven days, from spring. Days lengthen into summer and shorten into
  // winter, and nights the other way: each season multiplies daySecs by its seasonDay and nightSecs by its
  // seasonNight, and what the living make in a day by its seasonDay too, so summer builds and winter lives
  // on what's put by. Winter's seventh night is the Long Night, which ends the year: longNight times as long
  // as a winter night, with the Hollow, a Maw and longNightCreepers times a night's Creepers. year 0 plays
  // every season as spring.
  year: 1,
  seasonDay: [1, 1.3, 1, 0.7],
  seasonNight: [1, 0.75, 1, 1.35],
  longNight: 1.5,
  // Round seven, phase 8: 1 before, when the Hollow's wards at the foot shut the Long Night's Creepers out; now
  // they climb past, and four in ten as many come. greatTide of them are held back for the last great tide, which
  // rises at greatTideAt of the night, the other tides all before it (0 as before: none). Later in the night it
  // cost more: at 0.85, 9 of the balanced plan's 200 first years against 0.55.
  longNightCreepers: 0.4,
  greatTide: 0.4,
  greatTideAt: 0.55,

  // Each season its own trouble (round five). Summer's plague: when sickness comes to a crowded keep, it
  // takes one more for every plagueCrowd living beyond the beds. Autumn's siege: unless its day-2 raid was
  // paid off, the Host camps outside the walls for siegeDays days from the next morning. The gate is shut:
  // nobody quarries in the Yard and no one new can come, and on a day with no raid of its own the camp
  // assaults the gate at siegeStrength times the day-2 raid. The guards can sally out to break the camp:
  // the chance is their defense over sallyOdds times the camp's strength (a tenth to nine in ten), and each
  // risks raidPursueRisk. plague 0 and siege 0 are the year as it was.
  // The dead ask for things (round five; round three's Court of Shades). From its askAfter-th night a shade in
  // the glass asks one thing at the rite (REQUESTS below), and again askEvery nights after a refusal; a Serene
  // one asks to go only once its memory falls below askFade. Granted, it never asks again; refused `refusals`
  // times, it turns Restless and leaves its mirror. A Loyal shade granted the gate guards it the next day at
  // its night fight, for gateFade memory at dusk. requests 0 is the rite as it was.
  requests: 1,
  askAfter: 2,
  askEvery: 3,
  askFade: 40,
  refusals: 2,
  gateFade: 8,

  // An ending to the year (round five): after the Long Night, seal the Veil (every shade goes free, and the
  // keep's story ends), keep the watch into a harder year, or take your own place in the glass: the keeper
  // wakes as a shade, Loyal, named and Anchored, who weighs keeperDread times a shade at every rite.
  keeperDread: 2,

  plague: 1,
  plagueCrowd: 2,
  siege: 1,
  siegeDays: 2,
  siegeStrength: 0.6,
  sallyOdds: 1.5,

  // Weather (round five). Each day, and the night after it, is clear, rainy or foggy, and it's rolled a day
  // ahead, so tomorrow's is always known: rain on rainChance of days in each season (spring to winter), fog on
  // fogChance. Rain slows the Yard to rainYard, and damps fire: a fire is rainFire times as likely and grows
  // rainFire times as fast. Fog clouds the black mirror: at dusk it shows how many come and when, not their
  // ways. On a rainy night the Drowned rise out of the moat's twin, at one end of the floor under the Veil
  // (known at dusk): drownedBase of them, one more every drownedEvery nights, at any hour, but none on the new
  // moon, which belongs to the Hollow (as for the Maws, the Long Night has them too). They never take a stair:
  // they make for the mirrors on that floor from behind the line, and one that reaches a mirror cracks the
  // Veil. Light bars them and burns them at drownedBurn of a Creeper's rate; they gnaw it, drownedGnaw times
  // as fast. A shade they catch in the dark is drained as a Creeper drains it and dragged drownedDrag a second
  // toward the moat; if it gets there it's pulled under and gone. A ward on the moat keeps them under.
  // weather 0 is every day clear.
  weather: 1,
  // The weather, the Drowned and generations roll from streams of their own (round six's balance pass), so a
  // keep with them and without meets the same raids and Unlit until they change something. 0 rolls them from
  // the keep's own stream, as a keep made before did, so its export still replays.
  ownStreams: 1,
  streamHash: 1, // those streams' seeds mixed in whole (sim.js, sideStream); 0 is the first hash, a keep made before
  rainChance: [0.3, 0.15, 0.3, 0.05],
  fogChance: [0.1, 0.05, 0.25, 0.3],
  rainYard: 0.75,
  rainFire: 0.5,
  drownedBase: 1,
  drownedEvery: 4,
  drownedHp: 3,
  drownedSpeed: 5,
  drownedGnaw: 2,
  drownedBurn: 0.5,
  drownedDrag: 2,

  // Down into the Deep (round five). At dusk a shade can go down past the rifts instead of taking a post, to
  // one of three depths. It's gone for the night: it holds no light, fights nothing and works nothing. At
  // dawn it comes back with deepSilver quicksilver for its depth, unless something down there caught it
  // (deepCatch for its depth, half as often for a Lurker): then it comes back empty-handed and drained by
  // deepDrain, or not at all. Not on the new moon: the Hollow is down there. Quicksilver upgrades a mirror
  // where it hangs, its shades and all: a hand mirror into a pier glass, a pier glass into a great glass,
  // for upgradeSilver quicksilver and upgradeGlass glass. deep 0 is the keep without it.
  deep: 1,
  deepSilver: [1, 3, 6],
  deepCatch: [0.1, 0.25, 0.45],
  deepDrain: 35,
  upgradeSilver: { pier: 3, great: 6 },
  upgradeGlass: { pier: 4, great: 8 },

  // Generations (round five; round three's aging and children). From the second year, with the year on:
  // each spring the living age (a child comes of age and can work, the young grow up, and each adult grows
  // old with oldChance), and the unwed of an age pair off as spouses with pairChance. Each season, two
  // living spouses, neither old, have a child with birthChance while the keep has room (maxLiving).
  // Children don't work, answer no bell, shelter inside from a breach and starve first; they eat and sleep
  // like anyone. The old still die in their sleep, and wake Serene. generations 0 is the keep without it.
  generations: 1,
  oldChance: 0.3,
  pairChance: 0.4,
  birthChance: 0.35,

  // The Lantern Church's escalation (round five; round three's embargo and inquisition), for a keep whose
  // Dread stays high. A censure brings a silver embargo for embargoDays: the Glazier makes no glass, and no
  // mirror can be built or upgraded. A blessing lifts it, and so does a donation of donation remembrance. A
  // censure while the embargo stands brings the Inquisition: an inspection every day at noon for
  // inquisitionDays, the embargo standing with it, unless a blessing sends the inquisitor away sooner; each
  // censure starts its days over. church 0 is a censure alone, as before.
  church: 1,
  embargoDays: 5,
  inquisitionDays: 3,
  donation: 6,
  // The crusade, round three's last step. Censured while the Inquisition stands, the keep is given up to a
  // crusade that comes to the gate at noon crusadeDays later, at strength crusadeBase (a raid's base, so harder
  // each season), and is fought as a raid, though it takes no tribute and wants none of the stores. The
  // inquisitor inspects each noon until then, and a blessing calls it off. Held at the gate, the Church gives
  // up: the embargo and the Inquisition end. Broken in, the crusaders smash every mirror they can find and the
  // shades in them go free. A mirror hidden before the day it comes can't be found, but its shades sit out
  // every day and night until the crusade is over. crusade 0 is the Inquisition starting its days over.
  crusade: 1,
  crusadeDays: 2,
  crusadeBase: 13,

  // Shade acts (round six): each working kind has one act a night, paid in its own memory (half for the
  // named, and bent by a trait that changes fading, as whispering is). Stand: for its seconds, the light it
  // stands in can't be gnawed, smashed or eaten, and it strikes standFight times as hard. Kindle: adds
  // kindleWax of a candle to the one it stands in, or lights that much of one at its feet in the dark, free.
  // Pass unseen: for its seconds the Unlit pass it by, and it slips any grip. Lure: for its seconds the
  // Unlit on its floor within lureReach come for it, into its light if it stands in one. acts 0 is none.
  acts: 1,
  actCost: { stand: 10, kindle: 15, pass: 8, lure: 12 },
  kindleWax: 1,
  actSecs: { stand: 10, pass: 15, lure: 8 },
  standFight: 2,
  lureReach: 40,

  // Lanterns (round six): a shade can carry light. Lighting one takes a candle from the store; it burns
  // lanternWax seconds at a candle's light, moving with the shade. Set down, it stays where it is, as a
  // candle. lanterns 0 is none.
  lanterns: 1,
  lanternWax: 60,
  // Round seven, phase 7: what a lantern takes from the store, in candles (half the light, half the price).
  lanternCost: 0.5,
  // Errands (round six): from night errandFrom, one or two things turn up in the dark rooms below the line
  // each night, shown by the black mirror at dusk: an echo (echoMemory to the shade that reaches it) or a
  // relic (relicGlass glass). From night sleepFrom, on sleepChance of nights, a sleepwalker: one of the
  // living wanders into the Tain from the sleepers' twin at some hour and makes for a rift at sleepSpeed. A
  // shade that reaches them walks them back to bed, and light wakes them. The Unlit that catch them in the
  // dark hold them; held sleepHold seconds in all, or at the rift, they die in their sleep and wake Pale.
  // errands 0 is none.
  errands: 1,
  errandFrom: 2,
  echoMemory: 20,
  relicGlass: 3,
  sleepFrom: 3,
  sleepChance: 0.2,
  sleepSpeed: 1.2,
  sleepHold: 8,
  // Omens (round six): from night omenFrom, on omenChance of nights (not the tutorial's, the new moon's or the
  // Long Night's), the black mirror shows an omen at dusk that changes the night's shape; on omenChoice of
  // them it shows two, and the keeper picks one (unpicked, the first comes). What each does is omenText in
  // sim.js; the numbers are these. omens 0 is none.
  omens: 1,
  omenFrom: 2,
  omenChance: 0.5,
  omenChoice: 0.4,
  huntEssence: 3, // the Hunt: essence for each Maw cut down
  bloodMore: 0.33, // a blood moon: this many more Creepers, as a share of the night's
  bloodEssence: 1, // ... and essence for each one cut down
  stillBurn: 0.75, // still air: candles burn at this rate
  stillGnaw: 2, // ... and the Unlit gnaw them this many times as hard
  thinChoir: 2, // a thin Veil: the Choir sings this many times as loud; the first tide seeps
  // Visitors at the gate (round six): on visitorChance of days one comes (a second on visitorSecond of those),
  // not on the tutorial's days, a siege's or a crusade's. Each waits visitorWait of the day for an answer;
  // unanswered, the last answer is taken. Who can come, and what each answer does, are VISITORS below and
  // sim.js. visitors 0 is none.
  visitors: 1,
  visitorChance: 0.5,
  visitorSecond: 0.2,
  visitorWait: 0.25,
  // Round seven, phase 4: a keep's first season meets its visitors from this day, so its first days are only
  // the keep, the Host and the night. 1 is from the first day, as keeps from before.
  visitFrom: 3,
  // Round seven, phase 10 (payInKind): a visitor who wants food for something the keep could pay for another
  // way also takes glass or remembrance, which pile up where food runs short (an answer with this rule). 0 as
  // before: food only.
  payInKind: 1,
  charmBurn: 0.75, // the hedge-witch's charm: tonight's candles burn at this rate
  // The Library, the Hall and the Gatehouse (round six). library: scholars make lore by day toward one of the
  // STUDIES at a time, begun with remembrance; a lit shade in its twin, the Archive of the Dead, adds
  // lorePerSec of its work by night. hall: one standing decree a season (DECREES); a shade seated in its twin,
  // the Court of Shades, through half the night has one request heard free at the next rite. gatehouse: gate
  // guards (DAY_ROOMS), only on the ground floor, where the gate is. From season laddersFrom the Host
  // brings a ladder every ladderEvery seconds at the gate, each standing one adding ladderHost, unless a gate
  // guard is on the Gatehouse's walls to throw them down; from season undergateFrom its twin, the Undergate,
  // under the Veil, stirs on undergateChance of nights, and undergatePerTide of each tide come up it then,
  // unless a candle burns at its mouth or it's warded. 0 is none of that room (for gatehouse, nor the ladders).
  library: 1,
  lorePerSec: 0.01,
  hall: 1,
  // Round seven, phase 4: the Library and the Hall can be built from this season of the keep (2 is summer), so the
  // first spring holds only the rooms it needs. 1 is from the start, as keeps from before.
  lateRoomsFrom: 2,
  gatehouse: 1,
  laddersFrom: 2,
  ladderEvery: 4,
  ladderHost: 0.5,
  undergateFrom: 2,
  undergateChance: 0.25,
  undergatePerTide: 1,

  // The eclipse (round six; round three's set piece). With the year on, once a year, on summer's day
  // eclipseDay, the sun goes dark at eclipseAt of the day for eclipseSecs, and the Tain wakes while the day goes
  // on: the living at work and the day's raid at the gate while the Unlit climb. The shades stand at their
  // posts as at night, with candles, wards, moves and acts as at night; eclipseCreepers times the night's
  // Creepers come up the rifts in one tide, eclipseTide of the way in (no Maws, no Hollow, no Weepers, no
  // Drowned, nothing up the Undergate). A living person and their dead, the shade posted in the twin of the
  // living one's room, work and fight eclipseTwin times over (not twinMult), and one who stood beside their
  // dead through half of it is at peace after. Anyone who dies during it wakes at once, with no funeral. When
  // the sun comes back the Unlit left in the Tain burn away, candles still half whole go back to the store,
  // and its cracks in the Veil count at the next rite with the night's. 0 is the year without it.
  eclipse: 1,
  eclipseDay: 4,
  eclipseAt: 0.5,
  eclipseSecs: 30,
  eclipseCreepers: 0.5,
  eclipseTide: 0.3,
  eclipseTwin: 2,

  // A campaign (round six; round three's five years). A keep made a campaign plays five years as five
  // chapters (CHAPTERS), then plays on with no more chapters. Each chapter brings its pressure: the Host's siege and
  // ladders, with the Gatehouse and its Undergate, from year 2; the Church's embargo, Inquisition and crusade
  // after a censure from year 3; from year 4 the Hollow hollowRises times as hard to drive back and as hungry
  // for light, and hollowRises times the new moon's Creepers. Each sets a goal worth goalReward remembrance,
  // and years 1 to 4 end with a closing choice for the next; year 5 with round three's three endings. Its
  // five years harden by campaignHardness, not yearHardness, and the years after its ending by yearHardness, as
  // the open year's do (problem 43). 0 is the open year.
  campaign: 0,
  campaignHardness: 1.1,
  hollowRises: 1.5,
  goalReward: 3,
};


export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// The campaign's five chapters (round six; round three's plan): each year's name, what's new in it, its goal,
// and how it closes: a choice of two for the next year, or, after the fifth, one of three endings.
export const CHAPTERS = {
  1: {
    name: 'The First Winter',
    text: 'Learn the round of day and night, and live through the long nights of winter on the candles you put by.',
    goal: { id: 'candles', n: 20, text: 'go into winter with 20 candles put by' },
    close: [
      { id: 'walls', name: 'Raise the walls', text: 'the Host meets 2 more defense at every raid next year' },
      { id: 'stores', name: 'Lay in stores', text: '20 food and 10 candles now', gain: { food: 20, candles: 10 } },
    ],
  },
  2: {
    name: 'The Ashen Host',
    text: "The Host has taken the keep's measure. Its raids bring ladders now, and in autumn it lays siege. A Gatehouse can be raised to meet it.",
    goal: { id: 'gate', text: 'hold the gate against every raid this year' },
    close: [
      { id: 'tithe', name: 'Tithe to the Church', text: 'Dread −2 now, and the Church forgives the first censure next year' },
      { id: 'silver', name: 'Keep the silver', text: '12 glass now', gain: { glass: 12 } },
    ],
  },
  3: {
    name: 'The Lantern Church',
    text: 'The Church judges the keep more sternly now: a censure brings its embargo, then its Inquisition, and at last its crusade.',
    goal: { id: 'church', text: 'come through every inspection this year without a censure' },
    close: [
      { id: 'steel', name: 'Arm the dead', text: 'grave-steel every night of the new moon next year: every shade fights harder' },
      { id: 'wax', name: 'Stock the Chandlery', text: '15 candles now', gain: { candles: 15 } },
    ],
  },
  4: {
    name: 'The Deep Rises',
    text: 'The Hollow grows: it is half again as hard to drive back and eats the light as fast again, and the nights of the new moon bring half again as many Creepers.',
    goal: { id: 'hollow', n: 1, text: 'drive the Hollow back on one of its nights this year' },
    close: [
      { id: 'kin', name: 'Bind the household', text: 'everyone living at peace for seven days, their grief over' },
      { id: 'debts', name: "Call in the keep's debts", text: '4 remembrance and 20 food now', gain: { remembrance: 4, food: 20 } },
    ],
  },
  5: {
    name: 'The Long Night',
    text: "The last year of the watch. At its end comes the last Long Night, and a choice of how the keep's story ends.",
    goal: { id: 'end', text: 'come through the last Long Night' },
  },
};
// Round three's three endings, after the campaign's fifth year.
export const ENDINGS = {
  seal: { name: 'Seal the Veil', text: 'Every shade goes free. The Tain closes, and the living go on alone. The story ends.' },
  open: { name: 'Open the Veil', text: 'The living and the dead share both realms, and the keep becomes a crossing. The story ends.' },
  watch: { name: 'Keep the watch', text: 'You die and rule the Tain as its warden, and a new keeper goes on: play continues, with no more chapters.' },
};

// Difficulty presets (round five): named sets of the Settings numbers, chosen for a new keep. A keep keeps
// the numbers it was made with: a newer build moves the rest of its numbers to its own, not these.
// Each year grows as Standard's does (yearHardness): Gentle's and Hard's own rates, ×1.15 and ×1.2, were set
// against Standard's ×1.3, and would now grow faster than it (problem 43).
export const PRESETS = {
  gentle: {
    name: 'Gentle',
    text: 'Four cracks break the Veil, not three, and it mends one each dawn. Fewer Creepers, weaker raids, more food and candles to start, a candle that burns down at the line or a post lit again from the store, and each season only a little harder than the last.',
    tuning: { cracksMax: 4, crackHeal: 1, creepersPerNight: 1.8, raidFightStrength: 0.85, startFood: 18, startCandles: 12, hardness: 1.1, autoRelight: 1 },
  },
  standard: { name: 'Standard', text: 'The game as it is meant to be played: three cracks break the Veil, a tide at a mirror a crack, and each season asks a little more of the keep than the last.', tuning: {} },
  hard: {
    name: 'Hard',
    text: 'Three cracks break the Veil, as in Standard. More Creepers, stronger raids and fewer candles to start: harder from the first night, and growing through a year and from one year to the next as Standard does.',
    tuning: { creepersPerNight: 2.6, raidFightStrength: 1.15, startCandles: 6, hardness: 1.2 },
  },
};

// What each kind of shade asks at the rite (TUNING.requests): what granting does, and its words.
export const REQUESTS = {
  serene: { kind: 'release', ask: 'Let me go while I still remember.', grant: 'Cover its mirror today: it rests', fading: true },
  loyal: { kind: 'gate', ask: 'Let me stand at the gate tomorrow.', grant: 'It guards the gate by day, for memory at dusk' },
  stranger: { kind: 'name', ask: 'Give me a name to keep.', grant: 'Name it' },
  pale: { kind: 'remember', ask: 'Remember me, before I fade.', grant: 'Remember it' },
};

// The tutorial keep (round five): an ordinary keep whose first three days and nights go by a script, so each
// lesson comes in its order. By day the script's events stand in for the day's rolls: no sickness and no
// other deaths. A raid's strength is exact, nobody falls on the walls, and one raider always falls inside;
// the fire kills no one. By night, this many Creepers come in this many tides (shares of stragglers, candle
// hunters and seepers as given, else the usual), no Weepers where it says so, and a Maw at maw times its
// strength. Before night safeUntil the Veil can't break (it holds at one crack short) and Dread stops one short
// of bringing the Church. Maud, an old servant, joins the cast to die at noon on day 1. Its tuning carries
// tutorial: 1, so it replays.
export const TUTORIAL = {
  seed: 20260927,
  servant: { name: 'Maud', age: 'old', trait: 'stubborn' },
  days: {
    1: { events: [{ at: 0.5, type: 'oldage', who: 'Maud' }] },
    2: { raid: 5, events: [{ at: 0.15, type: 'fire', room: 'hearth' }] },
    3: { events: [{ at: 0.12, type: 'notice' }] },
  },
  nights: {
    1: { creepers: 3, tides: 1, stragglers: 0, snuff: 0, seep: 0, weepers: 0 },
    2: { creepers: 6, tides: 1, seep: 0 },
    3: { creepers: 8, tides: 2, seep: 0, maw: 0.5 },
  },
  safeUntil: 4,
};

// Traits, from round three: each of the living has one, which helps or hinders at a job, and death turns it
// over into what the shade does at night. Some change what keeping the shade costs at the rite. Costs that
// fell on the gate or the larder cost too many raids (held 75% against 92% without traits), so Gentle's and
// Greedy's are elsewhere.
export const TRAITS = {
  brave: { name: 'Brave', dead: 'reckless', short: 'guards ×1.5; falls at the gate twice as often', guard: 1.5, fall: 2 },
  coward: { name: 'Coward', dead: 'lurker', short: 'guards ×0.5; never falls at the gate', guard: 0.5, fall: 0 },
  devout: { name: 'Devout', dead: 'bitter', short: '×1.5 in the Chapel, ×0.8 elsewhere', jobs: { chapel: 1.5 }, other: 0.8 },
  diligent: { name: 'Diligent', dead: 'tireless', short: '×1.15 at any job', any: 1.15 },
  gentle: { name: 'Gentle', dead: 'keening', short: '×1.5 healing; grieves harder (×0.6)', jobs: { infirmary: 1.5 }, grief: 0.6 },
  greedy: { name: 'Greedy', dead: 'hoarding', short: '×1.25 at the Glazier or Chandlery, ×0.8 elsewhere', jobs: { glazier: 1.25, chandlery: 1.25 }, other: 0.8 },
  stubborn: { name: 'Stubborn', dead: 'anchored', short: 'sickness kills half as fast', sick: 2 },
  cheerful: { name: 'Cheerful', dead: 'wistful', short: 'never grieves', grieves: false },
};
export const TRAIT_KEYS = Object.keys(TRAITS);
export const SHADE_TRAITS = {
  reckless: { name: 'Reckless', short: 'fights ×2 and lunges further, but fades twice as fast', fight: 2, reach: 5, fade: 2, drain: 2 },
  lurker: { name: 'Lurker', short: 'never caught by Creepers or Wraiths, and half as often in the Deep; fights ×0.25', fight: 0.25, unseen: true },
  bitter: { name: 'Bitter', short: '3 Dread to keep; while it stays, wards cost a fifth', dread: 3, wards: 0.2 },
  tireless: { name: 'Tireless', short: 'works ×1.6, but never rests or works as a twin', work: 1.6, rests: false, twins: false },
  keening: { name: 'Keening', short: 'calms two Restless shades a night, and quiets Weepers on its floor', calms: 2, hushes: true },
  hoarding: { name: 'Hoarding', short: '×2 essence in the Choir, but pockets 2 candles a dusk while the store holds more than 4', essence: 2, pockets: 2, spares: 4 },
  anchored: { name: 'Anchored', short: 'fades half as fast', fade: 0.5 },
  wistful: { name: 'Wistful', short: 'resting or dreaming the night through, it sends good dreams: the living work ×1.15 the next day', dreams: 1.15 },
};

// Day rooms. out is what a worker makes each day at full strength.
export const DAY_ROOMS = {
  chapel: { name: 'Chapel', out: 'remembrance', rate: 1, role: 'priest', job: (R) => `Priests: ${R.rate} remembrance a day and one funeral a day each.` },
  glazier: { name: 'Glazier', out: 'glass', rate: 2, role: 'glazier', job: (R) => `Glaziers: ${R.rate} glass a day each. Glass builds mirrors.` },
  chandlery: { name: 'Chandlery', out: 'candles', rate: 3, role: 'chandler', job: (R) => `Chandlers: ${R.rate} candles a day each, for the night.` },
  infirmary: { name: 'Infirmary', out: 'healing', rate: 1, role: 'healer', job: (R) => `Healers: each cures ${R.rate} sick person a day.` },
  barracks: { name: 'Barracks', out: 'defense', rate: 2, role: 'guard', job: (R) => `Guards: ${R.rate} defense each against raids.` },
  granary: { name: 'Granary', out: null, job: () => 'Stores. Raiders who break in take half as much food.' },
  hearth: { name: 'Hearth', out: 'food', rate: 4, role: 'cook', job: (R) => `Cooks: ${R.rate} food a day each.` },
  crypt: { name: 'Crypt', out: null, job: () => "The day's dead wait here for dusk." },
  // Built rooms and the Yard.
  forge: { name: 'Forge', out: 'defense', rate: 1, role: 'smith', job: (R, T) => (T?.forgeArms ? `Smiths: ${R.rate} arm a day each, kept up to one for each guard's post. At the gate an arm makes a guard ${T.armDefense} stronger.` : `Smiths: ${R.rate} defense each, arming the guards.`) },
  cellar: { name: 'Cellar', out: null, job: () => 'Stores. Raiders who break in take half as many candles and half as much glass.' },
  quarters: { name: 'Quarters', out: null, beds: 4, job: () => 'Beds for four. With too few beds the living sleep crowded, and sickness comes more often.' },
  // Round six's three.
  library: { name: 'Library', out: 'lore', rate: 1, role: 'scholar', job: (R) => `Scholars: ${R.rate} lore a day each, toward what the Library is studying.` },
  hall: { name: 'Hall', out: null, job: () => 'Decrees: one standing decree a season, proclaimed from here.' },
  gatehouse: { name: 'Gatehouse', out: 'defense', rate: 3, role: 'gate guard', job: (R) => `Gate guards: ${R.rate} defense each against raids, and from summer, with one on its walls, every ladder the Host sets up is thrown down. It stands at the gate, on the ground floor: move a room up to make it room.` },
  empty: { name: 'Bare hall', out: null, job: () => 'Unfinished stone. The next room built goes here.' },
  yard: { name: 'Yard', out: 'stone', rate: 2, role: 'mason', outdoors: true, job: (R) => `Masons: ${R.rate} stone a day each, to build with. The Yard holds any number.` },
};
// What can be built on top of the keep, in the order the build list shows them.
export const BUILDABLE = ['barracks', 'chandlery', 'hearth', 'forge', 'cellar', 'chapel', 'glazier', 'infirmary', 'granary', 'quarters', 'library', 'hall', 'gatehouse'];
export const WORK_ROOMS = Object.keys(DAY_ROOMS).filter((k) => DAY_ROOMS[k].out);

// Each room's twin in the Tain, and what a lit shade standing there does.
export const TWINS = {
  chapel: { name: 'Choir of Echoes', job: 'essence', note: 'Singing makes essence and calms one Restless shade.' },
  glazier: { name: 'Silvering', job: 'glass', note: 'Silvers glass for mirrors.' },
  chandlery: { name: 'Wick Room', job: 'wick', note: 'Saves wax: candles for the next dusk.' },
  infirmary: { name: 'Threshold', job: 'guidance', note: "Readies guided deaths: tomorrow's sick wake one kind better." },
  barracks: { name: 'Watch of the Dead', job: 'watch', note: "Its strength adds to tomorrow's defense." },
  granary: { name: 'Hollow Granary', job: null, note: 'Empty and dark: a weak spot.' },
  hearth: { name: 'Cold Hearth', job: 'rest', note: 'Resting here halves the night’s fading.' },
  crypt: { name: 'Waking Room', job: null, note: 'Where the dead wake.' },
  forge: { name: 'Cold Forge', job: 'steel', note: 'Grave-steel: a shade who forges through half the night arms every shade the next night.' },
  cellar: { name: 'Hollow Cellar', job: null, note: 'Empty and dark: a weak spot.' },
  quarters: { name: 'Dreamwell', job: 'dreams', note: 'Dreams: a shade who dreams here through half the night rests the living for the day after. Weepers come here for the sleepers above.' },
  library: { name: 'Archive of the Dead', job: 'lore', note: 'Old knowledge: a lit shade here reads for the Library, and speeds what it studies.' },
  hall: { name: 'Court of Shades', job: 'court', note: "The dead's requests: a shade seated here through half the night hears one, and at the next rite it's answered free." },
  gatehouse: { name: 'Undergate', job: null, note: 'The gate that faces the Deep, under the Veil, behind the line. From summer it stirs on some nights, and then one Creeper of every tide comes up here instead of at a rift, unless a candle burns at its mouth or it is warded.' },
  empty: { name: 'Hollow Hall', job: null, note: 'Bare and dark: a weak spot until something is built.' },
};

// The original keep, top to bottom in its upright (day) layout. The Tain is the same rooms reflected under
// the Veil, so floor 0 (Chapel and Glazier by day) is the Tain's deepest floor, where the rifts open, and
// the last floor (Hearth and Crypt) sits right under the Veil, where the mirrors hang. A season starts
// with the lowest startFloors of these; building adds floors on top (geo.js builds each keep's geometry).
export const MAP = {
  W: 112,
  VEIL: 114,
  ROOM_H: 20,
  LEFT: 6,
  RIGHT: 106,
  floors: [
    { y: 24, rooms: [['chapel', 6, 54], ['glazier', 58, 106]] },
    { y: 46, rooms: [['chandlery', 6, 54], ['infirmary', 58, 106]] },
    { y: 68, rooms: [['barracks', 6, 54], ['granary', 58, 106]] },
    { y: 90, rooms: [['hearth', 6, 54], ['crypt', 58, 106]] },
  ],
  // Each stair joins floor f to floor f + 1 at x: two per pair of floors, so no single choke holds.
  stairs: [
    { id: 's1', f: 0, x: 24 },
    { id: 's2', f: 0, x: 88 },
    { id: 's3', f: 1, x: 40 },
    { id: 's4', f: 1, x: 72 },
    { id: 's5', f: 2, x: 16 },
    { id: 's6', f: 2, x: 96 },
  ],
  rifts: [
    { id: 'r1', x: 12 },
    { id: 'r2', x: 100 },
  ],
  mirrors: [
    { id: 'm1', x: 30 },
    { id: 'm2', x: 82 },
  ],
  // The moat's twin: where the Drowned come up on a rainy night, at the two ends of the floor under the Veil.
  // One ward (id 'moat') keeps them under.
  moat: [
    { id: 'w1', x: 8 },
    { id: 'w2', x: 104 },
  ],
};

export const KINDS = {
  loyal: { name: 'Loyal', work: 1, fight: 1.5, speed: 1, desc: 'Died on duty. Fights hardest.' },
  serene: { name: 'Serene', work: 1.5, fight: 0.8, speed: 0.9, desc: 'Died of old age. Works best.' },
  pale: { name: 'Pale', work: 0.6, fight: 0.6, speed: 0.9, desc: 'Died of sickness. Weak at everything.' },
  stranger: { name: 'Stranger', work: 0.8, fight: 1.2, speed: 1.1, desc: 'A raider who fell inside the walls. No bonds.' },
  restless: { name: 'Restless', work: 0, fight: 0, speed: 0, desc: 'No mirror to hold it. Turns Wraith after three nights unless released.' },
  wraith: { name: 'Wraith', work: 0, fight: 0, speed: 0, desc: 'Your own dead gone wrong. Hunts inside the Tain every night until banished.' },
};
export const WORKING = ['loyal', 'serene', 'pale', 'stranger'];
// Each working kind's one act a night (TUNING.acts), by name; what each does is actText in sim.js.
export const ACTS = {
  stand: { kind: 'loyal', name: 'Stand' },
  kindle: { kind: 'serene', name: 'Kindle' },
  pass: { kind: 'pale', name: 'Pass unseen' },
  lure: { kind: 'stranger', name: 'Lure' },
};

// The omens (TUNING.omens), by name; what each does is omenText in sim.js.
export const OMENS = {
  sealed: { name: 'A sealed rift' },
  thin: { name: 'A thin Veil' },
  hunt: { name: 'The Hunt' },
  still: { name: 'Still air' },
  blood: { name: 'A blood moon' },
  restless: { name: 'A restless Deep' },
};

// Visitors at the gate (round six), in the order they're drawn from. Each answer says what it costs and what
// it brings: resources (cost, gain), Dread, and in words anything else it does. The last answer is the one
// taken if the visitor is left waiting. The numbers are here; who can come when, and the answers' other
// effects, are in sim.js (visitorCan, answerVisitor).
export const VISITORS = {
  peddler: {
    name: 'A glass peddler',
    text: 'A peddler with a barrow of glass offcuts, salvaged from a burnt chapel.',
    answers: [{ id: 'buy', text: 'Buy his glass', cost: { food: 6 }, gain: { glass: 4 } }, { id: 'no', text: 'Send him on' }],
  },
  chandler: {
    name: "A chandler's widow",
    text: "A widow selling the last of what her husband made: good tallow candles.",
    answers: [{ id: 'buy', text: 'Buy her candles', cost: { food: 6 }, gain: { candles: 4 } }, { id: 'glass', as: 'buy', rule: 'payInKind', text: 'Pay her in glass', cost: { glass: 3 }, gain: { candles: 4 } }, { id: 'no', text: 'Send her on' }],
  },
  grain: {
    name: 'A grain barge',
    text: 'A bargeman tied up in the moat with sacks of barley, and no taste for the road.',
    answers: [{ id: 'buy', text: 'Buy his grain', cost: { glass: 4 }, gain: { food: 10 } }, { id: 'no', text: 'Send him on' }],
  },
  mason: {
    name: 'A journeyman mason',
    text: 'A mason walking the roads for work, with his own tools.',
    answers: [{ id: 'hire', text: 'Hire him for the day', cost: { food: 4 }, gain: { stone: 8 } }, { id: 'glass', as: 'hire', rule: 'payInKind', text: 'Pay him in glass', cost: { glass: 2 }, gain: { stone: 8 } }, { id: 'no', text: 'Send him on' }],
  },
  mirrors: {
    name: 'A mirror-seller',
    text: 'A pedlar of mirrors, one wrapped in sacking: a hand mirror, silvered and whole.',
    answers: [{ id: 'buy', text: 'Buy the hand mirror', cost: { food: 8 }, does: 'a hand mirror for the dead, room for one more' }, { id: 'glass', as: 'buy', rule: 'payInKind', text: 'Pay in glass', cost: { glass: 4 }, does: 'a hand mirror for the dead, room for one more' }, { id: 'no', text: 'Send him on' }],
  },
  pilgrims: {
    name: 'Pilgrims before the raid',
    text: "Two pilgrims running ahead of the Host, asking the keep's shelter.",
    answers: [{ id: 'take', text: 'Take them in', does: 'two more of the living, for good: more hands, and more mouths; today they stand the gate with you (+2 defense)', help: 2 }, { id: 'no', text: 'Turn them away' }],
  },
  refugees: {
    name: 'A burnt-out family',
    text: 'A man, his mother and his small daughter, from a village the Host burned.',
    answers: [{ id: 'take', text: 'Take them in', cost: { food: 6 }, does: 'they come in starving: three more of the living, a man who works, an old woman, and a child who eats and doesn\'t work' }, { id: 'no', text: 'Send them on', dread: 1 }],
  },
  graverobber: {
    name: 'A grave-robber',
    text: 'Caught in the crypt with a sack, going through the day\'s dead.',
    answers: [{ id: 'hang', text: 'Hang him', does: 'he dies inside the walls, and wakes at dusk as a Restless shade' }, { id: 'go', text: 'Let him go', does: 'he takes a body with him: it won\'t wake at dusk' }],
  },
  knight: {
    name: 'A knight at the gate',
    text: 'A knight asking after his brother, who fell raiding your walls and serves in your glass now.',
    answers: [{ id: 'free', text: 'Release his brother', gain: { glass: 6, remembrance: 1 }, does: 'the Stranger goes free' }, { id: 'keep', text: 'Keep him', does: 'the knight rides to join the Host: its next raid comes ×1.25 harder', edge: 1.25 }],
  },
  plague: {
    name: 'The plague cart',
    text: 'Two carters, both feverish, and a cart of the dead from the valley.',
    answers: [{ id: 'take', text: 'Take them in', does: 'two more of the living, both sick; a third of the time one of yours falls sick too', risk: 0.33 }, { id: 'no', text: 'Turn it away', dread: 1 }],
  },
  wedding: {
    name: 'A wedding',
    text: 'Two of the living ask to be wed.',
    answers: [{ id: 'feast', text: 'Hold the feast', cost: { food: 4 }, does: 'they wed; everyone is at peace for the rest of the day' }, { id: 'no', text: 'Not now' }],
  },
  bard: {
    name: 'A bard',
    text: 'A bard who sings for his supper, and knows the old songs of the dead.',
    answers: [{ id: 'sing', text: 'Let him sing', cost: { food: 2 }, gain: { remembrance: 1 }, does: 'whoever grieves is comforted, and at peace' }, { id: 'no', text: 'Send him away' }],
  },
  deserter: {
    name: 'A deserter from the Host',
    text: 'A deserter from the Ashen Host, asking you to hide him from it.',
    answers: [{ id: 'take', text: 'Take him in', does: 'one more of the living, Brave; the Host will come for him: its next raid comes ×1.2 harder', edge: 1.2 }, { id: 'no', text: 'Turn him away' }],
  },
  almoner: {
    name: "The Church's almoner",
    text: 'The Lantern Church asks alms for its poor, and remembers who gives.',
    answers: [{ id: 'give', text: 'Give alms', cost: { food: 5 }, dread: -1 }, { id: 'pray', as: 'give', rule: 'payInKind', text: 'Pray for its poor', cost: { remembrance: 2 }, dread: -1 }, { id: 'no', text: 'Refuse' }],
  },
  witch: {
    name: 'A hedge-witch',
    text: 'A hedge-witch selling charms against the dark.',
    answers: [
      { id: 'charm', text: 'Buy a charm', cost: { glass: 3 }, does: 'tonight the candles burn a quarter slower' },
      { id: 'church', text: 'Hand her to the Church', dread: -1, does: 'she curses the keep: a Weeper comes tonight' },
      { id: 'no', text: 'Send her away' },
    ],
  },
  physician: {
    name: 'A travelling physician',
    text: 'A physician on his way to the valley, with his bag.',
    answers: [{ id: 'pay', text: 'Pay him', cost: { glass: 4 }, does: 'he cures everyone sick' }, { id: 'no', text: 'Send him on' }],
  },
  priest: {
    name: 'A wandering priest',
    text: 'A priest on the road, who will say the rites for a meal.',
    answers: [{ id: 'feed', text: 'Feed him', cost: { food: 2 }, does: 'one more funeral at dusk tonight' }, { id: 'no', text: 'Send him on' }],
  },
  reeve: {
    name: "The lord's reeve",
    text: "The lord's reeve, come for his tithe. Paid, the lord's riders stand with you when the Host next comes.",
    answers: [{ id: 'pay', text: 'Pay the tithe', cost: { food: 6 }, does: 'at the next raid, +3 defense', help: 3 }, { id: 'glass', as: 'pay', rule: 'payInKind', text: 'Pay it in glass', cost: { glass: 3 }, does: 'at the next raid, +3 defense', help: 3 }, { id: 'no', text: 'Refuse' }],
  },
  necromancer: {
    name: 'A necromancer',
    text: 'A necromancer who can bind the Restless without essence, and asks nothing for it.',
    answers: [{ id: 'bind', text: 'Let him bind it', dread: 1, does: 'the Restless shade is bound into a free mirror, Loyal' }, { id: 'no', text: 'Drive him off' }],
  },
  cooper: {
    name: 'A cooper',
    text: 'A cooper with water barrels, for a keep that burns.',
    answers: [{ id: 'buy', text: 'Buy his barrels', cost: { glass: 3 }, does: 'until the season ends, fire comes half as often' }, { id: 'no', text: 'Send him on' }],
  },
};

// The Library's studies (round six): remembrance to begin one, lore to finish it, and then the keep has it for
// good. One at a time. The numbers each changes are here; sim.js applies them.
export const STUDIES = {
  tallow: { name: 'Tallow-craft', rem: 3, lore: 4, wax: 1.25, text: 'candles and lanterns burn ×1.25 as long' },
  wards: { name: 'Ward-lore', rem: 3, lore: 4, less: 2, text: 'a ward costs 2 essence less' },
  pitch: { name: 'Pitch-craft', rem: 2, lore: 3, mult: 2, text: 'pitch takes twice as much off the Host' },
  rites: { name: 'The old rites', rem: 4, lore: 5, text: 'one kind of shade, chosen when you begin, can act twice a night' },
  silvering: { name: 'Silvering', rem: 3, lore: 4, glass: 0.75, text: 'mirrors take a quarter less glass to build or upgrade' },
  herbs: { name: 'Herb-lore', rem: 2, lore: 3, heal: 2, text: 'healers cure twice as many' },
  masonry: { name: 'Masonry', rem: 3, lore: 4, less: 2, text: 'a room costs 2 stone less' },
  hollow: { name: 'Hollow-lore', rem: 3, lore: 4, hold: 2, text: 'a ward holds the Hollow on half the essence, and twice as long with none' },
};
// The Hall's decrees (round six): one a season, standing until it ends, each with its price.
export const DECREES = {
  rationing: { name: 'Rationing', does: 'everyone eats three-quarters as much', price: 'sickness comes half as often again', eat: 0.75, sick: 1.5 },
  curfew: { name: 'A curfew', does: 'the living are barred in from dusk: the Weepers give no nightmares', asleep: 'the living are barred in from dusk: nobody sleepwalks, and the Weepers give no nightmares', price: 'everyone works ×0.9', work: 0.9 },
  levy: { name: 'A levy', does: 'men from the villages stand the gate at every raid, +3 defense', price: 'they eat 2 food a day', defense: 3, food: 2 },
};
// What a decree does in this keep: the curfew keeps sleepwalkers in only where the living sleepwalk.
export const decreeDoes = (T, D) => (T.errands && D.asleep) || D.does;

export const CAUSES = {
  duty: { name: 'Duty', kind: 'loyal', text: 'died on duty' },
  oldage: { name: 'Old age', kind: 'serene', text: 'died of old age' },
  sickness: { name: 'Sickness', kind: 'pale', text: 'died of sickness' },
  neglect: { name: 'Neglect', kind: 'restless', text: 'died of neglect' },
  yours: { name: 'Your order', kind: 'wraith', text: 'was killed on your order' },
  raider: { name: 'Raider', kind: 'stranger', text: 'fell raiding the keep' },
  hollow: { name: 'The Hollow', kind: null, text: 'was taken by the Hollow' },
  sleep: { name: 'Sleepwalking', kind: 'pale', text: 'died sleepwalking in the Tain' },
  hanged: { name: 'Hanged', kind: 'restless', text: 'was hanged at the gate' },
};
export const GUIDE_UP = { pale: 'serene', restless: 'pale' };

export const MIRRORS = {
  hand: { name: 'hand mirror', cap: 1, glass: 6 },
  pier: { name: 'pier glass', cap: 2, glass: 14 },
  great: { name: 'great glass', cap: 4, glass: 30 },
};
export const START_MIRRORS = [['pier', 'Chapel'], ['hand', 'Hall']];
export const MIRROR_PLACES = ['Stair', 'Solar', 'Well', 'Tower', 'Kitchen', 'Gate', 'Library', 'Cellar', 'Loft', 'Cloister'];

// The living. Anyone whose room isn't built yet starts in the Yard. Between them they have each trait once.
export const CAST = [
  { name: 'Ada', age: 'adult', job: 'barracks', trait: 'brave' },
  { name: 'Wil', age: 'adult', job: 'barracks', trait: 'coward' },
  { name: 'Tam', age: 'old', job: 'chapel', trait: 'devout' },
  { name: 'Bran', age: 'adult', job: 'hearth', trait: 'stubborn' },
  { name: 'Mira', age: 'adult', job: 'hearth', trait: 'cheerful' },
  { name: 'Sabe', age: 'young', job: 'glazier', trait: 'diligent' },
  { name: 'Osk', age: 'young', job: 'chandlery', trait: 'greedy' },
  { name: 'Nell', age: 'old', job: 'infirmary', trait: 'gentle' },
];
export const BONDS = [
  ['Ada', 'Wil', 'sibling'],
  ['Bran', 'Mira', 'spouse'],
  ['Tam', 'Nell', 'friend'],
];
// The last keeper's dead, already in the Chapel glass when the season opens, posted on the line (the feet of
// the two stairs up to the Veil, or between rift and mirror in a keep with no stairs). Garrick is Osk's
// father: posted in the Wick Room he and Osk both work x1.25.
export const START_SHADES = [
  { name: 'Garrick', age: 'adult', job: 'barracks', kind: 'loyal', cause: 'duty', memory: 80, named: false, bond: ['Osk', 'parent'], was: 'brave' },
  { name: 'Hesper', age: 'old', job: 'chapel', kind: 'serene', cause: 'oldage', memory: 60, named: true, bond: null, was: 'stubborn' },
];
// What each side of a bond is to the other: Garrick is Osk's parent, so Osk is Garrick's child.
export const BOND_OTHER = { parent: 'child', child: 'parent', sibling: 'sibling', spouse: 'spouse', friend: 'friend' };
