# Afterglass prototypes

Playable slices of [Afterglass](../docs/brainstorm/round-3/README.md). Each tests one question from the plan and records the answer as you play. The first two are greyboxes in plain shapes and text; the pixel pass is the first art; the season slice joins all three.

| Page | Plan | Question |
|---|---|---|
| [`index.html`](index.html) | Weeks 1–2: two rosters and the Rite | Does a death feel like a loss and a hire at once? |
| [`night.html`](night.html) | Weeks 3–4: the night on its own | Is the night fun without the day? |
| [`pixel.html`](pixel.html) | Weeks 5–6: the pixel pass | Can players read the Tain on a phone? |
| [`season.html`](season.html) | Weeks 7–10: one season | Do people want to play a second season? |

All four are live on GitHub Pages at https://rcjlabs.github.io/Base-Manager/ (every push to `main` runs the tests and deploys).

## Run it

```sh
cd prototype
npm test                        # 74 tests: rules, replay, building, save and load, soak runs, the pixel quiz, the people sprites, the app's file list (Node 20+, no dependencies)
npm run serve                   # then open http://localhost:8080, /night.html, /pixel.html or /season.html (any static server works)
npm run bundle                  # dist/afterglass-greybox.html, -night, -pixel and -season.html: single files that open from disk
npm run balance -- 20 40        # weeks 1-2 autopilot report: 40 seeds x 20 days per policy
npm run balance:night -- 8 30   # weeks 3-4 autopilot report: 30 seeds x 8 nights per plan
npm run balance:season -- 100 1 # weeks 7-10 autopilot report: 100 seeds x 1 season per plan (try 200 2 for season 2)
npm run icons                   # redraws the season's app icons into icons/ (they're committed; only needed when the art changes)
```

The pages load ES modules, so they need a web server; GitHub Pages works as is. The bundles have no such limit. A bundle can't install as an app: it drops the manifest and never registers the service worker.

## Files

| File | Job |
|---|---|
| `src/data.js`, `src/night-data.js` | Content and every tuning number for each greybox |
| `src/sim.js`, `src/night.js` | Each game as one JSON state. `step()` / `stepNight()` is one fixed tick (10 a second); `act()` / `actNight()` is one player action. No DOM, no clock, no `Math.random` |
| `src/ui.js`, `src/night-ui.js` | Render the state and change it only through the act functions |
| `src/autopilot.js`, `src/night-autopilot.js` | Crude players for tests and balance runs |
| `src/px/` | The pixel pass: `kit.js` (palette and drawing primitives from the round-three mockups), `lut.js` (the palette lookup and dithered light), `scene.js` (geometry, cameras, the quiz), `draw.js` (the art) |
| `src/pixel-ui.js` | The pixel page: day, crossing, night and the readability test |
| `src/slice/` | The season slice: `data.js` (content and tuning), `geo.js` (the geometry of any keep the player builds: floors, stairs, light, routes and cameras), `sim.js` (the whole season as one state), `autopilot.js`, `draw.js` (the art, built on `src/px/`), `people.js` (the living and the dead as pixel figures), `book.js` (the Book of the Dead's pages) |
| `src/slice-ui.js` | The season page |
| `sw.js`, `season.webmanifest`, `icons/` | The installable season: the service worker that keeps it playable offline, the manifest, and the icons `tools/icons.mjs` draws |
| `test/` | 16 weeks 1–2 tests, 15 night tests, 8 pixel tests, 30 season tests, 3 for the people sprites and 2 for the installable app, including soak runs |
| `tools/` | Balance reports, the single-file bundler and the icon drawer |

Everything is seeded and every action is logged, so `replay()` (in `src/sim.js` and `src/slice/sim.js`) and `replayNight()` rebuild any session exactly, including one from a playtester's export.

## Weeks 7–10: one season

The vertical slice: seven days in one keep, ending on the night of the new moon, when the Hollow rises. The weeks 1–2 day, the weeks 3–4 night and the weeks 5–6 art run as one game, with raids that escalate, Maws that go for the line from night 3, and the Lantern Church's first inspection. The question is **do people want to play a second season?** The page asks it when the season ends (or the keep falls), with a box for why, and saves the answer in the playtest export. You can build the keep up a room at a time. It installs as an app and plays offline.

**Problems it has already shown.** From 100-seed autopilot runs, scripted runs in Chromium and my own reading of the rules. Nobody else has played it yet.

1. **The Maws contest the static line; they don't break it.** Two candles at the feet of the two stairs up to the Veil floor, each held by a good fighter, used to stop everything on nights 1–5. From night 3, one Maw a night now walks through the light to the candle barring the way to a mirror. Unless shades cut it down first, it tears the candle down, in about 6 seconds if the candle is fresh. The balanced autopilot answers by sending a second fighter. On each of nights 3–5 it still:
   - loses 0.5–0.7 candles to the Maw;
   - has 0.2–0.7 shades caught;
   - has 20–43 memory drained;
   - sees 0–0.2 crossings.

   So the line now costs something and needs a response, but it holds until night 6. Nights 1 and 2 have no Maws and are as static as before.

   **A doubled line beats the Maws outright.** The `double` plan posts two fighters on each stair on every Maw night and never moves them. It finishes 96 first seasons in 100, against 95 for the balanced plan (99 against 90 before building, whose grave-steel helps the balanced plan more). On nights 3–6 it has next to no shades caught, crossings or shades lost. Across a whole season it loses 0.2 shades at night, against 2.4. It pays with the night's work: about 0.1–0.7 essence a night instead of about 4, and no glass or wick. Within a season that cost barely shows. The two early season-2 losses I traced both started from a first season that ended with 3 living, too few to make candles. So the Maws punish a thin static line and lose to a thick one. The fix is a design change, not a number: the Maw has to threaten a crowd, or the rooms' work has to matter more.
2. **These Maws aren't round three's.** The design doc's Maws break twin rooms, which then haunt the day room above. They arrive from the second season, and wards and grave-steel counter them. Mine go for the candle holding the line and drain the shades beside them. They arrive on night 3 of the first season, and a ward on a stair holds them. I changed them to answer problem 1. The doc's room-breaking Maw is still unbuilt.
3. **Season 2 was too hard with the Maws; it's now eased, and the mourner pays for it most.** With the Maws in, the balanced autopilot finishes 90 first seasons in 100, down from 96. It loses 5 on night 6, 4 on night 7 and 1 on night 4. At ×1.35 it finished 35% of its second seasons, and the keeper plan 18%. Three changes, over 200 seeds:
   - raids, Creeper counts and the Hollow are now ×1.2 a season (`hardness`);
   - Maws have their own multiplier (`mawHardness`), set to 1, so they don't grow. A stronger Maw hurts a player who answers it more than one who stacks the line (problem 1), which is backwards;
   - the Veil starts each season whole. Before, 41 of 90 finished first seasons handed season 2 one to three open cracks, and nothing the player does mends them.

   Season 2 finished 68% for the balanced plan, 61% for the keeper and 46% for the mourner, each ±7. With building in play it's 63%, 60% and 57%. The mourner holds only a third of its day-6 raids, and loses most of its failed second seasons on nights 6 and 7. The target, harder than season 1 but not a coin flip, is my guess at "harder but fair", nothing more. Both multipliers and the Maws' numbers are in Settings.
4. **The Hollow usually gets through.** On the new moon it reaches the Veil and takes someone in 83 of the 95 finished seasons. Shades drive it back in 9, and it withdraws at dawn in 3. That's more than before building (69 of 90), I think because the autopilot's fighters are spread over a deeper Tain, but I haven't isolated it. Whether that's too soft or too hard for people is for the playtest.
5. **Dread rarely forces a choice in the first season.** A season kills about 4 of your people. The balanced plan is blessed at every inspection by covering shades before day 5. A plan that never covers anyone is censured in only 7 seasons of 100, and warned in 15. It bites in season 2, where that plan is censured 112 times in 177 second seasons. In season 1, keep or cover is still mostly a Dread valve.
6. **Shades are hard to find in the dark.** They're 6 by 12 pixel silhouettes (18 by 36 CSS pixels at 3×) with a faint glow, and the Unlit show only their eyes. In the default reflection camera they hang upside down, as the Tain does; the flipped camera shows them upright. Creeper red against Stranger green is still a colour-blindness risk; a gnawing Creeper's eyes turn orange.
7. **On a phone, the panels cover most of the castle.** Dusk and dawn open a sheet over about two-thirds of the screen. Close it to look, or play on a wider screen, where the panel is a drawer beside the castle.
8. **The guide, the crossing and the Book are untested with people.**
   - **The guide** is 12 cards of my text, each shown once, when its moment first comes. The first raid, the first night, the Church, the first Maw and the new moon pause the clock. Whether a newcomer can play from the cards alone is the question.
   - **The crossing** adds about 5 seconds to each dusk. A tap, space or Enter skips it, and reduced motion turns it off. A tap on the castle while it runs only skips it.
   - **The Book's pages** are sentence templates filled from the ledger, so their shapes will repeat within a few seasons.
9. **Installing has limits I can't test here.** I checked it in Chromium only: it's installable, every file is cached, and it plays with the server gone.
   - Safari on an iPhone has no install prompt, so the page says Share, then Add to Home Screen. I haven't checked whether iOS honours full screen.
   - Google Play, as a Trusted Web Activity, needs Digital Asset Links at `https://rcjlabs.github.io/.well-known/assetlinks.json`. That's the root of the domain, which a project site like this can't serve. Without it the app shows a URL bar. The fix is an `rcjlabs.github.io` repository or a custom domain.
   - The worker goes to the network first on every load, so a deploy shows at once. On a slow connection, though, the app waits for the network before it falls back to its copy.
10. **Building is a first pass.**
    - **The numbers are guesses:** 8 stone a room, three workers a room, 2 stone a day from each mason, and 4 to start. All four are in Settings.
    - **Room capacity changed the day.** One Barracks now holds only three guards. The autopilot builds a second on day 3, keeps a mason quarrying all season and never staffs the Forge by day. Its raids held fell from 72% to 58%, and its deaths rose from 3.8 to 4.2 a season. It finishes more seasons, though, 95 in 100 against 90, helped by grave-steel. A person may well do better; that's untested.
    - **Stair placement nearly made building a trap.** My first stairs for a built floor came up mid-room, where the candle lighting that room also lights the stair's top. Creepers then gnaw that candle from the floor below, where no shade in the light can reach them. Building one floor lost 18 of 30 first seasons by night 4. A built floor's stairs now come up by the walls, and the trap is gone. The rule underneath is old: a candle that lights any stair's top can be gnawed from below. Players can still walk into it with their own candles.
    - **Rooms go up in order:** into the top floor's bare hall, else as a new floor. There's no choosing a slot and no tearing a room down, and the keep tops out at 11 floors.

**How a season plays**

- **The screen.** The castle fills the window at the largest whole-pixel scale that fits: 3× on a 390-pixel phone, up to 6× on a desktop. By day it's the keep on its lake. From dusk to dawn it's the dark keep above the Veil with the Tain below it, the keep's reflection, where the night happens. The camera slides between the two.
  - **The HUD** on top shows the phase, the clock, play and speed, the stores, Dread and the Veil.
  - **The bar** at the bottom holds the tools for the moment (Candle, Move, Ward, Hush, Flip, or the phase's next step). It also opens three panels: this phase (Day, Crossing, Dusk, Night, Rite or Season), People, and Records. Panels are a sheet from the bottom on phones and a drawer on the right on wide screens. They open by themselves when a decision is waiting, at the crypt, the rite and the season's end.
  - **Zoom and pan.** Pinch or the mouse wheel zooms in whole-pixel steps toward your fingers or the pointer, from 1× to 10×. Dragging pans, and a tap still acts, since it's judged on release. The +, − and Fit buttons at the right edge do the same. Panning stays near the castle and resets when day turns to night.
  - **Keys:** space, 1, 2 and 4 for time; C, M, W, H and V for the tools; + and − to zoom, 0 to fit, arrows to pan; K, P and R for the panels; L for room names; Esc to close.
- **People** are 6 by 12 pixels (10 for the young, 11 and stooped for the old). They're dressed by their job: the guard in a helm and crimson tabard with a spear, the priest in a hood and robe, the cook in a cap and apron, the healer marked with a red cross. Hair, beard and skin come from each name. By day each works a station in their room and now and then walks a few steps. The shades are the same bodies as dark silhouettes with glowing eyes; their feet thin into a wisp, and the Loyal wear a helm, the Serene a hood and Strangers horns.
- **Day** (60 s at 1×). Eight living work six rooms. The Chandlery makes the night's candles, and thanks to the Granary, raiders who break in take only half as much food. Raids come on days 2, 4 and 6 at strength about 4, 7 and 11 (±1.5). War banners go up over the turrets when one is on the road. Sickness, old age and an empty larder kill as before, and a newcomer arrives every second day. Jobs are in People; pick a name there, then tap a room on the castle, or use the job list.
- **Building** (by day). Masons in the Yard quarry 2 stone a day each; they work on the roof. The Build list (the bar's Build button, or B) shows what 8 stone raises and where it goes. A room goes into the top floor's bare hall, or starts a new floor on top with a bare hall beside it. Each room holds three workers, so a second Barracks lets more guards stand. You can build more of any original room but the Crypt, and two new ones:
  - **the Forge.** Its smiths add 1 defense each. Its twin, the Cold Forge, makes grave-steel: a shade who forges through half the night makes every shade fight 25% harder the next night.
  - **the Cellar.** It keeps half the candles and glass from raiders who break in. Its twin, the Hollow Cellar, is a dark weak spot.

  By night, whatever was built last is the Tain's deepest room, beside the rifts, and the Creepers' climb is a floor longer. The camera fits the taller keep, down to 3× on a desktop; on a phone it stays at 3× and you pan up.
- **Dusk** (paused). The crossing:
  1. The sun sets over the keep and its lights go out.
  2. At the crypt you choose funerals, then wake the dead. Their souls sink through the Veil into the Waking Room of the Tain, or rise away for a funeral.
  3. The camera follows them down.
  4. You set candles, post shades on the Tain (reflected or flipped upright) and begin. The Dusk panel lists when tonight's tides are due.
- **Night** (120 s at 1×). The weeks 3–4 engine on this keep's Tain: 4 floors of twin rooms, 2 stairs between each pair of floors, 2 rifts in the deepest floor, 2 mirrors under the Veil. Every twin room has its job for a lit shade at its post:
  - the Choir sings essence, and a shade that sings through half the night calms one Restless shade;
  - the Silvering makes glass;
  - the Wick Room saves candles for the next dusk;
  - the Threshold readies guidance, so the next sickness or neglect death wakes one kind better;
  - the Watch adds to tomorrow's defense;
  - the Cold Hearth halves fading.

  Wraiths rise in the Waking Room and hunt; cutting one down banishes it for good. **Maws** come from night 3, one a night with a tide, but none on the new moon. A Maw:
  - walks through light, straight for the candle barring the way to a mirror;
  - tears that candle down, draining any shade beside it;
  - has 6 strength, so two shades fighting it cut it down fast and one Loyal shade can just about hold it;
  - is held below by a ward on a stair.
- **Dawn: the Rite** (paused). Keep or cover, release or bind, banish or leave, as in weeks 1–2. Fading happens, and names and remembrance can be bought, as in weeks 3–4. Each Veil crack from the night adds 1 Dread.
- **Day 5: the Lantern Church.** It is announced the dawn before, and it comes again the same day whenever Dread reaches 5. The inspector judges Dread at noon:

  | Dread | Verdict |
  |---|---|
  | 0–1 | Blessed: +3 candles and +2 remembrance |
  | 2–3 | Warned: a tithe (5 essence, else 5 remembrance, else 3 candles) and Dread −1 |
  | 4–5 | Censured: the fullest mirror is covered and carried off with its shades, and Dread drops to 2 |

  Vigils by day lower Dread at once.
- **Night 7: the new moon.** It brings fewer Creepers, no Maw, and the Hollow, which:
  - walks toward the nearest mirror whatever the light;
  - eats candles near it and drains shades beside it;
  - is held by a ward on a stair for 20 seconds, then breaks it;
  - can only be driven back by shades fighting it (+3 remembrance);
  - if it reaches the Veil, cracks it and takes one of the living, leaving no body to wake.
- **The end.** A season summary, the question, and **Begin season 2**. The keep carries its living, shades, stores, mirrors and Dread into the next season, and the Veil starts whole. Raids, Creepers and the Hollow are ×1.2 stronger each season; Maws stay as they were.
- **Records.** The Book of the Dead has a page for everyone who has died in this keep, grouped by season. A page tells who they were, how they died and what they woke as, the nights they served and where, what they cut down, and how it ended. Records also holds the log, each day's numbers, the playtest export and Settings. Numbers you haven't set in Settings follow the current version: a save from an older one takes the new defaults when it loads, and says so. Starting a new keep keeps only the numbers you set.
- **The guide.** The intro offers to begin with a guide or without. With it, a card above the bar explains each thing the first time it happens, and pulses the button or the spots on the Tain it means. Settings turns it off, or on again from the start.
- **Installing.** In Chrome, Edge and Samsung Internet, an Install button appears in the intro and in Settings; on an iPhone or iPad, use Share, then Add to Home Screen. Installed, it runs full screen from the home screen and plays offline after its first load: `sw.js` keeps a copy of every file it needs, and of the fonts. Only the season installs.

**Where this goes beyond the design doc.** These are my calls; test them rather than trust them.

1. **The Hollow's rules** are all mine. The round-three plan says only that the season ends in the Hollow.
2. **The Church's timing and verdicts** are mine; the doc set only "the Church's first inspection".
3. **The last keeper's dead.** The season opens with two shades already in the glass: Garrick, a Loyal guard and Osk's father, and Hesper, Serene and named. Without them, night 1 was lost every time, because nobody held the light.
4. **Tides.** Most Creepers come in waves, with one more wave every third night, instead of evenly through the night.
5. **Veil cracks heal one a dawn**, and each crack costs 1 Dread. Five open at once lose the keep, and a new season starts with none.
6. **The cycle is compressed:** a season is 21 minutes at 1× plus the paused phases, against the doc's much longer days.
7. **The Maws** go against the doc (problem 2).
8. **The Book of the Dead, the guide and installing** come from the round-four brainstorm, not the design doc. The crossing follows the pixel pass's, cut from about 10 seconds to about 5 and made skippable.
9. **Building's rules are mine.** The doc says only "carve rooms into the keep's cross-section; every room you build has a twin in the Tain", and lists stone among the day's resources. These are my choices:
   - stone and masons as the cost;
   - three workers a room;
   - rooms going on top only;
   - the Forge's defense and grave-steel as numbers (the doc's Cold Forge makes grave-steel "that harms the Unlit");
   - what the Cellar keeps.

   The doc's Library, Quarters, Hall and Gatehouse aren't built.

**What the numbers say so far.** From `npm run balance:season -- 100 1`. Every plan but Idle holds the stairs to the Veil, relights candles and builds: a second Barracks, then a Forge (posting a shade at the Cold Forge by night), then a Cellar. All but Double send help against a Maw. The first three differ in how they treat the dead; Double treats them like Balanced.

| | Balanced | Keeper (never covers) | Mourner (every funeral, covers to keep Dread at 1) | Double (two fighters per stair on Maw nights, never moves them) | Idle (no candles, no posts) |
|---|---|---|---|---|---|
| Seasons finished | 95% | 92% | 88% | 96% | 0% |
| Lost on night 4 / 5 / 6 / 7 | 0 / 0 / 4 / 1 | 0 / 1 / 5 / 2 | 0 / 0 / 3 / 9 | 0 / 0 / 0 / 4 | all on night 1 |
| Your deaths per season | 4.2 | 4.2 | 4.7 | 4.6 | – |
| Raids held | 58% | 57% | 47% | 54% | – |
| Church: blessed / warned / censured | 100 / 0 / 0 | 80 / 15 / 7 | 100 / 0 / 0 | 100 / 0 / 0 | – |
| Shades lost at night per season | 2.4 | 2.8 | 2.0 | 0.2 | – |
| The Hollow, in finished seasons: reached the Veil / driven back / withdrew | 83 / 9 / 3 | 84 / 6 / 2 | 84 / 4 / 0 | 82 / 14 / 0 | – |

- **Per night** (balanced): nights 1 and 2 see no crossings and no shades caught, and nights 3–5 are as in problem 1. Night 6, after the strongest raid, is the hardest: it averages 2.7 shades caught, 1.9 lost and 1.1 crossings. Night 7 averages 1.1 crossings, the Hollow's included.
- **Mourning costs the most.** The mourner loses 9 seasons on night 7 and 3 on night 6, holds the fewest raids (47%) and loses the most of its living (4.7 a season). My guess, untested: fewer shades means fewer to fight the Hollow and less of the Watch's defense by day.
- **Raids held fell twice:** from 80% to 72% when the Maws came in, and to 58% with building (problem 10). The first drop is likely the Watch losing shades pulled off to fight Maws; the second is the capacity and the mason. Neither is isolated.
- **Season 2** (`-- 200 2`): the balanced plan finishes 116 of the 183 second seasons it reaches (63%), the keeper 107 of 177 (60%), the mourner 94 of 166 (57%) and Double 133 of 192 (69%). Most failed second seasons are lost on nights 5 to 7.

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

- No sound or save slots. Each prototype saves to this browser only. Only the season installs and plays offline.
- The earlier prototypes stay as they were: the weeks 1–2 night is abstract, the night greybox has no day, and the pixel pass draws generated scenes. The season slice is the only one that runs day and night together.
- Not in the season: traits, Weepers, the Drowned, the design doc's room-breaking Maws, and the Library, Quarters, Hall and Gatehouse. Rooms can't be torn down or placed in a slot of your choosing.
- Checked with the tests, the soak runs and scripted click-throughs in Chromium at desktop and phone widths, including the bundled season file, the guide, the installed app with its server gone, and saves from the previous version. Not tested on a real phone, in Safari, or with a screen reader. The night stages and the pixel test are pointer-only. The season's pinch zoom was tested with synthetic touch events, not real fingers, and the Install button with a synthetic install prompt.
