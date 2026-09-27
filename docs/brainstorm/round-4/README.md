# After the Slice: design round four (September 2026)

Round three's ten-week plan is built: four prototypes, ending in a one-season vertical slice ([`prototype/`](../../../prototype/README.md), [play the season](https://rcjlabs.github.io/Base-Manager/prototype/season.html)). This round asked what to build next, before and after the playtest the slice exists for. Open [`index.html`](index.html) in a browser for the page version: every candidate with its status, what each build showed, and the queue.

## Where it stands

- **Nobody has played it yet.** The slice's question, *do people want to play a second season?*, is unanswered. Everything below comes from autopilot runs (a scripted player, 40 to 200 seeds a result) and scripted runs in Chromium.
- **The night no longer has to collapse onto the line's floor, but working below it doesn't pay.** The static defense no longer wins: over 1,000 seeds the reacting plan and a doubled line tie on the two-room start. The best play kept nearly everyone on the line's floor, because a room lit below it took a whole tide alone. The Unlit now take any dark way up and gnaw only a light that bars every way. Working the rooms below the line on one side of the keep now costs about 2 points of second seasons on either keep, against 10.6 on the two-room start before: a near-even trade, not a mistake, and not a gain.
- **Both seasons may be too easy.** The autopilot finishes 95–98% of first seasons and 78–91% of the second seasons it reaches on either keep, fire by day and the Weepers included. People will do worse than a script that knows the rules, but by how much is unknown.
- **Keep or cover at dawn is still not shown to be a choice.** Traits make each shade different, but an autopilot that reads them does no better than one blind to them. The rite is meant to be the game's best decision; whether it feels like one needs people.
- **The new moon turns on a couple of candles.** When a room a Maw broke also lost its day's work, the balanced plan fell from 95% to 67% of first seasons on the four-floor keep, almost all of it through the Chandlery broken the night before the new moon.
- **Colour blindness is checked only in simulation.** Red eyes on a dark night all but vanished for anyone who can't see red; each Unlit eye now has a pale glint that stays bright.

## The candidates

Sizes were my estimates when the list was made: S, M, L.

| # | Idea | Size | Status |
|---|---|---|---|
| | **Fixes for problems already measured** | | |
| 1 | Break the fixed stair setup that won nights 1–5 | M | Built. The static line no longer wins. The Unlit now go around lights, so the rooms below the line can be worked at about even odds (below) |
| 2 | Make the rite bite: traits such as Devout turning Bitter, and fire by day | M | Built: traits, with a Bitter shade costing 3 Dread, and fire by day. Fought at once, fire adds few deaths but costs 5–14 second seasons in 200 |
| 3 | Colour-blind-safe eyes: Creepers and Strangers told apart by shape | S | Built. The real problem was red eyes vanishing in the dark; each eye now has a pale glint |
| | **Designed in round three, not built yet** | | |
| 4 | Traits that invert at death: 8 pairs, each with a night effect | M | Built. Reading them made no measurable difference to the autopilot |
| 5 | Quarters and the Dreamwell; Weepers give the sleepers nightmares | M | Built. Ignored, the Weepers cost 2–5 first seasons in 200 on the two-room start and nothing measurable over two, but 22 second seasons for the four-floor doubled line. Guarding against them costs more than it saves, and the Quarters doesn't pay |
| 6 | The black mirror: tomorrow's raid and tonight's Creeper waves | S | Built, inside the threat preview (16): tonight's waves by rift and tide, and tomorrow's raid as a range |
| 7 | Whispers and the great glass: shades coach the living, or step through by day | M | Queued, 8th |
| 8 | Break a mirror in an emergency: it frees its shades and curses the room | S | Built. Frees everyone in it and lifts 1 Dread each, then 7 days of bad luck. Used blindly against censures it's slightly worse than taking them |
| 9 | Build your own rooms | L | Built, and the keep now starts as two rooms. No choosing a slot, no tearing down |
| 10 | A full year: shifting days and nights, the Long Night, the eclipse | L | Queued, 9th; the eclipse stays on round three's cut list |
| 11 | The dusk crossing in the season | S | Built |
| | **New ideas** | | |
| 12 | The Book of the Dead: each shade's story | S | Built |
| 13 | A season recap card to share | S | Queued, 3rd |
| 14 | A daily seed everyone plays | S | Queued, 4th; replays are already exact from a seed |
| 15 | Watch a replay of a season or a tester's export | S–M | Parked for later, your call |
| 16 | A threat preview at dusk: likely Creeper routes and the Hollow's path | M | Built, as the black mirror: the Dusk panel says where each rift's tide will go, and the Tain shows the ways |
| 17 | A guided first season | M | Built |
| 18 | An installable app, the first step toward Google Play | S–M | Built; Chromium only |
| 19 | Sound and haptics | M | Built; levels measured, not yet heard by a person |
| 20 | A Menu with Settings and save slots: three keeps, export and import as a file | S–M | Built; Chromium only |

My picks for playtest readiness were 1, 11, 12, 17 and 18. All five are built. Building rooms (9), people that read as people, the Menu with save slots (20), and sound and haptics (19) came after, at your request.

## What the builds showed

- **The Maws (1), first version:** Maws that tore down the candle holding the line made that line cost something, but a doubled line beat them outright. It finished 96 first seasons in 100 against 95 for the balanced plan, and lost 0.2 shades a season against 2.4.
- **Season 2** finished 35% of the time at ×1.35 difficulty a season. At ×1.2, with the Maws on their own multiplier, it's 73% for the balanced plan on the two-room start.
- **The Maws (1), second version:** Maws now weigh the candle barring the way against every room where people work, count the fighters on the way, and break whatever is worth most for the least fight. A broken room costs a night's work there and 1 Dread.
  - On the four-floor keep that reversed the doubled line's lead over two seasons. It used to finish 133 second seasons in 200 against the balanced plan's 116. With the new Maws it finished 116 against 123, and with a better autopilot as well, 165 against 173.
  - On the two-room start it didn't at first: 174 second seasons against 138. The first floor you build is always the line's floor, so a doubled line stands in working rooms.
- **An autopilot that plays sensibly (to settle 1):** the reacting plan had been pulling reinforcements across a dark floor for each tide, and posting shades in rooms below the line's floor. Fixing both levelled it with the doubled line on the two-room start (176 second seasons against 179) and put it ahead on the four-floor keep (179 against 171). So the static line's lead was my autopilot's, not the rules'. What's left is a design problem: on a built-up keep the night is all about the line's floor.
- **Guarding the line (to fix 1):** a rule that shades in the light at the stairs do no work but keep the Watch. It took the balanced plan from 92% to 73% of first seasons and barely moved the doubled line (98% to 95%). It's off, as a switch in Settings.
- **Building (9):** stone from masons in the Yard, 6 stone a room, three workers a room, a Forge and a Cellar, and a keep that starts as the Hearth and the Crypt. The autopilot's results depend heavily on build order: swapping the Chapel and the Chandlery once took it from 93% to 30%.
- **Traits (2 and 4):** everyone has one of eight, and death turns it over.
  - **Reading them made no measurable difference.** An autopilot that reads traits finished 178 second seasons of 193, against 175 for one blind to them. On the current build it's 182 of 198 against 185 of 195: still within noise.
  - **A claim I retracted.** I first reported a lead of about 10 for reading traits under a harsher Dread (the living bearing one per 4 of them instead of 3), and made that Dread the default. The lead came from an autopilot mistake: it spent the essence the new moon needs on the tides of nights 5 and 6. With that fixed the lead vanished, and the default went back.
  - **The doubled line.** The same mistake had put it ahead again, by 13–15 second seasons. With it fixed, Double led by 10 in about 195 on the two-room start (1.7 standard errors); over 1,000 seeds the two tie (below).
- **The follow-ups.**
  - **The doubled line, over 1,000 seeds** on the two-room start: the balanced plan finished 932 of the 982 second seasons it reached (94.9%), Double 938 of 990 (94.7%). A tie; the lead of 10 in 200 was noise.
  - **Raids, back from 75% to 86%** held (90% without traits). The Gentle guarded at half strength and the Greedy ate double. Now the Gentle grieve harder and the Greedy work ×0.8 away from their two rooms.
  - **A warning for the new moon.** The autopilot's mistake, spending on the tides the essence the Hollow's night needs, is an easy one for a person too. On the two dusks before the new moon, the Dusk panel now says what warding every stair will cost against the essence in store.
- **The night's collapse (to fix 1).** A room lit below the line stood alone across the Unlit's way up. A candle lights 40 of a room's 48 steps, and the way up runs between stairs through the middle of each room, so no candle there stays off it. A Creeper cut off by the line gnawed the first light on its shortest way, so one shade below took a whole tide. With every room below the line worked, shades there lost 10 memory a season on night 6 to Creepers catching them at their posts, against 0.2 for the line-only plan's.
  - **Rewards didn't help:** up to double the night's work a floor down, or a day bonus for rooms worked through the night, left working below the line 13–17 second seasons behind in about 197. Neither did retreating to the line for each tide, or holding the line a floor lower (93 and 103 of about 180, against 185).
  - **Where the Unlit gnaw did.** They now take any dark way up, however long, and gnaw only a light that bars every way. It's a switch in Settings, on by default. Balanced plan, 600 seeds, second seasons, working the rooms below the line on the Choir's side of the keep against line-only play: on the two-room start, 493 of 581 against 564 of 591 before, and 546 of 591 against 557 of 592 now. On the four-floor keep it was already close: 567 of 598 against 577 of 599 before, 556 of 597 against 570 of 600 now.
  - **So working below the line costs about 2 points on either keep** (1.8 standard errors pooled, probably a small real cost), where it cost 10.6 on the two-room start. It's a trade now, but nothing below the line clearly pays except the Choir. The rule may also make the game about a point harder (1 standard error on each keep).
- **The crossing, the guide, the Book and installing (11, 17, 12, 18)** work in scripted runs. None has been tried by a person.

## Decisions only you can make

1. **Play it on a real phone.** Installing, real fingers, the guide and iOS are all unchecked.
2. **How testers send results back.** Today they copy JSON from Records, then Playtest. That works for 3–5 people; a form would lose fewer answers beyond that.
3. **Google Play.** A Trusted Web Activity without a URL bar needs `assetlinks.json` at `rcjlabs.github.io/.well-known/`. That means an `rcjlabs.github.io` repository or a custom domain, plus the signing fingerprint from your Play Console.

The Maw name, the fourth open question from before, is settled: they break rooms now, as round three's Maws do.

## Next, in order

1. This write-up. Done.
2. **The doubled line.** Done: the gap was my autopilot's. Over 1,000 seeds the balanced plan and the doubled line tie on the two-room start.
3. **Colour-blind-safe eyes (3).** Done, checked in simulation.
4. **Traits that make the rite bite (2 and 4).** Built; they don't yet show a measurable effect on the rite for the autopilot. What they change is which shade costs what; whether that matters is for the playtest.
5. **The night's collapse onto the line's floor.** Done in part: see What the builds showed.
6. **The playtest.** After you've played it on a phone and picked how results come back.

## The queue

The candidates not built yet when the queue was made, in the order I'd build them. The first two help the playtest itself; the next two matter once there are players; the rest add to the game.

1. **A threat preview at dusk (16), with the black mirror (6) in it.** M. Done. The Dusk panel's black mirror says where each rift's tide will go past the candles set so far: the light it will gnaw, a mirror left open, or a shade it will catch. It also names where candle hunters go, what a Maw would make for, the Hollow's way, each tide's size, and tomorrow's raid as a range. The Tain shows the same ways as marching chevrons. It asks the Creepers' own planner, so it's exact until the night begins and candles burn down.
2. **Watch a replay (15).** S–M. Parked for later, your call. A tester's export already replays exactly. A viewer that plays it back lets you see where they struggled, which is most of what a playtest can tell beyond its one question.
3. **A season recap card (13).** S. One image per season to share, drawn from the season summary and the Book of the Dead.
4. **A daily seed (14).** S. Everyone plays the same keep each day. Worth it once there are players to compare.
5. **Break a mirror in an emergency (8).** S. Done. Everyone in it goes free at once and Dread falls 1 for each, so it can turn a censure into a warning, or free a caught shade at night. The mirror is lost and 7 days of bad luck follow (sickness twice as often). The keeper plan breaking one to stop every censure finished 80 second seasons in 99 against 86 without; without the bad luck it's about even.
6. **Fire by day (the rest of 2).** M. Done. About 2 fires a season in a Hearth or a Forge. The room's own workers fight each one, the Yard or the bell can be sent, and fighting it can kill, more so the hotter it is. Fought at once it adds few deaths (0.14–0.18 per two seasons for the autopilot) but costs 5–14 second seasons in 200. Whether it gives a slower player more choices at the rite is for the playtest.
7. **Quarters and the Dreamwell; Weepers (5).** M. Done. The keep sleeps 8, and each Quarters 4 more; the crowded fall sick more often. A shade dreaming in the Dreamwell makes the living work ×1.1 the next day. The night after a death a Weeper rises for each of the dead and weeps in the dark of the sleepers' twin; one that weeps its fill gives someone a nightmare (×0.6 work). It doesn't pull the night from the line as hoped. The Quarters goes where the keep builds next, the Tain's deepest floor, so the sleepers' twin is always below the line. Ignored, the Weepers give about 6 nightmares in two seasons. On the two-room start that costs nothing measurable over two seasons; on the four-floor keep it costs the doubled line 22 second seasons in 200, for reasons I haven't found. A fighter sent to guard costs 16 second seasons in 200, and a dreamer comes out even. Never building the Quarters did as well as building it when crowded, or better. For now they add texture, not a decision.
8. **Whispers and the great glass (7).** M. Shades coach the living, or step through by day: day work for the dead.
9. **A full year (10).** L. Shifting days and nights, the Long Night; the eclipse stays cut. Only if the playtest says people want a second season, since a year is that answer built out.

## What's checked

- **Established:** the autopilot numbers above, each from 40 to 1,000 seeds, and the scripted Chromium checks (the game, the guide, building, installing and offline play).
- **Judgment:** the sizes, the order, and what counts as a fair second season.
- **Unknown until people play:** whether they want a second season, whether the guide teaches the game, whether the Tain reads on a phone, and whether a real player turtles on the line the way the autopilot's doubled line does.
