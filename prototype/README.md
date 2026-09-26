# Afterglass prototypes

Playable slices of [Afterglass](../docs/brainstorm/round-3/README.md). Each tests one question from the plan and records the answer as you play. The first two are greyboxes in plain shapes and text; the pixel pass is the first art.

| Page | Plan | Question |
|---|---|---|
| [`index.html`](index.html) | Weeks 1–2: two rosters and the Rite | Does a death feel like a loss and a hire at once? |
| [`night.html`](night.html) | Weeks 3–4: the night on its own | Is the night fun without the day? |
| [`pixel.html`](pixel.html) | Weeks 5–6: the pixel pass | Can players read the Tain on a phone? |

Both are live on GitHub Pages at https://rcjlabs.github.io/Base-Manager/ (every push to `main` runs the tests and deploys).

## Run it

```sh
cd prototype
npm test                        # 39 tests: rules, replay, save and load, soak runs, the pixel quiz (Node 20+, no dependencies)
npm run serve                   # then open http://localhost:8080 or /night.html (any static server works)
npm run bundle                  # dist/afterglass-greybox.html, -night.html and -pixel.html: single files that open from disk
npm run balance -- 20 40        # weeks 1-2 autopilot report: 40 seeds x 20 days per policy
npm run balance:night -- 8 30   # weeks 3-4 autopilot report: 30 seeds x 8 nights per plan
```

The pages load ES modules, so they need a web server; GitHub Pages works as is. The bundles have no such limit.

## Files

| File | Job |
|---|---|
| `src/data.js`, `src/night-data.js` | Content and every tuning number for each greybox |
| `src/sim.js`, `src/night.js` | Each game as one JSON state. `step()` / `stepNight()` is one fixed tick (10 a second); `act()` / `actNight()` is one player action. No DOM, no clock, no `Math.random` |
| `src/ui.js`, `src/night-ui.js` | Render the state and change it only through the act functions |
| `src/autopilot.js`, `src/night-autopilot.js` | Crude players for tests and balance runs |
| `src/px/` | The pixel pass: `kit.js` (palette and drawing primitives from the round-three mockups), `lut.js` (the palette lookup and dithered light), `scene.js` (geometry, cameras, the quiz), `draw.js` (the art) |
| `src/pixel-ui.js` | The pixel page: day, crossing, night and the readability test |
| `test/` | 16 weeks 1–2 tests, 15 night tests and 8 pixel tests, including soak runs |
| `tools/` | Balance reports and the single-file bundler |

Everything is seeded and every action is logged, so `replay()` and `replayNight()` rebuild any session exactly, including one from a playtester's export.

## Weeks 5–6: the pixel pass

The first art, and a way to measure the plan's question: **can players read the Tain on a phone?** It is not connected to the greybox simulations yet; it draws a small keep and generated night scenes.

**Problems and risks it has already shown.** From building it and looking at it, not from anyone else playing it.

1. **The phone fits the Tain at 3× only if it gets the whole width.** The pixel keep is 112 pixels wide, so 3× is 336 CSS pixels. A 390-pixel phone fits that only without page padding; with ordinary margins it drops to 2×, and at 2× the sprites are 8 by 16 CSS pixels. The page now gives the stage full width on phones. The real game will need a camera that pans across a wider keep at the same 3×.
2. **The first candlelight was too dim to read the rooms.** Light that fades straight from the flame leaves one bright pixel and a dark room. It now holds full brightness near the flame (`LIGHT.gain`) and reaches 20 pixels. Whether that is still too dark on a real phone is what the test is for.
3. **Shades are pure silhouettes.** They show against lit walls; in the dark, only their eyes do. That is the round-three design, and it makes eye colour and shape carry a lot.
4. **Red and green eyes are a colour-blindness risk.** Creepers have red eyes and Stranger shades green ones. For players with red-green colour blindness, only shape separates them: Creepers are low and wide, shades tall. Worth changing before the art goes further.

**What's in it**

- **Four room pairs:** Chapel and Choir of Echoes, Granary and Hollow Granary, Hearth and Cold Hearth, Crypt and Waking Room. They cover the crossing (the Crypt), the night's one job (the Choir), resting (the Cold Hearth) and a weak spot (the empty Hollow Granary).
- **The palette lookup.** The Tain is the day art recoloured, never redrawn. Each colour's brightness picks a step on an 8-step violet ramp, and warm lights take the brightest step. Each twin adds one detail: echo rings, emptied stores, a cold blue fire, a glowing slab.
- **Dithered candlelight:** a 4×4 Bayer pattern and four light bands, in the palette.
- **The dusk crossing,** about 10 seconds: sunset, lights out, Ada's soul through the Veil into the Waking Room, the camera sliding down, candles and shades coming up.
- **Two night cameras.** Reflection is the Tain as the world has it, under the Veil and upside down. Flipped is the same picture turned over to read upright; with that camera, the crossing ends by turning.
- **The readability test:** 12 timed tap questions at phone scale, each type once per camera in a random order. The types are find a room, the shade in the dark, the caught shade, the room with no candle, the Creeper, and counting the shades in the Choir. Every generated question has exactly one right answer; the tests check this over 300 seeds per type. Results show accuracy and median time per camera, ask which camera felt easier, and copy as JSON with the screen size and scale.

**Read with care:** one run is 12 taps, and the first run includes learning the rooms. Compare several people, or later runs.

## Weeks 3–4: the night on its own

A standalone night mode. There is no day: each dawn simply brings 6 candles, 1 remembrance and 0–2 newly dead shades. Nights run 150 seconds at 1×.

**Design problems it has already surfaced.** These come from autopilot runs and my own reading of the rules; none of it is a playtest.

1. **The map had a winning static setup.** Every route to the Veil passes through the two stairs up to the top floor. Light those, park two shades there, and nothing gets through without the player doing anything. The greybox answers with the design's own line, "Creepers snuff candles": half of them now hunt the nearest light instead of the mirrors. The real map still needs more ways up, or Creeper goals that aren't the Veil.
2. **Gnawing stacks with no limit.** A crowd at one edge eats a fresh candle in seconds, and that is where most sudden leaks come from. It may be the fun part or the unfair part; `gnawRate` is in Settings.
3. **Holding had to be automatic.** With fighters striking only what stood next to them, the night was all repositioning. Shades standing in light now step to whichever edge of that light is under attack. That is my reading of the Hold verb, not the doc's.
4. **Wards redirect rather than delete.** A sealed rift sends its Creepers to another rift, and with all three sealed they seep up in the dark instead. The first version deleted them, and one cheap ward erased a third of a night.

**How the night works**

- **The Tain** is the keep flipped: the Veil and its three mirrors at the top, the Deep with three rifts at the bottom, and five floors of twin rooms between, joined by eight stairs.
- **Candles** light a span of their own room. The radius shrinks from 3.5 to 2 tiles as a candle burns through the night. Rifts drink light, so nothing right next to one is ever lit.
- **Creepers** climb from the rifts. They can't enter light or use a stair with light at either end. Blocked, they gnaw the light's edge; left alone, they catch shades in the dark and drain 4 memory a second. From night 2, some seep up in rooms left fully dark. Each one that reaches a mirror cracks the Veil, and 5 cracks lose the keep (dawn mends one). There are 5 on night 1 and 2 more each night.
- **Shades** in light defend it. Loyal shades fight hardest, Serene ones sing best, and memory weakens both (strength is 40% to 100% of full with memory). Singers in a lit Choir of Echoes make essence; resting in a lit Cold Hearth halves the night's fading.
- **The player's verbs** are Candle (6 a night), Guide (shades walk; the dark between is dangerous), Ward (5 essence seals a stair or a rift until dawn) and Hush (Creepers ignore shades, but nobody sings or fights).
- **Dawn** takes 10 memory from every shade, half for a named or rested one. A shade at 0 is gone. Remembrance names a shade (3, halves fading for good), remembers one (1, +15 memory), or comes from covering a mirror (+2 for releasing its shade).
- **The test.** At each dawn you rate the night from 1 (a chore) to 5 (gripping). The Nights tab lists each night's numbers, including how many actions you took, since a long night with few actions suggests it asked nothing of you.

**What the numbers say so far.** From `npm run balance:night -- 8 30`. The best crude plan, holding the two top stairs, loses no mirror on night 1. Crossings rise to about 2 a night by night 5, and most runs end during nights 5–6. None of the three plans holds all 8 nights. A person who reacts should last longer; how much longer is the point of playing it.

**Not in this greybox:** Maws, Weepers, the Hollow and the Drowned; night effects for traits; the Wick Room and other twin jobs besides the Choir; joining the night to the weeks 1–2 day.

## Weeks 1–2: two rosters and the Rite

After each death, mark whether it felt like a loss, a hire, both or neither: at the rite, or later in the **Loss & hire** tab. The Playtest tab copies an export with your notes, the ledger and a full replay log.

### The cycle

**Day** (60 s at 1×). Eight living work five rooms: Hearth (food), Glazier (glass for mirrors), Chapel (remembrance and funerals), Barracks (defense) and Infirmary (cures). Raids from day 2, sickness, old age and an empty larder kill people. A newcomer arrives every second day.

**Dusk** (paused). Each body in the crypt wakes as a shade if a mirror has room. How someone died decides the kind:

| Cause | Kind | Works at |
|---|---|---|
| Duty (guards, or anyone cut down in a breach) | Loyal | 100%, ×1.5 on the Watch |
| Old age | Serene | 100%, ×1.5 in the Choir |
| Sickness | Pale | 60% |
| Neglect (starved) | Restless | can't work; turns Wraith after 3 nights |
| Killed on your order | Wraith | hostile |
| A raider killed inside the walls | Stranger | 80%, no bonds |

Mirrors cap the night roster (hand mirror 1, pier glass 2, great glass 4; you start with 3). The dead beyond capacity wake Restless. Instead of waking, a body can get a funeral: one per priest, 1 remembrance, and the bonded are at peace. Traits invert at death (Brave becomes Reckless, and so on), each with one small effect.

**Night** (30 s at 1×). Shades work the twin rooms: Silvering (glass), Choir of Echoes (essence, calms Restless), Watch of the Dead (holds Wraiths, and leftover strength adds to tomorrow's defense) and Threshold (the next sickness or neglect death wakes one kind better). A shade starts at the twin of the room it worked in life.

**Dawn: the Rite** (paused, and the save point). Keep or cover each shade; release, leave or bind the Restless; banish or leave the Wraiths.

- **Dread** moves each dawn by: kept shades (Bitter ones count double) + unreleased Restless + 2 per Wraith − what the living bear (1 per 3 living, plus 1 per priest) − vigils (3 remembrance each).
- **At Dread 5** an inspector covers your fullest mirror and takes its shades (Anchored shades stay). Dread drops to 2.
- **Bonds.** A death leaves the bonded partner grieving (×0.8) until a funeral or a release (at peace: ×1.1 for 3 days). A kept shade posted to the twin of its partner's room is twinned: both ×1.25.
- **Essence** pays for warding the gate (+4 defense), binding an overflow Restless into a freed mirror (it wakes as its true kind) and banishing Wraiths.

### Where this goes beyond the design doc

The round-three page set the rules in outline. These are my calls to make them playable. Test them rather than trust them.

1. **Dread decays.** Read literally, "Keep: Dread +1" at every dawn with no decay reaches 5 within two days of holding three shades. I made the living bear some of the dead (1 per 3 living, plus 1 per priest).
2. **Funerals** are a crypt action at dusk, limited to one per priest. The doc said grief lasts "until funeral or release" without saying what a funeral is.
3. **Only raiders who die inside the walls wake.** That follows the pitch ("anyone who dies inside the walls"). Without it, raider bodies outnumbered your own dead about 14 to 8 per 20 days and crowded them out of the mirrors.
4. **Wraiths haunt** a staffed twin room: no work there that night, and half work in the day room above the next day. The Watch holds one per shade.
5. **Binding** overflow Restless for essence, **ward the gate**, the **Watch defense bonus**, the **Threshold** as a charge, and every **trait effect** are new.
6. **The inspector is a placeholder.** The Lantern Church proper is weeks 7–10.
7. **The cycle is compressed** to 90 seconds at 1×, against the doc's 10 minutes, so a test session covers 8–10 days.

### What the numbers say so far

From `npm run balance -- 20 40`, 40 seeds x 20 days per autopilot policy. The autopilot plays by crude rules, so these describe the rules, not good play.

| | Keep all | Cover all | Keep what the living bear |
|---|---|---|---|
| Keeps fallen by day 20 | 0% | 0% | 0% |
| Your dead | 6.6 | 10.3 | 6.6 |
| of which duty / old age / sickness | 3.6 / 3.0 / 0.1 | 7.5 / 2.7 / 0.2 | 3.7 / 2.9 / 0.1 |
| Raider bodies in your crypt | 2.0 | 5.6 | 2.1 |
| Inspector visits | 2.0 | 0 | 0.2 |
| Shades held at dawn | 3.3 | 0 | 2.7 |

- **Keeping pays.** Kept shades roughly halve raid deaths through the Watch bonus and warded gates. That is the "hire" half of the test showing up in the numbers.
- **Keeping is nearly free up to what the living can bear.** The design flaw: without fading, the keep/cover choice only bites at the margin, and covering is mostly a Dread valve. Fading, now in the night greybox, is the planned fix once the two halves are joined. Until then, raise `dread.perKeep` or `dread.livingPer` in Settings to test harsher numbers.
- **The Watch bonus may be too strong.** A dead Loyal guard gives about 75% of a living guard's defense and eats nothing.
- **Sickness and neglect deaths are rare for the autopilot**, which staffs the infirmary and the hearth immediately. A person will see more of them, which is what they're for.
- **Old age causes over 40% of your deaths** when shades are kept, so a fair share of the test rides on Serene shades.

## Not done

- No art, sound, save slots or offline service worker. Each greybox saves at dawn, to this browser only.
- The prototypes are separate: the weeks 1–2 night is still abstract, the night greybox has no day, and the pixel pass draws scenes rather than running either simulation.
- Checked with the tests, the soak runs and scripted click-throughs in Chromium at desktop and phone widths. Not tested on a real phone, in Safari, or with a screen reader; the night stage and the pixel test are pointer-only.
