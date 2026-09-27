# Round five: enhancements and new features (September 2026)

Round four's queue is built except the replay viewer, which is parked ([`round-4/`](../round-4/README.md)). You played the season on a phone and it held up. This round is five enhancements to what's there, five new features, and three smaller ones, all queued. Sizes are my estimates: S, M, L. Where a line says measured, it's the autopilot, not people.

**One caveat.** You're the one player a tutorial can't be tested on, because you know the rules. Raids come first so the tutorial teaches them as they'll be; after the tutorial, two or three people who've never seen the game should play its first three days.

## The candidates

| # | Idea | Kind | Size | Status |
|---|---|---|---|---|
| 1 | A tutorial keep: the first three days, scripted | Enhancement (the guide) | L | Built: offered first in the intro, and in Saves and How to play, a new Menu tab. Untested with new players ([problem 21](../../../prototype/README.md)) |
| 2 | Raids you fight | Enhancement (raids) | M–L | Built: pay them off or bar the stores; at the gate, pitch, stone and the bell; after a breach, go after them. The Host is as strong as before ([problem 20](../../../prototype/README.md)) |
| 3 | Build where you choose, and tear down | Enhancement (building) | M | Built: any bare hall or a new floor, tear down for half, move (swap) for 2. Rearranged keeps unmeasured; a tall keep measured worse ([problem 23](../../../prototype/README.md)) |
| 4 | A night review at dawn | Enhancement (the night report) | M | Built: up to three stills of the night at the rite, and at the season's end or a keep's fall ([problem 22](../../../prototype/README.md)) |
| 5 | The dead ask for things | Enhancement (the rite) | M | Built: a request from each shade after two nights; refused twice, it turns Restless. The rite is a choice now, but it costs the mourner ([problem 25](../../../prototype/README.md)) |
| 6 | Each season its own trouble: plague summers, autumn sieges | New | M | Built: summer's plague takes more in a crowded keep; autumn's siege shuts the gate for two days, broken by a sally ([problem 24](../../../prototype/README.md)) |
| 7 | Rain and the Drowned | New | M | Built: a forecast a day ahead; rain slows the Yard and damps fire, fog clouds the black mirror; on rainy nights the Drowned come up behind the line and make for the mirrors. It costs the doubled line about 5 points of whole years and the other plans about as much as noise, and lets the Hollow through more often ([problem 27](../../../prototype/README.md)) |
| 8 | Down into the Deep, for quicksilver | New | M–L | Built: at dusk a shade goes down to depth 1, 2 or 3 instead of taking a post, and comes back at dawn with quicksilver or caught; quicksilver upgrades a mirror where it hangs. About an even trade for the autopilot ([problem 28](../../../prototype/README.md)) |
| 9 | Generations: aging and children | New | L | Built: from the second year the living age each spring, pair off and have children, who come of age the next spring. No clear effect on survival measured ([problem 29](../../../prototype/README.md)) |
| 10 | An ending to the year | New | M | Built: keep the watch, take your place in the glass as The Keeper, or seal the Veil and end the keep ([problem 26](../../../prototype/README.md)) |
| 11 | Difficulty presets | Small | S | Built: Gentle, Standard or Hard for a new keep; each year now starts from its own spring, so a second winter can be won, and a keep keeps the numbers it was made with ([problem 30](../../../prototype/README.md)) |
| 12 | The Lantern Church's embargo and inquisition | Small | S–M | Built: a censure brings a silver embargo (no glass, no new mirrors) for 5 days, lifted by a blessing or a donation; censured again under it, the Inquisition inspects every noon. Only the keeper plan meets it, at no measurable cost ([problem 31](../../../prototype/README.md)) |
| 13 | Keyboard play at night | Small | S–M | Queued, 13th |

## Enhancements

1. **A tutorial keep: the first three days, scripted.** The guide's cards fire only when things happen to happen, so a new player may never meet a fire, a Maw or a hard rite early. A fixed tutorial seed with events on cue and one objective at a time:
   - Day 1: jobs, the Yard, raising a Barracks. An old servant dies at noon, so dusk teaches the crypt, candles, posts and the black mirror. Night 1 is one small tide.
   - Day 2: a raid and a small fire. The first rite has one shade worth keeping and one Restless to release.
   - Day 3: glass and mirrors, the Chapel and Dread, the Church's notice. Night 3 is a weakened Maw.
   - The Veil can't break before night 4; a crack is shown and explained instead. From day 4 it's a normal season. A How to play page in the Menu keeps every lesson rereadable.

   The scripted events must go through the seeded, logged path so tutorial keeps replay.
2. **Raids you fight.** A raid is a number check at a set hour. Round three's Host "assaults the gate, later with rams and ladders", answered by "walls, archers, the bell". Three calls: beforehand, man the walls, bar the stores, or pay them off; during the assault, fight for the gate; after, go after them or let them go. The autopilot gets a raid policy so balance stays measurable.
3. **Build where you choose, and tear down.** Rooms only go on top, so the Quarters landed below the line in all 245 nights measured, and the keep's shape isn't the player's. Pick any bare hall or a new floor, swap two rooms for stone, tear down for half back; the build screen shows what a room there does to tonight's ways. The night rules were tuned on top-built keeps and need re-measuring.
4. **A night review at dawn.** The sim replays exactly, so dawn can show the two or three moments that decided the night (the first crack, a shade caught in the dark, the candle a Maw tore down) as still frames of the Tain. The parked replay viewer in miniature.
5. **The dead ask for things.** Measured: keep or cover still isn't a real choice. Round three's Court of Shades held "the dead's requests": after a few nights each shade asks one thing (a Serene one to be let go before it forgets, a Loyal one to guard the gate by day, a Stranger to be named). Granting costs something; refusing makes it likelier to turn Restless.

## New features

6. **Each season its own trouble.** Round three's plague summers ("hit crowded keeps") would give the Quarters a reason to exist; measured, it never paid. Its autumn sieges ("camp outside for days") shut the gate for two or three days, with no newcomers and no Yard, until you break the camp or outlast it. Autumn now plays like spring. After 2.
7. **Rain and the Drowned.** Weather forecast a day ahead: rain slows the Yard and helps against fire, fog clouds the black mirror. On rainy nights round three's Drowned come up through the moat's twin and drag shades down: the first threat that doesn't climb the stairs. It needs a clear warning.
8. **Down into the Deep.** A shade sent below the rifts at night brings back quicksilver, round three's resource for upgrading mirrors: a hand mirror into a pier glass, a pier glass into a great glass, which is out of reach now. The deeper, the more, and the likelier it's caught.
9. **Generations.** The living age each spring, bonded pairs have children who grow into workers, and the old die and wake Serene. Round three: "by the late game, everyone you started with works nights." Cut there for cost; it only matters from year two.
10. **An ending to the year.** Round three's Long Night ends in "a choice of ending", two of three cut. After it: seal the Veil (every shade goes free and the Book closes), keep the watch into a harder year, or take your own place in the glass while a new keeper inherits the keep. 23–45% of autopilot keeps would reach it.

## Smaller

11. **Difficulty presets**, for the measured "seasons may be too easy": named sets of the Settings numbers, chosen for a new keep.
12. **The Lantern Church's embargo and inquisition**, round three's escalation for a keep whose Dread stays high.
13. **Keyboard play at night.** The night is pointer-only today.

## The queue

2, 1, 4, 3, 6, then 5, 10, 7, 8, 9, then 11, 12, 13.
