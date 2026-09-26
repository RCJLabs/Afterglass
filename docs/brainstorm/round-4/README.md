# After the Slice: design round four (September 2026)

Round three's ten-week plan is built: four prototypes, ending in a one-season vertical slice ([`prototype/`](../../../prototype/README.md), [play the season](https://rcjlabs.github.io/Base-Manager/prototype/season.html)). This round asked what to build next, before and after the playtest the slice exists for. Open [`index.html`](index.html) in a browser for the page version: every candidate with its status, what each build showed, and the queue.

## Where it stands

- **Nobody has played it yet.** The slice's question, *do people want to play a second season?*, is unanswered. Everything below comes from autopilot runs (a scripted player, 40 to 200 seeds a result) and scripted runs in Chromium.
- **The night collapses onto the line's floor.** The static defense no longer wins: over 200 seeds the reacting plan and a doubled line finish 176 and 179 second seasons on the two-room start, and 179 and 171 on the four-floor keep. But the best play either way keeps nearly everyone on the line's floor. Below it only the Choir is worth working at night, so most twin rooms' night jobs don't matter on a built-up keep.
- **Both seasons may be too easy.** The autopilot finishes 98–99% of first seasons and about 90% of the second seasons it reaches. People will do worse than a script that knows the rules, but by how much is unknown.
- **Keep or cover at dawn is only just becoming a choice.** Traits make each shade different, and with harsher Dread, reading them pays for the autopilot, though the evidence is thin. The rite is meant to be the game's best decision; whether it feels like one needs people.
- **The new moon turns on a couple of candles.** When a room a Maw broke also lost its day's work, the balanced plan fell from 95% to 67% of first seasons on the four-floor keep, almost all of it through the Chandlery broken the night before the new moon.
- **Colour blindness is checked only in simulation.** Red eyes on a dark night all but vanished for anyone who can't see red; each Unlit eye now has a pale glint that stays bright.

## The candidates

Sizes were my estimates when the list was made: S, M, L.

| # | Idea | Size | Status |
|---|---|---|---|
| | **Fixes for problems already measured** | | |
| 1 | Break the fixed stair setup that won nights 1–5 | M | Built. The static line no longer wins; the night now centres on the line's floor (below) |
| 2 | Make the rite bite: traits such as Devout turning Bitter, and fire by day | M | Part built: traits, a Bitter shade costing 3 Dread, and harsher Dread. No fire by day |
| 3 | Colour-blind-safe eyes: Creepers and Strangers told apart by shape | S | Built. The real problem was red eyes vanishing in the dark; each eye now has a pale glint |
| | **Designed in round three, not built yet** | | |
| 4 | Traits that invert at death: 8 pairs, each with a night effect | M | Built. Reading them pays only under harsher Dread, and the evidence is thin |
| 5 | Quarters and the Dreamwell; Weepers give the sleepers nightmares | M | Not built |
| 6 | The black mirror: tomorrow's raid and tonight's Creeper waves | S | Not built. The Dusk panel already lists the night's tides |
| 7 | Whispers and the great glass: shades coach the living, or step through by day | M | Not built |
| 8 | Break a mirror in an emergency: it frees its shades and curses the room | S | Not built |
| 9 | Build your own rooms | L | Built, and the keep now starts as two rooms. No choosing a slot, no tearing down |
| 10 | A full year: shifting days and nights, the Long Night, the eclipse | L | Not built; the eclipse is on round three's cut list |
| 11 | The dusk crossing in the season | S | Built |
| | **New ideas** | | |
| 12 | The Book of the Dead: each shade's story | S | Built |
| 13 | A season recap card to share | S | Not built |
| 14 | A daily seed everyone plays | S | Not built; replays are already exact from a seed |
| 15 | Watch a replay of a season or a tester's export | S–M | Not built |
| 16 | A threat preview at dusk: likely Creeper routes and the Hollow's path | M | Not built |
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
  - **At the old Dread, traits didn't matter.** An autopilot that reads them did no better than one blind to them, or one judging them backwards, because it seldom had to cover anyone.
  - **Under harsher Dread they did.** With the living bearing one Dread per 4 of them instead of 3, reading traits won about 10 more second seasons in 190 (about two standard errors, so suggestive rather than proven).
  - **The costs of the harsher Dread.** It punishes both extremes, keeping everyone and covering freely, and makes second seasons harder. It also puts the doubled line ahead again, 179 second seasons to 166.
- **The crossing, the guide, the Book and installing (11, 17, 12, 18)** work in scripted runs. None has been tried by a person.

## Decisions only you can make

1. **Play it on a real phone.** Installing, real fingers, the guide and iOS are all unchecked.
2. **How testers send results back.** Today they copy JSON from Records, then Playtest. That works for 3–5 people; a form would lose fewer answers beyond that.
3. **Google Play.** A Trusted Web Activity without a URL bar needs `assetlinks.json` at `rcjlabs.github.io/.well-known/`. That means an `rcjlabs.github.io` repository or a custom domain, plus the signing fingerprint from your Play Console.

The Maw name, the fourth open question from before, is settled: they break rooms now, as round three's Maws do.

## Next, in order

1. This write-up. Done.
2. **The doubled line.** Done: the gap was my autopilot's. With it playing sensibly the reacting plan levels with the doubled line on the two-room start and beats it on the four-floor keep.
3. **Colour-blind-safe eyes (3).** Done, checked in simulation.
4. **The playtest.**
5. **Traits that make the rite bite (2 and 4).** Done, with harsher Dread, which the choice needs. The doubled line's lead came back with it and needs a look.

## What's checked

- **Established:** the autopilot numbers above, each from 40 to 200 seeds, and the scripted Chromium checks (the game, the guide, building, installing and offline play).
- **Judgment:** the sizes, the order, and what counts as a fair second season.
- **Unknown until people play:** whether they want a second season, whether the guide teaches the game, whether the Tain reads on a phone, and whether a real player turtles on the line the way the autopilot's doubled line does.
